export function isWeixinBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

type WeixinJSBridgeInvoke = (
  api: string,
  params: Record<string, string>,
  cb: (res: { err_msg?: string }) => void
) => void;

export function whenWeixinJSBridgeReady(onReady: () => void): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w = window as Window & { WeixinJSBridge?: { invoke: WeixinJSBridgeInvoke } };
  if (w.WeixinJSBridge) {
    onReady();
    return;
  }
  const handler = (): void => {
    document.removeEventListener('WeixinJSBridgeReady', handler, false);
    onReady();
  };
  document.addEventListener('WeixinJSBridgeReady', handler, false);
}

export type WechatJsapiPayParams = {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
  /**
   * 少数微信 JSAPI 实现会要求显式传入 total_fee（分，字符串整数）。
   * Zion 部分项目返回的参数不含该字段时，可由前端补齐后再 invoke。
   */
  total_fee?: string;
};

export function invokeWechatJsapiPay(
  params: WechatJsapiPayParams,
  onResult: (ok: boolean, errMsg: string | null) => void
): void {
  whenWeixinJSBridgeReady(() => {
    const w = window as Window & { WeixinJSBridge?: { invoke: WeixinJSBridgeInvoke } };
    const bridge = w.WeixinJSBridge;
    if (!bridge?.invoke) {
      onResult(false, '未检测到 WeixinJSBridge，请在微信内打开本页');
      return;
    }
    bridge.invoke(
      'getBrandWCPayRequest',
      {
        appId: params.appId,
        timeStamp: params.timeStamp,
        nonceStr: params.nonceStr,
        package: params.package,
        signType: params.signType,
        paySign: params.paySign,
        ...(params.total_fee ? { total_fee: params.total_fee } : {}),
      },
      (res) => {
        const msg = res.err_msg ?? '';
        if (msg === 'get_brand_wcpay_request:ok') {
          onResult(true, null);
          return;
        }
        if (msg === 'get_brand_wcpay_request:cancel') {
          onResult(false, '已取消支付');
          return;
        }
        onResult(false, msg || '微信支付调用失败');
      }
    );
  });
}
