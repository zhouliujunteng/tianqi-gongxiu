/**
 * 将底层网络错误转成用户可读中文（避免直接露出 TypeError: fetch failed）。
 */
export function friendlyRequestErrorMessage(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    if ('cause' in error && error.cause instanceof Error) {
      parts.push(error.cause.message);
    }
  }
  const blob = parts.join(' ');

  if (
    /fetch failed|Failed to fetch|NetworkError|network error|Load failed|ECONNREFUSED|ENOTFOUND|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/i.test(
      blob
    )
  ) {
    return '网络请求失败，暂时连不上 Zion 服务器。请确认本机或手机已联网，且能访问外网；若在公司网络、校园网或使用代理/VPN，可尝试切换网络。局域网用 IP 访问前端时，设备仍需能访问 zion-app.functorz.com。';
  }

  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试。';
}
