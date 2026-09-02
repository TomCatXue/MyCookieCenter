/**
 * 山西电信体验AI领福利 - 探针监控与凭证捕获脚本
 * GitHub: https://github.com/TomCatXue/MyCookieCenter
 */

const isRequest = typeof $request !== 'undefined';

if (isRequest) {
  handleCapture();
} else {
  handleProbe();
}

// ==================== 1. 凭据自动捕获 ====================
function handleCapture() {
  const url = $request.url || '';
  const headers = $request.headers || {};

  if (url.includes('/sx_ai_benefit/h5/HD')) {
    const cookie = headers['Cookie'] || headers['cookie'];
    if (cookie) {
      $persistentStore.write(cookie, 'sx_benefit_cookie');
      $persistentStore.write(url, 'sx_benefit_url');
      const utmScha = getQueryParam(url, 'utm_scha') || '';
      $persistentStore.write(utmScha, 'sx_benefit_utm_scha');
      const ua = headers['User-Agent'] || headers['user-agent'] || 'CtClient;13.2.0;iOS;26.6.1;iPhone 16e';
      $persistentStore.write(ua, 'sx_benefit_ua');

      const match = url.match(/(HD\d{8}[A-Za-z0-9]+)/i);
      if (match && match[1]) {
        $persistentStore.write(match[1], 'sx_monitor_current_code');
      }

      sendNotify(
        '中国电信 · 权益中心',
        '📡 云开通信畅，会话已同步。',
        '当前状态：凭据已归囊，探针就绪待命。',
        'ctclient://'
      );
      console.log('[电信福利] 捕获活动凭据成功: ' + url);
    }
  }
  $done({});
}

// ==================== 2. 服务端探针自检与监控 ====================
async function handleProbe() {
  const cookie = $persistentStore.read('sx_benefit_cookie');
  const activityUrl = $persistentStore.read('sx_benefit_url');
  const ua = $persistentStore.read('sx_benefit_ua') || 'CtClient;13.2.0;iOS;26.6.1;iPhone 16e';
  const lastCode = $persistentStore.read('sx_monitor_current_code') || '当前批次';

  if (!cookie || !activityUrl) {
    sendNotify(
      '中国电信 · 权益中心',
      '⚠️ 未检测到有效活动会话。',
      '当前状态：请在电信APP搜“领福利”进入同步。',
      'ctclient://'
    );
    $done({});
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const currentYearMonth = `${year}${month}`; // 例如 "202610"

  const isCron = typeof $cron !== 'undefined' || typeof $trigger !== 'undefined';
  const notifiedMonth = $persistentStore.read('sx_monitor_notified_month');

  // 【核心机制：当月终结熔断】
  // 如果本月已经通知过放水，或者本月已经确认领过，Cron 模式下直接永久休眠，直到下个月初自动重置
  if (isCron && notifiedMonth === currentYearMonth) {
    console.log(`[电信探针] 本月（${currentYearMonth}）任务已完成，探针深度休眠至下月1号。`);
    $done({});
    return;
  }

  console.log('[电信探针] 正在向活动服务端发起探针状态检测...');

  try {
    const keyInfo = await getPublicKey(activityUrl, cookie, ua);
    if (!keyInfo || !keyInfo.para) {
      throw new Error('RSA 公钥签发失败');
    }

    const plainParams = JSON.stringify({ goodsType: 'tc_member' });
    const payload = buildEncryptedPayload(plainParams, keyInfo);

    const checkRes = await postJson('https://wx.sx.189.cn/sx_ai_benefit/order/subCheck', activityUrl, cookie, ua, payload);
    console.log('[电信探针] 服务端响应: ' + JSON.stringify(checkRes));

    const msg = checkRes.msg ? checkRes.msg.replace(/<br\s*[\/]?>/gi, ' ') : '';

    if (msg.includes('已参与本期活动')) {
      // 如果当前批次属于当月，说明当月福利已完成领取，直接锁定本月休眠，不再发包
      if (lastCode.includes(currentYearMonth)) {
        $persistentStore.write(currentYearMonth, 'sx_monitor_notified_month');
        console.log(`[电信探针] 确认本月（${currentYearMonth}）已完成领取，自动锁定休眠至下月初。`);
      }

      if (!isCron) {
        // 手动测试：极简双行通知（一行诗词，一行状态）
        sendNotify(
          '中国电信 · 权益中心',
          '📡 云开通信畅，权益已归囊。',
          '当前状态：本期权益已领取，探针守护中。',
          'ctclient://'
        );
      } else {
        console.log('[电信探针] 服务端状态为已参与，保持静默...');
      }
    } else {
      // 状态跃迁：新活动上线放水
      $persistentStore.write(currentYearMonth, 'sx_monitor_notified_month');
      sendNotify(
        '中国电信 · 权益中心',
        '🎁 好礼今朝至，千份待君来。',
        '当前状态：腾讯视频会员已开抢，速去抢兑！',
        'ctclient://'
      );
      console.log('[电信探针] 检测到服务端状态跃迁，已推送直达通知并锁定当月！');
    }
  } catch (err) {
    console.log('[电信探针] 探测失败: ' + err.message);
    if (!isCron) {
      sendNotify(
        '中国电信 · 权益中心',
        '⚠️ 服务端探测连接失败。',
        `当前状态：${err.message}`,
        'ctclient://'
      );
    }
  } finally {
    $done({});
  }
}

// ==================== 统一通知封装（极简两行 + 点击直达） ====================
function sendNotify(title, subtitle, body, targetUrl = 'ctclient://') {
  if (typeof $notification !== 'undefined') {
    $notification.post(title, subtitle, body, targetUrl);
  }
}

// ==================== 网络请求封装 ====================
function getPublicKey(referer, cookie, ua) {
  return new Promise((resolve, reject) => {
    $httpClient.post({
      url: 'https://wx.sx.189.cn/sx_ai_benefit/get/para',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': ua,
        'Referer': referer,
        'Cookie': cookie
      },
      body: ''
    }, (err, resp, data) => {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('解析公钥异常: ' + data));
      }
    });
  });
}

function postJson(url, referer, cookie, ua, bodyObj) {
  return new Promise((resolve, reject) => {
    $httpClient.post({
      url: url,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': ua,
        'Referer': referer,
        'Cookie': cookie
      },
      body: JSON.stringify(bodyObj)
    }, (err, resp, data) => {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('解析服务端响应异常: ' + data));
      }
    });
  });
}

// ==================== 纯 JS 零依赖 RSA-2048 加密 ====================
function buildEncryptedPayload(plainStr, keyInfo) {
  const chunkSize = 117;
  const encryptedChunks = [];
  for (let i = 0; i < plainStr.length; i += chunkSize) {
    const chunk = plainStr.substr(i, chunkSize);
    const enc = rsaEncryptPkcs1(chunk, keyInfo.para);
    encryptedChunks.push(encodeURI(enc));
  }
  return {
    reqParam: encryptedChunks,
    uuId: keyInfo.uuId,
    encryptionType: '1'
  };
}

function rsaEncryptPkcs1(plainStr, b64Key) {
  const { n, e, keyLen } = parseSpkiKey(b64Key);
  const encoder = new TextEncoder();
  const msgBytes = encoder.encode(plainStr);
  const padLen = keyLen - msgBytes.length - 3;
  if (padLen < 8) throw new Error('明文过长');

  const em = new Uint8Array(keyLen);
  em[0] = 0x00;
  em[1] = 0x02;
  for (let i = 2; i < 2 + padLen; i++) {
    let r = 0;
    while (r === 0) r = Math.floor(Math.random() * 255) + 1;
    em[i] = r;
  }
  em[2 + padLen] = 0x00;
  em.set(msgBytes, 3 + padLen);

  const m = bytesToBigInt(em);
  const c = modPow(m, e, n);
  const cBytes = bigIntToBytes(c, keyLen);
  return bytesToBase64(cBytes);
}

function parseSpkiKey(b64) {
  const der = base64ToBytes(b64);
  let idx = 0;
  while (idx < der.length - 4) {
    if (der[idx] === 0x02 && der[idx + 1] === 0x82 && der[idx + 2] === 0x01 && der[idx + 3] === 0x01) {
      idx += 4;
      if (der[idx] === 0x00) idx++;
      const nBytes = der.subarray(idx, idx + 256);
      idx += 256;
      if (der[idx] === 0x02) {
        idx++;
        const eLen = der[idx++];
        const eBytes = der.subarray(idx, idx + eLen);
        return {
          n: bytesToBigInt(nBytes),
          e: bytesToBigInt(eBytes),
          keyLen: 256
        };
      }
    }
    idx++;
  }
  throw new Error('解析 RSA 公钥失败');
}

function modPow(b, exp, mod) {
  let res = 1n;
  b = b % mod;
  while (exp > 0n) {
    if (exp & 1n) res = (res * b) % mod;
    b = (b * b) % mod;
    exp >>= 1n;
  }
  return res;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function bytesToBigInt(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    let h = bytes[i].toString(16);
    if (h.length === 1) h = '0' + h;
    hex += h;
  }
  return BigInt('0x' + (hex || '0'));
}

function bigIntToBytes(bn, len) {
  let hex = bn.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const rawBytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < rawBytes.length; i++) {
    rawBytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  if (rawBytes.length === len) return rawBytes;
  const out = new Uint8Array(len);
  out.set(rawBytes, len - rawBytes.length);
  return out;
}

function getQueryParam(rawUrl, name) {
  const reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
  const r = rawUrl.split('?')[1]?.match(reg);
  return r != null ? unescape(r[2]) : null;
}
