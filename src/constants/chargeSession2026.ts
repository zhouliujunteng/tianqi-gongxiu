import { WENJUAN_ORDER_STATUS_PAID } from './lead2026';

/**
 * 「执行充电·线上共学」2026-09-04 免费学员专享课。
 * 官方统一发送的报名链接（不带任何专员邀请 ref），报名不产生支付：
 * - 身份校验沿用共修营「已建档家长」判定（200 元档身份集合）；
 * - 报名 = 向订单表插入一条 0 元订单（订单类型见下），不发起微信支付；
 * - 老师在报名管理后台按微信号添加家长进群。
 */
export const CHARGE_SESSION_ORDER_TYPE = '2026执行充电共学';
/** 订单备注：与订单类型一致，便于后台筛选本课程报名 */
export const CHARGE_SESSION_ORDER_REMARK = '2026执行充电共学';

export const CHARGE_SESSION_PAGE_TITLE = '执行充电·线上共学｜天启无书';
export const CHARGE_SESSION_COURSE_THEME =
  '方案执行过程中电量不足，那就一起充充电吧！';
export const CHARGE_SESSION_COURSE_TIME = '9月4日（周五）晚 20:00—22:00';
export const CHARGE_SESSION_COURSE_TIME_LABEL = '9月4日（周五）20:00—22:00';
export const CHARGE_SESSION_DEADLINE_AT = '2026-09-04T20:00:00+08:00';
export const CHARGE_SESSION_DEADLINE_LABEL = '9月4日 20:00';

export const CHARGE_SESSION_BACKGROUND =
  '孩子的成长，本质上是父母认知与行动的映射。方案的落地效果，取决于父母的理解深度；孩子的转变速度，取决于父母的执行力度。';

export const CHARGE_SESSION_GOALS = [
  '看清自己教育言行中的盲点',
  '学会有效反馈孩子状态',
  '清晰爱与规则的重要性',
] as const;

export const CHARGE_SESSION_RULES = [
  '线上会议室迟到 15 分钟，将无法进入当期课堂。',
  '报名后必须全程参与；若无法全程参与，后续不予参加。',
  '群内发送会议链接，课程结束后群聊自动解散。',
] as const;

/** 与共修营「已建档家长（200 元档）」同一套身份判定集合 */
const CHARGE_ELIGIBLE_IDENTITIES = new Set([
  '学员',
  '服务专员',
  '服务中心',
  '公众号学员名单',
]);

/** 本次共学仅限已建档家长：身份命中集合，或存在于公众号学员名单 */
export function isChargeEligibleIdentity(
  identity: string | null | undefined,
  publicStudentFound: boolean
): boolean {
  if (publicStudentFound) return true;
  return CHARGE_ELIGIBLE_IDENTITIES.has(String(identity ?? '').trim());
}

/** 报名截止时刻（毫秒时间戳，中国标准时间） */
export function getChargeEnrollmentDeadlineAtMs(): number {
  return Date.parse(CHARGE_SESSION_DEADLINE_AT);
}

/** 该课程是否已停止报名（开课即止） */
export function isChargeEnrollmentClosed(nowMs: number = Date.now()): boolean {
  return nowMs >= getChargeEnrollmentDeadlineAtMs();
}

/** 免费课程：报名即完成，订单状态直接记「已支付」，金额 0 元 */
export const CHARGE_SESSION_ORDER_STATUS = WENJUAN_ORDER_STATUS_PAID;
