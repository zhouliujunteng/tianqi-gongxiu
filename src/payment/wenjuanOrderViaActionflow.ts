import { WENJUAN_2026_ORDER_TYPE } from '../constants/lead2026';
import {
  wenjuanPayAmountYuanAsNumber,
  wenjuanPayDescription,
} from '../constants/wenjuanPayment';

/** 与小程序一致：用行为流在「支付绑定订单表」中建单时，在 .env 配置该行为流的 id */
export function wenjuanOrderCreateUsesActionflow(): boolean {
  return Boolean(
    import.meta.env.VITE_WENJUAN_ORDER_CREATE_ACTION_FLOW_ID?.trim()
  );
}

export function wenjuanOrderCreateActionFlowId(): string {
  return import.meta.env.VITE_WENJUAN_ORDER_CREATE_ACTION_FLOW_ID?.trim() ?? '';
}

export function wenjuanOrderCreateActionFlowVersionId(): number {
  const raw =
    import.meta.env.VITE_WENJUAN_ORDER_CREATE_ACTION_FLOW_VERSION_ID?.trim() ??
    '-1';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : -1;
}

/**
 * 传入行为流「输入节点」的 args。默认键名便于与小程序对齐；若你项目输入名不同，请用
 * VITE_WENJUAN_ORDER_CREATE_FLOW_ARGS_JSON 提供静态字段（会与下列字段合并，下列字段优先覆盖同名键）。
 */
export function buildWenjuanOrderActionFlowArgs(): Record<string, unknown> {
  return buildWenjuanOrderActionFlowArgsFor({
    amountYuan: wenjuanPayAmountYuanAsNumber(),
    orderType: WENJUAN_2026_ORDER_TYPE,
    description: wenjuanPayDescription(),
    wenjuanTag: '2026引流问卷',
  });
}

export function buildWenjuanOrderActionFlowArgsFor(options: {
  amountYuan: number;
  orderType: string;
  description: string;
  wenjuanTag: string;
  orderRemark?: string;
  serviceSpecialistId?: string | null;
  userLibraryId?: string | number | null;
}): Record<string, unknown> {
  const amount = options.amountYuan;
  const amountFen = Math.round(amount * 100);
  const specialistId =
    options.serviceSpecialistId && /^\d+$/.test(options.serviceSpecialistId.trim())
      ? Number(options.serviceSpecialistId.trim())
      : null;
  const targetUserLibraryId =
    options.userLibraryId !== null &&
    options.userLibraryId !== undefined &&
    /^\d+$/.test(String(options.userLibraryId).trim())
      ? Number(String(options.userLibraryId).trim())
      : null;
  let extra: Record<string, unknown> = {};
  const raw = import.meta.env.VITE_WENJUAN_ORDER_CREATE_FLOW_ARGS_JSON?.trim();
  if (raw) {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        extra = p as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {
    ...extra,
    amount_yuan: amount,
    amount_fen: amountFen,
    order_type: options.orderType,
    order_remark: options.orderRemark ?? options.orderType,
    dingdan_beizhu: options.orderRemark ?? options.orderType,
    ud_dingdanbeizhu_439d3a: options.orderRemark ?? options.orderType,
    description: options.description,
    wenjuan_tag: options.wenjuanTag,
    ref: specialistId,
    service_specialist_id: specialistId,
    ud_jihuoshilianjiezhuanyuanid_902b22: specialistId,
    user_library_id: targetUserLibraryId,
    yonghuku_id: targetUserLibraryId,
    ud_yonghuxinxi_yonghuku_55773d: targetUserLibraryId,
  };
}

function coerceRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v) as unknown;
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function pickNumericId(
  obj: Record<string, unknown>,
  preferredKeys: string[]
): string | null {
  for (const k of preferredKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const x = obj[k];
    if (x === undefined || x === null) continue;
    const s = String(x).trim();
    if (/^\d+$/.test(s)) return s;
  }
  return null;
}

/**
 * 从 fz_invoke_action_flow 返回的 Json 中解析订单 id（须为纯数字字符串）。
 */
export function parseOrderIdFromActionFlowResult(output: unknown): string | null {
  const customKey =
    import.meta.env.VITE_WENJUAN_ORDER_CREATE_FLOW_ORDER_ID_KEY?.trim();
  const keys = [
    ...(customKey ? [customKey] : []),
    'order_id',
    'orderId',
    'dingdan_id',
    'dingdanId',
    'id',
  ];

  const top = coerceRecord(output);
  if (!top) {
    if (typeof output === 'number' && Number.isFinite(output)) {
      const s = String(Math.trunc(output));
      return /^\d+$/.test(s) ? s : null;
    }
    return null;
  }

  const direct = pickNumericId(top, keys);
  if (direct) return direct;

  const nested = top.data ?? top.result ?? top.output;
  const inner = coerceRecord(nested);
  if (inner) {
    const id = pickNumericId(inner, keys);
    if (id) return id;
  }

  return null;
}
