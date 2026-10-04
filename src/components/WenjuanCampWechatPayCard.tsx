import { useMutation } from '@apollo/client';
import { useCallback, useState } from 'react';
import { getInviterYonghukuId } from '../auth/inviterRef';
import {
  buildWenjuanDingdanInsertInput,
  computeWenjuanDingdanAmountFields,
} from '../constants/wenjuanOrderInsert';
import {
  isWenjuanPayManualClientConfirmAllowed,
  isWenjuanWechatPayEnabled,
  logWenjuanPayRequest,
  shouldPatchDingdanAmountAfterInsert,
  wenjuanPayAmountForCreateWechatPaymentFromYuan,
  wenjuanPayPaymentType,
  WENJUAN_CAMP_PAY_OK_STORAGE_KEY,
  WENJUAN_CAMP_WXPAY_H5_PENDING_KEY,
} from '../constants/wenjuanPayment';
import type { CampWechatContact } from '../constants/campWechatContact';
import { WENJUAN_CAMP_ORDER_TYPE } from '../constants/lead2026';
import {
  CREATE_WECHAT_PAYMENT,
  INSERT_WENJUAN_2026_DINGDAN,
  PATCH_WENJUAN_2026_DINGDAN_AMOUNTS,
} from '../graphql/operations';
import { parseWechatPaymentMessage } from '../payment/parseWechatPaymentMessage';
import {
  createSelfPayOrder,
  fetchSelfPayStatus,
  isSelfPayEnabled,
} from '../payment/selfPay';
import { invokeWechatJsapiPay, isWeixinBrowser } from '../payment/weixinBrowser';
import { friendlyRequestErrorMessage } from '../utils/friendlyRequestError';

type Props = {
  accountId: string | null;
  amountYuan: number;
  userLibraryId: string | number | null;
  publicAccountId?: string | null;
  /**
   * 用于 createWechatPayment(description) 以及后端支付记录解锁匹配的描述值。
   * 共修营建议使用带期次的值（例如：`2026共修营第2期`）。
   */
  description: string;
  orderType?: string;
  paidOkStorageKey?: string;
  h5PendingStorageKey?: string;
  onPaidMarked?: () => void;
  /** 微信 OAuth 的公众号 openId；启用自建支付通道时必需 */
  openId?: string | null;
  /**
   * 微信支付 JSAPI 调用成功后：延迟并查询后端支付记录（webhook 异步）。
   * 返回 true 时才写入前端「已付」标记。
   */
  confirmPaidWithBackend?: () => Promise<boolean>;
  /** 第三期：支付建单后写入订单文本字段（微信号 + 未进群） */
  campWechatContact?: CampWechatContact | null;
};

/** 把自建支付服务返回的微信错误码翻译成家长看得懂的提示 */
function friendlySelfPayError(raw: string): string {
  if (/appid和openid不匹配|APPID_MCHID_NOT_MATCH|appid.*mchid.*不匹配/i.test(raw)) {
    return '当前微信身份与收款公众号不匹配。请在微信内重新打开本页并完成授权登录后支付。';
  }
  if (/缺少 openId|openId/i.test(raw)) {
    return '未获取到微信身份，请在微信内重新打开本页后支付。';
  }
  if (/配置不完整|未配置/.test(raw)) {
    return '支付通道未就绪，请联系老师处理。';
  }
  return raw;
}

function parseOrderIdFromInsert(
  data:
    | { insert_ud_dingdan_b6a218_one?: { id?: string | number | null } }
    | null
    | undefined
): string | null {
  const id = data?.insert_ud_dingdan_b6a218_one?.id;
  if (id === null || id === undefined) return null;
  return String(id);
}

export function WenjuanCampWechatPayCard({
  accountId,
  amountYuan,
  userLibraryId,
  publicAccountId = null,
  description,
  orderType = WENJUAN_CAMP_ORDER_TYPE,
  openId = null,
  paidOkStorageKey = WENJUAN_CAMP_PAY_OK_STORAGE_KEY,
  h5PendingStorageKey = WENJUAN_CAMP_WXPAY_H5_PENDING_KEY,
  onPaidMarked,
  confirmPaidWithBackend,
  campWechatContact = null,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [insertDingdan] = useMutation(INSERT_WENJUAN_2026_DINGDAN);
  const [patchDingdanAmounts] = useMutation(PATCH_WENJUAN_2026_DINGDAN_AMOUNTS);
  const [createPay] = useMutation(CREATE_WECHAT_PAYMENT);

  const weixin = isWeixinBrowser();
  const payType = wenjuanPayPaymentType(weixin);
  /** 微信内 + 配置了自建支付服务 → 走自建通道（指定商户号） */
  const useSelfPay = isSelfPayEnabled() && weixin;

  const amountForCreatePay = wenjuanPayAmountForCreateWechatPaymentFromYuan(
    amountYuan
  );
  const serviceSpecialistId = getInviterYonghukuId();
  const normalizedUserLibraryId = String(userLibraryId ?? '').trim();
  const normalizedPublicAccountId = String(publicAccountId ?? '').trim();

  const markPaidOk = useCallback(() => {
    try {
      sessionStorage.setItem(paidOkStorageKey, '1');
    } catch {
      /* ignore */
    }
    onPaidMarked?.();
  }, [onPaidMarked, paidOkStorageKey]);

  const runPay = useCallback(async () => {
    setErr(null);
    if (!accountId) {
      setErr('未获取到当前登录帐户编号，请重新登录后再试。');
      return;
    }
    if (!/^\d+$/.test(normalizedUserLibraryId) && !normalizedPublicAccountId) {
      setErr('未匹配到用户库ID或公众号ID，不能创建报名订单。请确认输入的报名ID。');
      return;
    }
    if (campWechatContact?.weixin?.trim()) {
      const confirmed = window.confirm(
        `请确认微信号是否正确：\n\n${campWechatContact.weixin}\n\n老师将按此微信号添加您。确认无误后再发起支付。`
      );
      if (!confirmed) return;
    }
    setBusy(true);

    let clearBusyInFinally = true;
    try {
      let orderIdStr: string | null = null;

      const insertObject = buildWenjuanDingdanInsertInput(
        orderType,
        amountYuan,
        serviceSpecialistId,
        userLibraryId,
        description
      );
      if (campWechatContact?.weixin?.trim()) {
        insertObject.ud_gongxiuyingweixin_62acc6 = campWechatContact.weixin;
        insertObject.ud_tianjiazhuangtai_a1779b = campWechatContact.friend_status;
      }
      if (normalizedPublicAccountId) {
        insertObject.ud_gongzhonghaoid_665d9b = normalizedPublicAccountId;
      }
      logWenjuanPayRequest('mutation InsertWenjuan2026Dingdan · variables', {
        object: insertObject,
      });
      const insertRes = await insertDingdan({
        variables: { object: insertObject },
      });
      logWenjuanPayRequest('mutation InsertWenjuan2026Dingdan · 响应', {
        data: insertRes.data,
        errors: insertRes.errors,
      });

      if (insertRes.errors?.length) {
        throw new Error(insertRes.errors.map((e) => e.message).join('；'));
      }

      orderIdStr = parseOrderIdFromInsert(insertRes.data);
      if (!orderIdStr) {
        throw new Error('创建订单成功但未返回订单 id。');
      }

      const insertedOrder = insertRes.data?.insert_ud_dingdan_b6a218_one;
      if (/^\d+$/.test(normalizedUserLibraryId)) {
        if (
          String(insertedOrder?.ud_yonghuxinxi_yonghuku_55773d ?? '').trim() !==
          normalizedUserLibraryId
        ) {
          throw new Error('订单已创建，但用户库ID未随订单写入。请联系老师处理后再继续支付。');
        }
      } else if (
        normalizedPublicAccountId &&
        String(insertedOrder?.ud_gongzhonghaoid_665d9b ?? '').trim() !== normalizedPublicAccountId
      ) {
        throw new Error('订单已创建，但公众号ID未随订单写入。请联系老师处理后再继续支付。');
      }
      if (
        campWechatContact?.weixin?.trim() &&
        String(insertedOrder?.ud_gongxiuyingweixin_62acc6 ?? '').trim() !==
          campWechatContact.weixin
      ) {
        throw new Error('订单已创建，但微信号未随订单写入。请联系老师处理后再继续支付。');
      }

      if (shouldPatchDingdanAmountAfterInsert()) {
        const amtSet = computeWenjuanDingdanAmountFields(amountYuan);
        logWenjuanPayRequest('mutation PatchWenjuan2026DingdanAmounts · variables', {
          id: orderIdStr,
          set: amtSet,
        });
        const patchRes = await patchDingdanAmounts({
          variables: { id: orderIdStr, set: amtSet },
        });
        logWenjuanPayRequest('mutation PatchWenjuan2026DingdanAmounts · 响应', {
          data: patchRes.data,
          errors: patchRes.errors,
        });
        if (patchRes.errors?.length) {
          throw new Error(patchRes.errors.map((e) => e.message).join('；'));
        }
      }

      if (!/^\d+$/.test(orderIdStr)) {
        throw new Error(`订单 id 格式无效：${orderIdStr}`);
      }

      // 自建支付通道：绕过 Zion 内置支付，直连自建 pay-service 用指定商户号收款。
      // 有 openId 时走 JSAPI；没有时自动降级为 H5 支付。
      if (useSelfPay) {
        const selfRes = await createSelfPayOrder({
          orderId: orderIdStr,
          amountYuan,
          description,
          openId,
          clientUrl: typeof window !== 'undefined' ? window.location.href : '',
        });
        if (!selfRes.ok) {
          throw new Error(friendlySelfPayError(selfRes.error));
        }
        if (selfRes.alreadyPaid) {
          markPaidOk();
          return;
        }

        // H5 支付：跳转到微信 APP，支付完成后回跳
        if (selfRes.h5Url) {
          try {
            sessionStorage.setItem(h5PendingStorageKey, '1');
          } catch {
            /* ignore */
          }
          window.location.assign(selfRes.h5Url);
          return;
        }

        // JSAPI（必须有 payParams）
        if (!selfRes.payParams) throw new Error('支付服务未返回支付参数');

        clearBusyInFinally = false;
        invokeWechatJsapiPay(selfRes.payParams, (ok, msg3) => {
          if (!ok) {
            setBusy(false);
            if (msg3) setErr(msg3);
            return;
          }
          void (async () => {
            try {
              // 微信回调可能延迟，轮询查单兜底（最多约 15 秒）
              let confirmed = false;
              for (let i = 0; i < 10 && !confirmed; i += 1) {
                await new Promise((r) => window.setTimeout(r, 1500));
                const st = await fetchSelfPayStatus(selfRes.outTradeNo);
                if (st.paid) confirmed = true;
              }
              if (confirmed) {
                markPaidOk();
              } else {
                setErr(
                  '微信已提示支付成功，正在等待支付结果同步；请稍后刷新页面确认，或联系老师核对。'
                );
              }
            } catch {
              setErr('确认支付结果失败，请稍后刷新页面或重试。');
            } finally {
              setBusy(false);
            }
          })();
        });
        return;
      }

      const createPayVariables = {
        orderId: orderIdStr,
        amount: amountForCreatePay,
        description,
        type: payType,
      };

      logWenjuanPayRequest('mutation CreateWechatPayment · variables', createPayVariables);
      const payRes = await createPay({
        variables: createPayVariables,
      });

      const sign = payRes.data?.createWechatPayment;
      const msg = sign?.message;

      logWenjuanPayRequest('mutation CreateWechatPayment · 响应', {
        data: payRes.data,
        errors: payRes.errors,
        createWechatPayment: sign
          ? {
              status: sign.status,
              messageLength: typeof msg === 'string' ? msg.length : 0,
              messageHead:
                typeof msg === 'string'
                  ? `${msg.slice(0, 160)}${msg.length > 160 ? '…' : ''}`
                  : msg,
            }
          : null,
      });

      if (payRes.errors?.length) {
        throw new Error(payRes.errors.map((e) => e.message).join('；'));
      }
      if (!sign || sign.status !== 'SUCCESS') {
        let m =
          typeof sign?.message === 'string'
            ? sign.message
            : 'createWechatPayment 未返回 SUCCESS';
        if (/total_fee|缺少.*金额|金额/i.test(m)) {
          m +=
            ' 〔排查：Zion 支付里「订单金额」绑定列是否与建单写入一致；可试 VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_FEN=1 或 VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_YUAN_STRING=1〕';
        }
        throw new Error(m);
      }

      const payload = parseWechatPaymentMessage(String(sign.message ?? ''));
      if (payload.kind === 'error') {
        throw new Error(payload.message);
      }

      if (payload.kind === 'h5') {
        try {
          sessionStorage.setItem(h5PendingStorageKey, '1');
        } catch {
          /* ignore */
        }
        window.location.assign(payload.mwebUrl);
        return;
      }

      clearBusyInFinally = false;

      const fen = String(Math.round(amountYuan * 100));
      const jsapiParams =
        payload.kind === 'jsapi' && !payload.params.total_fee
          ? { ...payload.params, total_fee: fen }
          : payload.params;

      invokeWechatJsapiPay(jsapiParams, (ok, msg2) => {
        if (!ok) {
          setBusy(false);
          if (msg2) setErr(msg2);
          return;
        }
        void (async () => {
          try {
            if (confirmPaidWithBackend) {
              const synced = await confirmPaidWithBackend();
              if (synced) {
                markPaidOk();
              } else {
                setErr(
                  '微信已提示支付成功。本页会每隔几秒自动向 Zion 同步支付结果；若后台已显示成功，通常很快会自动进入报名成功页面。'
                );
              }
            } else {
              markPaidOk();
            }
          } catch {
            setErr('确认支付结果失败，请稍后刷新页面或重试。');
          } finally {
            setBusy(false);
          }
        })();
      });
    } catch (e) {
      setErr(friendlyRequestErrorMessage(e));
    } finally {
      if (clearBusyInFinally) setBusy(false);
    }
  }, [
    accountId,
    amountForCreatePay,
    amountYuan,
    campWechatContact,
    confirmPaidWithBackend,
    description,
    h5PendingStorageKey,
    insertDingdan,
    orderType,
    patchDingdanAmounts,
    payType,
    markPaidOk,
    normalizedPublicAccountId,
    normalizedUserLibraryId,
    openId,
    serviceSpecialistId,
    useSelfPay,
    weixin,
  ]);

  if (!isWenjuanWechatPayEnabled()) {
    return null;
  }

  /** 已配置自建支付服务（不论当前是否微信内） */
  const selfPayConfigured = isSelfPayEnabled();

  const payDisabled = busy || !accountId || (selfPayConfigured && !weixin);

  return (
    <section
      className="relative z-10 mb-8 rounded-2xl border border-border/80 bg-muted/40 p-5 text-left shadow-[0_4px_20px_-2px_rgba(93,112,82,0.12)]"
      aria-label="微信支付"
    >
      <h2 className="font-display text-lg text-primary">微信支付</h2>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        金额：<span className="font-semibold text-foreground">¥{amountYuan.toFixed(2)}</span>。
        点击下方按钮即可发起支付。
        {!weixin ? (
          <span className="mt-1 block">
            {selfPayConfigured
              ? '当前非微信内置浏览器：请在微信内打开本页完成支付。'
              : '当前非微信内置浏览器：将使用 Zion 的 WECHATPAY_MOBILE_WEB（H5）。'}
          </span>
        ) : null}
      </p>
      {err ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          disabled={payDisabled}
          className="min-h-12 rounded-full bg-[#07C160] px-8 py-3 font-semibold text-white shadow-[0_4px_20px_-2px_rgba(93,112,82,0.15)] transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void runPay()}
        >
          {busy ? '处理中…' : '微信支付'}
        </button>
        {isWenjuanPayManualClientConfirmAllowed() ? (
          <button
            type="button"
            className="min-h-12 rounded-full border-2 border-secondary bg-transparent px-6 py-3 text-sm font-bold text-secondary transition duration-300 ease-out hover:bg-secondary/10"
            onClick={markPaidOk}
          >
            我已完成支付
          </button>
        ) : null}
      </div>
    </section>
  );
}
