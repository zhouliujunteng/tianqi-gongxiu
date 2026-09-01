import { useMutation } from '@apollo/client';
import { useCallback, useState } from 'react';
import {
  buildWenjuan2026DingdanInsertInput,
  computeWenjuanDingdanAmountFields,
} from '../constants/wenjuanOrderInsert';
import {
  isWenjuanPayManualClientConfirmAllowed,
  isWenjuanWechatPayEnabled,
  logWenjuanPayRequest,
  shouldPatchDingdanAmountAfterInsert,
  wenjuanPayAmountYuan,
  wenjuanPayAmountForCreateWechatPayment,
  wenjuanPayDescription,
  wenjuanPayPaymentType,
  WENJUAN_PAY_OK_STORAGE_KEY,
  WENJUAN_WXPAY_H5_PENDING_KEY,
} from '../constants/wenjuanPayment';
import {
  CREATE_WECHAT_PAYMENT,
  INVOKE_WENJUAN_ORDER_CREATE_FLOW,
  INSERT_WENJUAN_2026_DINGDAN,
  PATCH_WENJUAN_2026_DINGDAN_AMOUNTS,
} from '../graphql/operations';
import {
  buildWenjuanOrderActionFlowArgs,
  parseOrderIdFromActionFlowResult,
  wenjuanOrderCreateActionFlowId,
  wenjuanOrderCreateActionFlowVersionId,
  wenjuanOrderCreateUsesActionflow,
} from '../payment/wenjuanOrderViaActionflow';
import { parseWechatPaymentMessage } from '../payment/parseWechatPaymentMessage';
import {
  invokeWechatJsapiPay,
  isWeixinBrowser,
} from '../payment/weixinBrowser';
import { friendlyRequestErrorMessage } from '../utils/friendlyRequestError';

type Props = {
  /** 当前登录 Zion 帐户 `account.id`（订单表用户库外键列在 insert 中为 null；已付资格查 fz_payment_record：帐户+SUCCESSFUL+微信 type） */
  accountId: string | null;
  onPaidMarked?: () => void;
  /**
   * JSAPI 在微信内显示支付成功后：延迟并查询后端支付记录（webhook 异步，见仓库 payment rules）。
   * 返回 true 时才写入前端「已付」标记。
   */
  confirmPaidWithBackend?: () => Promise<boolean>;
};

function parseOrderIdFromInsert(
  data: { insert_ud_dingdan_b6a218_one?: { id?: string | number | null } } | null | undefined
): string | null {
  const id = data?.insert_ud_dingdan_b6a218_one?.id;
  if (id === null || id === undefined) return null;
  return String(id);
}

export function WenjuanWechatPayCard({
  accountId,
  onPaidMarked,
  confirmPaidWithBackend,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [insertDingdan] = useMutation(INSERT_WENJUAN_2026_DINGDAN);
  const [invokeOrderFlow] = useMutation(INVOKE_WENJUAN_ORDER_CREATE_FLOW);
  const [patchDingdanAmounts] = useMutation(PATCH_WENJUAN_2026_DINGDAN_AMOUNTS);
  const [createPay] = useMutation(CREATE_WECHAT_PAYMENT);

  const amount = wenjuanPayAmountYuan();
  const amountForCreatePay = wenjuanPayAmountForCreateWechatPayment();
  const description = wenjuanPayDescription();
  const weixin = isWeixinBrowser();
  const payType = wenjuanPayPaymentType(weixin);

  const markPaidOk = useCallback(() => {
    try {
      sessionStorage.setItem(WENJUAN_PAY_OK_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    onPaidMarked?.();
  }, [onPaidMarked]);

  const runPay = useCallback(async () => {
    setErr(null);
    if (!accountId) {
      setErr('未获取到当前登录帐户编号，请重新登录后再试。');
      return;
    }
    setBusy(true);
    let clearBusyInFinally = true;
    try {
      let orderIdStr: string | null = null;

      if (wenjuanOrderCreateUsesActionflow()) {
        const flowId = wenjuanOrderCreateActionFlowId();
        const flowArgs = {
          ...buildWenjuanOrderActionFlowArgs(),
          account_id: accountId,
        };
        logWenjuanPayRequest('mutation InvokeWenjuanOrderCreateFlow · variables', {
          actionFlowId: flowId,
          versionId: wenjuanOrderCreateActionFlowVersionId(),
          args: flowArgs,
        });
        const flowRes = await invokeOrderFlow({
          variables: {
            actionFlowId: flowId,
            versionId: wenjuanOrderCreateActionFlowVersionId(),
            args: flowArgs,
          },
        });
        logWenjuanPayRequest('mutation InvokeWenjuanOrderCreateFlow · 响应', {
          data: flowRes.data,
          errors: flowRes.errors,
        });
        if (flowRes.errors?.length) {
          throw new Error(flowRes.errors.map((e) => e.message).join('；'));
        }
        orderIdStr = parseOrderIdFromActionFlowResult(
          flowRes.data?.fz_invoke_action_flow
        );
        if (!orderIdStr) {
          throw new Error(
            '行为流已执行但未解析到订单 id。请在 Zion 核对行为流输出字段，或设置 VITE_WENJUAN_ORDER_CREATE_FLOW_ORDER_ID_KEY。'
          );
        }
      } else {
        const insertObject = buildWenjuan2026DingdanInsertInput(amount);
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
        if (shouldPatchDingdanAmountAfterInsert()) {
          const amtSet = computeWenjuanDingdanAmountFields(amount);
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
      }

      if (!/^\d+$/.test(orderIdStr)) {
        throw new Error(`订单 id 格式无效：${orderIdStr}`);
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
                typeof msg === 'string' ? `${msg.slice(0, 160)}${msg.length > 160 ? '…' : ''}` : msg,
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
            ' 〔排查：Zion 支付里「订单金额」绑定列是否与 insert 一致；订单行金额是否已落库；可试 VITE_WENJUAN_ORDER_AMOUNT_PATCH_AFTER_INSERT=1、VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_YUAN_STRING=1 或 AS_FEN=1〕';
        }
        throw new Error(m);
      }
      const payload = parseWechatPaymentMessage(String(sign.message ?? ''));
      if (payload.kind === 'error') {
        throw new Error(payload.message);
      }
      if (payload.kind === 'h5') {
        try {
          sessionStorage.setItem(WENJUAN_WXPAY_H5_PENDING_KEY, '1');
        } catch {
          /* ignore */
        }
        window.location.assign(payload.mwebUrl);
        return;
      }
      clearBusyInFinally = false;
      const fen = String(Math.round(amount * 100));
      const jsapiParams =
        payload.kind === 'jsapi' && !payload.params.total_fee
          ? { ...payload.params, total_fee: fen }
          : payload.params;
      invokeWechatJsapiPay(jsapiParams, (ok, msg) => {
        if (!ok) {
          setBusy(false);
          if (msg) setErr(msg);
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
                  '微信已提示支付成功。本页会每隔几秒自动向 Zion 同步支付结果；若后台已显示成功，通常很快会自动进入问卷。也可稍候下拉刷新或重新打开本页。'
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
    insertDingdan,
    invokeOrderFlow,
    patchDingdanAmounts,
    createPay,
    amount,
    amountForCreatePay,
    description,
    payType,
    markPaidOk,
    confirmPaidWithBackend,
  ]);

  if (!isWenjuanWechatPayEnabled()) {
    return null;
  }

  const payDisabled = busy || !accountId;

  return (
    <section
      className="relative z-10 mb-8 rounded-2xl border border-border/80 bg-muted/40 p-5 text-left shadow-[0_4px_20px_-2px_rgba(93,112,82,0.12)]"
      aria-label="微信支付"
    >
      <h2 className="font-display text-lg text-primary">微信支付</h2>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        金额：<span className="font-semibold text-foreground">¥{amount.toFixed(2)}</span>
        。点击下方按钮即可发起支付。
        {!weixin ? (
          <span className="mt-1 block">
            当前非微信内置浏览器：将使用 Zion 的 WECHATPAY_MOBILE_WEB（H5）。若报错，请在{' '}
            <code className="text-accent-foreground">VITE_WECHAT_PAYMENT_TYPE</code> 中填写你项目 GraphQL 里存在的{' '}
            <code className="text-accent-foreground">PaymentType</code> 枚举名。
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
