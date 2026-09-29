/*
--------------------------------------------------------------------------------
@Name: Pixiv 全局增强翻译 (Pixiverse Enhanced)
@Version: 2.0.0
@Desc: Pixiv 全页面日文深度汉化 · AI 视觉多模态漫翻 · 仿 Biliverse 内置设置中心
@Author: TomCatXue
@Date: 2026-09-28
--------------------------------------------------------------------------------
架构说明：
  1. 全页面 JSON 汉化：拦截 recommended/ranking/detail/comments/user/spotlight 等端点；
  2. 离线字典秒翻：内置 2500+ 高频 Pixiv Tag 映射表，0 网络请求，0ms 极速呈现；
  3. iOS 原生悬浮球：毛玻璃 SF Symbols「文/A」悬浮按钮，支持手势拖拽贴边与长按设置；
  4. AI 视觉多模态漫翻 (HUD Mode A)：识别漫画对白坐标，浮动气泡字幕覆盖，零画质损失与极轻量；
  5. 仿 Biliverse 设置中心：劫持帮助中心直达 PreferencePanes，设置存取同步 Loon $persistentStore。
--------------------------------------------------------------------------------
*/

// prettier-ignore
function Env(t) { return new class { constructor(t) { this.name = t, this.startTime = new Date().getTime(), this.logSeparator = "\n", this.logs = [], this.isMute = !1, this.encoding = "utf-8", this.isNode() ? (this.fs = require("fs"), this.path = require("path"), this.dataFile = this.path.resolve(process.cwd(), "boxjs.json"), this.fs.existsSync(this.dataFile) || this.fs.writeFileSync(this.dataFile, "{}"), this.data = this.loadData()) : this.data = {} } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } isStash() { return "undefined" != typeof $environment && $environment["stash-version"] } loadData() { if (this.isNode()) { try { return JSON.parse(this.fs.readFileSync(this.dataFile)) } catch (e) { return {} } } return {} } getdata(t) { if (this.isSurge() || this.isLoon() || this.isStash()) return $persistentStore.read(t); if (this.isQuanX()) return $prefs.valueForKey(t); if (this.isNode()) return this.data[t] || "" } setdata(t, e) { if (this.isSurge() || this.isLoon() || this.isStash()) return $persistentStore.write(t, e); if (this.isQuanX()) return $prefs.setValueForKey(t, e); if (this.isNode()) return this.data[e] = t, this.fs.writeFileSync(this.dataFile, JSON.stringify(this.data)), !0 } get(t) { return this.send(t, "GET") } post(t) { return this.send(t, "POST") } send(t, e) { return new Promise((s, i) => { if (this.isSurge() || this.isLoon() || this.isStash()) { "GET" === e ? $httpClient.get(t, (t, e, o) => { t ? i(t) : s({ status: e.statusCode, headers: e.headers, body: o }) }) : $httpClient.post(t, (t, e, o) => { t ? i(t) : s({ status: e.statusCode, headers: e.headers, body: o }) }) } else if (this.isQuanX()) { t.method = e, $task.fetch(t).then(t => s({ status: t.statusCode, headers: t.headers, body: t.body }), t => i(t)) } else if (this.isNode()) { const o = require(t.url.startsWith("https:") ? "https" : "http"), r = new URL(t.url), n = { method: e, hostname: r.hostname, port: r.port || (r.protocol === "https:" ? 443 : 80), path: r.pathname + r.search, headers: t.headers || {} }; const req = o.request(n, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => s({ status: res.statusCode, headers: res.headers, body: d })) }); req.on("error", i); if (t.body) req.write(t.body); req.end() } }) } msg(t, e, s) { if (this.isMute) return; if (this.isSurge() || this.isLoon() || this.isStash()) $notification.post(t, e || "", s || ""); else if (this.isQuanX()) $notify(t, e || "", s || ""); else if (this.isNode()) console.log(`\n${t}\n${e || ""}\n${s || ""}`) } log(...t) { this.logs.push(t.join(this.logSeparator)), console.log(t.join(this.logSeparator)) } logErr(t) { this.log(`❌ ${t.message || t}`) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { if (this.isQuanX()) $done(t); else if (this.isSurge() || this.isLoon() || this.isStash()) $done(t) } }(t) }

const $ = new Env("Pixiv 增强翻译");

// ─── 0. 原生设置中心 HTML 模板 (对标 Pix-Scripting) ───
const SETTINGS_HTML = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no\">\n  <title>Pixiv 增强设置</title>\n  <style>\n    :root {\n      --bg-color: #f2f2f7;\n      --card-bg: #ffffff;\n      --card-border: rgba(60, 60, 67, 0.12);\n      --separator-color: rgba(60, 60, 67, 0.12);\n      --text-primary: #000000;\n      --text-secondary: #8e8e93;\n      --tint-blue: #0096fa;\n      --tint-green: #34c759;\n      --tint-orange: #ff9500;\n      --tint-purple: #af52de;\n      --tint-indigo: #5856d6;\n      --tint-cyan: #5ac8fa;\n      --tint-gray: #8e8e93;\n      --switch-bg: #e9e9ea;\n      --badge-bg: rgba(142, 142, 147, 0.12);\n      --badge-text: #8e8e93;\n    }\n\n    @media (prefers-color-scheme: dark) {\n      :root {\n        --bg-color: #000000;\n        --card-bg: #1c1c1e;\n        --card-border: rgba(255, 255, 255, 0.12);\n        --separator-color: rgba(84, 84, 88, 0.35);\n        --text-primary: #ffffff;\n        --text-secondary: #8e8e93;\n        --switch-bg: #39393d;\n        --badge-bg: rgba(255, 255, 255, 0.12);\n        --badge-text: #aeaeb2;\n      }\n    }\n\n    * {\n      box-sizing: border-box;\n      -webkit-tap-highlight-color: transparent;\n      margin: 0;\n      padding: 0;\n    }\n\n    body {\n      background-color: var(--bg-color);\n      color: var(--text-primary);\n      font-family: -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"PingFang SC\", \"Hiragino Sans GB\", sans-serif;\n      padding: calc(env(safe-area-inset-top, 20px) + 16px) 16px calc(env(safe-area-inset-bottom, 20px) + 32px);\n      max-width: 680px;\n      margin: 0 auto;\n      line-height: 1.5;\n      font-size: 16px;\n      overflow-x: hidden;\n    }\n\n    /* ─── 页面大标题头部 (Pix-Scripting 风格) ─── */\n    .brand-header {\n      display: flex;\n      align-items: center;\n      gap: 14px;\n      margin-bottom: 22px;\n      padding: 4px 6px;\n    }\n\n    .brand-icon {\n      width: 52px;\n      height: 52px;\n      border-radius: 13px;\n      background: var(--tint-blue);\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      color: #fff;\n      box-shadow: none;\n      flex-shrink: 0;\n    }\n\n    .brand-title {\n      font-size: 22px;\n      font-weight: 700;\n      letter-spacing: -0.4px;\n      color: var(--text-primary);\n      display: flex;\n      align-items: center;\n      gap: 8px;\n    }\n\n    .brand-badge {\n      font-size: 11px;\n      font-weight: 600;\n      padding: 2px 7px;\n      border-radius: 6px;\n      background: rgba(0, 150, 250, 0.15);\n      color: var(--tint-blue);\n      letter-spacing: 0;\n    }\n\n    .brand-sub {\n      font-size: 13px;\n      color: var(--text-secondary);\n      margin-top: 2px;\n    }\n\n    /* ─── Grouped 卡片容器 ─── */\n    .section-card {\n      background: var(--card-bg);\n      border-radius: 14px;\n      border: 0.5px solid var(--card-border);\n      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);\n      margin-bottom: 6px;\n      overflow: hidden;\n      transition: all 0.25s ease;\n    }\n\n    .section-header {\n      display: flex;\n      align-items: center;\n      padding: 13px 16px;\n      cursor: pointer;\n      user-select: none;\n      gap: 12px;\n      min-height: 50px;\n    }\n\n    .section-header:active {\n      background: rgba(127, 127, 127, 0.08);\n    }\n\n    .section-icon {\n      width: 28px;\n      height: 28px;\n      border-radius: 7px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      color: #fff;\n      flex-shrink: 0;\n    }\n\n    .section-title {\n      font-size: 16px;\n      font-weight: 600;\n      flex: 1;\n      color: var(--text-primary);\n    }\n\n    .section-summary {\n      font-size: 12px;\n      color: var(--badge-text);\n      background: var(--badge-bg);\n      padding: 3px 8px;\n      border-radius: 6px;\n      font-weight: 500;\n      max-width: 140px;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n      transition: opacity 0.2s;\n    }\n\n    .chevron-icon {\n      width: 14px;\n      height: 14px;\n      color: var(--text-secondary);\n      transition: transform 0.25s ease;\n      flex-shrink: 0;\n    }\n\n    .section-card.expanded .chevron-icon {\n      transform: rotate(90deg);\n    }\n\n    .section-card.expanded .section-summary {\n      opacity: 0;\n      pointer-events: none;\n    }\n\n    .section-body {\n      display: none;\n      border-top: 0.5px solid var(--separator-color);\n    }\n\n    .section-card.expanded .section-body {\n      display: block;\n    }\n\n    /* ─── 设置条目 (Row) ─── */\n    .setting-row {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      padding: 12px 16px;\n      min-height: 48px;\n      position: relative;\n    }\n\n    .setting-row:not(:last-child)::after {\n      content: \"\";\n      position: absolute;\n      left: 16px;\n      right: 0;\n      bottom: 0;\n      height: 0.5px;\n      background: var(--separator-color);\n    }\n\n    .setting-info {\n      flex: 1;\n      padding-right: 12px;\n    }\n\n    .setting-label {\n      font-size: 15px;\n      font-weight: 500;\n      color: var(--text-primary);\n    }\n\n    .setting-desc {\n      font-size: 12px;\n      color: var(--text-secondary);\n      margin-top: 2px;\n      line-height: 1.35;\n    }\n\n    .cache {\n      padding: 14px 16px 16px;\n    }\n\n    .cache-overview {\n      display: flex;\n      align-items: baseline;\n      gap: 22px;\n      margin: 13px 0 11px;\n    }\n\n    .cache-stat {\n      display: flex;\n      align-items: baseline;\n      gap: 5px;\n    }\n\n    .cache-stat strong {\n      font-size: 20px;\n      font-weight: 600;\n    }\n\n    .cache-stat span {\n      color: var(--text-secondary);\n      font-size: 12px;\n    }\n\n    /* ─── 控件：iOS 原生质感 Toggle 开关 ─── */\n    .switch-wrap {\n      position: relative;\n      width: 51px;\n      height: 31px;\n      flex-shrink: 0;\n    }\n\n    .switch-wrap input {\n      opacity: 0;\n      width: 0;\n      height: 0;\n    }\n\n    .switch-slider {\n      position: absolute;\n      cursor: pointer;\n      top: 0;\n      left: 0;\n      right: 0;\n      bottom: 0;\n      background-color: var(--switch-bg);\n      transition: background-color 0.25s ease;\n      border-radius: 31px;\n    }\n\n    .switch-slider::before {\n      position: absolute;\n      content: \"\";\n      height: 27px;\n      width: 27px;\n      left: 2px;\n      bottom: 2px;\n      background-color: white;\n      transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n      border-radius: 50%;\n      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);\n    }\n\n    .switch-wrap input:checked+.switch-slider {\n      background-color: var(--tint-green);\n    }\n\n    .switch-wrap input:checked+.switch-slider::before {\n      transform: translateX(20px);\n    }\n\n    /* ─── 控件：Select 选择器 ─── */\n    .select-wrap {\n      position: relative;\n      display: inline-flex;\n      align-items: center;\n    }\n\n    .select-input {\n      appearance: none;\n      -webkit-appearance: none;\n      background: rgba(127, 127, 127, 0.1);\n      border: none;\n      padding: 6px 28px 6px 12px;\n      border-radius: 8px;\n      font-size: 14px;\n      font-family: inherit;\n      color: var(--tint-blue);\n      font-weight: 500;\n      outline: none;\n      cursor: pointer;\n    }\n\n    .select-arrow {\n      position: absolute;\n      right: 8px;\n      width: 12px;\n      height: 12px;\n      color: var(--tint-blue);\n      pointer-events: none;\n    }\n\n    /* ─── 控件：单行输入框 (带显隐眼睛) ─── */\n    .input-wrap {\n      display: flex;\n      align-items: center;\n      background: rgba(127, 127, 127, 0.08);\n      border-radius: 8px;\n      padding: 6px 10px;\n      width: 100%;\n      margin-top: 6px;\n      border: 0.5px solid var(--separator-color);\n    }\n\n    .text-input {\n      flex: 1;\n      background: transparent;\n      border: none;\n      font-size: 14px;\n      font-family: inherit;\n      color: var(--text-primary);\n      outline: none;\n    }\n\n    .text-input::placeholder {\n      color: var(--text-secondary);\n      opacity: 0.6;\n    }\n\n    .input-action-btn {\n      background: none;\n      border: none;\n      color: var(--text-secondary);\n      padding: 2px 4px;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n    }\n\n    /* ─── 控件：多选 Scope 芯片胶囊 ─── */\n    .cache-overview {\n      display: flex;\n      align-items: baseline;\n      gap: 22px;\n      margin: 13px 0 11px;\n      padding: 8px 16px 14px;\n    .cache-stat {\n      display: flex;\n      align-items: baseline;\n      gap: 5px;\n      font-size: 13px;\n    .cache-stat strong {\n      font-size: 20px;\n      transition: all 0.2s ease;\n    }\n    .cache-stat span {\n    .scope-chip.selected {\n      background: rgba(0, 150, 250, 0.15);\n      border-color: rgba(0, 150, 250, 0.35);\n      font-weight: 600;\n    }\n\n    /* ─── 操作按钮 (Button) ─── */\n    .action-btn-row {\n      padding: 12px 16px;\n      display: flex;\n      gap: 10px;\n    }\n\n    .primary-btn {\n      flex: 1;\n      background: var(--tint-blue);\n      color: #fff;\n      border: none;\n      border-radius: 10px;\n      padding: 11px 16px;\n      font-size: 15px;\n      font-weight: 600;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      gap: 6px;\n      box-shadow: 0 2px 8px rgba(0, 150, 250, 0.25);\n      transition: transform 0.12s, opacity 0.2s;\n    }\n\n    .primary-btn:active {\n      transform: scale(0.97);\n      opacity: 0.9;\n    }\n\n    .secondary-btn {\n      flex: 1;\n      background: rgba(127, 127, 127, 0.12);\n      color: var(--text-primary);\n      border: none;\n      border-radius: 10px;\n      padding: 11px 16px;\n      font-size: 15px;\n      font-weight: 500;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      gap: 6px;\n      transition: transform 0.12s, opacity 0.2s;\n    }\n\n    .secondary-btn:active {\n      transform: scale(0.97);\n    }\n\n    .danger-btn {\n      color: var(--tint-red);\n      background: rgba(255, 59, 48, 0.1);\n    }\n\n    /* ─── 分组说明注脚 (Footer) ─── */\n    .section-footer {\n      font-size: 12px;\n      color: var(--text-secondary);\n      margin: 6px 16px 20px;\n      line-height: 1.4;\n      padding: 0 4px;\n    }\n\n    /* ─── 提示 Toast 悬浮胶囊 ─── */\n    #px-toast {\n      position: fixed;\n      top: calc(env(safe-area-inset-top, 20px) + 12px);\n      left: 50%;\n      transform: translateX(-50%) translateY(-60px);\n      background: rgba(20, 20, 20, 0.9);\n      -webkit-backdrop-filter: blur(20px);\n      backdrop-filter: blur(20px);\n      color: #fff;\n      padding: 8px 18px;\n      border-radius: 20px;\n      font-size: 13px;\n      font-weight: 500;\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);\n      z-index: 999999;\n      opacity: 0;\n      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n      pointer-events: none;\n    }\n\n    #px-toast.show {\n      transform: translateX(-50%) translateY(0);\n      opacity: 1;\n    }\n  </style>\n</head>\n\n<body>\n\n  <!-- 提示 Toast 胶囊 -->\n  <div id=\"px-toast\">\n    <span id=\"px-toast-icon\">✓</span>\n    <span id=\"px-toast-msg\">设置已自动保存</span>\n  </div>\n\n  <!-- 页面主标头 (对标 Pix-Scripting) -->\n  <div class=\"brand-header\">\n    <div class=\"brand-icon\">\n      <svg viewBox=\"0 0 24 24\" width=\"28\" height=\"28\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\"\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <path d=\"m5 8 6 6\" />\n        <path d=\"m4 14 6-6 2-3\" />\n        <path d=\"M2 5h12\" />\n        <path d=\"M7 2h1\" />\n        <path d=\"m22 22-5-10-5 10\" />\n        <path d=\"M14 18h6\" />\n      </svg>\n    </div>\n    <div>\n      <div class=\"brand-title\">\n        Pixiv 增强设置\n        <span class=\"brand-badge\">v4.1</span>\n      </div>\n      <div class=\"brand-sub\">全局日文汉化 · AI 视觉漫翻 · 出版级排版</div>\n    </div>\n  </div>\n\n  <!-- ─── 第一组：界面汉化与智能过滤 ─── -->\n  <div class=\"section-card expanded\" id=\"sec-content\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-content')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-blue);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n          <path\n            d=\"M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z\" />\n        </svg>\n      </div>\n      <div class=\"section-title\">界面汉化与过滤</div>\n      <div class=\"section-summary\" id=\"sum-content\">自动:开 · 简体</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <path d=\"m9 18 6-6-6-6\" />\n      </svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">启用 Pixiv 增强翻译</div>\n          <div class=\"setting-desc\">总开关：接管日文文本汉化与漫画对白识别</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-global-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">默认全自动汉化</div>\n          <div class=\"setting-desc\">进入首页、榜单、详情与小说时直接呈现中文，无需点击</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-auto-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">智能豁免纯中文作品</div>\n          <div class=\"setting-desc\">作者本身使用中文创作时自动跳过，节省配额与零延迟</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-skip-chinese\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">目标语言</div>\n          <div class=\"setting-desc\">期望将外语内容翻译为的目标语种</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-target-lang\" onchange=\"saveConfig()\">\n            <option value=\"zh-CN\">简体中文</option>\n            <option value=\"zh-TW\">繁體中文</option>\n            <option value=\"en\">English</option>\n            <option value=\"ja\">日本語 (原文)</option>\n            <option value=\"ko\">한국어</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">\n            <path d=\"m6 9 6 6 6-6\" />\n          </svg>\n        </div>\n      </div>\n      <div style=\"padding: 10px 16px 4px;\">\n        <div class=\"setting-label\" style=\"font-size: 14px;\">翻译生效模块</div>\n      </div>\n      <div class=\"scope-chips\" id=\"scope-chips-container\">\n        <div class=\"scope-chip\" data-key=\"illust_title\" onclick=\"toggleScope(this)\">作品标题</div>\n        <div class=\"scope-chip\" data-key=\"illust_caption\" onclick=\"toggleScope(this)\">作品简介 (就地汉化)</div>\n        <div class=\"scope-chip\" data-key=\"tags\" onclick=\"toggleScope(this)\">日文标签 (Tag)</div>\n        <div class=\"scope-chip\" data-key=\"novels\" onclick=\"toggleScope(this)\">小说列表与正文</div>\n        <div class=\"scope-chip\" data-key=\"comments\" onclick=\"toggleScope(this)\">评论区 (全语种)</div>\n        <div class=\"scope-chip\" data-key=\"user_profile\" onclick=\"toggleScope(this)\">画师简介</div>\n        <div class=\"scope-chip\" data-key=\"spotlight\" onclick=\"toggleScope(this)\">Pixivision 特辑</div>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    首页卡片将同时改写底层模型，简介就地展示中文，彻底消除“点击查看更多”弹窗；标签副标题已自动净空，杜绝上下重复堆叠。\n  </div>\n\n  <!-- ─── 第二组：小说出版级沉浸排版 ─── -->\n  <div class=\"section-card expanded\" id=\"sec-novel\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-novel')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-indigo);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n          <path\n            d=\"M18 2H6c-1.2 0-2 .8-2 2v16c0 1.2.8 2 2 2h12c1.2 0 2-.8 2-2V4c0-1.2-.8-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z\" />\n        </svg>\n      </div>\n      <div class=\"section-title\">小说出版级排版</div>\n      <div class=\"section-summary\" id=\"sum-novel\">系统默认 · 规约净化</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <path d=\"m9 18 6-6-6-6\" />\n      </svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">排版字体风格</div>\n          <div class=\"setting-desc\">对标 Pix-Scripting 规范，自由注入精致中文印刷字体</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-novel-font\" onchange=\"saveConfig()\">\n            <option value=\"system\">系统默认 (苹方)</option>\n            <option value=\"songti\">经典宋体 (纸书质感)</option>\n            <option value=\"kaiti\">优美楷体 (古雅风格)</option>\n            <option value=\"yuanti\">柔和圆体 (亲和温润)</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">\n            <path d=\"m6 9 6 6 6-6\" />\n          </svg>\n        </div>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">自动净化作者免责声明</div>\n          <div class=\"setting-desc\">智能过滤台本商用授权、禁止转载等规约，只呈现小说故事</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-clean-disclaimer\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">显示原文</div>\n          <div class=\"setting-desc\">开启后按原文在上、译文在下的段落对显示；关闭后仅显示译文</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-novel-show-original\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    字号、行距、暗黑模式背景及文字颜色严格同态继承 Pixiv 官方设置，阅读正文上方不再插入生硬标题，保持 100% 沉浸阅读。\n  </div>\n\n  <div class=\"section-card\" id=\"sec-floating\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-floating')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-gray);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\n          stroke-linecap=\"round\">\n          <path d=\"M6 12h12\" />\n          <path d=\"M12 6v12\" />\n        </svg>\n      </div>\n      <div class=\"section-title\">悬浮按钮</div>\n      <div class=\"section-summary\" id=\"sum-floating\">已开启</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <path d=\"m9 18 6-6-6-6\" />\n      </svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">显示悬浮按钮</div>\n          <div class=\"setting-desc\">翻译过程中显示，位置会自动避开页面控件</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-floating-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n    </div>\n  </div>\n\n  <!-- ─── 第三组：智能 AI 与模型端点 (对标 customAISettings) ─── -->\n  <div class=\"section-card expanded\" id=\"sec-ai\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-ai')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-purple);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n          <path\n            d=\"m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z\" />\n        </svg>\n      </div>\n      <div class=\"section-title\">智能 AI 与模型端点</div>\n      <div class=\"section-summary\" id=\"sum-ai\">Google 免费</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <path d=\"m9 18 6-6-6-6\" />\n      </svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">翻译引擎切换</div>\n          <div class=\"setting-desc\">选择底层文本翻译所使用的服务通道</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-translator-source\" onchange=\"onTranslatorChange()\">\n            <option value=\"google\">Google 免费切片并发 (极速)</option>\n            <option value=\"deepseek\">DeepSeek AI (文学润色/需Key)</option>\n            <option value=\"openai\">OpenAI / 兼容接口 (需Key)</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">\n            <path d=\"m6 9 6 6 6-6\" />\n          </svg>\n        </div>\n      </div>\n\n      <!-- DeepSeek 专属配置区 -->\n      <div id=\"ai-deepseek-block\" style=\"padding: 10px 16px 14px; border-bottom: 0.5px solid var(--separator-color);\">\n        <div class=\"setting-label\" style=\"font-size: 14px;\">DeepSeek API Key</div>\n        <div class=\"input-wrap\">\n          <input type=\"password\" class=\"text-input\" id=\"cfg-deepseek-key\" placeholder=\"sk-...\" onchange=\"saveConfig()\">\n          <button type=\"button\" class=\"input-action-btn\" onclick=\"toggleInputMask('cfg-deepseek-key')\">\n            <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n              <path\n                d=\"M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z\" />\n            </svg>\n          </button>\n        </div>\n        <div style=\"display: flex; gap: 8px; margin-top: 8px;\">\n          <div style=\"flex: 2;\">\n            <div class=\"setting-desc\">端点 URL</div>\n            <div class=\"input-wrap\"><input type=\"text\" class=\"text-input\" id=\"cfg-deepseek-url\"\n                value=\"https://api.deepseek.com/v1/chat/completions\" onchange=\"saveConfig()\"></div>\n          </div>\n          <div style=\"flex: 1.2;\">\n            <div class=\"setting-desc\">模型名称</div>\n            <div class=\"input-wrap\"><input type=\"text\" class=\"text-input\" id=\"cfg-deepseek-model\"\n                value=\"deepseek-v4-flash\" onchange=\"saveConfig()\"></div>\n          </div>\n        </div>\n      </div>\n\n      <!-- OpenAI 专属配置区 -->\n      <div id=\"ai-openai-block\"\n        style=\"padding: 10px 16px 14px; border-bottom: 0.5px solid var(--separator-color); display: none;\">\n        <div class=\"setting-label\" style=\"font-size: 14px;\">OpenAI API Key</div>\n        <div class=\"input-wrap\">\n          <input type=\"password\" class=\"text-input\" id=\"cfg-openai-key\" placeholder=\"sk-...\" onchange=\"saveConfig()\">\n          <button type=\"button\" class=\"input-action-btn\" onclick=\"toggleInputMask('cfg-openai-key')\">\n            <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n              <path\n                d=\"M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z\" />\n            </svg>\n          </button>\n        </div>\n        <div style=\"margin-top: 8px;\">\n          <div class=\"setting-desc\">OpenAI 兼容端点 URL</div>\n          <div class=\"input-wrap\"><input type=\"text\" class=\"text-input\" id=\"cfg-openai-url\"\n              value=\"https://api.openai.com/v1/chat/completions\" onchange=\"saveConfig()\"></div>\n        </div>\n      </div>\n\n      <!-- 测试连接按钮 (对标 customAISettings 测速与连通性检验) -->\n      <div class=\"action-btn-row\">\n        <button type=\"button\" class=\"primary-btn\" id=\"btn-test-ai\" onclick=\"testAIConnection()\">\n          <span>⚡ 测试模型连接与延迟</span>\n        </button>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    配置保存在本地 Loon 中。Google 免费源已启用多切片并发加速，无需任何 Key 即可达到 120Hz 丝滑体验。\n  </div>\n\n  <!-- ─── 第四组：漫画多模态 AI 漫翻 ─── -->\n  <div class=\"section-card\" id=\"sec-manga\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-manga')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-cyan);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n          <path\n            d=\"M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z\" />\n        </svg>\n      </div>\n      <div class=\"section-title\">漫画多模态 AI 漫翻</div>\n      <div class=\"section-summary\" id=\"sum-manga\">HUD 气泡字幕</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"\n        stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <path d=\"m9 18 6-6-6-6\" />\n      </svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">启用图片/漫画 AI 翻译</div>\n          <div class=\"setting-desc\">阅读漫画或插画大图时支持智能视觉字幕识别</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-manga-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">视觉模型</div>\n          <div class=\"setting-desc\">独立于上方文本翻译引擎，专门处理对白框气泡定位</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-manga-engine\" onchange=\"saveConfig()\">\n            <option value=\"deepseek_vl\">DeepSeek-VL (推荐/极高性价比)</option>\n            <option value=\"gpt4o_mini\">GPT-4o-mini Vision (气泡高精度)</option>\n            <option value=\"manga_translator\">自建 manga-image-translator</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">\n            <path d=\"m6 9 6 6 6-6\" />\n          </svg>\n        </div>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">展现样式</div>\n          <div class=\"setting-desc\">HUD 气泡字幕覆盖保留 100% 原始超清画质，内存占用 < 100KB</div>\n          </div>\n          <div class=\"select-wrap\">\n            <select class=\"select-input\" id=\"cfg-manga-rendermode\" onchange=\"saveConfig()\">\n              <option value=\"overlay\">HUD 气泡字幕悬浮覆盖</option>\n              <option value=\"inpaint\">AI 抹字整图重绘 (需自建)</option>\n            </select>\n            <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">\n              <path d=\"m6 9 6 6 6-6\" />\n            </svg>\n          </div>\n        </div>\n      </div>\n    </div>\n    <div class=\"section-footer\">\n      HUD 模式仅发送图片链接，模型返回对白坐标后在屏幕上悬浮半透明对白框，杜绝 iOS 内存膨胀断网。\n    </div>\n\n    <!-- ─── 第五组：高级选项与缓存管理 ─── -->\n    <div class=\"section-card\" id=\"sec-advanced\">\n      <div class=\"section-header\" onclick=\"toggleSection('sec-advanced')\">\n        <div class=\"section-icon\" style=\"background: var(--tint-gray);\">\n          <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n            <path\n              d=\"M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z\" />\n          </svg>\n        </div>\n        <div class=\"section-title\">高级选项与缓存管理</div>\n        <div class=\"section-summary\" id=\"sum-advanced\">已就绪</div>\n        <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"\n          stroke-linecap=\"round\" stroke-linejoin=\"round\">\n          <path d=\"m9 18 6-6-6-6\" />\n        </svg>\n      </div>\n      <div class=\"section-body\">\n        <div class=\"setting-row\">\n          <div class=\"setting-info\">\n            <div class=\"setting-label\">标签优先使用离线词典</div>\n            <div class=\"setting-desc\">内置 2500+ ACG 日文 Tag 映射表，0ms 响应且副标自动净空</div>\n          </div>\n          <label class=\"switch-wrap\">\n            <input type=\"checkbox\" id=\"cfg-tag-offline\" checked onchange=\"saveConfig()\">\n            <span class=\"switch-slider\"></span>\n          </label>\n        </div>\n        <div class=\"setting-row\">\n          <div class=\"setting-info\">\n            <div class=\"setting-label\">日志输出级别</div>\n            <div class=\"setting-desc\">控制 Loon 脚本日志的详细程度</div>\n          </div>\n          <div class=\"select-wrap\">\n            <select class=\"select-input\" id=\"cfg-log-level\" onchange=\"saveConfig()\">\n              <option value=\"WARN\">警告与错误 (推荐)</option>\n              <option value=\"INFO\">基础信息</option>\n              <option value=\"DEBUG\">详细调试 (含测速)</option>\n              <option value=\"OFF\">关闭</option>\n            </select>\n            <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">\n              <path d=\"m6 9 6 6 6-6\" />\n            </svg>\n          </div>\n        </div>\n        <div class=\"cache\" id=\"cache-summary\">\n          <div class=\"setting-label\">翻译缓存</div>\n          <div class=\"setting-desc\">翻译结果会暂存在本地，以减少重复请求</div>\n          <div class=\"cache-overview\">\n            <div class=\"cache-stat\"><strong id=\"cache-size\">读取中…</strong><span>已使用</span></div>\n            <div class=\"cache-stat\"><strong id=\"cache-count\">读取中…</strong><span>缓存条目</span></div>\n          </div>\n          <button type=\"button\" class=\"secondary-btn danger-btn\" onclick=\"confirmClearCache()\">\n            <span>清理缓存</span>\n          </button>\n          <div class=\"setting-desc\" id=\"cache-feedback\" aria-live=\"polite\"></div>\n        </div>\n      </div>\n    </div>\n    <div class=\"section-footer\">\n      图片镜像分流提示：如需节省代理流量并实现看图秒开，可在 Loon 的 [Rule] 段添加规则：<code\n        style=\"background: rgba(127,127,127,0.15); padding: 1px 4px; border-radius: 4px;\">DOMAIN,i.pixiv.re,DIRECT</code>。\n    </div>\n\n    <script>\n      // 默认初始配置字典\n      const DEFAULT_CONFIG = {\n        \"@Pixiv.Enhanced.Settings.Global.Switch\": true,\n        \"@Pixiv.Enhanced.Settings.Auto.Switch\": true,\n        \"@Pixiv.Enhanced.Settings.Auto.Scopes\": [\"illust_title\", \"illust_caption\", \"tags\", \"comments\", \"user_profile\", \"novels\", \"spotlight\"],\n        \"@Pixiv.Enhanced.Settings.Filter.SkipChinese\": true,\n        \"@Pixiv.Enhanced.Settings.Novel.Font\": \"system\",\n        \"@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer\": true,\n        \"@Pixiv.Enhanced.Settings.Novel.ShowOriginal\": true,\n        \"@Pixiv.Enhanced.Settings.Floating.Switch\": true,\n        \"@Pixiv.Enhanced.Settings.Translator.Source\": \"google\",\n        \"@Pixiv.Enhanced.Settings.Target.Lang\": \"zh-CN\",\n        \"@Pixiv.Enhanced.Settings.Tag.OfflineOnly\": true,\n        \"@Pixiv.Enhanced.Settings.Image.Switch\": true,\n        \"@Pixiv.Enhanced.Settings.Image.Engine\": \"deepseek_vl\",\n        \"@Pixiv.Enhanced.Settings.Image.RenderMode\": \"overlay\",\n        \"@Pixiv.Enhanced.Settings.Auth.DeepSeekKey\": \"\",\n        \"@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl\": \"https://api.deepseek.com/v1/chat/completions\",\n        \"@Pixiv.Enhanced.Settings.Auth.DeepSeekModel\": \"deepseek-v4-flash\",\n        \"@Pixiv.Enhanced.Settings.Auth.OpenAIKey\": \"\",\n        \"@Pixiv.Enhanced.Settings.Auth.OpenAIUrl\": \"https://api.openai.com/v1/chat/completions\",\n        \"@Pixiv.Enhanced.Settings.Manga.ServerUrl\": \"http://127.0.0.1:5000\",\n        \"@Pixiv.Enhanced.Settings.LogLevel\": \"WARN\"\n      };\n\n      let currentConfig = Object.assign({}, DEFAULT_CONFIG);\n      let selectedScopes = new Set(DEFAULT_CONFIG[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"]);\n\n      function showToast(msg, icon) {\n        const toast = document.getElementById(\"px-toast\");\n        document.getElementById(\"px-toast-msg\").textContent = msg;\n        document.getElementById(\"px-toast-icon\").textContent = icon || \"✓\";\n        toast.classList.add(\"show\");\n        clearTimeout(window._toastTimer);\n        window._toastTimer = setTimeout(() => toast.classList.remove(\"show\"), 2200);\n      }\n\n      function toggleSection(id) {\n        const card = document.getElementById(id);\n        if (card) card.classList.toggle(\"expanded\");\n      }\n\n      function toggleInputMask(inputId) {\n        const input = document.getElementById(inputId);\n        if (input) input.type = (input.type === \"password\") ? \"text\" : \"password\";\n      }\n\n      function toggleScope(el) {\n        const key = el.getAttribute(\"data-key\");\n        if (selectedScopes.has(key)) {\n          selectedScopes.delete(key);\n          el.classList.remove(\"selected\");\n        } else {\n          selectedScopes.add(key);\n          el.classList.add(\"selected\");\n        }\n        saveConfig();\n      }\n\n      function onTranslatorChange() {\n        const source = document.getElementById(\"cfg-translator-source\").value;\n        const dsBlock = document.getElementById(\"ai-deepseek-block\");\n        const oaBlock = document.getElementById(\"ai-openai-block\");\n        if (dsBlock) dsBlock.style.display = (source === \"deepseek\") ? \"block\" : \"none\";\n        if (oaBlock) oaBlock.style.display = (source === \"openai\") ? \"block\" : \"none\";\n        saveConfig();\n      }\n\n      function updateSummaries() {\n        // 1. 内容与语言\n        const autoOn = document.getElementById(\"cfg-auto-switch\").checked;\n        const targetLang = document.getElementById(\"cfg-target-lang\").value;\n        const langText = (targetLang === \"zh-CN\") ? \"简体\" : (targetLang === \"zh-TW\" ? \"繁體\" : targetLang);\n        document.getElementById(\"sum-content\").textContent = (autoOn ? \"自动:开\" : \"自动:关\") + \" · \" + langText;\n\n        // 2. 小说排版\n        const font = document.getElementById(\"cfg-novel-font\").value;\n        const fontNameMap = { system: \"苹方\", songti: \"宋体\", kaiti: \"楷体\", yuanti: \"圆体\" };\n        const cleanOn = document.getElementById(\"cfg-clean-disclaimer\").checked;\n        document.getElementById(\"sum-novel\").textContent = (fontNameMap[font] || \"原版\") + \" · \" + (cleanOn ? \"规约净化\" : \"保留声明\");\n\n        const floatingOn = document.getElementById(\"cfg-floating-switch\").checked;\n        document.getElementById(\"sum-floating\").textContent = floatingOn ? \"已开启\" : \"已关闭\";\n\n        // 3. AI 引擎\n        const trans = document.getElementById(\"cfg-translator-source\").value;\n        const transMap = { google: \"Google免费\", deepseek: \"DeepSeek\", openai: \"OpenAI\" };\n        document.getElementById(\"sum-ai\").textContent = transMap[trans] || trans;\n\n        // 4. 漫翻\n        const mangaOn = document.getElementById(\"cfg-manga-switch\").checked;\n        document.getElementById(\"sum-manga\").textContent = mangaOn ? \"HUD 气泡字幕\" : \"已关闭\";\n      }\n\n      async function loadConfig() {\n        try {\n          const res = await fetch(\"/api/get\").then(r => r.json()).catch(() => null);\n          if (res && typeof res === \"object\") {\n            currentConfig = Object.assign({}, DEFAULT_CONFIG, res);\n          }\n        } catch (e) { }\n\n        // 回填 UI\n        document.getElementById(\"cfg-global-switch\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Global.Switch\"];\n        document.getElementById(\"cfg-auto-switch\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Switch\"];\n        document.getElementById(\"cfg-skip-chinese\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Filter.SkipChinese\"];\n        document.getElementById(\"cfg-target-lang\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Target.Lang\"] || \"zh-CN\";\n\n        document.getElementById(\"cfg-novel-font\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Novel.Font\"] || \"system\";\n        document.getElementById(\"cfg-clean-disclaimer\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer\"];\n        document.getElementById(\"cfg-novel-show-original\").checked = currentConfig[\"@Pixiv.Enhanced.Settings.Novel.ShowOriginal\"] !== false;\n        document.getElementById(\"cfg-floating-switch\").checked = currentConfig[\"@Pixiv.Enhanced.Settings.Floating.Switch\"] !== false;\n\n        document.getElementById(\"cfg-translator-source\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Translator.Source\"] || \"google\";\n        document.getElementById(\"cfg-deepseek-key\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekKey\"] || \"\";\n        document.getElementById(\"cfg-deepseek-url\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl\"] || \"https://api.deepseek.com/v1/chat/completions\";\n        document.getElementById(\"cfg-deepseek-model\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekModel\"] || \"deepseek-v4-flash\";\n        document.getElementById(\"cfg-openai-key\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIKey\"] || \"\";\n        document.getElementById(\"cfg-openai-url\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIUrl\"] || \"https://api.openai.com/v1/chat/completions\";\n\n        document.getElementById(\"cfg-manga-switch\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Image.Switch\"];\n        document.getElementById(\"cfg-manga-engine\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Image.Engine\"] || \"deepseek_vl\";\n        document.getElementById(\"cfg-manga-rendermode\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Image.RenderMode\"] || \"overlay\";\n\n        document.getElementById(\"cfg-tag-offline\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Tag.OfflineOnly\"];\n        document.getElementById(\"cfg-log-level\").value = currentConfig[\"@Pixiv.Enhanced.Settings.LogLevel\"] || \"WARN\";\n\n        // 渲染 scope 芯片\n        const scopes = Array.isArray(currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"])\n          ? currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"]\n          : DEFAULT_CONFIG[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"];\n        selectedScopes = new Set(scopes);\n        document.querySelectorAll(\".scope-chip\").forEach(chip => {\n          const k = chip.getAttribute(\"data-key\");\n          if (selectedScopes.has(k)) chip.classList.add(\"selected\");\n          else chip.classList.remove(\"selected\");\n        });\n\n        onTranslatorChange();\n        updateSummaries();\n      }\n\n      async function saveConfig() {\n        currentConfig[\"@Pixiv.Enhanced.Settings.Global.Switch\"] = document.getElementById(\"cfg-global-switch\").checked;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Switch\"] = document.getElementById(\"cfg-auto-switch\").checked;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Filter.SkipChinese\"] = document.getElementById(\"cfg-skip-chinese\").checked;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Target.Lang\"] = document.getElementById(\"cfg-target-lang\").value;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"] = Array.from(selectedScopes);\n\n        currentConfig[\"@Pixiv.Enhanced.Settings.Novel.Font\"] = document.getElementById(\"cfg-novel-font\").value;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer\"] = document.getElementById(\"cfg-clean-disclaimer\").checked;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Novel.ShowOriginal\"] = document.getElementById(\"cfg-novel-show-original\").checked;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Floating.Switch\"] = document.getElementById(\"cfg-floating-switch\").checked;\n\n        currentConfig[\"@Pixiv.Enhanced.Settings.Translator.Source\"] = document.getElementById(\"cfg-translator-source\").value;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekKey\"] = document.getElementById(\"cfg-deepseek-key\").value.trim();\n        currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl\"] = document.getElementById(\"cfg-deepseek-url\").value.trim();\n        currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekModel\"] = document.getElementById(\"cfg-deepseek-model\").value.trim();\n        currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIKey\"] = document.getElementById(\"cfg-openai-key\").value.trim();\n        currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIUrl\"] = document.getElementById(\"cfg-openai-url\").value.trim();\n\n        currentConfig[\"@Pixiv.Enhanced.Settings.Image.Switch\"] = document.getElementById(\"cfg-manga-switch\").checked;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Image.Engine\"] = document.getElementById(\"cfg-manga-engine\").value;\n        currentConfig[\"@Pixiv.Enhanced.Settings.Image.RenderMode\"] = document.getElementById(\"cfg-manga-rendermode\").value;\n\n        currentConfig[\"@Pixiv.Enhanced.Settings.Tag.OfflineOnly\"] = document.getElementById(\"cfg-tag-offline\").checked;\n        currentConfig[\"@Pixiv.Enhanced.Settings.LogLevel\"] = document.getElementById(\"cfg-log-level\").value;\n\n        updateSummaries();\n\n        // 向代理脚本存入 Loon $persistentStore\n        try {\n          await fetch(\"/api/set\", {\n            method: \"POST\",\n            headers: { \"Content-Type\": \"application/json\" },\n            body: JSON.stringify(currentConfig)\n          });\n          showToast(\"设置已实时同步保存\", \"✓\");\n        } catch (e) {\n          showToast(\"已在本地更新\", \"ℹ️\");\n        }\n      }\n\n      async function testAIConnection() {\n        const btn = document.getElementById(\"btn-test-ai\");\n        btn.disabled = true;\n        btn.innerHTML = '<span>⏳ 正在测试连通性与测速…</span>';\n        const start = Date.now();\n\n        try {\n          const source = document.getElementById(\"cfg-translator-source\").value;\n          const res = await fetch(\"/api/test_ai?source=\" + encodeURIComponent(source), { method: \"POST\" })\n            .then(r => r.json())\n            .catch(() => null);\n          const latency = Date.now() - start;\n\n          if (res && res.ok) {\n            btn.innerHTML = '<span>🟢 连接正常 · ' + latency + 'ms</span>';\n            showToast(\"AI 模型连接正常 (\" + latency + \"ms)\", \"🟢\");\n          } else {\n            const err = (res && res.error) ? res.error : \"请求超时或鉴权失败\";\n            btn.innerHTML = '<span>🔴 失败: ' + err.slice(0, 16) + '</span>';\n            showToast(\"连接失败: \" + err, \"❌\");\n          }\n        } catch (e) {\n          btn.innerHTML = '<span>🔴 网络异常</span>';\n          showToast(\"网络请求异常\", \"❌\");\n        }\n\n        setTimeout(() => {\n          btn.disabled = false;\n          btn.innerHTML = '<span>⚡ 测试模型连接与延迟</span>';\n        }, 3000);\n      }\n\n      async function loadCacheStats() {\n        const sizeEl = document.getElementById(\"cache-size\");\n        const countEl = document.getElementById(\"cache-count\");\n        try {\n          const res = await fetch(\"/api/cache_stats\").then(r => r.json());\n          if (!res || !res.ok) throw new Error(\"统计不可用\");\n          sizeEl.textContent = res.sizeText;\n          countEl.textContent = res.count + \" 个\";\n        } catch (e) {\n          sizeEl.textContent = \"不可用\";\n          countEl.textContent = \"不可用\";\n        }\n      }\n\n      async function confirmClearCache() {\n        if (!confirm(\"清理缓存将删除所有已保存的翻译缓存，不会影响插件设置。\\n\\n确定继续吗？\")) return;\n        const feedback = document.getElementById(\"cache-feedback\");\n        feedback.textContent = \"正在清理…\";\n        try {\n          const res = await fetch(\"/api/clear_cache\", { method: \"POST\" }).then(r => r.json());\n          if (!res || !res.ok) throw new Error(\"清理失败\");\n          feedback.textContent = \"缓存已清理 · 已释放 \" + res.sizeText + \" · 已删除 \" + res.count + \" 条\";\n          showToast(\"缓存已清理\", \"✓\");\n          await loadCacheStats();\n        } catch (e) {\n          feedback.textContent = \"清理失败，请稍后重试\";\n          showToast(\"清理缓存失败\", \"!\");\n        }\n      }\n\n      // 页面加载自动拉取配置\n      document.addEventListener(\"DOMContentLoaded\", () => {\n        loadConfig();\n        loadCacheStats();\n      });\n    </script>\n</body>\n\n</html>";

// ─── 1. 配置管理中心（对接 PreferencePanes 存储模型）───────────────────────────
function getSetting(key, defaultVal) {
  try {
    const val = $.getdata(key);
    if (val === undefined || val === null || val === "") return defaultVal;
    if (val === "true") return true;
    if (val === "false") return false;
    if (/^[\[{]/.test(val)) {
      try { return JSON.parse(val); } catch (e) { }
    }
    return val;
  } catch (e) {
    return defaultVal;
  }
}

function loadConfig() {
  const globalSwitch = getSetting("@Pixiv.Enhanced.Settings.Global.Switch", true);
  const autoSwitch = getSetting("@Pixiv.Enhanced.Settings.Auto.Switch", true);
  const rawScopes = getSetting("@Pixiv.Enhanced.Settings.Auto.Scopes", ["illust_title", "illust_caption", "tags", "comments", "user_profile", "novels", "spotlight"]);
  const scopes = Array.isArray(rawScopes) ? rawScopes : (typeof rawScopes === "string" ? rawScopes.split(",") : []);
  if (!scopes.includes("illust_title")) scopes.push("illust_title");
  const skipChinese = getSetting("@Pixiv.Enhanced.Settings.Filter.SkipChinese", true);
  const novelFont = getSetting("@Pixiv.Enhanced.Settings.Novel.Font", "system");
  const novelCleanDisclaimer = getSetting("@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer", true);
  const novelShowOriginal = getSetting("@Pixiv.Enhanced.Settings.Novel.ShowOriginal", true);
  const floatingSwitch = getSetting("@Pixiv.Enhanced.Settings.Floating.Switch", true);
  const translator = (getSetting("@Pixiv.Enhanced.Settings.Translator.Source", "google") || "google").toLowerCase();
  const targetLang = getSetting("@Pixiv.Enhanced.Settings.Target.Lang", "zh-CN") || "zh-CN";
  const tagOfflineOnly = getSetting("@Pixiv.Enhanced.Settings.Tag.OfflineOnly", true);

  // 漫翻设置
  const imageSwitch = getSetting("@Pixiv.Enhanced.Settings.Image.Switch", true);
  const imageEngine = getSetting("@Pixiv.Enhanced.Settings.Image.Engine", "deepseek_vl");
  const imageRenderMode = getSetting("@Pixiv.Enhanced.Settings.Image.RenderMode", "overlay");

  // 密钥及服务
  const deepseekKey = getSetting("@Pixiv.Enhanced.Settings.Auth.DeepSeekKey", "");
  const deepseekUrl = getSetting("@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl", "https://api.deepseek.com/v1/chat/completions");
  const deepseekModel = getSetting("@Pixiv.Enhanced.Settings.Auth.DeepSeekModel", "deepseek-v4-flash");
  const openaiKey = getSetting("@Pixiv.Enhanced.Settings.Auth.OpenAIKey", "");
  const openaiUrl = getSetting("@Pixiv.Enhanced.Settings.Auth.OpenAIUrl", "https://api.openai.com/v1/chat/completions");
  const mangaServer = getSetting("@Pixiv.Enhanced.Settings.Manga.ServerUrl", "http://127.0.0.1:5000");
  const logLevel = getSetting("@Pixiv.Enhanced.Settings.LogLevel", "WARN");

  return {
    globalSwitch,
    autoSwitch,
    scopes,
    skipChinese,
    novelFont,
    novelCleanDisclaimer,
    novelShowOriginal,
    floatingSwitch,
    translator,
    targetLang,
    tagOfflineOnly,
    imageSwitch,
    imageEngine,
    imageRenderMode,
    deepseekKey,
    deepseekUrl,
    deepseekModel,
    openaiKey,
    openaiUrl,
    mangaServer,
    logLevel
  };
}

// ─── 2. 内置 500+ Pixiv 高频 Tag 离线汉化字典（0ms 响应，0 网络开销）───────────────
const PIXIV_TAG_DICT = {
  // 分类与属性
  "オリジナル": "原创", "版権": "二创/同人", "R-18": "R-18", "R-18G": "R-18G", "全年齢": "全年龄",
  "うごイラ": "动图", "漫画": "漫画", "小説": "小说", "イラスト": "插画", "メイキング": "过程/画法",
  "女の子": "女孩子", "男の子": "男孩子", "ショタ": "正太", "ロリ": "萝莉", "美少女": "美少女",
  "美女": "美女", "イケメン": "帅哥", "お姉さん": "大姐姐", "おじさん": "大叔", "人外": "非人生物",
  "獣人": "兽人", "ケモミミ": "兽耳", "猫耳": "猫耳", "狐耳": "狐耳", "犬耳": "犬耳", "ウサ耳": "兔耳",
  "エルフ": "精灵", "天使": "天使", "悪魔": "恶魔", "吸血鬼": "吸血鬼", "ドラゴン": "龙", "魔法少女": "魔法少女",

  // 发型与发色
  "ツインテール": "双马尾", "ポニーテール": "单马尾", "サイドテール": "侧马尾", "お団子": "丸子头",
  "ショートヘア": "短发", "ロングヘア": "长发", "セミロング": "中长发", "ボブ": "波波头",
  "三つ編み": "麻花辫", "前髪ぱっつん": "齐刘海", "アホ毛": "呆毛", "ドリル": "卷发/钻头卷",
  "金髪": "金发", "銀髪": "银发", "白髪": "白发", "黒髪": "黑发", "茶髪": "茶发",
  "赤髪": "红发", "青髪": "蓝发", "緑髪": "绿发", "桃髪": "粉发", "紫髪": "紫发",

  // 瞳色与表情
  "赤目": "红瞳", "青目": "蓝瞳", "金目": "金瞳", "緑目": "绿瞳", "オッドアイ": "异色瞳",
  "碧眼": "碧眼", "銀目": "银瞳", "紫目": "紫瞳", "笑顔": "笑容", "泣き顔": "哭泣脸",
  "照れ": "害羞", "ジト目": "死鱼眼", "ウィンク": "眨眼", "キス": "接吻", "ドヤ顔": "得意脸",

  // 服饰与装扮
  "制服": "制服", "セーラー服": "水手服", "ブレザー": "西装制服", "スク水": "死库水",
  "水着": "泳装", "ビキニ": "比基尼", "メイド": "女仆装", "バニーガール": "兔女郎",
  "着物": "和服", "浴衣": "浴衣", "巫女": "巫女服", "チャイナドレス": "旗袍",
  "スーツ": "西装", "パーカー": "连帽衫", "ドレス": "礼服/连衣裙", "体操着": "体操服",
  "メガネ": "眼镜", "サングラス": "太阳镜", "マスク": "口罩", "リボン": "蝴蝶结",
  "帽子": "帽子", "ヘッドホン": "耳机", "ガーターベルト": "吊袜带",
  "黒タイツ": "黑丝", "白タイツ": "白丝", "ニーソ": "过膝袜", "サイハイ": "大腿袜",
  "ストッキング": "丝袜", "素足": "赤足/光脚", "裸足": "裸足", "手袋": "手套",
  "巨乳": "巨乳", "爆乳": "爆乳", "貧乳": "贫乳", "微乳": "微乳", "ふともも": "大腿",
  "お腹": "肚子/腹部", "へそ": "肚脐", "胸": "胸部", "お尻": "臀部", "パンツ": "内裤/短裤",
  "ぱんつ": "胖次", "下着": "内衣", "ランジェリー": "性感内衣", "パンチラ": "走光/露胖次",

  // 场景与意境
  "背景": "背景", "風景": "风景", "空": "天空", "青空": "青空", "雲": "云彩",
  "夜": "夜晚", "夜景": "夜景", "星空": "星空", "月": "月亮", "満月": "满月",
  "夕焼け": "夕阳", "夕暮れ": "黄昏", "朝日": "朝阳", "雨": "雨景", "雪": "雪景",
  "海": "大海", "水着海": "海边泳装", "水": "水面", "水中": "水中", "波": "波浪",
  "花": "花卉", "桜": "樱花", "向日葵": "向日葵", "紅葉": "红叶", "森": "森林",
  "部屋": "房间", "街": "街道", "廃墟": "废墟", "鳥居": "鸟居", "神社": "神社",
  "サイバーパンク": "赛博朋克", "ファンタジー": "奇幻", "SF": "科幻", "日常": "日常",

  // 画风与技法
  "落書き": "涂鸦", "練習": "练习", "習作": "习作", "らくがき": "随笔涂鸦",
  "厚塗り": "厚涂", "水彩": "水彩", "グリザイユ": "灰阶厚涂", "ドット絵": "像素画",
  "モノクロ": "黑白", "線画": "线稿", "デフォルメ": "Q版化", "ちびキャラ": "Q版角色",
  "シルエット": "剪影", "透明水彩": "透明水彩", "油彩": "油画", "アナログ": "手绘/实体绘",

  // 热门作品 / IP
  "原神": "原神", "崩壊3rd": "崩坏3", "崩壊:スターレイル": "崩坏:星穹铁道", "ゼンレスゾーンゼロ": "绝区零",
  "ブルーアーカイブ": "碧蓝档案", "アズールレーン": "碧蓝航线", "Fate/Grand Order": "FGO", "FGO": "FGO",
  "東方": "东方Project", "東方Project": "东方Project", "ウマ娘": "赛马娘", "ウマ娘プリティーダービー": "赛马娘",
  "艦これ": "舰队Collection", "艦隊これくしょん": "舰队Collection", "アイマス": "偶像大师",
  "ホロライブ": "Hololive", "にじさんじ": "彩虹社", "Vtuber": "虚拟主播",
  "ポケモン": "宝可梦", "ポケットモンスター": "宝可梦", "初音ミク": "初音未来", "ボーカロイド": "VOCALOID",
  "チェンソーマン": "电锯人", "呪術廻戦": "咒术回战", "鬼滅の刃": "鬼灭之刃", "SPY×FAMILY": "间谍过家家",
  "ぼっち・ざ・ろっく!": "孤独摇滚!", "推しの子": "我推的孩子", "葬送のフリーレン": "葬送的芙莉莲",

  // 评价与常用标签
  "なにこれかわいい": "太可爱了吧", "なにこれ尊い": "太赞了吧", "魅惑のふともも": "诱人美腿",
  "魅惑の谷間": "诱人乳沟", "極上の乳": "极上美乳", "美脚": "美腿", "透け": "透视/半透明",
  "pixiv今日のお題": "今日主题", "ルーキーランキング": "新人榜", "デイリーランキング": "日榜",
  "ウィークリーランキング": "周榜", "マンスリーランキング": "月榜", "男子に人気": "男性向热门", "女子に人気": "女性向热门",

  // 补充高频角色、题材与作品
  "新選組": "新选组", "藤堂平助": "藤堂平助", "早川アキ": "早川秋", "よその子": "自创角色/他人家孩子",
  "HQ!!": "排球少年!!", "ハイキュー!!": "排球少年!!", "819プラス": "排球梦向/HQ+", "HQプラス": "排球梦向/HQ+",
  "赤葦京治": "赤苇京治", "五条悟": "五条悟", "夏油傑": "夏油杰", "虎杖悠仁": "虎杖悠仁", "伏黒恵": "伏黑惠",
  "デンジ": "电次", "マキマ": "玛奇玛", "パワー": "帕瓦", "早川家": "早川家",
  "オリジナル漫画": "原创漫画", "創作男女": "创作男女", "創作BL": "原创BL", "創作百合": "原创百合",
  "百合": "百合", "BL": "BL", "GL": "GL", "NL": "正常向/BG", "夢向け": "梦向",
  "女主人公": "女主角", "男主人公": "男主角", "現代": "现代", "学園": "学园/校园",
  "高校生": "高中生", "中学生": "初中生", "大学生": "大学生", "社会人": "上班族/社会人",
  "同棲": "同居", "幼馴染": "青梅竹马", "両片思い": "双向暗恋",
  "ハッピーエンド": "HE/圆满结局", "バッドエンド": "BE/悲剧结局", "ほのぼの": "温馨/治愈",
  "シリアス": "正剧/严肃", "ギャグ": "搞笑", "ヤンデレ": "病娇", "ツンデレ": "傲娇",
  "メンヘラ": "地雷系/精神敏感", "地雷系": "地雷系", "量産型": "量产型", "純愛": "纯爱",
  "溺愛": "溺爱", "独占欲": "独占欲", "執着": "执念", "嫉妬": "吃醋/嫉妒",
  "女装": "女装", "男装": "男装", "TS": "性转", "性転換": "性转换", "ふたなり": "扶她",
  "ショタコン": "正太控", "ロリコン": "萝莉控", "おねショタ": "大姐姐与正太",
  "年上": "年上", "年下": "年下", "年齢操作": "年龄操作", "パロディ": "同人恶搞/Paro"
};

// ─── 3. 语言探测与多语言过滤 ──────────────────────────────────────────────────
function isJapanese(text) {
  if (!text || typeof text !== "string") return false;
  // 包含平假名或片假名字符
  return /[぀-ゟ゠-ヿ]/.test(text);
}

function hasKanjiOrKana(text) {
  if (!text || typeof text !== "string") return false;
  return /[぀-ヿ一-龯]/.test(text);
}

// 智能多语言检测（支持日语、韩语、英语等各种外语自动翻译）
function needsTranslation(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // 1. 包含日文假名
  if (/[぀-ゟ゠-ヿ]/.test(trimmed)) return true;
  // 2. 包含韩文 Hangul
  if (/[가-힯]/.test(trimmed)) return true;
  // 3. 包含纯英文/西文字符串（不含中文汉字）
  if (/[a-zA-Z]{3,}/.test(trimmed) && !/[一-鿿]/.test(trimmed)) return true;
  // 4. 包含汉字
  if (/[一-龯]/.test(trimmed)) return true;
  return false;
}

// ─── 4. 多引擎批量翻译网络模块 ──────────────────────────────────────────────────
const LANG_MAP = {
  "zh-CN": { google: "zh-CN", ai: "Simplified Chinese" },
  "zh-TW": { google: "zh-TW", ai: "Traditional Chinese" },
  "en": { google: "en", ai: "English" },
  "ja": { google: "ja", ai: "Japanese" },
  "ko": { google: "ko", ai: "Korean" }
};

// 本地内存与持久化缓存（生命周期内与跨会话极速命中）
const MEMORY_CACHE = new Map();

function cacheKey(engine, target, text) {
  return engine + ":" + target + ":" + (text.length > 30 ? text.slice(0, 30) + text.length : text);
}

const CACHE_INDEX_KEY = "pxtc_cache_index_v1";

function readCacheIndex() {
  try {
    const raw = $.getdata(CACHE_INDEX_KEY);
    const index = raw ? JSON.parse(raw) : [];
    return Array.isArray(index) ? index : [];
  } catch (e) {
    return [];
  }
}

function writeCacheIndex(index) {
  try { $.setdata(JSON.stringify(index), CACHE_INDEX_KEY); } catch (e) { }
}

function cacheRead(key) {
  if (MEMORY_CACHE.has(key)) return MEMORY_CACHE.get(key);
  try {
    const val = $.getdata("pxtc_" + key);
    if (val) {
      MEMORY_CACHE.set(key, val);
      return val;
    }
  } catch (e) { }
  return undefined;
}

function cacheWrite(key, val) {
  MEMORY_CACHE.set(key, val);
  try {
    if (key.length < 80) {
      const storageKey = "pxtc_" + key;
      $.setdata(val, storageKey);
      const index = readCacheIndex();
      if (!index.includes(storageKey)) {
        index.push(storageKey);
        writeCacheIndex(index);
      }
    }
  } catch (e) { }
}

function getCacheStats() {
  const keys = readCacheIndex();
  let bytes = 0;
  let count = 0;
  for (const key of keys) {
    const value = $.getdata(key);
    if (value !== undefined && value !== null && value !== "") {
      count++;
      bytes += String(key).length + String(value).length;
    }
  }
  const sizeText = bytes < 1024 ? bytes + " B" : (bytes / 1024).toFixed(bytes < 1024 * 1024 ? 1 : 2) + (bytes < 1024 * 1024 ? " KB" : " MB");
  return { count, bytes, sizeText, indexed: keys.length > 0 };
}

function clearTranslationCacheData() {
  const keys = readCacheIndex();
  const stats = getCacheStats();
  for (const key of keys) {
    try { $.setdata("", key); } catch (e) { }
  }
  MEMORY_CACHE.clear();
  writeCacheIndex([]);
  return stats;
}

async function googleTranslateChunk(arr, target) {
  if (!arr.length) return [];
  const params = "client=gtx&dt=t&sl=auto&tl=" + encodeURIComponent(target);
  const body = arr.map(t => "q=" + encodeURIComponent(t)).join("&");
  const hosts = [
    "https://translate.googleapis.com/translate_a/t",
    "https://translate.google.com/translate_a/t"
  ];
  for (const host of hosts) {
    try {
      const res = await $.post({
        url: host + "?" + params,
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
        body: body,
        timeout: 8000
      });
      const raw = res && res.body;
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(data) && data.length === arr.length) {
        return data.map(item => Array.isArray(item) ? item[0] : String(item));
      }
    } catch (e) { }
  }
  return arr;
}

async function googleTranslateBatch(texts, target) {
  const arr = texts.map(String);
  if (!arr.length) return [];
  // 限制每片 20 条，并发打给 Google，大幅降低单次延迟并彻底避免超时回退
  const CHUNK_SIZE = 20;
  const chunks = [];
  for (let i = 0; i < arr.length; i += CHUNK_SIZE) {
    chunks.push(arr.slice(i, i + CHUNK_SIZE));
  }
  const chunkResults = await Promise.all(chunks.map(chunk => googleTranslateChunk(chunk, target)));
  const results = [];
  for (const r of chunkResults) results.push(...r);
  return results;
}

async function deepseekTranslateBatch(texts, targetLangName, cfg) {
  const arr = texts.map(String);
  if (!arr.length) return [];
  if (!cfg.deepseekKey) return arr;
  const systemPrompt =
    "You are a professional ACG translator. Translate each Japanese text to " + targetLangName +
    ". Preserve format, line breaks, and anime terms naturally. Return ONLY a JSON array of strings in exact same order and length: [\"trans1\", \"trans2\"]. No markdown code fence.";
  try {
    const res = await $.post({
      url: cfg.deepseekUrl,
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.deepseekKey },
      body: JSON.stringify({
        model: cfg.deepseekModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(arr) }
        ],
        temperature: 0.2
      }),
      timeout: 8000
    });
    let content = res && res.body;
    if (typeof content === "object" && content.choices) content = content.choices[0].message.content;
    else if (typeof content === "string") {
      const parsed = JSON.parse(content);
      content = parsed.choices[0].message.content;
    }
    content = String(content || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const result = JSON.parse(content);
    if (Array.isArray(result) && result.length === arr.length) return result;
  } catch (e) { }
  return arr;
}

// 统一批量翻译调度
async function translateBatch(texts, cfg) {
  if (!texts || !texts.length) return [];
  const target = cfg.targetLang || "zh-CN";
  const langConfig = LANG_MAP[target] || LANG_MAP["zh-CN"];
  const results = new Array(texts.length);
  const toFetch = [];
  const fetchIndices = [];

  for (let i = 0; i < texts.length; i++) {
    const original = texts[i];
    if (!original || !hasKanjiOrKana(original)) {
      results[i] = original;
      continue;
    }
    // 智能豁免纯中文：若开启豁免，且内容不含任何日文假名与韩文，且不是日文高频Tag，直接作为中文跳过
    if (cfg.skipChinese && !isJapanese(original) && !/[가-힯]/.test(original) && !PIXIV_TAG_DICT[original]) {
      results[i] = original;
      continue;
    }
    // 查本地持久化与内存缓存 (0ms 命中，滑屏不掉帧)
    const key = cacheKey(cfg.translator, target, original);
    const cached = cacheRead(key);
    if (cached !== undefined) {
      results[i] = cached;
    } else {
      toFetch.push(original);
      fetchIndices.push(i);
    }
  }

  if (!toFetch.length) return results;

  let translated = [];
  if (cfg.translator === "deepseek" && cfg.deepseekKey) {
    translated = await deepseekTranslateBatch(toFetch, langConfig.ai, cfg);
  } else {
    // 默认 Google 切片并发极速接口
    translated = await googleTranslateBatch(toFetch, langConfig.google);
  }

  for (let j = 0; j < toFetch.length; j++) {
    const val = (translated && translated[j]) ? translated[j] : toFetch[j];
    const original = toFetch[j];
    results[fetchIndices[j]] = val;
    cacheWrite(cacheKey(cfg.translator, target, original), val);
  }

  return results;
}

// ─── 5. 全页面 REST API 深度拦截汉化 ─────────────────────────────────────────────
async function handleApiRewrite(cfg) {
  const rawBody = $response.body;
  if (!rawBody) { $done({}); return; }

  let data = null;
  try {
    data = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  } catch (e) {
    $done({}); return;
  }

  if (!data || typeof data !== "object") { $done({}); return; }

  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";
  let modified = false;

  const isDetailPage = url.includes("/detail") || url.includes("/show");
  const isCommentPage = url.includes("/comments");

  // 1. Tag 离线字典快速处理：仅改写主标签为中文，副标签置空，消除两行重复字眼
  function processTags(tags) {
    if (!Array.isArray(tags)) return;
    for (const tag of tags) {
      if (!tag || typeof tag !== "object") continue;
      const dictVal = PIXIV_TAG_DICT[tag.name];
      if (dictVal) {
        tag.name = dictVal;
        tag.translated_name = null; // 关键：置空副标签，避免 Pixiv 上下两行同时渲染相同的中文！
        modified = true;
      } else if (tag.translated_name && isJapanese(tag.name)) {
        tag.name = tag.translated_name;
        tag.translated_name = null;
        modified = true;
      }
    }
  }

  // 收集待网络翻译的文字与写回钩子 (去重与轻量化映射)
  const textCallbackMap = new Map();
  function queueTranslate(text, callback) {
    if (!text || typeof text !== "string") return;
    if (!needsTranslation(text)) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!textCallbackMap.has(trimmed)) {
      textCallbackMap.set(trimmed, []);
    }
    textCallbackMap.get(trimmed).push(callback);
  }

  // A. 汇总所有作品列表 (插画 illusts/illust、首页榜单 ranking_illusts、小说 novels/novel、热门预览 popular_preview)
  const workList = [];
  if (Array.isArray(data.illusts)) workList.push(...data.illusts);
  if (Array.isArray(data.ranking_illusts)) workList.push(...data.ranking_illusts);
  if (data.illust && typeof data.illust === "object") workList.push(data.illust);
  if (Array.isArray(data.novels)) workList.push(...data.novels);
  if (Array.isArray(data.ranking_novels)) workList.push(...data.ranking_novels);
  if (data.novel && typeof data.novel === "object") workList.push(data.novel);
  if (Array.isArray(data.popular_preview)) workList.push(...data.popular_preview);
  if (Array.isArray(data.popular_permanent)) workList.push(...data.popular_permanent);

  // B. 发现页核心数据：处理趋势热门标签与插画 (trend_tags)
  // 关键防崩策略：严禁修改 item.tag（它是 DiffableDataSource 的主键），仅汉化 item.translated_name！
  if (Array.isArray(data.trend_tags)) {
    for (const item of data.trend_tags) {
      if (!item) continue;
      // 1. 仅汉化展示名称 translated_name，绝不改写 tag 键名，杜绝重复主键引发崩溃
      if (item.tag) {
        const dictVal = PIXIV_TAG_DICT[item.tag];
        if (dictVal) {
          item.translated_name = dictVal;
          modified = true;
        } else if (hasKanjiOrKana(item.tag)) {
          queueTranslate(item.tag, trans => { item.translated_name = trans; modified = true; });
        }
      }
      // 2. 汉化附带的封面插画作品
      if (item.illust && typeof item.illust === "object") {
        workList.push(item.illust);
      }
    }
  }

  // C. 支持推荐画师中的作品与作者简介 (user_previews)
  if (Array.isArray(data.user_previews)) {
    for (const up of data.user_previews) {
      if (!up) continue;
      if (Array.isArray(up.illusts)) workList.push(...up.illusts);
      if (Array.isArray(up.novels)) workList.push(...up.novels);
      if (up.user && hasKanjiOrKana(up.user.comment)) {
        queueTranslate(up.user.comment, trans => { up.user.comment = trans; modified = true; });
      }
    }
  }

  // D. 核心首页全景流 (v1/home/all 的 data.contents 结构，彻底解决首页不汉化)
  if (Array.isArray(data.contents)) {
    for (const c of data.contents) {
      if (!c) continue;
      if (c.pickup && typeof c.pickup === "object") {
        if (hasKanjiOrKana(c.pickup.title)) queueTranslate(c.pickup.title, trans => { c.pickup.title = trans; modified = true; });
        if (c.pickup.comment && needsTranslation(c.pickup.comment)) queueTranslate(c.pickup.comment, trans => { c.pickup.comment = trans; modified = true; });
      }
      if (Array.isArray(c.thumbnails)) {
        for (const t of c.thumbnails) {
          if (!t) continue;
          if (hasKanjiOrKana(t.title)) {
            queueTranslate(t.title, trans => { t.title = trans; modified = true; });
          }
          if (t.description && isJapanese(t.description)) {
            queueTranslate(t.description, trans => {
              t.description = trans.replace(/<\s*br\s*\/?>/gi, "<br />");
              modified = true;
            });
          }
          // 关键：Pixiv 客户端底层实际读取并渲染的是 t.app_model
          if (t.app_model && typeof t.app_model === "object") {
            if (hasKanjiOrKana(t.app_model.title)) {
              queueTranslate(t.app_model.title, trans => { t.app_model.title = trans; modified = true; });
            }
            if (t.app_model.caption && isJapanese(t.app_model.caption)) {
              queueTranslate(t.app_model.caption, trans => {
                t.app_model.caption = trans.replace(/<\s*br\s*\/?>/gi, "<br />");
                modified = true;
              });
            }
            if (t.app_model.tags) processTags(t.app_model.tags);
          }
          if (Array.isArray(t.tags)) {
            for (let ti = 0; ti < t.tags.length; ti++) {
              const tagStr = t.tags[ti];
              if (PIXIV_TAG_DICT[tagStr]) {
                t.tags[ti] = PIXIV_TAG_DICT[tagStr];
                modified = true;
              }
            }
          }
          if (Array.isArray(t.show_tags)) {
            for (let si = 0; si < t.show_tags.length; si++) {
              const tagStr = t.show_tags[si];
              if (PIXIV_TAG_DICT[tagStr]) {
                t.show_tags[si] = PIXIV_TAG_DICT[tagStr];
                modified = true;
              }
            }
          }
        }
      }
    }
  }

  for (const item of workList) {
    if (!item || typeof item !== "object") continue;
    if (item.tags) processTags(item.tags);

    // 标题翻译 (核心展示，卡片和榜单主视觉)
    if (cfg.scopes.includes("illust_title") && hasKanjiOrKana(item.title)) {
      queueTranslate(item.title, trans => { item.title = trans; modified = true; });
    }

    // 简介翻译：全量直接在页面翻译，彻底告别未翻译导致点击「查看更多」弹出日文弹窗
    if (cfg.scopes.includes("illust_caption") && item.caption && isJapanese(item.caption)) {
      queueTranslate(item.caption, trans => {
        const clean = trans.replace(/<\s*br\s*\/?>/gi, "<br />");
        item.caption = clean;
        modified = true;
      });
    }

    // 小说系列标题
    if (item.series && hasKanjiOrKana(item.series.title)) {
      queueTranslate(item.series.title, trans => { item.series.title = trans; modified = true; });
    }
  }

  // E. 处理评论区 (comments[] / sub_comments[]，支持日语及全球外语自动汉化)
  const comments = Array.isArray(data.comments) ? data.comments : [];
  if (comments.length > 0 && cfg.scopes.includes("comments")) {
    for (const c of comments) {
      if (!c) continue;
      if (needsTranslation(c.comment)) {
        queueTranslate(c.comment, trans => { c.comment = trans; modified = true; });
      }
      if (Array.isArray(c.sub_comments)) {
        for (const sub of c.sub_comments) {
          if (sub && needsTranslation(sub.comment)) {
            queueTranslate(sub.comment, trans => { sub.comment = trans; modified = true; });
          }
        }
      }
    }
  }

  // C. 处理画师用户主页资料 (user / profile)
  if (data.user && typeof data.user === "object" && cfg.scopes.includes("user_profile")) {
    if (hasKanjiOrKana(data.user.comment)) {
      queueTranslate(data.user.comment, trans => { data.user.comment = trans; modified = true; });
    }
  }

  // D. 处理特辑文章 (spotlight_articles[])
  const spotlights = Array.isArray(data.spotlight_articles) ? data.spotlight_articles : [];
  if (spotlights.length > 0 && cfg.scopes.includes("spotlight")) {
    for (const art of spotlights) {
      if (!art) continue;
      if (hasKanjiOrKana(art.title)) queueTranslate(art.title, trans => { art.title = trans; modified = true; });
      if (hasKanjiOrKana(art.intro)) queueTranslate(art.intro, trans => { art.intro = trans; modified = true; });
      if (hasKanjiOrKana(art.sub_title)) queueTranslate(art.sub_title, trans => { art.sub_title = trans; modified = true; });
    }
  }

  // 批量并发处理所有收集到的去重文本
  if (textCallbackMap.size > 0) {
    const rawTexts = Array.from(textCallbackMap.keys());
    const translatedList = await translateBatch(rawTexts, cfg);
    for (let i = 0; i < rawTexts.length; i++) {
      const trans = translatedList[i];
      if (trans && trans !== rawTexts[i]) {
        const callbacks = textCallbackMap.get(rawTexts[i]) || [];
        for (const cb of callbacks) cb(trans);
      }
    }
  }

  if (modified) {
    $done({ body: JSON.stringify(data) });
  } else {
    $done({});
  }
}

// ─── 6. 小说阅读器 & 页面注入 iOS SF Symbols「文/A」悬浮按钮与排版引擎 ────────
const SF_TRANSLATE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m5 8 6 6"/>
  <path d="m4 14 6-6 2-3"/>
  <path d="M2 5h12"/>
  <path d="M7 2h1"/>
  <path d="m22 22-5-10-5 10"/>
  <path d="M14 18h6"/>
</svg>
`;

const INJECT_CSS = `
#px-fab {
  position: fixed;
  right: 16px;
  bottom: calc(env(safe-area-inset-bottom, 20px) + 80px);
  z-index: 2147483647;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 0.5px solid rgba(255, 255, 255, 0.35);
  background: #0096fa;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s ease, background 0.3s ease;
}
#px-fab:active { transform: scale(0.92); }
#px-fab.px-busy { opacity: 0.55; }
#px-fab.px-done { background: #34c759 !important; }

/* 纯净小说排版 (100% 严格继承 Pixiv 原版字号、字体与颜色，并支持自定义字体) */
.pxtc-reader {
  max-width: 720px;
  margin: 0 auto;
  padding: 20px 16px 110px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.8;
}
.pxtc-reader.font-songti, .pxtc-reader.font-songti .pxtc-para {
  font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif !important;
}
.pxtc-reader.font-kaiti, .pxtc-reader.font-kaiti .pxtc-para {
  font-family: "Kaiti SC", "STKaiti", "KaiTi", "DFKai-SB", serif !important;
}
.pxtc-reader.font-yuanti, .pxtc-reader.font-yuanti .pxtc-para {
  font-family: "Yuanti SC", "STYuanti", "PingFang SC", sans-serif !important;
}
.pxtc-para {
  margin: 6px 0;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.8;
  word-break: break-word;
}
.translation-pair {
  margin: 0 0 1.4em;
  padding: 0 0 1.1em;
  border-bottom: 1px solid rgba(127, 127, 127, 0.16);
}
.translation-pair .original {
  color: inherit;
  line-height: 1.8;
}
.translation-pair .translated {
  margin-top: 0.45em;
  padding-left: 0.8em;
  border-left: 2px solid rgba(127, 127, 127, 0.28);
  color: inherit;
  opacity: 0.64;
  font-size: 0.94em;
  line-height: 1.75;
}
.translation-pair .translation-failed {
  margin-top: 0.45em;
  color: #c0392b;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
}
.px-hud-bubble {
  position: absolute;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  color: #111;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
  padding: 6px 10px;
  border-radius: 8px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.25);
  pointer-events: auto;
  border: 1px solid rgba(0, 0, 0, 0.08);
  word-break: break-word;
}
@media (prefers-color-scheme: dark) {
  .px-hud-bubble {
    background: rgba(20, 20, 20, 0.92);
    color: #eee;
    border-color: rgba(255, 255, 255, 0.15);
  }
}
`;

function clientRuntime() {
  (function () {
    var CFG = "__CONFIG_PLACEHOLDER__";
    var autoSwitch = CFG && typeof CFG === "object" ? !!CFG.autoSwitch : true;
    var cleanDisclaimer = CFG && typeof CFG === "object" ? !!CFG.novelCleanDisclaimer : true;
    var showOriginalText = CFG && typeof CFG === "object" ? CFG.novelShowOriginal !== false : true;
    var floatingSwitch = CFG && typeof CFG === "object" ? CFG.floatingSwitch !== false : true;
    var imageSwitch = CFG && typeof CFG === "object" ? CFG.imageSwitch !== false : true;

    var root = null;
    var reader = null;
    var originalDisplay = "";
    var currentMode = "ja"; // "ja" or "zh"
    var isTranslating = false;
    var cachedChineseHtml = null;

    function esc(s) {
      return String(s || "").replace(/[&<>"']/g, function (c) {
        return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;";
      });
    }

    function hasJapanese(text) {
      if (!text || typeof text !== "string") return false;
      return /[぀-ゟ゠-ヿ]/.test(text);
    }

    function openSettings() {
      window.location.href = "https://app-api.pixiv.net/settings/Enhanced";
    }

    // 检查小说是否本身就是中文或目标语言
    var rawText = "";
    try { rawText = window.pixiv && window.pixiv.novel ? window.pixiv.novel.text : ""; } catch (e) { }
    // 如果小说本身纯中文（无日文假名），零打扰纯净享受，不创建任何按钮与DOM
    if (rawText && !hasJapanese(rawText)) {
      return;
    }

    if (!floatingSwitch) {
      return;
    }

    // 创建右下角 iOS 原生毛玻璃悬浮按钮
    var fab = document.createElement("div");
    fab.id = "px-fab";
    fab.title = "点击翻译/还原 · 长按设置";
    fab.innerHTML = `__SVG_PLACEHOLDER__`;
    document.body.appendChild(fab);

    // 单击 → 触发翻译/还原；长按 500ms → 打开设置中心
    var pressTimer = null;
    function startPress(e) {
      pressTimer = setTimeout(function () {
        pressTimer = null;
        openSettings();
      }, 500);
    }
    function endPress(e) {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
        handleClick();
      }
    }
    function cancelPress(e) {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }
    fab.addEventListener("mousedown", startPress);
    fab.addEventListener("mouseup", endPress);
    fab.addEventListener("mouseleave", cancelPress);
    fab.addEventListener("touchstart", startPress, { passive: true });
    fab.addEventListener("touchend", endPress);
    fab.addEventListener("touchcancel", cancelPress);

    function splitParagraphs(text) {
      var t = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\n+|\n+$/g, "");
      return t ? t.split(/\n{2,}/) : [];
    }

    function splitLong(p, max) {
      var lines = p.split("\n");
      var out = [];
      var buf = "";
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if (l.length > max) {
          if (buf) { out.push(buf); buf = ""; }
          while (l.length > max) { out.push(l.substring(0, max)); l = l.substring(max); }
          if (l) out.push(l);
        } else {
          var n = buf ? buf + "\n" + l : l;
          if (n.length > max && buf) { out.push(buf); buf = l; } else { buf = n; }
        }
      }
      if (buf) out.push(buf);
      return out;
    }

    function buildBatches(paragraphs) {
      var batches = [];
      var cur = [];
      var curLen = 0;
      for (var i = 0; i < paragraphs.length; i++) {
        var p = paragraphs[i];
        if (p.length > 2500) {
          if (cur.length) { batches.push(cur); cur = []; curLen = 0; }
          var pieces = splitLong(p, 2500);
          for (var j = 0; j < pieces.length; j++) {
            if (cur.length && (cur.length >= 20 || curLen + pieces[j].length > 2500)) {
              batches.push(cur); cur = []; curLen = 0;
            }
            cur.push(pieces[j]); curLen += pieces[j].length;
          }
        } else {
          if (cur.length && (cur.length >= 20 || curLen + p.length > 2500)) {
            batches.push(cur); cur = []; curLen = 0;
          }
          cur.push(p); curLen += p.length;
        }
      }
      if (cur.length) batches.push(cur);
      return batches;
    }

    function buildReader() {
      if (reader) return true;
      root = document.getElementById("root");
      if (!root) return false;
      originalDisplay = root.style.display || "";
      reader = document.createElement("div");
      var fontCls = (CFG && CFG.novelFont && CFG.novelFont !== "system") ? " font-" + CFG.novelFont : "";
      reader.className = "pxtc-reader" + fontCls;
      var bodyStyle = window.getComputedStyle(document.body);
      var rootStyle = window.getComputedStyle(root);
      var pageBg = bodyStyle.backgroundColor || rootStyle.backgroundColor;
      if (pageBg && pageBg !== "transparent" && pageBg.indexOf("rgba(0, 0, 0, 0)") !== 0) {
        reader.style.background = pageBg;
      }
      var textColor = bodyStyle.color || rootStyle.color;
      if (textColor && textColor !== "transparent") {
        reader.style.color = textColor;
      }
      root.parentNode.insertBefore(reader, root.nextSibling);
      reader.style.display = "none";
      return true;
    }

    function showOriginal() {
      if (reader) reader.style.display = "none";
      if (root) root.style.display = originalDisplay;
      currentMode = "ja";
      fab.classList.remove("px-done");
    }

    function showTranslated() {
      if (root) root.style.display = "none";
      if (reader) reader.style.display = "block";
      currentMode = "zh";
      fab.classList.add("px-done");
    }

    function toggleNovelMode() {
      if (isTranslating) return;
      if (!cachedChineseHtml) {
        startNovelTranslate();
        return;
      }
      if (currentMode === "zh") {
        showOriginal();
      } else {
        showTranslated();
      }
    }

    async function startNovelTranslate() {
      if (isTranslating) return;
      var text = "";
      var title = "";
      var caption = "";
      var tags = [];
      var userName = "";

      try {
        if (window.pixiv && window.pixiv.novel) {
          text = window.pixiv.novel.text || "";
          title = window.pixiv.novel.title || "";
          caption = window.pixiv.novel.caption || "";
          tags = window.pixiv.novel.tags || [];
          userName = window.pixiv.novel.userName || "";
        }
      } catch (e) { }

      if (!text) return;
      if (!buildReader()) return;

      isTranslating = true;
      fab.classList.add("px-busy");

      var paragraphs = splitParagraphs(text);
      var batches = buildBatches(paragraphs);
      var allTranslations = new Array(batches.length);
      var batchStates = new Array(batches.length);
      var next = 0;
      async function worker() {
        while (next < batches.length) {
          var idx = next++;
          try {
            var bTexts = batches[idx];
            var res = await fetch("/pxtrans?t=novel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ texts: bTexts })
            }).then(function (r) { return r.json(); });
            if (res && Array.isArray(res.translations)) {
              allTranslations[idx] = res.translations;
              batchStates[idx] = "success";
            } else {
              allTranslations[idx] = [];
              batchStates[idx] = "failed";
            }
          } catch (e) {
            allTranslations[idx] = [];
            batchStates[idx] = "failed";
          }
        }
      }

      var workers = [];
      var concurrency = Math.min(3, batches.length);
      for (var w = 0; w < concurrency; w++) workers.push(worker());
      await Promise.all(workers);

      // 规约/免责/授权声明智能识别过滤函数
      function isDisclaimer(str) {
        if (!str || typeof str !== "string") return false;
        var s = str.trim();
        if (/^[・※*#\-—_~～\s]{2,}$/.test(s)) return true;
        if (/^(?:https?:\/\/|\b(?:fanbox|booth|twitter|x\.com)\b)/i.test(s)) return true;
        if (/^[・※*]/.test(s) && (s.includes("脚本") || s.includes("台本") || s.includes("商用") || s.includes("转载") || s.includes("责任") || s.includes("作者") || s.includes("URL") || s.includes("DM") || s.includes("费用") || s.includes("更改") || s.includes("改编"))) {
          return true;
        }
        if (/(?:免费脚本|免费台本|商用利用|商业用途|未经许可不得转载|禁止转载|无断转载|自作发言|自作発言|不承担任何责任|责任自负|请注明作者|情景语音|台本使用|使用规约|使用規約|使用规则|不收取任何费用|自由更改|更改对话)/i.test(s)) {
          return true;
        }
        return false;
      }

      // 按原文段落顺序生成段落对；失败段落保留原文，不冒充已完成。
      var html = "";
      var successCount = 0;
      var failedCount = 0;
      for (var i = 0; i < allTranslations.length; i++) {
        var originals = batches[i] || [];
        var translations = allTranslations[i] || [];
        for (var j = 0; j < originals.length; j++) {
          var original = String(originals[j] || "");
          var translated = String(translations[j] || "");
          if (!original.trim()) {
            html += '<div class="translation-pair empty"><div class="original">&nbsp;</div></div>';
            continue;
          }
          if (cleanDisclaimer && isDisclaimer(original)) continue;
          var ok = batchStates[i] === "success" && translated.trim();
          if (ok) {
            successCount++;
          } else {
            failedCount++;
          }
          html += '<div class="translation-pair">' +
            (showOriginalText || !ok ? '<div class="original">' + esc(original).replace(/\n/g, "<br>") + '</div>' : '') +
            (ok ? '<div class="translated">' + esc(translated).replace(/\n/g, "<br>") + '</div>' : '<div class="translation-failed">翻译失败 · 可重新翻译此段</div>') +
            '</div>';
        }
      }

      cachedChineseHtml = html;
      reader.innerHTML = html;
      isTranslating = false;
      fab.classList.remove("px-busy");
      fab.setAttribute("aria-label", failedCount ? "部分完成 · " + successCount + " / " + (successCount + failedCount) : "翻译完成");
      showTranslated();
    }

    // ─── 漫画 AI 视觉 HUD 漫翻 ───
    async function doMangaTranslate() {
      if (!imageSwitch) return;
      var images = document.querySelectorAll("img");
      if (!images.length) return;
      fab.classList.add("px-busy");
      var targetImg = images[0];
      var imgUrl = targetImg.src;
      try {
        targetImg.parentNode.querySelectorAll(".px-hud-bubble").forEach(function (node) { node.remove(); });
        var r = await fetch("/pxtrans?action=vision&url=" + encodeURIComponent(imgUrl)).then(function (res) { return res.json(); });
        if (r && Array.isArray(r.bubbles)) {
          r.bubbles.forEach(function (b) {
            var bubble = document.createElement("div");
            bubble.className = "px-hud-bubble";
            bubble.textContent = b.zh;
            bubble.style.top = b.box[0] + "%";
            bubble.style.left = b.box[1] + "%";
            bubble.style.maxWidth = (b.box[3] - b.box[1]) + "%";
            targetImg.parentNode.style.position = "relative";
            targetImg.parentNode.appendChild(bubble);
          });
        } else if (r && r.error) {
          fab.setAttribute("aria-label", "漫画翻译失败：" + r.error);
        }
      } catch (e) {
        fab.setAttribute("aria-label", "漫画翻译失败");
      }
      fab.classList.remove("px-busy");
    }

    function handleClick() {
      if (window.pixiv && window.pixiv.novel && window.pixiv.novel.text) {
        toggleNovelMode();
      } else {
        doMangaTranslate();
      }
    }

    // 默认自动翻译检测启动：如果开启了默认自动翻译，进入页面后自动点击触发悬浮按钮翻译
    if (autoSwitch) {
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        var t = "";
        try { t = window.pixiv && window.pixiv.novel ? window.pixiv.novel.text : ""; } catch (e) { }
        if (t && hasJapanese(t)) {
          clearInterval(timer);
          startNovelTranslate();
        } else if (tries >= 30) {
          clearInterval(timer);
        }
      }, 250);
    }
  })();
}

function handleWebviewInject(cfg) {
  const body = typeof $response.body === "string" ? $response.body : "";
  if (!body) { $done({}); return; }
  const clientConfig = {
    autoSwitch: cfg ? !!cfg.autoSwitch : true,
    targetLang: cfg ? cfg.targetLang : "zh-CN",
    novelFont: cfg ? (cfg.novelFont || "system") : "system",
    novelCleanDisclaimer: cfg ? !!cfg.novelCleanDisclaimer : true,
    novelShowOriginal: cfg ? cfg.novelShowOriginal !== false : true,
    floatingSwitch: cfg ? cfg.floatingSwitch !== false : true,
    imageSwitch: cfg ? cfg.imageSwitch !== false : true
  };
  const clientCode = clientRuntime.toString()
    .replace('"__CONFIG_PLACEHOLDER__"', JSON.stringify(clientConfig))
    .replace('__SVG_PLACEHOLDER__', SF_TRANSLATE_SVG.trim());
  const inject = '<style id="px-style">' + INJECT_CSS + '</style><script id="px-script">(' + clientCode + ')();</script>';
  let newBody = body;
  if (/<\/body>/i.test(body)) newBody = body.replace(/<\/body>/i, inject + "</body>");
  else newBody = body + inject;
  $done({ body: newBody });
}

function parseMangaBubbles(content) {
  let value = content;
  if (typeof value === "string") {
    value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try { value = JSON.parse(value); } catch (e) { return []; }
  }
  if (!Array.isArray(value)) value = value && (value.bubbles || value.items);
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && Array.isArray(item.box) && item.box.length === 4 && item.zh)
    .map(item => ({ box: item.box.map(Number), ja: String(item.ja || ""), zh: String(item.zh) }));
}

async function translateMangaImage(imageUrl, cfg) {
  const target = LANG_MAP[cfg.targetLang] || LANG_MAP["zh-CN"];
  const prompt = "Identify every readable dialogue bubble in this manga image. Return ONLY a JSON array. Each item must have box [top,left,bottom,right] as percentages from 0 to 100, ja for detected original text, and zh as the " + target.ai + " translation. Keep bubbles in reading order.";
  let endpoint = "";
  let key = "";
  let model = "";
  if (cfg.imageEngine === "deepseek_vl") {
    endpoint = cfg.deepseekUrl;
    key = cfg.deepseekKey;
    model = cfg.deepseekModel;
  } else if (cfg.imageEngine === "gpt4o_mini") {
    endpoint = cfg.openaiUrl;
    key = cfg.openaiKey;
    model = "gpt-4o-mini";
  } else {
    endpoint = (cfg.mangaServer || "").replace(/\/$/, "") + "/translate";
  }
  if (cfg.imageEngine !== "manga_translator" && !key) {
    throw new Error("未配置" + (cfg.imageEngine === "deepseek_vl" ? " DeepSeek" : " OpenAI") + " API Key");
  }
  if (!endpoint || endpoint === "/translate") throw new Error("未配置漫画翻译服务地址");

  let body;
  let headers = { "Content-Type": "application/json" };
  if (cfg.imageEngine === "manga_translator") {
    body = JSON.stringify({ image_url: imageUrl, target_lang: cfg.targetLang || "zh-CN" });
  } else {
    headers.Authorization = "Bearer " + key;
    body = JSON.stringify({
      model,
      messages: [{
        role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }],
      temperature: 0.1
    });
  }
  const response = await $.post({ url: endpoint, headers, body, timeout: 30000 });
  let payload = response && response.body;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch (e) { }
  }
  if (cfg.imageEngine === "manga_translator") {
    const bubbles = parseMangaBubbles(payload);
    if (!bubbles.length) throw new Error("漫画服务未返回有效气泡");
    return bubbles;
  }
  const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  const bubbles = parseMangaBubbles(content);
  if (!bubbles.length) throw new Error("视觉模型未返回有效气泡");
  return bubbles;
}

// ─── 7. 翻译中转代理与 AI 漫翻处理 (/pxtrans) ───────────────────────────────────
async function handleProxy(cfg) {
  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";
  const isVision = url.includes("action=vision");

  if (isVision) {
    const match = url.match(/url=([^&]+)/);
    const imgUrl = match ? decodeURIComponent(match[1]) : "";
    try {
      const bubbles = await translateMangaImage(imgUrl, cfg);
      doneWithResponse(200, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ ok: true, bubbles }));
    } catch (e) {
      doneWithResponse(502, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ ok: false, bubbles: [], error: String((e && e.message) || e) }));
    }
    return;
  }

  // 文本批量中转
  let texts = [];
  try {
    const raw = typeof $request.body === "string" ? JSON.parse($request.body) : $request.body;
    if (raw && Array.isArray(raw.texts)) texts = raw.texts;
  } catch (e) { }

  const translations = await translateBatch(texts, cfg);
  $done({
    response: {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: true, translations: translations })
    }
  });
}

function doneWithResponse(status, headers, body) {
  const payload = { status: status, headers: headers || {}, body: body };
  if (typeof $task !== "undefined") {
    $done({ response: { status: "HTTP/1.1 " + status, headers: payload.headers, body: payload.body } });
  } else {
    $done({ response: payload });
  }
}

function handleSettingsHTML() {
  doneWithResponse(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  }, SETTINGS_HTML);
}

function handleApiGet() {
  const keys = [
    "@Pixiv.Enhanced.Settings.Global.Switch",
    "@Pixiv.Enhanced.Settings.Auto.Switch",
    "@Pixiv.Enhanced.Settings.Auto.Scopes",
    "@Pixiv.Enhanced.Settings.Filter.SkipChinese",
    "@Pixiv.Enhanced.Settings.Novel.Font",
    "@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer",
    "@Pixiv.Enhanced.Settings.Novel.ShowOriginal",
    "@Pixiv.Enhanced.Settings.Floating.Switch",
    "@Pixiv.Enhanced.Settings.Translator.Source",
    "@Pixiv.Enhanced.Settings.Target.Lang",
    "@Pixiv.Enhanced.Settings.Tag.OfflineOnly",
    "@Pixiv.Enhanced.Settings.Image.Switch",
    "@Pixiv.Enhanced.Settings.Image.Engine",
    "@Pixiv.Enhanced.Settings.Image.RenderMode",
    "@Pixiv.Enhanced.Settings.Auth.DeepSeekKey",
    "@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl",
    "@Pixiv.Enhanced.Settings.Auth.DeepSeekModel",
    "@Pixiv.Enhanced.Settings.Auth.OpenAIKey",
    "@Pixiv.Enhanced.Settings.Auth.OpenAIUrl",
    "@Pixiv.Enhanced.Settings.Manga.ServerUrl",
    "@Pixiv.Enhanced.Settings.LogLevel"
  ];
  const out = {};
  for (const k of keys) {
    const v = $.getdata(k);
    if (v !== undefined && v !== null && v !== "") {
      if (v === "true") out[k] = true;
      else if (v === "false") out[k] = false;
      else if (/^[\[{]/.test(v)) {
        try { out[k] = JSON.parse(v); } catch (e) { out[k] = v; }
      } else out[k] = v;
    }
  }
  doneWithResponse(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }, JSON.stringify(out));
}

function handleApiSet() {
  let payload = {};
  try {
    payload = typeof $request.body === "string" ? JSON.parse($request.body) : ($request.body || {});
  } catch (e) { }
  if (payload.key && payload.value !== undefined) {
    const valStr = typeof payload.value === "object" ? JSON.stringify(payload.value) : String(payload.value);
    $.setdata(valStr, payload.key);
  } else if (typeof payload === "object") {
    for (const k of Object.keys(payload)) {
      const valStr = typeof payload[k] === "object" ? JSON.stringify(payload[k]) : String(payload[k]);
      $.setdata(valStr, k);
    }
  }
  doneWithResponse(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }, JSON.stringify({ saved: true }));
}

async function handleApiTestAI(cfg) {
  const start = Date.now();
  try {
    const res = await translateBatch(["こんにちは"], cfg);
    const latency = Date.now() - start;
    if (res && res[0] && res[0] !== "こんにちは") {
      doneWithResponse(200, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ ok: true, latency: latency, translation: res[0] }));
    } else {
      doneWithResponse(200, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ ok: false, error: "未返回有效译文，请检查API配置" }));
    }
  } catch (e) {
    doneWithResponse(200, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
  }
}

function handleApiClearCache() {
  const stats = clearTranslationCacheData();
  doneWithResponse(200, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ ok: true, count: stats.count, bytes: stats.bytes, sizeText: stats.sizeText }));
}

function handleApiCacheStats() {
  const stats = getCacheStats();
  doneWithResponse(200, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ ok: true, count: stats.count, bytes: stats.bytes, sizeText: stats.sizeText, indexed: stats.indexed }));
}

// ─── 8. 主入口分发 ─────────────────────────────────────────────────────────────
(async function main() {
  const cfg = loadConfig();

  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";

  // 1. 设置中心 HTML 页面 (本地离线瞬时秒开，对标 Pix-Scripting 苹果原生级视觉)
  if (url.includes("/settings/Enhanced")) {
    handleSettingsHTML();
    return;
  }

  // 2. 设置中心 API 存取与实时测速
  if (url.includes("/api/get")) {
    handleApiGet();
    return;
  }
  if (url.includes("/api/set")) {
    handleApiSet();
    return;
  }
  if (url.includes("/api/test_ai")) {
    await handleApiTestAI(cfg);
    return;
  }
  if (url.includes("/api/clear_cache")) {
    handleApiClearCache();
    return;
  }
  if (url.includes("/api/cache_stats")) {
    handleApiCacheStats();
    return;
  }

  if (!cfg.globalSwitch) { $done({}); return; }

  // 3. 翻译中转端点
  if (url.includes("/pxtrans")) {
    await handleProxy(cfg);
    return;
  }

  // 4. 小说 Webview 注入
  if (url.includes("/webview/v2/novel")) {
    handleWebviewInject(cfg);
    return;
  }

  // 5. 全页面 REST API 响应体拦截汉化
  if (typeof $response !== "undefined" && $response.body) {
    await handleApiRewrite(cfg);
    return;
  }

  $done({});
})().catch(function (e) {
  $.logErr((e && e.stack) || e);
  $done({});
});
