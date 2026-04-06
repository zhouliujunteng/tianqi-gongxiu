/**
 * 微信开放平台「网站应用」扫码登录授权页模板（与 .env 示例一致）。
 * 当未设置 VITE_ZION_WECHAT_OAUTH_URL 时使用，保证登录按钮仍可显示；
 * 将 appid 换为真实值并写入 .env（或部署平台环境变量）后重新构建，授权才会成功。
 */
export const FALLBACK_WECHAT_OAUTH_URL_TEMPLATE =
  'https://open.weixin.qq.com/connect/qrconnect?appid=wxYOUR_OPEN_PLATFORM_APPID&redirect_uri={REDIRECT}&response_type=code&scope=snsapi_login#wechat_redirect';
