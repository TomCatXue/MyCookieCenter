/**
 * LoonMonitor · 小组件数据提供与状态服务
 *
 * 1. 订阅流量捕获：监听机场订阅响应头 subscription-userinfo 并持久化
 * 2. 本地虚拟 API：拦截 http request，直接返回运行模式 / 节点 / 出口 IP / 流量
 *
 * 注意：Loon 的 $httpClient timeout 单位是毫秒（官方文档），
 * 早期实现传了 2.5，等于 2.5ms 超时 —— 出口 IP 探测必然失败。
 *
 * @Author: TomCatXue
 * @Updated: 2026-10-12
 */

const SUB_CACHE_KEY = 'loon_monitor_sub_info';
const IP_CACHE_KEY = 'loon_monitor_ip_info';
const IP_CACHE_TTL_MS = 5 * 60 * 1000;
const IP_PROBE_TIMEOUT_MS = 2500;

function log(msg) {
  try {
    console.log('[LoonMonitor] ' + msg);
  } catch (e) {}
}

// ── 持久化读写（$persistentStore 在极少数上下文缺失，统一兜底）──
function storeRead(key) {
  try {
    if (typeof $persistentStore === 'undefined') return null;
    return $persistentStore.read(key);
  } catch (e) {
    return null;
  }
}

function storeWrite(value, key) {
  try {
    if (typeof $persistentStore === 'undefined') return false;
    return $persistentStore.write(value, key);
  } catch (e) {
    return false;
  }
}

function readJson(key) {
  const raw = storeRead(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ── 订阅流量捕获 ───────────────────────────────────────────────
function captureSubscription() {
  try {
    const headers = ($response && $response.headers) || {};
    const subHeader =
      headers['subscription-userinfo'] ||
      headers['Subscription-Userinfo'] ||
      headers['subscription_userinfo'];

    if (!subHeader) return;

    const pick = (name) => {
      const m = subHeader.match(new RegExp(name + '\\s*=\\s*(\\d+)', 'i'));
      return m ? parseInt(m[1], 10) : 0;
    };

    const cached = {
      upload: pick('upload'),
      download: pick('download'),
      total: pick('total'),
      expire: pick('expire'),
      updatedAt: Date.now(),
    };
    storeWrite(JSON.stringify(cached), SUB_CACHE_KEY);
    log('捕获订阅流量 upload=' + cached.upload + ' download=' + cached.download + ' total=' + cached.total);
  } catch (e) {
    log('捕获订阅流量异常: ' + (e && e.message ? e.message : e));
  }
}

// ── 小组件数据服务 ─────────────────────────────────────────────
function serveMonitorData() {
  const subData = readJson(SUB_CACHE_KEY);

  const uploadBytes = subData ? Number(subData.upload) || 0 : 0;
  const downloadBytes = subData ? Number(subData.download) || 0 : 0;
  const totalBytes = subData ? Number(subData.total) || 0 : 0;

  let resetDaysText = subData ? '长期有效' : '待刷新订阅同步';
  if (subData && Number(subData.expire) > 0) {
    const raw = Number(subData.expire);
    const expMs = raw > 10000000000 ? raw : raw * 1000;
    const diffDays = Math.ceil((expMs - Date.now()) / 86400000);
    resetDaysText = diffDays > 0 ? diffDays + ' 天后重置' : '已到期';
  }

  // 运行模式与策略组：直接读 Loon 当前配置，拿不到就退回默认文案
  let runningMode = '规则分流';
  let runningModel = 1;
  let policyGroupCount = 0;
  let finalPolicy = '';
  let globalProxy = '';
  try {
    if (typeof $config !== 'undefined' && typeof $config.getConfig === 'function') {
      const cfg = JSON.parse($config.getConfig());
      const model = Number(cfg.running_model);
      if (model === 0) {
        runningMode = '全局直连';
        runningModel = 0;
      } else if (model === 2) {
        runningMode = '全局代理';
        runningModel = 2;
      } else {
        runningMode = '规则分流';
        runningModel = 1;
      }
      if (Array.isArray(cfg.all_policy_groups)) policyGroupCount = cfg.all_policy_groups.length;
      finalPolicy = cfg.final || '';
      globalProxy = cfg.global_proxy || '';
    }
  } catch (e) {
    log('读取 Loon 配置失败: ' + (e && e.message ? e.message : e));
  }

  // 当前节点 = FINAL 策略组当前选中的子策略
  let nodeName = '';
  try {
    if (
      finalPolicy &&
      typeof $config !== 'undefined' &&
      typeof $config.getSelectedPolicy === 'function'
    ) {
      nodeName = $config.getSelectedPolicy(finalPolicy) || '';
    }
  } catch (e) {}
  if (!nodeName) nodeName = globalProxy || finalPolicy || '当前代理节点';

  // 出口 IP：命中 5 分钟缓存就不重复探测，避免小组件刷新时频繁外联
  const cachedIp = readJson(IP_CACHE_KEY);
  if (cachedIp && cachedIp.ip && Date.now() - Number(cachedIp.timestamp || 0) < IP_CACHE_TTL_MS) {
    reply(cachedIp.ip, cachedIp.location, cachedIp.isp, cachedIp.nodeName, cachedIp.latencyMs);
    return;
  }

  /**
   * latencyMs 只接受「真实探测到的 RTT」。
   *
   * 早期实现把 startTime 到回复之间的耗时当作 delay —— 那其实只是本脚本的
   * 执行时间（约 1ms），并不是线路延迟，展示出来会严重失真。拿不到真实值时
   * 就不输出该字段，让小组件显示占位而不是假数字。
   */
  function reply(ip, loc, isp, node, latencyMs) {
    const payload = {
      status: 'running',
      runningMode: runningMode,
      running_model: runningModel,
      runningModel: runningModel,
      policyGroupCount: policyGroupCount,
      policy_groups_count: policyGroupCount,
      finalPolicy: finalPolicy,
      nodeName: node || nodeName,
      vpnIp: ip || '--',
      vpnLocation: loc || '未知归属',
      isp: isp || '--',
      upload: uploadBytes,
      download: downloadBytes,
      total: totalBytes,
      uploadBytes: uploadBytes,
      downloadBytes: downloadBytes,
      totalBytes: totalBytes,
      resetDaysText: resetDaysText,
      updatedAt: new Date().toISOString(),
    };
    // 只要「真的探测过」就输出（含 0ms 的极快回包）；没探测到则完全不输出，
    // 由小组件显示占位，而不是编一个数字。
    if (typeof latencyMs === 'number' && latencyMs >= 0) {
      payload.delay = latencyMs;
      payload.delayMs = latencyMs;
    }

    $done({
      response: {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(payload),
      },
    });
  }

  // 出口 IP 探测走代理（ip-api 在国内直连不可用，必须经节点）
  const probeUrl = 'http://ip-api.com/json/?fields=status,country,regionName,city,isp,query&lang=zh-CN';

  if (typeof $httpClient === 'undefined' || typeof $httpClient.get !== 'function') {
    reply('--', '未知归属', '--', nodeName);
    return;
  }

  const probeStart = Date.now();
  $httpClient.get(
    { url: probeUrl, timeout: IP_PROBE_TIMEOUT_MS, headers: { 'User-Agent': 'LoonMonitor/1.3' } },
    function (err, resp, data) {
      let ip = '--';
      let loc = '未知归属';
      let isp = '--';
      let rtt = null;
      try {
        if (!err && data) {
          const parsed = JSON.parse(data);
          if (parsed && parsed.status === 'success') {
            rtt = Date.now() - probeStart;
            ip = parsed.query || '--';
            const parts = [parsed.country, parsed.city || parsed.regionName].filter(Boolean);
            loc = parts.join(' · ') || '未知归属';
            isp = parsed.isp || '--';
            storeWrite(
              JSON.stringify({
                ip: ip,
                location: loc,
                isp: isp,
                nodeName: nodeName,
                latencyMs: rtt,
                timestamp: Date.now(),
              }),
              IP_CACHE_KEY
            );
          }
        }
      } catch (e) {
        log('解析出口 IP 失败: ' + (e && e.message ? e.message : e));
      }
      reply(ip, loc, isp, nodeName, rtt);
    }
  );
}

// 上下文判断：http-response 有 $response，http-request 只有 $request
if (typeof $response !== 'undefined') {
  captureSubscription();
  $done({});
} else if (typeof $request !== 'undefined') {
  serveMonitorData();
} else {
  $done({});
}
