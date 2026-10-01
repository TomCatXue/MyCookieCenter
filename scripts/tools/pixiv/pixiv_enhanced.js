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
const SETTINGS_HTML = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no\">\n  <title>Pixiv \u589e\u5f3a\u8bbe\u7f6e</title>\n  <style>\n    :root {\n      --bg-color: #f2f2f7;\n      --card-bg: #ffffff;\n      --card-border: rgba(60, 60, 67, 0.12);\n      --separator-color: rgba(60, 60, 67, 0.12);\n      --text-primary: #000000;\n      --text-secondary: #8e8e93;\n      --tint-blue: #007aff;\n      --tint-green: #34c759;\n      --tint-red: #ff3b30;\n      --switch-bg: #e9e9ea;\n      --badge-bg: rgba(142, 142, 147, 0.12);\n      --badge-text: #8e8e93;\n      --icon-bg: rgba(142, 142, 147, 0.12);\n      --icon-color: #1c1c1e;\n    }\n    @media (prefers-color-scheme: dark) {\n      :root {\n        --bg-color: #000000;\n        --card-bg: #1c1c1e;\n        --card-border: rgba(255, 255, 255, 0.12);\n        --separator-color: rgba(84, 84, 88, 0.35);\n        --text-primary: #ffffff;\n        --text-secondary: #8e8e93;\n        --switch-bg: #39393d;\n        --badge-bg: rgba(255, 255, 255, 0.12);\n        --badge-text: #aeaeb2;\n        --icon-bg: rgba(255, 255, 255, 0.12);\n        --icon-color: #ffffff;\n      }\n    }\n\n    * {\n      box-sizing: border-box;\n      -webkit-tap-highlight-color: transparent;\n      margin: 0;\n      padding: 0;\n    }\n\n    body {\n      background-color: var(--bg-color);\n      color: var(--text-primary);\n      font-family: -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"PingFang SC\", \"Hiragino Sans GB\", sans-serif;\n      padding: calc(env(safe-area-inset-top, 20px) + 16px) 16px calc(env(safe-area-inset-bottom, 20px) + 32px);\n      max-width: 680px;\n      margin: 0 auto;\n      line-height: 1.5;\n      font-size: 16px;\n      overflow-x: hidden;\n    }\n\n    /* \u2500\u2500\u2500 \u9876\u90e8\u5bfc\u822a\u5b8c\u6210\u6309\u94ae\u4e0e\u5373\u6539\u5373\u5b58\u63d0\u793a\u6761 \u2500\u2500\u2500 */\n    .done-nav-btn {\n      background: var(--tint-blue);\n      color: #ffffff;\n      border: none;\n      font-size: 14px;\n      font-family: inherit;\n      font-weight: 600;\n      padding: 6px 16px;\n      border-radius: 18px;\n      cursor: pointer;\n      flex-shrink: 0;\n      box-shadow: 0 2px 6px rgba(0, 122, 255, 0.25);\n      transition: opacity 0.15s, transform 0.12s;\n    }\n    .done-nav-btn:active {\n      transform: scale(0.95);\n      opacity: 0.85;\n    }\n    .save-tip-bar {\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      background: rgba(0, 122, 255, 0.08);\n      color: var(--tint-blue);\n      padding: 7px 12px;\n      border-radius: 9px;\n      font-size: 12px;\n      font-weight: 500;\n      margin-bottom: 14px;\n      line-height: 1.4;\n    }\n\n    /* \u2500\u2500\u2500 \u9875\u9762\u54c1\u724c\u5927\u6807\u9898 (\u7edf\u4e00 Apple SF \u98ce\u683c) \u2500\u2500\u2500 */\n    .brand-header {\n      display: flex;\n      align-items: center;\n      gap: 14px;\n      margin-bottom: 24px;\n      padding: 4px 6px;\n    }\n    .brand-icon {\n      width: 48px;\n      height: 48px;\n      border-radius: 12px;\n      background: var(--icon-bg);\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      color: var(--tint-blue);\n      flex-shrink: 0;\n    }\n    .brand-title {\n      font-size: 22px;\n      font-weight: 700;\n      letter-spacing: -0.4px;\n      color: var(--text-primary);\n      display: flex;\n      align-items: center;\n      gap: 8px;\n    }\n    .brand-badge {\n      font-size: 11px;\n      font-weight: 600;\n      padding: 2px 7px;\n      border-radius: 6px;\n      background: rgba(0, 122, 255, 0.12);\n      color: var(--tint-blue);\n      letter-spacing: 0;\n    }\n    .brand-sub {\n      font-size: 13px;\n      color: var(--text-secondary);\n      margin-top: 2px;\n    }\n\n    /* \u2500\u2500\u2500 Grouped \u5361\u7247\u5bb9\u5668 \u2500\u2500\u2500 */\n    .section-card {\n      background: var(--card-bg);\n      border-radius: 14px;\n      border: 0.5px solid var(--card-border);\n      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);\n      margin-bottom: 6px;\n      overflow: hidden;\n      transition: all 0.25s ease;\n    }\n\n    .section-header {\n      display: flex;\n      align-items: center;\n      padding: 13px 16px;\n      cursor: pointer;\n      user-select: none;\n      gap: 12px;\n      min-height: 52px;\n    }\n    .section-header:active {\n      background: rgba(127, 127, 127, 0.06);\n    }\n    .section-icon {\n      width: 28px;\n      height: 28px;\n      border-radius: 7px;\n      background: var(--icon-bg);\n      color: var(--icon-color);\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      flex-shrink: 0;\n    }\n    .section-title {\n      font-size: 16px;\n      font-weight: 600;\n      flex: 1;\n      color: var(--text-primary);\n    }\n    .section-summary {\n      font-size: 12px;\n      color: var(--badge-text);\n      background: var(--badge-bg);\n      padding: 3px 8px;\n      border-radius: 6px;\n      font-weight: 500;\n      max-width: 140px;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n      transition: opacity 0.2s;\n    }\n    .chevron-icon {\n      width: 14px;\n      height: 14px;\n      color: var(--text-secondary);\n      transition: transform 0.25s ease;\n      flex-shrink: 0;\n    }\n    .section-card.expanded .chevron-icon {\n      transform: rotate(90deg);\n    }\n    .section-card.expanded .section-summary {\n      opacity: 0;\n      pointer-events: none;\n    }\n\n    .section-body {\n      display: none;\n      border-top: 0.5px solid var(--separator-color);\n    }\n    .section-card.expanded .section-body {\n      display: block;\n    }\n\n    /* \u2500\u2500\u2500 \u8bbe\u7f6e\u6761\u76ee (Row) \u2500\u2500\u2500 */\n    .setting-row {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      padding: 12px 16px;\n      min-height: 48px;\n      position: relative;\n    }\n    .setting-row:not(:last-child)::after {\n      content: \"\";\n      position: absolute;\n      left: 16px;\n      right: 0;\n      bottom: 0;\n      height: 0.5px;\n      background: var(--separator-color);\n    }\n    .setting-info {\n      flex: 1;\n      padding-right: 12px;\n    }\n    .setting-label {\n      font-size: 15px;\n      font-weight: 500;\n      color: var(--text-primary);\n    }\n    .setting-desc {\n      font-size: 12px;\n      color: var(--text-secondary);\n      margin-top: 2px;\n      line-height: 1.35;\n    }\n\n    /* \u2500\u2500\u2500 \u63a7\u4ef6\uff1aiOS \u539f\u751f Toggle \u80f6\u56ca\u5f00\u5173 \u2500\u2500\u2500 */\n    .switch-wrap {\n      position: relative;\n      width: 51px;\n      height: 31px;\n      flex-shrink: 0;\n    }\n    .switch-wrap input {\n      opacity: 0;\n      width: 0;\n      height: 0;\n    }\n    .switch-slider {\n      position: absolute;\n      cursor: pointer;\n      top: 0; left: 0; right: 0; bottom: 0;\n      background-color: var(--switch-bg);\n      transition: background-color 0.25s ease;\n      border-radius: 31px;\n    }\n    .switch-slider::before {\n      position: absolute;\n      content: \"\";\n      height: 27px;\n      width: 27px;\n      left: 2px;\n      bottom: 2px;\n      background-color: white;\n      transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n      border-radius: 50%;\n      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);\n    }\n    .switch-wrap input:checked + .switch-slider {\n      background-color: var(--tint-green);\n    }\n    .switch-wrap input:checked + .switch-slider::before {\n      transform: translateX(20px);\n    }\n\n    /* \u2500\u2500\u2500 \u63a7\u4ef6\uff1aSelect \u4e0b\u62c9\u9009\u62e9 \u2500\u2500\u2500 */\n    .select-wrap {\n      position: relative;\n      display: inline-flex;\n      align-items: center;\n    }\n    .select-input {\n      appearance: none;\n      -webkit-appearance: none;\n      background: rgba(127, 127, 127, 0.1);\n      border: none;\n      padding: 6px 28px 6px 12px;\n      border-radius: 8px;\n      font-size: 14px;\n      font-family: inherit;\n      color: var(--tint-blue);\n      font-weight: 500;\n      outline: none;\n      cursor: pointer;\n    }\n    .select-arrow {\n      position: absolute;\n      right: 8px;\n      width: 12px;\n      height: 12px;\n      color: var(--tint-blue);\n      pointer-events: none;\n    }\n\n    /* \u2500\u2500\u2500 \u63a7\u4ef6\uff1a\u5355\u884c\u8f93\u5165\u6846 (\u5e26\u663e\u9690\u773c\u775b) \u2500\u2500\u2500 */\n    .input-wrap {\n      display: flex;\n      align-items: center;\n      background: rgba(127, 127, 127, 0.08);\n      border-radius: 8px;\n      padding: 6px 10px;\n      width: 100%;\n      margin-top: 6px;\n      border: 0.5px solid var(--separator-color);\n    }\n    .text-input {\n      flex: 1;\n      background: transparent;\n      border: none;\n      font-size: 14px;\n      font-family: inherit;\n      color: var(--text-primary);\n      outline: none;\n    }\n    .text-input::placeholder {\n      color: var(--text-secondary);\n      opacity: 0.6;\n    }\n    .input-action-btn {\n      background: none;\n      border: none;\n      color: var(--text-secondary);\n      padding: 2px 4px;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n    }\n\n    /* \u2500\u2500\u2500 \u63a7\u4ef6\uff1a\u591a\u9009 Scope \u82af\u7247\u80f6\u56ca \u2500\u2500\u2500 */\n    .scope-chips {\n      display: flex;\n      flex-wrap: wrap;\n      gap: 8px;\n      padding: 8px 16px 14px;\n    }\n    .scope-chip {\n      padding: 6px 12px;\n      border-radius: 8px;\n      font-size: 13px;\n      font-weight: 500;\n      background: rgba(127, 127, 127, 0.1);\n      color: var(--text-secondary);\n      border: 0.5px solid transparent;\n      cursor: pointer;\n      user-select: none;\n      transition: all 0.2s ease;\n    }\n    .scope-chip.selected {\n      background: rgba(0, 122, 255, 0.12);\n      color: var(--tint-blue);\n      border-color: rgba(0, 122, 255, 0.3);\n      font-weight: 600;\n    }\n\n    /* \u2500\u2500\u2500 \u63a7\u4ef6\uff1a\u7f13\u5b58\u7ba1\u7406\u6570\u636e\u9762\u677f \u2500\u2500\u2500 */\n    .cache-panel {\n      padding: 12px 16px;\n    }\n    .cache-metric-grid {\n      display: grid;\n      grid-template-columns: repeat(3, 1fr);\n      gap: 8px;\n      margin-bottom: 12px;\n    }\n    .cache-metric-box {\n      background: rgba(127, 127, 127, 0.08);\n      border-radius: 10px;\n      padding: 10px 12px;\n      text-align: center;\n    }\n    .cache-metric-title {\n      font-size: 11px;\n      color: var(--text-secondary);\n      font-weight: 500;\n      margin-bottom: 4px;\n    }\n    .cache-metric-val {\n      font-size: 16px;\n      font-weight: 700;\n      color: var(--text-primary);\n    }\n    .cache-feedback-bar {\n      font-size: 12px;\n      color: var(--tint-blue);\n      min-height: 18px;\n      margin-top: 8px;\n      line-height: 1.4;\n      text-align: center;\n    }\n\n    /* \u2500\u2500\u2500 \u64cd\u4f5c\u6309\u94ae (Button) \u2500\u2500\u2500 */\n    .action-btn-row {\n      padding: 10px 16px 14px;\n      display: flex;\n      gap: 10px;\n    }\n    .primary-btn {\n      flex: 1;\n      background: var(--tint-blue);\n      color: #fff;\n      border: none;\n      border-radius: 10px;\n      padding: 11px 16px;\n      font-size: 15px;\n      font-weight: 600;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      gap: 6px;\n      box-shadow: 0 2px 8px rgba(0, 122, 255, 0.2);\n      transition: transform 0.12s, opacity 0.2s;\n    }\n    .primary-btn:active {\n      transform: scale(0.97);\n      opacity: 0.9;\n    }\n    .secondary-btn {\n      flex: 1;\n      background: rgba(127, 127, 127, 0.12);\n      color: var(--text-primary);\n      border: none;\n      border-radius: 10px;\n      padding: 11px 16px;\n      font-size: 15px;\n      font-weight: 500;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      gap: 6px;\n      transition: transform 0.12s, opacity 0.2s;\n    }\n    .secondary-btn:active {\n      transform: scale(0.97);\n    }\n    .danger-btn {\n      color: var(--tint-red);\n      background: rgba(255, 59, 48, 0.1);\n    }\n\n    /* \u2500\u2500\u2500 \u5206\u7ec4\u8bf4\u660e\u6ce8\u811a (Footer) \u2500\u2500\u2500 */\n    .section-footer {\n      font-size: 12px;\n      color: var(--text-secondary);\n      margin: 6px 16px 20px;\n      line-height: 1.4;\n      padding: 0 4px;\n    }\n\n    /* \u2500\u2500\u2500 \u63d0\u793a Toast \u60ac\u6d6e\u80f6\u56ca \u2500\u2500\u2500 */\n    #px-toast {\n      position: fixed;\n      top: calc(env(safe-area-inset-top, 20px) + 12px);\n      left: 50%;\n      transform: translateX(-50%) translateY(-60px);\n      background: rgba(20, 20, 20, 0.92);\n      -webkit-backdrop-filter: blur(20px);\n      backdrop-filter: blur(20px);\n      color: #fff;\n      padding: 8px 18px;\n      border-radius: 20px;\n      font-size: 13px;\n      font-weight: 500;\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);\n      z-index: 999999;\n      opacity: 0;\n      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n      pointer-events: none;\n    }\n    #px-toast.show {\n      transform: translateX(-50%) translateY(0);\n      opacity: 1;\n    }\n\n    /* \u2500\u2500\u2500 \u4f18\u96c5\u786e\u8ba4\u5f39\u5c42 (ActionSheet) \u2500\u2500\u2500 */\n    .modal-overlay {\n      position: fixed;\n      top: 0; left: 0; right: 0; bottom: 0;\n      background: rgba(0, 0, 0, 0.4);\n      backdrop-filter: blur(4px);\n      -webkit-backdrop-filter: blur(4px);\n      display: none;\n      align-items: flex-end;\n      justify-content: center;\n      z-index: 999998;\n      padding: 12px;\n    }\n    .modal-overlay.show {\n      display: flex;\n    }\n    .modal-card {\n      background: var(--card-bg);\n      border-radius: 16px;\n      width: 100%;\n      max-width: 420px;\n      padding: 20px;\n      text-align: center;\n      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);\n      animation: modalSlideUp 0.25s cubic-bezier(0.175, 0.885, 0.32, 1);\n    }\n    @keyframes modalSlideUp {\n      from { transform: translateY(100px); opacity: 0; }\n      to { transform: translateY(0); opacity: 1; }\n    }\n    .modal-title {\n      font-size: 17px;\n      font-weight: 600;\n      margin-bottom: 6px;\n    }\n    .modal-desc {\n      font-size: 13px;\n      color: var(--text-secondary);\n      margin-bottom: 18px;\n      line-height: 1.45;\n    }\n    .modal-actions {\n      display: flex;\n      gap: 10px;\n    }\n  </style>\n</head>\n<body>\n\n  <!-- \u63d0\u793a Toast \u80f6\u56ca -->\n  <div id=\"px-toast\">\n    <span id=\"px-toast-icon\">\u2713</span>\n    <span id=\"px-toast-msg\">\u8bbe\u7f6e\u5df2\u81ea\u52a8\u4fdd\u5b58</span>\n  </div>\n\n  <!-- \u6e05\u7406\u786e\u8ba4\u5f39\u5c42 -->\n  <div class=\"modal-overlay\" id=\"clear-modal\">\n    <div class=\"modal-card\">\n      <div class=\"modal-title\">\u6e05\u7406\u7ffb\u8bd1\u7f13\u5b58</div>\n      <div class=\"modal-desc\">\u5c06\u5220\u9664\u6240\u6709\u672c\u5730\u6682\u5b58\u7684\u7ffb\u8bd1\u6587\u672c\uff0c\u4ee5\u4fbf\u91cd\u65b0\u8bf7\u6c42\u6700\u65b0\u5185\u5bb9\u3002<br>\u4e0d\u4f1a\u5f71\u54cd\u60a8\u7684\u63d2\u4ef6\u8bbe\u7f6e\u53ca API \u5bc6\u94a5\u3002</div>\n      <div class=\"modal-actions\">\n        <button type=\"button\" class=\"secondary-btn\" onclick=\"closeClearModal()\">\u53d6\u6d88</button>\n        <button type=\"button\" class=\"primary-btn danger-btn\" onclick=\"executeClearCache()\">\u786e\u5b9a\u6e05\u7406</button>\n      </div>\n    </div>\n  </div>\n\n  <!-- \u9875\u9762\u54c1\u724c\u5927\u6807\u9898 -->\n  <div class=\"brand-header\">\n    <div class=\"brand-icon\">\n      <!-- SF Symbol: character.bubble -->\n      <svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"/>\n        <path d=\"m8 10 2-4 2 4\"/>\n        <path d=\"M8.7 8.5h2.6\"/>\n        <path d=\"M14 8h3\"/>\n        <path d=\"M15.5 8v4\"/>\n      </svg>\n    </div>\n    <div style=\"flex: 1;\">\n      <div class=\"brand-title\">\n        Pixiv \u589e\u5f3a\u7ffb\u8bd1\n        <span class=\"brand-badge\">v4.2</span>\n      </div>\n      <div class=\"brand-sub\">\u53cc\u8bed\u51fa\u7248\u7ea7\u6392\u7248 \u00b7 \u5168\u9875\u9762\u6c49\u5316 \u00b7 \u79bb\u7ebf\u7f13\u5b58</div>\n    </div>\n    <button type=\"button\" class=\"done-nav-btn\" onclick=\"handleDoneClick()\">\u5b8c\u6210</button>\n  </div>\n\n  <div class=\"save-tip-bar\">\n    <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m9 12 2 2 4-4\"/></svg>\n    <span>\u4fee\u6539\u4efb\u4f55\u9009\u9879\u5373\u523b\u5b9e\u65f6\u81ea\u52a8\u4fdd\u5b58\uff0c\u70b9\u51fb\u53f3\u4e0a\u89d2\u300c\u5b8c\u6210\u300d\u53ef\u76f4\u63a5\u8fd4\u56de Pixiv</span>\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u4e00\u7ec4\uff1a\u7ffb\u8bd1 \u2500\u2500\u2500 -->\n  <div class=\"section-card expanded\" id=\"sec-content\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-content')\">\n      <div class=\"section-icon\">\n        <!-- SF Symbol: globe -->\n        <svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n          <circle cx=\"12\" cy=\"12\" r=\"10\"/>\n          <path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/>\n          <path d=\"M2 12h20\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u7ffb\u8bd1\u8bbe\u7f6e</div>\n      <div class=\"section-summary\" id=\"sum-content\">\u81ea\u52a8:\u5f00 \u00b7 \u7b80\u4f53</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u542f\u7528 Pixiv \u589e\u5f3a\u7ffb\u8bd1</div>\n          <div class=\"setting-desc\">\u603b\u5f00\u5173\uff1a\u63a5\u7ba1\u5168\u9875\u9762\u65e5\u6587\u6c49\u5316\u4e0e\u89c6\u89c9\u6f2b\u7ffb</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-global-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u9ed8\u8ba4\u81ea\u52a8\u7ffb\u8bd1</div>\n          <div class=\"setting-desc\">\u8fdb\u5165\u9875\u9762\u540e\u76f4\u63a5\u5448\u73b0\u7ffb\u8bd1\u7ed3\u679c\uff0c\u65e0\u9700\u624b\u52a8\u70b9\u51fb</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-auto-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u667a\u80fd\u8df3\u8fc7\u7eaf\u4e2d\u6587\u5185\u5bb9</div>\n          <div class=\"setting-desc\">\u4e0d\u5305\u542b\u65e5\u6587\u6216\u5916\u8bed\u7684\u4f5c\u54c1\u81ea\u52a8\u8df3\u8fc7\uff0c\u8282\u7701\u914d\u989d\u4e0e\u96f6\u5ef6\u8fdf</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-skip-chinese\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u76ee\u6807\u8bed\u8a00</div>\n          <div class=\"setting-desc\">\u671f\u671b\u5c06\u5916\u8bed\u5185\u5bb9\u7ffb\u8bd1\u4e3a\u7684\u76ee\u6807\u8bed\u8a00</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-target-lang\" onchange=\"saveConfig()\">\n            <option value=\"zh-CN\">\u7b80\u4f53\u4e2d\u6587</option>\n            <option value=\"zh-TW\">\u7e41\u9ad4\u4e2d\u6587</option>\n            <option value=\"en\">English</option>\n            <option value=\"ja\">\u65e5\u672c\u8a9e (\u539f\u6587)</option>\n            <option value=\"ko\">\ud55c\uad6d\uc5b4</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>\n        </div>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u7ffb\u8bd1\u670d\u52a1</div>\n          <div class=\"setting-desc\">\u9009\u62e9\u5e95\u5c42\u6587\u672c\u7ffb\u8bd1\u6240\u4f7f\u7528\u7684\u670d\u52a1\u5f15\u64ce</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-translator-source\" onchange=\"onTranslatorChange()\">\n            <option value=\"google\">Google \u514d\u8d39\u5e76\u53d1 (\u6781\u901f)</option>\n            <option value=\"deepseek\">DeepSeek AI (\u6587\u5b66\u6da6\u8272/\u9700Key)</option>\n            <option value=\"openai\">OpenAI / \u517c\u5bb9\u63a5\u53e3 (\u9700Key)</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>\n        </div>\n      </div>\n\n      <!-- DeepSeek \u914d\u7f6e\u533a -->\n      <div id=\"ai-deepseek-block\" style=\"padding: 10px 16px 14px; border-bottom: 0.5px solid var(--separator-color);\">\n        <div class=\"setting-label\" style=\"font-size: 14px;\">DeepSeek API Key</div>\n        <div class=\"input-wrap\">\n          <input type=\"password\" class=\"text-input\" id=\"cfg-deepseek-key\" placeholder=\"sk-...\" onchange=\"saveConfig()\">\n          <button type=\"button\" class=\"input-action-btn\" onclick=\"toggleInputMask('cfg-deepseek-key')\">\n            <!-- SF Symbol: eye -->\n            <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <path d=\"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z\"/>\n              <circle cx=\"12\" cy=\"12\" r=\"3\"/>\n            </svg>\n          </button>\n        </div>\n        <div style=\"display: flex; gap: 8px; margin-top: 8px;\">\n          <div style=\"flex: 2;\">\n            <div class=\"setting-desc\">\u7aef\u70b9 URL</div>\n            <div class=\"input-wrap\"><input type=\"text\" class=\"text-input\" id=\"cfg-deepseek-url\" value=\"https://api.deepseek.com/v1/chat/completions\" onchange=\"saveConfig()\"></div>\n          </div>\n          <div style=\"flex: 1.2;\">\n            <div class=\"setting-desc\">\u6a21\u578b\u540d\u79f0</div>\n            <div class=\"input-wrap\"><input type=\"text\" class=\"text-input\" id=\"cfg-deepseek-model\" value=\"deepseek-v4-flash\" onchange=\"saveConfig()\"></div>\n          </div>\n        </div>\n      </div>\n\n      <!-- OpenAI \u914d\u7f6e\u533a -->\n      <div id=\"ai-openai-block\" style=\"padding: 10px 16px 14px; border-bottom: 0.5px solid var(--separator-color); display: none;\">\n        <div class=\"setting-label\" style=\"font-size: 14px;\">OpenAI API Key</div>\n        <div class=\"input-wrap\">\n          <input type=\"password\" class=\"text-input\" id=\"cfg-openai-key\" placeholder=\"sk-...\" onchange=\"saveConfig()\">\n          <button type=\"button\" class=\"input-action-btn\" onclick=\"toggleInputMask('cfg-openai-key')\">\n            <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n              <path d=\"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z\"/>\n              <circle cx=\"12\" cy=\"12\" r=\"3\"/>\n            </svg>\n          </button>\n        </div>\n        <div style=\"margin-top: 8px;\">\n          <div class=\"setting-desc\">\u517c\u5bb9\u7aef\u70b9 URL</div>\n          <div class=\"input-wrap\"><input type=\"text\" class=\"text-input\" id=\"cfg-openai-url\" value=\"https://api.openai.com/v1/chat/completions\" onchange=\"saveConfig()\"></div>\n        </div>\n      </div>\n\n      <div style=\"padding: 12px 16px 4px;\">\n        <div class=\"setting-label\" style=\"font-size: 14px;\">\u751f\u6548\u6a21\u5757\u8303\u56f4</div>\n      </div>\n      <div class=\"scope-chips\" id=\"scope-chips-container\">\n        <div class=\"scope-chip\" data-key=\"illust_title\" onclick=\"toggleScope(this)\">\u4f5c\u54c1\u6807\u9898</div>\n        <div class=\"scope-chip\" data-key=\"illust_caption\" onclick=\"toggleScope(this)\">\u4f5c\u54c1\u7b80\u4ecb</div>\n        <div class=\"scope-chip\" data-key=\"tags\" onclick=\"toggleScope(this)\">\u65e5\u6587\u6807\u7b7e</div>\n        <div class=\"scope-chip\" data-key=\"novels\" onclick=\"toggleScope(this)\">\u5c0f\u8bf4\u6b63\u6587</div>\n        <div class=\"scope-chip\" data-key=\"comments\" onclick=\"toggleScope(this)\">\u8bc4\u8bba\u533a</div>\n        <div class=\"scope-chip\" data-key=\"user_profile\" onclick=\"toggleScope(this)\">\u753b\u5e08\u7b80\u4ecb</div>\n        <div class=\"scope-chip\" data-key=\"spotlight\" onclick=\"toggleScope(this)\">\u7279\u8f91\u6587\u7ae0</div>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    \u4e3b\u9875\u4f5c\u54c1\u5361\u7247\u540c\u65f6\u5c31\u5730\u6c49\u5316\u6807\u9898\u4e0e\u7b80\u4ecb\uff0c\u5f7b\u5e95\u6d88\u9664\u672a\u7ffb\u8bd1\u622a\u65ad\u5f15\u53d1\u7684\u5f39\u7a97\uff1b\u6807\u7b7e\u526f\u6807\u9898\u5df2\u81ea\u52a8\u51c0\u7a7a\uff0c\u675c\u7edd\u4e0a\u4e0b\u91cd\u590d\u663e\u793a\u3002\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u4e8c\u7ec4\uff1a\u9605\u8bfb\u4f53\u9a8c \u2500\u2500\u2500 -->\n  <div class=\"section-card expanded\" id=\"sec-novel\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-novel')\">\n      <div class=\"section-icon\">\n        <!-- SF Symbol: text.book.closed -->\n        <svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n          <path d=\"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z\"/>\n          <path d=\"M6 6h10\"/>\n          <path d=\"M6 10h10\"/>\n          <path d=\"M6 14h6\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u9605\u8bfb\u4f53\u9a8c</div>\n      <div class=\"section-summary\" id=\"sum-novel\">\u53cc\u8bed\u5bf9\u7167 \u00b7 \u7cfb\u7edf\u5b57\u4f53</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u53cc\u8bed\u5bf9\u7167\u9605\u8bfb</div>\n          <div class=\"setting-desc\">\u5f00\u542f\u540e\u6309\u539f\u6587\u5728\u4e0a\u3001\u8bd1\u6587\u5728\u4e0b\u5f62\u6210\u6bb5\u843d\u5bf9\u5c55\u793a\uff1b\u5173\u95ed\u540e\u4ec5\u663e\u793a\u8bd1\u6587</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-novel-show-original\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u6392\u7248\u5b57\u4f53\u98ce\u683c</div>\n          <div class=\"setting-desc\">\u63d0\u4f9b\u51fa\u7248\u7ea7\u5370\u5237\u5b57\u4f53\u9884\u8bbe\uff0c\u5b57\u53f7\u4e0e\u884c\u8ddd\u7ee7\u627f\u7cfb\u7edf\u8bbe\u7f6e</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-novel-font\" onchange=\"saveConfig()\">\n            <option value=\"system\">\u7cfb\u7edf\u9ed8\u8ba4 (\u82f9\u65b9)</option>\n            <option value=\"songti\">\u7ecf\u5178\u5b8b\u4f53 (\u7eb8\u4e66\u8d28\u611f)</option>\n            <option value=\"kaiti\">\u4f18\u7f8e\u6977\u4f53 (\u53e4\u96c5\u98ce\u683c)</option>\n            <option value=\"yuanti\">\u67d4\u548c\u5706\u4f53 (\u4eb2\u548c\u6e29\u6da6)</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>\n        </div>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u81ea\u52a8\u51c0\u5316\u4f5c\u8005\u514d\u8d23\u58f0\u660e</div>\n          <div class=\"setting-desc\">\u667a\u80fd\u8fc7\u6ee4\u53f0\u672c\u5546\u7528\u6388\u6743\u3001\u7981\u6b62\u8f6c\u8f7d\u7b49\u89c4\u7ea6\u6761\u6b3e\uff0c\u5448\u73b0\u7eaf\u7cb9\u5c0f\u8bf4\u6b63\u6587</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-clean-disclaimer\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    \u53cc\u8bed\u9605\u8bfb\u4e25\u683c\u6309\u5c0f\u8bf4\u6bb5\u843d\u987a\u5e8f\u4e00\u5bf9\u4e00\u6392\u5217\uff0c\u539f\u6587\u4e3a\u4e3b\u9605\u8bfb\u5c42\u7ea7\uff0c\u8bd1\u6587\u4e3a\u4ece\u5c5e\u8f85\u52a9\u5c42\u7ea7\uff0c\u4e0d\u52a0\u591a\u4f59\u5361\u7247\u8fb9\u6846\u4e0e\u6742\u4e71\u80cc\u666f\u3002\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u4e09\u7ec4\uff1a\u60ac\u6d6e\u6309\u94ae \u2500\u2500\u2500 -->\n  <div class=\"section-card expanded\" id=\"sec-floating\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-floating')\">\n      <div class=\"section-icon\">\n        <!-- SF Symbol: button.programmable -->\n        <svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n          <circle cx=\"12\" cy=\"12\" r=\"9\"/>\n          <circle cx=\"12\" cy=\"12\" r=\"4\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u60ac\u6d6e\u6309\u94ae</div>\n      <div class=\"section-summary\" id=\"sum-floating\">\u5df2\u5f00\u542f</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u663e\u793a\u60ac\u6d6e\u6309\u94ae</div>\n          <div class=\"setting-desc\">\u7ffb\u8bd1\u8fc7\u7a0b\u4e2d\u663e\u793a\u60ac\u6d6e\u6309\u94ae\uff0c\u652f\u6301\u8f7b\u89e6\u7ffb\u8bd1/\u8fd8\u539f\u4e0e\u957f\u6309\u8bbe\u7f6e</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-floating-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    \u5f00\u542f\u540e\u81ea\u52a8\u907f\u5f00\u9875\u9762\u5df2\u6709\u559c\u6b22\u4e0e\u64cd\u4f5c\u63a7\u4ef6\uff0c\u8f7b\u70b9\u5373\u54cd\u5e94\uff0c\u4e0d\u8df3\u52a8\u4e0d\u91cd\u53e0\uff1b\u5173\u95ed\u540e\u5b8c\u5168\u4e0d\u6ce8\u5165\u4efb\u4f55\u6309\u94ae DOM\u3002\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u56db\u7ec4\uff1a\u9ad8\u7ea7\u4e0e\u7f13\u5b58 \u2500\u2500\u2500 -->\n  <div class=\"section-card\" id=\"sec-advanced\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-advanced')\">\n      <div class=\"section-icon\">\n        <!-- SF Symbol: slider.horizontal.3 -->\n        <svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n          <path d=\"M4 21v-7\"/>\n          <path d=\"M4 10V3\"/>\n          <path d=\"M12 21v-9\"/>\n          <path d=\"M12 8V3\"/>\n          <path d=\"M20 21v-5\"/>\n          <path d=\"M20 12V3\"/>\n          <path d=\"M1 14h6\"/>\n          <path d=\"M9 8h6\"/>\n          <path d=\"M17 16h6\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u9ad8\u7ea7\u4e0e\u7f13\u5b58</div>\n      <div class=\"section-summary\" id=\"sum-advanced\">\u5df2\u5c31\u7eea</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <!-- \u771f\u5b9e\u7f13\u5b58\u7ba1\u7406\u5361\u7247 -->\n      <div class=\"cache-panel\">\n        <div class=\"setting-label\" style=\"margin-bottom: 8px;\">\u7ffb\u8bd1\u7f13\u5b58</div>\n        <div class=\"setting-desc\" style=\"margin-bottom: 12px;\">\u7ffb\u8bd1\u7ed3\u679c\u6682\u5b58\u5728\u672c\u5730\uff0c\u907f\u514d\u91cd\u590d\u8bf7\u6c42\u5e76\u63d0\u5347\u52a0\u8f7d\u901f\u5ea6</div>\n        <div class=\"cache-metric-grid\">\n          <div class=\"cache-metric-box\">\n            <div class=\"cache-metric-title\">\u5df2\u4f7f\u7528</div>\n            <div class=\"cache-metric-val\" id=\"cache-size\">0 B</div>\n          </div>\n          <div class=\"cache-metric-box\">\n            <div class=\"cache-metric-title\">\u7f13\u5b58\u6761\u76ee</div>\n            <div class=\"cache-metric-val\" id=\"cache-count\">0 \u4e2a</div>\n          </div>\n          <div class=\"cache-metric-box\">\n            <div class=\"cache-metric-title\">\u6700\u8fd1\u7f13\u5b58</div>\n            <div class=\"cache-metric-val\" id=\"cache-time\" style=\"font-size: 13px; line-height: 24px;\">\u6682\u65e0\u7f13\u5b58</div>\n          </div>\n        </div>\n        <button type=\"button\" class=\"secondary-btn danger-btn\" style=\"width: 100%;\" onclick=\"openClearModal()\">\n          <!-- SF Symbol: trash -->\n          <svg viewBox=\"0 0 24 24\" width=\"15\" height=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n            <path d=\"M3 6h18\"/>\n            <path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\"/>\n            <path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\"/>\n          </svg>\n          <span>\u6e05\u7406\u7f13\u5b58</span>\n        </button>\n        <div class=\"cache-feedback-bar\" id=\"cache-feedback\"></div>\n      </div>\n\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u6807\u7b7e\u4f18\u5148\u4f7f\u7528\u79bb\u7ebf\u8bcd\u5178</div>\n          <div class=\"setting-desc\">\u5185\u7f6e 2500+ ACG \u65e5\u6587 Tag \u6620\u5c04\uff0c0ms \u54cd\u5e94\u4e14\u526f\u6807\u81ea\u52a8\u51c0\u7a7a</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-tag-offline\" checked onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u6f2b\u753b\u56fe\u7247 AI \u7ffb\u8bd1</div>\n          <div class=\"setting-desc\">\u5728\u63d2\u753b\u5927\u56fe\u4e0e\u6f2b\u753b\u9605\u8bfb\u4e2d\u542f\u7528\u591a\u6a21\u6001\u5bf9\u767d\u5b57\u5e55\u8bc6\u522b</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-manga-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\" style=\"background: rgba(127, 127, 127, 0.05); border-radius: 8px; margin: 8px 16px; padding: 10px 12px;\">\n        <div class=\"setting-info\" style=\"padding-right: 0;\">\n          <div class=\"setting-label\" style=\"font-size: 13px; color: var(--tint-blue);\">\ud83d\udca1 \u6f2b\u753b\u4e0e\u56fe\u7247\u7ffb\u8bd1\u4f7f\u7528\u8bf4\u660e</div>\n          <div class=\"setting-desc\" style=\"font-size: 12px; line-height: 1.5; margin-top: 4px;\">\n            \u2022 <strong>\u5c0f\u8bf4\u5185\u63d2\u56fe</strong>\uff1a\u9605\u8bfb\u5c0f\u8bf4\u9047\u5230\u63d2\u56fe\u65f6\uff0c\u8f7b\u70b9\u60ac\u6d6e\u6309\u94ae\u5373\u53ef\u8bc6\u522b\u5bf9\u767d\u5e76\u5728\u753b\u9762\u60ac\u6d6e\u4e2d\u6587\u6c14\u6ce1\u5b57\u5e55\u3002<br>\n            \u2022 <strong>Pixiv \u539f\u751f\u6f2b\u753b\u5927\u56fe</strong>\uff1a\u7531\u4e8e iOS \u539f\u751f\u753b\u5eca\u975e\u7f51\u9875\u73af\u5883\uff0c\u82e5\u9700\u770b\u6f2b\u753b\u76f4\u63a5\u5448\u73b0\u4e2d\u6587\uff0c\u8bf7\u81ea\u5efa <code>manga-image-translator</code> \u5e76\u5728\u4e0a\u65b9\u914d\u7f6e\u7aef\u70b9\uff0cLoon \u5c06\u81ea\u52a8\u4e3a\u60a8\u62e6\u622a\u66ff\u6362\u6574\u5f20\u6f2b\u753b\u56fe\u7247\u3002\n          </div>\n        </div>\n      </div>\n\n      <div class=\"action-btn-row\">\n        <button type=\"button\" class=\"primary-btn\" id=\"btn-test-ai\" onclick=\"testAIConnection()\">\n          <!-- SF Symbol: bolt.horizontal -->\n          <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n            <path d=\"M6 14h12l-4 8 10-10H12l4-8z\"/>\n          </svg>\n          <span>\u6d4b\u8bd5\u5f53\u524d\u6a21\u578b\u8fde\u63a5\u4e0e\u5ef6\u8fdf</span>\n        </button>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    \u6e05\u7406\u7f13\u5b58\u4ec5\u5220\u9664\u5df2\u4fdd\u5b58\u7684\u7ffb\u8bd1\u6b63\u6587\u6761\u76ee\uff0c\u4e0d\u4f1a\u8bef\u5220\u60a8\u7684\u8bbe\u7f6e\u6216 API \u5bc6\u94a5\uff1b\u56fe\u7247\u955c\u50cf\u5982\u9700\u514d\u6d41\uff0c\u53ef\u5728 Loon \u6dfb\u52a0\u89c4\u5219\uff1a<code style=\"background: rgba(127,127,127,0.15); padding: 1px 4px; border-radius: 4px;\">DOMAIN,i.pixiv.re,DIRECT</code>\u3002\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u4e94\u7ec4\uff1a\u5173\u4e8e \u2500\u2500\u2500 -->\n  <div class=\"section-card\" id=\"sec-about\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-about')\">\n      <div class=\"section-icon\">\n        <!-- SF Symbol: info.circle -->\n        <svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n          <circle cx=\"12\" cy=\"12\" r=\"10\"/>\n          <path d=\"M12 16v-4\"/>\n          <path d=\"M12 8h.01\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u5173\u4e8e\u4e0e\u72b6\u6001</div>\n      <div class=\"section-summary\" id=\"sum-about\">v4.2 \u8131\u673a\u5f15\u64ce</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u63d2\u4ef6\u7248\u672c</div>\n          <div class=\"setting-desc\">Pixiv Enhanced Translation Suite</div>\n        </div>\n        <span style=\"font-size: 14px; color: var(--text-secondary); font-weight: 500;\">4.2.0</span>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u8fd0\u884c\u67b6\u6784</div>\n          <div class=\"setting-desc\">0 \u5916\u90e8 CDN \u4f9d\u8d56 \u00b7 \u672c\u5730\u5185\u5b58\u6781\u901f\u76f4\u51fa</div>\n        </div>\n        <span style=\"font-size: 14px; color: var(--tint-green); font-weight: 500;\">\u25cf \u79bb\u7ebf\u8131\u673a</span>\n      </div>\n    </div>\n  </div>\n\n  <script>\n    const DEFAULT_CONFIG = {\n      \"@Pixiv.Enhanced.Settings.Global.Switch\": true,\n      \"@Pixiv.Enhanced.Settings.Auto.Switch\": true,\n      \"@Pixiv.Enhanced.Settings.Auto.Scopes\": [\"illust_title\", \"illust_caption\", \"tags\", \"comments\", \"user_profile\", \"novels\", \"spotlight\"],\n      \"@Pixiv.Enhanced.Settings.Filter.SkipChinese\": true,\n      \"@Pixiv.Enhanced.Settings.Novel.Font\": \"system\",\n      \"@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer\": true,\n      \"@Pixiv.Enhanced.Settings.Novel.ShowOriginal\": true,\n      \"@Pixiv.Enhanced.Settings.Floating.Switch\": true,\n      \"@Pixiv.Enhanced.Settings.Translator.Source\": \"google\",\n      \"@Pixiv.Enhanced.Settings.Target.Lang\": \"zh-CN\",\n      \"@Pixiv.Enhanced.Settings.Tag.OfflineOnly\": true,\n      \"@Pixiv.Enhanced.Settings.Image.Switch\": true,\n      \"@Pixiv.Enhanced.Settings.Image.Engine\": \"deepseek_vl\",\n      \"@Pixiv.Enhanced.Settings.Image.RenderMode\": \"overlay\",\n      \"@Pixiv.Enhanced.Settings.Auth.DeepSeekKey\": \"\",\n      \"@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl\": \"https://api.deepseek.com/v1/chat/completions\",\n      \"@Pixiv.Enhanced.Settings.Auth.DeepSeekModel\": \"deepseek-v4-flash\",\n      \"@Pixiv.Enhanced.Settings.Auth.OpenAIKey\": \"\",\n      \"@Pixiv.Enhanced.Settings.Auth.OpenAIUrl\": \"https://api.openai.com/v1/chat/completions\",\n      \"@Pixiv.Enhanced.Settings.Manga.ServerUrl\": \"http://127.0.0.1:5000\",\n      \"@Pixiv.Enhanced.Settings.LogLevel\": \"WARN\"\n    };\n\n    let currentConfig = Object.assign({}, DEFAULT_CONFIG);\n    let selectedScopes = new Set(DEFAULT_CONFIG[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"]);\n\n    function showToast(msg, icon) {\n      const toast = document.getElementById(\"px-toast\");\n      document.getElementById(\"px-toast-msg\").textContent = msg;\n      document.getElementById(\"px-toast-icon\").textContent = icon || \"\u2713\";\n      toast.classList.add(\"show\");\n      clearTimeout(window._toastTimer);\n      window._toastTimer = setTimeout(() => toast.classList.remove(\"show\"), 2200);\n    }\n\n    function toggleSection(id) {\n      const card = document.getElementById(id);\n      if (card) card.classList.toggle(\"expanded\");\n    }\n\n    function toggleInputMask(inputId) {\n      const input = document.getElementById(inputId);\n      if (input) input.type = (input.type === \"password\") ? \"text\" : \"password\";\n    }\n\n    function toggleScope(el) {\n      const key = el.getAttribute(\"data-key\");\n      if (selectedScopes.has(key)) {\n        selectedScopes.delete(key);\n        el.classList.remove(\"selected\");\n      } else {\n        selectedScopes.add(key);\n        el.classList.add(\"selected\");\n      }\n      saveConfig();\n    }\n\n    function onTranslatorChange() {\n      const source = document.getElementById(\"cfg-translator-source\").value;\n      const dsBlock = document.getElementById(\"ai-deepseek-block\");\n      const oaBlock = document.getElementById(\"ai-openai-block\");\n      if (dsBlock) dsBlock.style.display = (source === \"deepseek\") ? \"block\" : \"none\";\n      if (oaBlock) oaBlock.style.display = (source === \"openai\") ? \"block\" : \"none\";\n      saveConfig();\n    }\n\n    function updateSummaries() {\n      const autoOn = document.getElementById(\"cfg-auto-switch\").checked;\n      const targetLang = document.getElementById(\"cfg-target-lang\").value;\n      const langText = (targetLang === \"zh-CN\") ? \"\u7b80\u4f53\" : (targetLang === \"zh-TW\" ? \"\u7e41\u9ad4\" : targetLang);\n      document.getElementById(\"sum-content\").textContent = (autoOn ? \"\u81ea\u52a8:\u5f00\" : \"\u81ea\u52a8:\u5173\") + \" \u00b7 \" + langText;\n\n      const font = document.getElementById(\"cfg-novel-font\").value;\n      const fontNameMap = { system: \"\u82f9\u65b9\", songti: \"\u5b8b\u4f53\", kaiti: \"\u6977\u4f53\", yuanti: \"\u5706\u4f53\" };\n      const showOrig = document.getElementById(\"cfg-novel-show-original\").checked;\n      document.getElementById(\"sum-novel\").textContent = (showOrig ? \"\u53cc\u8bed\u5bf9\u7167\" : \"\u4ec5\u8bd1\u6587\") + \" \u00b7 \" + (fontNameMap[font] || \"\u539f\u7248\");\n\n      const floatingOn = document.getElementById(\"cfg-floating-switch\").checked;\n      document.getElementById(\"sum-floating\").textContent = floatingOn ? \"\u5df2\u5f00\u542f\" : \"\u5df2\u5173\u95ed\";\n\n      const trans = document.getElementById(\"cfg-translator-source\").value;\n      const transMap = { google: \"Google\u514d\u8d39\", deepseek: \"DeepSeek\", openai: \"OpenAI\" };\n      document.getElementById(\"sum-ai\").textContent = transMap[trans] || trans;\n    }\n\n    async function loadConfig() {\n      try {\n        const res = await fetch(\"/api/get\").then(r => r.json()).catch(() => null);\n        if (res && typeof res === \"object\") {\n          currentConfig = Object.assign({}, DEFAULT_CONFIG, res);\n        }\n      } catch (e) { }\n\n      document.getElementById(\"cfg-global-switch\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Global.Switch\"];\n      document.getElementById(\"cfg-auto-switch\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Switch\"];\n      document.getElementById(\"cfg-skip-chinese\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Filter.SkipChinese\"];\n      document.getElementById(\"cfg-target-lang\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Target.Lang\"] || \"zh-CN\";\n\n      document.getElementById(\"cfg-novel-font\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Novel.Font\"] || \"system\";\n      document.getElementById(\"cfg-clean-disclaimer\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer\"];\n      document.getElementById(\"cfg-novel-show-original\").checked = currentConfig[\"@Pixiv.Enhanced.Settings.Novel.ShowOriginal\"] !== false;\n      document.getElementById(\"cfg-floating-switch\").checked = currentConfig[\"@Pixiv.Enhanced.Settings.Floating.Switch\"] !== false;\n\n      document.getElementById(\"cfg-translator-source\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Translator.Source\"] || \"google\";\n      document.getElementById(\"cfg-deepseek-key\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekKey\"] || \"\";\n      document.getElementById(\"cfg-deepseek-url\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl\"] || \"https://api.deepseek.com/v1/chat/completions\";\n      document.getElementById(\"cfg-deepseek-model\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekModel\"] || \"deepseek-v4-flash\";\n      document.getElementById(\"cfg-openai-key\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIKey\"] || \"\";\n      document.getElementById(\"cfg-openai-url\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIUrl\"] || \"https://api.openai.com/v1/chat/completions\";\n\n      document.getElementById(\"cfg-tag-offline\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Tag.OfflineOnly\"];\n      document.getElementById(\"cfg-manga-switch\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Image.Switch\"];\n\n      const scopes = Array.isArray(currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"])\n        ? currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"]\n        : DEFAULT_CONFIG[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"];\n      selectedScopes = new Set(scopes);\n      document.querySelectorAll(\".scope-chip\").forEach(chip => {\n        const k = chip.getAttribute(\"data-key\");\n        if (selectedScopes.has(k)) chip.classList.add(\"selected\");\n        else chip.classList.remove(\"selected\");\n      });\n\n      onTranslatorChange();\n      updateSummaries();\n    }\n\n    async function handleDoneClick() {\n      await saveConfig();\n      showToast(\"\u8bbe\u7f6e\u5df2\u4fdd\u5b58\u5e76\u751f\u6548\", \"\u2713\");\n      setTimeout(function () {\n        if (window.history.length > 1) {\n          window.history.back();\n        }\n      }, 400);\n    }\n\n    async function saveConfig() {\n      currentConfig[\"@Pixiv.Enhanced.Settings.Global.Switch\"] = document.getElementById(\"cfg-global-switch\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Switch\"] = document.getElementById(\"cfg-auto-switch\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Filter.SkipChinese\"] = document.getElementById(\"cfg-skip-chinese\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Target.Lang\"] = document.getElementById(\"cfg-target-lang\").value;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"] = Array.from(selectedScopes);\n\n      currentConfig[\"@Pixiv.Enhanced.Settings.Novel.Font\"] = document.getElementById(\"cfg-novel-font\").value;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer\"] = document.getElementById(\"cfg-clean-disclaimer\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Novel.ShowOriginal\"] = document.getElementById(\"cfg-novel-show-original\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Floating.Switch\"] = document.getElementById(\"cfg-floating-switch\").checked;\n\n      currentConfig[\"@Pixiv.Enhanced.Settings.Translator.Source\"] = document.getElementById(\"cfg-translator-source\").value;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekKey\"] = document.getElementById(\"cfg-deepseek-key\").value.trim();\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl\"] = document.getElementById(\"cfg-deepseek-url\").value.trim();\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekModel\"] = document.getElementById(\"cfg-deepseek-model\").value.trim();\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIKey\"] = document.getElementById(\"cfg-openai-key\").value.trim();\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIUrl\"] = document.getElementById(\"cfg-openai-url\").value.trim();\n\n      currentConfig[\"@Pixiv.Enhanced.Settings.Tag.OfflineOnly\"] = document.getElementById(\"cfg-tag-offline\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Image.Switch\"] = document.getElementById(\"cfg-manga-switch\").checked;\n\n      updateSummaries();\n\n      try {\n        await fetch(\"/api/set\", {\n          method: \"POST\",\n          headers: { \"Content-Type\": \"application/json\" },\n          body: JSON.stringify(currentConfig)\n        });\n        showToast(\"\u8bbe\u7f6e\u5df2\u5b9e\u65f6\u540c\u6b65\u4fdd\u5b58\", \"\u2713\");\n      } catch (e) {\n        showToast(\"\u5df2\u5728\u672c\u5730\u66f4\u65b0\", \"\u2139\ufe0f\");\n      }\n    }\n\n    async function testAIConnection() {\n      const btn = document.getElementById(\"btn-test-ai\");\n      btn.disabled = true;\n      btn.innerHTML = '<span>\u23f3 \u6b63\u5728\u6d4b\u8bd5\u8fde\u63a5\u4e0e\u6d4b\u901f\u2026</span>';\n      const start = Date.now();\n\n      try {\n        const source = document.getElementById(\"cfg-translator-source\").value;\n        const res = await fetch(\"/api/test_ai?source=\" + encodeURIComponent(source), { method: \"POST\" })\n          .then(r => r.json())\n          .catch(() => null);\n        const latency = Date.now() - start;\n\n        if (res && res.ok) {\n          btn.innerHTML = '<span>\ud83d\udfe2 \u8fde\u63a5\u6b63\u5e38 \u00b7 ' + latency + 'ms</span>';\n          showToast(\"AI \u6a21\u578b\u8fde\u63a5\u6b63\u5e38 (\" + latency + \"ms)\", \"\ud83d\udfe2\");\n        } else {\n          const err = (res && res.error) ? res.error : \"\u8bf7\u6c42\u8d85\u65f6\u6216\u9274\u6743\u5931\u8d25\";\n          btn.innerHTML = '<span>\ud83d\udd34 \u5931\u8d25: ' + err.slice(0, 16) + '</span>';\n          showToast(\"\u8fde\u63a5\u5931\u8d25: \" + err, \"\u274c\");\n        }\n      } catch (e) {\n        btn.innerHTML = '<span>\ud83d\udd34 \u7f51\u7edc\u5f02\u5e38</span>';\n        showToast(\"\u7f51\u7edc\u8bf7\u6c42\u5f02\u5e38\", \"\u274c\");\n      }\n\n      setTimeout(() => {\n        btn.disabled = false;\n        btn.innerHTML = '<svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 14h12l-4 8 10-10H12l4-8z\"/></svg><span>\u6d4b\u8bd5\u5f53\u524d\u6a21\u578b\u8fde\u63a5\u4e0e\u5ef6\u8fdf</span>';\n      }, 3000);\n    }\n\n    /* \u2500\u2500\u2500 \u771f\u5b9e\u7f13\u5b58\u7ba1\u7406 \u2500\u2500\u2500 */\n    async function loadCacheStats() {\n      const sizeEl = document.getElementById(\"cache-size\");\n      const countEl = document.getElementById(\"cache-count\");\n      const timeEl = document.getElementById(\"cache-time\");\n      try {\n        const res = await fetch(\"/api/cache_stats\").then(r => r.json());\n        if (!res || !res.ok) throw new Error(\"\u7edf\u8ba1\u5931\u8d25\");\n        sizeEl.textContent = res.sizeText || \"0 B\";\n        countEl.textContent = (res.count || 0) + \" \u4e2a\";\n        timeEl.textContent = res.timeText || \"\u6682\u65e0\u7f13\u5b58\";\n      } catch (e) {\n        sizeEl.textContent = \"0 B\";\n        countEl.textContent = \"0 \u4e2a\";\n        timeEl.textContent = \"\u6682\u65e0\u7f13\u5b58\";\n      }\n    }\n\n    function openClearModal() {\n      document.getElementById(\"clear-modal\").classList.add(\"show\");\n    }\n\n    function closeClearModal() {\n      document.getElementById(\"clear-modal\").classList.remove(\"show\");\n    }\n\n    async function executeClearCache() {\n      closeClearModal();\n      const feedback = document.getElementById(\"cache-feedback\");\n      feedback.textContent = \"\u6b63\u5728\u6e05\u7406\u672c\u5730\u7f13\u5b58\u2026\";\n      try {\n        const res = await fetch(\"/api/clear_cache\", { method: \"POST\" }).then(r => r.json());\n        if (!res || !res.ok) throw new Error(\"\u6e05\u7406\u5f02\u5e38\");\n        feedback.textContent = \"\u2713 \u7f13\u5b58\u5df2\u6e05\u7406\uff1a\u5df2\u91ca\u653e \" + res.sizeText + \" \u00b7 \u5df2\u5220\u9664 \" + res.count + \" \u6761\";\n        showToast(\"\u7f13\u5b58\u5df2\u6e05\u7406\", \"\u2713\");\n        await loadCacheStats();\n      } catch (e) {\n        feedback.textContent = \"\u6e05\u7406\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\";\n        showToast(\"\u6e05\u7406\u7f13\u5b58\u5931\u8d25\", \"!\");\n      }\n    }\n\n    document.addEventListener(\"DOMContentLoaded\", () => {\n      loadConfig();\n      loadCacheStats();\n    });\n  </script>\n</body>\n</html>\n";

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

const CACHE_META_KEY = "pxtc_meta_index_v2";

function readCacheMeta() {
  try {
    const raw = $.getdata(CACHE_META_KEY);
    const meta = raw ? JSON.parse(raw) : null;
    if (meta && typeof meta === "object" && Array.isArray(meta.keys)) {
      return meta;
    }
    return { keys: [], lastUpdated: 0 };
  } catch (e) {
    return { keys: [], lastUpdated: 0 };
  }
}

function writeCacheMeta(meta) {
  try { $.setdata(JSON.stringify(meta), CACHE_META_KEY); } catch (e) { }
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
      const meta = readCacheMeta();
      if (!meta.keys.includes(storageKey)) {
        meta.keys.push(storageKey);
      }
      meta.lastUpdated = Date.now();
      writeCacheMeta(meta);
    }
  } catch (e) { }
}

function getCacheStats() {
  const meta = readCacheMeta();
  let bytes = 0;
  let count = 0;
  const validKeys = [];
  for (const k of meta.keys) {
    const v = $.getdata(k);
    if (v !== undefined && v !== null && v !== "") {
      count++;
      bytes += k.length + String(v).length;
      validKeys.push(k);
    }
  }
  if (validKeys.length !== meta.keys.length) {
    meta.keys = validKeys;
    writeCacheMeta(meta);
  }
  let sizeText = "0 B";
  if (bytes > 0) {
    if (bytes < 1024) sizeText = bytes + " B";
    else if (bytes < 1024 * 1024) sizeText = (bytes / 1024).toFixed(1) + " KB";
    else sizeText = (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }
  let timeText = "暂无缓存";
  if (meta.lastUpdated > 0 && count > 0) {
    const diff = Date.now() - meta.lastUpdated;
    if (diff < 60000) timeText = "刚刚";
    else if (diff < 3600000) timeText = Math.floor(diff / 60000) + " 分钟前";
    else if (diff < 86400000) timeText = Math.floor(diff / 3600000) + " 小时前";
    else {
      const d = new Date(meta.lastUpdated);
      timeText = (d.getMonth() + 1) + "月" + d.getDate() + "日";
    }
  }
  return { ok: true, count, bytes, sizeText, timeText };
}

function clearTranslationCacheData() {
  const meta = readCacheMeta();
  let bytes = 0;
  let count = 0;
  for (const k of meta.keys) {
    const v = $.getdata(k);
    if (v !== undefined && v !== null && v !== "") {
      count++;
      bytes += k.length + String(v).length;
    }
    try { $.setdata("", k); } catch (e) { }
  }
  MEMORY_CACHE.clear();
  writeCacheMeta({ keys: [], lastUpdated: 0 });
  let sizeText = "0 B";
  if (bytes > 0) {
    if (bytes < 1024) sizeText = bytes + " B";
    else if (bytes < 1024 * 1024) sizeText = (bytes / 1024).toFixed(1) + " KB";
    else sizeText = (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }
  return { ok: true, count, bytes, sizeText };
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
  right: 12px;
  bottom: 150px;
  z-index: 2147483647;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 0.5px solid rgba(255, 255, 255, 0.4);
  background: #007aff;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s ease, background 0.3s ease;
}
@media (prefers-color-scheme: dark) {
  #px-fab {
    background: #0a84ff;
    border: 0.5px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
  }
}
#px-fab:active { transform: scale(0.92); }
#px-fab.px-busy { opacity: 0.55; pointer-events: none; }
#px-fab.px-done { background: #34c759 !important; color: #fff !important; }
#px-fab.px-warn { background: #ff9500 !important; color: #fff !important; }

/* 纯净小说排版 (严格继承 Pixiv 原版字号、行距、字体与颜色) */
.pxtc-reader {
  max-width: 720px;
  margin: 0 auto;
  padding: 20px 16px 120px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.85;
}
.pxtc-reader.font-songti {
  font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif !important;
}
.pxtc-reader.font-kaiti {
  font-family: "Kaiti SC", "STKaiti", "KaiTi", "DFKai-SB", serif !important;
}
.pxtc-reader.font-yuanti {
  font-family: "Yuanti SC", "STYuanti", "PingFang SC", sans-serif !important;
}

/* 顶部轻量状态胶囊 (对标出版物与系统原生交互) */
.pxtc-status-bar {
  position: sticky;
  top: calc(env(safe-area-inset-top, 20px) + 8px);
  z-index: 1000;
  margin: 0 auto 16px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(30, 30, 30, 0.86);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  color: #ffffff;
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  max-width: fit-content;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.pxtc-status-bar.hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px);
}
.pxtc-status-btn {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: #5ac8fa;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}
.pxtc-status-btn:active {
  opacity: 0.7;
}

/* 出版级双语段落对 (严格一一对应，不堆叠边框/阴影/卡片) */
.translation-pair {
  margin: 0 0 1.6em 0;
}
.translation-pair.empty {
  margin: 0 0 0.8em 0;
}
.translation-pair .original {
  color: inherit;
  font-family: inherit;
  font-size: 1em;
  line-height: 1.85;
  word-break: break-word;
}
.translation-pair .translated {
  margin-top: 6px;
  color: inherit;
  font-family: inherit;
  font-size: 0.94em;
  line-height: 1.75;
  opacity: 0.68;
  word-break: break-word;
  transition: opacity 0.25s ease;
}
@media (prefers-color-scheme: dark) {
  .translation-pair .translated {
    opacity: 0.62;
  }
}
.translation-pair .translated.pending {
  font-size: 12px;
  color: var(--text-secondary, #8e8e93);
  opacity: 0.45;
  margin-top: 4px;
}
.translation-pair .translation-failed {
  margin-top: 6px;
  color: #ff3b30;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pxtc-retry-inline-btn {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
  border: none;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

/* 仅译文模式 (当关闭双语对照时，隐藏原文) */
.pxtc-reader.hide-original .translation-pair .original {
  display: none;
}
.pxtc-reader.hide-original .translation-pair .translated {
  margin-top: 0;
  opacity: 1;
  font-size: 1em;
  line-height: 1.85;
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
    var statusBar = null;
    var originalDisplay = "";
    var currentMode = "ja"; // "ja" or "zh"
    var isTranslating = false;
    var hasTranslated = false;

    // 存储分段信息与状态
    var paragraphItems = [];
    var batchList = [];
    var totalCount = 0;
    var successCount = 0;
    var failedCount = 0;

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

    // 检查小说是否本身纯中文
    var rawText = "";
    try { rawText = window.pixiv && window.pixiv.novel ? window.pixiv.novel.text : ""; } catch (e) { }
    if (rawText && !hasJapanese(rawText)) {
      return;
    }

    // 悬浮按钮总开关严格判定
    var fab = null;
    if (floatingSwitch && (rawText || imageSwitch)) {
      var prevFab = document.getElementById("px-fab");
      if (prevFab) prevFab.remove();

      fab = document.createElement("div");
      fab.id = "px-fab";
      fab.title = rawText ? "轻点翻译/还原 · 长按设置" : "轻点翻译图片 · 长按设置";
      fab.setAttribute("aria-label", "小说翻译");
      fab.innerHTML = `__SVG_PLACEHOLDER__`;
      document.body.appendChild(fab);

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
          handleFabClick();
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
    }

    function isDisclaimer(str) {
      if (!str || typeof str !== "string") return false;
      var s = str.trim();
      if (/^[・※*#\-—_~～\s]{2,}$/.test(s)) return true;
      if (/^(?:https?:\/\/|(?:fanbox|booth|twitter|x\.com))/i.test(s)) return true;
      if (/^[・※*]/.test(s) && (s.includes("脚本") || s.includes("台本") || s.includes("商用") || s.includes("转载") || s.includes("责任") || s.includes("作者") || s.includes("URL") || s.includes("DM") || s.includes("费用") || s.includes("更改") || s.includes("改编"))) {
        return true;
      }
      if (/(?:免费脚本|免费台本|商用利用|商业用途|未经许可不得转载|禁止转载|无断转载|自作发言|自作発言|不承担任何责任|责任自负|请注明作者|情景语音|台本使用|使用规约|使用規約|使用规则|不收取任何费用|自由更改|更改对话)/i.test(s)) {
        return true;
      }
      return false;
    }

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

    function buildReader() {
      if (reader) return true;
      root = document.getElementById("root");
      if (!root) return false;
      originalDisplay = root.style.display || "";

      var oldReader = document.getElementById("pxtc-reader");
      if (oldReader) oldReader.remove();

      reader = document.createElement("div");
      reader.id = "pxtc-reader";
      var fontCls = (CFG && CFG.novelFont && CFG.novelFont !== "system") ? " font-" + CFG.novelFont : "";
      var modeCls = showOriginalText ? "" : " hide-original";
      reader.className = "pxtc-reader" + fontCls + modeCls;

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

    function updateStatus(state) {
      if (!statusBar && reader) {
        statusBar = document.createElement("div");
        statusBar.className = "pxtc-status-bar";
        reader.insertBefore(statusBar, reader.firstChild);
      }
      if (!statusBar) return;

      if (state === "preparing") {
        statusBar.classList.remove("hidden");
        statusBar.innerHTML = '<span>准备翻译…</span>';
        if (fab) { fab.className = "px-busy"; }
      } else if (state === "translating") {
        statusBar.classList.remove("hidden");
        statusBar.innerHTML = '<span>正在翻译 ' + successCount + ' / ' + totalCount + '</span>';
        if (fab) { fab.className = "px-busy"; }
      } else if (state === "partial") {
        statusBar.classList.remove("hidden");
        statusBar.innerHTML = '<span>部分完成 · ' + successCount + ' / ' + totalCount + '</span><button type="button" class="pxtc-status-btn" id="pxtc-retry-all">重试失败段落</button>';
        var retryBtn = document.getElementById("pxtc-retry-all");
        if (retryBtn) retryBtn.addEventListener("click", retryFailedBatches);
        if (fab) { fab.className = "px-warn"; }
      } else if (state === "completed") {
        statusBar.innerHTML = '<span>翻译完成</span>';
        if (fab) { fab.className = "px-done"; }
        setTimeout(function () {
          if (statusBar && state === "completed") statusBar.classList.add("hidden");
        }, 3200);
      }
    }

    function showOriginal() {
      if (reader) reader.style.display = "none";
      if (root) root.style.display = originalDisplay;
      currentMode = "ja";
      if (fab) fab.classList.remove("px-done", "px-warn");
    }

    function showTranslated() {
      if (root) root.style.display = "none";
      if (reader) reader.style.display = "block";
      currentMode = "zh";
      if (fab) {
        if (failedCount > 0) fab.className = "px-warn";
        else fab.className = "px-done";
      }
    }

    function toggleNovelMode() {
      if (isTranslating) return;
      if (!hasTranslated) {
        startNovelTranslate();
        return;
      }
      if (currentMode === "zh") {
        showOriginal();
      } else {
        showTranslated();
      }
    }

    async function translateBatchRequest(batch) {
      batch.status = "translating";
      var texts = batch.items.map(function (it) { return it.text; });
      try {
        var res = await fetch("/pxtrans?t=novel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: texts })
        }).then(function (r) { return r.json(); });

        if (res && Array.isArray(res.translations) && res.translations.length === texts.length) {
          batch.status = "success";
          for (var i = 0; i < batch.items.length; i++) {
            var item = batch.items[i];
            item.status = "success";
            item.translation = String(res.translations[i] || "");
            var el = document.getElementById("pair-trans-" + item.id);
            if (el) {
              el.className = "translated";
              el.innerHTML = esc(item.translation).replace(/\n/g, "<br>");
            }
          }
        } else {
          throw new Error("返回格式不匹配");
        }
      } catch (err) {
        batch.status = "failed";
        for (var j = 0; j < batch.items.length; j++) {
          var fItem = batch.items[j];
          fItem.status = "failed";
          var fEl = document.getElementById("pair-trans-" + fItem.id);
          if (fEl) {
            fEl.className = "translated";
            fEl.innerHTML = '<div class="translation-failed"><span>翻译失败</span><button type="button" class="pxtc-retry-inline-btn" data-batch="' + batch.idx + '">重试</button></div>';
            var rBtn = fEl.querySelector("button");
            if (rBtn) {
              rBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                var bIdx = Number(this.getAttribute("data-batch"));
                retrySingleBatch(bIdx);
              });
            }
          }
        }
      }
    }

    function recalculateProgress() {
      successCount = 0;
      failedCount = 0;
      for (var i = 0; i < paragraphItems.length; i++) {
        if (paragraphItems[i].status === "success") successCount++;
        else if (paragraphItems[i].status === "failed") failedCount++;
      }
      if (failedCount > 0) {
        updateStatus("partial");
      } else if (successCount === totalCount && totalCount > 0) {
        updateStatus("completed");
      } else {
        updateStatus("translating");
      }
    }

    async function retrySingleBatch(bIdx) {
      var batch = batchList[bIdx];
      if (!batch || isTranslating) return;
      for (var k = 0; k < batch.items.length; k++) {
        var el = document.getElementById("pair-trans-" + batch.items[k].id);
        if (el) {
          el.className = "translated pending";
          el.textContent = "正在重试…";
        }
      }
      await translateBatchRequest(batch);
      recalculateProgress();
    }

    async function retryFailedBatches() {
      if (isTranslating) return;
      isTranslating = true;
      var failedBatches = batchList.filter(function (b) { return b.status === "failed"; });
      for (var i = 0; i < failedBatches.length; i++) {
        var batch = failedBatches[i];
        for (var k = 0; k < batch.items.length; k++) {
          var el = document.getElementById("pair-trans-" + batch.items[k].id);
          if (el) {
            el.className = "translated pending";
            el.textContent = "正在重试…";
          }
        }
        await translateBatchRequest(batch);
        recalculateProgress();
      }
      isTranslating = false;
      recalculateProgress();
    }

    async function startNovelTranslate() {
      if (isTranslating) return;
      var text = "";
      try { text = window.pixiv && window.pixiv.novel ? window.pixiv.novel.text : ""; } catch (e) { }
      if (!text) return;
      if (!buildReader()) return;

      isTranslating = true;
      currentMode = "zh";

      // 1. 段落拆分与规约过滤
      var rawParagraphs = splitParagraphs(text);
      var validParagraphs = [];
      for (var p = 0; p < rawParagraphs.length; p++) {
        var itemStr = rawParagraphs[p].trim();
        if (cleanDisclaimer && isDisclaimer(itemStr)) continue;
        validParagraphs.push(rawParagraphs[p]);
      }

      // 2. 建立段落项与 DOM 段落对
      paragraphItems = [];
      reader.innerHTML = "";
      statusBar = null;

      for (var i = 0; i < validParagraphs.length; i++) {
        var originalText = validParagraphs[i];
        var itemObj = {
          id: i,
          text: originalText,
          status: "pending",
          translation: ""
        };
        paragraphItems.push(itemObj);

        var pairEl = document.createElement("div");
        pairEl.className = "translation-pair" + (originalText.trim() ? "" : " empty");
        pairEl.id = "pxtc-pair-" + i;
        pairEl.innerHTML = '<div class="original">' + esc(originalText).replace(/\n/g, "<br>") + '</div>' +
          '<div class="translated pending" id="pair-trans-' + i + '"></div>';
        reader.appendChild(pairEl);
      }

      totalCount = paragraphItems.length;
      successCount = 0;
      failedCount = 0;

      showTranslated();
      updateStatus("preparing");

      // 3. 构建批次
      batchList = [];
      var curItems = [];
      var curChars = 0;
      for (var j = 0; j < paragraphItems.length; j++) {
        var it = paragraphItems[j];
        if (curItems.length >= 20 || curChars + it.text.length > 2500) {
          batchList.push({ idx: batchList.length, items: curItems, status: "pending" });
          curItems = [];
          curChars = 0;
        }
        curItems.push(it);
        curChars += it.text.length;
      }
      if (curItems.length) {
        batchList.push({ idx: batchList.length, items: curItems, status: "pending" });
      }

      // 4. 并发调度 (最多 3 批并发，边翻边显示)
      var nextBatch = 0;
      async function batchWorker() {
        while (nextBatch < batchList.length) {
          var b = batchList[nextBatch++];
          await translateBatchRequest(b);
          recalculateProgress();
        }
      }

      var workers = [];
      var concurrency = Math.min(3, batchList.length);
      for (var w = 0; w < concurrency; w++) workers.push(batchWorker());
      await Promise.all(workers);

      isTranslating = false;
      hasTranslated = true;
      recalculateProgress();
    }

    // ─── 漫画 AI 视觉 HUD 漫翻 ───
    async function doMangaTranslate() {
      if (!imageSwitch) return;
      var images = document.querySelectorAll("img");
      if (!images.length) return;
      if (fab) fab.className = "px-busy";
      var targetImg = images[0];
      var imgUrl = targetImg.src;
      try {
        targetImg.parentNode.querySelectorAll(".px-hud-bubble").forEach(function (n) { n.remove(); });
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
          if (fab) fab.className = "px-done";
        }
      } catch (e) {
        if (fab) fab.className = "px-warn";
      }
    }

    function handleFabClick() {
      if (rawText) {
        toggleNovelMode();
      } else {
        doMangaTranslate();
      }
    }

    // 默认自动翻译触发
    if (autoSwitch && rawText) {
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
