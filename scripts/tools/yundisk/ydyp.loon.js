/**
 * 移动云盘 · Loon 版（每日签到 + 商品抢兑）
 * cron: 5 8 * * *（签到）/ 59 9,15,23 * * *（抢兑预热）
 * tag: 中国移动
 *
 * 本文件是自包含的 Loon 运行时实现，不加载任何外部模块：
 * - 凭证：ydyp_data（由 yundisk.cookie.js 写入），缺失时回退 $argument.auth
 * - 缓存：ydyp_cache（Token / deviceId / 刷新时间）
 * - 设备 ID：ydyp_device_id，其次缓存，最后本地生成
 * - 通知：$notification.post，节流键 yundisk_task_notify_time（10 秒）
 * - 模式：$argument.mode（sign / exchange），未传时默认 sign
 *
 * 说明：抢兑流程原版依赖的设备指纹接口需要 RSA 公钥加密，
 * 纯 JS 环境无法可靠实现，这里改用本地缓存 / 生成的 deviceId，
 * 滑块偏移仍沿用原有的区间估算，抢兑结果以服务端返回为准。
 */

const SCRIPT_VERSION = '1.1.0';
const ENTRY_MODE = ''; // entry-mode
const ARGUMENT = readArgument();
const MODE = resolveMode(ARGUMENT);

const TOKEN_VALID_TIME = 72 * 3600 * 1000;
const TOKEN_REFRESH_ADVANCE = 12 * 3600 * 1000;
const MARKET_BASE_URL = 'https://m.mcloud.139.com';
const MARKET_SOURCE_ID = '1097';
const CLIENT_VERSION = '13.0.0';
const AUTH_SIGN_SECRET = 'sekaMdYYLIZfbCfm';
const REFRESH_TOKEN_AES_KEY = 'c7lXOigXahPnTViq';
const TARGET_SOURCE_ID = '001005';
const NOTIFY_KEY = 'yundisk_task_notify_time';
const NOTIFY_GAP_MS = 10 * 1000;
const HTTP_TIMEOUT_MS = 30000;

const isDebug = /^(true|1|yes|on)$/i.test(String(ARGUMENT.debug || storeRead('ydyp_debug') || ''));
const globalDeviceId = String(ARGUMENT.deviceId || storeRead('ydyp_device_id') || '').trim();
const cache = loadCache();

function log(value) {
  console.log(String(value));
}

function debug(value, title = 'debug') {
  if (isDebug) log(`\n----- ${title} -----\n${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInteger(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shorten(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/* ---------------------------------------------------------------------------
 * 参数 / 持久化
 * ------------------------------------------------------------------------- */

function readArgument() {
  const result = {};
  try {
    if (typeof $argument === 'undefined' || $argument === null) return result;
    if (typeof $argument === 'object') {
      for (const key in $argument) result[key] = $argument[key];
      return result;
    }
    String($argument).split('&').forEach(pair => {
      const index = pair.indexOf('=');
      if (index <= 0) return;
      result[pair.slice(0, index)] = pair.slice(index + 1);
    });
  } catch (error) {
    return {};
  }
  return result;
}

function resolveMode(argument) {
  const requested = String(ENTRY_MODE || (argument && argument.mode) || 'sign').toLowerCase();
  return requested === 'exchange' ? 'exchange' : 'sign';
}

function storeRead(key) {
  try {
    if (typeof $persistentStore === 'undefined' || !$persistentStore) return '';
    const value = $persistentStore.read(key);
    return value === undefined || value === null ? '' : String(value);
  } catch (error) {
    return '';
  }
}

function storeWrite(value, key) {
  try {
    if (typeof $persistentStore === 'undefined' || !$persistentStore) return false;
    $persistentStore.write(String(value), key);
    return true;
  } catch (error) {
    return false;
  }
}

function loadCache() {
  try {
    const parsed = JSON.parse(storeRead('ydyp_cache') || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveCache() {
  storeWrite(JSON.stringify(cache), 'ydyp_cache');
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
  saveCache();
}

/* ---------------------------------------------------------------------------
 * 编码 / 哈希 / 加密（纯 JS）
 * ------------------------------------------------------------------------- */

function utf8Bytes(text) {
  const value = String(text);
  const bytes = [];
  for (let index = 0; index < value.length; index++) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

function bytesToHex(bytes) {
  let hex = '';
  for (let index = 0; index < bytes.length; index++) {
    hex += (bytes[index] < 16 ? '0' : '') + bytes[index].toString(16);
  }
  return hex;
}

function bytesToString(bytes) {
  let text = '';
  for (let index = 0; index < bytes.length; index++) text += String.fromCharCode(bytes[index]);
  return text;
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(bytes) {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index];
    const b1 = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const b2 = index + 2 < bytes.length ? bytes[index + 2] : 0;
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += index + 1 < bytes.length ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += index + 2 < bytes.length ? BASE64_CHARS[b2 & 63] : '=';
  }
  return result;
}

function base64Decode(text) {
  const source = String(text || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const clean = source.replace(/=+$/g, '');
  const total = Math.floor((clean.length * 6) / 8);
  const bytes = new Uint8Array(total);
  let write = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[index]);
    const c1 = BASE64_CHARS.indexOf(index + 1 < clean.length ? clean[index + 1] : 'A');
    const c2 = BASE64_CHARS.indexOf(index + 2 < clean.length ? clean[index + 2] : 'A');
    const c3 = BASE64_CHARS.indexOf(index + 3 < clean.length ? clean[index + 3] : 'A');
    const triple = ((c0 & 63) << 18) | ((c1 & 63) << 12) | ((c2 & 63) << 6) | (c3 & 63);
    if (write < total) bytes[write++] = (triple >>> 16) & 0xff;
    if (write < total) bytes[write++] = (triple >>> 8) & 0xff;
    if (write < total) bytes[write++] = triple & 0xff;
  }
  return bytesToString(bytes);
}

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_TABLE = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

function rotateLeft(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function md5(text) {
  const input = utf8Bytes(text);
  const bitLength = input.length * 8;
  const totalLength = (((input.length + 8) >> 6) + 1) * 64;
  const padded = new Uint8Array(totalLength);
  padded.set(input);
  padded[input.length] = 0x80;

  const low = bitLength >>> 0;
  const high = Math.floor(bitLength / 4294967296) >>> 0;
  padded[totalLength - 8] = low & 0xff;
  padded[totalLength - 7] = (low >>> 8) & 0xff;
  padded[totalLength - 6] = (low >>> 16) & 0xff;
  padded[totalLength - 5] = (low >>> 24) & 0xff;
  padded[totalLength - 4] = high & 0xff;
  padded[totalLength - 3] = (high >>> 8) & 0xff;
  padded[totalLength - 2] = (high >>> 16) & 0xff;
  padded[totalLength - 1] = (high >>> 24) & 0xff;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < totalLength; offset += 64) {
    const words = new Array(16);
    for (let index = 0; index < 16; index++) {
      const start = offset + index * 4;
      words[index] = (padded[start] | (padded[start + 1] << 8) | (padded[start + 2] << 16) | (padded[start + 3] << 24)) >>> 0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index++) {
      let f;
      let g;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) & 15;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) & 15;
      }
      f = (f + a + MD5_TABLE[index] + words[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(f, MD5_SHIFTS[index])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const output = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((word, wordIndex) => {
    output[wordIndex * 4] = word & 0xff;
    output[wordIndex * 4 + 1] = (word >>> 8) & 0xff;
    output[wordIndex * 4 + 2] = (word >>> 16) & 0xff;
    output[wordIndex * 4 + 3] = (word >>> 24) & 0xff;
  });
  return bytesToHex(output);
}

const AES_SBOX = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
];

const AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function aesExpandKey(keyBytes) {
  const words = new Array(44);
  for (let index = 0; index < 4; index++) {
    words[index] = ((keyBytes[index * 4] << 24) | (keyBytes[index * 4 + 1] << 16) | (keyBytes[index * 4 + 2] << 8) | keyBytes[index * 4 + 3]) >>> 0;
  }
  for (let index = 4; index < 44; index++) {
    let temp = words[index - 1];
    if (index % 4 === 0) {
      temp = ((temp << 8) | (temp >>> 24)) >>> 0;
      temp = ((AES_SBOX[(temp >>> 24) & 0xff] << 24) | (AES_SBOX[(temp >>> 16) & 0xff] << 16) | (AES_SBOX[(temp >>> 8) & 0xff] << 8) | AES_SBOX[temp & 0xff]) >>> 0;
      temp = (temp ^ ((AES_RCON[index / 4 - 1] || 0) << 24)) >>> 0;
    }
    words[index] = (words[index - 4] ^ temp) >>> 0;
  }
  return words;
}

function aesAddRoundKey(state, words, round) {
  for (let index = 0; index < 16; index++) {
    const word = words[round * 4 + (index >> 2)];
    state[index] = state[index] ^ ((word >>> (24 - 8 * (index & 3))) & 0xff);
  }
}

function aesShiftRows(state) {
  let temp = state[1];
  state[1] = state[5];
  state[5] = state[9];
  state[9] = state[13];
  state[13] = temp;
  temp = state[2];
  state[2] = state[10];
  state[10] = temp;
  temp = state[6];
  state[6] = state[14];
  state[14] = temp;
  temp = state[15];
  state[15] = state[11];
  state[11] = state[7];
  state[7] = state[3];
  state[3] = temp;
}

function aesTimes2(value) {
  return ((value << 1) ^ ((value >> 7) & 1) * 0x1b) & 0xff;
}

function aesMixColumns(state) {
  for (let column = 0; column < 4; column++) {
    const start = column * 4;
    const a0 = state[start];
    const a1 = state[start + 1];
    const a2 = state[start + 2];
    const a3 = state[start + 3];
    state[start] = aesTimes2(a0) ^ (aesTimes2(a1) ^ a1) ^ a2 ^ a3;
    state[start + 1] = a0 ^ aesTimes2(a1) ^ (aesTimes2(a2) ^ a2) ^ a3;
    state[start + 2] = a0 ^ a1 ^ aesTimes2(a2) ^ (aesTimes2(a3) ^ a3);
    state[start + 3] = (aesTimes2(a0) ^ a0) ^ a1 ^ a2 ^ aesTimes2(a3);
  }
}

function aesEncryptBlock(block, words) {
  const state = new Uint8Array(16);
  for (let index = 0; index < 16; index++) state[index] = block[index];
  aesAddRoundKey(state, words, 0);
  for (let round = 1; round <= 10; round++) {
    for (let index = 0; index < 16; index++) state[index] = AES_SBOX[state[index]];
    aesShiftRows(state);
    if (round !== 10) aesMixColumns(state);
    aesAddRoundKey(state, words, round);
  }
  return state;
}

function aesEncrypt(data, key) {
  const keyBytes = utf8Bytes(String(key || ''));
  if (keyBytes.length !== 16) throw new Error('AES key 必须为 16 字节');
  const plain = utf8Bytes(JSON.stringify(data));
  const padLength = 16 - (plain.length % 16);
  const padded = new Uint8Array(plain.length + padLength);
  padded.set(plain);
  for (let index = plain.length; index < padded.length; index++) padded[index] = padLength;

  const words = aesExpandKey(keyBytes);
  const cipher = new Uint8Array(padded.length);
  for (let offset = 0; offset < padded.length; offset += 16) {
    const block = new Uint8Array(16);
    for (let index = 0; index < 16; index++) block[index] = padded[offset + index];
    const encrypted = aesEncryptBlock(block, words);
    for (let index = 0; index < 16; index++) cipher[offset + index] = encrypted[index];
  }
  return base64Encode(cipher);
}

function uuid4() {
  const hex = [];
  for (let index = 0; index < 32; index++) hex.push(Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = '89ab'.charAt(Math.floor(Math.random() * 4));
  const text = hex.join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

function generateDeviceId() {
  return uuid4().replace(/-/g, '').toUpperCase();
}

function randomHex(length) {
  let value = '';
  for (let index = 0; index < length; index++) value += Math.floor(Math.random() * 16).toString(16);
  return value;
}

/* ---------------------------------------------------------------------------
 * 网络
 * ------------------------------------------------------------------------- */

function sendHttp(method, options) {
  return new Promise(resolve => {
    if (typeof $httpClient === 'undefined' || !$httpClient) {
      resolve(null);
      return;
    }
    const request = {
      url: options.url,
      headers: options.headers || {},
      timeout: options.timeout || HTTP_TIMEOUT_MS,
    };
    if (options.body !== undefined && options.body !== null) request.body = options.body;

    const callback = (error, response, body) => {
      if (error) {
        log(`请求异常: ${options.url} (${String((error && error.message) || error)})`);
        resolve(null);
        return;
      }
      const status = Number((response && (response.status || response.statusCode)) || 0);
      resolve({ status, text: body === undefined || body === null ? '' : String(body) });
    };

    try {
      if (method === 'POST') $httpClient.post(request, callback);
      else $httpClient.get(request, callback);
    } catch (error) {
      log(`请求异常: ${options.url} (${String((error && error.message) || error)})`);
      resolve(null);
    }
  });
}

function appendParams(url, params) {
  if (!params) return url;
  const pairs = [];
  for (const key in params) {
    if (params[key] === undefined || params[key] === null) continue;
    pairs.push(`${key}=${encodeURIComponent(params[key])}`);
  }
  if (!pairs.length) return url;
  return `${url}${url.indexOf('?') >= 0 ? '&' : '?'}${pairs.join('&')}`;
}

async function sendRequest({ url, headers = {}, cookies = {}, data = null, params = null, method = 'GET', retries = 3 }) {
  const requestHeaders = {};
  for (const key in headers) requestHeaders[key] = headers[key];

  const cookiePairs = [];
  for (const key in cookies) {
    if (cookies[key] === undefined || cookies[key] === null || cookies[key] === '') continue;
    cookiePairs.push(`${key}=${cookies[key]}`);
  }
  if (cookiePairs.length) requestHeaders.Cookie = cookiePairs.join('; ');

  const targetUrl = appendParams(url, params);
  const body = data === null || data === undefined ? undefined : (typeof data === 'string' ? data : JSON.stringify(data));

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await sendHttp(String(method || 'GET').toUpperCase(), {
      url: targetUrl,
      headers: requestHeaders,
      body,
    });
    if (response && response.status >= 200 && response.status < 400) {
      debug(response.text, targetUrl);
      return { status: response.status, text: response.text };
    }
    if (response && response.status) log(`请求异常: ${targetUrl} (status=${response.status})`);
    if (attempt < retries - 1) await sleep(1000);
  }
  return null;
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

async function buildAuthSignHeaders() {
  const requestId = uuid4();
  const timestamp = Date.now().toString();
  const nonce = randomHex(32);
  const signature = md5(`${AUTH_SIGN_SECRET}${requestId}${timestamp}${nonce}${AUTH_SIGN_SECRET}`);
  return {
    'Content-Type': 'application/json',
    'x-request-id': requestId,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-signature': signature,
  };
}

/* ---------------------------------------------------------------------------
 * 凭证
 * ------------------------------------------------------------------------- */

function normalizeAuthorization(token) {
  const value = String(token || '').trim().replace(/^@/, '').replace(/^Basic(%20|\s+)/i, '');
  return value ? `Basic%20${encodeURIComponent(value)}` : '';
}

function extractRawToken(token) {
  const value = String(token || '').trim();
  return value.indexOf('Basic%20') === 0 ? decodeURIComponent(value.slice(8)) : value;
}

function buildAuthorization(account, rawToken) {
  return `Basic%20${encodeURIComponent(`${account}:${rawToken}`)}`;
}

function normalizePhone(value) {
  const phone = String(value || '').replace(/[^\dXx]/g, '');
  return /^\d{11}$/.test(phone) ? phone : '';
}

function extractPhoneFromAuthorization(authorization) {
  const value = String(authorization || '').trim().replace(/^Basic(%20|\s+)/i, '');
  let raw = value;
  try {
    raw = base64Decode(value);
  } catch (error) {
    raw = value;
  }
  const parts = raw.split(':');
  return parts.length >= 3 ? normalizePhone(parts[1]) : '';
}

function parseYdypAccounts(raw) {
  const entries = String(raw || '')
    .split(/\r?\n|&/)
    .map(entry => entry.trim())
    .filter(Boolean);
  const accounts = [];

  for (const entry of entries) {
    if (entry.charAt(0) === '[' || entry.charAt(0) === '{') {
      try {
        const parsed = JSON.parse(entry);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          if (!item || typeof item !== 'object') continue;
          const Authorization = normalizeAuthorization(item.Authorization || item.token || '');
          const phone = normalizePhone(item.phone || item.account || extractPhoneFromAuthorization(Authorization));
          if (Authorization && phone) {
            accounts.push({ Authorization, phone, deviceId: String(item.deviceId || '').trim() });
          }
        }
        continue;
      } catch (error) {
        // 不是 JSON，继续按分隔符格式解析
      }
    }

    const separatorIndex = entry.lastIndexOf('@');
    const rawToken = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : entry.trim();
    const Authorization = normalizeAuthorization(rawToken);
    const bareToken = rawToken.replace(/^Basic(%20|\s+)/i, '');
    const phone = separatorIndex >= 0 ? normalizePhone(entry.slice(0, separatorIndex)) : extractPhoneFromAuthorization(bareToken);
    if (Authorization && phone) accounts.push({ Authorization, phone, deviceId: '' });
  }
  return accounts;
}

function parseStoredRecords(raw) {
  const records = [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const Authorization = normalizeAuthorization(item.Authorization || item.token || '');
      const phone = normalizePhone(item.phone || item.account || extractPhoneFromAuthorization(Authorization));
      if (Authorization && phone) {
        records.push({ Authorization, phone, deviceId: String(item.deviceId || '').trim() });
      }
    }
  } catch (error) {
    return [];
  }
  return records;
}

function loadAccounts() {
  const stored = storeRead('ydyp_data');
  const records = stored ? parseStoredRecords(stored) : [];
  if (records.length) return records;
  return parseYdypAccounts(ARGUMENT.auth || '');
}

function maskPhone(phone) {
  const value = String(phone || '');
  return value.length >= 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
}

/* ---------------------------------------------------------------------------
 * 签到
 * ------------------------------------------------------------------------- */

class SignTask {
  constructor(user) {
    this.Authorization = user.Authorization;
    this.account = user.phone;
    this.authToken = extractRawToken(this.Authorization);
    this.encryptAccount = maskPhone(this.account);
    this.marketCookies = { sensors_stay_time: String(Date.now()) };
    this.marketHeaders = {};
    this.marketDeviceId = '';
    this.marketXDeviceInfo = '';
    this.jwtHeaders = { Accept: '*/*' };
    this.cookies = {};
    this.result = 'failed';
    this.failed = false;
    this.cloudText = '';
    this.loadOrCreateMarketDeviceProfile(user.deviceId);
  }

  log(content) {
    log(content);
  }

  async guard(fn) {
    try {
      return await fn();
    } catch (error) {
      this.log(`错误: ${error.message || error}`);
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
    const state = this.shouldRefreshAuthorization(force);
    if (!state[0]) {
      this.log(`-Authorization状态: ${state[1]}`);
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
      this.log(`-Authorization刷新失败: ${(data && (data.message || data.msg)) || '接口无响应'} (${state[1]})`);
      return false;
    }
    const rawToken = data.data && data.data.token;
    if (!rawToken) {
      this.log('-Authorization刷新失败: 响应缺少token');
      return false;
    }
    this.Authorization = buildAuthorization(this.account, rawToken);
    this.authToken = rawToken;
    patchStorage(this.account, {
      token: this.Authorization,
      authToken: rawToken,
      refreshed: true,
      expiresAt: parseExpireTimeToMillis(data.data.expireTime),
      lastRefreshAt: Date.now(),
    });
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

  async signinStatus() {
    await this.wait();
    await this.prepareSigninCenterSession();
    const infoUrl = `${MARKET_BASE_URL}/market/signin/page/infoV3`;
    const info = await this.requestMarketJson(infoUrl, { params: { client: 'app' } });
    if (!info || info.code !== 0) {
      this.log(`查询签到失败: ${(info && info.msg) || '接口无响应'}`);
      this.failed = true;
      return false;
    }
    if (info.result && info.result.todaySignIn) {
      this.log('✅签到: 今日已签');
      this.result = 'already';
      return true;
    }
    const signin = await this.requestMarketJson(`${MARKET_BASE_URL}/market/signin/page/startSignIn`, { params: { client: 'app' } });
    const latest = await this.requestMarketJson(infoUrl, { params: { client: 'app' } });
    const success = Boolean(
      (signin && signin.code === 0 && signin.result && signin.result.todaySignIn) ||
      (latest && latest.code === 0 && latest.result && latest.result.todaySignIn)
    );
    if (success) {
      this.result = 'success';
      this.log('✅签到: 成功');
    } else {
      this.failed = true;
      this.log(`签到失败: ${(signin && signin.msg) || '未知错误'}`);
    }
    return success;
  }

  async receive() {
    const info = await this.requestMarketJson(`${MARKET_BASE_URL}/market/signin/page/infoV3`, { params: { client: 'app' } });
    if (!info || info.code !== 0) {
      this.log(`查询云朵失败: ${(info && info.msg) || '接口无响应'}`);
      return;
    }
    const result = info.result || {};
    const records = Array.isArray(result.receiveList) ? result.receiveList : [];
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
    this.cloudText = `云朵+${claimed || 0} 当前${total}`;
    this.log(`• 云朵: 领取${claimed || 0}朵 / 当前${total}朵 / 待领取${pending}朵`);
  }

  async run() {
    await this.guard(() => this.refreshAuthorizationToken());
    const logged = await this.guard(() => this.jwt());
    if (!logged) {
      this.failed = true;
      this.result = 'failed';
      this.log('❌ 登录: 未通过，需重新抓取Authorization');
      return;
    }
    await this.guard(() => this.signinStatus());
    await this.guard(() => this.receive());
  }

  notificationLine() {
    const status = this.result === 'success' ? '签到成功' : this.result === 'already' ? '今日已签到' : '签到失败';
    return `• ${this.encryptAccount}: ${status}${this.cloudText ? ` · ${this.cloudText}` : ''}`;
  }
}

function buildXDeviceInfo(deviceId, netType = 'wifi', terminalType = '8', version = CLIENT_VERSION) {
  return `{"terminalType":"${terminalType}","osVersion":"","country":"","language":"","timezone":"","deviceId":"${deviceId}","deviceName":"","appVersion":"${version}","appName":"","netType":"${netType}"}`;
}

function parseExpireTimeToMillis(expireTime) {
  const parsed = Date.parse(String(expireTime || ''));
  return Number.isFinite(parsed) ? parsed : Date.now() + TOKEN_VALID_TIME;
}

async function runSign(accounts) {
  const lines = [];
  let successCount = 0;
  let alreadyCount = 0;
  let failedCount = 0;

  for (let index = 0; index < accounts.length; index++) {
    const task = new SignTask(accounts[index]);
    await task.run();
    if (task.result === 'success') successCount++;
    else if (task.result === 'already') alreadyCount++;
    else failedCount++;
    lines.push(task.notificationLine());
    if (index < accounts.length - 1) await sleep(1000 + randomInteger(0, 2000));
  }

  let subtitle;
  if (successCount > 0) subtitle = '✅ 签到成功';
  else if (alreadyCount > 0 && failedCount === 0) subtitle = '⚠️ 今日已签到';
  else subtitle = '⚠️ 脚本运行异常';
  notify(subtitle, lines.join('\n'));
}

/* ---------------------------------------------------------------------------
 * 商品抢兑
 * ------------------------------------------------------------------------- */

class ExchangeTask {
  constructor(user) {
    this.Authorization = user.Authorization;
    this.account = user.phone;
    this.encryptAccount = maskPhone(this.account);
    this.deviceId = globalDeviceId || user.deviceId || getStorageInfo(this.account).deviceId || generateDeviceId();
    this.marketCookies = {};
    this.marketHeaders = {};
    this.items = [];
    this.prizeIds = [];
    this.productCount = 0;
    this.exchangeSuccess = 0;
    this.exchangeSkipped = [];
  }

  log(content) {
    log(content);
  }

  async guard(fn) {
    try {
      return await fn();
    } catch (error) {
      this.log(`错误: ${error.message || error}`);
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
    const result = data.result || {};
    this.log(`• 云朵: ${result.total || 0}朵 / 待领取${result.toReceive || 0}朵`);
  }

  async getExchangeList() {
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/signin/page/exchangeList`, {
      params: { client: 'app', clientVersion: CLIENT_VERSION },
    });
    if (!data || data.code !== 0) return [];
    const result = data.result || {};
    const items = [];
    for (const key in result) {
      if (Array.isArray(result[key])) {
        for (const item of result[key]) items.push(item);
      }
    }
    return items;
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
    const offset = randomInteger(120, 360);
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/signin/page/exchangeV3`, {
      method: 'POST',
      data: {
        prizeId: Number(prizeId),
        client: 'app',
        clientVersion: CLIENT_VERSION,
        puzzleOffset: offset,
        smsCode: '',
        deviceId: this.deviceId,
      },
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
    const data = await this.requestMarketJson(`${MARKET_BASE_URL}/ycloud/prizeApi/checkPrize/getUserPrizeLogPageV2`, {
      params: { currPage: 1, pageSize: 100 },
    });
    if (!data || data.code !== 0) return;
    const records = (data.result && data.result.result) || [];
    const pending = records.filter(item => item.flag === 1);
    if (pending.length) this.log(`• 待领取奖品: ${pending.map(item => item.prizeName).join('、')}`);
  }

  async run(prizeIds) {
    this.prizeIds = prizeIds;
    await this.getCloudInfo();
    this.items = await this.getExchangeList();
    this.productCount = this.items.length;

    if (!prizeIds.length) {
      this.log(`• 商品(${this.items.length}): ${formatExchangeProducts(this.items) || '暂无可查询商品'}`);
      await this.queryReceivedPrizes();
      return;
    }

    for (const prizeId of prizeIds) {
      const item = this.items.find(value => String(value.prizeId) === String(prizeId));
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
    await this.queryReceivedPrizes();
  }

  notificationLine() {
    if (!this.prizeIds.length) {
      const products = formatExchangeProducts(this.items);
      return `• ${this.encryptAccount}: ${products ? `商品 ${shorten(products, 70)}` : '暂无可抢兑商品'}`;
    }
    const skipped = this.exchangeSkipped.length ? ` / 跳过 ${this.exchangeSkipped.join('、')}` : '';
    return `• ${this.encryptAccount}: 成功${this.exchangeSuccess}个${skipped}`;
  }
}

function formatExchangeProducts(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items
    .map(item => `${item.prizeId}:${item.prizeName || '未命名'}(${item.dailyRemainderCount || 0})`)
    .join(' / ');
}

function loadPrizeIds() {
  const raw = String(ARGUMENT.prizes || storeRead('ydyp_exchange_prizes') || '');
  return raw.split(/[,，\s]+/).filter(Boolean);
}

function delayUntilExchangeSlot(now) {
  const current = now || new Date();
  const slots = [0, 10, 16].map(hour => {
    const date = new Date(current);
    date.setHours(hour, 0, 0, 0);
    return date.getTime();
  });
  const next = slots.find(timestamp => timestamp >= current.getTime() && timestamp - current.getTime() <= 5 * 60 * 1000);
  if (next === undefined) return -1;
  return Math.max(0, next - current.getTime());
}

async function runExchangeAccount(user, prizeIds) {
  const account = user.phone || extractPhoneFromAuthorization(user.Authorization);
  const stored = getStorageInfo(account);
  const Authorization = normalizeAuthorization(stored.token || user.Authorization);
  if (!account || !Authorization) return null;

  const task = new ExchangeTask({ Authorization, phone: account, deviceId: user.deviceId || stored.deviceId || '' });
  const logged = await task.guard(() => task.jwt());
  if (!logged) {
    task.log(`❌ 登录: ${task.encryptAccount} 未通过`);
    return { task, failed: true };
  }
  await task.guard(() => task.run(prizeIds));
  return { task, failed: false };
}

async function runExchange(accounts) {
  const prizeIds = loadPrizeIds();
  const delay = delayUntilExchangeSlot(new Date());
  if (delay > 0 && delay <= 60 * 1000) {
    log(`⏳ 抢兑预热 ${Math.round(delay / 1000)} 秒后准点首发`);
    await sleep(delay);
  }

  const lines = [];
  let successCount = 0;
  let failedCount = 0;
  let productCount = 0;

  for (let index = 0; index < accounts.length; index++) {
    const outcome = await runExchangeAccount(accounts[index], prizeIds);
    if (!outcome) {
      failedCount++;
    } else {
      if (outcome.failed) failedCount++;
      successCount += outcome.task.exchangeSuccess;
      productCount += outcome.task.productCount;
      lines.push(outcome.task.notificationLine());
    }
    if (index < accounts.length - 1) await sleep(randomInteger(1000, 3000));
  }

  let subtitle;
  if (successCount > 0) subtitle = '✅ 抢兑成功';
  else if (productCount === 0 && failedCount > 0) subtitle = '⚠️ 脚本运行异常';
  else subtitle = '⚠️ 暂无可抢兑商品';
  notify(subtitle, lines.length ? lines.join('\n') : '• 没有可处理的账号');
}

/* ---------------------------------------------------------------------------
 * 通知与入口
 * ------------------------------------------------------------------------- */

function notify(subtitle, body) {
  const now = Date.now();
  const last = Number(storeRead(NOTIFY_KEY) || 0);
  if (now - last < NOTIFY_GAP_MS) return;
  storeWrite(String(now), NOTIFY_KEY);

  if (typeof $notification === 'undefined' || !$notification) {
    log(`\n----- 移动云盘 · ${subtitle} -----\n${body}`);
    return;
  }
  try {
    $notification.post('移动云盘', subtitle, body);
  } catch (error) {
    log(`\n----- 移动云盘 · ${subtitle} -----\n${body}`);
  }
}

async function main() {
  const accounts = loadAccounts();
  log(`移动云盘 Loon v${SCRIPT_VERSION} · ${MODE === 'exchange' ? '商品抢兑' : '每日签到'}`);
  log(`🌀 找到 ${accounts.length} 个账号`);

  if (!accounts.length) {
    notify('🚫 未找到凭据', '• 请先在移动云盘 App 首页触发一次抓取，或填写插件 auth 参数');
    return;
  }

  if (MODE === 'exchange') await runExchange(accounts);
  else await runSign(accounts);
}

const HAS_RUNTIME = typeof $persistentStore !== 'undefined' && typeof $httpClient !== 'undefined';

if (HAS_RUNTIME) {
  main()
    .catch(error => {
      const message = String((error && error.stack) || (error && error.message) || error);
      log(message);
      notify('⚠️ 脚本运行异常', `• ${shorten(message.split('\n')[0], 80)}`);
    })
    .finally(() => {
      if (typeof $done !== 'undefined') $done({});
    });
}
