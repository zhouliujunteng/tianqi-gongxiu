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
/**
 * 防重试标记。
 *
 * 重要：必须存在 localStorage（不能只用 sessionStorage）——微信内 OAuth 回跳后
 * sessionStorage 可能丢失，导致每次回来都以为「还没尝试过」而再次跳转，
 * 表现为页面无限刷新、家长填不了 ID。
 * 记录时间戳，有效期内不再跳转；过期后允许再试一次。
 */
const ATTEMPTED_KEY = 'tqwj_wx_open_id_attempted';
const ATTEMPTED_AT_KEY = 'tqwj_wx_open_id_attempted_at';
/** 同一次尝试的有效期（毫秒）：期间不再发起静默跳转 */
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

function hasAttemptedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(ATTEMPTED_AT_KEY) ?? '0');
    if (at && Date.now() - at < ATTEMPT_TTL_MS) return true;
    // 兼容旧版本只写了 sessionStorage 的情况
    return window.sessionStorage.getItem(ATTEMPTED_KEY) === '1';
  } catch {
    return false;
  }
}

function markAttempted(): void {
  try {
    window.localStorage.setItem(ATTEMPTED_KEY, '1');
    window.localStorage.setItem(ATTEMPTED_AT_KEY, String(Date.now()));
    window.sessionStorage.setItem(ATTEMPTED_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** 换取成功后清掉标记，下次需要时可以重新走一次 */
function clearAttempted(): void {
  try {
    window.localStorage.removeItem(ATTEMPTED_KEY);
    window.localStorage.removeItem(ATTEMPTED_AT_KEY);
    window.sessionStorage.removeItem(ATTEMPTED_KEY);
  } catch {
    /* ignore */
  }
}

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
      clearAttempted();
      removeAttemptMarkerFromUrl();
      notifyOpenIdReady(got);
    }
  })();
  return true;
}

/**
 * 回跳标记：写在 redirect_uri 上，微信跳回来时 URL 里就带它。
 *
 * 这样即使 localStorage / sessionStorage 在微信里被清空（隐私模式、跨 webview），
 * 也能认出「刚刚已经试过一次」，杜绝无限跳转。
 */
const ATTEMPT_MARKER_PARAM = 'tqws_oid';

function hasAttemptMarkerInUrl(): boolean {
  try {
    return (
      new URLSearchParams(window.location.search).get(ATTEMPT_MARKER_PARAM) === '1'
    );
  } catch {
    return false;
  }
}

/** 换取成功后把标记从地址栏擦掉，避免外链带着它导致新用户拿不到 openId */
function removeAttemptMarkerFromUrl(): void {
  try {
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has(ATTEMPT_MARKER_PARAM)) return;
    sp.delete(ATTEMPT_MARKER_PARAM);
    const q = sp.toString();
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`
    );
  } catch {
    /* ignore */
  }
}

function buildSilentOAuthUrl(redirectUri: string): string {
  let target = redirectUri;
  try {
    const u = new URL(redirectUri);
    u.searchParams.set(ATTEMPT_MARKER_PARAM, '1');
    target = u.toString();
  } catch {
    const sep = redirectUri.includes('?') ? '&' : '?';
    target = `${redirectUri}${sep}${ATTEMPT_MARKER_PARAM}=1`;
  }
  return (
    'https://open.weixin.qq.com/connect/oauth2/authorize' +
    `?appid=${WECHAT_OAUTH_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(target)}` +
    `&response_type=code&scope=snsapi_base&state=${OAUTH_STATE}` +
    '#wechat_redirect'
  );
}

/**
 * 按需发起静默跳转换取 openId。
 *
 * 只在用户真正要支付时调用（而不是组件一挂载就跳），
 * 避免家长正在填 ID 时页面被跳走、输入内容丢失。
 * 返回 false 表示当前环境不需要/无法跳转。
 */
export function redirectToWechatOpenId(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isSelfPayEnabled() || !isWeixinBrowser()) return false;
  try {
    // 用户主动触发的，允许再试一次（清掉防重试标记）
    clearAttempted();
    markAttempted();
    const redirectUri = window.location.href.split('#')[0];
    window.location.assign(buildSilentOAuthUrl(redirectUri));
    return true;
  } catch {
    return false;
  }
}

/**
 * 返回可用的公众号 openId（没有时返回 null）。
 *
 * `autoRedirect = false` 时不在挂载阶段跳转，避免打断家长填写 ID；
 * 由支付按钮在真正需要时调用 `redirectToWechatOpenId()`。
 */
export function useWechatOpenId(autoRedirect = true): string | null {
  const [openId, setOpenId] = useState<string | null>(() => getStoredWechatOpenId());

  useLayoutEffect(() => {
    if (openId) return;
    if (!isSelfPayEnabled() || !isWeixinBrowser()) return;

    // 无论是否负责跳转，都监听 App 换取成功的广播：
    // 微信回跳那一帧本组件可能比 App 先挂载，此时 localStorage 还是空的，
    // 不监听的话整页都不会再刷新，支付时会误判「拿不到 openId」。
    const onReady = (e: Event): void => {
      const v = (e as CustomEvent<string>).detail;
      if (v) setOpenId(v);
    };
    window.addEventListener(OPENID_READY_EVENT, onReady);

    // 可能换取已完成但本组件是后挂载的
    const stored = getStoredWechatOpenId();
    if (stored) {
      setOpenId(stored);
      window.removeEventListener(OPENID_READY_EVENT, onReady);
      return;
    }

    let redirecting = false;
    if (autoRedirect && !hasAttemptMarkerInUrl() && !hasAttemptedRecently()) {
      // App 正在换取时不要抢着再跳一次
      if (!hasInFlightOpenIdExchange()) {
        // 只尝试一次，失败也不再跳转，避免死循环：
        // ① localStorage 时间戳（10 分钟内）② 回跳 URL 上的标记（防存储被清空）
        markAttempted();
        redirecting = true;
        const redirectUri = window.location.href.split('#')[0];
        window.location.assign(buildSilentOAuthUrl(redirectUri));
      }
    }

    if (redirecting) return;
    return () => window.removeEventListener(OPENID_READY_EVENT, onReady);
  }, [autoRedirect, openId]);

  return openId;
}
