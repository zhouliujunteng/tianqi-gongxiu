/**
 * 管理后台：补上「自建支付通道」的已付订单。
 *
 * Zion 的 fz_payment_record 只记录 Zion 内置支付；自建通道（pay-service）收款后
 * 由回调把订单表「订单状态」置为「已支付」，所以后台名单要把订单表这一路也查出来合并展示。
 * 订单表对登录用户有行级过滤，查询走匿名通道。
 */

import { useCallback, useEffect, useState } from 'react';
import { anonGraphqlRequest } from '../utils/anonGraphql';
import { WENJUAN_ORDER_STATUS_PAID } from '../constants/lead2026';

const ADMIN_SELF_PAID_ORDERS = `
  query AdminSelfPaidOrders($orderType: String!) {
    ud_dingdan_b6a218(
      where: {
        _and: [
          { ud_dingdanleixing_3ade69: { _eq: "${WENJUAN_ORDER_STATUS_PAID}" } }
          { ud_dingdanleixing_3fb8b8: { _eq: $orderType } }
        ]
      }
      order_by: [{ id: desc }]
      limit: 300
    ) {
      id
      created_at
      updated_at
      ud_dingdanleixing_3ade69
      ud_dingdanleixing_3fb8b8
      ud_dingdanbeizhu_439d3a
      ud_yonghuxinxi_yonghuku_55773d
      ud_gongzhonghaoid_665d9b
      ud_gongxiuyingweixin_62acc6
      ud_tianjiazhuangtai_a1779b
      ud_dingdanjine_a50087
      ud_dingdanjine0028zhengshu0029_1070ec
    }
  }
`;

export type AdminSelfPaidRow = {
  id: string | number;
  created_at: string | null;
  updated_at: string | null;
  ud_dingdanbeizhu_439d3a: string | null;
  order: {
    id: string | number;
    ud_dingdanbeizhu_439d3a: string | null;
    ud_yonghuxinxi_yonghuku_55773d: string | number | null;
    ud_gongzhonghaoid_665d9b: string | null;
    ud_gongxiuyingweixin_62acc6: string | null;
    ud_tianjiazhuangtai_a1779b: string | null;
    ud_dingdanjine_a50087: string | null;
    ud_dingdanjine0028zhengshu0029_1070ec: number | null;
  };
};

type RawRow = {
  id: string | number;
  created_at: string | null;
  updated_at: string | null;
  ud_dingdanbeizhu_439d3a: string | null;
  ud_yonghuxinxi_yonghuku_55773d: string | number | null;
  ud_gongzhonghaoid_665d9b: string | null;
  ud_gongxiuyingweixin_62acc6: string | null;
  ud_tianjiazhuangtai_a1779b: string | null;
  ud_dingdanjine_a50087: string | null;
  ud_dingdanjine0028zhengshu0029_1070ec: number | null;
};

function toAdminRow(r: RawRow): AdminSelfPaidRow {
  return {
    id: r.id,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
    ud_dingdanbeizhu_439d3a: r.ud_dingdanbeizhu_439d3a ?? null,
    order: {
      id: r.id,
      ud_dingdanbeizhu_439d3a: r.ud_dingdanbeizhu_439d3a ?? null,
      ud_yonghuxinxi_yonghuku_55773d: r.ud_yonghuxinxi_yonghuku_55773d ?? null,
      ud_gongzhonghaoid_665d9b: r.ud_gongzhonghaoid_665d9b ?? null,
      ud_gongxiuyingweixin_62acc6: r.ud_gongxiuyingweixin_62acc6 ?? null,
      ud_tianjiazhuangtai_a1779b: r.ud_tianjiazhuangtai_a1779b ?? null,
      ud_dingdanjine_a50087: r.ud_dingdanjine_a50087 ?? null,
      ud_dingdanjine0028zhengshu0029_1070ec:
        r.ud_dingdanjine0028zhengshu0029_1070ec ?? null,
    },
  };
}

/** 后台名单用：一次性拉取某订单类型下自建通道的已付订单 */
export async function fetchAdminSelfPaidOrders(
  orderType: string
): Promise<AdminSelfPaidRow[]> {
  const data = await anonGraphqlRequest<{ ud_dingdan_b6a218: RawRow[] }>(
    ADMIN_SELF_PAID_ORDERS,
    { orderType }
  );
  return (data.ud_dingdan_b6a218 ?? []).map(toAdminRow);
}

/** 后台名单用：按订单类型拉取自建通道的已付订单（带 loading / 手动刷新） */
export function useAdminSelfPaidOrders(
  enabled: boolean,
  orderType: string
): {
  rows: AdminSelfPaidRow[];
  loading: boolean;
  refresh: () => void;
} {
  const [rows, setRows] = useState<AdminSelfPaidRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const list = await fetchAdminSelfPaidOrders(orderType);
        if (cancelled) return;
        setRows(list);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, orderType, nonce]);

  return { rows, loading, refresh };
}
