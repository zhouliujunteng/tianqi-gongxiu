/**
 * 微信 oauth2/authorize 与开放平台 qrconnect 回跳通常带 ?code=&state=。
 * 少数网关或历史配置会把参数放在 hash 中，这里一并解析。
 */
export type WechatOAuthCallbackLocation = {
  code: string;
  state: string | null;
  /** 用于从地址栏擦除参数时避免误删 hash 路由（本项目无 hash 路由时可忽略） */
  paramsIn: 'search' | 'hash';
};

function parseFromSearchParams(sp: URLSearchParams): {
  code: string;
  state: string | null;
} | null {
  const code = sp.get('code')?.trim();
  if (!code) return null;
  return { code, state: sp.get('state')?.trim() ?? null };
}

export function getWechatOAuthCodeFromLocation(): WechatOAuthCallbackLocation | null {
  const fromQuery = parseFromSearchParams(
    new URLSearchParams(window.location.search)
  );
  if (fromQuery) {
    return { ...fromQuery, paramsIn: 'search' };
  }

  const { hash } = window.location;
  if (!hash || hash.length <= 1) return null;

  const raw = hash.slice(1);
  const qm = raw.indexOf('?');
  if (qm >= 0) {
    const fromHash = parseFromSearchParams(
      new URLSearchParams(raw.slice(qm + 1))
    );
    if (fromHash) return { ...fromHash, paramsIn: 'hash' };
  }

  const noLeading = raw.startsWith('/') ? raw.slice(1) : raw;
  const sm = noLeading.indexOf('?');
  if (sm >= 0) {
    const fromHash = parseFromSearchParams(
      new URLSearchParams(noLeading.slice(sm + 1))
    );
    if (fromHash) return { ...fromHash, paramsIn: 'hash' };
  }

  return null;
}

/** 在发起 loginWithWechat 之前调用，避免地址栏残留 code */
export function stripWechatOAuthParamsFromLocation(paramsIn: 'search' | 'hash'): void {
  if (paramsIn === 'search') {
    const sp = new URLSearchParams(window.location.search);
    sp.delete('code');
    sp.delete('state');
    const q = sp.toString();
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`
    );
    return;
  }

  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${window.location.search}`
  );
}
