import {
  WENJUAN_2026_ORDER_TYPE,
  WENJUAN_ORDER_PAY_CHANNEL_WEB,
  WENJUAN_ORDER_STATUS_UNPAID,
} from './lead2026';

/**
 * 问卷引流订单写入 ud_dingdan_b6a218（与 Zion 表字段一致）。
 * ud_yonghuxinxi_yonghuku_55773d 须为 null：该列外键指向用户库，填帐户 id 会违反 FK。
 *
 * 微信 V2 统一下单 total_fee 单位为「分」。Zion 若从「订单金额(整数)」映射 total_fee，该列须为分（如 29.9 元 → 2990），
 * 不要写「元」的整数 30，否则会报 JSAPI 缺少参数 total_fee 或金额异常。
 * ud_dingdanjine_a50087：GraphQL 标量为 `Decimal`，应传**两位小数字符串**（如 "29.90"）；传 JSON number 时部分网关解析异常会导致金额未入库 → 微信 total_fee 缺失。
 */
export function computeWenjuanDingdanAmountFields(amountYuan: number): {
  ud_dingdanjine_a50087: string;
  ud_dingdanjine0028zhengshu0029_1070ec: number;
} {
  const decimalYuan = Number.parseFloat(
    (Math.round(amountYuan * 100) / 100).toFixed(2)
  );
  return {
    ud_dingdanjine_a50087: decimalYuan.toFixed(2),
    ud_dingdanjine0028zhengshu0029_1070ec: Math.round(decimalYuan * 100),
  };
}

export function buildWenjuan2026DingdanInsertInput(amountYuan: number): Record<string, unknown> {
  const amounts = computeWenjuanDingdanAmountFields(amountYuan);
  return {
    ud_dingdanbeizhu_439d3a: WENJUAN_2026_ORDER_TYPE,
    ...amounts,
    ud_dingdanleixing_3ade69: WENJUAN_ORDER_STATUS_UNPAID,
    ud_dingdanleixing_3fb8b8: WENJUAN_2026_ORDER_TYPE,
    ud_fanganid_xueyuanfangan_614f26: null,
    ud_fanganxufeiriqi_4918a8: null,
    ud_jihuoshilianjiezhuanyuanid_902b22: null,
    ud_kecheng002ffangan002fjihuomaid_c16115: null,
    ud_kechengbaomingshujuid_kechengbaomingshuju_0b3b6d: null,
    ud_shifoukaitongfuwuzhuanyuanshenfen_684472: false,
    ud_suijima_5b358e: null,
    ud_tuikuanzhuangtai_4208c0: null,
    ud_yonghuxinxi_yonghuku_55773d: null,
    ud_zhifufangshi_f2b896: WENJUAN_ORDER_PAY_CHANNEL_WEB,
  };
}
