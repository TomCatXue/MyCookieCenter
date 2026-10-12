/**
 * LoonMonitor · 小组件数据提供与状态服务
 *
 * 1. 订阅流量捕获：监听机场订阅响应头 subscription-userinfo 并持久化
 * 2. 本地虚拟 API 响应：拦截 http://loon.box/api/monitor，组装并秒级返回状态、节点与出口 IP
 *
 * @Author: TomCatXue
 * @Updated: 2026-10-12
 */

const SUB_CACHE_KEY = 'loon_monitor_sub_info';
const IP_CACHE_KEY = 'loon_monitor_ip_info';
const IP_CACHE_TTL_MS = 5 * 60 * 1000;

function captureSubscription() {
  try {
    const headers = $response.headers || {};
    const subHeader =
      headers['subscription-userinfo'] ||
      headers['Subscription-Userinfo'] ||
      headers['subscription_userinfo'];

    if (subHeader) {
      const upload = parseInt((subHeader.match(/upload\s*=\s*(\d+)/i) || [])[1] || '0', 10);
      const download = parseInt((subHeader.match(/download\s*=\s*(\d+)/i) || [])[1] || '0', 10);
      const total = parseInt((subHeader.match(/total\s*=\s*(\d+)/i) || [])[1] || '0', 10);
      const expire = parseInt((subHeader.match(/expire\s*=\s*(\d+)/i) || [])[1] || '0', 10);

      const cached = {
        upload,
        download,
        total,
        expire,
        updatedAt: Date.now(),
      };
      if (typeof $persistentStore !== 'undefined') {
        $persistentStore.write(JSON.stringify(cached), SUB_CACHE_KEY);
      }
      console.log('[LoonMonitor] 成功捕获订阅流量: upload=' + upload + ', download=' + download + ', total=' + total);
    }
  } catch (e) {
    console.log('[LoonMonitor] 捕获订阅流量异常: ' + (e.message || e));
  }
}

function serveMonitorData() {
  const startTime = Date.now();

  let subData = null;
  try {
    if (typeof $persistentStore !== 'undefined') {
      const raw = $persistentStore.read(SUB_CACHE_KEY);
      if (raw) subData = JSON.parse(raw);
    }
  } catch (e) {
    console.log('[LoonMonitor] 读取订阅缓存异常: ' + (e.message || e));
  }

  const uploadBytes = subData ? subData.upload : 0;
  const downloadBytes = subData ? subData.download : 0;
  const totalBytes = subData ? subData.total : 0;

  let resetDaysText = subData ? '长期有效' : '待刷新订阅同步';
  if (subData && subData.expire > 0) {
    const expMs = subData.expire > 10000000000 ? subData.expire : subData.expire * 1000;
    const diffDays = Math.ceil((expMs - Date.now()) / (86400 * 1000));
    resetDaysText = diffDays > 0 ? (diffDays + ' 天后重置') : '已到期';
  }

  let cachedIp = null;
  try {
    if (typeof $persistentStore !== 'undefined') {
      const rawIp = $persistentStore.read(IP_CACHE_KEY);
      if (rawIp) {
        const parsed = JSON.parse(rawIp);
        if (parsed && Date.now() - parsed.timestamp < IP_CACHE_TTL_MS) {
          cachedIp = parsed;
        }
      }
    }
  } catch (e) {}

  function reply(ip, loc, operator) {
    const latency = Math.max(1, Date.now() - startTime);
    const nodeDesc = operator && operator !== '--' ? (loc + ' · ' + operator) : (loc || '当前代理节点');
    const payload = {
      status: 'running',
      runningMode: '规则分流',
      running_model: 1,
      policyGroupCount: 14,
      policy_groups_count: 14,
      nodeName: nodeDesc,
      vpnIp: ip || '--',
      vpnLocation: loc || '代理出口',
      isp: operator || '--',
      delay: latency,
      delayMs: latency,
      upload: uploadBytes,
      download: downloadBytes,
      total: totalBytes,
      uploadBytes,
      downloadBytes,
      totalBytes,
      resetDaysText,
      version: '3.2.x',
      updatedAt: new Date().toISOString(),
    };

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

  if (cachedIp) {
    reply(cachedIp.ip, cachedIp.location, cachedIp.isp);
    return;
  }

  const ipUrl = 'http://ip-api.com/json/?fields=status,country,regionName,city,isp,query';
  const reqOptions = {
    url: ipUrl,
    headers: { 'User-Agent': 'LoonMonitor/1.0' },
    timeout: 2.5,
  };

  let vpnIp = '--';
  let vpnLocation = '海外节点';
  let isp = '--';

  if (typeof $httpClient !== 'undefined' && typeof $httpClient.get === 'function') {
    $httpClient.get(reqOptions, (err, resp, data) => {
      if (!err && data) {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.status === 'success') {
            vpnIp = parsed.query || '--';
            const locParts = [parsed.country, parsed.city || parsed.regionName].filter(Boolean);
            vpnLocation = locParts.join(' · ') || '海外出口';
            isp = parsed.isp || '--';

            if (typeof $persistentStore !== 'undefined') {
              $persistentStore.write(
                JSON.stringify({ ip: vpnIp, location: vpnLocation, isp, timestamp: Date.now() }),
                IP_CACHE_KEY
              );
            }
          }
        } catch {}
      }
      reply(vpnIp, vpnLocation, isp);
    });
  } else {
    reply(vpnIp, vpnLocation, isp);
  }
}

if (typeof $response !== 'undefined') {
  captureSubscription();
  $done({});
} else if (typeof $request !== 'undefined') {
  serveMonitorData();
} else {
  $done({});
}
