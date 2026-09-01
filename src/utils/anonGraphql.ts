type GraphQLErrorLike = { message?: string | null };

/**
 * 不带 Authorization 的 Zion GraphQL 请求（匿名通道）。
 *
 * 背景（2026-09-01 实测）：订单表 ud_dingdan_b6a218 对「Logged-in User」
 * 配了行级过滤条件——登录用户反而查不到订单行；而「Anonymous」角色对订单表
 * select / update_by_pk 没有行级条件（insert 对匿名关闭、对登录用户开放）。
 *
 * 因此执行充电共学的「报名记录查询 / 进群状态标记」走匿名通道：
 * - 报名插入仍用 Apollo（带登录 JWT，走已验证的 insert 权限）；
 * - 查询与状态更新用本函数（无 Authorization 头）。
 */
export async function anonGraphqlRequest<TData>(
  query: string,
  variables?: Record<string, unknown>
): Promise<TData> {
  const projectExId = String(
    import.meta.env.VITE_ZION_PROJECT_EX_ID ?? ''
  ).trim();
  if (!projectExId) {
    throw new Error('未配置 Zion 项目，无法查询报名数据。');
  }
  const url = `https://zion-app.functorz.com/zero/${encodeURIComponent(
    projectExId
  )}/api/graphql-v2`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  if (!res.ok) {
    throw new Error(`网络请求失败（HTTP ${res.status}），请稍后重试。`);
  }
  const json: { data?: TData; errors?: GraphQLErrorLike[] } = await res.json();
  const errs = (json.errors ?? [])
    .map((e) => String(e.message ?? ''))
    .filter(Boolean);
  if (errs.length) {
    throw new Error(errs.join('；'));
  }
  if (!json.data) {
    throw new Error('后端没有返回数据，请稍后重试。');
  }
  return json.data;
}
