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
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SCRIPT_VERSION = '1.0.0';
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
  return value ? `Basic%20${encodeURIComponent(value)}` : '';
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

function appendParams(url, params = {}) {
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

  log(content) {
    log(String(content));
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
    this.log(`• 云朵: ${data.result.total || 0}朵 / 待领取${data.result.toReceive || 0}朵`);
  }

  async getExchangeList() {
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/signin/page/exchangeList`, { params: { client: 'app', clientVersion: CLIENT_VERSION } });
    if (!data || data.code !== 0) return [];
    const result = data.result || {};
    return Object.keys(result).flatMap(key => Array.isArray(result[key]) ? result[key] : []);
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
    const slide = await this.getSlide();
    if (!slide) {
      this.log(`• 兑换: ${prizeName || prizeId} 失败 (滑块获取失败)`);
      return false;
    }
    const offset = estimateSlideOffset(slide);
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/signin/page/exchangeV3`, {
      method: 'POST',
      data: { prizeId: Number(prizeId), client: 'app', clientVersion: CLIENT_VERSION, puzzleOffset: offset, smsCode: '', deviceId: this.deviceId },
      headers: { isdeviceId: 'true' },
    });
    if (data && data.code === 0) {
      this.log(`• 兑换: 成功 ${data.result.prizeName || prizeName}`);
      return true;
    }
    this.log(`• 兑换: ${prizeName || prizeId} 失败 (${(data && data.msg) || '接口无响应'})`);
    return false;
  }

  async queryReceivedPrizes() {
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/prizeApi/checkPrize/getUserPrizeLogPageV2`, { params: { currPage: 1, pageSize: 100 } });
    if (!data || data.code !== 0) return;
    const pending = (data.result && data.result.result || []).filter(item => item.flag === 1);
    if (pending.length) this.log(`• 待领取奖品: ${pending.map(item => item.prizeName).join('、')}`);
  }

  async run() {
    await this.getCloudInfo();
    const items = await this.getExchangeList();
    if (!prizeIds.length) {
      this.log(`• 商品(${items.length}): ${formatExchangeProducts(items) || '暂无可查询商品'}`);
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

function estimateSlideOffset() {
  return randomInteger(120, 360);
}

function formatExchangeProducts(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items
    .map(item => `${item.prizeId}: ${item.prizeName || '未命名'}（余量${item.dailyRemainderCount || 0}）`)
    .join(' / ');
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
  await notify([failedAccounts.length ? `❌ 失效账号: ${failedAccounts.join('、')}` : '', ...messages].filter(Boolean).join('\n'));
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

async function notify(message) {
  if (!message) return;
  try {
    const moduleName = fs.existsSync(path.join(process.cwd(), 'sendNotify.js')) ? './sendNotify' : './utils/sendNotify';
    await require(moduleName).sendNotify('移动云盘商品抢兑', message);
  } catch (error) {
    log(`\n----- 移动云盘商品抢兑 -----\n${message}`);
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
