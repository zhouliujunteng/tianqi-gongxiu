const STORAGE_KEY = 'tqwj_dev_mock_account_id';

/** 开发模式下登录页输入框的默认 account.id */
export const DEFAULT_DEV_MOCK_ACCOUNT_ID = '1000000000000750';

/**
 * 无 JWT 时 GraphQL 常读不到用户库，无法拿到 identity。
 * 仅开发模式：若当前模拟的 account.id 在此集合中且查询未返回行，则仍视为「管理」以便打开管理台。
 */
const DEV_STAFF_FALLBACK_BY_ACCOUNT_ID = new Set<string>([
  DEFAULT_DEV_MOCK_ACCOUNT_ID,
]);

/** 返回 '管理' 或 null（仅 DEV、且无用户库行时） */
export function devStaffIdentityWhenProfileMissing(
  accountId: string | null | undefined
): '管理' | null {
  if (!import.meta.env.DEV) return null;
  const id = accountId?.trim();
  if (!id || !DEV_STAFF_FALLBACK_BY_ACCOUNT_ID.has(id)) return null;
  return '管理';
}

/**
 * 与 {@link devStaffIdentityWhenProfileMissing} 同条件：无用户库行时仍要给管理台生成 ?ref=。
 * 默认用当前模拟帐户 id；若 Zion 里用户库主键与帐户 id 不一致，设 VITE_DEV_INVITER_YONGHUKU_ID。
 */
export function devInviterYonghukuIdWhenProfileMissing(
  accountId: string | null | undefined
): string | null {
  if (devStaffIdentityWhenProfileMissing(accountId) !== '管理') return null;
  const id = accountId?.trim();
  if (!id) return null;
  const fromEnv = import.meta.env.VITE_DEV_INVITER_YONGHUKU_ID?.trim();
  if (fromEnv && /^\d+$/.test(fromEnv)) return fromEnv;
  return id;
}

export function isDevMockAccountEnabled(): boolean {
  return import.meta.env.DEV;
}

export function getDevMockAccountId(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setDevMockAccountId(id: string): void {
  if (!import.meta.env.DEV) return;
  localStorage.setItem(STORAGE_KEY, id.trim());
}

export function clearDevMockAccountId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
