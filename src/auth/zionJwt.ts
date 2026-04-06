const STORAGE_KEY = 'zion_jwt';

/** 本地「跳过登录门」仅用于开发/未配置 OAuth 时预览问卷，不写入 JWT */
const SKIP_LOGIN_GATE_KEY = 'tqwj_skip_login_gate';

export function getSkipLoginGate(): boolean {
  try {
    return localStorage.getItem(SKIP_LOGIN_GATE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSkipLoginGate(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(SKIP_LOGIN_GATE_KEY, '1');
    } else {
      localStorage.removeItem(SKIP_LOGIN_GATE_KEY);
    }
  } catch {
    /* ignore */
  }
}

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
