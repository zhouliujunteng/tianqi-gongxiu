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
import { OrganicBackgroundBlobs } from './components/OrganicBackgroundBlobs';
import { LOGIN_WITH_WECHAT } from './graphql/operations';
import { Lead2026Page } from './pages/Lead2026Page';
import { friendlyRequestErrorMessage } from './utils/friendlyRequestError';

function oauthFailureMessage(error: unknown): string {
  if (error instanceof ApolloError) {
    const gqlMsg = error.graphQLErrors?.map((e) => e.message).filter(Boolean)[0];
    if (gqlMsg) return gqlMsg;
  }
  return friendlyRequestErrorMessage(error);
}

export function App() {
  const client = useMemo(() => createApolloClient(), []);
  const [, bump] = useState(0);
  const [wechatOAuthExchangePending, setWechatOAuthExchangePending] =
    useState(false);
  const [wechatOAuthExchangeError, setWechatOAuthExchangeError] = useState<
    string | null
  >(null);

  useLayoutEffect(() => {
    if (!isZionConfigured()) return;

    captureInviterRefFromUrl();
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
      <Lead2026Page
        wechatOAuthExchangePending={wechatOAuthExchangePending}
        wechatOAuthExchangeError={wechatOAuthExchangeError}
      />
    </ApolloProvider>
  );
}
