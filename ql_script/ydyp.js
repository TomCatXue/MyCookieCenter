#!/usr/bin/env node
/**
 * 移动云盘签到
 * cron: 0 8 * * *
 * tag: 中国移动
 * @tag 中国移动
 * new Env('移动云盘_签到')
 *
 * YDYP_AUTH：多账号，支持换行 / & 分隔
 *   - Basic 13800138000@Basic%20bW9iaWxlOjEzODAwMTM4MDAwOnRva2Vu
 *   - 手机号@Basic bW9iaWxlOjEzODAwMTM4MDAxOnRva2Vu
 *   - {"phone":"...","Authorization":"Basic ...","deviceId":"..."}
 * YDYP_DEVICE_ID：可选全局设备 ID；YDYP_DEBUG=true 输出响应
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SCRIPT_VERSION = '1.0.0';
const CACHE_FILE = path.join(process.cwd(), 'ydyp_cache.json');
const TOKEN_VALID_TIME = 72 * 3600 * 1000;
const TOKEN_REFRESH_ADVANCE = 12 * 3600 * 1000;
const MARKET_BASE_URL = 'https://m.mcloud.139.com';
const MARKET_SOURCE_ID = '1097';
const CLIENT_VERSION = '13.0.0';
const AUTH_SIGN_SECRET = 'sekaMdYYLIZfbCfm';
const REFRESH_TOKEN_AES_KEY = 'c7lXOigXahPnTViq';
const TOKENPK_INVITE_CODE = 'eb11f7338ef147c48b39d92ec14e75bd2008';
const TOKENPK_MARKET_NAME = '{{PHONE_9ye4j8vw}}';
const TOKENPK_SOURCE_ID = '1102';
const TOKENPK_PRIZE_PAGE_URL = 'https://m.mcloud.139.com/portal/cloudItem/index.html?path=getPrize&sourceid=1102';

const isDebug = /^(true|1|yes|on)$/i.test(process.env.YDYP_DEBUG || process.env.ydyp_debug || '');
const globalDeviceId = String(process.env.YDYP_DEVICE_ID || process.env.ydyp_device_id || '').trim();
const cache = loadStorage();
const messages = [];
const taskLogs = [];
const failedAccounts = [];

function log(value) {
  console.log(String(value));
}

function debug(value, title = 'debug') {
  if (isDebug) log(`\n----- ${title} -----\n${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
}

function loadStorage() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) || {};
  } catch (error) {
    return {};
  }
}

function saveStorage() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function ensureStorageEntry(account, token = '') {
  if (!cache[account]) cache[account] = {};
  if (token && !cache[account].token) cache[account].token = token;
  return cache[account];
}

function getStorageInfo(account) {
  return cache[account] || {};
}

function patchStorage(account, fields) {
  Object.assign(ensureStorageEntry(account), fields);
  saveStorage();
}

function normalizeAuthorization(token) {
  const value = String(token || '').trim().replace(/^@/, '').replace(/^Basic(%20|\s+)/i, '');
  return value ? `Basic%20${encodeURIComponent(value)}` : '';
}

function extractRawToken(token) {
  const value = String(token || '').trim();
  return value.startsWith('Basic%20') ? decodeURIComponent(value.slice(8)) : value;
}

function buildAuthorization(account, rawToken) {
  return `Basic%20${encodeURIComponent(`${account}:${rawToken}`)}`;
}

function normalizePhone(value) {
  const phone = String(value || '').replace(/[^\dXx]/g, '');
  return /^\d{11}$/.test(phone) ? phone : '';
}

function parseYdypAccounts(raw) {
  const entries = String(raw || '')
    .split(/\r?\n|&/)
    .map(entry => entry.trim())
    .filter(Boolean);
  const accounts = [];

  for (const entry of entries) {
    if (entry.startsWith('[') || entry.startsWith('{')) {
      const parsed = JSON.parse(entry);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        const Authorization = normalizeAuthorization(item.Authorization || item.token || '');
        const phone = normalizePhone(item.phone || item.account || extractPhoneFromAuthorization(Authorization));
        if (Authorization && phone) accounts.push({ Authorization, phone, deviceId: String(item.deviceId || '').trim() });
      }
      continue;
    }

    const separatorIndex = entry.lastIndexOf('@');
    const rawToken = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : entry.trim();
    const bareToken = rawToken.replace(/^Basic(%20|\s+)/i, '');
    const Authorization = normalizeAuthorization(rawToken);
    const phone = separatorIndex >= 0 ? normalizePhone(entry.slice(0, separatorIndex)) : extractPhoneFromAuthorization(bareToken);
    if (Authorization && phone) accounts.push({ Authorization, phone, deviceId: '' });
  }
  return accounts;
}

function extractPhoneFromAuthorization(authorization) {
  const value = String(authorization || '').trim().replace(/^Basic(%20|\s+)/i, '');
  let raw = value;
  try {
    raw = Buffer.from(value, 'base64').toString('utf8');
  } catch (error) {
    raw = value;
  }
  const parts = raw.split(':');
  return parts.length >= 3 ? normalizePhone(parts[1]) : '';
}

function maskPhone(phone) {
  const value = String(phone || '');
  return value.length >= 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
}

function uuid4() {
  return crypto.randomUUID();
}

function generateDeviceId() {
  return uuid4().replace(/-/g, '').toUpperCase();
}

function buildXDeviceInfo(deviceId, netType = 'wifi', terminalType = '8', version = CLIENT_VERSION) {
  return `{"terminalType":"${terminalType}","osVersion":"","country":"","language":"","timezone":"","deviceId":"${deviceId}","deviceName":"","appVersion":"${version}","appName":"","netType":"${netType}"}`;
}

function aesEncrypt(data, key) {
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]).toString('base64');
}

function parseExpireTimeToMillis(expireTime) {
  const parsed = Date.parse(String(expireTime || ''));
  return Number.isFinite(parsed) ? parsed : Date.now() + TOKEN_VALID_TIME;
}

function appendParams(url, params = {}) {
  const query = Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
  if (!query) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function stripTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '');
}

function bjMonth() {
  const date = new Date(Date.now() + 8 * 3600 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
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
    .filter(key => cookies[key] !== undefined && cookies[key] !== null && cookies[key] !== '')
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
        body: data === null || data === undefined ? undefined : JSON.stringify(data),
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timer);
      const text = await response.text();
      if (response.status < 400) {
        debug(text, targetUrl);
        return { status: response.status, headers: Object.fromEntries(response.headers.entries()), text };
      }
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class YP {
  constructor(user) {
    this.Authorization = user.Authorization;
    this.account = user.phone;
    this.authToken = extractRawToken(this.Authorization);
    this.encryptAccount = maskPhone(this.account);
    this.userLogLines = [];
    this.marketCookies = { sensors_stay_time: String(Date.now()) };
    this.marketHeaders = {};
    this.marketDeviceId = '';
    this.marketXDeviceInfo = '';
    this.jwtHeaders = { Accept: '*/*' };
    this.cookies = {};
    this.userDomainId = '';
    this.loadOrCreateMarketDeviceProfile(user.deviceId);
  }

  log(content) {
    const value = String(content);
    log(value);
    this.userLogLines.push(value);
  }

  async guard(fn) {
    try {
      return await fn();
    } catch (error) {
      this.log(`错误: ${error.message}`);
      return null;
    }
  }

  async wait(min = 1, max = 1.5) {
    await sleep((min + Math.random() * (max - min)) * 1000);
  }

  loadOrCreateMarketDeviceProfile(userDeviceId) {
    ensureStorageEntry(this.account, this.Authorization);
    this.marketDeviceId = globalDeviceId || userDeviceId || getStorageInfo(this.account).deviceId || generateDeviceId();
    this.marketXDeviceInfo = buildXDeviceInfo(this.marketDeviceId);
    patchStorage(this.account, { deviceId: this.marketDeviceId, xDeviceInfo: this.marketXDeviceInfo });
  }

  shouldRefreshAuthorization(force = false) {
    if (force) return [true, '强制刷新'];
    const stored = getStorageInfo(this.account);
    const expiresAt = Number(stored.expiresAt || 0);
    if (!stored.token) return [true, '本地无缓存Token'];
    if (Date.now() >= expiresAt) return [true, '缓存Token已过期'];
    if (expiresAt - Date.now() <= TOKEN_REFRESH_ADVANCE) return [true, `将在 ${((expiresAt - Date.now()) / 3600000).toFixed(1)} 小时后过期`];
    return [false, `Token 状态良好（剩余 ${((expiresAt - Date.now()) / 86400000).toFixed(1)} 天）`];
  }

  async refreshAuthorizationToken(force = false) {
    const [needRefresh, reason] = this.shouldRefreshAuthorization(force);
    if (!needRefresh) {
      this.log(`-Authorization状态: ${reason}`);
      return true;
    }
    const data = await requestJson({
      url: 'https://user-njs.yun.139.com/user/auth/refreshToken',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.Authorization,
        'x-yun-tid': uuid4(),
        'x-yun-api-version': 'v1',
        'x-yun-module-type': '100',
        'x-yun-op-type': '1',
        'x-yun-app-channel': '10214200',
        'x-yun-client-info': '||8||||||||||||',
        'hcy-cool-flag': '1',
      },
      data: { data: aesEncrypt({ phoneNumber: this.account }, REFRESH_TOKEN_AES_KEY) },
      method: 'POST',
      retries: 1,
    });
    if (!data || (!data.success && !['0', '00', '000', '0000'].includes(String(data.code)))) {
      this.log(`-Authorization刷新失败: ${(data && (data.message || data.msg)) || '接口无响应'} (${reason})`);
      return false;
    }
    const rawToken = data.data && data.data.token;
    if (!rawToken) {
      this.log('-Authorization刷新失败: 响应缺少token');
      return false;
    }
    this.Authorization = buildAuthorization(this.account, rawToken);
    this.authToken = rawToken;
    patchStorage(this.account, { token: this.Authorization, authToken: rawToken, refreshed: true, expiresAt: parseExpireTimeToMillis(data.data.expireTime), lastRefreshAt: Date.now() });
    this.log('-Authorization自动刷新成功');
    return true;
  }

  buildMarketPageUrl(sourceId = MARKET_SOURCE_ID) {
    return `${MARKET_BASE_URL}/portal/mobilecloud/index.html?path=newsignin&sourceid=${sourceId}&enableShare=1`;
  }

  buildMarketHeaders(extraHeaders = {}) {
    return {
      ...this.marketHeaders,
      Accept: '*/*',
      Referer: this.buildMarketPageUrl(),
      appVersion: `${CLIENT_VERSION}.0`,
      activityId: '{{SECRET_qhpslggq}}',
      deviceId: this.marketDeviceId,
      'x-DeviceInfo': this.marketXDeviceInfo,
      ...extraHeaders,
    };
  }

  requestMarketJson(url, { params, data, method = 'GET', retries = 3, headers = {} } = {}) {
    return requestJson({ url, params, data, method, retries, headers: this.buildMarketHeaders(headers), cookies: this.marketCookies });
  }

  async prepareSigninCenterSession() {
    await sendRequest({ url: this.buildMarketPageUrl(), headers: this.buildMarketHeaders(), cookies: this.marketCookies, retries: 1 });
  }

  async querySpecToken(sourceId) {
    const data = await requestJson({
      url: 'https://orches.yun.139.com/orchestration/auth-rebuild/token/v1.0/querySpecToken',
      headers: { Authorization: this.Authorization, 'Content-Type': 'application/json', Accept: '*/*' },
      data: { account: this.account, toSourceId: sourceId },
      method: 'POST',
    });
    return data && data.success ? (data.data || {}).token || null : null;
  }

  async jwt() {
    const token = await this.querySpecToken('001005');
    if (!token) {
      this.log('-ck可能失效了');
      return false;
    }
    const data = await requestJson({
      url: `${MARKET_BASE_URL}/ycloud/auth-service/auth/tyrzLogin`,
      headers: { ...await buildAuthSignHeaders(), Accept: '*/*', Origin: MARKET_BASE_URL, Referer: this.buildMarketPageUrl(), activityid: '{{SECRET_qhpslggq}}', appversion: `${CLIENT_VERSION}.0`, showloading: 'true' },
      data: { token, openAccount: 0, marketName: '{{SECRET_qhpslggq}}', sourceId: MARKET_SOURCE_ID },
      method: 'POST',
      retries: 3,
    });
    if (!data || data.code !== 0 || !data.result || !data.result.token) {
      this.log(`JWT获取失败: ${(data && data.msg) || '接口无响应'}`);
      return false;
    }
    const jwtToken = data.result.token;
    this.jwtHeaders.jwtToken = jwtToken;
    this.cookies.jwtToken = jwtToken;
    this.marketHeaders.jwtToken = jwtToken;
    this.marketCookies.jwtToken = jwtToken;
    return true;
  }

  static getTodaySignState(result) {
    return Boolean(result && result.todaySignIn);
  }

  async signinStatus() {
    await this.wait();
    await this.prepareSigninCenterSession();
    const infoUrl = `${MARKET_BASE_URL}/market/signin/page/infoV3`;
    const info = await this.requestMarketJson(infoUrl, { params: { client: 'app' } });
    if (!info || info.code !== 0) {
      this.log(`查询签到失败: ${(info && info.msg) || '接口无响应'}`);
      return false;
    }
    if (YP.getTodaySignState(info.result)) {
      this.log('✅签到: 今日已签');
      return true;
    }
    const signin = await this.requestMarketJson(`${MARKET_BASE_URL}/market/signin/page/startSignIn`, { params: { client: 'app' } });
    const latest = await this.requestMarketJson(infoUrl, { params: { client: 'app' } });
    const success = Boolean((signin && signin.code === 0 && YP.getTodaySignState(signin.result)) || (latest && latest.code === 0 && YP.getTodaySignState(latest.result)));
    this.log(success ? '✅签到: 成功' : `签到失败: ${(signin && signin.msg) || '未知错误'}`);
    return success;
  }

  async receive() {
    const info = await this.requestMarketJson(`${MARKET_BASE_URL}/market/signin/page/infoV3`, { params: { client: 'app' } });
    if (!info || info.code !== 0) {
      this.log(`查询云朵失败: ${(info && info.msg) || '接口无响应'}`);
      return;
    }
    const result = info.result || {};
    const records = toArray(result.receiveList);
    let claimed = 0;
    for (const record of records) {
      const receive = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/signin/page/receiveV3`, {
        method: 'POST',
        data: { client: 'app', cloudId: record.recordId, cloudType: record.cloudType || 0, deviceId: this.marketDeviceId },
        headers: { showLoading: 'true' },
      });
      if (receive && receive.code === 0) claimed += (receive.result && receive.result.receive) || record.cloudNum || 0;
      await sleep(300);
    }
    const latest = await this.requestMarketJson(`${MARKET_BASE_URL}/market/signin/page/infoV3`, { params: { client: 'app' } });
    const total = (latest && latest.result && latest.result.total) || result.total || 0;
    const pending = (latest && latest.result && latest.result.toReceive) || result.toReceive || 0;
    this.log(`• 云朵: 领取${claimed || 0}朵 / 当前${total}朵 / 待领取${pending}朵`);
  }

  async run() {
    await this.guard(() => this.refreshAuthorizationToken());
    if (!await this.guard(() => this.jwt())) {
      failedAccounts.push(this.encryptAccount);
      this.log('❌ 登录: 未通过，需重新抓取Authorization');
      return;
    }
    await this.guard(() => this.signinStatus());
    await this.guard(() => this.receive());
  }
}

async function main() {
  const rawAuth = process.env.YDYP_AUTH || process.env.ydyp_data || '';
  const accounts = parseYdypAccounts(rawAuth);
  log(`移动云盘签到 v${SCRIPT_VERSION}`);
  if (!accounts.length) throw new Error('未找到 YDYP_AUTH 变量 ❌');
  log(`🌀 找到 ${accounts.length} 个账号`);
  for (let index = 0; index < accounts.length; index++) {
    log(`\n======== ▷ 第 ${index + 1} 个账号 ◁ ========`);
    const yp = new YP(accounts[index]);
    await yp.guard(() => yp.run());
    if (yp.userLogLines.length) taskLogs.push(`【账号 ${index + 1} · ${yp.encryptAccount}】\n${yp.userLogLines.join('\n')}`);
    if (index < accounts.length - 1) await sleep(1000 + Math.floor(Math.random() * 2000));
  }
  if (failedAccounts.length) messages.push(`❌ 失效账号: ${failedAccounts.join('、')}`);
  if (taskLogs.length) messages.push(taskLogs.join('\n\n'));
  await notify(messages.join('\n').trim());
}

async function notify(message) {
  if (!message) return;
  const title = '移动云盘签到';
  try {
    const moduleName = fs.existsSync(path.join(process.cwd(), 'sendNotify.js')) ? './sendNotify' : './utils/sendNotify';
    const notifyModule = require(moduleName);
    await notifyModule.sendNotify(title, message);
  } catch (error) {
    log(`\n----- ${title} -----\n${message}`);
  }
}

export { parseYdypAccounts, normalizeAuthorization, extractPhoneFromAuthorization };

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
