/** 用户库 identity 为以下值时进入问卷管理台 */
export const STAFF_IDENTITIES = ['服务专员', '服务中心', '管理'] as const;

export function isStaffIdentity(
  identity: string | null | undefined
): identity is (typeof STAFF_IDENTITIES)[number] {
  const v = identity?.trim();
  if (!v) return false;
  return (STAFF_IDENTITIES as readonly string[]).includes(v);
}
