/** 问卷页微信支付：依赖 Zion 订单表 + 微信商户；insert 订单时用户库外键列为 null，已付判定靠 fz_payment_record */

const TRUE = new Set(['1', 'true', 'yes', 'on']);
const FALSE = new Set(['0', 'false', 'no', 'off']);

function parseEnvFlag(
  raw: string | undefined,
  whenUnset: boolean
): boolean {
  const v = raw?.trim().toLowerCase() ?? '';
  if (v === '') return whenUnset;
  if (FALSE.has(v)) return false;
  return TRUE.has(v);
}

/** 为真时展示微信支付卡片并调起 createWechatPayment；不控制「未付不可提交」（见 isWenjuanPayRequiredForSubmit） */
export function isWenjuanWechatPayEnabled(): boolean {
  const v = import.meta.env.VITE_WENJUAN_PAY_ENABLED?.trim().toLowerCase();
  return v ? TRUE.has(v) : false;
}

/**
 * 问卷入口开关：
 * 当前问卷入口直接开放，不再展示「等待开启」拦截页。
 */
export function isWenjuanWaitingOpenEnabled(): boolean {
  return false;
}

/**
 * 为真时须通过支付资格校验后才能提交（与是否启用微信支付 UI 无关）。
 * 未设置变量时：生产构建（vite build）默认为 true，开发服默认为 false，避免忘配环境仍可免费提交。
 */
export function isWenjuanPayRequiredForSubmit(): boolean {
  return parseEnvFlag(
    import.meta.env.VITE_WENJUAN_PAY_REQUIRE_SUBMIT,
    import.meta.env.PROD
  );
}

/**
 * 是否展示「我已完成支付」等纯前端确认（不校验 Zion）。生产环境默认关闭，防未付款误点绕过。
 * 线下已付需放行时设 VITE_WENJUAN_PAY_ALLOW_MANUAL_OK=1。
 */
export function isWenjuanPayManualClientConfirmAllowed(): boolean {
  return parseEnvFlag(
    import.meta.env.VITE_WENJUAN_PAY_ALLOW_MANUAL_OK,
    import.meta.env.DEV
  );
}

export function wenjuanPayAmountYuan(): number {
  const raw = import.meta.env.VITE_WENJUAN_PAY_AMOUNT_YUAN?.trim() ?? '29.9';
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0.01) return 29.9;
  return Math.round(n * 100) / 100;
}

/** 有限小数「元」，用于本地计算分、文案等 */
export function wenjuanPayAmountYuanAsNumber(): number {
  return Number.parseFloat(wenjuanPayAmountYuan().toFixed(2));
}

/**
 * 微信统一下单 total_fee 须为**整数分**。Zion 文档中 `createWechatPayment(amount)` 多为「元」BigDecimal；
 * 若你方后端未把元换算为分，会报缺少/非法 total_fee。此时设 `VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_FEN=1`，
 * 本字段改为传 **分**（如 29.9 元 → 2990）。若后端已按元处理，切勿开启，否则可能被当成 2990 元。
 */
export function createWechatPaymentAmountUsesFen(): boolean {
  return parseEnvFlag(
    import.meta.env.VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_FEN,
    false
  );
}

/**
 * 传给 `createWechatPayment` 的 `amount`（BigDecimal）：
 * - 默认：有限小数 number（元）
 * - `VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_YUAN_STRING=1`：字符串 "29.90"（部分后端序列化更稳）
 * - `VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_FEN=1`：整数分 2990（仅在后端未做元→分时试）
 */
export function wenjuanPayAmountForCreateWechatPayment(): number | string {
  const yuan = wenjuanPayAmountYuanAsNumber();
  const fen = Math.round(yuan * 100);
  if (createWechatPaymentAmountUsesFen()) {
    return fen;
  }
  if (
    parseEnvFlag(
      import.meta.env.VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_YUAN_STRING,
      false
    )
  ) {
    return yuan.toFixed(2);
  }
  return yuan;
}

/**
 * 把任意「元」金额转换为给 `createWechatPayment(amount)` 用的参数形态：
 * - 默认：number（元）
 * - `VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_FEN=1`：整数分（number）
 * - `VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_YUAN_STRING=1`：字符串 "29.90"
 */
export function wenjuanPayAmountForCreateWechatPaymentFromYuan(
  amountYuan: number
): number | string {
  const yuan = Math.round(amountYuan * 100) / 100;
  const fen = Math.round(yuan * 100);
  if (createWechatPaymentAmountUsesFen()) {
    return fen;
  }
  if (
    parseEnvFlag(
      import.meta.env.VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_YUAN_STRING,
      false
    )
  ) {
    return yuan.toFixed(2);
  }
  return yuan;
}

/** insert 订单后再次 update_by_pk 写入金额列（排查首笔 insert 未落库时用） */
export function shouldPatchDingdanAmountAfterInsert(): boolean {
  return parseEnvFlag(
    import.meta.env.VITE_WENJUAN_ORDER_AMOUNT_PATCH_AFTER_INSERT,
    false
  );
}

export function wenjuanPayDescription(): string {
  return (
    import.meta.env.VITE_WENJUAN_PAY_DESCRIPTION?.trim() ||
    '问卷收集服务费'
  );
}

/**
 * GraphQL `PaymentType`（以项目 Zion GraphQL 枚举为准）。
 * 当前项目线上枚举仅有：ALIPAY、OTTPAY、STRIPE_PAY、WECHATPAY_MINIPROGRAM、WECHATPAY_MOBILE_WEB（无 WECHATPAY_JSAPI / WECHATPAY_H5）。
 * - 微信内置浏览器：WECHATPAY_MINIPROGRAM（与小程序同属 JSAPI 调起）
 * - 非微信的手机浏览器：WECHATPAY_MOBILE_WEB（H5 / MWEB）
 * 其它项目若枚举不同，请设 VITE_WECHAT_PAYMENT_TYPE。
 */
export function wenjuanPayPaymentType(isWeixinBrowser: boolean): string {
  const override = import.meta.env.VITE_WECHAT_PAYMENT_TYPE?.trim();
  if (override) return override;
  return isWeixinBrowser ? 'WECHATPAY_MINIPROGRAM' : 'WECHATPAY_MOBILE_WEB';
}

const DEFAULT_PAY_ELIGIBILITY_TYPES = [
  'WECHATPAY_MOBILE_WEB',
  'WECHATPAY_MINIPROGRAM',
] as const;

/**
 * 问卷「已付费」资格查询：Zion 表 fz_payment_record（控制台「支付」）须同时匹配
 * account_id、status=SUCCESSFUL、type 为本列表之一。
 * 覆盖：VITE_WENJUAN_PAY_ELIGIBILITY_TYPES=WECHATPAY_MOBILE_WEB,WECHATPAY_MINIPROGRAM
 */
export function wenjuanPayEligibilityTypes(): string[] {
  const raw = import.meta.env.VITE_WENJUAN_PAY_ELIGIBILITY_TYPES?.trim();
  if (raw) {
    const list = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) return list;
  }
  return [...DEFAULT_PAY_ELIGIBILITY_TYPES];
}

export const WENJUAN_PAY_OK_STORAGE_KEY = 'tqwj_wenjuan_wxpay_ok';

/** 共修营：微信支付完成的前端标记（与问卷支付分离，避免串状态） */
export const WENJUAN_CAMP_PAY_OK_STORAGE_KEY = 'tqwj_camp_wxpay_ok';

/** 二阶共修营：微信支付完成的前端标记（与问卷/一阶共修营分离） */
export const WENJUAN_ADVANCED_CAMP_PAY_OK_STORAGE_KEY =
  'tqwj_advanced_camp_wxpay_ok';

/**
 * 调起 H5(MWEB) 微信支付前写入 sessionStorage；回到本站后据此延迟查询 `fz_payment_record`（Zion webhook 异步，见仓库 payment rules）。
 */
export const WENJUAN_WXPAY_H5_PENDING_KEY = 'tqwj_wenjuan_wxpay_h5_pending';

/** 共修营：MWEB 跳转等待标记（与问卷支付分离） */
export const WENJUAN_CAMP_WXPAY_H5_PENDING_KEY = 'tqwj_camp_wxpay_h5_pending';

/** 二阶共修营：MWEB 跳转等待标记（与问卷/一阶共修营分离） */
export const WENJUAN_ADVANCED_CAMP_WXPAY_H5_PENDING_KEY =
  'tqwj_advanced_camp_wxpay_h5_pending';

/** 微信侧 success 后首轮等待毫秒（与 zion-payment / wechat-miniprogram-payment 建议 ~2s 一致） */
export const WENJUAN_PAY_WEBHOOK_WAIT_MS = 2500;

/** 首轮未查到成功记录时的二次等待 */
export const WENJUAN_PAY_WEBHOOK_RETRY_WAIT_MS = 2000;

/**
 * 是否在控制台打印支付相关 GraphQL 请求体（variables）与响应摘要。
 * - 未设置 VITE_WENJUAN_PAY_LOG_REQUESTS：仅开发服（import.meta.env.DEV）打印。
 * - 设为 1：生产构建也会打印（排查完请关）。
 * - 设为 0：开发服也关闭。
 */
export function isWenjuanPayRequestLogEnabled(): boolean {
  const raw = import.meta.env.VITE_WENJUAN_PAY_LOG_REQUESTS?.trim().toLowerCase() ?? '';
  if (raw === '') return import.meta.env.DEV;
  if (FALSE.has(raw)) return false;
  return TRUE.has(raw);
}

export function logWenjuanPayRequest(label: string, payload: unknown): void {
  if (!isWenjuanPayRequestLogEnabled()) return;
  console.info(`[问卷支付] ${label}`, payload);
}
