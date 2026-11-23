/**
 * 多邻国 Duolingo 关卡直通（Loon 响应脚本）
 *
 * 做法：把 /sessions 响应里的题目池清空，客户端加载到空关卡即判定通过。
 * 已知有副作用，默认关闭，由插件的 instant_clear 开关控制。
 *
 * 刻意跳过的关卡类型（清空后会卡死或无法结算）：
 *   SIDE_QUEST_RAMP_UP_PRACTICE、MATCH_PRACTICE
 */

const SCRIPT_VERSION = '2.1.1';

/** 这些关卡类型的题目池不能清空 */
const SKIP_TYPES = ['SIDE_QUEST_RAMP_UP_PRACTICE', 'MATCH_PRACTICE'];

/** 可清空的题目池字段 */
const CHALLENGE_POOLS = [
  'challenges',
  'adaptiveChallenges',
  'adaptiveInterleavedChallenges',
  'mistakesReplacementChallenges',
];

try {
  if (typeof $response === 'undefined' || !$response || !$response.body) {
    $done({});
  } else {
    const payload = JSON.parse($response.body);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      $done({});
    } else {
      let changed = false;

      if (!payload.type || SKIP_TYPES.indexOf(payload.type) === -1) {
        CHALLENGE_POOLS.forEach((pool) => {
          if (Array.isArray(payload[pool]) && payload[pool].length > 0) {
            payload[pool] = [];
            changed = true;
          }
        });
      }

      // stories 类响应没有题目池，靠 elements 承载内容
      if (Array.isArray(payload.elements) && payload.elements.length > 0) {
        payload.elements = [];
        changed = true;
      }

      if (changed) {
        $done({ body: JSON.stringify(payload) });
      } else {
        $done({});
      }
    }
  }
} catch (error) {
  $done({});
}
