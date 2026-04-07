import { useMutation, useQuery } from '@apollo/client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  captureInviterRefFromUrl,
  clearInviterYonghukuId,
  getInviterYonghukuId,
} from '../auth/inviterRef';
import {
  buildWechatOAuthRedirectUrl,
  buildWechatOAuthUrlForWeixinBrowser,
} from '../auth/wechatLoginUrl';
import { clearZionJwt, getZionJwt, getZionJwtUserId } from '../auth/zionJwt';
import { BrandLogoMark } from '../components/BrandLogoMark';
import { WenjuanWechatPayCard } from '../components/WenjuanWechatPayCard';
import { BRAND_LOGO_GLOBAL_DOC_TYPE } from '../constants/brand';
import {
  isWenjuanPayManualClientConfirmAllowed,
  isWenjuanPayRequiredForSubmit,
  isWenjuanWechatPayEnabled,
  WENJUAN_PAY_OK_STORAGE_KEY,
  WENJUAN_PAY_WEBHOOK_RETRY_WAIT_MS,
  WENJUAN_PAY_WEBHOOK_WAIT_MS,
  WENJUAN_WXPAY_H5_PENDING_KEY,
} from '../constants/wenjuanPayment';
import { PRIORITY_OPTION_POOL, WENJUAN_TYPE_ROUTINE } from '../constants/lead2026';
import {
  BRAND_LOGO_FROM_GLOBAL_DOC,
  INSERT_LEAD_2026,
  ME_ACCOUNT,
  MY_LEAD_2026_EXISTS,
  WENJUAN_PAY_ELIGIBILITY,
} from '../graphql/operations';
import type {
  BrandLogoQueryData,
  Lead2026FormValues,
  MeAccountRow,
  MyLead2026ExistsData,
  WenjuanPayEligibilityData,
} from '../types/lead2026';
import { emptyLeadForm } from '../types/lead2026';
import { friendlyRequestErrorMessage } from '../utils/friendlyRequestError';
import { isWeixinBrowser } from '../payment/weixinBrowser';

type Screen = 'form' | 'thanks';

function toShoujiNeirong(v: Lead2026FormValues): Record<string, unknown> {
  return {
    姓名: v.childName,
    性别: v.gender,
    年龄: v.age,
    年级: v.grade,
    孩子经济来源: v.incomeSource,
    问题选项_家长认为最重要的两项: v.priorityTwo,
    问题描述: v.issueDescription,
    日常表现: v.dailyPerformance,
    家长姓名: v.parentName,
    联系电话: v.parentPhone,
  };
}

function isZionPaymentSuccessful(status: string | null | undefined): boolean {
  return String(status ?? '').toUpperCase() === 'SUCCESSFUL';
}

function SubtleAccountFooter({ accountId }: { accountId: string }) {
  return (
    <footer className="mt-16 w-full pb-10 pt-2">
      <p className="sr-only">当前帐户编号</p>
      <p
        className="text-center font-mono text-[10px] leading-tight text-muted-foreground/30"
        translate="no"
      >
        {accountId}
      </p>
    </footer>
  );
}

function LoginAccountIdHint({ accountId }: { accountId: string | null }) {
  return (
    <p
      className="mt-3 text-center font-mono text-[11px] leading-tight text-muted-foreground/60"
      translate="no"
    >
      登录账号ID：{accountId ?? '未登录'}
    </p>
  );
}

const inputClass =
  'w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';
const labelClass = 'mb-2 block font-display text-sm font-semibold text-foreground';

export function Lead2026Page({
  wechatOAuthExchangePending = false,
  wechatOAuthExchangeError = null,
}: {
  wechatOAuthExchangePending?: boolean;
  wechatOAuthExchangeError?: string | null;
} = {}) {
  const token = getZionJwt();
  const jwtAccountId = getZionJwtUserId();
  const wechatOAuthConfigured = Boolean(
    import.meta.env.VITE_ZION_WECHAT_OAUTH_URL?.trim()
  );
  const inWeChatBrowser = isWeixinBrowser();
  const wechatUrlMobile = buildWechatOAuthUrlForWeixinBrowser();
  const pcOauthBase = import.meta.env.VITE_ZION_WECHAT_OAUTH_URL_PC?.trim();
  const wechatUrlDesktop = pcOauthBase
    ? buildWechatOAuthRedirectUrl(pcOauthBase)
    : '';

  useLayoutEffect(() => {
    captureInviterRefFromUrl();
  }, []);

  const { data: logoData } = useQuery<BrandLogoQueryData>(BRAND_LOGO_FROM_GLOBAL_DOC, {
    variables: { type: BRAND_LOGO_GLOBAL_DOC_TYPE },
    fetchPolicy: 'no-cache',
  });
  const brandLogoUrl =
    logoData?.ud_quanjuwendang_d0da48?.[0]?.ud_tupian_3212f2?.url ?? null;

  const {
    data: meData,
    loading: meLoading,
    error: meError,
  } = useQuery<{ account: MeAccountRow[] }>(ME_ACCOUNT, {
    variables: { accountId: jwtAccountId ?? '0' },
    skip: !token || !jwtAccountId,
    fetchPolicy: 'network-only',
  });

  const meRow = meData?.account?.[0];

  /** 仅由 VITE_WENJUAN_PAY_REQUIRE_SUBMIT 控制；与 VITE_WENJUAN_PAY_ENABLED（微信支付卡片）解耦 */
  const paySubmitRequired = isWenjuanPayRequiredForSubmit();

  const {
    data: eligibilityData,
    loading: eligibilityLoading,
    error: eligibilityError,
    refetch: refetchEligibility,
  } = useQuery<WenjuanPayEligibilityData>(WENJUAN_PAY_ELIGIBILITY, {
    variables: { accountId: meRow?.id ?? '0' },
    skip: !token || !meRow?.id || !paySubmitRequired,
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  const {
    data: leadExistsData,
    loading: leadExistsLoading,
    error: leadExistsError,
  } = useQuery<MyLead2026ExistsData>(MY_LEAD_2026_EXISTS, {
    variables: { accountId: meRow?.id ?? '0' },
    skip: !token || !meRow?.id,
    fetchPolicy: 'network-only',
  });

  const hasSuccessfulPayment = useMemo(() => {
    return (
      eligibilityData?.fz_payment_record?.some((r) =>
        isZionPaymentSuccessful(r.status)
      ) ?? false
    );
  }, [eligibilityData]);

  const paidViaZion = hasSuccessfulPayment;

  const [screen, setScreen] = useState<Screen>('form');
  const [form, setForm] = useState<Lead2026FormValues>(emptyLeadForm);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const [payUnlocked, setPayUnlocked] = useState(() => {
    if (!isWenjuanPayRequiredForSubmit()) {
      return true;
    }
    if (!isWenjuanPayManualClientConfirmAllowed()) {
      return false;
    }
    try {
      return sessionStorage.getItem(WENJUAN_PAY_OK_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const alreadySubmitted =
    (leadExistsData?.ud_wenjuanshouji_2026yinliu_cb3e5d?.length ?? 0) > 0;

  /** 须先停留在支付页，完成支付（或手动确认）后才能进入问卷填写页 */
  const needPayWall =
    paySubmitRequired &&
    !payUnlocked &&
    (eligibilityLoading || !paidViaZion);

  const confirmPaidWithBackend = useCallback(async (): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, WENJUAN_PAY_WEBHOOK_WAIT_MS));
    const r1 = await refetchEligibility();
    const ok1 =
      r1.data?.fz_payment_record?.some((rec) =>
        isZionPaymentSuccessful(rec.status)
      ) ?? false;
    if (ok1) return true;
    await new Promise((r) => setTimeout(r, WENJUAN_PAY_WEBHOOK_RETRY_WAIT_MS));
    const r2 = await refetchEligibility();
    return (
      r2.data?.fz_payment_record?.some((rec) =>
        isZionPaymentSuccessful(rec.status)
      ) ?? false
    );
  }, [refetchEligibility]);

  useEffect(() => {
    if (!token || !meRow?.id || !paySubmitRequired) return;
    let h5OnLoad = false;
    try {
      h5OnLoad = sessionStorage.getItem(WENJUAN_WXPAY_H5_PENDING_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (!h5OnLoad) return;
    const t = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(WENJUAN_WXPAY_H5_PENDING_KEY);
      } catch {
        /* ignore */
      }
      void refetchEligibility();
    }, WENJUAN_PAY_WEBHOOK_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [token, meRow?.id, paySubmitRequired, refetchEligibility]);

  useEffect(() => {
    if (!token || !meRow?.id || !paySubmitRequired) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      let h5Pending = false;
      try {
        h5Pending =
          sessionStorage.getItem(WENJUAN_WXPAY_H5_PENDING_KEY) === '1';
      } catch {
        /* ignore */
      }
      if (h5Pending) {
        window.setTimeout(() => {
          try {
            sessionStorage.removeItem(WENJUAN_WXPAY_H5_PENDING_KEY);
          } catch {
            /* ignore */
          }
          void refetchEligibility();
        }, WENJUAN_PAY_WEBHOOK_WAIT_MS);
        return;
      }
      void refetchEligibility();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [token, meRow?.id, paySubmitRequired, refetchEligibility]);

  const showWechatPayCard =
    paySubmitRequired &&
    isWenjuanWechatPayEnabled() &&
    !payUnlocked &&
    !paidViaZion;

  const showPayCompleteFallback =
    paySubmitRequired &&
    isWenjuanPayManualClientConfirmAllowed() &&
    !isWenjuanWechatPayEnabled() &&
    !payUnlocked &&
    !paidViaZion &&
    !eligibilityLoading;

  const [insertLead] = useMutation(INSERT_LEAD_2026);

  const doInsert = useCallback(
    async (v: Lead2026FormValues, account: MeAccountRow) => {
      captureInviterRefFromUrl();
      const inviter = getInviterYonghukuId();
      await insertLead({
        variables: {
          object: {
            ud_zhanghu_id_21fc49: account.id,
            ud_wenjuanleixing_6fd452: WENJUAN_TYPE_ROUTINE,
            ud_shoujineirong_3bc0b9: toShoujiNeirong(v),
            ...(inviter ? { ud_yaoqingren_id_50935a: inviter } : {}),
          },
        },
      });
    },
    [insertLead]
  );

  const onSubmitForm = useCallback(
    async (v: Lead2026FormValues) => {
      if (!meRow) return;
      if (alreadySubmitted) {
        setSubmitErr('您已提交过问卷，不可重复提交。');
        return;
      }
      if (
        paySubmitRequired &&
        !payUnlocked &&
        (eligibilityLoading || !paidViaZion)
      ) {
        setSubmitErr('请先完成支付后再填写提交');
        return;
      }
      setSubmitErr(null);
      try {
        await doInsert(v, meRow);
        setScreen('thanks');
      } catch (e) {
        setSubmitErr(friendlyRequestErrorMessage(e));
      }
    },
    [
      doInsert,
      meRow,
      alreadySubmitted,
      paySubmitRequired,
      payUnlocked,
      eligibilityLoading,
      paidViaZion,
    ]
  );

  function validate(v: Lead2026FormValues): string | null {
    if (!v.childName.trim()) return '请填写姓名';
    if (!v.gender) return '请选择性别';
    if (!v.age.trim()) return '请填写年龄';
    if (!v.grade.trim()) return '请填写年级';
    if (!v.incomeSource.trim()) return '请填写孩子经济来源';
    if (v.priorityTwo.length !== 2) return '请在「问题选项」中恰好选择 2 项';
    if (!v.issueDescription.trim()) return '请填写问题描述';
    if (!v.dailyPerformance.trim()) return '请填写日常表现';
    if (!v.parentName.trim()) return '请填写家长姓名';
    if (!/^1\d{10}$/.test(v.parentPhone.trim())) return '请填写正确的家长联系电话';
    return null;
  }

  function togglePriority(label: string) {
    setForm((prev) => {
      const has = prev.priorityTwo.includes(label);
      if (has) {
        return {
          ...prev,
          priorityTwo: prev.priorityTwo.filter((x) => x !== label),
        };
      }
      if (prev.priorityTwo.length >= 2) return prev;
      return { ...prev, priorityTwo: [...prev.priorityTwo, label] };
    });
  }

  if (screen === 'thanks' && meRow) {
    return (
      <div className="relative z-10 mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-[2rem] border border-border bg-card p-10 shadow-organic">
          <p className="text-4xl" aria-hidden>
            ✓
          </p>
          <h2 className="mt-4 font-display text-3xl text-foreground">
            提交成功
          </h2>
          <p className="mt-3 text-muted-foreground">
            感谢您的填写，我们已收到问卷信息。
          </p>
        </div>
        <SubtleAccountFooter accountId={meRow.id} />
      </div>
    );
  }

  if (screen === 'thanks') {
    return (
      <div className="relative z-10 mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-[2rem] border border-border bg-card p-10 shadow-organic">
          <p className="text-4xl" aria-hidden>
            ✓
          </p>
          <h2 className="mt-4 font-display text-3xl text-foreground">
            提交成功
          </h2>
          <p className="mt-3 text-muted-foreground">
            感谢您的填写，我们已收到问卷信息。
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <LoginGateScreen
        logoUrl={brandLogoUrl}
        loginAccountId={jwtAccountId}
        inWeChatBrowser={inWeChatBrowser}
        wechatUrlMobile={wechatUrlMobile}
        wechatUrlDesktop={wechatUrlDesktop}
        wechatOAuthConfigured={wechatOAuthConfigured}
        oauthExchangePending={wechatOAuthExchangePending}
        oauthExchangeError={wechatOAuthExchangeError}
        title="请先登录"
        subtitle={
          inWeChatBrowser
            ? '请先完成微信授权登录。登录后将进入支付或问卷流程。'
            : '在电脑浏览器中可使用下方「微信登录」扫码；或在手机微信中直接打开本页完成授权。'
        }
      />
    );
  }

  if (token && meLoading) {
    return (
      <div className="relative z-10 flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>正在确认登录状态…</p>
      </div>
    );
  }

  if (token && (meError || !meRow)) {
    return (
      <div className="relative z-10 mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-[2rem] border border-border bg-card p-8 shadow-organic-sm">
          <h2 className="font-display text-xl text-destructive">
            登录状态无效
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {meError
              ? friendlyRequestErrorMessage(meError)
              : '无法获取当前帐户，请重新授权登录。'}
          </p>
          <button
            type="button"
            className="mt-6 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground"
            onClick={() => {
              clearZionJwt();
              window.location.reload();
            }}
          >
            清除本地登录并刷新
          </button>
        </div>
      </div>
    );
  }

  if (token && meRow && leadExistsLoading) {
    return (
      <div className="relative z-10 flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>正在确认是否已填写过问卷…</p>
      </div>
    );
  }

  if (token && meRow && leadExistsError) {
    return (
      <div className="relative z-10 mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-[2rem] border border-border bg-card p-8 shadow-organic-sm">
          <h2 className="font-display text-xl text-destructive">无法校验问卷记录</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {friendlyRequestErrorMessage(leadExistsError)}
          </p>
          <button
            type="button"
            className="mt-6 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            点击刷新
          </button>
        </div>
      </div>
    );
  }

  if (token && meRow && alreadySubmitted) {
    return (
      <div className="relative z-10 mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-[2rem] border border-border bg-card p-10 shadow-organic">
          <p className="text-4xl" aria-hidden>
            ✓
          </p>
          <h2 className="mt-4 font-display text-3xl text-foreground">您已填写过问卷</h2>
          <p className="mt-3 text-muted-foreground">
            每个帐户仅可提交一次。如需修改请联系工作人员。
          </p>
        </div>
        <SubtleAccountFooter accountId={meRow.id} />
      </div>
    );
  }

  if (token && meRow && needPayWall) {
    return (
      <div className="relative z-10 mx-auto max-w-2xl px-4 py-10 md:py-14">
        <header className="mb-10 text-center">
          <BrandLogoMark
            url={brandLogoUrl}
            title="问卷收集 · 支付"
            isPrimaryPageHeading
            className="mb-5"
          />
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            {eligibilityLoading
              ? '正在确认支付状态…'
              : '请先完成支付。支付成功后，将自动进入问卷填写页面。'}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <span>
              帐户：
              <span className="font-medium text-foreground">
                {meRow.username?.trim() || '已登录'}
              </span>
            </span>
            <button
              type="button"
              className="underline decoration-border hover:text-foreground"
              onClick={() => {
                clearInviterYonghukuId();
                clearZionJwt();
                window.location.reload();
              }}
            >
              退出并换帐号
            </button>
          </div>
          <LoginAccountIdHint accountId={jwtAccountId ?? meRow.id} />
        </header>

        {paySubmitRequired && eligibilityError ? (
          <div
            className="mx-auto mb-6 max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-accent-foreground"
            role="alert"
          >
            <p>
              支付状态校验失败（无法读取支付记录）：{' '}
              {friendlyRequestErrorMessage(eligibilityError)}
            </p>
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-primary underline decoration-primary/40 underline-offset-2"
              onClick={() => void refetchEligibility()}
            >
              点击重试
            </button>
          </div>
        ) : null}

        <article className="rounded-tl-[1.75rem] rounded-tr-[1.25rem] rounded-br-[2rem] rounded-bl-[1.35rem] border border-border bg-card p-6 shadow-organic-sm md:p-10">
          {showWechatPayCard ? (
            <WenjuanWechatPayCard
              accountId={meRow.id}
              confirmPaidWithBackend={confirmPaidWithBackend}
              onPaidMarked={() => setPayUnlocked(true)}
            />
          ) : null}
          {showPayCompleteFallback ? (
            <section
              className="mb-8 rounded-2xl border border-border/80 bg-muted/40 p-5 text-left shadow-[0_4px_20px_-2px_rgba(93,112,82,0.12)]"
              aria-label="支付确认"
            >
              <h2 className="font-display text-lg text-primary">须先完成支付</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                当前未启用页面内微信支付。若您已通过其他渠道付款或后台已记账，可点击下方按钮。
              </p>
              <button
                type="button"
                className="mt-4 min-h-12 rounded-full border-2 border-secondary bg-transparent px-6 py-3 text-sm font-bold text-secondary transition duration-300 ease-out hover:bg-secondary/10"
                onClick={() => {
                  try {
                    sessionStorage.setItem(WENJUAN_PAY_OK_STORAGE_KEY, '1');
                  } catch {
                    /* ignore */
                  }
                  setPayUnlocked(true);
                }}
              >
                我已完成支付
              </button>
            </section>
          ) : null}
          {!showWechatPayCard && !showPayCompleteFallback && !eligibilityLoading ? (
            <p className="text-sm text-muted-foreground">
              未启用微信支付卡片且未开放手动确认时，无法在本页完成支付，请联系管理员配置{' '}
              <code className="text-accent-foreground">VITE_WENJUAN_PAY_ENABLED</code> 或{' '}
              <code className="text-accent-foreground">VITE_WENJUAN_PAY_ALLOW_MANUAL_OK</code>。
            </p>
          ) : null}
        </article>

        <SubtleAccountFooter accountId={meRow.id} />
      </div>
    );
  }

  return (
    <div className="relative z-10 mx-auto max-w-2xl px-4 py-10 md:py-14">
      <header className="mb-10 text-center">
        <BrandLogoMark
          url={brandLogoUrl}
          title="问卷收集"
          isPrimaryPageHeading
          className="mb-5"
        />
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          请填写下列信息。每位登录帐户仅可提交一次，提交后将关联到当前帐户。
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>
            帐户：
            <span className="font-medium text-foreground">
              {meRow?.username?.trim() || '已登录'}
            </span>
          </span>
          <button
            type="button"
            className="underline decoration-border hover:text-foreground"
            onClick={() => {
              clearInviterYonghukuId();
              clearZionJwt();
              window.location.reload();
            }}
          >
            退出并换帐号
          </button>
        </div>
        <LoginAccountIdHint accountId={jwtAccountId ?? meRow?.id ?? null} />
      </header>

      <article className="rounded-tl-[1.75rem] rounded-tr-[1.25rem] rounded-br-[2rem] rounded-bl-[1.35rem] border border-border bg-card p-6 shadow-organic-sm md:p-10">
        <form
          className="flex flex-col gap-8"
          onSubmit={(e) => {
            e.preventDefault();
            const err = validate(form);
            if (err) {
              setSubmitErr(err);
              return;
            }
            void onSubmitForm(form);
          }}
        >
          <section>
            <h2 className="font-display text-lg text-primary">孩子信息</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelClass}>姓名</label>
                <input
                  className={inputClass}
                  value={form.childName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, childName: e.target.value }))
                  }
                  placeholder="孩子姓名"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className={labelClass}>性别</label>
                <select
                  className={inputClass}
                  value={form.gender}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, gender: e.target.value }))
                  }
                >
                  <option value="">请选择</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>年龄</label>
                <input
                  className={inputClass}
                  value={form.age}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, age: e.target.value }))
                  }
                  placeholder="例如 12"
                  inputMode="numeric"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>年级</label>
                <input
                  className={inputClass}
                  value={form.grade}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, grade: e.target.value }))
                  }
                  placeholder="例如 初一"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>孩子经济来源</label>
                <input
                  className={inputClass}
                  value={form.incomeSource}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, incomeSource: e.target.value }))
                  }
                  placeholder="简要说明"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg text-primary">问题选项</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              请选择家长认为最重要的两项（已选 {form.priorityTwo.length}
              /2）
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {PRIORITY_OPTION_POOL.map((opt) => {
                const checked = form.priorityTwo.includes(opt);
                const disabled = !checked && form.priorityTwo.length >= 2;
                return (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                      checked
                        ? 'border-primary bg-accent/50'
                        : 'border-border bg-background/80'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => togglePriority(opt)}
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg text-primary">问题描述</h2>
            <label className={`${labelClass} mt-3`}>可自行填写</label>
            <textarea
              className={`${inputClass} min-h-[120px]`}
              value={form.issueDescription}
              onChange={(e) =>
                setForm((p) => ({ ...p, issueDescription: e.target.value }))
              }
              placeholder="请描述您关心的问题或困惑"
              rows={4}
            />
          </section>

          <section>
            <h2 className="font-display text-lg text-primary">日常表现</h2>
            <textarea
              className={`${inputClass} mt-3 min-h-[100px]`}
              value={form.dailyPerformance}
              onChange={(e) =>
                setForm((p) => ({ ...p, dailyPerformance: e.target.value }))
              }
              placeholder="孩子的学习、情绪、社交等日常表现"
              rows={3}
            />
          </section>

          <section>
            <h2 className="font-display text-lg text-primary">家长信息</h2>
            <div className="mt-4 grid gap-5">
              <div>
                <label className={labelClass}>家长姓名</label>
                <input
                  className={inputClass}
                  value={form.parentName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, parentName: e.target.value }))
                  }
                  placeholder="家长姓名"
                />
              </div>
              <div>
                <label className={labelClass}>联系电话</label>
                <input
                  className={inputClass}
                  type="tel"
                  value={form.parentPhone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, parentPhone: e.target.value }))
                  }
                  placeholder="11 位手机号"
                  autoComplete="tel"
                />
              </div>
            </div>
          </section>

          {submitErr ? (
            <p className="text-sm text-destructive" role="alert">
              {submitErr}
            </p>
          ) : null}

          <button
            type="submit"
            className="rounded-full bg-secondary px-10 py-3.5 font-semibold text-secondary-foreground shadow-organic-sm transition enabled:hover:opacity-95"
          >
            提交问卷
          </button>
        </form>
      </article>

      {meRow && token ? <SubtleAccountFooter accountId={meRow.id} /> : null}
    </div>
  );
}

function LoginGateScreen({
  logoUrl,
  loginAccountId,
  inWeChatBrowser,
  wechatUrlMobile,
  wechatUrlDesktop,
  wechatOAuthConfigured,
  oauthExchangePending,
  oauthExchangeError,
  title,
  subtitle,
}: {
  logoUrl: string | null;
  loginAccountId: string | null;
  inWeChatBrowser: boolean;
  wechatUrlMobile: string;
  wechatUrlDesktop: string;
  wechatOAuthConfigured: boolean;
  oauthExchangePending: boolean;
  oauthExchangeError: string | null;
  title: string;
  subtitle: string;
}) {
  const [linkCopied, setLinkCopied] = useState(false);

  const qrSrc =
    wechatUrlMobile.length > 0
      ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(wechatUrlMobile)}`
      : '';

  return (
    <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-[2rem] border border-border bg-card p-8 text-center shadow-organic md:p-10">
        <BrandLogoMark url={logoUrl} title="问卷收集" className="mb-4" />
        <h1 className="mt-1 font-display text-3xl text-foreground">{title}</h1>
        <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground leading-relaxed">
          {subtitle}
        </p>
        {oauthExchangePending ? (
          <p
            className="mx-auto mt-4 max-w-sm rounded-xl border border-primary/40 bg-primary/5 p-3 text-center text-sm text-foreground"
            role="status"
            aria-live="polite"
          >
            正在向 Zion 换取登录状态，请稍候…
          </p>
        ) : null}
        {oauthExchangeError && !oauthExchangePending ? (
          <p
            className="mx-auto mt-4 max-w-sm rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-left text-xs text-accent-foreground"
            role="alert"
          >
            <span className="font-semibold text-destructive">微信登录未完成</span>
            <span className="mt-1 block text-muted-foreground">
              {oauthExchangeError}
            </span>
            <span className="mt-2 block text-muted-foreground">
              可重新点击「微信一键授权登录」；若反复失败，请到 Zion
              后台核对网页授权与 <code className="text-foreground">loginWithWechat</code>{' '}
              配置。
            </span>
          </p>
        ) : null}
        {!wechatOAuthConfigured ? (
          <p className="mx-auto mt-6 rounded-2xl border border-secondary/40 bg-accent/40 p-4 text-left text-xs text-accent-foreground">
            当前使用内置的微信开放平台授权链接模板（占位 AppID）。请在项目根目录{' '}
            <code className="text-foreground">.env</code> 中设置{' '}
            <code className="text-foreground">VITE_ZION_WECHAT_OAUTH_URL</code>
            （把 <code className="text-foreground">appid</code> 换成你的网站应用真实
            AppID；可用 {'{REDIRECT}'} 表示回跳当前页），或在部署平台配置同名环境变量后
            <span className="font-semibold text-foreground">重新构建</span>
            。仅改服务器上的 <code className="text-foreground">.env</code> 而不重新打包，线上页面不会更新。
          </p>
        ) : null}
        <div className="mt-8 flex flex-col items-stretch gap-3 sm:items-center">
          {wechatUrlMobile ? (
            <>
              {inWeChatBrowser ? (
                <a
                  href={wechatUrlMobile}
                  rel="noopener noreferrer"
                  aria-disabled={oauthExchangePending}
                  className={`inline-flex min-h-12 items-center justify-center rounded-full bg-[#07C160] px-8 py-3.5 font-semibold text-white shadow-organic-sm ${
                    oauthExchangePending
                      ? 'pointer-events-none cursor-wait opacity-60'
                      : 'hover:opacity-95'
                  }`}
                >
                  {oauthExchangePending ? '登录处理中…' : '微信一键授权登录'}
                </a>
              ) : wechatUrlDesktop ? (
                <>
                  <a
                    href={wechatUrlDesktop}
                    rel="noopener noreferrer"
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#07C160] px-8 py-3.5 font-semibold text-white shadow-organic-sm hover:opacity-95"
                  >
                    微信登录（浏览器内扫码）
                  </a>
                  <p className="max-w-sm text-center text-xs text-muted-foreground leading-relaxed">
                    左键点击后会在<strong className="text-foreground">当前浏览器窗口</strong>
                    打开微信开放平台扫码页；用手机扫码并确认后，应<strong className="text-foreground">
                      自动跳回本页
                    </strong>
                    并完成登录。请勿依赖「右键 → 在新标签页打开」后仍停留在旧标签；若未跳转，请检查开放平台回调域名与当前站点是否一致（见项目{' '}
                    <code className="text-foreground">.env.example</code>）。
                  </p>
                </>
              ) : (
                <>
                  <div className="max-w-sm rounded-2xl border border-secondary/40 bg-accent/30 p-3 text-left text-xs text-accent-foreground leading-relaxed">
                    <p className="font-semibold text-foreground">电脑浏览器 + 下方二维码</p>
                    <p className="mt-1">
                      二维码里是<strong className="text-foreground">公众号网页授权</strong>
                      链接，只会在你<strong className="text-foreground">手机微信里</strong>
                      完成授权；手机会登录，但<strong className="text-foreground">
                        电脑上的本页不会自动变成已登录
                      </strong>
                      （微信不会把 code 发给电脑）。这与仓库{' '}
                      <code className="text-foreground">.env.example</code> 里「系统浏览器无法直接打开授权页」的说明一致。
                    </p>
                    <p className="mt-2">
                      若要在<strong className="text-foreground">电脑同一浏览器窗口</strong>
                      内扫码并自动回跳登录，请在环境变量中增加开放平台「网站应用」的{' '}
                      <code className="text-foreground">VITE_ZION_WECHAT_OAUTH_URL_PC</code>
                      （qrconnect 模板见 <code className="text-foreground">.env.example</code>
                      ），与 Zion 后台换票配置一致后重新构建部署。
                    </p>
                  </div>
                  <p className="max-w-sm text-left text-xs text-muted-foreground leading-relaxed">
                    也可点击「复制授权链接」粘贴到微信聊天中再打开。
                  </p>
                  {qrSrc ? (
                    <div className="mt-2 flex flex-col items-center gap-2">
                      <img
                        src={qrSrc}
                        alt="在微信中打开此二维码以登录"
                        width={220}
                        height={220}
                        className="rounded-2xl border border-border bg-white p-2 shadow-organic-sm"
                        loading="eager"
                        decoding="async"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        二维码由第三方服务生成，仅用于编码当前授权链接
                      </span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-primary bg-transparent px-8 py-3 text-sm font-bold text-primary transition duration-300 ease-out hover:bg-primary/10"
                    onClick={() => {
                      void navigator.clipboard.writeText(wechatUrlMobile).then(
                        () => {
                          setLinkCopied(true);
                          window.setTimeout(() => setLinkCopied(false), 2500);
                        }
                      );
                    }}
                  >
                    {linkCopied ? '已复制' : '复制授权链接'}
                  </button>
                </>
              )}
            </>
          ) : null}
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => window.location.reload()}
          >
            已完成登录？点击刷新
          </button>
          <LoginAccountIdHint accountId={loginAccountId} />
        </div>
      </div>
    </div>
  );
}
