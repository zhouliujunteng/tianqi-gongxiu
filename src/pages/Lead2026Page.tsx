import { useMutation, useQuery } from '@apollo/client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  clearDevMockAccountId,
  DEFAULT_DEV_MOCK_ACCOUNT_ID,
  devInviterYonghukuIdWhenProfileMissing,
  devStaffIdentityWhenProfileMissing,
  getDevMockAccountId,
  setDevMockAccountId,
} from '../auth/devMockAccount';
import {
  appendWechatOAuthStateForInviter,
  captureInviterRefFromUrl,
  clearInviterYonghukuId,
  getInviterYonghukuId,
} from '../auth/inviterRef';
import {
  clearZionJwt,
  getSkipLoginGate,
  getZionJwt,
  setSkipLoginGate,
} from '../auth/zionJwt';
import { BrandLogoMark } from '../components/BrandLogoMark';
import { BRAND_LOGO_GLOBAL_DOC_TYPE } from '../constants/brand';
import { FALLBACK_WECHAT_OAUTH_URL_TEMPLATE } from '../constants/wechatOAuth';
import { PRIORITY_OPTION_POOL, WENJUAN_TYPE_ROUTINE } from '../constants/lead2026';
import { isStaffIdentity } from '../constants/staffIdentity';
import {
  BRAND_LOGO_FROM_GLOBAL_DOC,
  INSERT_LEAD_2026,
  ME_ACCOUNT,
  USER_PROFILE_BY_ACCOUNT,
} from '../graphql/operations';
import { AdminLeadHubPage } from './AdminLeadHubPage';
import type {
  BrandLogoQueryData,
  Lead2026FormValues,
  MeAccountRow,
  UserProfileByAccountData,
} from '../types/lead2026';
import { emptyLeadForm } from '../types/lead2026';
import { friendlyRequestErrorMessage } from '../utils/friendlyRequestError';

type Screen = 'form' | 'thanks';

/**
 * 邀请参数三路并行（与微信登录可同时使用）：
 * 1) OAuth state：微信会把 state 原样带回 ?code&state=，不依赖备案 redirect 是否允许 query（见 appendWechatOAuthStateForInviter）。
 * 2) redirect_uri 带当前 search：回跳后地址栏仍有 ?ref=，便于再 capture。
 * 3) 进入页面后已写入 sessionStorage / localStorage。
 *
 * 若 VITE_ZION_WECHAT_OAUTH_URL 里已有 state=（Zion 自带），不会覆盖 state，此时靠 2)+3)。
 */
function buildWechatLoginUrl(): string {
  const base =
    import.meta.env.VITE_ZION_WECHAT_OAUTH_URL?.trim() ||
    FALLBACK_WECHAT_OAUTH_URL_TEMPLATE;
  const pathAndQuery = `${window.location.pathname}${window.location.search}`;
  const back = encodeURIComponent(
    `${window.location.origin}${pathAndQuery}`
  );

  const refFromQs = new URLSearchParams(window.location.search)
    .get('ref')
    ?.trim();
  const inviterRef =
    refFromQs && /^\d+$/.test(refFromQs)
      ? refFromQs
      : getInviterYonghukuId();

  let url: string;
  if (base.includes('{REDIRECT}')) {
    url = base.replace(/\{REDIRECT\}/g, back);
  } else {
    const sep = base.includes('?') ? '&' : '?';
    url = `${base}${sep}redirect_uri=${back}`;
  }
  return appendWechatOAuthStateForInviter(url, inviterRef);
}

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
  const wechatOAuthConfigured = Boolean(
    import.meta.env.VITE_ZION_WECHAT_OAUTH_URL?.trim()
  );
  const wechatUrl = buildWechatLoginUrl();

  useLayoutEffect(() => {
    captureInviterRefFromUrl();
  }, []);

  const devMockAccountId = import.meta.env.DEV
    ? getDevMockAccountId()
    : null;

  const [loginGateSkipped, setLoginGateSkipped] = useState(() => {
    if (getZionJwt()) return false;
    return getSkipLoginGate();
  });

  useEffect(() => {
    if (!token) return;
    setSkipLoginGate(false);
    setLoginGateSkipped(false);
  }, [token]);

  const guestPreviewMode =
    !token && loginGateSkipped && !devMockAccountId;

  const { data: logoData } = useQuery<BrandLogoQueryData>(BRAND_LOGO_FROM_GLOBAL_DOC, {
    variables: { type: BRAND_LOGO_GLOBAL_DOC_TYPE },
    // 图片 url 常带短期签名，不走缓存；每次进入页面重新请求拿新地址
    fetchPolicy: 'no-cache',
  });
  const brandLogoUrl =
    logoData?.ud_quanjuwendang_d0da48?.[0]?.ud_tupian_3212f2?.url ?? null;

  const {
    data: meData,
    loading: meLoading,
    error: meError,
  } = useQuery<{ account: MeAccountRow[] }>(ME_ACCOUNT, {
    skip: !token || guestPreviewMode,
    fetchPolicy: 'network-only',
  });

  const apiMeRow = meData?.account?.[0];
  const meRow: MeAccountRow | undefined =
    !token && devMockAccountId
      ? { id: devMockAccountId, username: '本地模拟用户' }
      : apiMeRow;

  const viewFillMode = useMemo(
    () => new URLSearchParams(window.location.search).get('view') === 'fill',
    []
  );

  const {
    data: profileData,
    loading: profileLoading,
    error: profileError,
  } = useQuery<UserProfileByAccountData>(USER_PROFILE_BY_ACCOUNT, {
    variables: { accountId: meRow?.id ?? '0' },
    skip: !meRow || guestPreviewMode,
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!meRow || guestPreviewMode) return;
    if (profileLoading) return;
    const rows = profileData?.ud_yonghuxinxi_89e7ab;
    const row = rows?.[0];
    console.info('[问卷收集][调试] 用户库 USER_PROFILE_BY_ACCOUNT', {
      accountId: meRow.id,
      profileError: profileError?.message ?? null,
      rowCount: rows?.length ?? 0,
      userKuId: row?.id ?? null,
      phone: row?.ud_phone_one_dbcfc6 ?? null,
      identity: row?.identity ?? null,
      name: row?.name ?? null,
    });
  }, [
    meRow,
    guestPreviewMode,
    profileLoading,
    profileData,
    profileError,
  ]);

  const [screen, setScreen] = useState<Screen>('form');
  const [form, setForm] = useState<Lead2026FormValues>(emptyLeadForm);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

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
      if (guestPreviewMode) {
        setSubmitErr('当前为跳过登录模式，请先在后台配置微信授权并完成登录后再提交。');
        return;
      }
      if (!meRow) return;
      setSubmitErr(null);
      try {
        await doInsert(v, meRow);
        setScreen('thanks');
      } catch (e) {
        setSubmitErr(friendlyRequestErrorMessage(e));
      }
    },
    [doInsert, guestPreviewMode, meRow]
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

  if (!token && !loginGateSkipped && !devMockAccountId) {
    return (
      <LoginGateScreen
        logoUrl={brandLogoUrl}
        wechatUrl={wechatUrl}
        wechatOAuthConfigured={wechatOAuthConfigured}
        oauthExchangePending={wechatOAuthExchangePending}
        oauthExchangeError={wechatOAuthExchangeError}
        title="请先登录"
        subtitle="填写问卷前需使用微信完成授权登录。登录成功后将自动回到本页并开始填写。"
        onSkip={() => {
          setSkipLoginGate(true);
          setLoginGateSkipped(true);
        }}
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

  if (meRow && !guestPreviewMode && !viewFillMode) {
    if (profileLoading) {
      return (
        <div className="relative z-10 flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <p>正在加载用户身份…</p>
        </div>
      );
    }
    const profileRow = profileData?.ud_yonghuxinxi_89e7ab?.[0];
    const identityFromDb = profileRow?.identity ?? null;
    const staffIdentity: string | null = isStaffIdentity(identityFromDb)
      ? identityFromDb
      : !profileRow
        ? devStaffIdentityWhenProfileMissing(meRow.id)
        : null;

    if (isStaffIdentity(staffIdentity)) {
      return (
        <AdminLeadHubPage
          brandLogoUrl={brandLogoUrl}
          identity={staffIdentity}
          inviterUserLibraryId={
            profileRow?.id != null
              ? String(profileRow.id)
              : devInviterYonghukuIdWhenProfileMissing(meRow.id)
          }
          devUserKuSnapshot={
            import.meta.env.DEV
              ? {
                  accountId: meRow.id,
                  profileErrorMessage: profileError?.message ?? null,
                  profileQueryReturnedRows:
                    profileData?.ud_yonghuxinxi_89e7ab?.length ?? 0,
                  userKuId:
                    profileRow?.id != null ? String(profileRow.id) : null,
                  phone: profileRow?.ud_phone_one_dbcfc6 ?? null,
                  identity: profileRow?.identity ?? null,
                }
              : undefined
          }
          displayName={
            meRow.username?.trim() ||
            profileRow?.name?.trim() ||
            `ID ${meRow.id}`
          }
          onOpenFillForm={() => {
            clearInviterYonghukuId();
            window.location.assign(
              `${window.location.pathname}?view=fill`
            );
          }}
          onLogout={() => {
            clearDevMockAccountId();
            clearZionJwt();
            setSkipLoginGate(false);
            window.location.assign(window.location.pathname);
          }}
        />
      );
    }
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
        {guestPreviewMode ? (
          <>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              您已跳过登录，可先预览并填写表单。配置微信授权并登录后，即可提交并关联帐户。
            </p>
            <div className="mx-auto mt-4 max-w-md rounded-2xl border border-secondary/40 bg-accent/40 px-4 py-3 text-left text-xs text-accent-foreground">
              <p className="font-semibold text-foreground">预览模式</p>
              <p className="mt-1 text-muted-foreground">
                提交按钮已禁用。完成{' '}
                <code className="rounded bg-muted px-1 text-foreground">
                  VITE_ZION_WECHAT_OAUTH_URL
                </code>{' '}
                配置后，请刷新页面并微信登录。
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              <button
                type="button"
                className="underline decoration-border hover:text-foreground"
                onClick={() => {
                  setSkipLoginGate(false);
                  setLoginGateSkipped(false);
                  window.location.reload();
                }}
              >
                返回登录页
              </button>
            </div>
          </>
        ) : (
          <>
            {devMockAccountId && !token ? (
              <div className="mx-auto mt-3 max-w-md rounded-xl border border-secondary/50 bg-accent/50 px-4 py-3 text-left text-xs text-accent-foreground">
                <p className="font-semibold text-foreground">开发模式 · 模拟帐户 ID</p>
                <p className="mt-1 text-muted-foreground">
                  当前未带 JWT，仅前端把问卷关联到 ID{' '}
                  <code className="text-foreground">{devMockAccountId}</code>
                  。提交是否成功取决于 Zion 匿名/权限配置；正式环境请用微信登录。
                </p>
              </div>
            ) : (
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                您已登录，请填写下列信息。提交后将关联到当前帐户。
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              <span>
                帐户：
                <span className="font-medium text-foreground">
                  {meRow?.username?.trim() || (meRow ? `ID ${meRow.id}` : '')}
                </span>
              </span>
              <button
                type="button"
                className="underline decoration-border hover:text-foreground"
                onClick={() => {
                  clearDevMockAccountId();
                  clearZionJwt();
                  setSkipLoginGate(false);
                  window.location.reload();
                }}
              >
                退出并换帐号
              </button>
            </div>
          </>
        )}
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
            disabled={guestPreviewMode}
            className="rounded-full bg-secondary px-10 py-3.5 font-semibold text-secondary-foreground shadow-organic-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guestPreviewMode ? '配置登录后可提交' : '提交问卷'}
          </button>
        </form>
      </article>
    </div>
  );
}

function LoginGateScreen({
  logoUrl,
  wechatUrl,
  wechatOAuthConfigured,
  oauthExchangePending,
  oauthExchangeError,
  title,
  subtitle,
  onSkip,
}: {
  logoUrl: string | null;
  wechatUrl: string;
  wechatOAuthConfigured: boolean;
  oauthExchangePending: boolean;
  oauthExchangeError: string | null;
  title: string;
  subtitle: string;
  onSkip: () => void;
}) {
  const [devMockIdInput, setDevMockIdInput] = useState(
    DEFAULT_DEV_MOCK_ACCOUNT_ID
  );

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
              配置。开发调试仍可用 URL 参数{' '}
              <code className="text-foreground">token</code> /{' '}
              <code className="text-foreground">jwt</code> 传入 JWT。
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
        {import.meta.env.DEV ? (
          <div className="mx-auto mt-5 max-w-sm rounded-xl border border-dashed border-primary/50 bg-muted/40 p-4 text-left text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">本地调试</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>
                公众平台授权回调域名通常<strong>不能</strong>填{' '}
                <code className="text-foreground">localhost</code> / 局域网 IP，本地一般无法完成「微信内一键授权」全流程；不部署时可用下方方式模拟。
              </li>
              <li>
                <strong>模拟登录</strong>：用 Zion 其它途径拿到 JWT 后访问（端口以终端为准）：
                <code className="mt-1 block break-all rounded bg-background/80 px-1 py-0.5 text-[11px] text-foreground">
                  {`${window.location.origin}${window.location.pathname}?token=`}
                  <span className="text-muted-foreground">你的JWT</span>
                </code>
                也支持 <code className="text-foreground">jwt</code>、
                <code className="text-foreground">access_token</code> 及 hash 传参。
              </li>
              <li>
                <strong>只测界面</strong>：点「暂不登录，先进入问卷」。
              </li>
              <li>
                <strong>只测帐户 ID</strong>：用下方输入框填 Zion 的{' '}
                <code className="text-foreground">account.id</code>，不经过 JWT。
              </li>
            </ul>
          </div>
        ) : null}
        {import.meta.env.DEV ? (
          <div className="mx-auto mt-5 w-full max-w-sm text-left">
            <label
              htmlFor="dev-mock-account-id"
              className="block text-xs font-semibold text-foreground"
            >
              模拟帐户 ID
            </label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              仅开发模式；无 JWT 时后端读不到用户库身份，默认 ID{' '}
              {DEFAULT_DEV_MOCK_ACCOUNT_ID} 仍会按管理身份打开管理台；列表/提交是否成功取决于
              Zion 匿名权限。
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <input
                id="dev-mock-account-id"
                type="text"
                autoComplete="off"
                className={inputClass}
                placeholder={DEFAULT_DEV_MOCK_ACCOUNT_ID}
                value={devMockIdInput}
                onChange={(e) => setDevMockIdInput(e.target.value)}
              />
              <button
                type="button"
                className="h-12 shrink-0 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-organic-sm transition hover:opacity-95 sm:self-start"
                onClick={() => {
                  const v = devMockIdInput.trim();
                  if (!v) return;
                  setDevMockAccountId(v);
                  window.location.reload();
                }}
              >
                用此 ID 进入
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-8 flex flex-col items-stretch gap-3 sm:items-center">
          {wechatUrl ? (
            <a
              href={wechatUrl}
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
          ) : null}
          <button
            type="button"
            className="rounded-full border-2 border-secondary bg-transparent px-8 py-3 font-bold text-secondary transition-all duration-300 hover:bg-secondary/10"
            onClick={onSkip}
          >
            暂不登录，先进入问卷
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => window.location.reload()}
          >
            已完成登录？点击刷新
          </button>
        </div>
      </div>
    </div>
  );
}
