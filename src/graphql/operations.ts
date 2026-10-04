import { gql } from '@apollo/client';
import { WENJUAN_TYPE_ROUTINE } from '../constants/lead2026';

/**
 * Zion MCP schema（bZ7yl9DZ4YY）
 * - 问卷：ud_wenjuanshouji_2026yinliu_cb3e5d → 帐户 account（ud_zhanghu_id_21fc49）
 * - 品牌 logo：ud_quanjuwendang_d0da48（全局文档），类型 ud_leixing_95f511 = 天启无书单独logo
 */
export const BRAND_LOGO_FROM_GLOBAL_DOC = gql`
  query BrandLogoFromGlobalDoc($type: String!) {
    ud_quanjuwendang_d0da48(
      where: { ud_leixing_95f511: { _eq: $type } }
      limit: 1
    ) {
      id
      ud_tupian_3212f2 {
        id
        url(acl: PUBLIC_READ)
      }
    }
  }
`;

export const ME_ACCOUNT = gql`
  query MeAccount($accountId: bigint!) {
    account(where: { id: { _eq: $accountId } }, limit: 1) {
      id
      username
    }
  }
`;

/**
 * 共修营报名：按「用户的小程序ID（六位数）」查用户库身份字段。
 * 表字段与列名以 Zion Schema 为准（按当前项目实际 Query 根字段 `ud_yonghuxinxi_89e7ab`）。
 */
export const GET_MINIPROGRAM_USER_IDENTITY = gql`
  query GetMiniProgramUserIdentity($miniProgramId: String!) {
    ud_yonghuxinxi_89e7ab(
      where: { ud_id002fchaxun_fb7c4b: { _eq: $miniProgramId } }
      limit: 1
    ) {
      id
      identity
      ud_id002fchaxun_fb7c4b
    }
  }
`;

export const GET_CAMP_ID_MATCHES = gql`
  query GetCampIdMatches($campUserId: String!) {
    ud_yonghuxinxi_89e7ab(
      where: { ud_id002fchaxun_fb7c4b: { _eq: $campUserId } }
      limit: 1
    ) {
      id
      identity
      ud_id002fchaxun_fb7c4b
    }
    ud_gongzhonghaoxueyuanbaimingdan_9a7b8b(
      where: { ud_id_4c38d0: { _eq: $campUserId } }
      limit: 1
    ) {
      id
      ud_id_4c38d0
    }
  }
`;

export const GET_CAMP_SERVICE_QR = gql`
  query GetCampServiceQr($type: String!) {
    ud_quanjuwendang_d0da48(
      where: { ud_leixing_95f511: { _eq: $type } }
      order_by: [{ updated_at: desc }]
      limit: 1
    ) {
      id
      updated_at
      ud_tupian_3212f2 {
        id
        url(acl: PUBLIC_READ)
      }
    }
  }
`;

export const GET_CAMP_GLOBAL_DOC_IMAGES = gql`
  query GetCampGlobalDocImages($types: [String!]!) {
    ud_quanjuwendang_d0da48(
      where: { ud_leixing_95f511: { _in: $types } }
      order_by: [{ updated_at: desc }]
      limit: 20
    ) {
      id
      updated_at
      ud_leixing_95f511
      ud_tupian_3212f2 {
        id
        url(acl: PUBLIC_READ)
      }
    }
  }
`;

export const MY_CAMP_ENROLLMENT_STATUS = gql`
  query MyCampEnrollmentStatus(
    $accountId: bigint!
    $todayStart: timestamptz!
    $todayEnd: timestamptz!
  ) {
    fz_payment_record(
      where: {
        _and: [
          { account_id: { _eq: $accountId } }
          { status: { _eq: "SUCCESSFUL" } }
          { order_id: { _is_null: false } }
        ]
      }
      order_by: [{ created_at: desc }]
      limit: 5
    ) {
      id
      order_id
      created_at
      description
      status
      order {
        id
        ud_dingdanleixing_3fb8b8
        ud_dingdanbeizhu_439d3a
        ud_gongzhonghaoid_665d9b
        ud_gongxiuyingweixin_62acc6
        ud_tianjiazhuangtai_a1779b
        ud_gongxiuyingdaqiajilu_fd4f79(
          where: {
            created_at: { _gte: $todayStart, _lt: $todayEnd }
          }
          order_by: [{ created_at: desc }]
          limit: 1
        ) {
          id
          created_at
          ud_daqiatupian_764935 {
            id
            url(acl: PUBLIC_READ)
          }
        }
        ud_gongxiuyingdaqiajilu_fd4f79_aggregate {
          aggregate {
            count
          }
        }
      }
    }
  }
`;

export const CAMP_ADMIN_PAID_USERS = gql`
  query CampAdminPaidUsers {
    fz_payment_record(
      where: {
        _and: [
          { status: { _eq: "SUCCESSFUL" } }
          { order_id: { _is_null: false } }
        ]
      }
      order_by: [{ created_at: desc }]
      limit: 500
    ) {
      id
      account_id
      created_at
      order_id
      order {
        id
        ud_dingdanleixing_3fb8b8
        ud_dingdanbeizhu_439d3a
        ud_yonghuxinxi_yonghuku_55773d
        ud_gongzhonghaoid_665d9b
        ud_gongxiuyingweixin_62acc6
        ud_tianjiazhuangtai_a1779b
        ud_dingdanjine_a50087
        ud_dingdanjine0028zhengshu0029_1070ec
        ud_gongxiuyingdaqiajilu_fd4f79_aggregate {
          aggregate {
            count
          }
        }
        ud_gongxiuyingdaqiajilu_fd4f79(
          order_by: [{ created_at: desc }]
          limit: 1
        ) {
          id
          created_at
          ud_daqiatupian_764935 {
            id
            url(acl: PUBLIC_READ)
          }
        }
      }
    }
  }
`;

export const PATCH_CAMP_ORDER_WECHAT_CONTACT = gql`
  mutation PatchCampOrderWechatContact(
    $orderId: bigint!
    $weixin: String!
    $friendStatus: String!
  ) {
    update_ud_dingdan_b6a218_by_pk(
      pk_columns: { id: $orderId }
      _set: {
        ud_gongxiuyingweixin_62acc6: $weixin
        ud_tianjiazhuangtai_a1779b: $friendStatus
      }
    ) {
      id
      ud_gongxiuyingweixin_62acc6
      ud_tianjiazhuangtai_a1779b
    }
  }
`;

export const PATCH_CAMP_ORDER_USER_LIBRARY_ID = gql`
  mutation PatchCampOrderUserLibraryId(
    $orderId: bigint!
    $userLibraryId: bigint!
  ) {
    update_ud_dingdan_b6a218_by_pk(
      pk_columns: { id: $orderId }
      _set: { ud_yonghuxinxi_yonghuku_55773d: $userLibraryId }
    ) {
      id
      ud_yonghuxinxi_yonghuku_55773d
    }
  }
`;

export const CAMP_ADMIN_USER_LIBRARY_IDS = gql`
  query CampAdminUserLibraryIds($userLibraryIds: [bigint!]!) {
    ud_yonghuxinxi_89e7ab(where: { id: { _in: $userLibraryIds } }, limit: 500) {
      id
      ud_id002fchaxun_fb7c4b
    }
  }
`;

export const INSERT_LEAD_2026 = gql`
  mutation InsertLead2026Yinliu(
    $object: ud_wenjuanshouji_2026yinliu_cb3e5d_insert_input!
  ) {
    insert_ud_wenjuanshouji_2026yinliu_cb3e5d_one(object: $object) {
      id
      created_at
    }
  }
`;

export const UPDATE_LEAD_2026 = gql`
  mutation UpdateLead2026Yinliu(
    $id: bigint!
    $set: ud_wenjuanshouji_2026yinliu_cb3e5d_set_input!
  ) {
    update_ud_wenjuanshouji_2026yinliu_cb3e5d_by_pk(
      pk_columns: { id: $id }
      _set: $set
    ) {
      id
      updated_at
    }
  }
`;

/** 当前帐户当前问卷（每用户仅 1 份；用于查看/修改） */
export const MY_LEAD_2026_LIST = gql`
  query MyLead2026List($accountId: bigint!) {
    ud_wenjuanshouji_2026yinliu_cb3e5d(
      where: {
        _and: [
          { ud_zhanghu_id_21fc49: { _eq: $accountId } }
          { ud_wenjuanleixing_6fd452: { _eq: "${WENJUAN_TYPE_ROUTINE}" } }
        ]
      }
      order_by: [{ created_at: desc }]
      limit: 1
    ) {
      id
      created_at
      ud_shoujineirong_3bc0b9
      ud_chubufangan_094122
    }
  }
`;

/**
 * 微信 H5 / 网站应用授权回跳 ?code= 后调用。
 * 此为 Zion 与微信的对接 mutation：前端只把微信临时 code 交给 Zion，由 Zion 服务端完成与微信的换票、建户；
 * 返回的是 Zion 业务 JWT，不是微信的 sns access_token（无需也不应在浏览器处理微信 secret）。
 */
export const LOGIN_WITH_WECHAT = gql`
  mutation LoginWithWechat($code: String!, $createIfNotExists: Boolean!) {
    loginWithWechat(code: $code, createIfNotExists: $createIfNotExists) {
      account {
        id
        username
      }
      jwt {
        token
      }
    }
  }
`;

/**
 * 问卷引流：直接向订单表插入一行（未支付），返回 id 供 createWechatPayment(orderId) 使用。
 * 安全加固见 zion-development-best-practices（敏感场景可用 Actionflow）；当前为 GraphQL insert。
 */
export const INSERT_WENJUAN_2026_DINGDAN = gql`
  mutation InsertWenjuan2026Dingdan($object: ud_dingdan_b6a218_insert_input!) {
    insert_ud_dingdan_b6a218_one(object: $object) {
      id
      ud_yonghuxinxi_yonghuku_55773d
      ud_gongzhonghaoid_665d9b
      ud_gongxiuyingweixin_62acc6
      ud_tianjiazhuangtai_a1779b
    }
  }
`;

/** insert 后可选：强制再写金额列，避免 Decimal 首写未落库导致 createWechatPayment 读不到 total_fee */
export const PATCH_WENJUAN_2026_DINGDAN_AMOUNTS = gql`
  mutation PatchWenjuan2026DingdanAmounts(
    $id: bigint!
    $set: ud_dingdan_b6a218_set_input!
  ) {
    update_ud_dingdan_b6a218_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
    }
  }
`;

/**
 * 与小程序一致：用同步行为流在「支付设置绑定的订单表」建单；返回 Json 整段，勿对 fz_invoke_action_flow 做子选择。
 */
export const INVOKE_WENJUAN_ORDER_CREATE_FLOW = gql`
  mutation InvokeWenjuanOrderCreateFlow(
    $actionFlowId: String!
    $versionId: Int!
    $args: Json!
  ) {
    fz_invoke_action_flow(
      actionFlowId: $actionFlowId
      versionId: $versionId
      args: $args
    )
  }
`;

/**
 * Zion 微信支付：createWechatPayment 的 type 须为项目 GraphQL 枚举 PaymentType 已有值（本仓库默认微信内 WECHATPAY_MINIPROGRAM、外置手机浏览器 WECHATPAY_MOBILE_WEB）。
 * amount 为 BigDecimal：多为「元」number 或 "29.90" 字符串；分见 AS_FEN；须带 Bearer token（Apollo authLink）。
 * 支付成功后须延迟再查 fz_payment_record / 订单状态（webhook 异步），见 zion-payment.mdc、wechat-miniprogram-payment.mdc。
 */

/**
 * 登录后：查 Zion 内置支付表 fz_payment_record（控制台「支付」），服务端先按 account_id 过滤；
 * 前端再基于 status/type 做兼容判断（不同项目的 type 文本可能存在差异）。
 */
export const WENJUAN_PAY_ELIGIBILITY = gql`
  query WenjuanPayEligibility($accountId: bigint!) {
    fz_payment_record(
      where: { account_id: { _eq: $accountId } }
      order_by: [{ created_at: desc }]
      limit: 40
    ) {
      id
      status
      type
      description
    }
  }
`;

/** 按报名用户库 ID 查询既往二阶课程的成功支付记录（不限金额），用于本期往期已缴费学员免缴费。 */
export const ADVANCED_CAMP_PREVIOUS_PAID_BY_USER_LIBRARY = gql`
  query AdvancedCampPreviousPaidByUserLibrary(
    $userLibraryId: bigint!
    $publicAccountId: String!
  ) {
    fz_payment_record(
      where: {
        _and: [
          { status: { _eq: "SUCCESSFUL" } }
          {
            order: {
              ud_dingdanleixing_3fb8b8: { _eq: "2026二阶共修营" }
              _or: [
                { ud_yonghuxinxi_yonghuku_55773d: { _eq: $userLibraryId } }
                { ud_gongzhonghaoid_665d9b: { _eq: $publicAccountId } }
              ]
            }
          }
        ]
      }
      order_by: [{ created_at: desc }]
      limit: 20
    ) {
      id
      status
      description
      order {
        id
        ud_dingdanbeizhu_439d3a
        ud_dingdanjine_a50087
        ud_dingdanjine0028zhengshu0029_1070ec
      }
    }
  }
`;

export const CREATE_WECHAT_PAYMENT = gql`
  mutation CreateWechatPayment(
    $orderId: Long!
    $amount: BigDecimal!
    $description: String!
    $type: PaymentType!
  ) {
    createWechatPayment(
      orderId: $orderId
      amount: $amount
      description: $description
      type: $type
    ) {
      message
      status
    }
  }
`;

export const GET_IMAGE_UPLOAD_URL = gql`
  mutation GetImageUploadUrl(
    $md5: String!
    $suffix: MediaFormat!
    $acl: CannedAccessControlList
  ) {
    imagePresignedUrl(imgMd5Base64: $md5, imageSuffix: $suffix, acl: $acl) {
      imageId
      uploadUrl
      uploadHeaders
    }
  }
`;

export const INSERT_CAMP_CHECKIN = gql`
  mutation InsertCampCheckin(
    $object: ud_gongxiuyingdaqiajilu_5ba46e_insert_input!
  ) {
    insert_ud_gongxiuyingdaqiajilu_5ba46e_one(object: $object) {
      id
      created_at
      ud_baomingzhifudingdan_id_36dd84
      ud_daqiatupian_764935 {
        id
        url(acl: PUBLIC_READ)
      }
    }
  }
`;
