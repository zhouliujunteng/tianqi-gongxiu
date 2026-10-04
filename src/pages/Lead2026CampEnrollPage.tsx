import {
  useApolloClient,
  useMutation,
  useQuery,
} from '@apollo/client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  captureInviterRefFromUrl,
  clearInviterYonghukuId,
} from '../auth/inviterRef';
import { buildWechatOAuthUrlForWeixinBrowser } from '../auth/wechatLoginUrl';
import {
  clearZionJwt,
  getZionJwt,
  getZionJwtUserId,
} from '../auth/zionJwt';
import { BrandLogoMark } from '../components/BrandLogoMark';
import { CampIntroShowcase } from '../components/CampIntroShowcase';
import { WenjuanCampWechatPayCard } from '../components/WenjuanCampWechatPayCard';
import { BRAND_LOGO_GLOBAL_DOC_TYPE } from '../constants/brand';
import {
  canBypassCampEnrollmentDeadline,
  getCampDisplayPhaseLabel,
  getCampPayDescription,
  getCampPayDescriptionAliases,
  getCampPhaseFromLocation,
  getCampEnrollmentDeadlineAtMs,
  getCampSchedule,
  isCampEnrollmentClosed,
  isCampOrderRemarkForPhase,
  isCampParticipationFeeNonRefundable,
  isKnownCampPhase,
  type CampPhase,
} from '../constants/camp2026';
import {
  buildCampWechatContact,
  getCampWechatAdminAccountIds,
  isCampWechatEnrollFlow,
  parseCampWechatContactFields,
  validateCampWeixinInput,
  type CampWechatFriendStatus,
} from '../constants/campWechatContact';
import { WENJUAN_CAMP_ORDER_TYPE } from '../constants/lead2026';
import {
  isWenjuanPayManualClientConfirmAllowed,
  isWenjuanWechatPayEnabled,
  WENJUAN_CAMP_PAY_OK_STORAGE_KEY,
  WENJUAN_CAMP_WXPAY_H5_PENDING_KEY,
  WENJUAN_PAY_WEBHOOK_RETRY_WAIT_MS,
  WENJUAN_PAY_WEBHOOK_WAIT_MS,
} from '../constants/wenjuanPayment';
import {
  BRAND_LOGO_FROM_GLOBAL_DOC,
  CAMP_ADMIN_USER_LIBRARY_IDS,
  CAMP_ADMIN_PAID_USERS,
  GET_CAMP_SERVICE_QR,
  GET_CAMP_ID_MATCHES,
  GET_IMAGE_UPLOAD_URL,
  ME_ACCOUNT,
  MY_CAMP_ENROLLMENT_STATUS,
  INSERT_CAMP_CHECKIN,
  PATCH_CAMP_ORDER_WECHAT_CONTACT,
  WENJUAN_PAY_ELIGIBILITY,
} from '../graphql/operations';
import type { MeAccountRow, WenjuanPayEligibilityData } from '../types/lead2026';
import type {
  CampAdminPaidUsersData,
  CampAdminUserLibraryIdsData,
  CampIdMatchesQueryData,
  CampEnrollmentStatusData,
  CampServiceQrQueryData,
  GetImageUploadUrlData,
} from '../types/camp2026';
import { friendlyRequestErrorMessage } from '../utils/friendlyRequestError';
import { extractWechatOpenId } from '../payment/selfPay';
import {
  fetchAdminSelfPaidOrders,
  useAdminSelfPaidOrders,
  type AdminSelfPaidRow,
} from '../payment/useAdminSelfPaidOrders';
import { useSelfPayPaid } from '../payment/useSelfPayPaid';
import { isWeixinBrowser } from '../payment/weixinBrowser';
import { uploadImageViaZion } from '../utils/zionImageUpload';

type Props = {
  wechatOAuthExchangePending?: boolean;
  wechatOAuthExchangeError?: string | null;
};

type CampAdminPaidRow = CampAdminPaidUsersData['fz_payment_record'][number];

/** 自建通道已付订单没有 Zion 支付记录，按后台名单的行结构补齐缺省字段 */
function toCampAdminPaidRow(row: AdminSelfPaidRow): CampAdminPaidRow {
  return {
    id: row.id,
    account_id: null,
    created_at: row.created_at,
    order_id: row.id,
    order: {
      id: row.order.id,
      ud_dingdanleixing_3fb8b8: WENJUAN_CAMP_ORDER_TYPE,
      ud_dingdanbeizhu_439d3a: row.order.ud_dingdanbeizhu_439d3a,
      ud_yonghuxinxi_yonghuku_55773d: row.order.ud_yonghuxinxi_yonghuku_55773d,
      ud_gongzhonghaoid_665d9b: row.order.ud_gongzhonghaoid_665d9b,
      ud_gongxiuyingweixin_62acc6: row.order.ud_gongxiuyingweixin_62acc6,
      ud_tianjiazhuangtai_a1779b: row.order.ud_tianjiazhuangtai_a1779b,
      ud_dingdanjine_a50087: row.order.ud_dingdanjine_a50087,
      ud_dingdanjine0028zhengshu0029_1070ec:
        row.order.ud_dingdanjine0028zhengshu0029_1070ec,
      ud_gongxiuyingdaqiajilu_fd4f79_aggregate: null,
      ud_gongxiuyingdaqiajilu_fd4f79: [],
    },
  };
}

function isZionPaymentSuccessful(status: string | null | undefined): boolean {
  return String(status ?? '').toUpperCase() === 'SUCCESSFUL';
}

function getCampAmountByIdentity(identity: string | null | undefined): number {
  const v = String(identity ?? '').trim();
  const eligible = new Set(['学员', '服务专员', '服务中心', '公众号学员名单']);
  return eligible.has(v) ? 200 : 980;
}

const CAMP_SERVICE_QR_DOC_TYPE = '共修营客服';
const CAMP_ADMIN_ACCOUNT_IDS = new Set([
  '1000000000009519',
  '1000000000009106',
]);
const CAMP_CHECKIN_ADMIN_ACCOUNT_IDS = new Set(['1000000000009992']);

function isCampDescriptionMatch(
  description: string | null | undefined,
  aliases: string[]
): boolean {
  const normalized = String(description ?? '').trim();
  if (!normalized) return false;
  return aliases.includes(normalized);
}

function getTodayRangeInChina(): { start: string; end: string } {
  const now = new Date();
  const chinaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = chinaNow.getUTCFullYear();
  const month = chinaNow.getUTCMonth();
  const day = chinaNow.getUTCDate();
  const startUtc = new Date(Date.UTC(year, month, day, -8, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month, day + 1, -8, 0, 0, 0));
  return {
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
  };
}

function formatPaidAmountText(record: {
  order: {
    ud_dingdanjine_a50087: string | null;
    ud_dingdanjine0028zhengshu0029_1070ec: number | null;
  } | null;
}): string {
  const decimalRaw = record.order?.ud_dingdanjine_a50087;
  const decimal = decimalRaw === null || decimalRaw === undefined ? '' : String(decimalRaw).trim();
  if (decimal) {
    return `¥${decimal}`;
  }
  const fen = record.order?.ud_dingdanjine0028zhengshu0029_1070ec;
  if (typeof fen === 'number' && Number.isFinite(fen)) {
    return `¥${(fen / 100).toFixed(2)}`;
  }
  return '—';
}

function splitOrderRemarkLines(remark: string | null | undefined): [string, string?] {
  const raw = String(remark ?? '').trim();
  if (!raw) return ['—'];
  const m = raw.match(/^(.*共修营)(第\d+期)$/);
  if (m) return [m[1], m[2]];
  return [raw];
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

function LoginGateScreen({
  logoUrl,
  loginAccountId,
  inWeChatBrowser,
  wechatUrlMobile,
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
  wechatOAuthConfigured: boolean;
  oauthExchangePending: boolean;
  oauthExchangeError: string | null;
  title: string;
  subtitle: string;
}) {
  const [linkCopied, setLinkCopied] = useState(false);

  return (
    <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-[2rem] border border-border bg-card p-8 text-center shadow-organic md:p-10">
        <BrandLogoMark url={logoUrl} title="共修营报名" className="mb-4" />
        <h1 className="mt-1 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text font-display text-4xl font-extrabold tracking-[0.08em] text-transparent md:text-5xl">
          天启无书
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-base font-medium text-foreground leading-relaxed">
          {title}
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground leading-relaxed">
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
              可重新点击「微信一键授权登录」；若反复失败，请到 Zion 后台核对网页授权与{' '}
              <code className="text-foreground">loginWithWechat</code> 配置。
            </span>
          </p>
        ) : null}

        {!wechatOAuthConfigured ? (
          <p className="mx-auto mt-6 rounded-2xl border border-secondary/40 bg-accent/40 p-4 text-left text-xs text-accent-foreground">
            当前未配置微信 OAuth 入口。请在项目根目录 <code className="text-foreground">.env</code> 设置{' '}
            <code className="text-foreground">VITE_ZION_WECHAT_OAUTH_URL</code> 后重新构建。
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

const inputClass =
  'w-full min-h-12 rounded-full border border-border bg-background/60 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';

const labelClass = 'mb-2 block font-display text-sm font-semibold text-foreground';
const CAMP_CONTEXT_STORAGE_KEY = 'tqwj_camp_context';

type CampContext = {
  phase: CampPhase;
  miniProgramUserId: string;
  amountYuan: number;
  userLibraryId: string | null;
  identity: string | null;
};

function readCampContext(): CampContext | null {
  try {
    const raw = sessionStorage.getItem(CAMP_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    const phaseRaw = String(obj.phase ?? '').trim();
    const phase: CampPhase | null = isKnownCampPhase(phaseRaw) ? phaseRaw : null;
    const miniProgramUserId = String(obj.miniProgramUserId ?? '').trim();
    const amountYuan = Number(obj.amountYuan);
    const rawUserLibraryId =
      obj.userLibraryId === null || obj.userLibraryId === undefined
        ? null
        : String(obj.userLibraryId).trim();
    const identity =
      obj.identity === null || obj.identity === undefined
        ? null
        : String(obj.identity);
    if (!phase || !/^\d{5,6}$/.test(miniProgramUserId) || !Number.isFinite(amountYuan)) {
      return null;
    }
    return {
      phase,
      miniProgramUserId,
      amountYuan,
      userLibraryId:
        rawUserLibraryId && /^\d+$/.test(rawUserLibraryId) ? rawUserLibraryId : null,
      identity,
    };
  } catch {
    return null;
  }
}

function writeCampContext(context: CampContext): void {
  try {
    sessionStorage.setItem(CAMP_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  } catch {
    /* ignore */
  }
}

function clearCampContext(): void {
  try {
    sessionStorage.removeItem(CAMP_CONTEXT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function Lead2026CampEnrollPage({
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
  const campPhase = useMemo(() => getCampPhaseFromLocation(), []);
  const campPhaseLabel = useMemo(
    () => getCampDisplayPhaseLabel(campPhase),
    [campPhase]
  );
  const [enrollGateNowMs, setEnrollGateNowMs] = useState(() => Date.now());
  const campEnrollClosed = isCampEnrollmentClosed(campPhase, enrollGateNowMs);
  const campWechatEnrollFlow = isCampWechatEnrollFlow(campPhase);
  const campPayDescription = useMemo(
    () => getCampPayDescription(campPhase),
    [campPhase]
  );
  const campPayDescriptionAliases = useMemo(
    () => getCampPayDescriptionAliases(campPhase),
    [campPhase]
  );
  const campSchedule = useMemo(() => getCampSchedule(campPhase), [campPhase]);
  const campEnrollmentDeadlineMs = useMemo(
    () => getCampEnrollmentDeadlineAtMs(campPhase),
    [campPhase]
  );
  useEffect(() => {
    if (enrollGateNowMs >= campEnrollmentDeadlineMs) return;
    const delay = campEnrollmentDeadlineMs - Date.now() + 500;
    const timer = window.setTimeout(() => setEnrollGateNowMs(Date.now()), delay);
    const interval = window.setInterval(() => setEnrollGateNowMs(Date.now()), 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [campEnrollmentDeadlineMs, enrollGateNowMs]);
  const todayRange = useMemo(() => getTodayRangeInChina(), []);
  const [savedCampContext, setSavedCampContext] = useState<CampContext | null>(() =>
    readCampContext()
  );
  const [checkinFile, setCheckinFile] = useState<File | null>(null);
  const [checkinPreviewUrl, setCheckinPreviewUrl] = useState<string | null>(null);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [checkinSuccess, setCheckinSuccess] = useState<string | null>(null);
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [adminSearchInput, setAdminSearchInput] = useState('');
  const [checkinOnlyUnchecked, setCheckinOnlyUnchecked] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [campWeixinInput, setCampWeixinInput] = useState('');
  const [wechatAdminSearchInput, setWechatAdminSearchInput] = useState('');
  const [wechatAdminDrafts, setWechatAdminDrafts] = useState<Record<string, string>>({});
  const [wechatStatusUpdatingOrderId, setWechatStatusUpdatingOrderId] = useState<
    string | null
  >(null);

  useLayoutEffect(() => {
    captureInviterRefFromUrl();
  }, []);

  useEffect(() => {
    if (!checkinFile) {
      setCheckinPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(checkinFile);
    setCheckinPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [checkinFile]);

  useEffect(() => {
    if (!checkinFile) return;
    setCheckinError(null);
    setCheckinSuccess(null);
  }, [checkinFile]);

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
  const isCampAdmin = CAMP_ADMIN_ACCOUNT_IDS.has(loginAccountId);
  const isCampCheckinAdmin = CAMP_CHECKIN_ADMIN_ACCOUNT_IDS.has(loginAccountId);
  const isCampWechatAdmin = getCampWechatAdminAccountIds().has(loginAccountId);
  const canEnrollAfterDeadline = canBypassCampEnrollmentDeadline(loginAccountId);

  const campWeixinInputError = useMemo(() => {
    if (!campWechatEnrollFlow) return null;
    return validateCampWeixinInput(campWeixinInput);
  }, [campWechatEnrollFlow, campWeixinInput]);

  const campWechatContactForPay = useMemo(() => {
    if (!campWechatEnrollFlow || campWeixinInputError) return null;
    return buildCampWechatContact(campWeixinInput, '未进群');
  }, [campWechatEnrollFlow, campWeixinInput, campWeixinInputError]);

  const {
    data: adminPaidUsersData,
    loading: adminPaidUsersLoading,
    error: adminPaidUsersError,
    refetch: refetchAdminPaidUsers,
  } = useQuery<CampAdminPaidUsersData>(CAMP_ADMIN_PAID_USERS, {
    skip: !token || (!isCampAdmin && !isCampCheckinAdmin && !isCampWechatAdmin),
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  /**
   * 自建支付通道（pay-service）收款不进 fz_payment_record，
   * 这里把订单表里「已支付」的那一并合入后台名单，按订单 ID 去重。
   */
  const selfAdminPaid = useAdminSelfPaidOrders(
    Boolean(token) && (isCampAdmin || isCampCheckinAdmin || isCampWechatAdmin),
    WENJUAN_CAMP_ORDER_TYPE
  );

  const campAdminPaidRows = useMemo<CampAdminPaidRow[]>(() => {
    const seen = new Set<string>();
    const merged: CampAdminPaidRow[] = [];
    (adminPaidUsersData?.fz_payment_record ?? []).forEach((row) => {
      if (row.order?.ud_dingdanleixing_3fb8b8 !== WENJUAN_CAMP_ORDER_TYPE) return;
      seen.add(String(row.order?.id ?? row.id));
      merged.push(row);
    });
    selfAdminPaid.rows.forEach((row) => {
      const key = String(row.order?.id ?? row.id);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(toCampAdminPaidRow(row));
    });
    return merged;
  }, [adminPaidUsersData, selfAdminPaid.rows]);

  const adminListLoading = adminPaidUsersLoading || selfAdminPaid.loading;

  /** 后台操作（标记进群 / 补填微信号）后回读订单最新值：自建通道订单不在 fz_payment_record 里 */
  const refetchAdminRowContact = useCallback(
    async (orderId: string) => {
      selfAdminPaid.refresh();
      const refetched = await refetchAdminPaidUsers();
      const zionRow = (refetched.data?.fz_payment_record ?? []).find(
        (r) => String(r.order?.id) === orderId
      );
      if (zionRow) {
        return parseCampWechatContactFields(
          zionRow.order?.ud_gongxiuyingweixin_62acc6,
          zionRow.order?.ud_tianjiazhuangtai_a1779b
        );
      }
      const selfRows = await fetchAdminSelfPaidOrders(WENJUAN_CAMP_ORDER_TYPE);
      const selfRow = selfRows.find((r) => String(r.order?.id) === orderId);
      return parseCampWechatContactFields(
        selfRow?.order?.ud_gongxiuyingweixin_62acc6 ?? null,
        selfRow?.order?.ud_tianjiazhuangtai_a1779b ?? null
      );
    },
    [refetchAdminPaidUsers, selfAdminPaid.refresh]
  );

  const adminUserLibraryIds = useMemo(() => {
    const ids = new Set<string>();
    campAdminPaidRows.forEach((row) => {
      const raw = row.order?.ud_yonghuxinxi_yonghuku_55773d;
      const id = raw === null || raw === undefined ? '' : String(raw).trim();
      if (/^\d+$/.test(id)) ids.add(id);
    });
    return Array.from(ids);
  }, [campAdminPaidRows]);

  const { data: adminUserLibraryMapData } = useQuery<CampAdminUserLibraryIdsData>(
    CAMP_ADMIN_USER_LIBRARY_IDS,
    {
      variables: { userLibraryIds: adminUserLibraryIds },
      skip: adminUserLibraryIds.length === 0,
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

  const filteredAdminPaidUsers = useMemo(() => {
    const rows = campAdminPaidRows;
    const keyword = adminSearchInput.trim();
    if (!keyword) return rows;
    return rows.filter((row) => String(row.account_id ?? '').includes(keyword));
  }, [adminSearchInput, campAdminPaidRows]);

  const campWechatAdminPaidRows = useMemo(() => {
    return campAdminPaidRows.filter((row) =>
      isCampOrderRemarkForPhase(row.order?.ud_dingdanbeizhu_439d3a, campPhase)
    );
  }, [campAdminPaidRows, campPhase]);

  const filteredWechatAdminRows = useMemo(() => {
    const rows = campWechatAdminPaidRows;
    const keyword = wechatAdminSearchInput.trim();
    if (!keyword) return rows;
    return rows.filter((row) => {
      const userLibraryId = String(row.order?.ud_yonghuxinxi_yonghuku_55773d ?? '').trim();
      const miniId =
        userLibraryIdToMiniId.get(userLibraryId) ??
        String(row.order?.ud_gongzhonghaoid_665d9b ?? '').trim();
      const contact = parseCampWechatContactFields(
        row.order?.ud_gongxiuyingweixin_62acc6,
        row.order?.ud_tianjiazhuangtai_a1779b
      );
      const weixin = contact?.weixin ?? '';
      return miniId.includes(keyword) || weixin.includes(keyword);
    });
  }, [campWechatAdminPaidRows, wechatAdminSearchInput, userLibraryIdToMiniId]);

  const filteredCheckinAdminRows = useMemo(() => {
    const rows = checkinOnlyUnchecked
      ? campAdminPaidRows.filter((row) => {
          const count =
            row.order?.ud_gongxiuyingdaqiajilu_fd4f79_aggregate?.aggregate?.count ??
            0;
          return count <= 0;
        })
      : campAdminPaidRows;
    const keyword = adminSearchInput.trim();
    if (!keyword) return rows;
    return rows.filter((row) => {
      const userLibraryId = String(row.order?.ud_yonghuxinxi_yonghuku_55773d ?? '').trim();
      const miniId =
        userLibraryIdToMiniId.get(userLibraryId) ??
        String(row.order?.ud_gongzhonghaoid_665d9b ?? '').trim();
      return miniId.includes(keyword);
    });
  }, [adminSearchInput, campAdminPaidRows, checkinOnlyUnchecked, userLibraryIdToMiniId]);

  const payAccountId = useMemo(() => {
    if (jwtAccountId && /^\d+$/.test(jwtAccountId)) return jwtAccountId;
    const id = meRow?.id?.trim();
    if (id && /^\d+$/.test(id)) return id;
    return null;
  }, [jwtAccountId, meRow?.id]);

  const apolloClient = useApolloClient();

  /** 共修营支付：默认强制支付后才允许报名 */
  const paySubmitRequired = true;

  const {
    data: eligibilityData,
    loading: eligibilityLoading,
    error: eligibilityError,
    refetch: refetchEligibility,
  } = useQuery<WenjuanPayEligibilityData>(WENJUAN_PAY_ELIGIBILITY, {
    variables: { accountId: payAccountId ?? '0' },
    skip: !token || !paySubmitRequired || !payAccountId,
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  const paidViaZion = useMemo(() => {
    const rows = eligibilityData?.fz_payment_record;
    if (!rows?.length) return false;
    return rows.some((r) => {
      const ok = isZionPaymentSuccessful(r.status);
      if (!ok) return false;
      return isCampDescriptionMatch(r.description, campPayDescriptionAliases);
    });
  }, [campPayDescriptionAliases, eligibilityData]);

  const [campPayUnlocked, setCampPayUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(WENJUAN_CAMP_PAY_OK_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (paidViaZion) setCampPayUnlocked(true);
  }, [paidViaZion]);

  const { data: serviceQrData } = useQuery<CampServiceQrQueryData>(
    GET_CAMP_SERVICE_QR,
    {
      variables: { type: CAMP_SERVICE_QR_DOC_TYPE },
      fetchPolicy: 'network-only',
    }
  );

  const {
    data: campEnrollmentData,
    error: campEnrollmentError,
    refetch: refetchCampEnrollment,
  } = useQuery<CampEnrollmentStatusData>(MY_CAMP_ENROLLMENT_STATUS, {
    variables: {
      accountId: payAccountId ?? '0',
      todayStart: todayRange.start,
      todayEnd: todayRange.end,
    },
    skip: !token || !payAccountId || (!campPayUnlocked && !paidViaZion),
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  const [getImageUploadUrl] = useMutation<GetImageUploadUrlData>(GET_IMAGE_UPLOAD_URL);
  const [insertCampCheckin] = useMutation(INSERT_CAMP_CHECKIN);
  const [patchCampOrderWechatContact] = useMutation(PATCH_CAMP_ORDER_WECHAT_CONTACT);

  useEffect(() => {
    if (!token || !paySubmitRequired) return;
    if (paidViaZion) return;
    let pending = false;
    try {
      pending =
        sessionStorage.getItem(WENJUAN_CAMP_WXPAY_H5_PENDING_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (!pending) return;
    const t = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(WENJUAN_CAMP_WXPAY_H5_PENDING_KEY);
      } catch {
        /* ignore */
      }
      void refetchEligibility();
    }, WENJUAN_PAY_WEBHOOK_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [token, paySubmitRequired, paidViaZion, refetchEligibility]);

  useEffect(() => {
    if (!token || !paySubmitRequired || paidViaZion) return;
    const timer = window.setInterval(() => {
      void refetchEligibility();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [token, paySubmitRequired, paidViaZion, refetchEligibility]);

  const confirmPaidWithBackend = useCallback(async (): Promise<boolean> => {
    if (!payAccountId) return false;
    const hasOk = (data: WenjuanPayEligibilityData | undefined): boolean => {
      const rows = data?.fz_payment_record;
      if (!rows?.length) return false;
      return rows.some((r) => {
        if (!isZionPaymentSuccessful(r.status)) return false;
        return isCampDescriptionMatch(r.description, campPayDescriptionAliases);
      });
    };

    const maxAttempts = 10;
    let waitMs = WENJUAN_PAY_WEBHOOK_WAIT_MS;
    for (let i = 0; i < maxAttempts; i += 1) {
      await new Promise((r) => setTimeout(r, waitMs));
      const fresh = await apolloClient.query<WenjuanPayEligibilityData>({
        query: WENJUAN_PAY_ELIGIBILITY,
        variables: { accountId: payAccountId },
        fetchPolicy: 'no-cache',
      });
      if (hasOk(fresh.data)) {
        await refetchEligibility();
        return true;
      }
      const res = await refetchEligibility();
      if (hasOk(res.data)) return true;
      waitMs = WENJUAN_PAY_WEBHOOK_RETRY_WAIT_MS;
    }
    return false;
  }, [apolloClient, campPayDescriptionAliases, payAccountId, refetchEligibility]);

  const [miniProgramUserId, setMiniProgramUserId] = useState('');
  const miniProgramIdValid = useMemo(
    () => /^\d{5,6}$/.test(miniProgramUserId.trim()),
    [miniProgramUserId]
  );

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
  const pricingIdentity =
    miniIdentity?.trim() || (publicStudentFound ? '公众号学员名单' : null);
  const matchedForCampPricing = miniFound || publicStudentFound;

  /** 自建支付通道：pay-service 回调把订单表状态置为「已支付」，此处补一路已付判定 */
  const { paid: selfPayPaid } = useSelfPayPaid({
    enabled: true,
    userLibraryId: miniRow?.id ?? null,
    publicAccountId:
      !miniRow && publicStudentFound ? miniProgramUserId.trim() : null,
    aliases: campPayDescriptionAliases,
  });
  useEffect(() => {
    if (selfPayPaid) setCampPayUnlocked(true);
  }, [selfPayPaid]);
  const amountYuan = useMemo(
    () => (publicStudentFound ? 200 : getCampAmountByIdentity(pricingIdentity)),
    [pricingIdentity, publicStudentFound]
  );
  const displayCampContext = useMemo(() => {
    if (matchedForCampPricing) {
      return {
        phase: campPhase,
        miniProgramUserId: miniProgramUserId.trim(),
        amountYuan,
        userLibraryId: miniRow ? String(miniRow.id) : null,
        identity: pricingIdentity,
      } satisfies CampContext;
    }
    if (savedCampContext?.phase === campPhase) return savedCampContext;
    return null;
  }, [
    amountYuan,
    campPhase,
    matchedForCampPricing,
    miniProgramUserId,
    miniRow,
    pricingIdentity,
    savedCampContext,
  ]);

  const serviceQrUrl =
    serviceQrData?.ud_quanjuwendang_d0da48?.[0]?.ud_tupian_3212f2?.url ?? null;

  const enrolledPayment = useMemo(() => {
    const rows = campEnrollmentData?.fz_payment_record ?? [];
    return (
      rows.find((row) => {
        if (row.order?.id === null || row.order?.id === undefined) return false;
        if (row.order?.ud_dingdanleixing_3fb8b8 !== WENJUAN_CAMP_ORDER_TYPE) return false;
        return isCampDescriptionMatch(row.description, campPayDescriptionAliases);
      }) ?? null
    );
  }, [campEnrollmentData, campPayDescriptionAliases]);

  const enrolledOrder = enrolledPayment?.order ?? null;
  const enrolledWechatContact = useMemo(
    () =>
      parseCampWechatContactFields(
        enrolledOrder?.ud_gongxiuyingweixin_62acc6,
        enrolledOrder?.ud_tianjiazhuangtai_a1779b
      ),
    [enrolledOrder?.ud_gongxiuyingweixin_62acc6, enrolledOrder?.ud_tianjiazhuangtai_a1779b]
  );
  const enrolledOrderId =
    enrolledOrder?.id !== null && enrolledOrder?.id !== undefined
      ? String(enrolledOrder.id)
      : null;
  const todayCheckin = enrolledOrder?.ud_gongxiuyingdaqiajilu_fd4f79?.[0] ?? null;
  const checkinCount =
    enrolledOrder?.ud_gongxiuyingdaqiajilu_fd4f79_aggregate?.aggregate?.count ?? 0;
  const alreadyCheckedInToday = Boolean(todayCheckin);

  useEffect(() => {
    if (enrolledWechatContact?.weixin) {
      setCampWeixinInput(enrolledWechatContact.weixin);
    }
  }, [enrolledWechatContact?.weixin]);

  const needCampPayWall =
    paySubmitRequired && !campPayUnlocked && !paidViaZion;

  const showWechatPayCard =
    needCampPayWall &&
    isWenjuanWechatPayEnabled() &&
    miniProgramIdValid &&
    !miniUserLoading &&
    !miniUserError &&
    matchedForCampPricing &&
    (!campWechatEnrollFlow || !campWeixinInputError);

  const showPayCompleteFallback =
    needCampPayWall &&
    isWenjuanPayManualClientConfirmAllowed() &&
    !isWenjuanWechatPayEnabled() &&
    miniProgramIdValid &&
    !miniUserLoading &&
    !miniUserError &&
    matchedForCampPricing &&
    (!campWechatEnrollFlow || !campWeixinInputError);

  const updateOrderWechatFriendStatus = useCallback(
    async (orderId: string, nextStatus: CampWechatFriendStatus) => {
      if (!/^\d+$/.test(orderId)) {
        window.alert(`订单 ID 异常：${orderId || '空'}。请刷新页面后重试。`);
        return;
      }
      const row = campWechatAdminPaidRows.find((r) => String(r.order?.id) === orderId);
      const contact = parseCampWechatContactFields(
        row?.order?.ud_gongxiuyingweixin_62acc6,
        row?.order?.ud_tianjiazhuangtai_a1779b
      );
      if (!contact?.weixin) {
        window.alert('此订单还没有微信号，请先补填微信号再标记进群状态。');
        return;
      }
      if (contact.friend_status === nextStatus) return;
      setWechatStatusUpdatingOrderId(orderId);
      try {
        const res = await patchCampOrderWechatContact({
          variables: {
            orderId,
            weixin: contact.weixin,
            friendStatus: nextStatus,
          },
        });
        if (res.errors?.length) {
          throw new Error(res.errors.map((e) => e.message).join('；'));
        }
        const updatedContact = await refetchAdminRowContact(orderId);
        if (updatedContact?.friend_status !== nextStatus) {
          throw new Error(
            `后端没有确认更新进群状态：刷新后仍为「${
              updatedContact?.friend_status ?? '未知'
            }」。请稍后再试，或联系开发确认该账号是否有权限更新订单表。`
          );
        }
      } catch (error) {
        window.alert(friendlyRequestErrorMessage(error));
      } finally {
        setWechatStatusUpdatingOrderId(null);
      }
    },
    [campWechatAdminPaidRows, patchCampOrderWechatContact, refetchAdminRowContact]
  );

  const saveOrderWechatFromAdmin = useCallback(
    async (orderId: string) => {
      if (!/^\d+$/.test(orderId)) return;
      const draft = String(wechatAdminDrafts[orderId] ?? '').trim();
      const inputErr = validateCampWeixinInput(draft);
      if (inputErr) {
        window.alert(inputErr);
        return;
      }
      setWechatStatusUpdatingOrderId(orderId);
      try {
        const res = await patchCampOrderWechatContact({
          variables: {
            orderId,
            weixin: draft,
            friendStatus: '未进群',
          },
        });
        if (res.errors?.length) {
          throw new Error(res.errors.map((e) => e.message).join('；'));
        }
        const updatedContact = await refetchAdminRowContact(orderId);
        if (updatedContact?.weixin !== draft) {
          throw new Error(
            `后端没有确认写入微信号：刷新后读到「${
              updatedContact?.weixin ?? '空'
            }」。请确认该账号是否有权限更新订单表。`
          );
        }
        setWechatAdminDrafts((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      } catch (error) {
        window.alert(friendlyRequestErrorMessage(error));
      } finally {
        setWechatStatusUpdatingOrderId(null);
      }
    },
    [patchCampOrderWechatContact, refetchAdminRowContact, wechatAdminDrafts]
  );

  const submitCheckin = useCallback(async () => {
    setCheckinError(null);
    setCheckinSuccess(null);

    if (!enrolledOrderId) {
      setCheckinError('暂未读取到你的共修营报名订单，请稍后刷新页面再试。');
      return;
    }
    if (alreadyCheckedInToday) {
      setCheckinError('今天已经打卡成功，无需重复提交。');
      return;
    }
    if (!checkinFile) {
      setCheckinError('请先上传一张线上会议截图。');
      return;
    }

    setCheckinSubmitting(true);
    try {
      const latest = await refetchCampEnrollment();
      const latestPayment = latest.data?.fz_payment_record?.find(
        (row) => row.order?.id !== null && row.order?.id !== undefined
      );
      const latestTodayCheckin =
        latestPayment?.order?.ud_gongxiuyingdaqiajilu_fd4f79?.[0] ?? null;
      if (latestTodayCheckin) {
        setCheckinError('今天已经打卡成功，无需重复提交。');
        return;
      }

      const imageId = await uploadImageViaZion(checkinFile, async ({ md5, suffix, acl }) => {
        const res = await getImageUploadUrl({
          variables: { md5, suffix, acl },
        });
        const data = res.data?.imagePresignedUrl;
        if (!data?.imageId || !data.uploadUrl) {
          throw new Error('未拿到截图上传地址，请稍后重试。');
        }
        return {
          imageId: data.imageId,
          uploadUrl: data.uploadUrl,
          uploadHeaders: data.uploadHeaders ?? null,
        };
      });

      const insertRes = await insertCampCheckin({
        variables: {
          object: {
            ud_baomingzhifudingdan_id_36dd84: enrolledOrderId,
            ud_daqiatupian_764935_id: imageId,
          },
        },
      });
      if (insertRes.errors?.length) {
        throw new Error(insertRes.errors.map((e) => e.message).join('；'));
      }

      setCheckinFile(null);
      setCheckinSuccess('今日打卡成功，已记录到你的共修营打卡表。');
      await refetchCampEnrollment();
    } catch (error) {
      setCheckinError(friendlyRequestErrorMessage(error));
    } finally {
      setCheckinSubmitting(false);
    }
  }, [
    alreadyCheckedInToday,
    checkinFile,
    enrolledOrderId,
    getImageUploadUrl,
    insertCampCheckin,
    refetchCampEnrollment,
  ]);

  useEffect(() => {
    if (!matchedForCampPricing || !miniProgramIdValid) return;
    const nextContext: CampContext = {
      phase: campPhase,
      miniProgramUserId: miniProgramUserId.trim(),
      amountYuan,
      userLibraryId: miniRow ? String(miniRow.id) : null,
      identity: pricingIdentity,
    };
    writeCampContext(nextContext);
    setSavedCampContext(nextContext);
  }, [
    amountYuan,
    campPhase,
    matchedForCampPricing,
    miniProgramIdValid,
    miniProgramUserId,
    miniRow,
    pricingIdentity,
  ]);

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
        title={`请先登录（${campPhaseLabel}）`}
        subtitle={
          inWeChatBrowser
            ? `请先完成微信授权登录。登录后进入${campPhaseLabel}共修营报名流程。`
            : '本页仅支持在微信内打开。请把当前链接发送到微信聊天或「文件传输助手」后再打开。'
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

  if (isCampAdmin && (!isCampWechatAdmin || !campWechatEnrollFlow)) {
    return (
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 md:py-14">
        <header className="mb-8 text-center">
          <BrandLogoMark
            url={brandLogoUrl}
            title={`共修营后台 · ${campPhaseLabel}`}
            isPrimaryPageHeading
            className="mb-5"
          />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            当前页面仅展示「已支付成功」的报名记录。可按用户ID模糊搜索，并查看支付金额与支付时间。
          </p>
          <LoginAccountIdHint accountId={jwtAccountId ?? meRow?.id ?? null} />
        </header>

        <section className="mb-6 rounded-[2rem] border border-border bg-card p-5 shadow-organic-sm md:p-6">
          <label className={labelClass} htmlFor="camp-admin-user-search">
            搜索已支付用户ID（模糊匹配）
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="camp-admin-user-search"
              className={inputClass}
              value={adminSearchInput}
              onChange={(e) => setAdminSearchInput(e.target.value)}
              placeholder="输入用户ID关键字，例如 9519"
              inputMode="numeric"
              autoComplete="off"
            />
            <button
              type="button"
              className="min-h-12 rounded-full border border-border px-6 py-3 text-sm text-muted-foreground transition hover:bg-muted/50"
              onClick={() => {
                void refetchAdminPaidUsers();
                selfAdminPaid.refresh();
              }}
            >
              刷新列表
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            当前结果：{filteredAdminPaidUsers.length} 条（共修营已支付（本次已加载） {campAdminPaidRows.length} 条）
          </p>
        </section>

        <section className="rounded-[2rem] border border-border bg-card p-4 shadow-organic-sm md:p-6">
          {adminListLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">正在加载已支付用户列表…</p>
          ) : null}

          {adminPaidUsersError ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-accent-foreground">
              读取已支付记录失败：{friendlyRequestErrorMessage(adminPaidUsersError)}
            </p>
          ) : null}

          {!adminListLoading && !adminPaidUsersError && filteredAdminPaidUsers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无符合条件的已支付用户记录。
            </p>
          ) : null}

          {!adminListLoading && !adminPaidUsersError && filteredAdminPaidUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">用户ID</th>
                    <th className="px-3 py-2 font-medium">订单备注（期次）</th>
                    <th className="px-3 py-2 font-medium">支付费用</th>
                    <th className="px-3 py-2 font-medium">支付时间</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdminPaidUsers.map((row) => (
                    <tr
                      key={String(row.id)}
                      className="rounded-2xl border border-border/70 bg-background/60 text-foreground"
                    >
                      <td className="px-3 py-3 font-mono">{String(row.account_id ?? '—')}</td>
                      <td className="px-3 py-3">
                        {row.order?.ud_dingdanbeizhu_439d3a?.trim() || '—'}
                      </td>
                      <td className="px-3 py-3">{formatPaidAmountText(row)}</td>
                      <td className="px-3 py-3">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  if (
    !isCampAdmin &&
    !isCampWechatAdmin &&
    !isCampCheckinAdmin &&
    eligibilityLoading &&
    !campPayUnlocked
  ) {
    return (
      <div className="relative z-10 flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>正在查询本期报名状态…</p>
      </div>
    );
  }

  if (isCampWechatAdmin) {
    return (
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 md:py-14">
        <header className="mb-8 text-center">
          <BrandLogoMark
            url={brandLogoUrl}
            title="共修营 · 进群管理"
            isPrimaryPageHeading
            className="mb-5"
          />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            {campPhaseLabel}已支付学员：展示用户库ID；没有用户库ID时展示公众号ID。可查看报名微信号，并标记是否已进群。
          </p>
          <LoginAccountIdHint accountId={jwtAccountId ?? meRow?.id ?? null} />
        </header>

        <section className="mb-6 rounded-[2rem] border border-border bg-card p-5 shadow-organic-sm md:p-6">
          <label className={labelClass} htmlFor="camp-wechat-admin-search">
            搜索用户库ID / 公众号ID / 微信号（模糊匹配）
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="camp-wechat-admin-search"
              className={inputClass}
              value={wechatAdminSearchInput}
              onChange={(e) => setWechatAdminSearchInput(e.target.value)}
              placeholder="输入用户库ID、公众号ID或微信号关键字"
              autoComplete="off"
            />
            <button
              type="button"
              className="min-h-12 rounded-full border border-border px-6 py-3 text-sm text-muted-foreground transition hover:bg-muted/50"
              onClick={() => {
                void refetchAdminPaidUsers();
                selfAdminPaid.refresh();
              }}
            >
              刷新列表
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            当前结果：{filteredWechatAdminRows.length} 条（{campPhaseLabel}已支付（本次已加载）{' '}
            {campWechatAdminPaidRows.length} 条）
          </p>
        </section>

        <section className="rounded-[2rem] border border-border bg-card p-4 shadow-organic-sm md:p-6">
          {adminListLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">正在加载…</p>
          ) : null}

          {adminPaidUsersError ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-accent-foreground">
              读取失败：{friendlyRequestErrorMessage(adminPaidUsersError)}
            </p>
          ) : null}

          {!adminListLoading && !adminPaidUsersError && filteredWechatAdminRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无{campPhaseLabel}报名记录。
            </p>
          ) : null}

          {!adminListLoading && !adminPaidUsersError && filteredWechatAdminRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium whitespace-nowrap">用户库ID / 公众号ID</th>
                    <th className="min-w-[88px] px-3 py-2 font-medium">微信号</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">进群状态</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">操作</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">支付时间</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWechatAdminRows.map((row) => {
                    const userLibraryId = String(
                      row.order?.ud_yonghuxinxi_yonghuku_55773d ?? ''
                    ).trim();
                    const miniId =
                      userLibraryIdToMiniId.get(userLibraryId) ||
                      String(row.order?.ud_gongzhonghaoid_665d9b ?? '').trim() ||
                      '—';
                    const contact = parseCampWechatContactFields(
                      row.order?.ud_gongxiuyingweixin_62acc6,
                      row.order?.ud_tianjiazhuangtai_a1779b
                    );
                    const orderId = String(row.order?.id ?? '');
                    const isInGroup = contact?.friend_status === '已进群';
                    const busyThis = wechatStatusUpdatingOrderId === orderId;
                    const draftWeixin = wechatAdminDrafts[orderId] ?? '';
                    const nextStatus: CampWechatFriendStatus = isInGroup
                      ? '未进群'
                      : '已进群';
                    const toggleLabel = isInGroup
                      ? '撤销 → 改为「未进群」'
                      : '标记为「已进群」';
                    return (
                      <tr
                        key={String(row.id)}
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
                                  setWechatAdminDrafts((prev) => ({
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
                                onClick={() => void saveOrderWechatFromAdmin(orderId)}
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
                            onClick={() =>
                              void updateOrderWechatFriendStatus(
                                orderId,
                                nextStatus
                              )
                            }
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

  if (isCampCheckinAdmin) {
    return (
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 md:py-14">
        <header className="mb-8 text-center">
          <BrandLogoMark
            url={brandLogoUrl}
            title={`共修营打卡后台 · ${campPhaseLabel}`}
            isPrimaryPageHeading
            className="mb-5"
          />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            当前页面仅展示已支付报名用户的打卡情况。展示用户库ID；没有用户库ID时展示公众号ID。可按ID搜索，并查看打卡次数与最近打卡时间。
          </p>
          <LoginAccountIdHint accountId={jwtAccountId ?? meRow?.id ?? null} />
        </header>

        <section className="mb-6 rounded-[2rem] border border-border bg-card p-5 shadow-organic-sm md:p-6">
          <label className={labelClass} htmlFor="camp-checkin-admin-user-search">
            搜索用户库ID / 公众号ID（模糊匹配）
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="camp-checkin-admin-user-search"
              className={inputClass}
              value={adminSearchInput}
              onChange={(e) => setAdminSearchInput(e.target.value)}
              placeholder="输入报名时填写的用户库ID或公众号ID"
              inputMode="numeric"
              autoComplete="off"
            />
            <button
              type="button"
              className="min-h-12 rounded-full border border-border px-6 py-3 text-sm text-muted-foreground transition hover:bg-muted/50"
              onClick={() => {
                void refetchAdminPaidUsers();
                selfAdminPaid.refresh();
              }}
            >
              刷新列表
            </button>
          </div>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-foreground/85">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={checkinOnlyUnchecked}
              onChange={(e) => setCheckinOnlyUnchecked(e.target.checked)}
            />
            仅看未打卡用户
          </label>
          <p className="mt-3 text-xs text-muted-foreground">
            当前结果：{filteredCheckinAdminRows.length} 条（已支付报名（本次已加载） {campAdminPaidRows.length} 条）
          </p>
        </section>

        <section className="rounded-[2rem] border border-border bg-card p-4 shadow-organic-sm md:p-6">
          {adminListLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">正在加载打卡情况…</p>
          ) : null}

          {adminPaidUsersError ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-accent-foreground">
              读取打卡数据失败：{friendlyRequestErrorMessage(adminPaidUsersError)}
            </p>
          ) : null}

          {!adminListLoading && !adminPaidUsersError && filteredCheckinAdminRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无符合条件的打卡记录。
            </p>
          ) : null}

          {!adminListLoading && !adminPaidUsersError && filteredCheckinAdminRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium whitespace-nowrap">用户库ID / 公众号ID</th>
                    <th className="px-3 py-2 font-medium">订单备注（期次）</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">累计打卡次数</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">最近打卡时间</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">打卡图片</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">支付时间</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCheckinAdminRows.map((row) => {
                    const checkinCount =
                      row.order?.ud_gongxiuyingdaqiajilu_fd4f79_aggregate?.aggregate
                        ?.count ?? 0;
                    const latestCheckin = row.order?.ud_gongxiuyingdaqiajilu_fd4f79?.[0];
                    const userLibraryId = String(
                      row.order?.ud_yonghuxinxi_yonghuku_55773d ?? ''
                    ).trim();
                    const miniId =
                      userLibraryIdToMiniId.get(userLibraryId) ||
                      String(row.order?.ud_gongzhonghaoid_665d9b ?? '').trim() ||
                      '—';
                    const remarkLines = splitOrderRemarkLines(
                      row.order?.ud_dingdanbeizhu_439d3a
                    );
                    const checkinImageUrl = latestCheckin?.ud_daqiatupian_764935?.url ?? null;
                    return (
                      <tr
                        key={String(row.id)}
                        className="rounded-2xl border border-border/70 bg-background/60 text-foreground"
                      >
                        <td className="px-3 py-3 font-mono whitespace-nowrap">{miniId}</td>
                        <td className="px-3 py-3">
                          <div className="min-w-[112px] leading-tight">
                            <span className="block whitespace-nowrap">{remarkLines[0]}</span>
                            {remarkLines[1] ? (
                              <span className="mt-1 block whitespace-nowrap text-muted-foreground">
                                {remarkLines[1]}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{checkinCount}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {latestCheckin?.created_at
                            ? new Date(latestCheckin.created_at).toLocaleString()
                            : '未打卡'}
                        </td>
                        <td className="px-3 py-3">
                          {checkinImageUrl ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-primary transition hover:bg-primary/10"
                              onClick={() => setPreviewImageUrl(checkinImageUrl)}
                            >
                              查看图片
                            </button>
                          ) : (
                            <span className="text-muted-foreground">无图片</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        {previewImageUrl ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="打卡图片预览"
            onClick={() => setPreviewImageUrl(null)}
          >
            <div
              className="max-h-[90vh] max-w-[92vw] rounded-2xl bg-[#FEFEFA] p-3 shadow-[0_10px_40px_-10px_rgba(93,112,82,0.25)]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewImageUrl}
                alt="打卡截图预览"
                className="max-h-[80vh] max-w-[88vw] rounded-xl object-contain"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className="min-h-12 rounded-full border border-border px-6 py-2 text-sm text-muted-foreground transition hover:bg-muted/50"
                  onClick={() => setPreviewImageUrl(null)}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (campPayUnlocked || paidViaZion) {
    return (
      <div className="relative z-10 mx-auto max-w-2xl px-4 py-10 md:py-14">
        <header className="mb-10 text-center">
          <BrandLogoMark
            url={brandLogoUrl}
            title={`共修营报名 · ${campPhaseLabel}`}
            isPrimaryPageHeading
            className="mb-5"
          />
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            {campWechatEnrollFlow
              ? '已完成报名缴费。请确认微信号，老师将按此号添加您；您也可以直接开始今天的打卡。'
              : '已完成报名缴费。你现在可以并行处理两件事：扫码添加客服，也可以直接开始今天的打卡。'}
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
                clearCampContext();
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
          <p className="text-4xl" aria-hidden>
            ✓
          </p>
          <h2 className="mt-4 font-display text-3xl text-foreground">报名成功</h2>
          {displayCampContext ? (
            <>
              <p className="mt-3 text-muted-foreground">
                本次支付金额：
                <span className="font-semibold text-foreground">
                  ¥{displayCampContext.amountYuan}
                </span>
              </p>
              <p className="mt-2 text-muted-foreground">
                你的用户小程序ID：
                <span className="font-mono text-foreground">
                  {displayCampContext.miniProgramUserId}
                </span>
              </p>
            </>
          ) : (
            <p className="mt-3 text-muted-foreground">
              当前已识别到本期报名付款成功。请耐心等待进群小助手邀请进群。
            </p>
          )}

          <section className="mt-7 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground/90">学习规则提醒</p>
            <p className="mt-2">
              每日设 2 个学习时段，灵活参与；两个时间段任选一场完成当日学习即可。未建档家长缺席超过 3 次不能建档。
              {isCampParticipationFeeNonRefundable(campPhase)
                ? '建档家长缴纳的 200 元为课程参与费用，缴费后不予退还。'
                : '建档家长缺席超过 3 次押金不予退还。'}
              课程开始 15 分钟后会议室自动关闭。每日会议时间：早晨 6:00—8:00、晚间 20:00—22:00。
            </p>
          </section>

          <div className="mt-7 grid gap-5 lg:grid-cols-2">
            <section className="rounded-[1.75rem] border border-secondary/25 bg-[#FEFEFA] p-5 shadow-[0_4px_20px_-2px_rgba(193,140,93,0.14)]">
            {campWechatEnrollFlow ? (
              <>
                <h3 className="font-display text-xl text-secondary">微信号确认</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  本期无需扫码加群。报名时填写的微信号将用于老师添加好友并邀请进群，请确保可搜索到。
                </p>
                <div className="mt-5 space-y-3 text-sm">
                  {enrolledWechatContact?.weixin ? (
                    <p>
                      您支付前确认的微信号：
                      <span className="ml-1 font-mono font-semibold text-foreground">
                        {enrolledWechatContact.weixin}
                      </span>
                    </p>
                  ) : (
                    <p className="rounded-2xl border border-secondary/30 bg-secondary/5 px-4 py-3 text-accent-foreground">
                      暂未读取到订单中的微信号。微信号需在支付前填写并随订单创建；如您已完成支付，请联系老师核对后台订单。
                    </p>
                  )}
                  {enrolledWechatContact?.weixin ? (
                    <p
                      className={
                        enrolledWechatContact.friend_status === '已进群'
                          ? 'rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-primary'
                          : 'rounded-2xl border border-border/70 bg-background/60 px-4 py-3 text-muted-foreground'
                      }
                    >
                      {enrolledWechatContact.friend_status === '已进群'
                        ? '老师已将您拉入共修营群，请留意微信群消息。'
                        : '老师将通过此微信号添加您并邀请进群，请耐心等待。'}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <h3 className="font-display text-xl text-secondary">扫码添加客服</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  客服二维码每次都从后端实时读取，避免二维码过期。添加后由客服拉你进入本期共修营群。
                </p>
                {serviceQrUrl ? (
              <div className="mt-5 flex flex-col items-center gap-4">
                <img
                  src={serviceQrUrl}
                  alt="共修营客服二维码"
                  className="h-56 w-56 rounded-[2rem] border border-border/70 bg-white object-cover p-2 shadow-[0_4px_20px_-2px_rgba(93,112,82,0.15)]"
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-destructive">
                暂未读取到客服二维码，请稍后刷新页面重试。
              </p>
            )}
              </>
            )}
            </section>

            <section className="rounded-[1.75rem] border border-primary/25 bg-[#FEFEFA] p-5 shadow-[0_4px_20px_-2px_rgba(93,112,82,0.14)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="font-display text-xl text-primary">每日打卡</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  每天进入本页都可以完成一次打卡。
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3 text-sm text-foreground">
                累计打卡 <span className="font-semibold text-primary">{checkinCount}</span> 次
              </div>
            </div>

            {campEnrollmentError ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                打卡记录读取失败：{friendlyRequestErrorMessage(campEnrollmentError)}
              </p>
            ) : null}

            {!enrolledOrderId ? (
              <p className="mt-4 rounded-2xl border border-secondary/30 bg-secondary/5 p-3 text-sm text-accent-foreground">
                当前页面已进入报名成功态，但后端还没读取到可关联的报名订单，所以暂时不能打卡。请稍后刷新；若是手动放行进入本页，需等后端真实订单创建完成后才能开始打卡。
              </p>
            ) : null}

            {checkinSuccess ? (
              <p className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
                {checkinSuccess}
              </p>
            ) : null}

            {checkinError ? (
              <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-accent-foreground">
                {checkinError}
              </p>
            ) : null}

            {alreadyCheckedInToday ? (
              <div className="mt-5 rounded-[1.5rem] border border-primary/25 bg-primary/5 p-4">
                <p className="text-sm font-semibold text-primary">今天已打卡成功</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  打卡时间：
                  <span className="ml-1 text-foreground">
                    {todayCheckin?.created_at
                      ? new Date(todayCheckin.created_at).toLocaleString()
                      : '已提交'}
                  </span>
                </p>
              </div>
            ) : (
              <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-background/60 p-4">
                <p className="text-sm font-semibold text-foreground">上传线上会议截图后提交今日打卡</p>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="上传线上会议截图"
                  className="mt-4 block w-full text-sm text-muted-foreground file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-5 file:py-3 file:font-semibold file:text-primary-foreground"
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0] ?? null;
                    setCheckinFile(nextFile);
                  }}
                  disabled={checkinSubmitting}
                />
                {checkinPreviewUrl ? (
                  <div className="mt-4">
                    <img
                      src={checkinPreviewUrl}
                      alt="待提交的打卡截图预览"
                      className="max-h-72 rounded-[1.5rem] border border-border/70 object-contain shadow-[0_4px_20px_-2px_rgba(93,112,82,0.12)]"
                    />
                  </div>
                ) : null}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    disabled={checkinSubmitting || !checkinFile || !enrolledOrderId}
                    className="min-h-12 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground shadow-organic-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void submitCheckin()}
                  >
                    {checkinSubmitting ? '提交中…' : '提交今日打卡'}
                  </button>
                  <button
                    type="button"
                    className="min-h-12 rounded-full border border-border px-6 py-3 text-sm text-muted-foreground transition hover:bg-muted/50"
                    onClick={() => void refetchCampEnrollment()}
                  >
                    刷新打卡状态
                  </button>
                </div>
              </div>
            )}
            </section>
          </div>

        </article>
      </div>
    );
  }

  if (
    campEnrollClosed &&
    !canEnrollAfterDeadline &&
    !isCampAdmin &&
    !isCampCheckinAdmin &&
    !isCampWechatAdmin
  ) {
    return (
      <div className="relative z-10 mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-[2rem] border border-border bg-card p-10 shadow-organic">
          <BrandLogoMark
            url={brandLogoUrl}
            title={`共修营报名 · ${campPhaseLabel}`}
            isPrimaryPageHeading
            className="mb-5"
          />
          <h2 className="font-display text-3xl text-foreground md:text-4xl">
            本期报名已结束
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-foreground/85 md:text-base">
            {campPhaseLabel}共修营报名已于 {campSchedule.deadline} 截止，请关注后续新一期开放通知。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 md:py-14">
      <header className="mb-10 text-center">
        <BrandLogoMark
          url={brandLogoUrl}
          title={`共修营报名 · ${campPhaseLabel}`}
          isPrimaryPageHeading
          className="mb-5"
        />
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
          打开本页即可查看{campPhaseLabel}共修营介绍。登录后请输入你的用户 ID，系统将自动匹配报名费用。
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
              clearCampContext();
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

      <article className="rounded-tl-[1.75rem] rounded-tr-[1.25rem] rounded-br-[2rem] rounded-bl-[1.35rem] border border-border bg-card p-5 shadow-organic-sm md:p-10">
        <CampIntroShowcase
          campPhase={campPhase}
          campPhaseLabel={campPhaseLabel}
          schedule={campSchedule}
        />

        <section className="mb-7 rounded-2xl border border-border/70 bg-muted/30 p-4 md:p-5">
          <h2 className="font-display text-lg text-primary">
            {campWechatEnrollFlow ? '1）填写用户 ID 与微信号' : '1）填写用户 ID'}
          </h2>

          <div className="mt-4 grid gap-5">
            <div>
              <label className={labelClass}>用户ID（5位或6位数字）</label>
              <input
                className={inputClass}
                value={miniProgramUserId}
                onChange={(e) => setMiniProgramUserId(e.target.value)}
                placeholder="例如 12345 或 123456"
                inputMode="numeric"
                autoComplete="off"
                aria-label="用户ID"
                disabled={needCampPayWall === false}
              />
              {miniProgramUserId.trim().length > 0 && !miniProgramIdValid ? (
                <p className="mt-2 text-sm text-destructive">
                  请输入 5 位或 6 位纯数字的用户ID。
                </p>
              ) : null}
            </div>

            {campWechatEnrollFlow ? (
              <div>
                <label className={labelClass} htmlFor="camp-enroll-weixin">
                  微信号
                </label>
                <input
                  id="camp-enroll-weixin"
                  className={inputClass}
                  value={campWeixinInput}
                  onChange={(e) => setCampWeixinInput(e.target.value)}
                  placeholder="与微信「微信号」一致，便于老师添加"
                  autoComplete="off"
                  aria-label="微信号"
                  disabled={needCampPayWall === false}
                />
                {campWeixinInput.trim().length > 0 && campWeixinInputError ? (
                  <p className="mt-2 text-sm text-destructive" role="alert">
                    {campWeixinInputError}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    本期报名无需扫码加群，老师将按此微信号添加您。
                  </p>
                )}
              </div>
            ) : null}
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
                身份：<span className="font-semibold">{pricingIdentity || '未找到'}</span>
              </p>
              <p className="mt-1">
                本次应付金额：<span className="font-semibold text-primary">¥{amountYuan}</span>
              </p>
            </div>
          ) : null}
        </section>

        {needCampPayWall ? (
          <section className="rounded-2xl border border-border/70 bg-muted/20 p-4 md:p-5">
            <h2 className="font-display text-lg text-primary">
              {campWechatEnrollFlow
                ? `2）确认微信号并支付完成${campPhaseLabel}报名`
                : `2）去支付并完成${campPhaseLabel}报名`}
            </h2>

            {!miniProgramIdValid ? (
              <p className="mt-3 text-sm text-muted-foreground">请输入 6 位数字 ID 后再支付。</p>
            ) : campWechatEnrollFlow && campWeixinInputError ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {campWeixinInputError}
              </p>
            ) : miniUserLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">正在计算支付金额…</p>
            ) : (
              <>
                {miniUserError ? (
                  <p className="mt-3 text-sm text-destructive">
                    身份查询失败，请稍后重试或确认输入的 ID 是否正确。
                  </p>
                ) : !matchedForCampPricing ? (
                  <p className="mt-3 text-sm text-destructive">
                    未找到该 ID 对应的用户库或公众号学员名单记录，请确认输入后重试。
                  </p>
                ) : (
                  <>
                    {showWechatPayCard ? (
                      <WenjuanCampWechatPayCard
                        accountId={payAccountId ?? meRow?.id ?? null}
                        amountYuan={amountYuan}
                        userLibraryId={miniRow?.id ?? null}
                        publicAccountId={
                          !miniRow && publicStudentFound ? miniProgramUserId.trim() : null
                        }
                        description={campPayDescription}
                        openId={extractWechatOpenId(meRow)}
                        confirmPaidWithBackend={confirmPaidWithBackend}
                        onPaidMarked={() => setCampPayUnlocked(true)}
                        campWechatContact={campWechatContactForPay}
                      />
                    ) : null}

                    {showPayCompleteFallback ? (
                      <section
                        className="mb-8 rounded-2xl border border-border/80 bg-muted/40 p-5 text-left shadow-[0_4px_20px_-2px_rgba(93,112,82,0.12)]"
                        aria-label="支付确认"
                      >
                        <h2 className="font-display text-lg text-primary">须先完成支付</h2>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                          当前未启用页面内微信支付。若你已完成缴费，请点击下方按钮进行前端放行。
                        </p>
                        <button
                          type="button"
                          className="mt-4 min-h-12 rounded-full border-2 border-secondary bg-transparent px-6 py-3 text-sm font-bold text-secondary transition duration-300 ease-out hover:bg-secondary/10"
                          onClick={() => {
                            try {
                              sessionStorage.setItem(
                                WENJUAN_CAMP_PAY_OK_STORAGE_KEY,
                                '1'
                              );
                            } catch {
                              /* ignore */
                            }
                            setCampPayUnlocked(true);
                          }}
                        >
                          我已完成支付
                        </button>
                      </section>
                    ) : null}
                  </>
                )}
              </>
            )}
          </section>
        ) : null}

        {eligibilityError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            支付状态校验失败：{friendlyRequestErrorMessage(eligibilityError)}
          </p>
        ) : null}
      </article>
    </div>
  );
}
