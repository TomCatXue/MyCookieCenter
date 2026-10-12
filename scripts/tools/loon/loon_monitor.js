/**
 * LoonMonitor · 小组件数据提供与状态服务
 *
 * 1. 订阅流量同步：
 *    - 主动通道：通过插件参数 sub_url、请求参数 ?sub_url= 或持久化配置主动拉取
 *    - 被动通道：监听机场订阅响应头 subscription-userinfo 并持久化
 * 2. 本地虚拟 API：拦截 http request，毫秒级返回运行模式 / 节点 / 出口 IP / 流量
 * 3. 后台定时预热：定时唤醒同步出口 IP 与订阅流量，保证小组件端 0ms 极速响应
 *
 * 注意：Loon 的 $httpClient timeout 单位是毫秒（官方文档）。
 *
 * @Author: TomCatXue
 * @Updated: 2026-10-12
 */

const SUB_CACHE_KEY = "loon_monitor_sub_info";
const SUB_URL_KEY = "loon_monitor_sub_url";
const IP_CACHE_KEY = "loon_monitor_ip_info";
const IP_CACHE_TTL_MS = 5 * 60 * 1000;
const IP_CACHE_STALE_MS = 60 * 60 * 1000;
const IP_PROBE_TIMEOUT_MS = 2500;
const SUB_PROBE_TIMEOUT_MS = 3000;

function log(msg) {
  try {
    console.log("[LoonMonitor] " + msg);
  } catch (e) {}
}

// ── 持久化读写（$persistentStore 在极少数上下文缺失，统一兜底）──
function storeRead(key) {
  try {
    if (typeof $persistentStore === "undefined") return null;
    return $persistentStore.read(key);
  } catch (e) {
    return null;
  }
}

function storeWrite(value, key) {
  try {
    if (typeof $persistentStore === "undefined") return false;
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

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") return null;
  const target = String(name).toLowerCase();
  for (const k in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, k)) {
      if (String(k).toLowerCase() === target) {
        return headers[k];
      }
    }
  }
  return null;
}

function parseSubscriptionHeader(subHeader) {
  if (!subHeader || typeof subHeader !== "string") return null;
  const pick = (name) => {
    const m = subHeader.match(new RegExp(name + "\\s*=\\s*(\\d+)", "i"));
    return m ? parseInt(m[1], 10) : 0;
  };
  return {
    upload: pick("upload"),
    download: pick("download"),
    total: pick("total"),
    expire: pick("expire"),
    updatedAt: Date.now(),
  };
}

function getSubUrl() {
  // 1. 尝试从 $argument 读取（Loon 插件 [Argument] 传参）
  if (typeof $argument === "string" && $argument.trim()) {
    const trimmed = $argument.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      storeWrite(trimmed, SUB_URL_KEY);
      return trimmed;
    }
    const match = trimmed.match(/sub_url\s*=\s*([^&,\s]+)/i);
    if (match && /^https?:\/\//i.test(match[1])) {
      storeWrite(match[1], SUB_URL_KEY);
      return match[1];
    }
  }

  // 2. 尝试从请求 URL query 参数读取（?sub_url=... 或 ?sub=...）
  if (typeof $request !== "undefined" && $request.url) {
    const m = $request.url.match(/[?&]sub(?:_url)?=([^&#]+)/i);
    if (m) {
      try {
        const decoded = decodeURIComponent(m[1]).trim();
        if (/^https?:\/\//i.test(decoded)) {
          storeWrite(decoded, SUB_URL_KEY);
          return decoded;
        }
      } catch (e) {}
    }
  }

  // 3. 从持久化读取历史保存的订阅地址
  const saved = storeRead(SUB_URL_KEY);
  if (saved && typeof saved === "string" && /^https?:\/\//i.test(saved.trim())) {
    return saved.trim();
  }
  return "";
}

// ── 订阅流量捕获 ───────────────────────────────────────────────
function captureSubscription() {
  try {
    const headers = ($response && $response.headers) || {};
    const subHeader = getHeader(headers, "subscription-userinfo");
    if (subHeader) {
      const cached = parseSubscriptionHeader(subHeader);
      if (cached) {
        storeWrite(JSON.stringify(cached), SUB_CACHE_KEY);
        log("捕获订阅流量 upload=" + cached.upload + " download=" + cached.download + " total=" + cached.total);
      }
    }
    // 顺带留存订阅链接供主动同步
    if (typeof $request !== "undefined" && $request.url && /^https?:\/\//i.test($request.url)) {
      storeWrite($request.url, SUB_URL_KEY);
    }
  } catch (e) {
    log("捕获订阅流量异常: " + (e && e.message ? e.message : e));
  }
}

function fetchSubscriptionActive(subUrl, callback) {
  if (!subUrl || typeof $httpClient === "undefined" || typeof $httpClient.get !== "function") {
    if (typeof callback === "function") callback(null);
    return;
  }
  const req = {
    url: subUrl,
    headers: {
      "User-Agent": "ClashMeta; Loon/3.2.0; QuantumultX",
      Accept: "*/*",
    },
    timeout: SUB_PROBE_TIMEOUT_MS,
  };
  $httpClient.get(req, function (err, resp, data) {
    let result = null;
    try {
      if (!err && resp) {
        const h = resp.headers || {};
        const subHeader = getHeader(h, "subscription-userinfo");
        if (subHeader) {
          result = parseSubscriptionHeader(subHeader);
        } else if (data) {
          try {
            const j = typeof data === "string" ? JSON.parse(data) : data;
            if (j && (j.upload != null || j.download != null || j.total != null)) {
              result = {
                upload: Number(j.upload) || 0,
                download: Number(j.download) || 0,
                total: Number(j.total) || 0,
                expire: Number(j.expire) || 0,
                updatedAt: Date.now(),
              };
            }
          } catch (e) {}
        }
      }
      if (result) {
        storeWrite(JSON.stringify(result), SUB_CACHE_KEY);
        log("主动拉取订阅流量成功 upload=" + result.upload + " download=" + result.download + " total=" + result.total);
      }
    } catch (e) {
      log("主动拉取订阅流量解析异常: " + (e && e.message ? e.message : e));
    }
    if (typeof callback === "function") callback(result);
  });
}

function resolveNodeName(cfg) {
  if (!cfg) return "当前代理节点";

  const runningModel = Number(cfg.running_model);
  if (runningModel === 0) {
    return "全局直连";
  }
  if (runningModel === 2 && cfg.global_proxy) {
    return cfg.global_proxy;
  }

  const groups = Array.isArray(cfg.all_policy_groups) ? cfg.all_policy_groups : [];
  if (typeof $config === "undefined" || typeof $config.getSelectedPolicy !== "function") {
    return cfg.global_proxy || cfg.final || "当前代理节点";
  }

  // 1. 优先尝试从 final 策略组获取（在测试和部分配置中，final 直接指向主代理策略组）
  let nodeName = "";
  if (cfg.final) {
    try {
      const direct = $config.getSelectedPolicy(cfg.final);
      if (direct && direct !== "DIRECT" && direct !== "REJECT") {
        nodeName = direct;
      }
    } catch (e) {}
  }

  // 2. 如果 final 为 DIRECT 或未拿到有效节点，则在策略组列表中查找常见主代理策略组
  if (!nodeName || nodeName === "DIRECT" || nodeName === "REJECT") {
    const candidates = [
      "节点选择", "Proxy", "PROXY", "Proxies", "PROXIES", "代理节点",
      "主力节点", "节点", "Select", "SELECT", "Auto", "AUTO",
    ];
    for (let i = 0; i < candidates.length; i++) {
      if (groups.includes(candidates[i])) {
        try {
          const sel = $config.getSelectedPolicy(candidates[i]);
          if (sel && sel !== "DIRECT" && sel !== "REJECT") {
            nodeName = sel;
            break;
          }
        } catch (e) {}
      }
    }

    // 2.2 模糊匹配（支持带 emoji 或前后缀的策略组，如 "🚀 节点选择"、"🔰 Proxy"）
    if (!nodeName || nodeName === "DIRECT" || nodeName === "REJECT") {
      const fuzzyGroup = groups.find(function (g) {
        if (/DIRECT|REJECT|广告|去广告|国内|直连|拦截/i.test(g)) return false;
        const lower = g.toLowerCase();
        return candidates.some(function (c) {
          return lower.includes(c.toLowerCase());
        });
      });
      if (fuzzyGroup) {
        try {
          const sel = $config.getSelectedPolicy(fuzzyGroup);
          if (sel && sel !== "DIRECT" && sel !== "REJECT") {
            nodeName = sel;
          }
        } catch (e) {}
      }
    }
  }

  // 3. 若仍未匹配，过滤掉辅助策略组后取首个策略组尝试
  if (!nodeName || nodeName === "DIRECT" || nodeName === "REJECT") {
    const filtered = groups.filter(function (g) {
      return !/^(DIRECT|REJECT|广告|去广告|国内)/i.test(g);
    });
    const fallbackGroup = filtered.length > 0 ? filtered[0] : groups[0];
    if (fallbackGroup) {
      try {
        const sel = $config.getSelectedPolicy(fallbackGroup);
        if (sel) nodeName = sel;
      } catch (e) {}
    }
  }

  // 4. 递归解析策略组（支持策略组嵌套，最多4层）
  if (nodeName && groups.includes(nodeName)) {
    let current = nodeName;
    const visited = {};
    for (let step = 0; step < 4; step++) {
      if (visited[current]) break;
      visited[current] = true;
      try {
        const deeper = $config.getSelectedPolicy(current);
        if (!deeper || deeper === current) break;
        current = deeper;
        if (!groups.includes(current)) {
          break;
        }
      } catch (e) {
        break;
      }
    }
    nodeName = current;
  }

  return nodeName || cfg.global_proxy || cfg.final || "当前代理节点";
}

function probeOutboundIp(callback) {
  if (typeof $httpClient === "undefined" || typeof $httpClient.get !== "function") {
    callback({ ip: "--", loc: "未知归属", isp: "--", latencyMs: null });
    return;
  }

  const probeUrl = "http://ip-api.com/json/?fields=status,country,regionName,city,isp,query&lang=zh-CN";
  const probeStart = Date.now();

  $httpClient.get(
    {
      url: probeUrl,
      timeout: IP_PROBE_TIMEOUT_MS,
      headers: { "User-Agent": "LoonMonitor/1.4" },
    },
    function (err, resp, data) {
      if (!err && data) {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.status === "success") {
            const rtt = Date.now() - probeStart;
            const ip = parsed.query || "--";
            const parts = [parsed.country, parsed.city || parsed.regionName].filter(Boolean);
            const loc = parts.join(" · ") || "未知归属";
            const isp = parsed.isp || "--";
            const res = { ip: ip, loc: loc, isp: isp, latencyMs: rtt };
            storeWrite(
              JSON.stringify({
                ip: ip,
                location: loc,
                isp: isp,
                latencyMs: rtt,
                timestamp: Date.now(),
              }),
              IP_CACHE_KEY
            );
            callback(res);
            return;
          }
        } catch (e) {
          log("解析出口 IP 失败: " + (e && e.message ? e.message : e));
        }
      }

      // 主源失败时写入短期兜底缓存（60秒），防止小组件连续刷新频繁卡死
      storeWrite(
        JSON.stringify({
          ip: "--",
          location: "未知归属",
          isp: "--",
          latencyMs: null,
          timestamp: Date.now(),
        }),
        IP_CACHE_KEY
      );
      callback({ ip: "--", loc: "未知归属", isp: "--", latencyMs: null });
    }
  );
}

// ── 小组件数据服务 ─────────────────────────────────────────────
function serveMonitorData() {
  let subData = readJson(SUB_CACHE_KEY);
  const subUrl = getSubUrl();

  let uploadBytes = subData ? Number(subData.upload) || 0 : 0;
  let downloadBytes = subData ? Number(subData.download) || 0 : 0;
  let totalBytes = subData ? Number(subData.total) || 0 : 0;

  let resetDaysText = subData ? "长期有效" : "待刷新订阅同步";
  if (subData && Number(subData.expire) > 0) {
    const raw = Number(subData.expire);
    const expMs = raw > 10000000000 ? raw : raw * 1000;
    const diffDays = Math.ceil((expMs - Date.now()) / 86400000);
    resetDaysText = diffDays > 0 ? diffDays + " 天后重置" : "已到期";
  }

  // 运行模式与策略组：直接读 Loon 当前配置，拿不到就退回默认文案
  let runningMode = "规则分流";
  let runningModel = 1;
  let policyGroupCount = 0;
  let finalPolicy = "";
  let globalProxy = "";
  let cfg = null;
  try {
    if (typeof $config !== "undefined" && typeof $config.getConfig === "function") {
      cfg = JSON.parse($config.getConfig());
      const model = Number(cfg.running_model);
      if (model === 0) {
        runningMode = "全局直连";
        runningModel = 0;
      } else if (model === 2) {
        runningMode = "全局代理";
        runningModel = 2;
      } else {
        runningMode = "规则分流";
        runningModel = 1;
      }
      if (Array.isArray(cfg.all_policy_groups)) policyGroupCount = cfg.all_policy_groups.length;
      finalPolicy = cfg.final || "";
      globalProxy = cfg.global_proxy || "";
    }
  } catch (e) {
    log("读取 Loon 配置失败: " + (e && e.message ? e.message : e));
  }

  const nodeName = resolveNodeName(cfg);

  function reply(ip, loc, isp, latencyMs) {
    const payload = {
      status: "running",
      runningMode: runningMode,
      running_model: runningModel,
      runningModel: runningModel,
      policyGroupCount: policyGroupCount,
      policy_groups_count: policyGroupCount,
      finalPolicy: finalPolicy,
      nodeName: nodeName,
      vpnIp: ip || "--",
      vpnLocation: loc || "未知归属",
      isp: isp || "--",
      upload: uploadBytes,
      download: downloadBytes,
      total: totalBytes,
      uploadBytes: uploadBytes,
      downloadBytes: downloadBytes,
      totalBytes: totalBytes,
      hasTrafficData: subData !== null,
      resetDaysText: resetDaysText,
      updatedAt: new Date().toISOString(),
    };
    if (typeof latencyMs === "number" && latencyMs >= 0) {
      payload.delay = latencyMs;
      payload.delayMs = latencyMs;
    }

    $done({
      response: {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(payload),
      },
    });
  }

  // 检查 IP 缓存
  const cachedIp = readJson(IP_CACHE_KEY);
  const now = Date.now();
  const ipAge = cachedIp && cachedIp.timestamp ? now - Number(cachedIp.timestamp) : Infinity;
  const hasValidIpCache = cachedIp && cachedIp.ip && ipAge < IP_CACHE_TTL_MS;
  const hasStaleIpCache = cachedIp && cachedIp.ip && cachedIp.ip !== "--" && ipAge < IP_CACHE_STALE_MS;

  // 检查订阅缓存是否缺失且有订阅链接可供拉取
  const needFetchSub = !subData && Boolean(subUrl);

  // 极速路径 1：IP 缓存新鲜且无需拉取订阅，0ms 秒级回复
  if (hasValidIpCache && !needFetchSub) {
    reply(cachedIp.ip, cachedIp.location, cachedIp.isp, cachedIp.latencyMs);
    return;
  }

  // 极速路径 2：IP 缓存陈旧（1小时内）且无需拉取订阅，秒级回复避免小组件超时
  if (hasStaleIpCache && !needFetchSub) {
    reply(cachedIp.ip, cachedIp.location, cachedIp.isp, cachedIp.latencyMs);
    return;
  }

  // 探测流程（按需并发发起 IP 探测与订阅拉取）
  let ipResult = hasValidIpCache || hasStaleIpCache
    ? { ip: cachedIp.ip, loc: cachedIp.location, isp: cachedIp.isp, latencyMs: cachedIp.latencyMs }
    : null;
  let subResult = subData;

  let ipDone = Boolean(ipResult);
  let subDone = !needFetchSub;
  let finished = false;

  function finish() {
    if (finished) return;
    if (ipDone && subDone) {
      finished = true;
      if (subResult) {
        subData = subResult;
        uploadBytes = Number(subResult.upload) || 0;
        downloadBytes = Number(subResult.download) || 0;
        totalBytes = Number(subResult.total) || 0;
        if (Number(subResult.expire) > 0) {
          const raw = Number(subResult.expire);
          const expMs = raw > 10000000000 ? raw : raw * 1000;
          const diffDays = Math.ceil((expMs - Date.now()) / 86400000);
          resetDaysText = diffDays > 0 ? diffDays + " 天后重置" : "已到期";
        } else {
          resetDaysText = "长期有效";
        }
      }
      const ip = ipResult ? ipResult.ip : "--";
      const loc = ipResult ? ipResult.loc : "未知归属";
      const isp = ipResult ? ipResult.isp : "--";
      const latencyMs = ipResult ? ipResult.latencyMs : null;
      reply(ip, loc, isp, latencyMs);
    }
  }

  if (!ipDone) {
    probeOutboundIp(function (res) {
      ipResult = res;
      ipDone = true;
      finish();
    });
  }

  if (needFetchSub) {
    fetchSubscriptionActive(subUrl, function (res) {
      subResult = res;
      subDone = true;
      finish();
    });
  }

  // 保护性看门狗：即使网络请求由于各种原因挂起，最迟 2.5 秒强行返回
  if (typeof setTimeout === "function") setTimeout(function () {
    if (!finished) {
      ipDone = true;
      subDone = true;
      finish();
    }
  }, IP_PROBE_TIMEOUT_MS);
}

// ── 后台定时同步（Cron 任务调度）──────────────────────────────
function syncInBackground() {
  log("后台定时任务唤醒，开始预热出口 IP 与订阅流量...");
  const subUrl = getSubUrl();
  let subDone = !subUrl;
  let ipDone = false;

  function checkDone() {
    if (subDone && ipDone) {
      log("后台预热同步完成");
      $done({});
    }
  }

  probeOutboundIp(function () {
    ipDone = true;
    checkDone();
  });

  if (subUrl) {
    fetchSubscriptionActive(subUrl, function () {
      subDone = true;
      checkDone();
    });
  }

  if (typeof setTimeout === "function") setTimeout(function () {
    $done({});
  }, 8000);
}

// 上下文判断：http-response 有 $response，http-request 只有 $request
if (typeof $response !== "undefined") {
  captureSubscription();
  $done({});
} else if (typeof $request !== "undefined") {
  serveMonitorData();
} else {
  syncInBackground();
}
