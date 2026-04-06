import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  split,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { getMainDefinition } from '@apollo/client/utilities';
import { WebSocketLink } from '@apollo/client/link/ws';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import { getZionJwt } from '../auth/zionJwt';

function getProjectExId(): string {
  const id = import.meta.env.VITE_ZION_PROJECT_EX_ID;
  if (!id || id === 'your-project-ex-id') {
    return '';
  }
  return id;
}

function projectExIdForUrl(projectExId: string): string {
  return encodeURIComponent(projectExId);
}

export function createApolloClient(): ApolloClient {
  const projectExId = getProjectExId();
  const segment = projectExIdForUrl(projectExId);
  const httpUrl = `https://zion-app.functorz.com/zero/${segment}/api/graphql-v2`;
  const wssUrl = `wss://zion-app.functorz.com/zero/${segment}/api/graphql-subscription`;

  const wsClient = new SubscriptionClient(wssUrl, {
    reconnect: true,
    connectionParams: () => {
      const t = getZionJwt();
      return t ? { authToken: t } : {};
    },
  });

  const wsLink = new WebSocketLink(wsClient);

  const authLink = setContext((_, { headers }) => {
    const t = getZionJwt();
    return {
      headers: {
        ...headers,
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
    };
  });

  const httpLink = authLink.concat(
    new HttpLink({
      uri: httpUrl,
    })
  );

  const splitLink = split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === 'OperationDefinition' &&
        definition.operation === 'subscription'
      );
    },
    wsLink,
    httpLink
  );

  return new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
  });
}

export function isZionConfigured(): boolean {
  return Boolean(getProjectExId());
}
