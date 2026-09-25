/*
------------------------------------------
@Description: 微信读书 · 防强更与去广告精简净化
@Author: TomCatXue
@Version: 3.7.0
@Date: 2026-09-25 15:40
------------------------------------------
功能：
  1. 深度拦截 i.weread.qq.com 与 weread.qq.com 下的 feature、config、reconf、upgrade、mobileSync 等接口
  2. 采用通用正则递归深度遍历算法，清空与消除所有 upgrade、forceUpdate、notice、updateInfo 等强更弹窗字段
  3. 彻底屏蔽 8.2.6 等老版本微信读书的“发现新版本”弹窗、版本强更公告与青少年弹窗，锁定老版本免费 AI 听书
  4. 精简阅读界面，去除阅读统计/在读人数/读完人数（book/readingStat）、章节评论分享数字（book/chapterReview）、读者圈子入口（groups/readerEntrance）
  5. 清理底部红点、发现页红点、故事流更新与通知计数（mobileSync）
  6. 净化点评与想法列表（review/list）、过滤发现页营销卡片与推荐流广告（discoverfeed/new, discoverfeed/get）
  7. 净化个人主页勋章与兑换提示（user/profile）
  8. 全链路兼容明文 JSON 与 Base64 编码响应，保障请求与解析高健壮性
*/

const SCRIPT_NAME = "微信读书·防强更去广告";
const SCRIPT_VERSION = "3.7.0";
const $ = new Env(SCRIPT_NAME);

function b64encode(str) {
  if (typeof $base64 !== "undefined" && $base64.encode) return $base64.encode(str);
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64");
  } catch (e) {}
  try {
    if (typeof btoa !== "undefined") return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
  } catch (e) {}
  return str;
}

function b64decode(str) {
  if (!str) return str;
  try {
    if (typeof $base64 !== "undefined" && $base64.decode) return $base64.decode(str);
  } catch (e) {}
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8");
  } catch (e) {}
  try {
    if (typeof atob !== "undefined") return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  } catch (e) {}
  return str;
}

// 递归深度全量净化函数（消除版本升级、强更弹窗、公告提示）
function deepSanitize(target) {
  if (!target || typeof target !== 'object') return false;
  let modified = false;

  const UPGRADE_FLAG_REG = /^(upgrade|force_?upgrade|force_?update|has_?new_?version|need_?upgrade|show_?update|show_?upgrade|is_?upgrade)/i;
  const NOTICE_TEXT_REG = /(notice|update_?tips|upgrade_?desc|version_?desc|update_?msg)/i;
  const REMOVE_OBJ_REG = /(upgrade_?info|update_?info|new_?version|version_?dialog|update_?dialog|notice_?dialog|popup|announcement)/i;

  function traverse(obj) {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
      const val = obj[key];

      // 1. 如果是弹窗对象或升级详情结构，直接彻底删除
      if (REMOVE_OBJ_REG.test(key)) {
        delete obj[key];
        modified = true;
        continue;
      }

      // 2. 如果是升级状态标志位，强制置 0 / false
      if (UPGRADE_FLAG_REG.test(key)) {
        if (typeof val === 'boolean') obj[key] = false;
        else obj[key] = 0;
        modified = true;
      }

      // 3. 如果是通知/提示文案，置空
      if (NOTICE_TEXT_REG.test(key)) {
        if (typeof val === 'string') obj[key] = '';
        else if (typeof val === 'number') obj[key] = 0;
        modified = true;
      }

      // 递归子节点
      if (obj[key] && typeof obj[key] === 'object') {
        traverse(obj[key]);
      }
    }
  }

  traverse(target);
  return modified;
}

(function main() {
  $.log(`[${SCRIPT_NAME}] 启动处理... version=${SCRIPT_VERSION}`);

  if (typeof $response === "undefined" || !$response.body) {
    $done({});
    return;
  }

  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";

  try {
    const rawBody = $response.body;
    let data = null;
    let isBase64 = false;

    // 1. 尝试解析为 JSON (支持明文与 Base64)
    try {
      data = JSON.parse(rawBody);
    } catch (e) {
      try {
        const decoded = b64decode(rawBody);
        data = JSON.parse(decoded);
        isBase64 = true;
      } catch (e2) {}
    }

    // 针对构造纯净响应的特定只读接口（如 readingstat / chapterReview / readerEntrance / review/list）
    // 即使原始报文为空或解析非对象，也应当正常返回纯净 mock 结构
    if (/\/book\/reading[sS]tat/i.test(url)) {
      const cleanResp = {
        friendFinishReadingCount: 0,
        mixReadingUsers: [],
        friendReadingCount: 0,
        friendNotFollowingCount: 0,
        readingUsers: [],
        recommendUsers: [],
        isReading: 0,
        readingCount: 0,
        finishReadingCount: 0,
        todayReadingCount: 0,
        markedStatus: 1
      };
      const newBody = isBase64 ? b64encode(JSON.stringify(cleanResp)) : JSON.stringify(cleanResp);
      $.log(`[${SCRIPT_NAME}] 成功净化阅读在读人数与统计: ${url.slice(0, 60)}`);
      $done({ body: newBody });
      return;
    }

    if (/\/book\/chapterReview/i.test(url)) {
      const cleanResp = { synckey: 0, shareCount: 0 };
      const newBody = isBase64 ? b64encode(JSON.stringify(cleanResp)) : JSON.stringify(cleanResp);
      $.log(`[${SCRIPT_NAME}] 成功净化章节评论与分享数字: ${url.slice(0, 60)}`);
      $done({ body: newBody });
      return;
    }

    if (/\/groups\/readerEntrance/i.test(url)) {
      const cleanResp = { synckey: Math.floor(Date.now() / 1000), hasGroup: 0 };
      const newBody = isBase64 ? b64encode(JSON.stringify(cleanResp)) : JSON.stringify(cleanResp);
      $.log(`[${SCRIPT_NAME}] 成功去除阅读页面读者圈子入口: ${url.slice(0, 60)}`);
      $done({ body: newBody });
      return;
    }

    if (/\/review\/list/i.test(url)) {
      const cleanResp = {
        refUsers: [],
        hasMore: 0,
        totalCount: 0,
        removed: [],
        columns: [],
        atUsers: [],
        reviews: []
      };
      const newBody = isBase64 ? b64encode(JSON.stringify(cleanResp)) : JSON.stringify(cleanResp);
      $.log(`[${SCRIPT_NAME}] 成功清空想法与点评干扰列表: ${url.slice(0, 60)}`);
      $done({ body: newBody });
      return;
    }

    if (!data || typeof data !== "object") {
      $done({});
      return;
    }

    let modified = false;

    // 2. 发现页信息流精简与广告过滤 (discoverfeed/new, discoverfeed/get)
    if (/\/discoverfeed\/new/i.test(url)) {
      if (Array.isArray(data.data)) {
        data.data = data.data.filter(item => item && item.type !== 2);
        modified = true;
      }
    } else if (/\/discoverfeed\/get/i.test(url)) {
      if (Array.isArray(data.removed)) {
        data.removed.push("63", "dailybooklist");
        data.updated = 1;
        modified = true;
      }
      if (Array.isArray(data.updatedNewRawItemIds)) {
        data.updatedNewRawItemIds = data.updatedNewRawItemIds.filter(item => item === "26");
        modified = true;
      }
      if (Array.isArray(data.items)) {
        data.items = data.items.filter(item => item && item.rawItemId === 26);
        modified = true;
      }
    }

    // 3. 用户个人主页净化 (user/profile) 去勋章与未读红点
    if (/\/user\/profile/i.test(url)) {
      data.showMedal = 0;
      data.showReview = 0;
      data.canExchangeDay = 0;
      data.exchangeMsg = "";
      modified = true;
    }

    // 4. 移动端同步接口净化 (mobileSync) 去除红点、发现页红点、通知计数
    if (/\/mobileSync/i.test(url)) {
      data.discover = false;
      data.discoverFeed = 0;
      data.browseUpdate = 0;
      data.notifCount = 0;
      data.storyfeed = 0;
      data.storyfeedUpdated = 0;
      data.readingExchange = 0;
      data.friendReviewUpdate = 0;
      modified = true;
    }

    // 5. 深度遍历全量净化（抹除升级标志、弹窗与公告）
    if (deepSanitize(data)) {
      modified = true;
    }

    // 6. 针对 feature 和 configsets 配置节点做强效锁定与消隐（针对 8.2.6 AI听书与防强更）
    const targetConfigs = [data.feature, data.configsets].filter(o => o && typeof o === "object");
    for (const cfg of targetConfigs) {
      cfg.VIPRightTimerSeconds = 8640000;
      cfg.disableUpgrade = 1;
      cfg.closeUpgrade = 1;
      cfg.upgrade = 0;
      cfg.upgrade_query_interval = 0;
      cfg.upgrade_seconds_to_notify = 0;
      cfg.notice_type = 0;
      cfg.notice_interval = 0;
      cfg.notice_title = "";
      cfg.notice_msg = "";
    }
    if (targetConfigs.length > 0) {
      modified = true;
    }

    if (modified) {
      const newBody = isBase64 ? b64encode(JSON.stringify(data)) : JSON.stringify(data);
      $.log(`[${SCRIPT_NAME}] 成功拦截改写响应体: ${url.slice(0, 60)}`);
      $done({ body: newBody });
      return;
    }

  } catch (err) {
    $.log(`[${SCRIPT_NAME}] 净化处理异常: ${err.message || err}`);
  }

  $done({});
})();

function Env(name) {
  this.name = name;
  this.log = function() { console.log.apply(console, arguments); };
}
