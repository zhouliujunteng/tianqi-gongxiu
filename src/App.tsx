import { ApolloError, ApolloProvider } from '@apollo/client';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  captureInviterRefFromOAuthState,
  captureInviterRefFromUrl,
} from './auth/inviterRef';
import {
  getWechatOAuthCodeFromLocation,
  stripWechatOAuthParamsFromLocation,
} from './auth/wechatOAuthCallback';
import { consumeJwtFromUrl, getZionJwt, setZionJwt } from './auth/zionJwt';
import { createApolloClient, isZionConfigured } from './apollo/client';
import { LoggedInUserWatermark } from './components/LoggedInUserWatermark';
import { OrganicBackgroundBlobs } from './components/OrganicBackgroundBlobs';
import { consumePayOpenIdCallback } from './payment/useWechatOpenId';
import { LOGIN_WITH_WECHAT } from './graphql/operations';
import { Lead2026AdvancedCampEnrollPage } from './pages/Lead2026AdvancedCampEnrollPage';
import { Lead2026CampEnrollPage } from './pages/Lead2026CampEnrollPage';
import { Lead2026ChargeEnrollPage } from './pages/Lead2026ChargeEnrollPage';
import { Lead2026Page } from './pages/Lead2026Page';
import { getZionJwtUserId } from './auth/zionJwt';
import { friendlyRequestErrorMessage } from './utils/friendlyRequestError';

function oauthFailureMessage(error: unknown): string {
  if (error instanceof ApolloError) {
    const gqlMsg = error.graphQLErrors?.map((e) => e.message).filter(Boolean)[0];
    if (gqlMsg) return gqlMsg;
  }
  return friendlyRequestErrorMessage(error);
}

function shouldOpenCampPage(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('scene') === 'camp' ||
      params.get('page') === 'camp' ||
      params.get('tab') === 'camp'
    );
  } catch {
    return false;
  }
}

/** 执行充电·线上共学（免费学员专享课，官方链接不带邀请 ref） */
function shouldOpenChargePage(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('scene') === 'charge' ||
      params.get('page') === 'charge' ||
      params.get('tab') === 'charge' ||
      params.get('scene') === 'charge-session' ||
      params.get('page') === 'charge-session' ||
      params.get('tab') === 'charge-session'
    );
  } catch {
    return false;
  }
}

function shouldOpenAdvancedCampPage(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('scene') === 'advanced-camp' ||
      params.get('page') === 'advanced-camp' ||
      params.get('tab') === 'advanced-camp'
    );
  } catch {
    return false;
  }
}

function shouldOpenAdvancedCampPhase2Page(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('scene') === 'advanced-camp-phase2' ||
      params.get('page') === 'advanced-camp-phase2' ||
      params.get('tab') === 'advanced-camp-phase2' ||
      params.get('scene') === 'advanced-camp-new' ||
      params.get('page') === 'advanced-camp-new' ||
      params.get('tab') === 'advanced-camp-new'
    );
  } catch {
    return false;
  }
}

function shouldOpenAdvancedCampPhase7Page(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      (params.get('scene') === 'camp' ||
        params.get('page') === 'camp' ||
        params.get('tab') === 'camp') &&
      params.get('phase') === '7'
    );
  } catch {
    return false;
  }
}

/** 二阶共修营 04期（2026-10-06 开营）：?scene=camp&phase=9 */
function shouldOpenAdvancedCampPhase9Page(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      (params.get('scene') === 'camp' ||
        params.get('page') === 'camp' ||
        params.get('tab') === 'camp') &&
      params.get('phase') === '9'
    );
  } catch {
    return false;
  }
}

export function App() {
  const client = useMemo(() => createApolloClient(), []);
  const isCampPage = useMemo(() => shouldOpenCampPage(), []);
  const isAdvancedCampPage = useMemo(() => shouldOpenAdvancedCampPage(), []);
  const isAdvancedCampPhase2Page = useMemo(() => shouldOpenAdvancedCampPhase2Page(), []);
  const isAdvancedCampPhase7Page = useMemo(() => shouldOpenAdvancedCampPhase7Page(), []);
  const isAdvancedCampPhase9Page = useMemo(() => shouldOpenAdvancedCampPhase9Page(), []);
  const isChargePage = useMemo(() => shouldOpenChargePage(), []);
  const loggedInUserId = getZionJwtUserId();
  const [, bump] = useState(0);
  const [wechatOAuthExchangePending, setWechatOAuthExchangePending] =
    useState(false);
  const [wechatOAuthExchangeError, setWechatOAuthExchangeError] = useState<
    string | null
  >(null);

  useLayoutEffect(() => {
    if (!isZionConfigured()) return;

    captureInviterRefFromUrl();
    // 自建支付通道的静默 OAuth 回跳：先把 code 收走换 openId，
    // 否则下面的 Zion 登录会抢用同一个 code（code 只能用一次）
    if (consumePayOpenIdCallback()) return;
    if (consumeJwtFromUrl()) {
      setWechatOAuthExchangePending(false);
      setWechatOAuthExchangeError(null);
      bump((n) => n + 1);
      return;
    }

    const oauth = getWechatOAuthCodeFromLocation();
    if (!oauth) return;

    const { code, state, paramsIn } = oauth;

    setWechatOAuthExchangePending(true);
    setWechatOAuthExchangeError(null);

    captureInviterRefFromOAuthState(state);
    captureInviterRefFromUrl();

    stripWechatOAuthParamsFromLocation(paramsIn);

    // Zion 已对接微信：仅用 code 换 Zion JWT，不在前端换微信私有 token
    void client
      .mutate({
        mutation: LOGIN_WITH_WECHAT,
        variables: { code, createIfNotExists: true },
      })
      .then((result) => {
        if (result.errors?.length) {
          const msg = result.errors.map((e) => e.message).join('；');
          setWechatOAuthExchangePending(false);
          setWechatOAuthExchangeError(msg || '微信登录失败，请重试。');
          return;
        }
        const token = result.data?.loginWithWechat?.jwt?.token;
        if (token && typeof token === 'string') {
          setZionJwt(token);
          setWechatOAuthExchangePending(false);
          setWechatOAuthExchangeError(null);
          bump((n) => n + 1);
        } else {
          setWechatOAuthExchangePending(false);
          setWechatOAuthExchangeError(
            '登录未返回有效令牌，请重新点击「微信一键授权登录」。'
          );
        }
      })
      .catch((e: unknown) => {
        setWechatOAuthExchangePending(false);
        setWechatOAuthExchangeError(oauthFailureMessage(e));
      });
  }, [client]);

  useEffect(() => {
    if (!isZionConfigured()) return;
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const pending = getWechatOAuthCodeFromLocation();
      if (pending && !getZionJwt()) {
        window.location.reload();
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  /** 微信内 URL 有时晚于首帧；从聊天打开带 ?ref= 的链接时补抓邀请人 */
  useEffect(() => {
    if (!isZionConfigured()) return;
    const run = (): void => {
      captureInviterRefFromUrl();
    };
    run();
    window.addEventListener('popstate', run);
    window.addEventListener('hashchange', run);
    window.addEventListener('focus', run);
    const onVis = (): void => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', run);
    let ticks = 0;
    const tick = window.setInterval(() => {
      run();
      ticks += 1;
      if (ticks >= 15) window.clearInterval(tick);
    }, 1000);
    return () => {
      window.removeEventListener('popstate', run);
      window.removeEventListener('hashchange', run);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', run);
      window.clearInterval(tick);
    };
  }, []);

  if (!isZionConfigured()) {
    return (
      <div className="relative z-10 mx-auto max-w-lg px-4 py-20">
        <div className="rounded-[2rem] border border-border bg-card p-8 shadow-organic-sm">
          <h1 className="font-display text-2xl">需要配置 Zion 项目</h1>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            请在 <code className="rounded bg-muted px-1">.env</code> 中设置{' '}
            <code className="rounded bg-muted px-1">VITE_ZION_PROJECT_EX_ID</code>
            （天启无书项目 exId 为 <code className="rounded bg-muted px-1">bZ7yl9DZ4YY</code>
            ）。
          </p>
        </div>
        <OrganicBackgroundBlobs />
        <div className="texture-overlay" aria-hidden />
      </div>
    );
  }

  return (
    <ApolloProvider client={client}>
      <OrganicBackgroundBlobs />
      <div className="texture-overlay" aria-hidden />
      {isAdvancedCampPhase9Page ? (
        <Lead2026AdvancedCampEnrollPage
          courseVariant="phase9"
          wechatOAuthExchangePending={wechatOAuthExchangePending}
          wechatOAuthExchangeError={wechatOAuthExchangeError}
        />
      ) : isAdvancedCampPhase7Page ? (
        <Lead2026AdvancedCampEnrollPage
          courseVariant="phase7"
          wechatOAuthExchangePending={wechatOAuthExchangePending}
          wechatOAuthExchangeError={wechatOAuthExchangeError}
        />
      ) : isAdvancedCampPhase2Page ? (
        <Lead2026AdvancedCampEnrollPage
          courseVariant="phase2"
          wechatOAuthExchangePending={wechatOAuthExchangePending}
          wechatOAuthExchangeError={wechatOAuthExchangeError}
        />
      ) : isAdvancedCampPage ? (
        <Lead2026AdvancedCampEnrollPage
          wechatOAuthExchangePending={wechatOAuthExchangePending}
          wechatOAuthExchangeError={wechatOAuthExchangeError}
        />
      ) : isCampPage ? (
        <Lead2026CampEnrollPage
          wechatOAuthExchangePending={wechatOAuthExchangePending}
          wechatOAuthExchangeError={wechatOAuthExchangeError}
        />
      ) : isChargePage ? (
        <Lead2026ChargeEnrollPage
          wechatOAuthExchangePending={wechatOAuthExchangePending}
          wechatOAuthExchangeError={wechatOAuthExchangeError}
        />
      ) : (
        <Lead2026Page
          wechatOAuthExchangePending={wechatOAuthExchangePending}
          wechatOAuthExchangeError={wechatOAuthExchangeError}
        />
      )}
      {(isCampPage || isAdvancedCampPage || isChargePage) && loggedInUserId ? (
        <LoggedInUserWatermark userId={loggedInUserId} />
      ) : null}
    </ApolloProvider>
  );
}
