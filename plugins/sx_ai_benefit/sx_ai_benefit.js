/**
 * 山西电信体验AI领福利 - 极简静默监控与凭证捕获脚本
 * @version 1.2.0
 * @date 2026-09-03
 * GitHub: https://github.com/TomCatXue/MyCookieCenter
 * 
 * 严格静默规则：
 * 1. 凭证捕获：只有检测到“新批次凭证”时才通知 1 次，同批次后续进入只静默更新 Cookie，绝不弹窗。
 * 2. 日常监控：平时状态正常/已领取时 100% 静默，绝不发任何日常打扰通知。
 * 3. 终结休眠：检测到放水通知后（或已参与后），当月彻底锁定休眠，脚本直接退出不执行，直到下月初自动复苏。
 */

const isRequest = typeof $request !== 'undefined';

if (isRequest) {
  handleCapture();
} else {
  handleProbe();
}

// ==================== 1. 凭据自动捕获（只通知一次） ====================
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
      const code = match ? match[1] : '';

      if (code) {
        $persistentStore.write(code, 'sx_monitor_current_code');
        const lastNotifiedCode = $persistentStore.read('sx_capture_notified_code');

        // 核心控制：只有检测到新批次代码时，才通知 1 次；已通知过则绝不弹窗
        if (code !== lastNotifiedCode) {
          $persistentStore.write(code, 'sx_capture_notified_code');
          sendNotify(
            '中国电信 · 权益中心',
            '📡 云开通信畅，会话已同步。',
            '当前状态：新凭据已归囊，探针就绪待命。',
            'ctclient://'
          );
          console.log(`[电信福利] 首次检测到新批次凭据 [${code}]，已发送单次通知。`);
        } else {
          console.log(`[电信福利] 凭证静默刷新成功（批次 [${code}] 已通知过，保持静默）。`);
        }
      }
    }
  }
  $done({});
}

// ==================== 2. 服务端探针静默监控 ====================
async function handleProbe() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const currentYearMonth = `${year}${month}`; // 形如 "202609"

  // 【核心机制：当月彻底休眠锁】
  // 只要本月已经标记过完成（已通知过放水，或已确认本月领完），后续所有唤醒直接退出，绝不发包、绝不弹窗！
  const notifiedMonth = $persistentStore.read('sx_monitor_notified_month');
  const isTestArg = (typeof $argument === 'string' && $argument.toLowerCase().includes('test'));

  if (!isTestArg && notifiedMonth === currentYearMonth) {
    console.log(`[电信探针] 本月（${currentYearMonth}）任务已结束，脚本静默休眠，不执行任何操作。`);
    $done({});
    return;
  }

  const cookie = $persistentStore.read('sx_benefit_cookie');
  const activityUrl = $persistentStore.read('sx_benefit_url');
  const ua = $persistentStore.read('sx_benefit_ua') || 'CtClient;13.2.0;iOS;26.6.1;iPhone 16e';

  if (!cookie || !activityUrl) {
    console.log('[电信探针] 未检测到活动会话，请先在电信APP搜“领福利”进入活动页面。');
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
      // 确认当月已参与：立即将本月锁死，后续全月彻底静默，绝不发送通知！
      $persistentStore.write(currentYearMonth, 'sx_monitor_notified_month');
      console.log(`[电信探针] 确认本月（${currentYearMonth}）已完成领取，已锁定当月休眠，不发送日常通知。`);

      // 仅在明确传入 argument="test" 手动调试时才反馈自检通知
      if (isTestArg) {
        sendNotify(
          '中国电信 · 权益中心',
          '📡 云开通信畅，权益已归囊。',
          '当前状态：本期权益已领取，探针守护中。',
          'ctclient://'
        );
      }
    } else {
      // 状态跃迁：新活动上线放水！通知 1 次，并立即锁定本月！
      $persistentStore.write(currentYearMonth, 'sx_monitor_notified_month');
      sendNotify(
        '中国电信 · 权益中心',
        '🎁 好礼今朝至，千份待君来。',
        '当前状态：腾讯视频会员已开抢，速去抢兑！',
        'ctclient://'
      );
      console.log('[电信探针] 抓到新活动放水！已发送单次上线提醒，当月监控已锁定。');
    }
  } catch (err) {
    console.log('[电信探针] 探测网络异常（保持静默）: ' + err.message);
  } finally {
    $done({});
  }
}

// ==================== 统一通知封装（两行极简 + 点击直达） ====================
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

