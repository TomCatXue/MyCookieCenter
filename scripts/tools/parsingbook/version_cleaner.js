// SCRIPT_VERSION = "2026-09-27.r1"
/**
 * 用心读书 · 版本更新屏蔽与体验优化脚本
 * 用于拦截 /app/get.version.ios，将 forces 设为 0，消除强制更新阻断弹窗
 */

// 预先使用 2.7.1 固定密钥 (Key: "Bk$Lp9xWq3Nfz7R.", IV: "5501886741239082") 加密的 Payload:
// 明文: {"forces":0,"versionCode":7,"versionName":"2.7.1","content":"","downloadUrl":""}
const CLEAN_VERSION_CIPHER = "AVbUppDsnC96gp8SolftlKMWJi2eRHYXIdwgh3GNxdYcAbPIFSCMN0si1BYWzcj3KPv1jLeAmBUMMUavZUfApdsASvfoZBMrjw+V/PUgzN8D8fgF+yK4lncZWN+d3HIW";

if (typeof $response !== "undefined") {
  $done({
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: CLEAN_VERSION_CIPHER
  });
} else if (typeof $request !== "undefined") {
  $done({
    response: {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: CLEAN_VERSION_CIPHER
    }
  });
} else {
  $done({});
}
