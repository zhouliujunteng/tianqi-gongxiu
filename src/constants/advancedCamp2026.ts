import { WENJUAN_ADVANCED_CAMP_ORDER_TYPE } from './lead2026';

export type AdvancedCampPhase = '1';

export type AdvancedCampSchedule = {
  dateRange: string;
  deadline: string;
  timeSlots: string[];
};

const ADVANCED_CAMP_ENROLLMENT_DEADLINE_AT: Record<AdvancedCampPhase, string> = {
  '1': '2026-07-05T18:00:00+08:00',
};

const ADVANCED_CAMP_ENROLLMENT_DEADLINE_BYPASS_ACCOUNT_IDS = new Set([
  '1000000000010619',
  '1000000000009528',
]);

export function getAdvancedCampPhaseFromLocation(): AdvancedCampPhase {
  return '1';
}

export function getAdvancedCampPhaseLabel(_phase: AdvancedCampPhase): string {
  return `01期`;
}

export function getAdvancedCampTitle(phase: AdvancedCampPhase): string {
  return `《透过现象·直击本质》二阶共修营${getAdvancedCampPhaseLabel(phase)}`;
}

export function getAdvancedCampPayDescription(phase: AdvancedCampPhase): string {
  return `${WENJUAN_ADVANCED_CAMP_ORDER_TYPE}${getAdvancedCampPhaseLabel(phase)}`;
}

export function getAdvancedCampPayDescriptionAliases(
  phase: AdvancedCampPhase
): string[] {
  const phaseLabel = getAdvancedCampPhaseLabel(phase);
  return [
    `${WENJUAN_ADVANCED_CAMP_ORDER_TYPE}${phaseLabel}`,
    `${WENJUAN_ADVANCED_CAMP_ORDER_TYPE}-${phaseLabel}`,
    WENJUAN_ADVANCED_CAMP_ORDER_TYPE,
  ];
}

export function getAdvancedCampEnrollmentDeadlineAtMs(
  phase: AdvancedCampPhase
): number {
  return Date.parse(ADVANCED_CAMP_ENROLLMENT_DEADLINE_AT[phase]);
}

export function isAdvancedCampEnrollmentClosed(
  phase: AdvancedCampPhase,
  nowMs: number = Date.now()
): boolean {
  return nowMs >= getAdvancedCampEnrollmentDeadlineAtMs(phase);
}

export function canBypassAdvancedCampEnrollmentDeadline(
  accountId: string | null | undefined
): boolean {
  const normalized = String(accountId ?? '').trim();
  return ADVANCED_CAMP_ENROLLMENT_DEADLINE_BYPASS_ACCOUNT_IDS.has(normalized);
}

export function getAdvancedCampAmountByIdentity(
  identity: string | null | undefined
): number {
  const normalized = String(identity ?? '').trim();
  if (!normalized) return 1680;
  return normalized === '普通用户' || normalized === '预备学员' ? 1680 : 680;
}

export function getAdvancedCampSchedule(
  _phase: AdvancedCampPhase
): AdvancedCampSchedule {
  return {
    dateRange: '7 月 6 日至 7 月 12 日',
    deadline: '7 月 5 日 18:00',
    timeSlots: ['06:00—08:00', '20:00—22:00'],
  };
}
