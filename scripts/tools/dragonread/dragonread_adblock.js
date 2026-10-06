/*
------------------------------------------
@Description: 番茄小说 · 极简去广告与特权净化 (高性能版)
@Author: TomCatXue
@Version: 2026-10-06.r5
@Date: 2026-10-06 13:10
------------------------------------------
核心功能清单：
  1. 穿山甲 / 广告联盟 SDK 控频截断：伪造官方 status_code: 20001 (填充率限制)，使 SDK 彻底停止广告请求与重试；
  2. 全场景 VIP 状态与免广告特权注入：全方位改写 VIP Info、用户资料、个人中心与特权卡片模型 (SSMyUser / SSVipProfileShow)，激活官方免广告与会员徽章；
  3. 阅读流正文广告清洗：精准剥离章节内嵌 ad_info、chapter_ad、flow_ad 等广告占位，保护正文毫发无损；
  4. 底部导航栏 Tab 纯净化与缓存注销：过滤福利/金币/任务等营销 Tab，响应空协议注销客户端本地 welfareTabInfos 缓存，彻底移除底栏福利标签；
  5. 静态秒拒与零脚本执行：开屏广告、章末推广、商业化挂件、穿山甲 SDK 广告由 Loon 内核直接秒拒。
*/

const SCRIPT_NAME = "番茄小说·极简去广告";
const SCRIPT_VERSION = "2026-10-06.r5";
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

    // 0. 穿山甲 / 广告联盟 SDK 官方控频状态伪造 (status_code: 20001, reason: 112 彻底关闭广告位)
    if (
      url.includes("/api/ad/union/sdk/get_ads") ||
      (url.includes("pangolin-sdk-toutiao") && url.includes("/api/ad/"))
    ) {
      const mockAdObj = {
        request_id: (data && data.request_id) ? data.request_id : "F5617E54-3FF4-4052-9B09-4227D09B5105",
        status_code: 20001,
        reason: 112,
        desc: "该代码位请求量过大且消耗过低，因此填充率控制在10%以内，该策略每日生效，如果当天该代码位的消耗上涨或请求量小于5000，则次日不会命中该策略"
      };
      $done({ body: JSON.stringify(mockAdObj) });
      return;
    }

    // 1. VIP 状态、会员中心与个人资料全景特权注入 (覆盖 SSMyUser / SSVipProfileShow / BDNovelVipCenter)
    if (
      /\/api\/novel\/(?:account\/v\d\/vip\/info|trade\/vip)/i.test(url) ||
      /\/reading\/user\/(?:info|profile|basic_info)/i.test(url) ||
      /\/usercenter\//i.test(url) ||
      /\/aweme\/v1\/user\/profile\/self/i.test(url)
    ) {
      injectVip(data);
      modified = true;
    }

    // 2. 阅读器正文流与章节内嵌广告清洗 (保留所有小说文本内容)
    else if (
      /\/reading\/(?:reader\/(?:full|batch_full)|chapter|content|flow)/i.test(url) ||
      /\/api\/novel\/book\/reader\/content/i.test(url)
    ) {
      cleanReaderAds(data);
      modified = true;
    }

    // 3. 底栏 Tab 纯净化 (移除福利、任务标签)
    else if (
      /\/reading\/bookapi\/(?:bookmall\/tab|my_tab)/i.test(url) ||
      /\/reading\/bookmall_stream\/tab/i.test(url) ||
      /\/openapi\/setting\/tab/i.test(url) ||
      /\/v\d\/tab\//i.test(url)
    ) {
      modified = cleanTabBar(data);
    }

    // 4. 招财猫与福利活动主动注销 (返回 code:0 与空数组，促使客户端清空 welfareTabInfosCacheKey)
    else if (
      /\/luckycat\//i.test(url) ||
      /\/polaris\/task\/incentive_ad_again_info/i.test(url)
    ) {
      const emptyLuckCat = {
        code: 0,
        message: "success",
        data: {
          tabs: [],
          tab_list: [],
          welfare_tab_infos: [],
          user_tabs: [],
          is_show_tab: 0,
          show_welfare_tab: false,
          should_show_welfare_tab: false,
          has_tab: false,
          task_status: 0,
          tasks: [],
          reward_list: []
        }
      };
      $done({ body: JSON.stringify(emptyLuckCat) });
      return;
    }

    // 5. 商业化广告兜底置空
    else if (/\/reading\/commerceapi\//i.test(url)) {
      if (data && typeof data === "object") {
        data.data = {};
        data.code = 0;
        data.message = "success";
        modified = true;
      }
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

// 全面注入 VIP 会员与免广告属性 (适配 SSMyUserViewVipView / SSVipProfileShow / BDNovelVipCenter)
function injectVip(data) {
  if (!data || typeof data !== "object") return;
  data.code = 0;
  data.message = "success";

  const target = (data.data && typeof data.data === "object") ? data.data : data;

  const vipInfoObj = {
    is_vip: 1,
    vip_type: 1,
    status: 1,
    expire_time: 4070880000,
    vip_expire_time: 4070880000,
    is_ad_free: 1,
    ad_free: 1,
    free_ad: 1,
    free_left: 4070880000,
    is_ad_vip: 1,
    is_svip: 1,
    svip_expire_time: 4070880000,
    has_vip: 1,
    left_time: 4070880000,
    vip_title: "永久尊贵会员",
    vip_desc: "已开通免广告特权",
    vip_price: "0",
    vip_card_left_time: 4070880000,
    vip_only: true,
    vip_status: 1,
    show_vip: true,
    is_show_vip: 1,
    is_auto_renew: false
  };

  const vipProfileShowObj = {
    show_vip: true,
    is_vip: 1,
    vip_type: 1,
    vip_title: "永久尊贵会员",
    vip_desc: "已开通免广告特权",
    vip_expire_time: 4070880000,
    expire_time: 4070880000,
    vip_status: 1,
    has_vip: 1,
    is_ad_free: 1,
    ad_free: 1,
    free_ad: 1,
    free_left: 4070880000
  };

  Object.assign(target, {
    is_vip: 1,
    vip_type: 1,
    status: 1,
    expire_time: 4070880000,
    vip_expire_time: 4070880000,
    is_ad_free: 1,
    ad_free: 1,
    free_ad: 1,
    free_left: 4070880000,
    is_ad_vip: 1,
    is_svip: 1,
    svip_expire_time: 4070880000,
    has_vip: 1,
    left_time: 4070880000,
    vip_title: "永久尊贵会员",
    vip_desc: "已开通免广告特权",
    vip_price: "0",
    vip_card_left_time: 4070880000,
    vip_only: true,
    vip_status: 1,
    show_vip: true,
    is_show_vip: 1,
    is_ad_vip_available: 1,
    ad_vip_available: true,
    is_auto_renew: false,
    vip_info: vipInfoObj,
    vip_info_list: [vipInfoObj],
    vip_profile_show: vipProfileShowObj,
    vipProfileShow: vipProfileShowObj
  });

  if (target.person_info && typeof target.person_info === "object") {
    Object.assign(target.person_info, vipInfoObj);
  }
}

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

  function filterTabs(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.filter(item => {
      if (!item || typeof item !== "object") return true;
      const str = JSON.stringify(item).toLowerCase();
      if (
        str.includes("welfare") ||
        str.includes("walfare") ||
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
  }

  const container = (data.data && typeof data.data === "object") ? data.data : data;

  for (const key of ["tabs", "tab_list", "bottom_tabs", "tab_configs", "tabs_info"]) {
    if (Array.isArray(container[key])) {
      const orig = container[key].length;
      container[key] = filterTabs(container[key]);
      if (container[key].length !== orig) modified = true;
    }
  }

  container.welfare_tab_infos = [];
  container.user_tabs = [];
  container.is_show_tab = 0;
  container.show_welfare_tab = false;
  container.should_show_welfare_tab = false;
  container.has_tab = false;
  modified = true;

  return modified;
}

function Env(name) {
  this.name = name;
  this.log = function() { console.log.apply(console, arguments); };
}
