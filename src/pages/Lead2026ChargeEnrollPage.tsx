import { useMutation, useQuery } from '@apollo/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildWechatOAuthUrlForWeixinBrowser } from '../auth/wechatLoginUrl';
import {
  clearZionJwt,
  getZionJwt,
  getZionJwtUserId,
} from '../auth/zionJwt';
import { BrandLogoMark } from '../components/BrandLogoMark';
import { BRAND_LOGO_GLOBAL_DOC_TYPE } from '../constants/brand';
import {
  buildWenjuanDingdanInsertInput,
} from '../constants/wenjuanOrderInsert';
import {
  CHARGE_SESSION_BACKGROUND,
  CHARGE_SESSION_COURSE_THEME,
  CHARGE_SESSION_COURSE_TIME,
  CHARGE_SESSION_COURSE_TIME_LABEL,
  CHARGE_SESSION_DEADLINE_LABEL,
  CHARGE_SESSION_GOALS,
  CHARGE_SESSION_ORDER_REMARK,
  CHARGE_SESSION_ORDER_STATUS,
  CHARGE_SESSION_ORDER_TYPE,
  CHARGE_SESSION_PAGE_TITLE,
  CHARGE_SESSION_RULES,
  getChargeEnrollmentDeadlineAtMs,
  isChargeEligibleIdentity,
  isChargeEnrollmentClosed,
} from '../constants/chargeSession2026';
import {
  getCampWechatAdminAccountIds,
  parseCampWechatContactFields,
  validateCampWeixinInput,
  type CampWechatContact,
  type CampWechatFriendStatus,
} from '../constants/campWechatContact';
import {
  BRAND_LOGO_FROM_GLOBAL_DOC,
  CAMP_ADMIN_USER_LIBRARY_IDS,
  GET_CAMP_ID_MATCHES,
  INSERT_WENJUAN_2026_DINGDAN,
  ME_ACCOUNT,
} from '../graphql/operations';
import type { MeAccountRow } from '../types/lead2026';
import type {
  CampAdminUserLibraryIdsData,
  CampIdMatchesQueryData,
} from '../types/camp2026';
import { isWeixinBrowser } from '../payment/weixinBrowser';
import { friendlyRequestErrorMessage } from '../utils/friendlyRequestError';
import { anonGraphqlRequest } from '../utils/anonGraphql';

type Props = {
  wechatOAuthExchangePending?: boolean;
  wechatOAuthExchangeError?: string | null;
};

const inputClass =
  'w-full min-h-12 rounded-full border border-border bg-background/60 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';
const labelClass = 'mb-2 block font-display text-sm font-semibold text-foreground';

/** 报名管理后台账号（老师）：沿用共修营后台账号集合 */
const CHARGE_ADMIN_ACCOUNT_IDS = new Set([
  '1000000000009519',
  '1000000000009106',
  '1000000000009992',
  '10000000000009397',
]);

function isChargeAdminAccount(accountId: string | null | undefined): boolean {
  const normalized = String(accountId ?? '').trim();
  if (!normalized) return false;
  return (
    CHARGE_ADMIN_ACCOUNT_IDS.has(normalized) ||
    getCampWechatAdminAccountIds().has(normalized)
  );
}

type ChargeEnrollmentRow = {
  id: string | number;
  created_at: string | null;
  ud_dingdanbeizhu_439d3a?: string | null;
  ud_yonghuxinxi_yonghuku_55773d?: string | number | null;
  ud_gongzhonghaoid_665d9b?: string | null;
  ud_gongxiuyingweixin_62acc6?: string | null;
  ud_tianjiazhuangtai_a1779b?: string | null;
};

/** 匿名通道：按用户库ID / 公众号ID 查本人的执行充电报名记录 */
const CHARGE_ENROLLMENT_LOOKUP_QUERY = `
  query ChargeEnrollmentLookup($userLibraryId: bigint!, $publicAccountId: String!) {
    ud_dingdan_b6a218(
      where: {
        _and: [
          { ud_dingdanleixing_3fb8b8: { _eq: "${CHARGE_SESSION_ORDER_TYPE}" } }
          {
            _or: [
              { ud_yonghuxinxi_yonghuku_55773d: { _eq: $userLibraryId } }
              { ud_gongzhonghaoid_665d9b: { _eq: $publicAccountId } }
            ]
          }
        ]
      }
      order_by: [{ id: desc }]
      limit: 1
    ) {
      id
      created_at
      ud_yonghuxinxi_yonghuku_55773d
      ud_gongzhonghaoid_665d9b
      ud_gongxiuyingweixin_62acc6
      ud_tianjiazhuangtai_a1779b
    }
  }
`;

/** 匿名通道：报名管理后台拉取全部执行充电报名 */
const CHARGE_ADMIN_ENROLLMENTS_QUERY = `
  query ChargeAdminEnrollments {
    ud_dingdan_b6a218(
      where: { ud_dingdanleixing_3fb8b8: { _eq: "${CHARGE_SESSION_ORDER_TYPE}" } }
      order_by: [{ id: desc }]
      limit: 500
    ) {
      id
      created_at
      ud_dingdanbeizhu_439d3a
      ud_yonghuxinxi_yonghuku_55773d
      ud_gongzhonghaoid_665d9b
      ud_gongxiuyingweixin_62acc6
      ud_tianjiazhuangtai_a1779b
    }
  }
`;

/** 匿名通道：更新订单上的微信号与进群状态 */
const CHARGE_SET_FRIEND_STATUS_MUTATION = `
  mutation ChargeSetFriendStatus($orderId: bigint!, $weixin: String!, $status: String!) {
    update_ud_dingdan_b6a218_by_pk(
      pk_columns: { id: $orderId }
      _set: {
        ud_gongxiuyingweixin_62acc6: $weixin
        ud_tianjiazhuangtai_a1779b: $status
      }
    ) {
      id
      ud_gongxiuyingweixin_62acc6
      ud_tianjiazhuangtai_a1779b
    }
  }
`;

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

function LoginGateScreen({
  logoUrl,
  loginAccountId,
  inWeChatBrowser,
  wechatUrlMobile,
  wechatOAuthConfigured,
  oauthExchangePending,
  oauthExchangeError,
}: {
  logoUrl: string | null;
  loginAccountId: string | null;
  inWeChatBrowser: boolean;
  wechatUrlMobile: string;
  wechatOAuthConfigured: boolean;
  oauthExchangePending: boolean;
  oauthExchangeError: string | null;
}) {
  const [linkCopied, setLinkCopied] = useState(false);

  return (
    <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-[2rem] border border-border bg-card p-8 text-center shadow-organic md:p-10">
        <BrandLogoMark url={logoUrl} title="执行充电·线上共学" className="mb-4" />
        <h1 className="mt-1 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text font-display text-4xl font-extrabold tracking-[0.08em] text-transparent md:text-5xl">
          天启无书
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-base font-medium text-foreground leading-relaxed">
          执行充电·线上共学（免费）
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground leading-relaxed">
          本课程仅限已建档家长参与。请先完成微信授权登录，进入报名流程。
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
          </p>
        ) : null}

        {!wechatOAuthConfigured ? (
          <p className="mx-auto mt-6 rounded-2xl border border-secondary/40 bg-accent/40 p-4 text-left text-xs text-accent-foreground">
            当前未配置微信 OAuth 入口，请联系管理员检查构建环境变量。
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
                    oauthExchangePending ? 'pointer-events-none cursor-wait opacity-60' : 'hover:opacity-95'
                  }`}
                >
                  {oauthExchangePending ? '登录处理中…' : '微信一键授权登录'}
                </a>
              ) : (
                <>
                  <div
                    className="max-w-sm rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-left text-xs text-accent-foreground leading-relaxed"
                    role="alert"
                  >
                    <p className="font-semibold text-destructive">请在微信内打开此链接</p>
                    <p className="mt-1 text-muted-foreground">
                      当前不在微信环境，已禁用登录入口。请把当前页面链接发送到微信聊天后再打开。
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-primary bg-transparent px-8 py-3 text-sm font-bold text-primary transition duration-300 ease-out hover:bg-primary/10"
                    onClick={() => {
                      void navigator.clipboard.writeText(window.location.href).then(() => {
                        setLinkCopied(true);
                        window.setTimeout(() => setLinkCopied(false), 2500);
                      });
                    }}
                  >
                    {linkCopied ? '已复制当前链接' : '复制当前链接到微信打开'}
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

function CourseIntroCard() {
  return (
    <section className="mb-7 rounded-[1.75rem] border border-border bg-card p-5 shadow-organic-sm md:p-7">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-secondary">
        线上共学 · 免费
      </p>
      <h2 className="mt-3 font-display text-2xl leading-snug text-foreground md:text-3xl">
        {CHARGE_SESSION_COURSE_THEME}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
        {CHARGE_SESSION_BACKGROUND}
      </p>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
          <p className="text-xs font-semibold text-secondary">课程时间</p>
          <p className="mt-1 font-display text-base text-foreground">
            {CHARGE_SESSION_COURSE_TIME_LABEL}
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
          <p className="text-xs font-semibold text-secondary">课程费用</p>
          <p className="mt-1 font-display text-base text-primary">免费（学员专享）</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="font-display text-sm font-semibold text-foreground">本次共修目标</p>
        <ul className="mt-2 grid gap-2">
          {CHARGE_SESSION_GOALS.map((goal) => (
            <li
              key={goal}
              className="flex items-start gap-2.5 rounded-[1.25rem] border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm leading-snug text-foreground"
            >
              <span className="mt-0.5 text-base" aria-hidden>
                ✓
              </span>
              <span>{goal}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 rounded-2xl border border-secondary/30 bg-secondary/5 p-4 text-sm leading-relaxed text-accent-foreground">
        <p className="font-semibold text-secondary">参与规则</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          {CHARGE_SESSION_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <p className="mt-3 text-muted-foreground">
          会议链接将于 9月4日 当天下午发送至群内，请提前预留时间，准时进入腾讯会议室。
        </p>
      </div>
    </section>
  );
}

export function Lead2026ChargeEnrollPage({
  wechatOAuthExchangePending = false,
  wechatOAuthExchangeError = null,
}: Props = {}) {
  const token = getZionJwt();
  const jwtAccountId = getZionJwtUserId();
  const wechatOAuthConfigured = Boolean(
    import.meta.env.VITE_ZION_WECHAT_OAUTH_URL?.trim()
  );
  const inWeChatBrowser = isWeixinBrowser();
  const wechatUrlMobile = buildWechatOAuthUrlForWeixinBrowser();

  const [enrollGateNowMs, setEnrollGateNowMs] = useState(() => Date.now());
  const chargeEnrollClosed = isChargeEnrollmentClosed(enrollGateNowMs);
  const chargeDeadlineMs = useMemo(() => getChargeEnrollmentDeadlineAtMs(), []);

  useEffect(() => {
    document.title = CHARGE_SESSION_PAGE_TITLE;
  }, []);

  useEffect(() => {
    if (enrollGateNowMs >= chargeDeadlineMs) return;
    const delay = chargeDeadlineMs - Date.now() + 500;
    const timer = window.setTimeout(() => setEnrollGateNowMs(Date.now()), delay);
    const interval = window.setInterval(() => setEnrollGateNowMs(Date.now()), 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [chargeDeadlineMs, enrollGateNowMs]);

  const [miniProgramUserId, setMiniProgramUserId] = useState('');
  const miniProgramIdValid = useMemo(
    () => /^\d{5,6}$/.test(miniProgramUserId.trim()),
    [miniProgramUserId]
  );

  const [weixinInput, setWeixinInput] = useState('');
  const weixinInputError = useMemo(
    () => validateCampWeixinInput(weixinInput),
    [weixinInput]
  );

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [enrollmentRecord, setEnrollmentRecord] =
    useState<ChargeEnrollmentRow | null>(null);

  const [adminRows, setAdminRows] = useState<ChargeEnrollmentRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSearchInput, setAdminSearchInput] = useState('');
  const [togglingOrderId, setTogglingOrderId] = useState<string | null>(null);
  const [adminDrafts, setAdminDrafts] = useState<Record<string, string>>({});

  const { data: logoData } = useQuery(BRAND_LOGO_FROM_GLOBAL_DOC, {
    variables: { type: BRAND_LOGO_GLOBAL_DOC_TYPE },
    fetchPolicy: 'no-cache',
  });
  const brandLogoUrl =
    logoData?.ud_quanjuwendang_d0da48?.[0]?.ud_tupian_3212f2?.url ?? null;

  const { data: meData, loading: meLoading, error: meError } = useQuery<{
    account: MeAccountRow[];
  }>(ME_ACCOUNT, {
    variables: { accountId: jwtAccountId ?? '0' },
    skip: !token || !jwtAccountId,
    fetchPolicy: 'network-only',
  });

  const meRow = meData?.account?.[0];
  const loginAccountId = jwtAccountId ?? meRow?.id ?? '';
  const isChargeAdmin = isChargeAdminAccount(loginAccountId);

  const {
    data: campIdMatchesData,
    loading: miniUserLoading,
    error: miniUserError,
  } = useQuery<CampIdMatchesQueryData>(GET_CAMP_ID_MATCHES, {
    variables: { campUserId: miniProgramIdValid ? miniProgramUserId.trim() : '' },
    skip: !token || !miniProgramIdValid,
    fetchPolicy: 'network-only',
  });

  const miniRow = campIdMatchesData?.ud_yonghuxinxi_89e7ab?.[0] ?? null;
  const publicStudentRow =
    campIdMatchesData?.ud_gongzhonghaoxueyuanbaimingdan_9a7b8b?.[0] ?? null;
  const miniIdentity = miniRow?.identity ?? null;
  const publicStudentFound = Boolean(publicStudentRow);
  const miniFound = Boolean(miniRow);
  const matchedForCharge = miniFound || publicStudentFound;
  const chargeEligible = isChargeEligibleIdentity(miniIdentity, publicStudentFound);

  const lookupKey = miniProgramIdValid
    ? `${miniRow ? String(miniRow.id) : ''}|${publicStudentFound ? miniProgramUserId.trim() : ''}`
    : '';

  /** 匿名通道：查本人是否已报名（订单表对登录用户有行级过滤，匿名反而可读） */
  const lookupEnrollment = useCallback(async (): Promise<ChargeEnrollmentRow | null> => {
    const userLibraryId = miniRow ? Number(miniRow.id) : -1;
    const publicAccountId = publicStudentFound ? miniProgramUserId.trim() : '';
    const data = await anonGraphqlRequest<{
      ud_dingdan_b6a218: ChargeEnrollmentRow[];
    }>(CHARGE_ENROLLMENT_LOOKUP_QUERY, {
      userLibraryId,
      publicAccountId,
    });
    return data.ud_dingdan_b6a218?.[0] ?? null;
  }, [miniProgramUserId, miniRow, publicStudentFound]);

  useEffect(() => {
    if (!token || !miniProgramIdValid || !matchedForCharge || !chargeEligible) {
      return;
    }
    let cancelled = false;
    setLookupBusy(true);
    setLookupError(null);
    lookupEnrollment()
      .then((row) => {
        if (!cancelled) setEnrollmentRecord(row);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLookupError(friendlyRequestErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLookupBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey, chargeEligible, matchedForCharge, miniProgramIdValid, token]);

  const [insertDingdan] = useMutation(INSERT_WENJUAN_2026_DINGDAN);

  const submitChargeEnrollment = useCallback(async () => {
    setSubmitError(null);
    const weixin = weixinInput.trim();
    const inputErr = validateCampWeixinInput(weixin);
    if (inputErr) {
      setSubmitError(inputErr);
      return;
    }
    if (!matchedForCharge) {
      setSubmitError('请先输入正确的用户 ID，系统确认学员身份后才能报名。');
      return;
    }
    const confirmed = window.confirm(
      `请确认微信号是否正确：\n\n${weixin}\n\n老师将按此微信号添加您进群。确认无误后提交报名。`
    );
    if (!confirmed) return;

    setSubmitBusy(true);
    try {
      // 官方统一链接：报名单不携带任何专员邀请 ID
      const insertObject = buildWenjuanDingdanInsertInput(
        CHARGE_SESSION_ORDER_TYPE,
        0,
        null,
        miniRow ? String(miniRow.id) : null,
        CHARGE_SESSION_ORDER_REMARK
      );
      insertObject.ud_dingdanleixing_3ade69 = CHARGE_SESSION_ORDER_STATUS;
      insertObject.ud_gongxiuyingweixin_62acc6 = weixin;
      insertObject.ud_tianjiazhuangtai_a1779b = '未进群';
      if (publicStudentFound && !miniRow) {
        insertObject.ud_gongzhonghaoid_665d9b = miniProgramUserId.trim();
      }

      const res = await insertDingdan({ variables: { object: insertObject } });
      if (res.errors?.length) {
        throw new Error(res.errors.map((e) => e.message).join('；'));
      }
      const inserted = res.data?.insert_ud_dingdan_b6a218_one;
      const orderId = inserted?.id;
      if (orderId === null || orderId === undefined) {
        throw new Error('报名单已提交但未返回记录 ID。');
      }
      if (String(inserted?.ud_gongxiuyingweixin_62acc6 ?? '').trim() !== weixin) {
        throw new Error('报名单已创建，但微信号未写入，请联系老师处理。');
      }

      const fresh = await lookupEnrollment();
      if (fresh) {
        setEnrollmentRecord(fresh);
      } else {
        setEnrollmentRecord({
          id: orderId,
          created_at: new Date().toISOString(),
          ud_yonghuxinxi_yonghuku_55773d: miniRow ? String(miniRow.id) : null,
          ud_gongzhonghaoid_665d9b:
            publicStudentFound && !miniRow ? miniProgramUserId.trim() : null,
          ud_gongxiuyingweixin_62acc6: weixin,
          ud_tianjiazhuangtai_a1779b: '未进群',
        });
      }
    } catch (e: unknown) {
      setSubmitError(friendlyRequestErrorMessage(e));
    } finally {
      setSubmitBusy(false);
    }
  }, [
    insertDingdan,
    lookupEnrollment,
    matchedForCharge,
    miniProgramUserId,
    miniRow,
    publicStudentFound,
    weixinInput,
  ]);

  /* ---------------- 管理后台（老师） ---------------- */

  const fetchAdminRows = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const data = await anonGraphqlRequest<{
        ud_dingdan_b6a218: ChargeEnrollmentRow[];
      }>(CHARGE_ADMIN_ENROLLMENTS_QUERY);
      setAdminRows(data.ud_dingdan_b6a218 ?? []);
    } catch (e: unknown) {
      setAdminError(friendlyRequestErrorMessage(e));
    } finally {
      setAdminLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isChargeAdmin) void fetchAdminRows();
  }, [fetchAdminRows, isChargeAdmin]);

  const adminUserLibraryIds = useMemo(() => {
    const ids = new Set<string>();
    adminRows.forEach((row) => {
      const raw = row.ud_yonghuxinxi_yonghuku_55773d;
      const id = raw === null || raw === undefined ? '' : String(raw).trim();
      if (/^\d+$/.test(id)) ids.add(id);
    });
    return Array.from(ids);
  }, [adminRows]);

  const { data: adminUserLibraryMapData } = useQuery<CampAdminUserLibraryIdsData>(
    CAMP_ADMIN_USER_LIBRARY_IDS,
    {
      variables: { userLibraryIds: adminUserLibraryIds },
      skip: !isChargeAdmin || adminUserLibraryIds.length === 0,
      fetchPolicy: 'network-only',
    }
  );

  const userLibraryIdToMiniId = useMemo(() => {
    const map = new Map<string, string>();
    const rows = adminUserLibraryMapData?.ud_yonghuxinxi_89e7ab ?? [];
    rows.forEach((row) => {
      const key = String(row.id);
      const value = String(row.ud_id002fchaxun_fb7c4b ?? '').trim();
      if (key && value) map.set(key, value);
    });
    return map;
  }, [adminUserLibraryMapData]);

  const filteredAdminRows = useMemo(() => {
    const keyword = adminSearchInput.trim();
    if (!keyword) return adminRows;
    return adminRows.filter((row) => {
      const userLibraryId = String(
        row.ud_yonghuxinxi_yonghuku_55773d ?? ''
      ).trim();
      const miniId =
        userLibraryIdToMiniId.get(userLibraryId) ??
        String(row.ud_gongzhonghaoid_665d9b ?? '').trim();
      const contact = parseCampWechatContactFields(
        row.ud_gongxiuyingweixin_62acc6,
        row.ud_tianjiazhuangtai_a1779b
      );
      return (
        miniId.includes(keyword) || (contact?.weixin ?? '').includes(keyword)
      );
    });
  }, [adminRows, adminSearchInput, userLibraryIdToMiniId]);

  const updateOrderFriendStatus = useCallback(
    async (orderId: string, weixin: string, nextStatus: CampWechatFriendStatus) => {
      if (!/^\d+$/.test(orderId)) return;
      setTogglingOrderId(orderId);
      try {
        const data = await anonGraphqlRequest<{
          update_ud_dingdan_b6a218_by_pk: {
            id: string | number;
            ud_gongxiuyingweixin_62acc6: string | null;
            ud_tianjiazhuangtai_a1779b: string | null;
          } | null;
        }>(CHARGE_SET_FRIEND_STATUS_MUTATION, {
          orderId: Number(orderId),
          weixin,
          status: nextStatus,
        });
        const updated = data.update_ud_dingdan_b6a218_by_pk;
        if (!updated || updated.ud_tianjiazhuangtai_a1779b !== nextStatus) {
          throw new Error('后端没有确认更新进群状态，请稍后再试。');
        }
        await fetchAdminRows();
      } catch (e: unknown) {
        window.alert(friendlyRequestErrorMessage(e));
      } finally {
        setTogglingOrderId(null);
      }
    },
    [fetchAdminRows]
  );

  const saveOrderWeixinFromAdmin = useCallback(
    async (orderId: string) => {
      if (!/^\d+$/.test(orderId)) return;
      const draft = String(adminDrafts[orderId] ?? '').trim();
      const inputErr = validateCampWeixinInput(draft);
      if (inputErr) {
        window.alert(inputErr);
        return;
      }
      setTogglingOrderId(orderId);
      try {
        const data = await anonGraphqlRequest<{
          update_ud_dingdan_b6a218_by_pk: {
            id: string | number;
            ud_gongxiuyingweixin_62acc6: string | null;
            ud_tianjiazhuangtai_a1779b: string | null;
          } | null;
        }>(CHARGE_SET_FRIEND_STATUS_MUTATION, {
          orderId: Number(orderId),
          weixin: draft,
          status: '未进群',
        });
        const updated = data.update_ud_dingdan_b6a218_by_pk;
        if (!updated || String(updated.ud_gongxiuyingweixin_62acc6 ?? '').trim() !== draft) {
          throw new Error('后端没有确认写入微信号，请稍后再试。');
        }
        setAdminDrafts((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
        await fetchAdminRows();
      } catch (e: unknown) {
        window.alert(friendlyRequestErrorMessage(e));
      } finally {
        setTogglingOrderId(null);
      }
    },
    [adminDrafts, fetchAdminRows]
  );

  /* ---------------- 渲染分支 ---------------- */

  if (!token) {
    return (
      <LoginGateScreen
        logoUrl={brandLogoUrl}
        loginAccountId={jwtAccountId}
        inWeChatBrowser={inWeChatBrowser}
        wechatUrlMobile={wechatUrlMobile}
        wechatOAuthConfigured={wechatOAuthConfigured}
        oauthExchangePending={wechatOAuthExchangePending}
        oauthExchangeError={wechatOAuthExchangeError}
      />
    );
  }

  if (meLoading) {
    return (
      <div className="relative z-10 flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>正在确认登录状态…</p>
      </div>
    );
  }

  if (meError || !meRow) {
    return (
      <div className="relative z-10 mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-[2rem] border border-border bg-card p-8 shadow-organic-sm">
          <h2 className="font-display text-xl text-destructive">登录状态无效</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {meError ? friendlyRequestErrorMessage(meError) : '无法获取当前帐户，请重新授权登录。'}
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

  if (isChargeAdmin) {
    const totalCount = adminRows.length;
    const joinedCount = adminRows.filter((row) => {
      const contact = parseCampWechatContactFields(
        row.ud_gongxiuyingweixin_62acc6,
        row.ud_tianjiazhuangtai_a1779b
      );
      return contact?.friend_status === '已进群';
    }).length;
    const pendingCount = totalCount - joinedCount;

    return (
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 md:py-14">
        <header className="mb-8 text-center">
          <BrandLogoMark
            url={brandLogoUrl}
            title="执行充电共学 · 报名管理"
            isPrimaryPageHeading
            className="mb-5"
          />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            执行充电·线上共学（{CHARGE_SESSION_COURSE_TIME}）报名名单：展示用户库ID/公众号ID与微信号，老师添加微信后标记「已进群」。
          </p>
          <LoginAccountIdHint accountId={jwtAccountId ?? meRow?.id ?? null} />
        </header>

        <section
          aria-label="报名数量统计"
          className="mb-6 grid gap-3 sm:grid-cols-3"
        >
          <div className="rounded-[1.75rem] border border-primary/30 bg-primary/10 p-5 shadow-organic-sm md:p-6">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
              报名总人数
            </p>
            <p className="mt-2 font-display text-4xl font-extrabold text-primary md:text-5xl">
              {totalCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              已确认的报名单数（含已进群 / 未进群）
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-primary/30 bg-primary/5 p-5 shadow-organic-sm md:p-6">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
              已进群
            </p>
            <p className="mt-2 font-display text-4xl font-extrabold text-primary md:text-5xl">
              {joinedCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              老师已添加微信并拉入共学群
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-secondary/30 bg-secondary/10 p-5 shadow-organic-sm md:p-6">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
              待进群
            </p>
            <p className="mt-2 font-display text-4xl font-extrabold text-secondary md:text-5xl">
              {pendingCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              等待老师按微信号添加
            </p>
          </div>
        </section>

        <section className="mb-6 rounded-[2rem] border border-border bg-card p-5 shadow-organic-sm md:p-6">
          <label className={labelClass} htmlFor="charge-admin-search">
            搜索用户库ID / 公众号ID / 微信号（模糊匹配）
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="charge-admin-search"
              className={inputClass}
              value={adminSearchInput}
              onChange={(e) => setAdminSearchInput(e.target.value)}
              placeholder="输入用户ID或微信号关键字"
              autoComplete="off"
            />
            <button
              type="button"
              className="min-h-12 rounded-full border border-border px-6 py-3 text-sm text-muted-foreground transition hover:bg-muted/50"
              onClick={() => void fetchAdminRows()}
            >
              刷新列表
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            当前结果：{filteredAdminRows.length} 条（全部报名（本次已加载）{adminRows.length} 条）
          </p>
        </section>

        <section className="rounded-[2rem] border border-border bg-card p-4 shadow-organic-sm md:p-6">
          {adminLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">正在加载报名名单…</p>
          ) : null}

          {adminError ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-accent-foreground">
              读取失败：{adminError}
            </p>
          ) : null}

          {!adminLoading && !adminError && filteredAdminRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无报名记录。
            </p>
          ) : null}

          {!adminLoading && !adminError && filteredAdminRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium whitespace-nowrap">用户库ID / 公众号ID</th>
                    <th className="min-w-[88px] px-3 py-2 font-medium">微信号</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">进群状态</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">操作</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">报名时间</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdminRows.map((row) => {
                    const userLibraryId = String(
                      row.ud_yonghuxinxi_yonghuku_55773d ?? ''
                    ).trim();
                    const miniId =
                      userLibraryIdToMiniId.get(userLibraryId) ||
                      String(row.ud_gongzhonghaoid_665d9b ?? '').trim() ||
                      '—';
                    const contact = parseCampWechatContactFields(
                      row.ud_gongxiuyingweixin_62acc6,
                      row.ud_tianjiazhuangtai_a1779b
                    ) as CampWechatContact | null;
                    const orderId = String(row.id);
                    const isInGroup = contact?.friend_status === '已进群';
                    const busyThis = togglingOrderId === orderId;
                    const draftWeixin = adminDrafts[orderId] ?? '';
                    const nextStatus: CampWechatFriendStatus = isInGroup
                      ? '未进群'
                      : '已进群';
                    const toggleLabel = isInGroup
                      ? '撤销 → 改为「未进群」'
                      : '标记为「已进群」';
                    return (
                      <tr
                        key={orderId}
                        className="rounded-2xl border border-border/70 bg-background/60 text-foreground"
                      >
                        <td className="px-3 py-3 font-mono whitespace-nowrap">{miniId}</td>
                        <td className="max-w-[140px] px-3 py-3 break-all">
                          {contact?.weixin ? (
                            contact.weixin
                          ) : (
                            <div className="min-w-[150px] space-y-2">
                              <input
                                className="h-10 w-full rounded-full border border-border bg-white/50 px-3 text-xs text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/30"
                                value={draftWeixin}
                                onChange={(e) =>
                                  setAdminDrafts((prev) => ({
                                    ...prev,
                                    [orderId]: e.target.value,
                                  }))
                                }
                                placeholder="补填微信号"
                                autoComplete="off"
                                aria-label="补填微信号"
                                disabled={busyThis}
                              />
                              <button
                                type="button"
                                disabled={busyThis || Boolean(validateCampWeixinInput(draftWeixin))}
                                className="min-h-10 rounded-full bg-secondary px-4 py-2 text-xs font-semibold text-secondary-foreground transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => void saveOrderWeixinFromAdmin(orderId)}
                              >
                                保存微信号
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                              isInGroup
                                ? 'border border-primary/30 bg-primary/15 text-primary'
                                : 'border border-secondary/30 bg-secondary/10 text-secondary'
                            }`}
                          >
                            {isInGroup ? '✓ 已进群' : '○ 未进群'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            disabled={busyThis || !contact?.weixin}
                            className={`min-h-10 rounded-full px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              isInGroup
                                ? 'border border-border bg-background text-muted-foreground hover:bg-muted/50'
                                : 'bg-primary text-primary-foreground shadow-organic-sm hover:scale-105'
                            }`}
                            onClick={() => {
                              if (contact?.weixin) {
                                void updateOrderFriendStatus(
                                  orderId,
                                  contact.weixin,
                                  nextStatus
                                );
                              }
                            }}
                          >
                            {busyThis ? '处理中…' : toggleLabel}
                          </button>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs">
                          {row.created_at
                            ? new Date(row.created_at).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  if (chargeEnrollClosed) {
    return (
      <div className="relative z-10 mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-[2rem] border border-border bg-card p-10 shadow-organic">
          <BrandLogoMark
            url={brandLogoUrl}
            title="执行充电·线上共学"
            isPrimaryPageHeading
            className="mb-5"
          />
          <h2 className="font-display text-3xl text-foreground md:text-4xl">
            本期报名已结束
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-foreground/85 md:text-base">
            执行充电·线上共学报名已于 {CHARGE_SESSION_DEADLINE_LABEL} 截止（{CHARGE_SESSION_COURSE_TIME}
            开课）。请关注群内后续活动通知。
          </p>
        </div>
      </div>
    );
  }

  if (enrollmentRecord) {
    const contact = parseCampWechatContactFields(
      enrollmentRecord.ud_gongxiuyingweixin_62acc6,
      enrollmentRecord.ud_tianjiazhuangtai_a1779b
    );
    return (
      <div className="relative z-10 mx-auto max-w-2xl px-4 py-10 md:py-14">
        <header className="mb-10 text-center">
          <BrandLogoMark
            url={brandLogoUrl}
            title="执行充电·线上共学"
            isPrimaryPageHeading
            className="mb-5"
          />
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
          <p className="text-4xl" aria-hidden>
            ✓
          </p>
          <h2 className="mt-4 font-display text-3xl text-foreground">报名成功</h2>
          <p className="mt-3 text-muted-foreground">
            课程时间：
            <span className="font-semibold text-foreground">
              {CHARGE_SESSION_COURSE_TIME}
            </span>
          </p>
          {contact?.weixin ? (
            <p className="mt-2 text-muted-foreground">
              您确认的微信号：
              <span className="ml-1 font-mono font-semibold text-foreground">
                {contact.weixin}
              </span>
            </p>
          ) : null}

          {contact?.weixin ? (
            <p
              className={
                contact.friend_status === '已进群'
                  ? 'mt-5 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-primary'
                  : 'mt-5 rounded-2xl border border-border/70 bg-background/60 px-4 py-3 text-muted-foreground'
              }
            >
              {contact.friend_status === '已进群'
                ? '老师已将您拉入共学群，请留意微信群消息。'
                : '老师将通过此微信号添加您并邀请进群，请耐心等待。'}
            </p>
          ) : null}

          <section className="mt-7 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground/90">课程提醒</p>
            <p className="mt-2">
              会议链接将于 9月4日 当天下午发送至群内，请提前预留时间，准时进入腾讯会议室。
              迟到 15 分钟将无法进入当期课堂；报名后请全程参与。
            </p>
          </section>
        </article>
      </div>
    );
  }

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 md:py-14">
      <header className="mb-10 text-center">
        <BrandLogoMark
          url={brandLogoUrl}
          title="执行充电·线上共学"
          isPrimaryPageHeading
          className="mb-5"
        />
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
          本课程免费，仅限已建档家长参与。请输入你的用户 ID，系统确认学员身份后即可报名。
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
              clearZionJwt();
              window.location.reload();
            }}
          >
            退出并换帐号
          </button>
        </div>
        <LoginAccountIdHint accountId={jwtAccountId ?? meRow?.id ?? null} />
      </header>

      <CourseIntroCard />

      <article className="rounded-tl-[1.75rem] rounded-tr-[1.25rem] rounded-br-[2rem] rounded-bl-[1.35rem] border border-border bg-card p-5 shadow-organic-sm md:p-8">
        <section className="rounded-2xl border border-border/70 bg-muted/30 p-4 md:p-5">
          <h2 className="font-display text-lg text-primary">1）填写用户 ID 与微信号</h2>

          <div className="mt-4 grid gap-5">
            <div>
              <label className={labelClass} htmlFor="charge-user-id">
                用户ID（5位或6位数字）
              </label>
              <input
                id="charge-user-id"
                className={inputClass}
                value={miniProgramUserId}
                onChange={(e) => setMiniProgramUserId(e.target.value)}
                placeholder="例如 12345 或 123456"
                inputMode="numeric"
                autoComplete="off"
                aria-label="用户ID"
              />
              {miniProgramUserId.trim().length > 0 && !miniProgramIdValid ? (
                <p className="mt-2 text-sm text-destructive">
                  请输入 5 位或 6 位纯数字的用户ID。
                </p>
              ) : null}
            </div>

            <div>
              <label className={labelClass} htmlFor="charge-enroll-weixin">
                微信号
              </label>
              <input
                id="charge-enroll-weixin"
                className={inputClass}
                value={weixinInput}
                onChange={(e) => setWeixinInput(e.target.value)}
                placeholder="与微信「微信号」一致，便于老师添加"
                autoComplete="off"
                aria-label="微信号"
              />
              {weixinInput.trim().length > 0 && weixinInputError ? (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {weixinInputError}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  报名后由进群小助手按此微信号添加您进群。
                </p>
              )}
            </div>
          </div>

          {miniUserError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              身份查询失败：{friendlyRequestErrorMessage(miniUserError)}
            </p>
          ) : null}

          {miniUserLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">正在查询用户身份…</p>
          ) : null}

          {!miniUserLoading && miniProgramIdValid && !miniUserError ? (
            <div className="mt-4 rounded-2xl border border-border/60 bg-background/60 p-3.5 text-sm text-foreground/90">
              <p>
                身份：<span className="font-semibold">{miniIdentity || (publicStudentFound ? '公众号学员名单' : '未找到')}</span>
              </p>
              {matchedForCharge ? (
                <p className="mt-1">
                  {chargeEligible ? (
                    <>
                      学员身份确认，<span className="font-semibold text-primary">免费报名</span>
                      （报名截止 {CHARGE_SESSION_DEADLINE_LABEL}）。
                    </>
                  ) : (
                    <span className="text-destructive">
                      本次共学仅限已建档家长参与，您当前身份不符合参与条件。
                    </span>
                  )}
                </p>
              ) : (
                <p className="mt-1 text-destructive">
                  未找到该 ID 对应的用户库或公众号学员名单记录，请确认输入后重试。
                </p>
              )}
            </div>
          ) : null}

          {lookupError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              报名状态查询失败：{lookupError}
            </p>
          ) : null}

          {lookupBusy ? (
            <p className="mt-3 text-sm text-muted-foreground">正在查询报名状态…</p>
          ) : null}
        </section>

        <section className="mt-5 rounded-2xl border border-border/70 bg-muted/20 p-4 md:p-5">
          <h2 className="font-display text-lg text-primary">2）提交报名（免费）</h2>
          {!miniProgramIdValid ? (
            <p className="mt-3 text-sm text-muted-foreground">
              请先输入 5 位或 6 位数字的用户 ID。
            </p>
          ) : weixinInputError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {weixinInputError}
            </p>
          ) : miniUserLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">正在确认学员身份…</p>
          ) : !matchedForCharge ? (
            <p className="mt-3 text-sm text-destructive">
              未找到该 ID 对应的学员记录，无法报名。请确认 ID 是否正确。
            </p>
          ) : !chargeEligible ? (
            <p className="mt-3 text-sm text-destructive">
              本课程仅限已建档家长参与。如对身份判定有疑问，请联系老师核实。
            </p>
          ) : (
            <button
              type="button"
              disabled={submitBusy || lookupBusy}
              className="mt-4 min-h-12 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground shadow-organic-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void submitChargeEnrollment()}
            >
              {submitBusy ? '提交中…' : '提交免费报名'}
            </button>
          )}

          {submitError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
        </section>
      </article>
    </div>
  );
}
