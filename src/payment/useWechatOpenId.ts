/**
 * 微信内静默获取公众号 openId。
 *
 * 背景：Zion 的 `account.oauth2_user_info_map` 对「已登录用户」角色没有读权限，
 * 前端拿不到 openId，而 JSAPI 下单必须有 openId。因此改为在微信内再静默走一次
 * 公众号 OAuth（snsapi_base，不弹授权页），由 pay-service 用 AppSecret 把 code
 * 换成 openId，存到 localStorage 复用。
 *
 * 仅在启用自建支付通道（VITE_PAY_SERVICE_URL）且微信内打开时才触发。
 */

import { useLayoutEffect, useState } from 'react';
import { isSelfPayEnabled, serviceBaseUrl } from './selfPay';
import { isWeixinBrowser } from './weixinBrowser';

const OPENID_STORAGE_KEY = 'tqwj_wx_open_id';
/** 与 Zion 登录用的 state 区分，避免两边抢用同一个 code */
const OAUTH_STATE = 'payopenid';
const ATTEMPTED_KEY = 'tqwj_wx_open_id_attempted';

/** 收款公众号 AppID（与 Zion 微信授权、pay-service 的 WECHAT_APP_ID 一致） */
const WECHAT_OAUTH_APP_ID = 'wx6e046fecc7bfb0d5';

export function getStoredWechatOpenId(): string | null {
  try {
    const v =
      window.localStorage.getItem(OPENID_STORAGE_KEY) ??
      window.sessionStorage.getItem(OPENID_STORAGE_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

function storeWechatOpenId(openId: string): void {
  try {
    window.localStorage.setItem(OPENID_STORAGE_KEY, openId);
  } catch {
    /* ignore */
  }
}

/** openId 就绪事件：App 里完成换取后广播，让后渲染的支付卡片拿到值 */
const OPENID_READY_EVENT = 'tqwj:wechat-openid-ready';
/** 换取进行中的标记（避免渲染晚于 App 的组件又发起一次跳转） */
let inFlight = false;

export function hasInFlightOpenIdExchange(): boolean {
  return inFlight;
}

function notifyOpenIdReady(openId: string): void {
  try {
    window.dispatchEvent(new CustomEvent<string>(OPENID_READY_EVENT, { detail: openId }));
  } catch {
    /* ignore */
  }
}

async function exchangeCodeForOpenId(code: string): Promise<string | null> {
  const base = serviceBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/api/oauth/openid?code=${encodeURIComponent(code)}`
    );
    const json = (await res.json()) as { ok?: boolean; openId?: string; error?: string };
    return json.openId?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 在 App 的登录逻辑之前调用：如果本次回跳是用来换 openId 的，
 * 立刻擦掉 URL 上的 code 并换取，返回 true 表示「这个 code 已被消费，别再拿去登录」。
 */
export function consumePayOpenIdCallback(): boolean {
  const sp = new URLSearchParams(window.location.search);
  const code = sp.get('code')?.trim();
  const state = sp.get('state')?.trim();
  if (!code || state !== OAUTH_STATE) return false;

  sp.delete('code');
  sp.delete('state');
  const q = sp.toString();
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`
  );

  inFlight = true;
  void (async () => {
    const got = await exchangeCodeForOpenId(code);
    inFlight = false;
    if (got) {
      storeWechatOpenId(got);
      notifyOpenIdReady(got);
    }
  })();
  return true;
}

function buildSilentOAuthUrl(redirectUri: string): string {
  return (
    'https://open.weixin.qq.com/connect/oauth2/authorize' +
    `?appid=${WECHAT_OAUTH_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=snsapi_base&state=${OAUTH_STATE}` +
    '#wechat_redirect'
  );
}

/**
 * 返回可用的公众号 openId（没有时返回 null）。
 * 需要时会先把浏览器跳转到微信 OAuth，回跳后自动换取并缓存。
 */
export function useWechatOpenId(): string | null {
  const [openId, setOpenId] = useState<string | null>(() => getStoredWechatOpenId());

  useLayoutEffect(() => {
    if (openId) return;
    if (!isSelfPayEnabled() || !isWeixinBrowser()) return;

    // App 里已经接管 code 并正在换取：等它的广播即可，别再跳转
    if (hasInFlightOpenIdExchange()) {
      const onReady = (e: Event): void => {
        const v = (e as CustomEvent<string>).detail;
        if (v) setOpenId(v);
      };
      window.addEventListener(OPENID_READY_EVENT, onReady);
      return () => window.removeEventListener(OPENID_READY_EVENT, onReady);
    }

    // 可能换取已完成但本组件是后挂载的
    const stored = getStoredWechatOpenId();
    if (stored) {
      setOpenId(stored);
      return;
    }

    // 只尝试一次，失败也不再跳转，避免死循环
    try {
      if (window.sessionStorage.getItem(ATTEMPTED_KEY) === '1') return;
      window.sessionStorage.setItem(ATTEMPTED_KEY, '1');
    } catch {
      /* ignore */
    }
    const redirectUri = window.location.href.split('#')[0];
    window.location.assign(buildSilentOAuthUrl(redirectUri));
  }, [openId]);

  return openId;
}
