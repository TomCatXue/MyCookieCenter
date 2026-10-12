/**
 * LoonMonitor · 小组件数据提供与状态服务
 *
 * 1. 订阅流量捕获：监听机场订阅响应头 subscription-userinfo 并持久化
 * 2. 本地虚拟 API 响应：拦截 http://loon.local/api/monitor，组装并返回状态、节点与出口 IP
 *
 * @Author: TomCatXue
 * @Updated: 2026-10-12
 */

const SUB_CACHE_KEY = "loon_monitor_sub_info";

// ── 1. 订阅响应捕获 ──────────────────────────────────────────
function captureSubscription() {
  try {
    const headers = $response.headers || {};
    const subHeader =
      headers["subscription-userinfo"] ||
      headers["Subscription-Userinfo"] ||
      headers["subscription_userinfo"];

    if (subHeader) {
      const upload = parseInt((subHeader.match(/upload\s*=\s*(\d+)/i) || [])[1] || "0", 10);
      const download = parseInt((subHeader.match(/download\s*=\s*(\d+)/i) || [])[1] || "0", 10);
      const total = parseInt((subHeader.match(/total\s*=\s*(\d+)/i) || [])[1] || "0", 10);
      const expire = parseInt((subHeader.match(/expire\s*=\s*(\d+)/i) || [])[1] || "0", 10);

      const cached = {
        upload,
        download,
        total,
        expire,
        updatedAt: Date.now(),
      };
      if (typeof $persistentStore !== "undefined") {
        $persistentStore.write(JSON.stringify(cached), SUB_CACHE_KEY);
      }
      console.log(`[LoonMonitor] 成功捕获订阅流量: upload=${upload}, download=${download}, total=${total}`);
    }
  } catch (e) {
    console.log(`[LoonMonitor] 捕获订阅流量异常: ${e.message || e}`);
  }
}

// ── 2. 本地虚拟 API 服务响应 ──────────────────────────────────
function serveMonitorData() {
  const startTime = Date.now();
  let vpnIp = "--";
  let vpnLocation = "检测中";
  let isp = "--";

  // 读取已缓存的订阅信息
  let subData = null;
  try {
    if (typeof $persistentStore !== "undefined") {
      const raw = $persistentStore.read(SUB_CACHE_KEY);
      if (raw) subData = JSON.parse(raw);
    }
  } catch (e) {
    console.log(`[LoonMonitor] 读取订阅缓存异常: ${e.message || e}`);
  }

  const uploadBytes = subData ? subData.upload : 0;
  const downloadBytes = subData ? subData.download : 0;
  const totalBytes = subData ? subData.total : 0;

  let resetDaysText = "长期有效";
  if (subData && subData.expire > 0) {
    const expMs = subData.expire > 10000000000 ? subData.expire : subData.expire * 1000;
    const diffDays = Math.ceil((expMs - Date.now()) / (86400 * 1000));
    resetDaysText = diffDays > 0 ? `${diffDays} 天后重置` : "已到期";
  }

  // 探测当前代理节点的出口 IP（走当前 Loon 策略组路由）
  const ipUrl = "http://ip-api.com/json/?fields=status,country,regionName,city,isp,query";
  const reqOptions = {
    url: ipUrl,
    headers: { "User-Agent": "LoonMonitor/1.0" },
    timeout: 3,
  };

  function reply(ip, loc, operator) {
    const latency = Math.max(1, Date.now() - startTime);
    const payload = {
      status: "running",
      runningMode: "规则分流",
      policyGroupCount: 14,
      nodeName: "当前代理节点",
      vpnIp: ip || "--",
      vpnLocation: loc || "海外节点",
      isp: operator || "--",
      delayMs: latency,
      uploadBytes,
      downloadBytes,
      totalBytes,
      resetDaysText,
      version: "3.2.x",
      updatedAt: new Date().toISOString(),
    };

    $done({
      response: {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(payload),
      },
    });
  }

  if (typeof $httpClient !== "undefined" && typeof $httpClient.get === "function") {
    $httpClient.get(reqOptions, (err, resp, data) => {
      if (!err && data) {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.status === "success") {
            vpnIp = parsed.query || "--";
            const locParts = [parsed.country, parsed.city || parsed.regionName].filter(Boolean);
            vpnLocation = locParts.join(" · ") || "海外出口";
            isp = parsed.isp || "--";
          }
        } catch {}
      }
      reply(vpnIp, vpnLocation, isp);
    });
  } else {
    reply(vpnIp, vpnLocation, isp);
  }
}

// ── 3. 入口路由分发 ──────────────────────────────────────────
if (typeof $response !== "undefined") {
  captureSubscription();
  $done({});
} else if (typeof $request !== "undefined") {
  serveMonitorData();
} else {
  $done({});
}
