#!/usr/bin/env node
/**
 * 移动云盘商品抢兑
 * cron: 0 10,16,0 * * *
 * tag: 中国移动
 * @tag 中国移动
 * new Env('移动云盘_商品抢兑')
 *
 * YDYP_AUTH：与签到脚本一致，多账号换行 / & / JSON 均可
 * YDYP_EXCHANGE_PRIZES：商品 ID，英文逗号分隔；留空仅查询
 * YDYP_DEVICE_ID：可选全局设备 ID
 *
 * 滑块偏移改为真实图像识别(NCC)，替代原随机估算
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SCRIPT_VERSION = '1.1.0';
const CACHE_FILE = path.join(process.cwd(), 'ydyp_cache.json');
const MARKET_BASE_URL = 'https://m.mcloud.139.com';
const CLIENT_VERSION = '13.0.0';
const MARKET_SOURCE_ID = '1097';
const AUTH_SIGN_SECRET = 'sekaMdYYLIZfbCfm';
const TARGET_SOURCE_ID = '001005';
const SM_PUBLIC_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC8KHAcHbkCn5rxGgGJE+07tY+pt86D/oZ7sA51FaEBv2jgno2TI9zHJVYKJynmiKpixgwUcv93EfWIrU/p/UCs5Vu+odS3I4UBp3R7IZ1A0W01FkumAHYW2PQpMm8ueQKPLUq/idkpG/9b2JDv/qU+Ks36nbUPwlW4CjdfrV+V9QIDAQAB';
const SM_ORGANIZATION = 'FXlyfmWg2AzwbrxDKSv5';
const SM_DEVICE_PROFILE_URL = 'https://slw.h5cmpassport.com:9090/deviceprofile/v4';

const isDebug = /^(true|1|yes|on)$/i.test(process.env.YDYP_DEBUG || '');
const globalDeviceId = String(process.env.YDYP_DEVICE_ID || '').trim();
const prizeIds = String(process.env.YDYP_EXCHANGE_PRIZES || process.env.ydyp_exchange_prizes || '')
  .split(/[,，\s]+/)
  .filter(Boolean);
const messages = [];
const failedAccounts = [];

function log(value) {
  console.log(String(value));
}

function loadStorage() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) || {};
  } catch (error) {
    return {};
  }
}

const cache = loadStorage();

function normalizeAuthorization(token) {
  const value = String(token || '').trim().replace(/^@/, '').replace(/^Basic(%20|\s+)/i, '');
  return value ? `Basic ${value}` : '';
}

function extractPhoneFromAuthorization(authorization) {
  const value = String(authorization || '').trim().replace(/^Basic(%20|\s+)/i, '');
  try {
    const parts = Buffer.from(value, 'base64').toString('utf8').split(':');
    return /^\d{11}$/.test(parts[1] || '') ? parts[1] : '';
  } catch (error) {
    return '';
  }
}

function parseYdypAccounts(raw) {
  return String(raw || '')
    .split(/\r?\n|&/)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      try {
        const parsed = JSON.parse(entry);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        return list.map(item => ({
          Authorization: normalizeAuthorization(item.Authorization || item.token || ''),
          phone: String(item.phone || item.account || extractPhoneFromAuthorization(item.Authorization || item.token || '')).trim(),
          deviceId: String(item.deviceId || '').trim(),
        }));
      } catch (error) {
        const separatorIndex = entry.lastIndexOf('@');
        const rawToken = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : entry.trim();
        return [{
          Authorization: normalizeAuthorization(rawToken),
          phone: separatorIndex >= 0 ? String(entry.slice(0, separatorIndex)).replace(/\D/g, '') : extractPhoneFromAuthorization(rawToken),
          deviceId: '',
        }];
      }
    })
    .flat()
    .filter(item => item.Authorization && /^\d{11}$/.test(item.phone));
}

function maskPhone(phone) {
  const value = String(phone || '');
  return value.length >= 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
}

function uuid4() {
  return crypto.randomUUID();
}

function randomInteger(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function appendParams(url, params) {
  if (!params || typeof params !== 'object') return url;
  const query = Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
  return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson(options) {
  const response = await sendRequest(options);
  if (!response) return null;
  try {
    return JSON.parse(response.text);
  } catch (error) {
    return null;
  }
}

async function sendRequest({ url, headers = {}, cookies = {}, data = null, params = null, method = 'GET', retries = 3 }) {
  const requestHeaders = { ...headers };
  const cookieText = Object.keys(cookies)
    .filter(key => cookies[key])
    .map(key => `${key}=${cookies[key]}`)
    .join('; ');
  if (cookieText) requestHeaders.Cookie = cookieText;
  const targetUrl = appendParams(url, params);

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(targetUrl, {
        method: method.toUpperCase(),
        headers: requestHeaders,
        body: data === null || data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data),
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timer);
      const text = await response.text();
      if (response.status < 400) return { status: response.status, headers: Object.fromEntries(response.headers.entries()), text };
      log(`请求异常: ${targetUrl} (status=${response.status})`);
    } catch (error) {
      clearTimeout(timer);
      log(`请求异常: ${targetUrl} (${error.message})`);
    }
    if (attempt < retries - 1) await sleep(1000);
  }
  return null;
}

async function buildAuthSignHeaders() {
  const requestId = uuid4();
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHash('md5').update(`${AUTH_SIGN_SECRET}${requestId}${timestamp}${nonce}${AUTH_SIGN_SECRET}`).digest('hex');
  return {
    'Content-Type': 'application/json',
    'x-request-id': requestId,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-signature': signature,
  };
}

function buildDeviceProfile() {
  const uid = uuid4();
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const stamp = bj.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const smidBase = `${stamp}${crypto.createHash('md5').update(uid).digest('hex')}00`;
  const smid = `${smidBase}${crypto.createHash('md5').update(`smsk_web_${smidBase}`).digest('hex').slice(0, 14)}0`;
  const env = {
    protocol: 242,
    organization: SM_ORGANIZATION,
    appId: 'default',
    os: 'web',
    version: '3.0.0',
    sdkver: '3.0.0',
    rtype: 'all',
    smid,
    subVersion: '1.0.0',
    time: randomInteger(1800000, 5400000),
    cdp: 0,
    maxTouchPoints: 5,
    cpucount: 8,
    ye: 8,
    jq: 8,
    lo: [],
    gj: 'zh-CN',
    rr: 'Google Inc.',
    sv: 'Netscape',
    qc: 'Mozilla',
    gt: 1080,
    wy: 1080,
    cj: 2280,
    wt: randomInteger(100, 180),
    hu: ['chrome'],
    documentExist: 1,
    yi: ['location'],
    dx: 'UTF-8',
    ii: 1,
    fs: 0,
    ga: 0,
    tk: 0,
    rm: 0,
    kr: 0,
    nk: 0,
    by: 'srgb',
    xt: 1,
    vh: 0,
    xc: { red: '0' },
    incognito: {
      getDirectoryExist: 0,
      getDirectoryIncognito: 0,
      maxTouchPointsExist: 1,
      indexedDBIncognito: 0,
      openDatabaseExist: 0,
      openDatabaseIncognito: 0,
      localStorageExist: 1,
      localStorageIncognito: 0,
      promiseExist: 1,
      promiseAllSettledExist: 1,
      queryUsageAndQuotaIncognito: 0,
      webkitRequestFileSystemIncognito: 0,
      serviceWorkerExist: 1,
      indexedDBExist: 1,
      browserName: 'Chrome',
    },
    t: bj.toUTCString(),
    collectTime: randomInteger(50, 130),
  };
  return JSON.stringify({
    appId: 'default',
    organization: SM_ORGANIZATION,
    ep: crypto.publicEncrypt({ key: `-----BEGIN PUBLIC KEY-----\n${SM_PUBLIC_KEY}\n-----END PUBLIC KEY-----`, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(uid)).toString('base64'),
    data: Buffer.from(JSON.stringify(env)).toString('base64'),
    os: 'web',
    encode: 1,
    compress: 0,
  });
}

async function fetchDeviceId() {
  const response = await sendRequest({
    url: SM_DEVICE_PROFILE_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Origin: MARKET_BASE_URL,
      Referer: `${MARKET_BASE_URL}/portal/mobilecloud/index.html?path=newsignin&sourceid=${MARKET_SOURCE_ID}`,
    },
    data: buildDeviceProfile(),
    retries: 1,
  });
  const result = response ? JSON.parse(response.text) : null;
  return result && result.code === 1100 && result.detail && result.detail.deviceId ? `B${result.detail.deviceId}` : '';
}

class Exchange {
  constructor(user) {
    this.Authorization = user.Authorization;
    this.account = user.phone;
    this.encryptAccount = maskPhone(this.account);
    this.deviceId = globalDeviceId || user.deviceId || (cache[this.account] && cache[this.account].deviceId) || '';
    this.marketCookies = {};
    this.marketHeaders = {};
    this.messages = [];
    this.exchangeSuccess = 0;
    this.exchangeSkipped = [];
  }

  log(content, { notify = false } = {}) {
    const text = String(content);
    log(text);
    if (notify) {
      const last = this.messages.length - 1;
      if (last >= 0 && this.messages[last].endsWith('▶')) this.messages[last] = `${this.messages[last]}\n${text}`;
      else this.messages.push(text);
    }
  }

  async guard(fn) {
    try {
      return await fn();
    } catch (error) {
      this.log(`错误: ${error.message}`);
      return null;
    }
  }

  buildMarketPageUrl() {
    return `${MARKET_BASE_URL}/portal/mobilecloud/index.html?path=newsignin&sourceid=${MARKET_SOURCE_ID}&enableShare=1`;
  }

  buildMarketHeaders(extra = {}) {
    return {
      ...this.marketHeaders,
      Accept: '*/*',
      Referer: this.buildMarketPageUrl(),
      appVersion: `${CLIENT_VERSION}.0`,
      deviceId: this.deviceId,
      ...extra,
    };
  }

  requestMarketJson(url, { params, data, method = 'GET', retries = 3, headers = {} } = {}) {
    return requestJson({ url, params, data, method, retries, headers: this.buildMarketHeaders(headers), cookies: this.marketCookies });
  }

  async querySpecToken() {
    const data = await requestJson({
      url: 'https://orches.yun.139.com/orchestration/auth-rebuild/token/v1.0/querySpecToken',
      method: 'POST',
      headers: { Authorization: this.Authorization, 'Content-Type': 'application/json', Accept: '*/*' },
      data: { account: this.account, toSourceId: TARGET_SOURCE_ID },
    });
    return data && data.success ? (data.data || {}).token || null : null;
  }

  async jwt() {
    const token = await this.querySpecToken();
    if (!token) return false;
    const data = await requestJson({
      url: `${MARKET_BASE_URL}/ycloud/auth-service/auth/tyrzLogin`,
      method: 'POST',
      headers: {
        ...await buildAuthSignHeaders(),
        Accept: '*/*',
        Origin: MARKET_BASE_URL,
        Referer: this.buildMarketPageUrl(),
        activityid: '{{SECRET_qhpslggq}}',
        appversion: `${CLIENT_VERSION}.0`,
        showloading: 'true',
      },
      data: { token, openAccount: 0, marketName: '{{SECRET_qhpslggq}}', sourceId: MARKET_SOURCE_ID },
      retries: 3,
    });
    if (!data || data.code !== 0 || !data.result || !data.result.token) return false;
    this.marketHeaders.jwtToken = data.result.token;
    this.marketCookies.jwtToken = data.result.token;
    return true;
  }

  async getCloudInfo() {
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/market/signin/page/infoV3`, { params: { client: 'app' } });
    if (!data || data.code !== 0) return;
    this.log(`• 云朵: ${data.result.total || 0}朵 / 待领取${data.result.toReceive || 0}朵`, { notify: true });
  }

  async getExchangeList() {
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/signin/page/exchangeList`, { params: { client: 'app', clientVersion: CLIENT_VERSION } });
    if (!data || data.code !== 0) return [];
    const result = data.result || {};
    const items = [];
    for (const key of Object.keys(result)) {
      if (!Array.isArray(result[key])) continue;
      for (const item of result[key]) {
        if (item && item.prizeId !== undefined) items.push({ ...item, groupId: item.groupId !== undefined ? item.groupId : key });
      }
    }
    return items.sort((a, b) => (Number(a.groupId) - Number(b.groupId)) || (Number(b.dailyRemainderCount || 0) - Number(a.dailyRemainderCount || 0)));
  }

  async getSlide() {
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/auth-service/slide/getSlide`, {
      method: 'POST',
      data: {},
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    });
    if (!data || data.code !== 0 || !data.result) return null;
    return { puzzle: data.result.puzzle, picture: data.result.picture };
  }

  async exchangePrize(prizeId, prizeName) {
    const label = prizeName || prizeId;
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let offset = null;
      const slide = await this.getSlide();
      if (!slide) {
        this.log(`• 兑换: ${label} 滑块获取失败 (第${attempt}/${maxAttempts}次)`);
      } else {
        offset = estimateSlideOffset(slide);
        if (offset === null) this.log(`• 兑换: ${label} 滑块识别失败 (第${attempt}/${maxAttempts}次)`);
      }
      if (offset === null) {
        if (attempt < maxAttempts) await sleep(800 + randomInteger(0, 400));
        continue;
      }
      const puzzleOffset = Math.max(0, offset + randomInteger(-2, 2));
      const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/signin/page/exchangeV3`, {
        method: 'POST',
        data: { prizeId: Number(prizeId), client: 'app', clientVersion: CLIENT_VERSION, puzzleOffset, smsCode: '', deviceId: this.deviceId },
        headers: { 'Content-Type': 'application/json', isdeviceId: 'true' },
      });
      if (data && data.code === 0) {
        this.log(`• 兑换: 成功 ${data.result.prizeName || prizeName}`, { notify: true });
        return true;
      }
      const msg = (data && data.msg) || '接口无响应';
      const isVerifyError = /验证|滑块/.test(String(msg)) || /puzzle/i.test(String(msg));
      this.log(`• 兑换: ${label} 失败 (${msg}) 第${attempt}/${maxAttempts}次 offset=${puzzleOffset}`);
      if (!isVerifyError) {
        this.log(`• 兑换: ${label} 失败 (${msg})`, { notify: true });
        return false;
      }
      if (attempt < maxAttempts) await sleep(900 + randomInteger(0, 500));
    }
    this.log(`• 兑换: ${label} 放弃 (连续${maxAttempts}次未通过)`, { notify: true });
    return false;
  }

  async queryReceivedPrizes() {
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/prizeApi/checkPrize/getUserPrizeLogPageV2`, { params: { currPage: 1, pageSize: 100 } });
    if (!data || data.code !== 0) return;
    const pending = (data.result && data.result.result || []).filter(item => item.flag === 1);
    if (pending.length) this.log(`• 待领取奖品: ${pending.map(item => item.prizeName).join('、')}`, { notify: true });
  }

  async run() {
    await this.getCloudInfo();
    const items = await this.getExchangeList();
    if (!prizeIds.length) {
      const listing = formatExchangeProducts(items) || '暂无可查询商品';
      log(`• 商品(${items.length}):\n${listing}`);
      this.messages.push(`• 商品(${items.length}):\n${listing}`);
      await this.queryReceivedPrizes();
      return;
    }
    for (const prizeId of prizeIds) {
      const item = items.find(value => String(value.prizeId) === String(prizeId));
      if (!item) {
        this.log(`• 商品: ${prizeId} 不在当前列表`);
        continue;
      }
      if ((item.dailyRemainderCount || 0) <= 0) {
        this.exchangeSkipped.push(`${item.prizeName}(已抢光)`);
        continue;
      }
      if (await this.exchangePrize(prizeId, item.prizeName)) this.exchangeSuccess++;
      await sleep(randomInteger(2000, 4000));
    }
    this.messages.push(`• 抢兑: 成功${this.exchangeSuccess}个${this.exchangeSkipped.length ? ` / 跳过${this.exchangeSkipped.join('、')}` : ''}`);
    await this.queryReceivedPrizes();
  }
}

// 滑块识别：PNG 解码（zlib inflate + 反滤波）+ 掩码 NCC 凹槽定位
// 内联自 work/slideoffset.module.js，日志经 nccLog 转接到 log()
function nccLog(message) {
  log(message);
}

function SlideOffset(puzzleB64, pictureB64) { function log(msg) { nccLog('[NCC] ' + msg); } function b64decode(str) { var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; var map = new Int16Array(256); var i; for (i = 0; i < 256; i++) map[i] = -1; for (i = 0; i < 64; i++) map[ABC.charCodeAt(i)] = i; var out = new Uint8Array(((str.length / 4) | 0) * 3 + 4); var o = 0, group = 0, gc = 0; for (i = 0; i < str.length; i++) { var c = str.charCodeAt(i); if (c === 61) continue; var v = c < 256 ? map[c] : -1; if (v < 0) continue; group = (group << 6) | v; gc++; if (gc === 4) { out[o++] = (group >> 16) & 255; out[o++] = (group >> 8) & 255; out[o++] = group & 255; group = 0; gc = 0; } } if (gc === 2) { out[o++] = (group >> 4) & 255; } else if (gc === 3) { out[o++] = (group >> 10) & 255; out[o++] = (group >> 2) & 255; } return out.subarray(0, o); } function inflate(data, start) { if (start + 2 > data.length) throw new Error('zlib too short'); var cmf = data[start]; if ((cmf & 0x0f) !== 8) throw new Error('bad compression method'); var d = data, p = start + 2, bitBuf = 0, bitCnt = 0; var out = new Uint8Array(Math.max(1024, d.length * 4)); var olen = 0; function getBit() { if (bitCnt === 0) { if (p >= d.length) throw new Error('inflate: unexpected end of input'); bitBuf = d[p++]; bitCnt = 8; } var b = bitBuf & 1; bitBuf >>= 1; bitCnt--; return b; } function getBits(n) { var v = 0; for (var i = 0; i < n; i++) v |= getBit() << i; return v; } function need(n) { if (olen + n <= out.length) return; var cap = out.length; while (cap < olen + n) cap *= 2; var no = new Uint8Array(cap); no.set(out.subarray(0, olen)); out = no; } function buildHuff(lengths, n) { var i, maxLen = 0; for (i = 0; i < n; i++) if (lengths[i] > maxLen) maxLen = lengths[i]; if (maxLen > 15) throw new Error('code length too long'); if (maxLen === 0) return { counts: null, offsets: null, symbols: null, maxLen: 0 }; var counts = new Int32Array(maxLen + 1); for (i = 0; i < n; i++) counts[lengths[i]]++; counts[0] = 0; var offs = new Int32Array(maxLen + 1), code = 0; for (i = 1; i <= maxLen; i++) { offs[i] = code; code += counts[i]; } var symbols = new Int32Array(code); var cur = new Int32Array(maxLen + 1); for (i = 1; i <= maxLen; i++) cur[i] = offs[i]; for (i = 0; i < n; i++) { var l = lengths[i]; if (l) symbols[cur[l]++] = i; } return { counts: counts, offsets: offs, symbols: symbols, maxLen: maxLen }; } function decodeSym(h) { if (h.maxLen === 0) throw new Error('empty huffman table'); var code = 0, first = 0, len; for (len = 1; len <= h.maxLen; len++) { code |= getBit(); var cnt = h.counts[len]; if (code - first < cnt) return h.symbols[h.offsets[len] + (code - first)]; first = (first + cnt) << 1; code <<= 1; } throw new Error('invalid huffman code'); } var LENS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]; var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]; var DISTS = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]; var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]; var CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]; var lit = null, dist = null, isFinal = false; do { isFinal = getBit() === 1; var type = getBits(2); if (type === 0) { bitCnt = 0; var len = getBits(16); getBits(16); if (p + len > d.length) throw new Error('stored block truncated'); need(len); out.set(d.subarray(p, p + len), olen); p += len; olen += len; } else { if (type === 1) { var fl = new Int32Array(288), i; for (i = 0; i < 144; i++) fl[i] = 8; for (i = 144; i < 256; i++) fl[i] = 9; for (i = 256; i < 280; i++) fl[i] = 7; for (i = 280; i < 288; i++) fl[i] = 8; var fd = new Int32Array(30); for (i = 0; i < 30; i++) fd[i] = 5; lit = buildHuff(fl, 288); dist = buildHuff(fd, 30); } else if (type === 2) { var hlit = getBits(5) + 257, hdist = getBits(5) + 1, hclen = getBits(4) + 4; if (hlit > 288 || hdist > 32) throw new Error('bad dynamic header'); var clens = new Int32Array(19); var k; for (k = 0; k < hclen; k++) clens[CLORDER[k]] = getBits(3); var cl = buildHuff(clens, 19); var lengths = new Int32Array(hlit + hdist); var t = 0; while (t < hlit + hdist) { var sym = decodeSym(cl); var rep = 0, val = 0; if (sym < 16) { lengths[t++] = sym; continue; } else if (sym === 16) { val = t > 0 ? lengths[t - 1] : 0; rep = 3 + getBits(2); } else if (sym === 17) { rep = 3 + getBits(3); } else { rep = 11 + getBits(7); } if (t + rep > hlit + hdist) throw new Error('length overflow'); for (k = 0; k < rep; k++) lengths[t++] = val; } lit = buildHuff(lengths.subarray(0, hlit), hlit); dist = buildHuff(lengths.subarray(hlit), hdist); } else { throw new Error('bad block type'); } for (;;) { var s = decodeSym(lit); if (s === 256) break; if (s < 256) { need(1); out[olen++] = s; } else { var li = s - 257; if (li >= 29) throw new Error('bad length symbol'); var nlen = LENS[li] + getBits(LEXT[li]); var ds = decodeSym(dist); if (ds >= 30) throw new Error('bad distance symbol'); var dd = DISTS[ds] + getBits(DEXT[ds]); if (dd > olen) throw new Error('distance beyond output'); need(nlen); var from = olen - dd; for (k = 0; k < nlen; k++) out[olen++] = out[from + k]; } } } } while (!isFinal); return out.subarray(0, olen); } function pngDecode(bytes) { var SIG = [137, 80, 78, 71, 13, 10, 26, 10]; if (bytes.length < 8) throw new Error('png: too short'); var i; for (i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) throw new Error('png: bad signature'); var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); var w = 0, h = 0, bd = 0, ct = -1, interlace = -1; var plte = null, trns = null; var idatParts = [], idatLen = 0; var p = 8, haveIhdr = false, done = false; while (!done && p + 8 <= bytes.length) { var clen = dv.getUint32(p); p += 4; var t1 = bytes[p], t2 = bytes[p + 1], t3 = bytes[p + 2], t4 = bytes[p + 3]; p += 4; if (p + clen > bytes.length) throw new Error('png: chunk truncated'); if (t1 === 73 && t2 === 72 && t3 === 68 && t4 === 82) { w = dv.getUint32(p); h = dv.getUint32(p + 4); bd = bytes[p + 8]; ct = bytes[p + 9]; interlace = bytes[p + 12]; haveIhdr = true; if (w <= 0 || h <= 0) throw new Error('png: bad size'); if (bd === 16) throw new Error('png: bitDepth 16 unsupported'); if (interlace !== 0) throw new Error('png: interlace unsupported'); } else if (t1 === 80 && t2 === 76 && t3 === 84 && t4 === 69) { plte = bytes.subarray(p, p + clen); } else if (t1 === 116 && t2 === 82 && t3 === 78 && t4 === 83) { trns = bytes.subarray(p, p + clen); } else if (t1 === 73 && t2 === 68 && t3 === 65 && t4 === 84) { idatParts.push(bytes.subarray(p, p + clen)); idatLen += clen; } else if (t1 === 73 && t2 === 69 && t3 === 78 && t4 === 68) { done = true; } p += clen + 4; } if (!haveIhdr || idatLen === 0) throw new Error('png: missing IHDR/IDAT'); if (ct !== 0 && ct !== 2 && ct !== 3 && ct !== 4 && ct !== 6) throw new Error('png: bad colorType'); if (ct !== 3 && bd !== 8) throw new Error('png: unsupported bitDepth'); if (ct === 3 && bd !== 1 && bd !== 2 && bd !== 4 && bd !== 8) throw new Error('png: unsupported palette bitDepth'); if (ct === 3 && (!plte || plte.length < 3)) throw new Error('png: palette without PLTE'); var comp = new Uint8Array(idatLen); var q = 0; for (i = 0; i < idatParts.length; i++) { comp.set(idatParts[i], q); q += idatParts[i].length; } var raw = inflate(comp, 0); var chn = ct === 0 || ct === 3 ? 1 : ct === 2 ? 3 : ct === 4 ? 2 : 4; var stride = (w * chn * bd + 7) >> 3; var bpp = Math.max(1, (chn * bd + 7) >> 3); var expect = (stride + 1) * h; if (raw.length < expect) throw new Error('png: incomplete scanline data'); var out = new Uint8Array(w * h * 4); var prev = new Uint8Array(stride), cur = new Uint8Array(stride); var rp = (stride + 1) * h; var y, x; for (y = 0; y < h; y++) { var base = y * (stride + 1); var f = raw[base]; var line = raw.subarray(base + 1, base + 1 + stride); if (f === 0) { cur.set(line); } else if (f === 1) { for (x = 0; x < stride; x++) cur[x] = (line[x] + (x >= bpp ? cur[x - bpp] : 0)) & 255; } else if (f === 2) { for (x = 0; x < stride; x++) cur[x] = (line[x] + prev[x]) & 255; } else if (f === 3) { for (x = 0; x < stride; x++) { var a = x >= bpp ? cur[x - bpp] : 0; cur[x] = (line[x] + ((a + prev[x]) >> 1)) & 255; } } else if (f === 4) { for (x = 0; x < stride; x++) { var aa = x >= bpp ? cur[x - bpp] : 0; var bb = prev[x]; var cc = x >= bpp ? prev[x - bpp] : 0; var sa = bb - cc, sb = aa - cc; var pa = Math.abs(sa), pb = Math.abs(sb), pc = Math.abs(sa + sb); var pr = (pa <= pb && pa <= pc) ? aa : (pb <= pc) ? bb : cc; cur[x] = (line[x] + pr) & 255; } } else { throw new Error('png: bad filter type'); } var ob = y * w * 4; if (ct === 6) { for (x = 0; x < w; x++) { var s4 = x * 4; out[ob + x * 4] = cur[s4]; out[ob + x * 4 + 1] = cur[s4 + 1]; out[ob + x * 4 + 2] = cur[s4 + 2]; out[ob + x * 4 + 3] = cur[s4 + 3]; } } else if (ct === 2) { for (x = 0; x < w; x++) { var s3 = x * 3; out[ob + x * 4] = cur[s3]; out[ob + x * 4 + 1] = cur[s3 + 1]; out[ob + x * 4 + 2] = cur[s3 + 2]; out[ob + x * 4 + 3] = 255; } } else if (ct === 0) { for (x = 0; x < w; x++) { out[ob + x * 4] = cur[x]; out[ob + x * 4 + 1] = cur[x]; out[ob + x * 4 + 2] = cur[x]; out[ob + x * 4 + 3] = 255; } } else if (ct === 4) { for (x = 0; x < w; x++) { out[ob + x * 4] = cur[x * 2]; out[ob + x * 4 + 1] = cur[x * 2]; out[ob + x * 4 + 2] = cur[x * 2]; out[ob + x * 4 + 3] = cur[x * 2 + 1]; } } else { var mask = (1 << bd) - 1; for (x = 0; x < w; x++) { var idx; if (bd === 8) idx = cur[x]; else idx = (cur[(x * bd) >> 3] >> (8 - bd - (x * bd & 7))) & mask; var pi = idx * 3; var r = pi + 2 < plte.length ? plte[pi] : 0; var g = pi + 2 < plte.length ? plte[pi + 1] : 0; var b = pi + 2 < plte.length ? plte[pi + 2] : 0; var al = trns && idx < trns.length ? trns[idx] : 255; out[ob + x * 4] = r; out[ob + x * 4 + 1] = g; out[ob + x * 4 + 2] = b; out[ob + x * 4 + 3] = al; } } prev.set(cur); } return { w: w, h: h, data: out }; } try { var puzzle = decodeImg(puzzleB64); var picture = decodeImg(pictureB64); function decodeImg(b64) { var s = String(b64); var head = s.length > 100 ? s.slice(0, 100) : s; if (head.indexOf(',') >= 0) s = s.split(',', 2)[1]; return pngDecode(b64decode(s)); } var pz = puzzle, bg = picture; var Hb = bg.h, Wb = bg.w; var maskFull = new Uint8Array(pz.w * pz.h); var any = false; var xx, yy2, idx; for (yy2 = 0; yy2 < pz.h; yy2++) { for (xx = 0; xx < pz.w; xx++) { if (pz.data[(yy2 * pz.w + xx) * 4 + 3] > 128) { maskFull[yy2 * pz.w + xx] = 1; any = true; } } } if (!any) { log('拼图块无实体像素'); return null; } var y0 = pz.h, y1 = -1, x0 = pz.w, x1 = -1; for (yy2 = 0; yy2 < pz.h; yy2++) { for (xx = 0; xx < pz.w; xx++) { if (maskFull[yy2 * pz.w + xx]) { if (yy2 < y0) y0 = yy2; if (yy2 > y1) y1 = yy2; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; } } } y1 = y1 + 1; x1 = x1 + 1; var ph = y1 - y0, pw = x1 - x0; if (ph > Hb || pw > Wb || y0 + ph > Hb) { log('拼图块尺寸异常'); return null; } var mIdx = new Int32Array(ph * pw); var n = 0; for (yy2 = 0; yy2 < ph; yy2++) { var rowb = (y0 + yy2) * pz.w; for (xx = 0; xx < pw; xx++) { if (maskFull[(rowb + x0 + xx)]) mIdx[n++] = yy2 * pw + xx; } } if (n < 100) { log('拼图块实体过小'); return null; } var pieceR = new Float64Array(n), pieceG = new Float64Array(n), pieceB = new Float64Array(n); var sumR = 0, sumG = 0, sumB = 0; for (idx = 0; idx < n; idx++) { var mi = mIdx[idx]; var py = y0 + ((mi / pw) | 0), px = x0 + (mi % pw); var o = (py * pz.w + px) * 4; var r = pz.data[o], g = pz.data[o + 1], b = pz.data[o + 2]; pieceR[idx] = r; pieceG[idx] = g; pieceB[idx] = b; sumR += r; sumG += g; sumB += b; } var tMeanR = sumR / n, tMeanG = sumG / n, tMeanB = sumB / n; var tR = new Float64Array(n), tG = new Float64Array(n), tB = new Float64Array(n); var tNormSq = 0; for (idx = 0; idx < n; idx++) { tR[idx] = pieceR[idx] - tMeanR; tG[idx] = pieceG[idx] - tMeanG; tB[idx] = pieceB[idx] - tMeanB; tNormSq += tR[idx] * tR[idx] + tG[idx] * tG[idx] + tB[idx] * tB[idx]; } var tNorm = Math.sqrt(tNormSq); if (tNorm < 1e-6) { log('拼图块内容全平'); return null; } var scores = new Float64Array(Wb - pw + 1); var valid = new Uint8Array(Wb - pw + 1); var bufR = new Float64Array(n), bufG = new Float64Array(n), bufB = new Float64Array(n); var bestScore = -Infinity, bestX = -1, anyScore = false; var maxX = Wb - pw; for (var x = 0; x <= maxX; x++) { var psR = 0, psG = 0, psB = 0; for (idx = 0; idx < n; idx++) { var mi2 = mIdx[idx]; var by = y0 + ((mi2 / pw) | 0); var bx = x + (mi2 % pw); var bo = (by * Wb + bx) * 4; var vR = bg.data[bo], vG = bg.data[bo + 1], vB = bg.data[bo + 2]; bufR[idx] = vR; bufG[idx] = vG; bufB[idx] = vB; psR += vR; psG += vG; psB += vB; } var pMeanR = psR / n, pMeanG = psG / n, pMeanB = psB / n; var pNormSq = 0, dot = 0; for (idx = 0; idx < n; idx++) { var cR = bufR[idx] - pMeanR, cG = bufG[idx] - pMeanG, cB = bufB[idx] - pMeanB; pNormSq += cR * cR + cG * cG + cB * cB; dot += tR[idx] * cR + tG[idx] * cG + tB[idx] * cB; } var pNorm = Math.sqrt(pNormSq); if (pNorm < 1e-6) continue; var s = dot / (tNorm * pNorm); scores[x] = s; valid[x] = 1; if (!anyScore || s > bestScore || (s === bestScore && x > bestX)) { bestScore = s; bestX = x; anyScore = true; } } if (!anyScore) { log('背景全平'); return null; } var second = null, secondX = -1; for (x = 0; x <= maxX; x++) { if (!valid[x] || Math.abs(x - bestX) <= 10) continue; var sv = scores[x]; if (second === null || sv > second || (sv === second && x > secondX)) { second = sv; secondX = x; } } if (second === null) second = 0.0; var margin = bestScore - second; var offset = bestX - x0; log('凹槽x=' + bestX + ' score=' + bestScore.toFixed(3) + ' 次峰margin=' + margin.toFixed(3) + ' 实体左=' + x0 + ' → offset=' + offset); if (bestScore < 0.35 || margin < 0.08) log('置信度偏低，结果可能不准'); if (offset < 0 || offset > Wb) { log('offset 异常 ' + offset); return null; } return offset | 0; } catch (e) { log('异常 ' + e); return null; } }

function estimateSlideOffset(slide) {
  if (!slide || !slide.puzzle || !slide.picture) return null;
  return SlideOffset(slide.puzzle, slide.picture);
}

function formatExchangeProducts(items, columns = 2) {
  if (!Array.isArray(items) || !items.length) return '';
  const inStock = items.filter(item => (Number(item.dailyRemainderCount) || 0) > 0);
  const soldOut = items.length - inStock.length;
  const cell = item => `${item.prizeId} ${item.prizeName || '未命名'} (余${item.dailyRemainderCount || 0})`;
  const lines = [];
  for (let index = 0; index < inStock.length; index += columns) {
    lines.push(inStock.slice(index, index + columns).map(cell).join('  |  '));
  }
  if (soldOut) lines.push(`(另有 ${soldOut} 个已抢光)`);
  return lines.join('\n');
}

async function runAccount(user) {
  const account = user.phone || extractPhoneFromAuthorization(user.Authorization);
  const Authorization = normalizeAuthorization((cache[account] && cache[account].token) || user.Authorization);
  if (!account || !Authorization) {
    messages.push(`❌ 账号无效: ${maskPhone(account) || '未知'}`);
    return;
  }
  const instance = new Exchange({ ...user, phone: account, Authorization, deviceId: await fetchDeviceId() || user.deviceId });
  if (!await instance.guard(() => instance.jwt())) {
    failedAccounts.push(instance.encryptAccount);
    messages.push(`❌ 登录: ${instance.encryptAccount} 未通过`);
    return;
  }
  await instance.guard(() => instance.run());
  messages.push(`🔹 账号 ${instance.encryptAccount}\n${instance.messages.join('\n')}`);
}

async function main() {
  if (shouldDelayToExchangeSlot()) {
    const delay = delayUntilExchangeSlot();
    log(`⏳ 抢兑预热等待 ${Math.round(delay / 1000)} 秒后准点首发`);
    await sleep(delay);
  }
  const accounts = parseYdypAccounts(process.env.YDYP_AUTH || process.env.ydyp_data || '');
  log(`移动云盘商品抢兑 v${SCRIPT_VERSION}`);
  if (!accounts.length) throw new Error('未找到 YDYP_AUTH 变量 ❌');
  log(`🌀 找到 ${accounts.length} 个账号，商品ID: ${prizeIds.join(',') || '(仅查询)'}`);
  for (let index = 0; index < accounts.length; index++) {
    log(`\n-------- 账号 ${index + 1}/${accounts.length} --------`);
    await runAccount(accounts[index]);
    if (index < accounts.length - 1) await sleep(randomInteger(1000, 3000));
  }
  await notify('移动云盘商品抢兑', [
    failedAccounts.length ? `❌ 失效账号: ${failedAccounts.join('、')}` : '',
    ...messages,
  ].filter(Boolean).join('\n'));
}

function delayUntilExchangeSlot(now = new Date()) {
  const slots = [0, 10, 16].map(hour => {
    const date = new Date(now);
    date.setHours(hour, 0, 0, 0);
    return date.getTime();
  });
  const next = slots.find(timestamp => timestamp >= now.getTime() && timestamp - now.getTime() <= 5 * 60 * 1000);
  if (next === undefined) return -1;
  return Math.max(0, next - now.getTime());
}

function shouldDelayToExchangeSlot(now = new Date()) {
  const delay = delayUntilExchangeSlot(now);
  return delay > 0 && delay <= 60 * 1000;
}

function loadNotifier() {
  for (const candidate of ['./sendNotify', './utils/sendNotify']) {
    try {
      const mod = require(candidate);
      if (mod && typeof mod.sendNotify === 'function') return mod;
    } catch (error) { /* 该位置没有 sendNotify，继续找下一个 */ }
  }
  return null;
}

async function notify(title, message) {
  if (!message) return;
  log(`\n----- ${title} -----\n${message}`);
  const notifier = loadNotifier();
  if (!notifier) {
    log('(未安装 sendNotify，本次仅输出日志；在青龙「通知设置」里配好推送即可收到)');
    return;
  }
  try {
    await notifier.sendNotify(title, message);
  } catch (error) {
    log(`(推送失败: ${String(error && error.message || error).split('\n')[0]}；完整结果见上方日志)`);
  }
}

export {
  parseYdypAccounts,
  normalizeAuthorization,
  extractPhoneFromAuthorization,
  formatExchangeProducts,
  delayUntilExchangeSlot,
  shouldDelayToExchangeSlot,
};

if (process.env.NODE_ENV !== 'test' && typeof $done === 'undefined') {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
if (typeof $done !== 'undefined') {
  main().catch(error => {
    console.error(error.stack || error.message);
  }).finally(() => $done({}));
}
