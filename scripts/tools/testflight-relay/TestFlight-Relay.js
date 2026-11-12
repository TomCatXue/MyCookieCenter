/**
 * TestFlight Relay · Loon 上游跟随加载器
 * 每次运行读取 ScriptingApp/Community-Scripts 的原版 TestFlight-Relay.js，
 * 仅修补 Loon 不兼容的 2 处后执行；作者更新上游后自动生效。
 * 更新：2026-11-11 01:30
 */

const SCRIPT_VERSION = "2026-11-11.r2";
const UPSTREAM_URL =
  "https://raw.githubusercontent.com/ScriptingApp/Community-Scripts/refs/heads/main/module/scripts/TestFlight-Relay.js";
const CACHE_KEY = "tf.relay.loon.upstream.v1";
const CACHE_TTL = 60 * 60 * 1000;
const FETCH_TIMEOUT = 12000;
const REQUEST_FLAG = "__tfHasRequest";

const log = message => console.log("[TF-Relay loader] " + message);

const storage = {
  read: key =>
    (globalThis.$prefs?.valueForKey ?? $persistentStore.read)(key),
  write: (key, value) =>
    (globalThis.$prefs?.setValueForKey ?? $persistentStore.write)(value, key),
};

const readCache = () => {
  try {
    const raw = storage.read(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (
      !cache ||
      cache.upstream !== UPSTREAM_URL ||
      cache.version !== SCRIPT_VERSION ||
      typeof cache.source !== "string" ||
      !Number.isFinite(cache.fetchedAt)
    )
      return null;
    return cache;
  } catch {
    return null;
  }
};

const writeCache = source => {
  try {
    return storage.write(
      CACHE_KEY,
      JSON.stringify({
        upstream: UPSTREAM_URL,
        version: SCRIPT_VERSION,
        fetchedAt: Date.now(),
        source,
      })
    );
  } catch {
    return false;
  }
};

const fetchUpstream = () =>
  new Promise((resolve, reject) => {
    if (typeof globalThis.$httpClient?.get !== "function") {
      reject(new Error("Loon $httpClient unavailable"));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("upstream fetch timeout"));
    }, FETCH_TIMEOUT);
    try {
      $httpClient.get(
        {
          url: UPSTREAM_URL + "?t=" + Date.now(),
          headers: { "Cache-Control": "no-cache" },
          timeout: FETCH_TIMEOUT,
          "auto-redirect": true,
          "auto-cookie": false,
        },
        (error, response, body) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) return reject(new Error("upstream request failed"));
          const status = response?.status ?? response?.statusCode;
          if (
            status !== 200 ||
            typeof body !== "string" ||
            !/testflight/i.test(body)
          )
            return reject(new Error("upstream HTTP " + (status ?? "unknown")));
          resolve(body);
        }
      );
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });

const patchUpstream = source => {
  let patched = source;
  if (!new RegExp("(?:const|let|var)\\s+" + REQUEST_FLAG + "\\b").test(patched))
    patched =
      "const " +
      REQUEST_FLAG +
      ' = typeof $request !== "undefined" && !!$request;\n' +
      patched;
  patched = patched.replace(/this\.\$request/g, REQUEST_FLAG);
  patched = patched.replace(
    /if\s*\(\s*!globalThis\.\$task\s*\)\s*return request;/g,
    "if (!globalThis.$task && !globalThis.$httpClient) return request;"
  );
  return patched;
};

const errorResponse = message => ({
  status: 502,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify({
    messages: [{ messageType: "ERROR", code: 900100, message }],
  }),
});

const evaluate = (source, isRequest) => {
  let finished = false;
  const finish = globalThis.$done?.bind(globalThis);
  const wrapped = result => {
    if (finished) return;
    finished = true;
    try {
      finish?.(result);
    } catch {
      log("done callback failed");
    }
  };
  try {
    globalThis.$done = wrapped;
  } catch {}
  try {
    (0, eval)(source);
  } catch (error) {
    log("eval failed: " + (error?.message || error));
    if (finished) return;
    finished = true;
    try {
      finish?.(isRequest ? errorResponse("上游脚本执行失败，请稍后重试") : undefined);
    } catch {}
  }
};

const main = async () => {
  const isRequest = typeof $request !== "undefined" && !!$request;
  const cache = readCache();
  const fresh = cache && Date.now() - cache.fetchedAt < CACHE_TTL;
  let source = null;
  let changed = false;

  if (!isRequest) log("v" + SCRIPT_VERSION + " refresh");

  if (fresh) {
    source = cache.source;
  } else {
    try {
      const upstream = await fetchUpstream();
      source = patchUpstream(upstream);
      if (
        source.includes("this.$request") ||
        /if\s*\(\s*!globalThis\.\$task\s*\)\s*return request;/.test(source)
      )
        log("warning: upstream patch pattern changed");
      changed = !cache || cache.source !== source;
      writeCache(source);
      if (changed)
        log("upstream refreshed (" + source.length + " bytes)");
    } catch (error) {
      log("refresh failed: " + (error?.message || error));
      if (cache?.source) {
        source = cache.source;
        log("using stale cache");
      }
    }
  }

  if (!source) throw new Error("no upstream script available");
  evaluate(source, isRequest);
};

main().catch(error => {
  log("fatal: " + (error?.message || error));
  try {
    if (typeof $request !== "undefined" && $request)
      $done({
        response: errorResponse("TestFlight 中转脚本暂不可用，请稍后重试"),
      });
    else $done();
  } catch {}
});
