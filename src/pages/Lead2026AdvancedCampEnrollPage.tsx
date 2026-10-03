import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { captureInviterRefFromUrl, clearInviterYonghukuId } from '../auth/inviterRef';
import { buildWechatOAuthUrlForWeixinBrowser } from '../auth/wechatLoginUrl';
import { clearZionJwt, getZionJwt, getZionJwtUserId } from '../auth/zionJwt';
import { BrandLogoMark } from '../components/BrandLogoMark';
import { WenjuanCampWechatPayCard } from '../components/WenjuanCampWechatPayCard';
import {
  canBypassAdvancedCampEnrollmentDeadline,
  getAdvancedCampAmountByIdentity,
  getAdvancedCampEnrollmentDeadlineAtMs,
  getAdvancedCampPayDescription,
  getAdvancedCampPayDescriptionAliases,
  getAdvancedCampPhaseFromLocation,
  getAdvancedCampPhaseLabel,
  getAdvancedCampSchedule,
  getAdvancedCampTitle,
  isAdvancedCampEnrollmentClosed,
} from '../constants/advancedCamp2026';
import { BRAND_LOGO_GLOBAL_DOC_TYPE } from '../constants/brand';
import {
  buildCampWechatContact,
  getCampWechatAdminAccountIds,
  parseCampWechatContactFields,
  type CampWechatFriendStatus,
  validateCampWeixinInput,
} from '../constants/campWechatContact';
import { WENJUAN_ADVANCED_CAMP_ORDER_TYPE } from '../constants/lead2026';
import {
  isWenjuanPayManualClientConfirmAllowed,
  isWenjuanWechatPayEnabled,
  WENJUAN_ADVANCED_CAMP_PAY_OK_STORAGE_KEY,
  WENJUAN_ADVANCED_CAMP_WXPAY_H5_PENDING_KEY,
  WENJUAN_PAY_WEBHOOK_RETRY_WAIT_MS,
  WENJUAN_PAY_WEBHOOK_WAIT_MS,
} from '../constants/wenjuanPayment';
import {
  BRAND_LOGO_FROM_GLOBAL_DOC,
  CAMP_ADMIN_PAID_USERS,
  CAMP_ADMIN_USER_LIBRARY_IDS,
  ADVANCED_CAMP_PREVIOUS_PAID_BY_USER_LIBRARY,
  GET_CAMP_ID_MATCHES,
  GET_CAMP_SERVICE_QR,
  ME_ACCOUNT,
  PATCH_CAMP_ORDER_WECHAT_CONTACT,
  WENJUAN_PAY_ELIGIBILITY,
} from '../graphql/operations';
import type {
  CampAdminPaidUsersData,
  CampAdminUserLibraryIdsData,
  CampIdMatchesQueryData,
  CampServiceQrQueryData,
} from '../types/camp2026';
import type {
  AdvancedCampPreviousPaymentByUserLibraryData,
  BrandLogoQueryData,
  MeAccountRow,
  WenjuanPayEligibilityData,
} from '../types/lead2026';
import { extractWechatOpenId } from '../payment/selfPay';
import { useSelfPayPaid } from '../payment/useSelfPayPaid';
import { isWeixinBrowser } from '../payment/weixinBrowser';
import { friendlyRequestErrorMessage } from '../utils/friendlyRequestError';

type Props = {
  courseVariant?: 'original' | 'phase2' | 'phase7' | 'phase9';
  wechatOAuthExchangePending?: boolean;
  wechatOAuthExchangeError?: string | null;
};

const inputClass =
  'w-full min-h-12 rounded-full border border-border bg-background/60 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';
const labelClass = 'mb-2 block font-display text-sm font-semibold text-foreground';

const ADVANCED_CAMP_HERO_IMG = '/assets/advanced-camp-hero.png';
const CAMP_SERVICE_QR_DOC_TYPE = '共修营客服';
const ADVANCED_CAMP_PHASE2_LABEL = '02期';
const ADVANCED_CAMP_PHASE2_PAY_DESCRIPTION = '2026二阶共修营02期';
const ADVANCED_CAMP_PHASE2_SCHEDULE = {
  dateRange: '7 月 19 日至 7 月 26 日',
  deadline: '7 月 18 日 18:00',
  timeSlots: ['06:00—08:00', '20:00—22:00'],
};
const ADVANCED_CAMP_PHASE2_ENROLLMENT_DEADLINE_AT =
  '2026-07-18T18:00:00+08:00';
const ADVANCED_CAMP_PHASE7_LABEL = '03期';
const ADVANCED_CAMP_PHASE7_PAY_DESCRIPTION = '2026二阶共修营03期-20260820';
const ADVANCED_CAMP_PHASE7_SCHEDULE = {
  dateRange: '8 月 20 日至 8 月 26 日',
  deadline: '8 月 19 日 18:00',
  timeSlots: ['06:00—08:00', '20:00—22:00'],
};
const ADVANCED_CAMP_PHASE7_ENROLLMENT_DEADLINE_AT =
  '2026-08-19T18:00:00+08:00';
const ADVANCED_CAMP_PHASE9_LABEL = '04期';
const ADVANCED_CAMP_PHASE9_PAY_DESCRIPTION = '2026二阶共修营04期-20261006';
const ADVANCED_CAMP_PHASE9_SCHEDULE = {
  dateRange: '10 月 6 日至 10 月 12 日',
  deadline: '10 月 5 日 18:00',
  timeSlots: ['06:00—08:00', '20:00—22:00'],
};
const ADVANCED_CAMP_PHASE9_ENROLLMENT_DEADLINE_AT =
  '2026-10-05T18:00:00+08:00';
const ADVANCED_CAMP_WECHAT_ADMIN_ACCOUNT_IDS = new Set([
  '1000000000009519',
  '10000000000009519',
]);

function isZionPaymentSuccessful(status: string | null | undefined): boolean {
  return String(status ?? '').toUpperCase() === 'SUCCESSFUL';
}

function isDescriptionMatch(
  description: string | null | undefined,
  aliases: string[]
): boolean {
  const normalized = String(description ?? '').trim();
  return Boolean(normalized) && aliases.includes(normalized);
}

function isAdvancedCampWechatAdminAccount(accountId: string | null | undefined): boolean {
  const normalized = String(accountId ?? '').trim();
  if (!normalized) return false;
  return (
    ADVANCED_CAMP_WECHAT_ADMIN_ACCOUNT_IDS.has(normalized) ||
    getCampWechatAdminAccountIds().has(normalized)
  );
}

function formatPaidAmountText(record: {
  order: {
    ud_dingdanjine_a50087: string | null;
    ud_dingdanjine0028zhengshu0029_1070ec: number | null;
  } | null;
}): string {
  const decimalRaw = record.order?.ud_dingdanjine_a50087;
  const decimal = decimalRaw === null || decimalRaw === undefined ? '' : String(decimalRaw).trim();
  if (decimal) return `¥${decimal}`;
  const fen = record.order?.ud_dingdanjine0028zhengshu0029_1070ec;
  if (typeof fen === 'number' && Number.isFinite(fen)) return `¥${(fen / 100).toFixed(2)}`;
  return '—';
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
        <BrandLogoMark url={logoUrl} title="二阶共修营报名" className="mb-4" />
        <h1 className="mt-1 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text font-display text-4xl font-extrabold tracking-[0.08em] text-transparent md:text-5xl">
          天启无书
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-base font-medium leading-relaxed text-foreground">
          《透过现象·直击本质》二阶共修营
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          请先完成微信授权登录。登录后可查看课程详情并按 ID 匹配报名费用。
        </p>

        {oauthExchangePending ? (
          <p className="mx-auto mt-4 max-w-sm rounded-xl border border-primary/40 bg-primary/5 p-3 text-center text-sm text-foreground">
            正在向 Zion 换取登录状态，请稍候…
          </p>
        ) : null}

        {oauthExchangeError && !oauthExchangePending ? (
          <p className="mx-auto mt-4 max-w-sm rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-left text-xs text-accent-foreground">
            <span className="font-semibold text-destructive">微信登录未完成</span>
            <span className="mt-1 block text-muted-foreground">
              {oauthExchangeError}
            </span>
          </p>
        ) : null}

        {!wechatOAuthConfigured ? (
          <p className="mx-auto mt-6 rounded-2xl border border-secondary/40 bg-accent/40 p-4 text-left text-xs text-accent-foreground">
            当前未配置微信 OAuth 入口。请在项目环境变量中设置{' '}
            <code className="text-foreground">VITE_ZION_WECHAT_OAUTH_URL</code>。
          </p>
        ) : null}

        <div className="mt-8 flex flex-col items-stretch gap-3 sm:items-center">
          {wechatUrlMobile ? (
            inWeChatBrowser ? (
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
                  className="max-w-sm rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-left text-xs leading-relaxed text-accent-foreground"
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
            )
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

function CourseDetail({
  title,
  phaseLabel,
  schedule,
  isPhase2Course,
  isPhase7Course,
  isPhase9Course,
}: {
  title: string;
  phaseLabel: string;
  schedule: { dateRange: string; deadline: string; timeSlots: string[] };
  isPhase2Course: boolean;
  isPhase7Course: boolean;
  isPhase9Course: boolean;
}) {
  return (
    <article className="space-y-6">
      <section className="relative min-h-[560px] overflow-hidden rounded-[2rem] border border-border/50 bg-foreground text-white shadow-organic md:min-h-[640px]">
        <img
          src={ADVANCED_CAMP_HERO_IMG}
          alt="透过现象直击本质课程主题插画"
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/18 to-black/62"
          aria-hidden
        />
        <div className="relative flex min-h-[560px] flex-col justify-between p-5 md:min-h-[640px] md:p-8">
          <div className="flex flex-wrap gap-2">
            {['天启无书', '纠偏培优体系', phaseLabel].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/35 bg-white/18 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="max-w-3xl pb-2">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-white/85">
              7 天二阶深度共修
            </p>
            <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight text-white md:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-white/90 md:text-lg">
              从现象进入本质，从治标走向根源。面向一阶共修后的家庭，帮助父母完成教育认知的深度升级。
            </p>
            {isPhase2Course ? (
              <p className="mt-3 inline-flex rounded-full border border-white/35 bg-white/18 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
                课程内容全新制作，聚焦透过现象看到本质。
              </p>
            ) : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/30 bg-white/18 p-3 backdrop-blur">
                <p className="text-xs font-semibold text-white/75">开营时间</p>
                <p className="mt-1 font-display text-lg text-white">{schedule.dateRange}</p>
              </div>
              <div className="rounded-2xl border border-white/30 bg-white/18 p-3 backdrop-blur">
                <p className="text-xs font-semibold text-white/75">学习时段</p>
                <p className="mt-1 text-sm font-semibold leading-snug text-white">
                  {schedule.timeSlots.join(' / ')}
                </p>
              </div>
              <div className="rounded-2xl border border-white/30 bg-white/18 p-3 backdrop-blur">
                <p className="text-xs font-semibold text-white/75">报名截止</p>
                <p className="mt-1 font-display text-lg text-white">{schedule.deadline}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-organic-sm md:p-7">
        <div className="grid gap-5 md:grid-cols-[0.7fr_1.3fr] md:items-start">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
              Important Notice
            </p>
            <h2 className="mt-2 font-display text-2xl text-foreground md:text-3xl">
              重要说明
            </h2>
          </div>
          <ol className="space-y-3 text-sm leading-relaxed text-foreground/90 md:text-base">
            <li className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <span className="mr-2 font-display text-lg font-semibold text-primary">1.</span>
              建档家长此前享有的全部原有免费课程与家庭教育指导服务，权益完整保留、不会缩水。即便不报名本次二阶课程，依托现有体系内容，也完全可以正常解决孩子教育中的各类常规问题，不会影响后续任何帮扶指导。
            </li>
            <li className="rounded-2xl border border-secondary/25 bg-secondary/5 p-4">
              <span className="mr-2 font-display text-lg font-semibold text-secondary">2.</span>
              《透过现象·直击本质》二阶共修营，不属于最初规划的免费服务范畴，是团队额外研发的增值付费进阶项目，全程自愿参与，绝不做强制要求。
            </li>
          </ol>
        </div>
      </section>

      <section className="rounded-[2rem] border border-border/70 bg-[#FEFEFA] p-5 shadow-organic-sm md:p-7">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Core Value
            </p>
            <h2 className="mt-2 font-display text-2xl text-foreground md:text-3xl">
              跳出治标式处理模式
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
              二阶课程带领大家从根源破解长期难以改善的育儿卡点，帮助追求究竟的家长完成教育认知的深度升级。
            </p>
          </div>
          <div className="grid gap-3">
          {[
            ['根源纠偏', '不止处理表面行为，而是回到问题发生的底层逻辑。'],
            ['实操落地', '拒绝空洞说教，以同伴共学和每日践行为核心。'],
            ['长效培优', '帮助父母升级认知，给孩子更稳定的成长环境。'],
          ].map(([titleText, body]) => (
            <div
              key={titleText}
              className="rounded-2xl border border-border/70 bg-background/70 p-4"
            >
              <h3 className="font-display text-lg text-primary">{titleText}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-organic-sm md:p-7">
          <h2 className="font-display text-2xl text-foreground">参与条件</h2>
          <p className="mt-3 text-sm leading-relaxed text-foreground/90">
            仅限完成《父母学习·孩子蜕变》一阶共修营的学员自主选择报名。
          </p>
          <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-sm leading-relaxed text-foreground/90">
            <p className="font-semibold text-primary">收费标准</p>
            <p className="mt-2">
              未建档家长：学费 1680 元{isPhase7Course || isPhase9Course ? '。' : '，支持课程复训 3 次。'}
            </p>
            <p className="mt-1">
              已建档家长：特惠学费 680 元{isPhase7Course || isPhase9Course ? '。' : '，支持课程复训 3 次。'}
            </p>
          </div>
        </div>
        <div className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-organic-sm md:p-7">
          <h2 className="font-display text-2xl text-foreground">学习规则</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground/90">
            <li>营期开启后，不再接收任何新增学员。</li>
            <li>线上会议室迟到 15 分钟，将无法进入当期课堂。</li>
            <li>每日双时段学习，可根据个人时间灵活参与。</li>
            <li>导师线上实时带学，学员需完成每日学习打卡。</li>
          </ol>
        </div>
      </section>
    </article>
  );
}

export function Lead2026AdvancedCampEnrollPage({
  courseVariant = 'original',
  wechatOAuthExchangePending = false,
  wechatOAuthExchangeError = null,
}: Props = {}) {
  const isPhase2Course = courseVariant === 'phase2';
  const isPhase7Course = courseVariant === 'phase7';
  const isPhase9Course = courseVariant === 'phase9';
  const token = getZionJwt();
  const jwtAccountId = getZionJwtUserId();
  const wechatOAuthConfigured = Boolean(
    import.meta.env.VITE_ZION_WECHAT_OAUTH_URL?.trim()
  );
  const inWeChatBrowser = isWeixinBrowser();
  const wechatUrlMobile = buildWechatOAuthUrlForWeixinBrowser();
  const phase = useMemo(() => getAdvancedCampPhaseFromLocation(), []);
  const originalPhaseLabel = useMemo(() => getAdvancedCampPhaseLabel(phase), [phase]);
  const phaseLabel = isPhase9Course
    ? ADVANCED_CAMP_PHASE9_LABEL
    : isPhase7Course
    ? ADVANCED_CAMP_PHASE7_LABEL
    : isPhase2Course
      ? ADVANCED_CAMP_PHASE2_LABEL
      : originalPhaseLabel;
  const courseTitle = isPhase9Course
    ? `《透过现象·直击本质》二阶共修营${ADVANCED_CAMP_PHASE9_LABEL}`
    : isPhase7Course
    ? `《透过现象·直击本质》二阶共修营${ADVANCED_CAMP_PHASE7_LABEL}`
    : isPhase2Course
      ? `《透过现象·直击本质》二阶共修营${ADVANCED_CAMP_PHASE2_LABEL}`
      : getAdvancedCampTitle(phase);
  const schedule = useMemo(
    () =>
      isPhase9Course
        ? ADVANCED_CAMP_PHASE9_SCHEDULE
        : isPhase7Course
        ? ADVANCED_CAMP_PHASE7_SCHEDULE
        : isPhase2Course
          ? ADVANCED_CAMP_PHASE2_SCHEDULE
          : getAdvancedCampSchedule(phase),
    [isPhase2Course, isPhase7Course, isPhase9Course, phase]
  );
  const payDescription = useMemo(
    () =>
      isPhase9Course
        ? ADVANCED_CAMP_PHASE9_PAY_DESCRIPTION
        : isPhase7Course
        ? ADVANCED_CAMP_PHASE7_PAY_DESCRIPTION
        : isPhase2Course
        ? ADVANCED_CAMP_PHASE2_PAY_DESCRIPTION
        : getAdvancedCampPayDescription(phase),
    [isPhase2Course, isPhase7Course, isPhase9Course, phase]
  );
  const payDescriptionAliases = useMemo(() => {
    const originalAliases = getAdvancedCampPayDescriptionAliases(phase);
    return isPhase9Course
      ? [ADVANCED_CAMP_PHASE9_PAY_DESCRIPTION]
      : isPhase7Course
      ? [ADVANCED_CAMP_PHASE7_PAY_DESCRIPTION]
      : isPhase2Course
      ? [ADVANCED_CAMP_PHASE2_PAY_DESCRIPTION, ...originalAliases]
      : originalAliases;
  }, [isPhase2Course, isPhase7Course, isPhase9Course, phase]);
  /**
   * 往期二阶共修营的缴费标识：命中即视为「已报名过二阶」，本期免缴费。
   * 04期（phase9）需识别 01/02/03 期全部历史缴费，故把 phase7（03期）描述一并纳入。
   */
  const previousPhasePaymentDescriptionAliases = useMemo(
    () => [
      ADVANCED_CAMP_PHASE7_PAY_DESCRIPTION,
      ADVANCED_CAMP_PHASE2_PAY_DESCRIPTION,
      ...getAdvancedCampPayDescriptionAliases(phase),
    ],
    [phase]
  );
  const paidOkStorageKey = isPhase9Course
    ? 'tqwj_advanced_camp_phase9_paid_ok'
    : isPhase7Course
    ? 'tqwj_advanced_camp_phase7_paid_ok'
    : WENJUAN_ADVANCED_CAMP_PAY_OK_STORAGE_KEY;
  const h5PendingStorageKey = isPhase9Course
    ? 'tqwj_advanced_camp_phase9_wxpay_h5_pending'
    : isPhase7Course
    ? 'tqwj_advanced_camp_phase7_wxpay_h5_pending'
    : WENJUAN_ADVANCED_CAMP_WXPAY_H5_PENDING_KEY;
  const [enrollGateNowMs, setEnrollGateNowMs] = useState(() => Date.now());
  const timeEnrollmentClosed = isPhase9Course
    ? enrollGateNowMs >= Date.parse(ADVANCED_CAMP_PHASE9_ENROLLMENT_DEADLINE_AT)
    : isPhase7Course
    ? enrollGateNowMs >= Date.parse(ADVANCED_CAMP_PHASE7_ENROLLMENT_DEADLINE_AT)
    : isPhase2Course
      ? enrollGateNowMs >= Date.parse(ADVANCED_CAMP_PHASE2_ENROLLMENT_DEADLINE_AT)
      : isAdvancedCampEnrollmentClosed(phase, enrollGateNowMs);
  const enrollmentDeadlineMs = useMemo(
    () =>
      isPhase9Course
        ? Date.parse(ADVANCED_CAMP_PHASE9_ENROLLMENT_DEADLINE_AT)
        : isPhase7Course
        ? Date.parse(ADVANCED_CAMP_PHASE7_ENROLLMENT_DEADLINE_AT)
        : isPhase2Course
        ? Date.parse(ADVANCED_CAMP_PHASE2_ENROLLMENT_DEADLINE_AT)
        : getAdvancedCampEnrollmentDeadlineAtMs(phase),
    [isPhase2Course, isPhase7Course, isPhase9Course, phase]
  );

  useLayoutEffect(() => {
    captureInviterRefFromUrl();
  }, []);

  useEffect(() => {
    document.title = courseTitle;
  }, [courseTitle]);

  useEffect(() => {
    if (enrollGateNowMs >= enrollmentDeadlineMs) return;
    const delay = enrollmentDeadlineMs - Date.now() + 500;
    const timer = window.setTimeout(() => setEnrollGateNowMs(Date.now()), delay);
    const interval = window.setInterval(() => setEnrollGateNowMs(Date.now()), 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [enrollGateNowMs, enrollmentDeadlineMs]);

  const { data: logoData } = useQuery<BrandLogoQueryData>(BRAND_LOGO_FROM_GLOBAL_DOC, {
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
  const loginAccountId = String(jwtAccountId ?? meRow?.id ?? '').trim();
  const isAdvancedCampWechatAdmin =
    isAdvancedCampWechatAdminAccount(loginAccountId);
  const canEnrollAfterDeadline =
    canBypassAdvancedCampEnrollmentDeadline(loginAccountId);
  const enrollmentClosed = timeEnrollmentClosed && !canEnrollAfterDeadline;
  const payAccountId = useMemo(() => {
    if (jwtAccountId && /^\d+$/.test(jwtAccountId)) return jwtAccountId;
    const id = meRow?.id?.trim();
    if (id && /^\d+$/.test(id)) return id;
    return null;
  }, [jwtAccountId, meRow?.id]);
  const [adminSearchInput, setAdminSearchInput] = useState('');
  const [wechatStatusUpdatingOrderId, setWechatStatusUpdatingOrderId] = useState<
    string | null
  >(null);
  const [wechatAdminDrafts, setWechatAdminDrafts] = useState<Record<string, string>>({});

  const [patchCampOrderWechatContact] = useMutation(PATCH_CAMP_ORDER_WECHAT_CONTACT);
  const {
    data: adminPaidUsersData,
    loading: adminPaidUsersLoading,
    error: adminPaidUsersError,
    refetch: refetchAdminPaidUsers,
  } = useQuery<CampAdminPaidUsersData>(CAMP_ADMIN_PAID_USERS, {
    skip: !token || !isAdvancedCampWechatAdmin,
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  const advancedCampWechatAdminPaidRows = useMemo(() => {
    return (adminPaidUsersData?.fz_payment_record ?? []).filter((row) => {
      if (row.order?.ud_dingdanleixing_3fb8b8 !== WENJUAN_ADVANCED_CAMP_ORDER_TYPE) {
        return false;
      }
      return isDescriptionMatch(row.order?.ud_dingdanbeizhu_439d3a, payDescriptionAliases);
    });
  }, [adminPaidUsersData, payDescriptionAliases]);

  const adminUserLibraryIds = useMemo(() => {
    const ids = new Set<string>();
    advancedCampWechatAdminPaidRows.forEach((row) => {
      const raw = row.order?.ud_yonghuxinxi_yonghuku_55773d;
      const id = raw === null || raw === undefined ? '' : String(raw).trim();
      if (/^\d+$/.test(id)) ids.add(id);
    });
    return Array.from(ids);
  }, [advancedCampWechatAdminPaidRows]);

  const { data: adminUserLibraryMapData } = useQuery<CampAdminUserLibraryIdsData>(
    CAMP_ADMIN_USER_LIBRARY_IDS,
    {
      variables: { userLibraryIds: adminUserLibraryIds },
      skip: !isAdvancedCampWechatAdmin || adminUserLibraryIds.length === 0,
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

  const filteredWechatAdminRows = useMemo(() => {
    const keyword = adminSearchInput.trim();
    if (!keyword) return advancedCampWechatAdminPaidRows;
    return advancedCampWechatAdminPaidRows.filter((row) => {
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
  }, [adminSearchInput, advancedCampWechatAdminPaidRows, userLibraryIdToMiniId]);

  const [miniProgramUserId, setMiniProgramUserId] = useState('');
  const [campWeixinInput, setCampWeixinInput] = useState('');
  const miniProgramIdValid = useMemo(
    () => /^\d{5,6}$/.test(miniProgramUserId.trim()),
    [miniProgramUserId]
  );
  const campWeixinInputError = useMemo(
    () => validateCampWeixinInput(campWeixinInput),
    [campWeixinInput]
  );
  const campWechatContactForPay = useMemo(() => {
    if (campWeixinInputError) return null;
    return buildCampWechatContact(campWeixinInput, '未进群');
  }, [campWeixinInput, campWeixinInputError]);
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
  const publicStudentFound = Boolean(publicStudentRow);
  const miniFound = Boolean(miniRow);
  const pricingIdentity =
    miniRow?.identity?.trim() || (publicStudentFound ? '公众号学员名单' : null);
  const fallbackPublicAccountId =
    !miniFound && miniProgramIdValid ? miniProgramUserId.trim() : null;
  const amountYuan = useMemo(
    () => getAdvancedCampAmountByIdentity(pricingIdentity),
    [pricingIdentity]
  );
  const userLibraryIdForPreviousPayment = String(miniRow?.id ?? '').trim();
  /** 仅公众号学员名单、无用户库记录时的公众号ID；无值时用哨兵避免误匹配空值 */
  const publicAccountIdForPreviousPayment = !miniFound && miniProgramIdValid ? miniProgramUserId.trim() : '';
  const hasPreviousPaymentIdentifier =
    /^\d+$/.test(userLibraryIdForPreviousPayment) ||
    Boolean(publicAccountIdForPreviousPayment);
  const {
    data: previousPaidByUserLibraryData,
    loading: previousPaidByUserLibraryLoading,
    error: previousPaidByUserLibraryError,
  } = useQuery<AdvancedCampPreviousPaymentByUserLibraryData>(
    ADVANCED_CAMP_PREVIOUS_PAID_BY_USER_LIBRARY,
    {
      variables: {
        userLibraryId: /^\d+$/.test(userLibraryIdForPreviousPayment)
          ? userLibraryIdForPreviousPayment
          : '0',
        publicAccountId: publicAccountIdForPreviousPayment || '__none__',
      },
      skip:
        !token ||
        (!isPhase7Course && !isPhase9Course) ||
        !hasPreviousPaymentIdentifier,
      fetchPolicy: 'network-only',
    }
  );
  const previousPhasePaidById = useMemo(() => {
    if ((!isPhase7Course && !isPhase9Course) || !hasPreviousPaymentIdentifier) {
      return false;
    }
    return (previousPaidByUserLibraryData?.fz_payment_record ?? []).some((record) => {
      if (!isZionPaymentSuccessful(record.status)) return false;
      const description = record.order?.ud_dingdanbeizhu_439d3a ?? record.description;
      return isDescriptionMatch(description, previousPhasePaymentDescriptionAliases);
    });
  }, [
    hasPreviousPaymentIdentifier,
    isPhase7Course,
    isPhase9Course,
    previousPhasePaymentDescriptionAliases,
    previousPaidByUserLibraryData,
  ]);
  const checkingPreviousPhaseEligibility =
    (isPhase7Course || isPhase9Course) &&
    miniProgramIdValid &&
    hasPreviousPaymentIdentifier &&
    previousPaidByUserLibraryLoading;

  const apolloClient = useApolloClient();
  const {
    data: eligibilityData,
    loading: eligibilityLoading,
    error: eligibilityError,
    refetch: refetchEligibility,
  } = useQuery<WenjuanPayEligibilityData>(WENJUAN_PAY_ELIGIBILITY, {
    variables: { accountId: payAccountId ?? '0' },
    skip: !token || !payAccountId,
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  const paidViaZion = useMemo(() => {
    const rows = eligibilityData?.fz_payment_record;
    if (!rows?.length) return false;
    return rows.some((r) => {
      if (!isZionPaymentSuccessful(r.status)) return false;
      return isDescriptionMatch(r.description, payDescriptionAliases);
    });
  }, [eligibilityData, payDescriptionAliases]);

  /** 自建支付通道：pay-service 回调把订单表状态置为「已支付」，此处补一路已付判定 */
  const { paid: selfPayPaid } = useSelfPayPaid({
    enabled: true,
    userLibraryId: miniRow?.id ?? null,
    publicAccountId: fallbackPublicAccountId,
    aliases: payDescriptionAliases,
  });

  const [payUnlocked, setPayUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(paidOkStorageKey) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (paidViaZion) setPayUnlocked(true);
  }, [paidViaZion]);

  useEffect(() => {
    if (selfPayPaid) setPayUnlocked(true);
  }, [selfPayPaid]);

  useEffect(() => {
    if (!token || paidViaZion) return;
    let pending = false;
    try {
      pending =
        sessionStorage.getItem(h5PendingStorageKey) === '1';
    } catch {
      /* ignore */
    }
    if (!pending) return;
    const t = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(h5PendingStorageKey);
      } catch {
        /* ignore */
      }
      void refetchEligibility();
    }, WENJUAN_PAY_WEBHOOK_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [h5PendingStorageKey, token, paidViaZion, refetchEligibility]);

  useEffect(() => {
    if (!token || !payAccountId || paidViaZion) return;
    const timer = window.setInterval(() => {
      void refetchEligibility();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [token, payAccountId, paidViaZion, refetchEligibility]);

  const confirmPaidWithBackend = useCallback(async (): Promise<boolean> => {
    if (!payAccountId) return false;
    const hasOk = (data: WenjuanPayEligibilityData | undefined): boolean =>
      data?.fz_payment_record?.some((rec) => {
        if (!isZionPaymentSuccessful(rec.status)) return false;
        return isDescriptionMatch(rec.description, payDescriptionAliases);
      }) ?? false;
    let waitMs = WENJUAN_PAY_WEBHOOK_WAIT_MS;
    for (let i = 0; i < 10; i += 1) {
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
  }, [apolloClient, payAccountId, payDescriptionAliases, refetchEligibility]);

  const updateOrderWechatFriendStatus = useCallback(
    async (orderId: string, nextStatus: CampWechatFriendStatus) => {
      if (!/^\d+$/.test(orderId)) {
        window.alert(`订单 ID 异常：${orderId || '空'}。请刷新页面后重试。`);
        return;
      }
      const row = advancedCampWechatAdminPaidRows.find(
        (r) => String(r.order?.id) === orderId
      );
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
        const refetched = await refetchAdminPaidUsers();
        const updatedRow = (refetched.data?.fz_payment_record ?? []).find(
          (r) => String(r.order?.id) === orderId
        );
        const updatedContact = parseCampWechatContactFields(
          updatedRow?.order?.ud_gongxiuyingweixin_62acc6,
          updatedRow?.order?.ud_tianjiazhuangtai_a1779b
        );
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
    [
      advancedCampWechatAdminPaidRows,
      patchCampOrderWechatContact,
      refetchAdminPaidUsers,
    ]
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
        const refetched = await refetchAdminPaidUsers();
        const updatedRow = (refetched.data?.fz_payment_record ?? []).find(
          (r) => String(r.order?.id) === orderId
        );
        const updatedContact = parseCampWechatContactFields(
          updatedRow?.order?.ud_gongxiuyingweixin_62acc6,
          updatedRow?.order?.ud_tianjiazhuangtai_a1779b
        );
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
    [patchCampOrderWechatContact, refetchAdminPaidUsers, wechatAdminDrafts]
  );

  const { data: serviceQrData } = useQuery<CampServiceQrQueryData>(GET_CAMP_SERVICE_QR, {
    variables: { type: CAMP_SERVICE_QR_DOC_TYPE },
    fetchPolicy: 'network-only',
  });
  const serviceQrUrl =
    serviceQrData?.ud_quanjuwendang_d0da48?.[0]?.ud_tupian_3212f2?.url ?? null;

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

  if (isAdvancedCampWechatAdmin) {
    return (
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 md:py-14">
        <header className="mb-8 text-center">
          <BrandLogoMark
            url={brandLogoUrl}
            title={`二阶共修营后台 · ${phaseLabel}`}
            isPrimaryPageHeading
            className="mb-5"
          />
          <h1 className="font-display text-3xl text-foreground md:text-4xl">
            已报名缴费用户管理
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            仅展示已完成支付的二阶共修营用户。可查看报名 ID、微信号，并标记老师是否已添加。
          </p>
          <LoginAccountIdHint accountId={jwtAccountId ?? meRow?.id ?? null} />
          <button
            type="button"
            className="mt-3 text-sm text-muted-foreground underline decoration-border hover:text-foreground"
            onClick={() => {
              clearInviterYonghukuId();
              clearZionJwt();
              window.location.reload();
            }}
          >
            退出并换帐号
          </button>
        </header>

        <section className="mb-6 rounded-[2rem] border border-border bg-card p-5 shadow-organic-sm md:p-6">
          <label className={labelClass} htmlFor="advanced-camp-admin-search">
            搜索报名 ID / 微信号
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="advanced-camp-admin-search"
              className={inputClass}
              value={adminSearchInput}
              onChange={(e) => setAdminSearchInput(e.target.value)}
              placeholder="输入用户 ID、公众号 ID 或微信号关键字"
              autoComplete="off"
            />
            <button
              type="button"
              className="min-h-12 rounded-full border border-border px-6 py-3 text-sm text-muted-foreground transition hover:bg-muted/50"
              onClick={() => void refetchAdminPaidUsers()}
            >
              刷新列表
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            当前结果：{filteredWechatAdminRows.length} 条（{phaseLabel}已缴费{' '}
            {advancedCampWechatAdminPaidRows.length} 条）
          </p>
        </section>

        <section className="rounded-[2rem] border border-border bg-card p-4 shadow-organic-sm md:p-6">
          {adminPaidUsersLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">正在加载…</p>
          ) : null}

          {adminPaidUsersError ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-accent-foreground">
              读取失败：{friendlyRequestErrorMessage(adminPaidUsersError)}
            </p>
          ) : null}

          {!adminPaidUsersLoading && !adminPaidUsersError && filteredWechatAdminRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无{phaseLabel}报名缴费记录。
            </p>
          ) : null}

          {!adminPaidUsersLoading && !adminPaidUsersError && filteredWechatAdminRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      用户库ID / 公众号ID
                    </th>
                    <th className="min-w-[88px] px-3 py-2 font-medium">微信号</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">添加状态</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">操作</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">支付金额</th>
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
                    const isAdded = contact?.friend_status === '已进群';
                    const busyThis = wechatStatusUpdatingOrderId === orderId;
                    const draftWeixin = wechatAdminDrafts[orderId] ?? '';
                    const nextStatus: CampWechatFriendStatus = isAdded
                      ? '未进群'
                      : '已进群';
                    const toggleLabel = isAdded ? '撤销添加' : '标记为已添加';
                    return (
                      <tr
                        key={String(row.id)}
                        className="rounded-2xl border border-border/70 bg-background/60 text-foreground"
                      >
                        <td className="px-3 py-3 font-mono whitespace-nowrap">{miniId}</td>
                        <td className="max-w-[150px] px-3 py-3 break-all">
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
                              isAdded
                                ? 'border border-primary/30 bg-primary/15 text-primary'
                                : 'border border-secondary/30 bg-secondary/10 text-secondary'
                            }`}
                          >
                            {isAdded ? '已添加' : '未添加'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            disabled={busyThis || !contact?.weixin}
                            className={`min-h-10 rounded-full px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              isAdded
                                ? 'border border-border bg-background text-muted-foreground hover:bg-muted/50'
                                : 'bg-primary text-primary-foreground shadow-organic-sm hover:scale-105'
                            }`}
                            onClick={() =>
                              void updateOrderWechatFriendStatus(orderId, nextStatus)
                            }
                          >
                            {busyThis ? '处理中…' : toggleLabel}
                          </button>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatPaidAmountText(row)}
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

  const paid =
    paidViaZion || selfPayPaid || payUnlocked || previousPhasePaidById;
  const showWechatPayCard = isWenjuanWechatPayEnabled();
  const showPayCompleteFallback =
    !showWechatPayCard && isWenjuanPayManualClientConfirmAllowed();

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 md:py-14">
      <header className="mb-10 text-center">
        <BrandLogoMark
          url={brandLogoUrl}
          title={`二阶共修营报名 · ${phaseLabel}`}
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
              clearInviterYonghukuId();
              clearZionJwt();
              window.location.reload();
            }}
          >
            退出并换帐号
          </button>
        </div>
        <LoginAccountIdHint accountId={loginAccountId || null} />
      </header>

      <CourseDetail
        title={courseTitle}
        phaseLabel={phaseLabel}
        schedule={schedule}
        isPhase2Course={isPhase2Course}
        isPhase7Course={isPhase7Course}
        isPhase9Course={isPhase9Course}
      />

      <section className="mt-7 rounded-tl-[1.75rem] rounded-tr-[1.25rem] rounded-br-[2rem] rounded-bl-[1.35rem] border border-border bg-card p-5 shadow-organic-sm md:p-10">
        {paid ? (
          <div className="text-center">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              报名成功
            </p>
            <h2 className="mt-3 font-display text-3xl text-foreground">
              已完成二阶共修营报名
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {previousPhasePaidById
                ? '系统已识别到该用户 ID 曾成功报名二阶共修营并完成缴费，本期可免费报名。请联系进群小助手，受邀进入专属学习社群。'
                : '系统已识别到本期报名付款成功。请联系进群小助手，受邀进入专属学习社群。'}
            </p>
            {serviceQrUrl ? (
              <div className="mx-auto mt-6 max-w-xs rounded-2xl border border-border/70 bg-background/60 p-4">
                <img
                  src={serviceQrUrl}
                  alt="进群小助手二维码"
                  className="mx-auto aspect-square w-full rounded-xl object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <p className="mt-3 text-xs text-muted-foreground">扫码联系进群小助手</p>
              </div>
            ) : null}
          </div>
        ) : enrollmentClosed ? (
          <div className="text-center">
            <h2 className="font-display text-3xl text-foreground">本期报名已结束</h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-foreground/85 md:text-base">
              {phaseLabel}二阶共修营报名已于 {schedule.deadline} 截止，请关注后续新一期开放通知。
            </p>
          </div>
        ) : (
          <>
            <h2 className="font-display text-lg text-primary">报名缴费</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              请输入你的用户 ID 与微信号，系统会按身份自动匹配报名费用。
            </p>

            <div className="mt-5 grid gap-5">
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
                />
                {miniProgramUserId.trim().length > 0 && !miniProgramIdValid ? (
                  <p className="mt-2 text-sm text-destructive">
                    请输入 5 位或 6 位纯数字的用户ID。
                  </p>
                ) : null}
              </div>

              <div>
                <label className={labelClass} htmlFor="advanced-camp-enroll-weixin">
                  微信号
                </label>
                <input
                  id="advanced-camp-enroll-weixin"
                  className={inputClass}
                  value={campWeixinInput}
                  onChange={(e) => setCampWeixinInput(e.target.value)}
                  placeholder="与微信「微信号」一致，便于老师添加"
                  autoComplete="off"
                  aria-label="微信号"
                />
                {campWeixinInput.trim().length > 0 && campWeixinInputError ? (
                  <p className="mt-2 text-sm text-destructive" role="alert">
                    {campWeixinInputError}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    报名成功后，老师将通过此微信号添加您并邀请进群。
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
                  身份：
                  <span className="font-semibold">
                    {pricingIdentity || '未找到，按未建档家长'}
                  </span>
                </p>
                <p className="mt-1">
                  本次应付金额：
                  <span className="font-semibold text-primary">
                    {previousPhasePaidById ? '免缴费（往期已成功报名缴费）' : `¥${amountYuan}`}
                  </span>
                </p>
                {checkingPreviousPhaseEligibility ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    正在核验该用户 ID 往期二阶共修营的缴费记录…
                  </p>
                ) : null}
                {previousPaidByUserLibraryError ? (
                  <p className="mt-2 text-xs text-destructive">
                    历史缴费记录核验失败，请稍后重试后再支付。
                  </p>
                ) : null}
                {!pricingIdentity ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    未在用户库或公众号学员名单中匹配到该 ID，可继续按未建档家长标准报名。
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6">
              {!miniProgramIdValid ? (
                <p className="text-sm text-muted-foreground">请输入 ID 后再支付。</p>
              ) : campWeixinInputError ? (
                <p className="text-sm text-destructive" role="alert">
                  {campWeixinInputError}
                </p>
              ) : miniUserLoading ? (
                <p className="text-sm text-muted-foreground">正在计算支付金额…</p>
              ) : checkingPreviousPhaseEligibility ? (
                <p className="text-sm text-muted-foreground">正在核验往期缴费记录…</p>
              ) : previousPaidByUserLibraryError ? (
                <p className="text-sm text-destructive" role="alert">
                  历史缴费记录核验失败，请刷新页面后重试。
                </p>
              ) : (
                <>
                  {eligibilityError ? (
                    <div
                      className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-accent-foreground"
                      role="alert"
                    >
                      <p>支付状态校验失败：{friendlyRequestErrorMessage(eligibilityError)}</p>
                      <button
                        type="button"
                        className="mt-2 text-sm font-semibold text-primary underline decoration-primary/40 underline-offset-2"
                        onClick={() => void refetchEligibility()}
                      >
                        点击重试
                      </button>
                    </div>
                  ) : null}
                  {eligibilityLoading ? (
                    <p className="mb-3 text-sm text-muted-foreground">正在确认支付状态…</p>
                  ) : null}
                  {showWechatPayCard ? (
                    <WenjuanCampWechatPayCard
                      accountId={payAccountId ?? meRow?.id ?? null}
                      amountYuan={amountYuan}
                      userLibraryId={miniRow?.id ?? null}
                      publicAccountId={fallbackPublicAccountId}
                      description={payDescription}
                      orderType={WENJUAN_ADVANCED_CAMP_ORDER_TYPE}
                      openId={extractWechatOpenId(meRow)}
                      paidOkStorageKey={paidOkStorageKey}
                      h5PendingStorageKey={h5PendingStorageKey}
                      confirmPaidWithBackend={confirmPaidWithBackend}
                      onPaidMarked={() => setPayUnlocked(true)}
                      campWechatContact={campWechatContactForPay}
                    />
                  ) : null}
                  {showPayCompleteFallback ? (
                    <section className="mb-8 rounded-2xl border border-border/80 bg-muted/40 p-5 text-left shadow-[0_4px_20px_-2px_rgba(93,112,82,0.12)]">
                      <h3 className="font-display text-lg text-primary">须先完成支付</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        当前未启用页面内微信支付。若已完成缴费，可点击下方按钮放行。
                      </p>
                      <button
                        type="button"
                        className="mt-4 min-h-12 rounded-full border-2 border-secondary bg-transparent px-6 py-3 text-sm font-bold text-secondary transition duration-300 ease-out hover:bg-secondary/10"
                        onClick={() => {
                          try {
                            sessionStorage.setItem(
                                paidOkStorageKey,
                              '1'
                            );
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
                  {!showWechatPayCard && !showPayCompleteFallback ? (
                    <p className="text-sm text-muted-foreground">
                      当前未启用页面内微信支付，请联系管理员配置支付开关。
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
