/**
 * 未设置 VITE_ZION_WECHAT_OAUTH_URL 时的兜底：须为公众号 AppID（oauth2/authorize），勿用开放平台 AppID。
 * 天启无书：与 .env 一致；其它项目请改此处或在环境变量中覆盖整段 URL。
 */
export const FALLBACK_WECHAT_OAUTH_URL_TEMPLATE =
  'https://open.weixin.qq.com/connect/oauth2/authorize?appid=wx6e046fecc7bfb0d5&redirect_uri={REDIRECT}&response_type=code&scope=snsapi_userinfo#wechat_redirect';
