/**
 * LoonMonitor · 小组件数据提供与状态服务
 *
 * 本脚本只提供 Loon 运行状态：运行模式、策略组、当前节点、出口 IP 与延迟。
 * 机场订阅流量由哑巴面板直接请求用户填写的订阅链接；换机场无需修改本脚本。
 *
 * 注意：Loon 的 $httpClient timeout 单位是毫秒（官方文档）。
 *
 * @Author: TomCatXue
 * @Updated: 2026-10-18
 */

const IP_CACHE_KEY = "loon_monitor_ip_info";
const IP_CACHE_TTL_MS = 5 * 60 * 1000;
const IP_CACHE_STALE_MS = 60 * 60 * 1000;
const IP_PROBE_TIMEOUT_MS = 2500;
const WATCHDOG_TIMEOUT_MS = 4500;

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

function resolveNodeName(cfg, runningModel) {
  if (runningModel === 0) {
    return "全局直连";
  }
  if (!cfg) return "当前代理节点";

  const model =
    runningModel != null
      ? runningModel
      : Number(cfg.running_model != null ? cfg.running_model : cfg.runningModel);
  if (model === 0) {
    return "全局直连";
  }
  if (model === 2 && cfg.global_proxy) {
    return cfg.global_proxy;
  }

  // 0. 优先尝试从 Loon 的 policy_select 映射直接读取
  if (cfg.policy_select && typeof cfg.policy_select === "object") {
    if (cfg.final && cfg.policy_select[cfg.final]) {
      const p = cfg.policy_select[cfg.final];
      if (p && p !== "DIRECT" && p !== "REJECT") return p;
    }
    const candidates = [
      "节点选择", "Proxy", "PROXY", "Proxies", "PROXIES", "代理节点",
      "主力节点", "节点", "Select", "SELECT", "Auto", "AUTO",
    ];
    for (let i = 0; i < candidates.length; i++) {
      if (cfg.policy_select[candidates[i]]) {
        const p = cfg.policy_select[candidates[i]];
        if (p && p !== "DIRECT" && p !== "REJECT") return p;
      }
    }
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

function probeOutboundIp(runningModel, callback) {
  if (typeof runningModel === "function") {
    callback = runningModel;
    runningModel = 1;
  }
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
                runningModel: runningModel,
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
  // 运行模式与策略组：直接读 Loon 当前配置，拿不到就退回默认文案
  let runningMode = "规则分流";
  let runningModel = 1;
  let policyGroupCount = 0;
  let finalPolicy = "";
  let globalProxy = "";
  let cfg = null;
  try {
    if (typeof $config !== "undefined" && typeof $config.getConfig === "function") {
      const rawCfg = $config.getConfig();
      cfg = typeof rawCfg === "string" ? JSON.parse(rawCfg) : rawCfg;

      let model = -1;
      if (cfg) {
        if (cfg.running_model != null) model = Number(cfg.running_model);
        else if (cfg.runningModel != null) model = Number(cfg.runningModel);
        else if (cfg.flowmodel === "direct" || cfg.mode === "direct") model = 0;
        else if (cfg.flowmodel === "proxy" || cfg.mode === "proxy") model = 2;
        else if (cfg.flowmodel === "filter" || cfg.mode === "filter") model = 1;
      }

      if (model === 0 || /direct|直连/i.test(String((cfg && (cfg.mode || cfg.flowmodel)) || ""))) {
        runningMode = "全局直连";
        runningModel = 0;
      } else if (model === 2 || /proxy|全局代理/i.test(String((cfg && (cfg.mode || cfg.flowmodel)) || ""))) {
        runningMode = "全局代理";
        runningModel = 2;
      } else {
        runningMode = "规则分流";
        runningModel = 1;
      }

      if (cfg && Array.isArray(cfg.all_policy_groups)) policyGroupCount = cfg.all_policy_groups.length;
      finalPolicy = (cfg && cfg.final) || "";
      globalProxy = (cfg && cfg.global_proxy) || "";
    }
  } catch (e) {
    log("读取 Loon 配置失败: " + (e && e.message ? e.message : e));
  }

  const nodeName = resolveNodeName(cfg, runningModel);

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
      vpnLocation: loc || (runningModel === 0 ? "直连网络" : "未知归属"),
      isp: isp || "--",
      scriptVersion: "v1.5.0",
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

  // 极速路径 0：全局直连模式下直接秒回（避免海外探针在直连下超时挂起）
  if (runningModel === 0) {
    reply("直连网络", "本地直连", "国内网络", 1);
    return;
  }

  // 检查 IP 缓存
  const cachedIp = readJson(IP_CACHE_KEY);
  const now = Date.now();
  const ipAge = cachedIp && cachedIp.timestamp ? now - Number(cachedIp.timestamp) : Infinity;
  // 模式切换（如分流切直连）时立即废弃旧模式 IP 缓存，重新探测真实出口
  const sameMode = cachedIp && cachedIp.runningModel === runningModel;
  const hasValidIpCache = sameMode && cachedIp.ip && ipAge < IP_CACHE_TTL_MS;
  const hasStaleIpCache = sameMode && cachedIp.ip && cachedIp.ip !== "--" && ipAge < IP_CACHE_STALE_MS;

  // 极速路径 1：IP 缓存新鲜，0ms 秒级回复
  if (hasValidIpCache) {
    reply(cachedIp.ip, cachedIp.location, cachedIp.isp, cachedIp.latencyMs);
    return;
  }

  // 极速路径 2：IP 缓存陈旧（1小时内），秒级回复避免小组件超时
  if (hasStaleIpCache) {
    reply(cachedIp.ip, cachedIp.location, cachedIp.isp, cachedIp.latencyMs);
    return;
  }

  // 探测流程
  let ipResult = hasValidIpCache || hasStaleIpCache
    ? { ip: cachedIp.ip, loc: cachedIp.location, isp: cachedIp.isp, latencyMs: cachedIp.latencyMs }
    : null;
  let ipDone = Boolean(ipResult);
  let finished = false;

  function finish() {
    if (finished) return;
    if (ipDone) {
      finished = true;
      const ip = ipResult ? ipResult.ip : "--";
      const loc = ipResult ? ipResult.loc : "未知归属";
      const isp = ipResult ? ipResult.isp : "--";
      const latencyMs = ipResult ? ipResult.latencyMs : null;
      reply(ip, loc, isp, latencyMs);
    }
  }

  if (!ipDone) {
    probeOutboundIp(runningModel, function (res) {
      ipResult = res;
      ipDone = true;
      finish();
    });
  }

  // 保护性看门狗：即使网络请求挂起，也按超时返回
  if (typeof setTimeout === "function") setTimeout(function () {
    if (!finished) {
      ipDone = true;
      finish();
    }
  }, WATCHDOG_TIMEOUT_MS);
}

// ── 后台定时同步（Cron 任务调度）──────────────────────────────
function syncInBackground() {
  log("后台定时任务唤醒，开始预热出口 IP...");
  let ipDone = false;

  function checkDone() {
    if (ipDone) {
      log("后台预热同步完成");
      $done({});
    }
  }

  probeOutboundIp(function () {
    ipDone = true;
    checkDone();
  });

  if (typeof setTimeout === "function") setTimeout(function () {
    $done({});
  }, 8000);
}

// 上下文判断：本地状态接口是 http-request，cron 则没有 $request。
if (typeof $request !== "undefined") {
  serveMonitorData();
} else {
  syncInBackground();
}
