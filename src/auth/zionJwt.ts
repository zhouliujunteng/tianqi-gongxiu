const STORAGE_KEY = 'zion_jwt';

/** OAuth 回跳时可能使用的 query / hash 参数名 */
const TOKEN_QUERY_KEYS = ['token', 'jwt', 'access_token', 'authorization'];

export function getZionJwt(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setZionJwt(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearZionJwt(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    const obj = JSON.parse(json) as unknown;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return obj as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 从 JWT 里读取当前 Zion 用户 id（优先 x-hasura-user-id / ZERO_USER_ID）。
 * 用于避免 `account(limit: 1)` 在权限配置异常时返回固定行导致前端显示错号。
 */
export function getZionJwtUserId(): string | null {
  const t = getZionJwt();
  if (!t) return null;
  const payload = decodeJwtPayload(t);
  if (!payload) return null;
  const hasura = payload.hasura_claims;
  if (hasura && typeof hasura === 'object' && !Array.isArray(hasura)) {
    const uid = (hasura as Record<string, unknown>)['x-hasura-user-id'];
    if (uid !== null && uid !== undefined) {
      const s = String(uid).trim();
      if (/^\d+$/.test(s)) return s;
    }
  }
  const zeroUserId = payload.ZERO_USER_ID;
  if (zeroUserId !== null && zeroUserId !== undefined) {
    const s = String(zeroUserId).trim();
    if (/^\d+$/.test(s)) return s;
  }
  return null;
}

/**
 * 从当前 URL 解析登录回跳带来的 JWT，写入 localStorage 并清理 query/hash。
 */
export function consumeJwtFromUrl(): boolean {
  let found: string | null = null;

  const params = new URLSearchParams(window.location.search);
  for (const k of TOKEN_QUERY_KEYS) {
    const v = params.get(k);
    if (v && v.length > 8) {
      found = decodeURIComponent(v.trim());
      break;
    }
  }

  if (!found && window.location.hash.length > 1) {
    const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    for (const k of TOKEN_QUERY_KEYS) {
      const v = hp.get(k);
      if (v && v.length > 8) {
        found = decodeURIComponent(v.trim());
        break;
      }
    }
  }

  if (!found) {
    return false;
  }

  setZionJwt(found);

  /**
   * 保留 ref= 等非 token 参数；同时去掉 code/state，避免与「URL 带 JWT」的旧回跳混用时残留
   * 导致误以为仍需走 code 换票。
   */
  const sp = new URLSearchParams(window.location.search);
  for (const k of TOKEN_QUERY_KEYS) {
    sp.delete(k);
  }
  sp.delete('code');
  sp.delete('state');
  const q = sp.toString();
  const nextPath = `${window.location.pathname}${q ? `?${q}` : ''}`;
  window.history.replaceState({}, document.title, nextPath);

  return true;
}
