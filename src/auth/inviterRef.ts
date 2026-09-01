const SESSION_KEY = 'tqwj_inviter_yonghuku_id';
/** 微信授权等跨域回跳后 sessionStorage 可能丢，用 localStorage 兜底同一浏览器内的 ref */
const LOCAL_KEY = 'tqwj_inviter_yonghuku_id_ls';

/** 微信 OAuth state 携带邀请人；需与 captureInviterRefFromOAuthState 一致 */
const OAUTH_STATE_PREFIX = 'tqwj_r_';
const URL_PARAM_CANDIDATES = ['yaoqingren_id', 'ref'] as const;

function readInviterFromSearch(search: string): string | null {
  try {
    const params = new URLSearchParams(search);
    for (const key of URL_PARAM_CANDIDATES) {
      const v = params.get(key)?.trim();
      if (v && /^\d+$/.test(v)) return v;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 仅从地址栏读取（pathname 后的 ?query，以及 hash 片段里的 ?query），不含本地存储。
 * 部分宿主会把参数放在 # 后；微信内偶发 search 更新晚于首帧，提交前也会再读此处。
 */
export function readInviterRefFromAddressBarOnly(): string | null {
  const fromSearch = readInviterFromSearch(window.location.search);
  if (fromSearch) return fromSearch;
  const { hash } = window.location;
  if (!hash || !hash.includes('?')) return null;
  const qStart = hash.indexOf('?');
  return readInviterFromSearch(hash.slice(qStart));
}

function persistInviterRef(ref: string): void {
  if (!/^\d+$/.test(ref)) return;
  try {
    sessionStorage.setItem(SESSION_KEY, ref);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(LOCAL_KEY, ref);
  } catch {
    /* ignore */
  }
}

/**
 * 从地址栏 ?ref=用户库主键id 写入存储（需在 JWT 消费清 query 之前调用）。
 */
export function captureInviterRefFromUrl(): void {
  const ref = readInviterRefFromAddressBarOnly();
  if (ref) persistInviterRef(ref);
}

/**
 * 微信网页授权回跳 URL 上的 state 会原样返回；在清掉 query 之前调用。
 * 仅识别本应用写入的 state（前缀 tqwj_r_ + 数字 id）。
 */
export function captureInviterRefFromOAuthState(state: string | null): void {
  if (!state) return;
  if (!state.startsWith(OAUTH_STATE_PREFIX)) return;
  const id = state.slice(OAUTH_STATE_PREFIX.length).trim();
  if (/^\d+$/.test(id)) persistInviterRef(id);
}

/**
 * 在发起微信授权的请求 URL 上增加 state= tqwj_r_{用户库id}。
 * 若链接里已有 state（例如 Zion 固定 CSRF），不覆盖，避免破坏后台校验。
 *
 * 注意：不得用 URL/searchParams 改写整段授权链接。微信对 redirect_uri 编码极敏感，
 * searchParams 会解码再序列化，易导致 redirect_uri 变化，从而出现「AppID 参数错误」类提示。
 */
export function appendWechatOAuthStateForInviter(
  loginUrl: string,
  inviterRef: string | null
): string {
  if (!inviterRef || !/^\d+$/.test(inviterRef)) return loginUrl;
  try {
    const hashIdx = loginUrl.indexOf('#');
    const queryPart = hashIdx >= 0 ? loginUrl.slice(0, hashIdx) : loginUrl;
    if (/[?&]state=/.test(queryPart)) return loginUrl;

    const stateVal = encodeURIComponent(`${OAUTH_STATE_PREFIX}${inviterRef}`);
    const sep = queryPart.includes('?') ? '&' : '?';
    const injected = `${queryPart}${sep}state=${stateVal}`;

    return hashIdx >= 0 ? `${injected}${loginUrl.slice(hashIdx)}` : injected;
  } catch {
    return loginUrl;
  }
}

/** 纯读取（可在 render 中调用）：先当前 URL，再本地存储 */
export function getInviterYonghukuId(): string | null {
  try {
    const fromUrl = readInviterRefFromAddressBarOnly();
    if (fromUrl) return fromUrl;
    const s = sessionStorage.getItem(SESSION_KEY)?.trim();
    if (s && /^\d+$/.test(s)) return s;
    const l = localStorage.getItem(LOCAL_KEY)?.trim();
    return l && /^\d+$/.test(l) ? l : null;
  } catch {
    return null;
  }
}

export function clearInviterYonghukuId(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}
