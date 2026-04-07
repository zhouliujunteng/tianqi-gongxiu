import type { WechatJsapiPayParams } from './weixinBrowser';

export type WechatPayPayload =
  | { kind: 'jsapi'; params: WechatJsapiPayParams }
  | { kind: 'h5'; mwebUrl: string }
  | { kind: 'error'; message: string };

function isJsapiShape(x: Record<string, unknown>): x is Record<string, string> {
  return (
    typeof x.appId === 'string' &&
    typeof x.timeStamp === 'string' &&
    typeof x.nonceStr === 'string' &&
    typeof x.package === 'string' &&
    typeof x.signType === 'string' &&
    typeof x.paySign === 'string'
  );
}

/**
 * Zion createWechatPayment 的 message：小程序/JSAPI 为 JSON 字符串；H5 可能为含 mweb_url 的 JSON。
 */
export function parseWechatPaymentMessage(raw: string): WechatPayPayload {
  const t = raw.trim();
  if (!t) return { kind: 'error', message: '支付接口返回为空' };

  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    if (typeof j.mweb_url === 'string' && /^https?:\/\//i.test(j.mweb_url)) {
      return { kind: 'h5', mwebUrl: j.mweb_url };
    }
    if (isJsapiShape(j)) {
      return {
        kind: 'jsapi',
        params: {
          appId: j.appId,
          timeStamp: j.timeStamp,
          nonceStr: j.nonceStr,
          package: j.package,
          signType: j.signType,
          paySign: j.paySign,
        },
      };
    }
    if (typeof j.err_msg === 'string') {
      return { kind: 'error', message: j.err_msg };
    }
    if (typeof j.message === 'string') {
      return { kind: 'error', message: j.message };
    }
  } catch {
    if (/^https?:\/\//i.test(t)) {
      return { kind: 'h5', mwebUrl: t };
    }
  }

  return {
    kind: 'error',
    message: t.length > 200 ? `${t.slice(0, 200)}…` : t,
  };
}
