/**
 * 自建微信支付通道（网页端 JSAPI）。
 *
 * 背景：Zion 多客户端项目的支付商户号只能配置一套，网页端仍走旧商户号；
 * 而 Zion 的支付凭证为 editor-only（API/MCP 无法写入）。因此网页端改为直连
 * 自建 pay-service（见仓库 pay-service/），由它用指定商户号下单，
 * 支付成功后回调把订单表「订单状态」置为「已支付」。
 *
 * 未配置 VITE_PAY_SERVICE_URL 时全部能力关闭，前端继续走 Zion 内置支付。
 */

import { anonGraphqlRequest } from '../utils/anonGraphql';
import { WENJUAN_ORDER_STATUS_PAID } from '../constants/lead2026';

export type SelfPayResult =
  | {
      ok: true;
      outTradeNo: string;
      /** 该订单此前已支付成功（重复进入支付时的短路返回） */
      alreadyPaid: boolean;
      payParams: SelfPayJsapiParams | null;
    }
  | { ok: false; error: string };

export type SelfPayJsapiParams = {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
};

function serviceBaseUrl(): string {
  return String(import.meta.env.VITE_PAY_SERVICE_URL ?? '').trim().replace(/\/+$/, '');
}

/** 从帐号行取出公众号 openId（微信内授权登录后才有；JSAPI 下单必需） */
export function extractWechatOpenId(row: {
  oauth2_user_info_map?: { WECHAT?: { openId?: string | null } | null } | null;
} | null | undefined): string | null {
  const map = row?.oauth2_user_info_map;
  const direct = String(map?.WECHAT?.openId ?? '').trim();
  if (direct) return direct;
  // 兼容部分项目把渠道键写成小写或嵌套在 map 首层
  const raw = map as unknown as Record<string, unknown> | null | undefined;
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (key.toUpperCase() !== 'WECHAT') continue;
      const inner = value as { openId?: string | null; openid?: string | null } | null;
      const v = String(inner?.openId ?? inner?.openid ?? '').trim();
      if (v) return v;
    }
  }
  return null;
}

/** 是否启用自建支付通道（需配置 VITE_PAY_SERVICE_URL） */
export function isSelfPayEnabled(): boolean {
  return serviceBaseUrl().length > 0;
}

export async function createSelfPayOrder(input: {
  orderId: string;
  amountYuan: number;
  description: string;
  openId: string;
}): Promise<SelfPayResult> {
  const base = serviceBaseUrl();
  if (!base) return { ok: false, error: '未配置自建支付服务地址' };
  try {
    const res = await fetch(`${base}/api/pay/jsapi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      outTradeNo?: string;
      alreadyPaid?: boolean;
      payParams?: SelfPayJsapiParams;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `下单失败（HTTP ${res.status}）` };
    }
    if (json.alreadyPaid) {
      return { ok: true, outTradeNo: json.outTradeNo ?? '', alreadyPaid: true, payParams: null };
    }
    if (!json.payParams?.package) {
      return { ok: false, error: '支付服务未返回 prepay_id' };
    }
    return {
      ok: true,
      outTradeNo: json.outTradeNo ?? '',
      alreadyPaid: false,
      payParams: json.payParams,
    };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}

/** 向支付服务查单（兜底：微信回调可能延迟） */
export async function fetchSelfPayStatus(outTradeNo: string): Promise<{
  paid: boolean;
  tradeState?: string | null;
  error?: string;
}> {
  const base = serviceBaseUrl();
  if (!base || !outTradeNo) return { paid: false };
  try {
    const res = await fetch(
      `${base}/api/pay/status?outTradeNo=${encodeURIComponent(outTradeNo)}`
    );
    const json = (await res.json()) as { paid?: boolean; tradeState?: string | null; error?: string };
    return { paid: Boolean(json.paid), tradeState: json.tradeState ?? null, error: json.error };
  } catch (e) {
    return { paid: false, error: (e as Error)?.message ?? String(e) };
  }
}

const SELF_PAY_PAID_ORDERS = `
  query SelfPayPaidOrders($userLibraryId: bigint!, $publicAccountId: String!) {
    ud_dingdan_b6a218(
      where: {
        _and: [
          { ud_dingdanleixing_3ade69: { _eq: "${WENJUAN_ORDER_STATUS_PAID}" } }
          {
            _or: [
              { ud_yonghuxinxi_yonghuku_55773d: { _eq: $userLibraryId } }
              { ud_gongzhonghaoid_665d9b: { _eq: $publicAccountId } }
            ]
          }
        ]
      }
      limit: 50
    ) {
      id
      ud_dingdanleixing_3ade69
      ud_dingdanleixing_3fb8b8
      ud_dingdanbeizhu_439d3a
    }
  }
`;

export type SelfPayOrderRow = {
  id: string | number;
  ud_dingdanleixing_3ade69?: string | null;
  ud_dingdanleixing_3fb8b8?: string | null;
  ud_dingdanbeizhu_439d3a?: string | null;
};

/**
 * 匿名通道查询「自建支付已付」订单。
 *
 * 订单表对登录用户有行级过滤（登录态反而查不到），故与报名数据一样走匿名通道。
 */
export async function fetchSelfPayPaidOrders(input: {
  userLibraryId: string | number | null;
  publicAccountId?: string | null;
}): Promise<SelfPayOrderRow[]> {
  const rawUserLibraryId = String(input.userLibraryId ?? '').trim();
  const userLibraryId = /^\d+$/.test(rawUserLibraryId) ? Number(rawUserLibraryId) : 0;
  const publicAccountId = String(input.publicAccountId ?? '').trim() || '__none__';
  if (!userLibraryId && publicAccountId === '__none__') return [];
  const data = await anonGraphqlRequest<{ ud_dingdan_b6a218: SelfPayOrderRow[] }>(
    SELF_PAY_PAID_ORDERS,
    { userLibraryId, publicAccountId }
  );
  return data.ud_dingdan_b6a218 ?? [];
}
