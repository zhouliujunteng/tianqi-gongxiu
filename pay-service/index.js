/**
 * 天启无书 · 自建微信支付服务
 *
 * 背景：Zion 多客户端项目的支付商户号只能配置一个，网页端（公众号 JSAPI）仍走旧商户号。
 * Zion 的支付凭证为 editor-only（API/MCP 无法写入），因此把网页端收款改为本服务直连微信支付 v3，
 * 使用指定商户号；支付成功后由本服务回调写回 Zion 订单表的「订单状态」。
 *
 * 依赖的环境变量：
 *   WECHAT_MCH_ID          商户号（如 1666219884）
 *   WECHAT_APP_ID          收款公众号/小程序的 appid（必须与商户号已关联）
 *   WECHAT_API_V3_KEY      APIv3 密钥（32 位）
 *   WECHAT_SERIAL_NO       商户 API 证书序列号
 *   WECHAT_PRIVATE_KEY     商户 API 证书私钥（PEM；支持把换行写成 \n）
 *   WECHAT_PRIVATE_KEY_PATH  可选，私钥文件路径（与上一项二选一）
 *   WECHAT_NOTIFY_URL      微信支付回调地址（本服务的 /api/pay/notify 公网地址）
 *   ZION_GRAPHQL_URL       Zion GraphQL 端点（默认天启无书项目）
 *   ALLOWED_ORIGIN         可选，CORS 允许的来源（默认 *）
 *   PORT                   监听端口（默认 3000）
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';

const PORT = Number(process.env.PORT || 3000);
const MCH_ID = (process.env.WECHAT_MCH_ID || '').trim();
const APP_ID = (process.env.WECHAT_APP_ID || '').trim();
const API_V3_KEY = (process.env.WECHAT_API_V3_KEY || '').trim();
const SERIAL_NO = (process.env.WECHAT_SERIAL_NO || '').trim();
const NOTIFY_URL = (process.env.WECHAT_NOTIFY_URL || '').trim();
const ZION_GRAPHQL_URL = (
  process.env.ZION_GRAPHQL_URL ||
  'https://zion-app.functorz.com/zero/bZ7yl9DZ4YY/api/graphql-v2'
).trim();
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '*').trim();

/** 订单表「订单状态」字段写入值（与前端 WENJUAN_ORDER_STATUS_PAID 一致） */
const ORDER_STATUS_PAID = '已支付';

function missingConfig() {
  const pairs = [
    ['WECHAT_MCH_ID', MCH_ID],
    ['WECHAT_APP_ID', APP_ID],
    ['WECHAT_API_V3_KEY', API_V3_KEY],
    ['WECHAT_SERIAL_NO', SERIAL_NO],
    ['WECHAT_PRIVATE_KEY', PRIVATE_KEY],
  ];
  return pairs.filter(([, v]) => !v).map(([k]) => k);
}

function loadPrivateKey() {
  const path = (process.env.WECHAT_PRIVATE_KEY_PATH || '').trim();
  if (path) {
    try {
      return fs.readFileSync(path, 'utf8');
    } catch (e) {
      console.error('[pay-service] 读取私钥文件失败：', e?.message ?? e);
      return '';
    }
  }
  const raw = process.env.WECHAT_PRIVATE_KEY || '';
  if (!raw) return '';
  // 环境变量里把换行写成 \n 的情况
  return raw.includes('-----BEGIN') ? raw.replace(/\\n/g, '\n') : raw;
}

const PRIVATE_KEY = loadPrivateKey();

/* ------------------------------------------------------------------ *
 * 微信支付 v3 基础能力
 * ------------------------------------------------------------------ */

function rsaSha256Sign(message) {
  return crypto.createSign('RSA-SHA256').update(message).sign(PRIVATE_KEY, 'base64');
}

function randomNonce() {
  return crypto.randomBytes(16).toString('hex').slice(0, 32);
}

/** 构造 Authorization 请求头（WECHATPAY2-SHA256-RSA2048） */
function buildAuthorization(method, urlPath, body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomNonce();
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSha256Sign(message);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${SERIAL_NO}"`;
}

async function wechatRequest(method, urlPath, bodyObj) {
  const body = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
  const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method,
    headers: {
      Authorization: buildAuthorization(method, urlPath, body),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'tianqi-pay-service/1.0',
    },
    body: method === 'GET' ? undefined : body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, text, json };
}

/** AES-256-GCM 解密（回调 resource / 平台证书） */
function decryptAesGcm(apiV3Key, nonce, ciphertext, associatedData = '') {
  const key = Buffer.from(apiV3Key, 'utf8');
  const iv = Buffer.from(nonce, 'utf8');
  const data = Buffer.from(ciphertext, 'base64');
  // 密文 = 实际密文 + 16 字节 auth tag
  const enc = data.subarray(0, data.length - 16);
  const tag = data.subarray(data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

let platformCertCache = { at: 0, certs: [] };

/** 拉取平台证书（用于回调验签），缓存 12 小时 */
async function getPlatformCerts() {
  const now = Date.now();
  if (platformCertCache.certs.length && now - platformCertCache.at < 12 * 3600 * 1000) {
    return platformCertCache.certs;
  }
  const { status, json } = await wechatRequest('GET', '/v3/certificates', undefined);
  if (status !== 200 || !Array.isArray(json?.data)) {
    throw new Error(`获取平台证书失败：HTTP ${status} ${JSON.stringify(json)}`);
  }
  const certs = json.data.map((item) => ({
    serial: item.serial_no,
    effectiveTime: item.effective_time,
    expireTime: item.expire_time,
    publicKey: crypto
      .createPublicKey(
        decryptAesGcm(API_V3_KEY, item.encrypt_certificate.nonce, item.encrypt_certificate.ciphertext, item.encrypt_certificate.associated_data)
      )
      .export({ type: 'spki', format: 'pem' }),
  }));
  platformCertCache = { at: now, certs };
  return certs;
}

/**
 * 校验回调签名。
 * serial 不匹配时自动刷新一次平台证书再试（微信会轮换证书）。
 */
async function verifyNotifySignature(headers, rawBody) {
  const timestamp = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];
  const signature = headers['wechatpay-signature'];
  const serial = headers['wechatpay-serial'];
  if (!timestamp || !nonce || !signature || !serial) return false;

  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const verifyWith = (pem) =>
    crypto
      .createVerify('RSA-SHA256')
      .update(message)
      .verify(pem, signature, 'base64');

  let certs = await getPlatformCerts();
  let cert = certs.find((c) => c.serial === serial);
  if (!cert) {
    platformCertCache = { at: 0, certs: [] };
    certs = await getPlatformCerts();
    cert = certs.find((c) => c.serial === serial);
  }
  if (!cert) return false;
  return verifyWith(cert.publicKey);
}

/* ------------------------------------------------------------------ *
 * Zion 写回（订单表对登录用户有行级过滤，统一走匿名通道）
 * ------------------------------------------------------------------ */

async function zionGraphql(query, variables) {
  const res = await fetch(ZION_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const UPDATE_ORDER_PAID = `
  mutation MarkOrderPaid($id: bigint!, $status: String!) {
    update_ud_dingdan_b6a218_by_pk(
      pk_columns: { id: $id }
      _set: { ud_dingdanleixing_3ade69: $status, ud_zhifufangshi_f2b896: "web" }
    ) {
      id
      ud_dingdanleixing_3ade69
    }
  }
`;

async function markOrderPaid(orderId) {
  const data = await zionGraphql(UPDATE_ORDER_PAID, {
    id: Number(orderId),
    status: ORDER_STATUS_PAID,
  });
  if (data?.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join('；'));
  }
  if (!data?.data?.update_ud_dingdan_b6a218_by_pk?.id) {
    throw new Error(`订单 ${orderId} 状态更新未返回记录：${JSON.stringify(data)}`);
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Express
 * ------------------------------------------------------------------ */

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: '128kb' }));

const processedTradeNo = new Set();

function outTradeNoOf(orderId, suffix = '') {
  return `TQ${String(orderId).replace(/\D/g, '')}${suffix}`.slice(0, 32);
}

function orderIdFromTradeNo(outTradeNo) {
  const m = /^TQ(\d+)/.exec(String(outTradeNo || ''));
  return m ? m[1] : null;
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'tianqi-pay-service',
    mchId: MCH_ID || null,
    appId: APP_ID || null,
    notifyUrl: NOTIFY_URL || null,
    configComplete: missingConfig().length === 0 && Boolean(NOTIFY_URL),
    missingConfig: missingConfig(),
  });
});

/**
 * JSAPI 下单
 * body: { orderId, amountYuan, description, openId }
 */
app.post('/api/pay/jsapi', async (req, res) => {
  try {
    const miss = missingConfig();
    if (miss.length) {
      res.status(500).json({ error: `支付服务配置不完整：${miss.join(', ')}` });
      return;
    }
    const { orderId, amountYuan, description, openId } = req.body ?? {};
    if (!orderId || !/^\d+$/.test(String(orderId))) {
      res.status(400).json({ error: 'orderId 无效' });
      return;
    }
    const total = Math.round(Number(amountYuan) * 100);
    if (!Number.isFinite(total) || total <= 0) {
      res.status(400).json({ error: 'amountYuan 无效' });
      return;
    }
    if (!openId) {
      res.status(400).json({ error: '缺少 openId，请在微信内打开页面后重试' });
      return;
    }
    if (!NOTIFY_URL) {
      res.status(500).json({ error: '未配置 WECHAT_NOTIFY_URL' });
      return;
    }

    // 同一订单重复下单：先查一次，已支付直接返回；已关闭则换 out_trade_no 后缀
    let baseTradeNo = outTradeNoOf(orderId);
    const query = await wechatRequest(
      'GET',
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(baseTradeNo)}?mchid=${MCH_ID}`,
      undefined
    );
    if (query.status === 200 && query.json) {
      if (query.json.trade_state === 'SUCCESS') {
        res.json({ ok: true, outTradeNo: baseTradeNo, alreadyPaid: true });
        return;
      }
      if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(query.json.trade_state)) {
        baseTradeNo = outTradeNoOf(orderId, `R${Date.now().toString().slice(-6)}`);
      }
    }

    const body = {
      appid: APP_ID,
      mchid: MCH_ID,
      description: String(description || '天启无书课程报名').slice(0, 127),
      out_trade_no: baseTradeNo,
      time_expire: new Date(Date.now() + 30 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '+08:00'),
      attach: String(orderId),
      notify_url: NOTIFY_URL,
      support_fapiao: false,
      amount: { total, currency: 'CNY' },
      payer: { openid: openId },
    };

    const created = await wechatRequest('POST', '/v3/pay/transactions/jsapi', body);
    if (created.status !== 200 || !created.json?.prepay_id) {
      const msg = created.json?.message || created.json?.code || created.text;
      res.status(502).json({ error: `微信下单失败：${msg}`, detail: created.json ?? created.text });
      return;
    }

    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = randomNonce();
    const pkg = `prepay_id=${created.json.prepay_id}`;
    const paySign = rsaSha256Sign(`${APP_ID}\n${timeStamp}\n${nonceStr}\n${pkg}\n`);

    res.json({
      ok: true,
      outTradeNo: baseTradeNo,
      payParams: {
        appId: APP_ID,
        timeStamp,
        nonceStr,
        package: pkg,
        signType: 'RSA',
        paySign,
      },
    });
  } catch (e) {
    console.error('[pay-service] /api/pay/jsapi 异常：', e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

/**
 * 支付结果通知（微信服务器回调）
 */
app.post('/api/pay/notify', express.text({ type: '*/*' }), async (req, res) => {
  const rawBody = typeof req.body === 'string' ? req.body : '';
  try {
    const ok = await verifyNotifySignature(req.headers, rawBody);
    if (!ok) {
      console.warn('[pay-service] 回调验签失败');
      res.status(401).json({ code: 'FAIL', message: '签名验证失败' });
      return;
    }
    const payload = JSON.parse(rawBody);
    const resource = payload?.resource;
    if (!resource) {
      res.status(400).json({ code: 'FAIL', message: '缺少 resource' });
      return;
    }
    const plain = decryptAesGcm(
      API_V3_KEY,
      resource.nonce,
      resource.ciphertext,
      resource.associated_data
    );
    const data = JSON.parse(plain);
    const orderId = data?.attach || orderIdFromTradeNo(data?.out_trade_no);

    if (data?.trade_state === 'SUCCESS' && orderId) {
      if (!processedTradeNo.has(data.out_trade_no)) {
        processedTradeNo.add(data.out_trade_no);
        await markOrderPaid(orderId);
        console.log(`[pay-service] 订单 ${orderId} 已标记支付成功（${data.out_trade_no}，${data.amount?.total ?? ''} 分）`);
      }
    }
    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (e) {
    console.error('[pay-service] /api/pay/notify 异常：', e);
    res.status(500).json({ code: 'FAIL', message: e?.message ?? '处理失败' });
  }
});

/**
 * 查单（前端兜底轮询）
 * query: outTradeNo 或 orderId
 */
app.get('/api/pay/status', async (req, res) => {
  try {
    const miss = missingConfig();
    if (miss.length) {
      res.status(500).json({ error: `支付服务配置不完整：${miss.join(', ')}` });
      return;
    }
    const { outTradeNo, orderId } = req.query ?? {};
    const tradeNo = String(outTradeNo || (orderId ? outTradeNoOf(orderId) : '')).trim();
    if (!tradeNo) {
      res.status(400).json({ error: '缺少 outTradeNo 或 orderId' });
      return;
    }
    const r = await wechatRequest(
      'GET',
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(tradeNo)}?mchid=${MCH_ID}`,
      undefined
    );
    if (r.status !== 200) {
      res.json({ paid: false, tradeState: r.json?.trade_state ?? null, raw: r.json ?? r.text });
      return;
    }
    const paid = r.json.trade_state === 'SUCCESS';
    if (paid) {
      const oid = r.json.attach || orderIdFromTradeNo(tradeNo);
      try {
        if (oid) await markOrderPaid(oid);
      } catch (e) {
        console.error('[pay-service] 查单补写订单状态失败：', e?.message ?? e);
      }
    }
    res.json({ paid, tradeState: r.json.trade_state, outTradeNo: tradeNo });
  } catch (e) {
    console.error('[pay-service] /api/pay/status 异常：', e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[pay-service] listening on ${PORT}`);
  const miss = missingConfig();
  if (miss.length) console.warn(`[pay-service] 缺少配置： ${miss.join(', ')}`);
  if (!NOTIFY_URL) console.warn('[pay-service] 未配置 WECHAT_NOTIFY_URL');
});
