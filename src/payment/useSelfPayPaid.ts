import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchSelfPayPaidOrders,
  isSelfPayEnabled,
  type SelfPayOrderRow,
} from './selfPay';
import { WENJUAN_ORDER_STATUS_PAID } from '../constants/lead2026';

function matchesAlias(row: SelfPayOrderRow, aliases: readonly string[]): boolean {
  const remark = String(row.ud_dingdanbeizhu_439d3a ?? '').trim();
  const orderType = String(row.ud_dingdanleixing_3fb8b8 ?? '').trim();
  return (
    (Boolean(remark) && aliases.includes(remark)) ||
    (Boolean(orderType) && aliases.includes(orderType))
  );
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
  /** 未确认已付时的轮询间隔（毫秒），默认 4000 */
  pollMs?: number;
}): { paid: boolean; loading: boolean; refetch: () => void } {
  const { enabled, userLibraryId, publicAccountId, aliases, pollMs = 4000 } = input;

  const hasIdentifier = useMemo(() => {
    const lib = String(userLibraryId ?? '').trim();
    const pub = String(publicAccountId ?? '').trim();
    return /^\d+$/.test(lib) || Boolean(pub);
  }, [publicAccountId, userLibraryId]);

  const active = enabled && isSelfPayEnabled() && hasIdentifier;

  const [rows, setRows] = useState<SelfPayOrderRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!active) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSelfPayPaidOrders({ userLibraryId, publicAccountId })
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, publicAccountId, tick, userLibraryId]);

  const paid = useMemo(() => {
    if (!rows?.length) return false;
    return rows.some(
      (row) =>
        String(row.ud_dingdanleixing_3ade69 ?? '').trim() === WENJUAN_ORDER_STATUS_PAID &&
        matchesAlias(row, aliases)
    );
  }, [aliases, rows]);

  useEffect(() => {
    if (!active || paid) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), pollMs);
    return () => window.clearInterval(timer);
  }, [active, paid, pollMs]);

  return { paid, loading: active && loading && rows === null, refetch };
}
