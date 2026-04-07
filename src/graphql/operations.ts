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

/** 当前帐户是否已提交过本类型问卷（每人仅允许一次） */
export const MY_LEAD_2026_EXISTS = gql`
  query MyLead2026Exists($accountId: bigint!) {
    ud_wenjuanshouji_2026yinliu_cb3e5d(
      where: {
        _and: [
          { ud_zhanghu_id_21fc49: { _eq: $accountId } }
          { ud_wenjuanleixing_6fd452: { _eq: "${WENJUAN_TYPE_ROUTINE}" } }
        ]
      }
      limit: 1
    ) {
      id
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
 * 登录后：以 fz_payment_record（当前 account、SUCCESSFUL）判定已付费。
 * 订单表用户库外键为空，无法按帐户关联「已支付」订单行，故不再查 ud_dingdan_b6a218。
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
