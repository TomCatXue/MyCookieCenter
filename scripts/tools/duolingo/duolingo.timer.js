/**
 * 多邻国 Duolingo 限时挑战时长修改（Loon 响应脚本）
 *
 * 拦截 /live-ops-challenges，把每个挑战的初始时长改成插件的 timer_mins。
 * 只改时长字段，其余结构原样透传；参数缺失或非法时不动响应。
 *
 * 注意：脚本不做上限裁剪。想设多少就多少，服务端是否接受由服务端决定 ——
 * 不要在客户端凭空造一个「安全上限」，那只会让人以为改了没生效。
 */

const SCRIPT_VERSION = '2.1.1';
const DEFAULT_MINUTES = 60;

function readMinutes(raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim();
  const parsed = parseInt(text, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MINUTES;
  return parsed;
}

try {
  if (typeof $response === 'undefined' || !$response || !$response.body) {
    $done({});
  } else {
    const rawArgument = typeof $argument !== 'undefined' ? $argument : null;
    const minutes = readMinutes(
      rawArgument && typeof rawArgument === 'object' ? rawArgument.timer_mins : null,
    );
    const seconds = minutes * 60;
    const payload = JSON.parse($response.body);
    let changed = false;

    if (payload && Array.isArray(payload.liveOpsChallenges)) {
      payload.liveOpsChallenges.forEach((challenge) => {
        if (!challenge || typeof challenge !== 'object') return;

        if (challenge.initialTime !== undefined && challenge.initialTime !== seconds) {
          challenge.initialTime = seconds;
          changed = true;
        }
        if (Array.isArray(challenge.initialLevelTimes)) {
          challenge.initialLevelTimes = challenge.initialLevelTimes.map(() => seconds);
          changed = true;
        }
        if (Array.isArray(challenge.initialSessionTimes)) {
          challenge.initialSessionTimes = challenge.initialSessionTimes.map(() => seconds);
          changed = true;
        }
      });
    }

    if (changed) {
      $done({ body: JSON.stringify(payload) });
    } else {
      $done({});
    }
  }
} catch (error) {
  $done({});
}
