import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchSelfPayPaidOrders,
  isSelfPayEnabled,
  type SelfPayOrderRow,
} from './selfPay';
import { WENJUAN_ORDER_STATUS_PAID } from '../constants/lead2026';

/**
 * 判断订单是否属于本期次。
 *
 * 关键：只认「订单备注」里的期次标识，**不能**用「订单类型」顶替。
 * 所有共修营订单的订单类型都是「2026共修营」，如果拿订单类型去匹配别名，
 * 家长只要付过第2/3/4/6/8期中任意一期，就会被判定为「本期已付」而免单进营。
 */
function matchesAlias(
  row: SelfPayOrderRow,
  aliases: readonly string[],
  orderType?: string | null
): boolean {
  const remark = String(row.ud_dingdanbeizhu_439d3a ?? '').trim();
  const type = String(row.ud_dingdanleixing_3fb8b8 ?? '').trim();
  const expectedType = String(orderType ?? '').trim();
  // 给了订单类型就要求一致，避免把别的课程订单算进来
  if (expectedType && type !== expectedType) return false;
  if (!remark) return false;
  return aliases.includes(remark);
}

/**
 * 判断「自建支付通道」是否已为本期完成支付。
 *
 * Zion 的 fz_payment_record 只记录 Zion 内置支付；自建通道收款成功后由 pay-service
 * 回调把订单表「订单状态」置为「已支付」，因此这里按用户库ID / 公众号ID 查订单表补一路判定。
 * 订单表对登录用户有行级过滤，查询走匿名通道。
 */
export function useSelfPayPaid(input: {
  enabled: boolean;
  userLibraryId: string | number | null;
  publicAccountId?: string | null;
  aliases: readonly string[];
  /** 订单类型（如「2026共修营」）：用于排除其它课程的订单 */
  orderType?: string | null;
  /** 未确认已付时的轮询间隔（毫秒），默认 4000 */
  pollMs?: number;
}): {
  paid: boolean;
  /** 本期已付订单的订单表 ID（打卡要挂在这张订单上） */
  paidOrderId: string | null;
  loading: boolean;
  refetch: () => void;
} {
  const { enabled, userLibraryId, publicAccountId, aliases, orderType, pollMs = 4000 } =
    input;

  const hasIdentifier = useMemo(() => {
    const lib = String(userLibraryId ?? '').trim();
    const pub = String(publicAccountId ?? '').trim();
    return /^\d+$/.test(lib) || Boolean(pub);
  }, [publicAccountId, userLibraryId]);

  const active = enabled && isSelfPayEnabled() && hasIdentifier;

  const [rows, setRows] = useState<SelfPayOrderRow[] | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  // 换了 ID 就丢掉上一个 ID 的查询结果，避免拿旧结果误判「未付」或「已付」
  useEffect(() => {
    setRows(null);
  }, [publicAccountId, userLibraryId]);

  useEffect(() => {
    if (!active) {
      setRows(null);
      return;
    }
    let cancelled = false;
    fetchSelfPayPaidOrders({ userLibraryId, publicAccountId })
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [active, publicAccountId, tick, userLibraryId]);

  const paidOrderId = useMemo(() => {
    const row = rows?.find(
      (r) =>
        String(r.ud_dingdanleixing_3ade69 ?? '').trim() === WENJUAN_ORDER_STATUS_PAID &&
        matchesAlias(r, aliases, orderType)
    );
    return row ? String(row.id) : null;
  }, [aliases, orderType, rows]);
  const paid = paidOrderId !== null;

  useEffect(() => {
    if (!active || paid) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), pollMs);
    return () => window.clearInterval(timer);
  }, [active, paid, pollMs]);

  return { paid, paidOrderId, loading: active && rows === null, refetch };
}
