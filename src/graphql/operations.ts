import { gql } from '@apollo/client';

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
  query MeAccount {
    account(limit: 1) {
      id
      username
    }
  }
`;

/** 用户库 1:1 帐户，用于判断管理端身份 */
export const USER_PROFILE_BY_ACCOUNT = gql`
  query UserProfileByAccount($accountId: bigint!) {
    ud_yonghuxinxi_89e7ab(
      where: { ud_zhanghuid_zhanghu_73be86: { _eq: $accountId } }
      limit: 1
    ) {
      id
      identity
      name
      ud_phone_one_dbcfc6
    }
  }
`;

export const LIST_LEADS_2026_YINLIU = gql`
  query ListLeads2026Yinliu(
    $limit: Int!
    $offset: Int!
    $inviterYonghukuId: bigint!
  ) {
    ud_wenjuanshouji_2026yinliu_cb3e5d(
      where: { ud_yaoqingren_id_50935a: { _eq: $inviterYonghukuId } }
      order_by: [{ created_at: desc }]
      limit: $limit
      offset: $offset
    ) {
      id
      created_at
      ud_shoujineirong_3bc0b9
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
