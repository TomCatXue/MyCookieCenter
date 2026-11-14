/**
 * 移动云盘 · Authorization 捕获
 * 触发：打开移动云盘 App 首页，命中 user-njs.yun.139.com/user/
 * 存储：ydyp_data（数组）/ ydyp_device_id / ydyp_cache
 * 同步：呆呆面板 YDYP_AUTH（经取凭证网关，按来源分行）
 */

const DATA_KEY = 'ydyp_data';
const DEVICE_KEY = 'ydyp_device_id';
const CACHE_KEY = 'ydyp_cache';
const NOTIFY_KEY = 'yundisk_notify_time';
const NOTIFY_GAP_MS = 10 * 1000;

function getHeader(headers, name) {
  const target = String(name).toLowerCase();
  for (const key in headers || {}) {
    if (String(key).toLowerCase() === target) return headers[key];
  }
  return '';
}

function decodeAuthorization(value) {
  const raw = String(value || '').trim().replace(/^Basic\s+/i, '');
  return Buffer.from(raw, 'base64').toString('utf8');
}

function parseAuthorizationRecord(authorization) {
  const raw = decodeAuthorization(authorization);
  const parts = raw.split(':');
  if (parts.length < 3 || !/^1\d{10}$/.test(parts[1])) return null;
  return {
    Authorization: String(authorization || '').trim(),
    phone: parts[1],
    deviceId: '',
  };
}

function maskPhone(phone) {
  const value = String(phone || '');
  return value.length >= 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
}

function getStorageValue(storage, key, fallback = '') {
  if (!storage || !storage.get) return fallback;
  const value = storage.get(key);
  return value === undefined || value === null ? fallback : String(value);
}

function normalizeSource(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
}

function generateSource() {
  return `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function getDaidaiSource(storage) {
  const source = normalizeSource(getStorageValue(storage, '@daidai.device'));
  if (source) return source;
  const generated = generateSource();
  if (storage && storage.set) storage.set(generated, '@daidai.device');
  return generated;
}

function buildToolsSyncPayload(storage, api, token) {
  const address = String(api || '').replace(/\/+$/, '');
  const accessToken = String(token || '').trim();
  if (!address || !accessToken) return null;
  const data = getStorageValue(storage, DATA_KEY);
  const cache = getStorageValue(storage, CACHE_KEY);
  const deviceId = getStorageValue(storage, DEVICE_KEY);
  if (!data && !cache && !deviceId) return null;
  const envs = data ? [{ name: 'YDYP_AUTH', value: data }] : [];
  const boxjs = [
    cache ? { key: CACHE_KEY, value: cache } : null,
    deviceId ? { key: DEVICE_KEY, value: deviceId } : null,
  ].filter(Boolean);
  return {
    api: address,
    token: accessToken,
    body: { envs, boxjs, source: getDaidaiSource(storage) },
  };
}

function pushToToolsGateway(payload, callback) {
  if (!payload || typeof $httpClient === 'undefined' || !$httpClient) {
    if (callback) callback({ ok: false, reason: '未配置 tools 网关' });
    return;
  }
  const isLoon = typeof $loon !== 'undefined';
  const options = {
    url: `${payload.api}/api/daidai/env/sync`,
    method: 'POST',
    headers: {
      'X-Token': payload.token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload.body),
    timeout: isLoon ? 20000 : 20,
  };
  const timer = setTimeout(() => {
    if (callback) callback({ ok: false, reason: '同步超时(20s)' });
  }, 22000);
  $httpClient.post(options, (error, response, data) => {
    clearTimeout(timer);
    if (error) {
      if (callback) callback({ ok: false, reason: String(error.message || error) });
      return;
    }
    let result = null;
    try {
      result = JSON.parse(data);
    } catch (parseError) {
      result = null;
    }
    if (result && (result.error || (result.failed || []).length)) {
      const reason = result.error || (result.failed || []).map(item => item.name || item.key).join(',');
      if (callback) callback({ ok: false, reason });
      return;
    }
    if (callback) callback({ ok: true, result });
  });
}

function getStoredList() {
  try {
    const parsed = JSON.parse($persistentStore.read(DATA_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveRecord(record) {
  const list = getStoredList();
  const index = list.findIndex(item => item.phone === record.phone);
  if (index >= 0 && list[index].Authorization === record.Authorization) return { changed: false, list };
  if (index >= 0) list[index] = record;
  else list.push(record);
  $persistentStore.write(JSON.stringify(list), DATA_KEY);
  $persistentStore.write(record.deviceId, DEVICE_KEY);
  let previousCache = {};
  try {
    previousCache = JSON.parse($persistentStore.read(CACHE_KEY) || '{}');
  } catch (error) {
    previousCache = {};
  }
  $persistentStore.write(JSON.stringify(mergeCacheRecord(previousCache, record)), CACHE_KEY);
  return { changed: true, list };
}

function mergeCacheRecord(cache, record) {
  const merged = { ...(cache || {}) };
  merged[record.phone] = {
    account: record.phone,
    token: record.Authorization,
    deviceId: record.deviceId,
    updatedAt: Date.now(),
  };
  return merged;
}

function notify(record, changed, syncResult) {
  const last = Number($persistentStore.read(NOTIFY_KEY) || 0);
  if (Date.now() - last < NOTIFY_GAP_MS) return;
  $persistentStore.write(String(Date.now()), NOTIFY_KEY);
  $notification.post(
    '移动云盘',
    changed ? '🎉 Authorization 已捕获' : '✅ Authorization 有效（未变化）',
    `• 账号: ${maskPhone(record.phone)}\n• 变量: ydyp_data\n• 呆呆: ${syncResult && syncResult.ok ? '已同步' : (syncResult ? syncResult.reason : '未配置')}`
  );
}

function PersistentStorage() {
  this.get = key => $persistentStore.read(key);
  this.set = (value, key) => $persistentStore.write(value, key);
}

if (typeof $request !== 'undefined') {
  try {
    if ($request.method !== 'OPTIONS') {
      const authorization = getHeader($request.headers, 'Authorization');
      const record = parseAuthorizationRecord(authorization);
      if (record) {
        const result = saveRecord(record);
        const storage = new PersistentStorage();
        const payload = buildToolsSyncPayload(
          storage,
          getStorageValue(storage, '@tools.address'),
          getStorageValue(storage, '@tools.token')
        );
        pushToToolsGateway(payload, syncResult => notify(record, result.changed, syncResult));
      } else {
        console.log('[YunDisk] Authorization 缺失或格式无效');
      }
    }
  } catch (error) {
    console.log(`[YunDisk] 捕获失败: ${error.message || error}`);
  }
}

if (typeof $done !== 'undefined') $done({});

export { parseAuthorizationRecord, decodeAuthorization, maskPhone, mergeCacheRecord, buildToolsSyncPayload, getDaidaiSource };
