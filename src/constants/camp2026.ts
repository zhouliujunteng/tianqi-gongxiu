import { WENJUAN_CAMP_ORDER_TYPE } from './lead2026';

/** 全局文档 `ud_leixing_95f511`：与「共修营客服」同一表，用于门头图 */
export const CAMP_COMPANY_STOREFRONT_DOC_TYPE = '公司门头图片';
export const CAMP_CLASS_PHOTO_DOC_TYPES = [
  '上课图片1',
  '上课图片2',
  '上课图片3',
  '上课图片4',
] as const;

export type CampPhase = '1' | '2' | '3' | '4' | '5' | '6' | '8';

/**
 * 全部合法期次。注意：内部期号跳过 '7'，
 * 因为 URL `?scene=camp&phase=7` 已被「二阶共修营03期」路由占用（见 App.tsx）。
 * 2026 年 9 月第 06 期（对外命名）使用内部 phase '8'。
 */
const CAMP_KNOWN_PHASE_LIST: readonly CampPhase[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '8',
];

/** 当前最新一期（无 phase 参数时的默认展示期次） */
export const CAMP_LATEST_PHASE: CampPhase = '8';

export function isKnownCampPhase(value: string): value is CampPhase {
  return CAMP_KNOWN_PHASE_LIST.includes(value as CampPhase);
}

export type CampSchedule = {
  dateRange: string;
  deadline: string;
};

/** 各期报名截止时刻（中国标准时间 UTC+8），到达该时刻起关闭新用户报名 */
const CAMP_ENROLLMENT_DEADLINE_AT: Record<CampPhase, string> = {
  '1': '2026-04-12T18:00:00+08:00',
  '2': '2026-04-28T18:00:00+08:00',
  '3': '2026-05-24T18:00:00+08:00',
  '4': '2026-06-16T18:00:00+08:00',
  '5': '2026-07-21T18:00:00+08:00',
  '6': '2026-07-31T18:00:00+08:00',
  '8': '2026-09-06T18:00:00+08:00',
};

const CAMP_ENROLLMENT_DEADLINE_BYPASS_ACCOUNT_IDS = new Set([
  '1000000000011126',
]);

export function getCampPhaseFromLocation(): CampPhase {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = (
      params.get('phase')?.trim() ||
      params.get('camp_phase')?.trim() ||
      params.get('qi')?.trim() ||
      ''
    );
    if (raw && isKnownCampPhase(raw)) return raw;
    // 未指明或非法期次时，默认展示最新一期
    return CAMP_LATEST_PHASE;
  } catch {
    return CAMP_LATEST_PHASE;
  }
}

export function getCampPhaseLabel(phase: CampPhase): string {
  return `第${phase}期`;
}

/**
 * 对外展示的营期名称。历史约定：
 * - 内部 phase '6'（8 月营期）沿用「第5期」对外命名，但订单标识独立为「第6期」。
 * - 内部 phase '8'（2026 年 9 月营期）为通知中的「06期」；不能用 '7' 作为内部期号
 *   （URL 冲突）也不能复用「第6期」订单标识（会误匹配 8 月营期的已付订单），
 *   因此该期订单标识独立为「第8期」。
 */
export function getCampDisplayPhaseLabel(phase: CampPhase): string {
  if (phase === '8') return '第6期';
  if (phase === '6') return '第5期';
  return getCampPhaseLabel(phase);
}

/**
 * 该期「已建档家长 200 元」是否为不退的参与费用（而非可退押金）。
 * 第 06 次开营（内部 phase '6'）起启用参与费用规则，06期（内部 phase '8'）延续。
 */
export function isCampParticipationFeeNonRefundable(phase: CampPhase): boolean {
  return phase === '6' || phase === '8';
}

/** 报名截止时刻（毫秒时间戳，中国标准时间） */
export function getCampEnrollmentDeadlineAtMs(phase: CampPhase): number {
  return Date.parse(CAMP_ENROLLMENT_DEADLINE_AT[phase]);
}

/**
 * 该期是否已关闭新用户报名（按各期截止时刻自动判断，无需手动改代码）。
 * 已缴费用户仍可打卡；支付/打卡/进群等管理员后台不受此限制。
 */
export function isCampEnrollmentClosed(
  phase: CampPhase,
  nowMs: number = Date.now()
): boolean {
  return nowMs >= getCampEnrollmentDeadlineAtMs(phase);
}

export function canBypassCampEnrollmentDeadline(
  accountId: string | null | undefined
): boolean {
  const normalized = String(accountId ?? '').trim();
  return CAMP_ENROLLMENT_DEADLINE_BYPASS_ACCOUNT_IDS.has(normalized);
}

export function getCampTitle(phase: CampPhase): string {
  return `《父母学习·孩子蜕变》共修营${getCampPhaseLabel(phase)}`;
}

/**
 * 用于 createWechatPayment(description) 与前端“已付解锁”匹配。
 * 这里保留统一订单类型，但支付描述按期次区分，避免历史期次误解锁新一期。
 */
export function getCampPayDescription(phase: CampPhase): string {
  return `${WENJUAN_CAMP_ORDER_TYPE}${getCampPhaseLabel(phase)}`;
}

/**
 * 支持历史描述格式，避免已支付老数据被误判为未支付：
 * - 新格式：2026共修营第2期
 * - 旧格式：2026共修营-第2期
 * - 更旧格式：2026共修营
 */
export function getCampPayDescriptionAliases(phase: CampPhase): string[] {
  const phaseLabel = getCampPhaseLabel(phase);
  return [
    `${WENJUAN_CAMP_ORDER_TYPE}${phaseLabel}`,
    `${WENJUAN_CAMP_ORDER_TYPE}-${phaseLabel}`,
    WENJUAN_CAMP_ORDER_TYPE,
  ];
}

/** 订单备注是否属于指定期次（后台筛选已支付学员） */
export function isCampOrderRemarkForPhase(
  remark: string | null | undefined,
  phase: CampPhase
): boolean {
  const normalized = String(remark ?? '').trim();
  if (!normalized) return false;
  const expected = getCampPayDescription(phase);
  if (normalized === expected) return true;
  return normalized.includes(`第${phase}期`);
}

/** 营期展示文案（与群内最终通知不一致时以群内为准） */
export function getCampSchedule(phase: CampPhase): CampSchedule {
  if (phase === '8') {
    return {
      dateRange: '9 月 7 日至 9 月 20 日',
      deadline: '9 月 6 日 18:00',
    };
  }
  if (phase === '6') {
    return {
      dateRange: '8 月 1 日至 8 月 14 日',
      deadline: '7 月 31 日 18:00',
    };
  }
  if (phase === '5') {
    return {
      dateRange: '7 月 22 日至 8 月 4 日',
      deadline: '7 月 21 日 18:00',
    };
  }
  if (phase === '4') {
    return {
      dateRange: '6 月 17 日至 6 月 30 日',
      deadline: '6 月 16 日 18:00',
    };
  }
  if (phase === '3') {
    return {
      dateRange: '5 月 25 日至 6 月 7 日',
      deadline: '5 月 24 日 18:00',
    };
  }
  if (phase === '2') {
    return {
      dateRange: '4 月 29 日至 5 月 12 日',
      deadline: '4 月 28 日 18:00',
    };
  }
  return {
    dateRange: '4 月 13 日至 4 月 27 日',
    deadline: '4 月 12 日 18:00',
  };
}
