import type { CampPhase } from './camp2026';

/** 订单表 · 共修营微信（TEXT） */
export const CAMP_ORDER_WECHAT_FIELD = 'ud_gongxiuyingweixin_62acc6' as const;
/**
 * 订单表 · 进群状态（TEXT）。
 * 历史命名为「添加状态」，对应的 DB 字段名仍是 ud_tianjiazhuangtai_a1779b；
 * 业务上现已统一改为「已进群 / 未进群」，并向后兼容历史值「已添加 / 未添加」。
 */
export const CAMP_ORDER_WECHAT_STATUS_FIELD = 'ud_tianjiazhuangtai_a1779b' as const;

export type CampWechatFriendStatus = '已进群' | '未进群';

export interface CampWechatContact {
  weixin: string;
  friend_status: CampWechatFriendStatus;
}

/** 第三期起：报名页填微信号、缴费建单写入、进群管理后台 */
export function isCampWechatEnrollFlow(phase: CampPhase): boolean {
  // 第3期之后的所有期次（含内部 phase '8'，即对外 06 期）均走微信号报名流程
  return phase !== '1' && phase !== '2';
}

/**
 * 把 DB 中 ud_tianjiazhuangtai_a1779b 的原始值规范化为当前业务语义。
 * 兼容历史值：
 * - '已进群' / '已添加' → '已进群'
 * - 其他（含空、'未进群'、'未添加'）→ '未进群'
 */
export function normalizeCampWechatFriendStatus(
  statusRaw: unknown
): CampWechatFriendStatus {
  const status = String(statusRaw ?? '').trim();
  if (status === '已进群' || status === '已添加') return '已进群';
  return '未进群';
}

export function parseCampWechatContactFields(
  weixinRaw: unknown,
  statusRaw: unknown
): CampWechatContact | null {
  const weixin = String(weixinRaw ?? '').trim();
  if (!weixin) return null;
  return {
    weixin,
    friend_status: normalizeCampWechatFriendStatus(statusRaw),
  };
}

export function buildCampWechatContact(
  weixin: string,
  friend_status: CampWechatFriendStatus = '未进群'
): CampWechatContact {
  return {
    weixin: weixin.trim(),
    friend_status,
  };
}

const DEFAULT_CAMP_WECHAT_ADMIN_ACCOUNT_IDS = [
  '1000000000009519',
  '10000000000009519',
];

/** 后端老师账号（逗号分隔），见 VITE_CAMP_WECHAT_ADMIN_ACCOUNT_IDS */
export function getCampWechatAdminAccountIds(): Set<string> {
  const raw = import.meta.env.VITE_CAMP_WECHAT_ADMIN_ACCOUNT_IDS?.trim() ?? '';
  const configuredIds = raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return new Set([...DEFAULT_CAMP_WECHAT_ADMIN_ACCOUNT_IDS, ...configuredIds]);
}

export function validateCampWeixinInput(value: string): string | null {
  const v = value.trim();
  if (!v) return '请填写您的微信号';
  if (v.length < 2) return '微信号至少 2 个字符';
  if (v.length > 32) return '微信号过长，请确认后重试';
  return null;
}
