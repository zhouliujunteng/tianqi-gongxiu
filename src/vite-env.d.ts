/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ZION_PROJECT_EX_ID: string;
  /** 微信网页授权完整入口 URL；可用 {REDIRECT} 占位表示编码后的当前页回跳地址 */
  readonly VITE_ZION_WECHAT_OAUTH_URL?: string;
  /**
   * 可选：电脑浏览器内使用的授权页（一般为开放平台网站应用 qrconnect）。
   * 未配置时展示「扫码在手机微信打开」二维码，避免点链接出现「请在微信客户端打开」。
   */
  readonly VITE_ZION_WECHAT_OAUTH_URL_PC?: string;

  /** 设为 1 时在问卷页展示微信支付卡片（依赖 Zion 订单表 + 微信商户 + 创建订单行为流） */
  readonly VITE_WENJUAN_PAY_ENABLED?: string;
  /** 设为 1 时未标记「已支付」则禁止提交问卷 */
  readonly VITE_WENJUAN_PAY_REQUIRE_SUBMIT?: string;
  readonly VITE_WENJUAN_PAY_AMOUNT_YUAN?: string;
  readonly VITE_WENJUAN_PAY_DESCRIPTION?: string;
  /** 1=打印支付 GraphQL variables/响应；0=关闭；未设置则仅 dev 打印 */
  readonly VITE_WENJUAN_PAY_LOG_REQUESTS?: string;
  /** 1=createWechatPayment 的 amount 传整数分（2990），适配后端未做元→分换算；默认 0=传元（29.9） */
  readonly VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_FEN?: string;
  /** 1=createWechatPayment 的 amount 传 "29.90" 字符串（BigDecimal） */
  readonly VITE_WENJUAN_CREATE_WECHAT_PAY_AMOUNT_AS_YUAN_STRING?: string;
  /** 1=insert 订单后再 update_by_pk 写一次金额列 */
  readonly VITE_WENJUAN_ORDER_AMOUNT_PATCH_AFTER_INSERT?: string;
  /** 覆盖 GraphQL PaymentType，如 WECHATPAY_MINIPROGRAM、WECHATPAY_MOBILE_WEB */
  readonly VITE_WECHAT_PAYMENT_TYPE?: string;

  /** 若小程序用行为流建支付订单，填同一行为流 id，网页将走 fz_invoke_action_flow 而非 insert 订单表 */
  readonly VITE_WENJUAN_ORDER_CREATE_ACTION_FLOW_ID?: string;
  /** 行为流版本，默认 -1 为最新已发布 */
  readonly VITE_WENJUAN_ORDER_CREATE_ACTION_FLOW_VERSION_ID?: string;
  /** 合并进行为流 args 的静态 JSON 对象（字符串），键名须与行为流输入节点一致 */
  readonly VITE_WENJUAN_ORDER_CREATE_FLOW_ARGS_JSON?: string;
  /** 若返回值里订单 id 不在默认字段名中，填顶层键名，如 dingdan_id */
  readonly VITE_WENJUAN_ORDER_CREATE_FLOW_ORDER_ID_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
