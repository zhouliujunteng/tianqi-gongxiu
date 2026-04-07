/** 问题选项：家长认为最重要的两项（可多选，最多 2 个） */
export const PRIORITY_OPTION_POOL = [
  '学习能力与成绩',
  '行为习惯与自律',
  '亲子关系与沟通',
  '情绪与心理健康',
  '社交与同伴关系',
  '兴趣爱好与特长',
  '手机与网络使用',
  '未来发展与升学',
] as const;

/** 写入「问卷收集_2026」表 · 问卷类型 */
export const WENJUAN_TYPE_ROUTINE = '常规收集';

/** 订单表「订单类型」字段：与 Zion 订单 ud_dingdanleixing_3fb8b8 一致 */
export const WENJUAN_2026_ORDER_TYPE = '2026引流问卷';

/** 订单表「订单状态」字段：已支付（ud_dingdanleixing_3ade69） */
export const WENJUAN_ORDER_STATUS_PAID = '已支付';

/** 新建订单时的状态：未支付 */
export const WENJUAN_ORDER_STATUS_UNPAID = '未支付';

/** 订单表「支付方式」：网站 / H5（ud_zhifufangshi_f2b896） */
export const WENJUAN_ORDER_PAY_CHANNEL_WEB = 'web';
