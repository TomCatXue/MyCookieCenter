/*
------------------------------------------
@Description: 番茄小说 · 极简去广告与特权净化 (高性能版)
@Author: TomCatXue
@Version: 2026-10-06.r2
@Date: 2026-10-06 11:35
------------------------------------------
核心功能清单：
  1. VIP 状态与免广告注入：改写 /api/novel/account/v1/vip/info/，激活官方原生免广告特权通道；
  2. 阅读流正文广告清洗：精准剥离章节内嵌 ad_info、chapter_ad、flow_ad 等广告占位，保护正文毫发无损；
  3. 底部导航栏 Tab 纯净化：过滤福利/金币/任务等营销 Tab，恢复书架与书城极简布局；
  4. 静态秒拒与零脚本执行：开屏广告、章末推广、商业化挂件、穿山甲 SDK 广告由 Loon 内核直接秒拒。
*/

const SCRIPT_NAME = "番茄小说·极简去广告";
const SCRIPT_VERSION = "2026-10-06.r2";
var $ = (typeof $ !== "undefined" && $) ? $ : ((typeof Env !== "undefined") ? new Env(SCRIPT_NAME) : { log: console.log });

(function main() {
  if (typeof $response === "undefined" || !$response.body) {
    $done({});
    return;
  }

  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";
  let body = $response.body;
  let modified = false;

  try {
    const data = JSON.parse(body);

    // 1. VIP 状态与免广告特权注入
    if (/\/api\/novel\/account\/v\d\/vip\/info/i.test(url)) {
      if (!data.data || typeof data.data !== "object") {
        data.data = {};
      }
      data.code = 0;
      data.message = "success";
      data.data.is_vip = 1;
      data.data.vip_type = 1;
      data.data.status = 1;
      data.data.expire_time = 4070880000;
      data.data.vip_expire_time = 4070880000;
      data.data.is_ad_free = 1;
      data.data.ad_free = 1;
      data.data.ad_free_expire_time = 4070880000;
      data.data.left_time = 4070880000;
      data.data.is_auto_renew = false;
      data.data.vip_title = "永久尊贵会员";
      data.data.vip_card_left_time = 4070880000;
      data.data.vip_only = true;
      data.data.has_vip = 1;
      data.data.is_svip = 1;
      data.data.svip_expire_time = 4070880000;
      modified = true;
    }

    // 2. 用户基础信息会员标识注入
    else if (/\/reading\/user\/(?:info|basic_info)/i.test(url)) {
      const userTarget = data.data && typeof data.data === "object" ? data.data : data;
      if (userTarget && typeof userTarget === "object") {
        userTarget.is_vip = 1;
        userTarget.vip_type = 1;
        userTarget.ad_free = 1;
        userTarget.is_ad_free = 1;
        userTarget.has_vip = 1;
        userTarget.expire_time = 4070880000;
        modified = true;
      }
    }

    // 3. 阅读器正文流与章节内嵌广告清洗 (保留所有小说文本内容)
    else if (
      /\/reading\/(?:reader\/(?:full|batch_full)|chapter|content|flow)/i.test(url) ||
      /\/api\/novel\/book\/reader\/content/i.test(url)
    ) {
      cleanReaderAds(data);
      modified = true;
    }

    // 4. 底栏 Tab 纯净化 (移除福利、任务标签)
    else if (
      /\/reading\/bookapi\/bookmall\/tab/i.test(url) ||
      /\/openapi\/setting\/tab/i.test(url)
    ) {
      modified = cleanTabBar(data);
    }

    if (modified) {
      $done({ body: JSON.stringify(data) });
      return;
    }

  } catch (err) {
    $.log("[" + SCRIPT_NAME + "] 处理异常: " + (err.message || err));
  }

  $done({});
})();

// 正文广告字段精准清洗 (递归遍历对象，只剔除纯广告键，不触碰文本)
function cleanReaderAds(obj) {
  if (!obj || typeof obj !== "object") return;

  const AD_KEY_REGEX = /^(ad_info|chapter_ad|flow_ad_list|flow_ad|ad_card|ad_unit|ad_style|ad_track|reward_video|insert_ad|banner_ad|page_ad|tips_ad|ad_reward|bottom_ad|ads|ad_list|commercial|promotion|interstitial_ad)$/i;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      cleanReaderAds(obj[i]);
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (AD_KEY_REGEX.test(key)) {
        delete obj[key];
        continue;
      }
      if (key === "need_ad") {
        obj[key] = false;
        continue;
      }
      if (key === "show_ad" || key === "has_ad" || key === "is_ad") {
        obj[key] = 0;
        continue;
      }
      if (obj[key] && typeof obj[key] === "object") {
        cleanReaderAds(obj[key]);
      }
    }
  }
}

// 底部导航栏福利 Tab 过滤
function cleanTabBar(data) {
  if (!data || typeof data !== "object") return false;
  let modified = false;

  const tabsContainer = data.data && data.data.tabs ? data.data.tabs : (data.tabs || data.tab_list);
  if (Array.isArray(tabsContainer)) {
    const originalLen = tabsContainer.length;
    const filtered = tabsContainer.filter(item => {
      if (!item || typeof item !== "object") return true;
      const str = JSON.stringify(item).toLowerCase();
      // 过滤福利、任务、活动、金币相关 Tab
      if (
        str.includes("welfare") ||
        str.includes("luckycat") ||
        str.includes("task_tab") ||
        str.includes("福利") ||
        str.includes("赚钱") ||
        str.includes("金币")
      ) {
        return false;
      }
      return true;
    });

    if (filtered.length !== originalLen) {
      if (data.data && Array.isArray(data.data.tabs)) {
        data.data.tabs = filtered;
      } else if (Array.isArray(data.tabs)) {
        data.tabs = filtered;
      } else if (Array.isArray(data.tab_list)) {
        data.tab_list = filtered;
      }
      modified = true;
    }
  }
  return modified;
}

function Env(name) {
  this.name = name;
  this.log = function() { console.log.apply(console, arguments); };
}
