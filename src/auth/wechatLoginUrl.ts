import {
  appendWechatOAuthStateForInviter,
  getInviterYonghukuId,
} from './inviterRef';
import { FALLBACK_WECHAT_OAUTH_URL_TEMPLATE } from '../constants/wechatOAuth';

/**
 * 用指定授权页模板（公众号 oauth2 或开放平台 qrconnect）拼出完整登录 URL。
 * `base` 须含 `{REDIRECT}` 或由调用方用 append 分支处理。
 */
export function buildWechatOAuthRedirectUrl(base: string): string {
  const pathAndQuery = `${window.location.pathname}${window.location.search}`;
  const back = encodeURIComponent(
    `${window.location.origin}${pathAndQuery}`
  );

  const refFromQs = new URLSearchParams(window.location.search)
    .get('ref')
    ?.trim();
  const inviterRef =
    refFromQs && /^\d+$/.test(refFromQs)
      ? refFromQs
      : getInviterYonghukuId();

  let url: string;
  if (base.includes('{REDIRECT}')) {
    url = base.replace(/\{REDIRECT\}/g, back);
  } else {
    const sep = base.includes('?') ? '&' : '?';
    url = `${base}${sep}redirect_uri=${back}`;
  }
  return appendWechatOAuthStateForInviter(url, inviterRef);
}

/** 微信内使用：VITE_ZION_WECHAT_OAUTH_URL 或兜底（公众号 oauth2） */
export function buildWechatOAuthUrlForWeixinBrowser(): string {
  const base =
    import.meta.env.VITE_ZION_WECHAT_OAUTH_URL?.trim() ||
    FALLBACK_WECHAT_OAUTH_URL_TEMPLATE;
  return buildWechatOAuthRedirectUrl(base);
}
