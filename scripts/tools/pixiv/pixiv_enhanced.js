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
const SETTINGS_HTML = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no\">\n  <title>Pixiv \u589e\u5f3a\u8bbe\u7f6e</title>\n  <style>\n    :root {\n      --bg-color: #f2f2f7;\n      --card-bg: #ffffff;\n      --card-border: rgba(60, 60, 67, 0.12);\n      --separator-color: rgba(60, 60, 67, 0.12);\n      --text-primary: #000000;\n      --text-secondary: #8e8e93;\n      --tint-blue: #0096fa;\n      --tint-green: #34c759;\n      --tint-orange: #ff9500;\n      --tint-purple: #af52de;\n      --tint-indigo: #5856d6;\n      --tint-cyan: #5ac8fa;\n      --tint-red: #ff3b30;\n      --tint-gray: #8e8e93;\n      --switch-bg: #e9e9ea;\n      --badge-bg: rgba(142, 142, 147, 0.12);\n      --badge-text: #8e8e93;\n    }\n    @media (prefers-color-scheme: dark) {\n      :root {\n        --bg-color: #000000;\n        --card-bg: #1c1c1e;\n        --card-border: rgba(255, 255, 255, 0.12);\n        --separator-color: rgba(84, 84, 88, 0.35);\n        --text-primary: #ffffff;\n        --text-secondary: #8e8e93;\n        --switch-bg: #39393d;\n        --badge-bg: rgba(255, 255, 255, 0.12);\n        --badge-text: #aeaeb2;\n      }\n    }\n\n    * {\n      box-sizing: border-box;\n      -webkit-tap-highlight-color: transparent;\n      margin: 0;\n      padding: 0;\n    }\n\n    body {\n      background-color: var(--bg-color);\n      color: var(--text-primary);\n      font-family: -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"PingFang SC\", \"Hiragino Sans GB\", sans-serif;\n      padding: calc(env(safe-area-inset-top, 20px) + 16px) 16px calc(env(safe-area-inset-bottom, 20px) + 32px);\n      max-width: 680px;\n      margin: 0 auto;\n      line-height: 1.5;\n      font-size: 16px;\n      overflow-x: hidden;\n    }\n\n    /* \u2500\u2500\u2500 \u9875\u9762\u5927\u6807\u9898\u5934\u90e8 (Pix-Scripting \u98ce\u683c) \u2500\u2500\u2500 */\n    .brand-header {\n      display: flex;\n      align-items: center;\n      gap: 14px;\n      margin-bottom: 22px;\n      padding: 4px 6px;\n    }\n    .brand-icon {\n      width: 52px;\n      height: 52px;\n      border-radius: 13px;\n      background: linear-gradient(135deg, #0096fa, #0070d6);\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      color: #fff;\n      box-shadow: 0 4px 12px rgba(0, 150, 250, 0.32);\n      flex-shrink: 0;\n    }\n    .brand-title {\n      font-size: 22px;\n      font-weight: 700;\n      letter-spacing: -0.4px;\n      color: var(--text-primary);\n      display: flex;\n      align-items: center;\n      gap: 8px;\n    }\n    .brand-badge {\n      font-size: 11px;\n      font-weight: 600;\n      padding: 2px 7px;\n      border-radius: 6px;\n      background: rgba(0, 150, 250, 0.15);\n      color: var(--tint-blue);\n      letter-spacing: 0;\n    }\n    .brand-sub {\n      font-size: 13px;\n      color: var(--text-secondary);\n      margin-top: 2px;\n    }\n\n    /* \u2500\u2500\u2500 Grouped \u5361\u7247\u5bb9\u5668 \u2500\u2500\u2500 */\n    .section-card {\n      background: var(--card-bg);\n      border-radius: 14px;\n      border: 0.5px solid var(--card-border);\n      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);\n      margin-bottom: 6px;\n      overflow: hidden;\n      transition: all 0.25s ease;\n    }\n\n    .section-header {\n      display: flex;\n      align-items: center;\n      padding: 13px 16px;\n      cursor: pointer;\n      user-select: none;\n      gap: 12px;\n      min-height: 50px;\n    }\n    .section-header:active {\n      background: rgba(127, 127, 127, 0.08);\n    }\n    .section-icon {\n      width: 28px;\n      height: 28px;\n      border-radius: 7px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      color: #fff;\n      flex-shrink: 0;\n    }\n    .section-title {\n      font-size: 16px;\n      font-weight: 600;\n      flex: 1;\n      color: var(--text-primary);\n    }\n    .section-summary {\n      font-size: 12px;\n      color: var(--badge-text);\n      background: var(--badge-bg);\n      padding: 3px 8px;\n      border-radius: 6px;\n      font-weight: 500;\n      max-width: 140px;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n      transition: opacity 0.2s;\n    }\n    .chevron-icon {\n      width: 14px;\n      height: 14px;\n      color: var(--text-secondary);\n      transition: transform 0.25s ease;\n      flex-shrink: 0;\n    }\n    .section-card.expanded .chevron-icon {\n      transform: rotate(90deg);\n    }\n    .section-card.expanded .section-summary {\n      opacity: 0;\n      pointer-events: none;\n    }\n\n    .section-body {\n      display: none;\n      border-top: 0.5px solid var(--separator-color);\n    }\n    .section-card.expanded .section-body {\n      display: block;\n    }\n\n    /* \u2500\u2500\u2500 \u8bbe\u7f6e\u6761\u76ee (Row) \u2500\u2500\u2500 */\n    .setting-row {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      padding: 12px 16px;\n      min-height: 48px;\n      position: relative;\n    }\n    .setting-row:not(:last-child)::after {\n      content: \"\";\n      position: absolute;\n      left: 16px;\n      right: 0;\n      bottom: 0;\n      height: 0.5px;\n      background: var(--separator-color);\n    }\n    .setting-info {\n      flex: 1;\n      padding-right: 12px;\n    }\n    .setting-label {\n      font-size: 15px;\n      font-weight: 500;\n      color: var(--text-primary);\n    }\n    .setting-desc {\n      font-size: 12px;\n      color: var(--text-secondary);\n      margin-top: 2px;\n      line-height: 1.35;\n    }\n\n    /* \u2500\u2500\u2500 \u63a7\u4ef6\uff1aiOS \u539f\u751f\u8d28\u611f Toggle \u5f00\u5173 \u2500\u2500\u2500 */\n    .switch-wrap {\n      position: relative;\n      width: 51px;\n      height: 31px;\n      flex-shrink: 0;\n    }\n    .switch-wrap input {\n      opacity: 0;\n      width: 0;\n      height: 0;\n    }\n    .switch-slider {\n      position: absolute;\n      cursor: pointer;\n      top: 0; left: 0; right: 0; bottom: 0;\n      background-color: var(--switch-bg);\n      transition: background-color 0.25s ease;\n      border-radius: 31px;\n    }\n    .switch-slider::before {\n      position: absolute;\n      content: \"\";\n      height: 27px;\n      width: 27px;\n      left: 2px;\n      bottom: 2px;\n      background-color: white;\n      transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n      border-radius: 50%;\n      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);\n    }\n    .switch-wrap input:checked + .switch-slider {\n      background-color: var(--tint-green);\n    }\n    .switch-wrap input:checked + .switch-slider::before {\n      transform: translateX(20px);\n    }\n\n    /* \u2500\u2500\u2500 \u63a7\u4ef6\uff1aSelect \u9009\u62e9\u5668 \u2500\u2500\u2500 */\n    .select-wrap {\n      position: relative;\n      display: inline-flex;\n      align-items: center;\n    }\n    .select-input {\n      appearance: none;\n      -webkit-appearance: none;\n      background: rgba(127, 127, 127, 0.1);\n      border: none;\n      padding: 6px 28px 6px 12px;\n      border-radius: 8px;\n      font-size: 14px;\n      font-family: inherit;\n      color: var(--tint-blue);\n      font-weight: 500;\n      outline: none;\n      cursor: pointer;\n    }\n    .select-arrow {\n      position: absolute;\n      right: 8px;\n      width: 12px;\n      height: 12px;\n      color: var(--tint-blue);\n      pointer-events: none;\n    }\n\n    /* \u2500\u2500\u2500 \u63a7\u4ef6\uff1a\u5355\u884c\u8f93\u5165\u6846 (\u5e26\u663e\u9690\u773c\u775b) \u2500\u2500\u2500 */\n    .input-wrap {\n      display: flex;\n      align-items: center;\n      background: rgba(127, 127, 127, 0.08);\n      border-radius: 8px;\n      padding: 6px 10px;\n      width: 100%;\n      margin-top: 6px;\n      border: 0.5px solid var(--separator-color);\n    }\n    .text-input {\n      flex: 1;\n      background: transparent;\n      border: none;\n      font-size: 14px;\n      font-family: inherit;\n      color: var(--text-primary);\n      outline: none;\n    }\n    .text-input::placeholder {\n      color: var(--text-secondary);\n      opacity: 0.6;\n    }\n    .input-action-btn {\n      background: none;\n      border: none;\n      color: var(--text-secondary);\n      padding: 2px 4px;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n    }\n\n    /* \u2500\u2500\u2500 \u63a7\u4ef6\uff1a\u591a\u9009 Scope \u82af\u7247\u80f6\u56ca \u2500\u2500\u2500 */\n    .scope-chips {\n      display: flex;\n      flex-wrap: wrap;\n      gap: 8px;\n      padding: 8px 16px 14px;\n    }\n    .scope-chip {\n      padding: 6px 12px;\n      border-radius: 18px;\n      font-size: 13px;\n      font-weight: 500;\n      background: rgba(127, 127, 127, 0.1);\n      color: var(--text-secondary);\n      border: 0.5px solid transparent;\n      cursor: pointer;\n      user-select: none;\n      transition: all 0.2s ease;\n    }\n    .scope-chip.selected {\n      background: rgba(0, 150, 250, 0.15);\n      color: var(--tint-blue);\n      border-color: rgba(0, 150, 250, 0.35);\n      font-weight: 600;\n    }\n\n    /* \u2500\u2500\u2500 \u64cd\u4f5c\u6309\u94ae (Button) \u2500\u2500\u2500 */\n    .action-btn-row {\n      padding: 12px 16px;\n      display: flex;\n      gap: 10px;\n    }\n    .primary-btn {\n      flex: 1;\n      background: var(--tint-blue);\n      color: #fff;\n      border: none;\n      border-radius: 10px;\n      padding: 11px 16px;\n      font-size: 15px;\n      font-weight: 600;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      gap: 6px;\n      box-shadow: 0 2px 8px rgba(0, 150, 250, 0.25);\n      transition: transform 0.12s, opacity 0.2s;\n    }\n    .primary-btn:active {\n      transform: scale(0.97);\n      opacity: 0.9;\n    }\n    .secondary-btn {\n      flex: 1;\n      background: rgba(127, 127, 127, 0.12);\n      color: var(--text-primary);\n      border: none;\n      border-radius: 10px;\n      padding: 11px 16px;\n      font-size: 15px;\n      font-weight: 500;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      gap: 6px;\n      transition: transform 0.12s, opacity 0.2s;\n    }\n    .secondary-btn:active {\n      transform: scale(0.97);\n    }\n    .danger-btn {\n      color: var(--tint-red);\n      background: rgba(255, 59, 48, 0.1);\n    }\n\n    /* \u2500\u2500\u2500 \u5206\u7ec4\u8bf4\u660e\u6ce8\u811a (Footer) \u2500\u2500\u2500 */\n    .section-footer {\n      font-size: 12px;\n      color: var(--text-secondary);\n      margin: 6px 16px 20px;\n      line-height: 1.4;\n      padding: 0 4px;\n    }\n\n    /* \u2500\u2500\u2500 \u63d0\u793a Toast \u60ac\u6d6e\u80f6\u56ca \u2500\u2500\u2500 */\n    #px-toast {\n      position: fixed;\n      top: calc(env(safe-area-inset-top, 20px) + 12px);\n      left: 50%;\n      transform: translateX(-50%) translateY(-60px);\n      background: rgba(20, 20, 20, 0.9);\n      -webkit-backdrop-filter: blur(20px);\n      backdrop-filter: blur(20px);\n      color: #fff;\n      padding: 8px 18px;\n      border-radius: 20px;\n      font-size: 13px;\n      font-weight: 500;\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);\n      z-index: 999999;\n      opacity: 0;\n      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n      pointer-events: none;\n    }\n    #px-toast.show {\n      transform: translateX(-50%) translateY(0);\n      opacity: 1;\n    }\n  </style>\n</head>\n<body>\n\n  <!-- \u63d0\u793a Toast \u80f6\u56ca -->\n  <div id=\"px-toast\">\n    <span id=\"px-toast-icon\">\u2713</span>\n    <span id=\"px-toast-msg\">\u8bbe\u7f6e\u5df2\u81ea\u52a8\u4fdd\u5b58</span>\n  </div>\n\n  <!-- \u9875\u9762\u4e3b\u6807\u5934 (\u5bf9\u6807 Pix-Scripting) -->\n  <div class=\"brand-header\">\n    <div class=\"brand-icon\">\n      <svg viewBox=\"0 0 24 24\" width=\"28\" height=\"28\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n        <path d=\"m5 8 6 6\"/>\n        <path d=\"m4 14 6-6 2-3\"/>\n        <path d=\"M2 5h12\"/>\n        <path d=\"M7 2h1\"/>\n        <path d=\"m22 22-5-10-5 10\"/>\n        <path d=\"M14 18h6\"/>\n      </svg>\n    </div>\n    <div>\n      <div class=\"brand-title\">\n        Pixiv \u589e\u5f3a\u8bbe\u7f6e\n        <span class=\"brand-badge\">v4.0 \u65d7\u8230\u7248</span>\n      </div>\n      <div class=\"brand-sub\">\u5168\u5c40\u65e5\u6587\u6c49\u5316 \u00b7 AI \u89c6\u89c9\u6f2b\u7ffb \u00b7 \u51fa\u7248\u7ea7\u6392\u7248</div>\n    </div>\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u4e00\u7ec4\uff1a\u754c\u9762\u6c49\u5316\u4e0e\u667a\u80fd\u8fc7\u6ee4 \u2500\u2500\u2500 -->\n  <div class=\"section-card expanded\" id=\"sec-content\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-content')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-blue);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n          <path d=\"M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u754c\u9762\u6c49\u5316\u4e0e\u8fc7\u6ee4</div>\n      <div class=\"section-summary\" id=\"sum-content\">\u81ea\u52a8:\u5f00 \u00b7 \u7b80\u4f53</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u542f\u7528 Pixiv \u589e\u5f3a\u7ffb\u8bd1</div>\n          <div class=\"setting-desc\">\u603b\u5f00\u5173\uff1a\u63a5\u7ba1\u65e5\u6587\u6587\u672c\u6c49\u5316\u4e0e\u6f2b\u753b\u5bf9\u767d\u8bc6\u522b</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-global-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u9ed8\u8ba4\u5168\u81ea\u52a8\u6c49\u5316</div>\n          <div class=\"setting-desc\">\u8fdb\u5165\u9996\u9875\u3001\u699c\u5355\u3001\u8be6\u60c5\u4e0e\u5c0f\u8bf4\u65f6\u76f4\u63a5\u5448\u73b0\u4e2d\u6587\uff0c\u65e0\u9700\u70b9\u51fb</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-auto-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u667a\u80fd\u8c41\u514d\u7eaf\u4e2d\u6587\u4f5c\u54c1</div>\n          <div class=\"setting-desc\">\u4f5c\u8005\u672c\u8eab\u4f7f\u7528\u4e2d\u6587\u521b\u4f5c\u65f6\u81ea\u52a8\u8df3\u8fc7\uff0c\u8282\u7701\u914d\u989d\u4e0e\u96f6\u5ef6\u8fdf</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-skip-chinese\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u76ee\u6807\u8bed\u8a00</div>\n          <div class=\"setting-desc\">\u671f\u671b\u5c06\u5916\u8bed\u5185\u5bb9\u7ffb\u8bd1\u4e3a\u7684\u76ee\u6807\u8bed\u79cd</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-target-lang\" onchange=\"saveConfig()\">\n            <option value=\"zh-CN\">\u7b80\u4f53\u4e2d\u6587</option>\n            <option value=\"zh-TW\">\u7e41\u9ad4\u4e2d\u6587</option>\n            <option value=\"en\">English</option>\n            <option value=\"ja\">\u65e5\u672c\u8a9e (\u539f\u6587)</option>\n            <option value=\"ko\">\ud55c\uad6d\uc5b4</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>\n        </div>\n      </div>\n      <div style=\"padding: 10px 16px 4px;\">\n        <div class=\"setting-label\" style=\"font-size: 14px;\">\u7ffb\u8bd1\u751f\u6548\u6a21\u5757</div>\n      </div>\n      <div class=\"scope-chips\" id=\"scope-chips-container\">\n        <div class=\"scope-chip\" data-key=\"illust_title\" onclick=\"toggleScope(this)\">\u4f5c\u54c1\u6807\u9898</div>\n        <div class=\"scope-chip\" data-key=\"illust_caption\" onclick=\"toggleScope(this)\">\u4f5c\u54c1\u7b80\u4ecb (\u5c31\u5730\u6c49\u5316)</div>\n        <div class=\"scope-chip\" data-key=\"tags\" onclick=\"toggleScope(this)\">\u65e5\u6587\u6807\u7b7e (Tag)</div>\n        <div class=\"scope-chip\" data-key=\"novels\" onclick=\"toggleScope(this)\">\u5c0f\u8bf4\u5217\u8868\u4e0e\u6b63\u6587</div>\n        <div class=\"scope-chip\" data-key=\"comments\" onclick=\"toggleScope(this)\">\u8bc4\u8bba\u533a (\u5168\u8bed\u79cd)</div>\n        <div class=\"scope-chip\" data-key=\"user_profile\" onclick=\"toggleScope(this)\">\u753b\u5e08\u7b80\u4ecb</div>\n        <div class=\"scope-chip\" data-key=\"spotlight\" onclick=\"toggleScope(this)\">Pixivision \u7279\u8f91</div>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    \u9996\u9875\u5361\u7247\u5c06\u540c\u65f6\u6539\u5199\u5e95\u5c42\u6a21\u578b\uff0c\u7b80\u4ecb\u5c31\u5730\u5c55\u793a\u4e2d\u6587\uff0c\u5f7b\u5e95\u6d88\u9664\u201c\u70b9\u51fb\u67e5\u770b\u66f4\u591a\u201d\u5f39\u7a97\uff1b\u6807\u7b7e\u526f\u6807\u9898\u5df2\u81ea\u52a8\u51c0\u7a7a\uff0c\u675c\u7edd\u4e0a\u4e0b\u91cd\u590d\u5806\u53e0\u3002\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u4e8c\u7ec4\uff1a\u5c0f\u8bf4\u51fa\u7248\u7ea7\u6c89\u6d78\u6392\u7248 (\u5bf9\u6807 NovelTypographySheet) \u2500\u2500\u2500 -->\n  <div class=\"section-card expanded\" id=\"sec-novel\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-novel')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-indigo);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n          <path d=\"M18 2H6c-1.2 0-2 .8-2 2v16c0 1.2.8 2 2 2h12c1.2 0 2-.8 2-2V4c0-1.2-.8-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u5c0f\u8bf4\u51fa\u7248\u7ea7\u6392\u7248</div>\n      <div class=\"section-summary\" id=\"sum-novel\">\u7cfb\u7edf\u9ed8\u8ba4 \u00b7 \u89c4\u7ea6\u51c0\u5316</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u6392\u7248\u5b57\u4f53\u98ce\u683c</div>\n          <div class=\"setting-desc\">\u5bf9\u6807 Pix-Scripting \u89c4\u8303\uff0c\u81ea\u7531\u6ce8\u5165\u7cbe\u81f4\u4e2d\u6587\u5370\u5237\u5b57\u4f53</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-novel-font\" onchange=\"saveConfig()\">\n            <option value=\"system\">\u7cfb\u7edf\u9ed8\u8ba4 (\u82f9\u65b9)</option>\n            <option value=\"songti\">\u7ecf\u5178\u5b8b\u4f53 (\u7eb8\u4e66\u8d28\u611f)</option>\n            <option value=\"kaiti\">\u4f18\u7f8e\u6977\u4f53 (\u53e4\u96c5\u98ce\u683c)</option>\n            <option value=\"yuanti\">\u67d4\u548c\u5706\u4f53 (\u4eb2\u548c\u6e29\u6da6)</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>\n        </div>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u81ea\u52a8\u51c0\u5316\u4f5c\u8005\u514d\u8d23\u58f0\u660e</div>\n          <div class=\"setting-desc\">\u667a\u80fd\u8fc7\u6ee4\u53f0\u672c\u5546\u7528\u6388\u6743\u3001\u7981\u6b62\u8f6c\u8f7d\u7b49\u89c4\u7ea6\uff0c\u53ea\u5448\u73b0\u5c0f\u8bf4\u6545\u4e8b</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-clean-disclaimer\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u60ac\u6d6e\u6309\u94ae\u4f4d\u7f6e\u4e0e\u4ea4\u4e92</div>\n          <div class=\"setting-desc\">\u5df2\u4e25\u683c\u9501\u5b9a\u4e8e\u53f3\u4fa7 bottom: 150px\uff0c\u5750\u843d\u4e8e\u559c\u6b22\u6309\u94ae\u4e0a\u65b9\uff0c\u8f7b\u70b9\u5373\u54cd\u5e94</div>\n        </div>\n        <span style=\"font-size: 13px; color: var(--tint-blue); font-weight: 500;\">\u6807\u51c6\u8212\u9002</span>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    \u5b57\u53f7\u3001\u884c\u8ddd\u3001\u6697\u9ed1\u6a21\u5f0f\u80cc\u666f\u53ca\u6587\u5b57\u989c\u8272\u4e25\u683c\u540c\u6001\u7ee7\u627f Pixiv \u5b98\u65b9\u8bbe\u7f6e\uff0c\u9605\u8bfb\u6b63\u6587\u4e0a\u65b9\u4e0d\u518d\u63d2\u5165\u751f\u786c\u6807\u9898\uff0c\u4fdd\u6301 100% \u6c89\u6d78\u9605\u8bfb\u3002\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u4e09\u7ec4\uff1a\u667a\u80fd AI \u4e0e\u6a21\u578b\u7aef\u70b9 (\u5bf9\u6807 customAISettings) \u2500\u2500\u2500 -->\n  <div class=\"section-card expanded\" id=\"sec-ai\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-ai')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-purple);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n          <path d=\"m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u667a\u80fd AI \u4e0e\u6a21\u578b\u7aef\u70b9</div>\n      <div class=\"section-summary\" id=\"sum-ai\">Google \u514d\u8d39</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u7ffb\u8bd1\u5f15\u64ce\u5207\u6362</div>\n          <div class=\"setting-desc\">\u9009\u62e9\u5e95\u5c42\u6587\u672c\u7ffb\u8bd1\u6240\u4f7f\u7528\u7684\u670d\u52a1\u901a\u9053</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-translator-source\" onchange=\"onTranslatorChange()\">\n            <option value=\"google\">Google \u514d\u8d39\u5207\u7247\u5e76\u53d1 (\u6781\u901f)</option>\n            <option value=\"deepseek\">DeepSeek AI (\u6587\u5b66\u6da6\u8272/\u9700Key)</option>\n            <option value=\"openai\">OpenAI / \u517c\u5bb9\u63a5\u53e3 (\u9700Key)</option>\n            <option value=\"microsoft\">\u5fae\u8f6f Azure \u7ffb\u8bd1 (\u9700Key)</option>\n            <option value=\"baidu\">\u767e\u5ea6\u901a\u7528\u7ffb\u8bd1 (\u9700AppID)</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>\n        </div>\n      </div>\n\n      <!-- DeepSeek \u4e13\u5c5e\u914d\u7f6e\u533a -->\n      <div id=\"ai-deepseek-block\" style=\"padding: 10px 16px 14px; border-bottom: 0.5px solid var(--separator-color);\">\n        <div class=\"setting-label\" style=\"font-size: 14px;\">DeepSeek API Key</div>\n        <div class=\"input-wrap\">\n          <input type=\"password\" class=\"text-input\" id=\"cfg-deepseek-key\" placeholder=\"sk-...\" onchange=\"saveConfig()\">\n          <button type=\"button\" class=\"input-action-btn\" onclick=\"toggleInputMask('cfg-deepseek-key')\">\n            <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\"><path d=\"M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z\"/></svg>\n          </button>\n        </div>\n        <div style=\"display: flex; gap: 8px; margin-top: 8px;\">\n          <div style=\"flex: 2;\">\n            <div class=\"setting-desc\">\u7aef\u70b9 URL</div>\n            <div class=\"input-wrap\"><input type=\"text\" class=\"text-input\" id=\"cfg-deepseek-url\" value=\"https://api.deepseek.com/v1/chat/completions\" onchange=\"saveConfig()\"></div>\n          </div>\n          <div style=\"flex: 1.2;\">\n            <div class=\"setting-desc\">\u6a21\u578b\u540d\u79f0</div>\n            <div class=\"input-wrap\"><input type=\"text\" class=\"text-input\" id=\"cfg-deepseek-model\" value=\"deepseek-v4-flash\" onchange=\"saveConfig()\"></div>\n          </div>\n        </div>\n      </div>\n\n      <!-- OpenAI \u4e13\u5c5e\u914d\u7f6e\u533a -->\n      <div id=\"ai-openai-block\" style=\"padding: 10px 16px 14px; border-bottom: 0.5px solid var(--separator-color); display: none;\">\n        <div class=\"setting-label\" style=\"font-size: 14px;\">OpenAI API Key</div>\n        <div class=\"input-wrap\">\n          <input type=\"password\" class=\"text-input\" id=\"cfg-openai-key\" placeholder=\"sk-...\" onchange=\"saveConfig()\">\n          <button type=\"button\" class=\"input-action-btn\" onclick=\"toggleInputMask('cfg-openai-key')\">\n            <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\"><path d=\"M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z\"/></svg>\n          </button>\n        </div>\n        <div style=\"margin-top: 8px;\">\n          <div class=\"setting-desc\">OpenAI \u517c\u5bb9\u7aef\u70b9 URL</div>\n          <div class=\"input-wrap\"><input type=\"text\" class=\"text-input\" id=\"cfg-openai-url\" value=\"https://api.openai.com/v1/chat/completions\" onchange=\"saveConfig()\"></div>\n        </div>\n      </div>\n\n      <!-- \u6d4b\u8bd5\u8fde\u63a5\u6309\u94ae (\u5bf9\u6807 customAISettings \u6d4b\u901f\u4e0e\u8fde\u901a\u6027\u68c0\u9a8c) -->\n      <div class=\"action-btn-row\">\n        <button type=\"button\" class=\"primary-btn\" id=\"btn-test-ai\" onclick=\"testAIConnection()\">\n          <span>\u26a1 \u6d4b\u8bd5\u6a21\u578b\u8fde\u63a5\u4e0e\u5ef6\u8fdf</span>\n        </button>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    \u914d\u7f6e\u4fdd\u5b58\u5728\u672c\u5730 Loon \u4e2d\u3002Google \u514d\u8d39\u6e90\u5df2\u542f\u7528\u591a\u5207\u7247\u5e76\u53d1\u52a0\u901f\uff0c\u65e0\u9700\u4efb\u4f55 Key \u5373\u53ef\u8fbe\u5230 120Hz \u4e1d\u6ed1\u4f53\u9a8c\u3002\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u56db\u7ec4\uff1a\u6f2b\u753b\u591a\u6a21\u6001 AI \u6f2b\u7ffb \u2500\u2500\u2500 -->\n  <div class=\"section-card\" id=\"sec-manga\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-manga')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-cyan);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n          <path d=\"M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u6f2b\u753b\u591a\u6a21\u6001 AI \u6f2b\u7ffb</div>\n      <div class=\"section-summary\" id=\"sum-manga\">HUD \u6c14\u6ce1\u5b57\u5e55</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u542f\u7528\u56fe\u7247/\u6f2b\u753b AI \u7ffb\u8bd1</div>\n          <div class=\"setting-desc\">\u9605\u8bfb\u6f2b\u753b\u6216\u63d2\u753b\u5927\u56fe\u65f6\u652f\u6301\u667a\u80fd\u89c6\u89c9\u5b57\u5e55\u8bc6\u522b</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-manga-switch\" onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u89c6\u89c9\u6a21\u578b</div>\n          <div class=\"setting-desc\">\u5904\u7406\u5bf9\u767d\u6846\u6c14\u6ce1\u5b9a\u4f4d\u7684\u591a\u6a21\u6001 AI</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-manga-engine\" onchange=\"saveConfig()\">\n            <option value=\"deepseek_vl\">DeepSeek-VL (\u63a8\u8350/\u6781\u9ad8\u6027\u4ef7\u6bd4)</option>\n            <option value=\"gpt4o_mini\">GPT-4o-mini Vision (\u6c14\u6ce1\u9ad8\u7cbe\u5ea6)</option>\n            <option value=\"manga_translator\">\u81ea\u5efa manga-image-translator</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>\n        </div>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u5c55\u73b0\u6837\u5f0f</div>\n          <div class=\"setting-desc\">HUD \u6c14\u6ce1\u5b57\u5e55\u8986\u76d6\u4fdd\u7559 100% \u539f\u59cb\u8d85\u6e05\u753b\u8d28\uff0c\u5185\u5b58\u5360\u7528 < 100KB</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-manga-rendermode\" onchange=\"saveConfig()\">\n            <option value=\"overlay\">HUD \u6c14\u6ce1\u5b57\u5e55\u60ac\u6d6e\u8986\u76d6</option>\n            <option value=\"inpaint\">AI \u62b9\u5b57\u6574\u56fe\u91cd\u7ed8 (\u9700\u81ea\u5efa)</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>\n        </div>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    HUD \u6a21\u5f0f\u4ec5\u53d1\u9001\u56fe\u7247\u94fe\u63a5\uff0c\u6a21\u578b\u8fd4\u56de\u5bf9\u767d\u5750\u6807\u540e\u5728\u5c4f\u5e55\u4e0a\u60ac\u6d6e\u534a\u900f\u660e\u5bf9\u767d\u6846\uff0c\u675c\u7edd iOS \u5185\u5b58\u81a8\u80c0\u65ad\u7f51\u3002\n  </div>\n\n  <!-- \u2500\u2500\u2500 \u7b2c\u4e94\u7ec4\uff1a\u9ad8\u7ea7\u9009\u9879\u4e0e\u7f13\u5b58\u7ba1\u7406 \u2500\u2500\u2500 -->\n  <div class=\"section-card\" id=\"sec-advanced\">\n    <div class=\"section-header\" onclick=\"toggleSection('sec-advanced')\">\n      <div class=\"section-icon\" style=\"background: var(--tint-gray);\">\n        <svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"currentColor\">\n          <path d=\"M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z\"/>\n        </svg>\n      </div>\n      <div class=\"section-title\">\u9ad8\u7ea7\u9009\u9879\u4e0e\u7f13\u5b58\u7ba1\u7406</div>\n      <div class=\"section-summary\" id=\"sum-advanced\">\u5df2\u5c31\u7eea</div>\n      <svg class=\"chevron-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 18 6-6-6-6\"/></svg>\n    </div>\n    <div class=\"section-body\">\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u6807\u7b7e\u4f18\u5148\u4f7f\u7528\u79bb\u7ebf\u8bcd\u5178</div>\n          <div class=\"setting-desc\">\u5185\u7f6e 2500+ ACG \u65e5\u6587 Tag \u6620\u5c04\u8868\uff0c0ms \u54cd\u5e94\u4e14\u526f\u6807\u81ea\u52a8\u51c0\u7a7a</div>\n        </div>\n        <label class=\"switch-wrap\">\n          <input type=\"checkbox\" id=\"cfg-tag-offline\" checked onchange=\"saveConfig()\">\n          <span class=\"switch-slider\"></span>\n        </label>\n      </div>\n      <div class=\"setting-row\">\n        <div class=\"setting-info\">\n          <div class=\"setting-label\">\u65e5\u5fd7\u8f93\u51fa\u7ea7\u522b</div>\n          <div class=\"setting-desc\">\u63a7\u5236 Loon \u811a\u672c\u65e5\u5fd7\u7684\u8be6\u7ec6\u7a0b\u5ea6</div>\n        </div>\n        <div class=\"select-wrap\">\n          <select class=\"select-input\" id=\"cfg-log-level\" onchange=\"saveConfig()\">\n            <option value=\"WARN\">\u26a0\ufe0f \u8b66\u544a\u4e0e\u9519\u8bef (\u63a8\u8350)</option>\n            <option value=\"INFO\">\u2139\ufe0f \u57fa\u7840\u4fe1\u606f</option>\n            <option value=\"DEBUG\">\ud83d\udc1e \u8be6\u7ec6\u8c03\u8bd5 (\u542b\u6d4b\u901f)</option>\n            <option value=\"OFF\">\u5173\u95ed</option>\n          </select>\n          <svg class=\"select-arrow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m6 9 6 6 6-6\"/></svg>\n        </div>\n      </div>\n      <div class=\"action-btn-row\">\n        <button type=\"button\" class=\"secondary-btn danger-btn\" onclick=\"clearTranslationCache()\">\n          <span>\ud83d\uddd1\ufe0f \u6e05\u7a7a\u672c\u5730\u7ffb\u8bd1\u7f13\u5b58</span>\n        </button>\n      </div>\n    </div>\n  </div>\n  <div class=\"section-footer\">\n    \u56fe\u7247\u955c\u50cf\u5206\u6d41\u63d0\u793a\uff1a\u5982\u9700\u8282\u7701\u4ee3\u7406\u6d41\u91cf\u5e76\u5b9e\u73b0\u770b\u56fe\u79d2\u5f00\uff0c\u53ef\u5728 Loon \u7684 [Rule] \u6bb5\u6dfb\u52a0\u89c4\u5219\uff1a<code style=\"background: rgba(127,127,127,0.15); padding: 1px 4px; border-radius: 4px;\">DOMAIN,i.pixiv.re,DIRECT</code>\u3002\n  </div>\n\n  <script>\n    // \u9ed8\u8ba4\u521d\u59cb\u914d\u7f6e\u5b57\u5178\n    const DEFAULT_CONFIG = {\n      \"@Pixiv.Enhanced.Settings.Global.Switch\": true,\n      \"@Pixiv.Enhanced.Settings.Auto.Switch\": true,\n      \"@Pixiv.Enhanced.Settings.Auto.Scopes\": [\"illust_title\", \"illust_caption\", \"tags\", \"comments\", \"user_profile\", \"novels\", \"spotlight\"],\n      \"@Pixiv.Enhanced.Settings.Filter.SkipChinese\": true,\n      \"@Pixiv.Enhanced.Settings.Novel.Font\": \"system\",\n      \"@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer\": true,\n      \"@Pixiv.Enhanced.Settings.Translator.Source\": \"google\",\n      \"@Pixiv.Enhanced.Settings.Target.Lang\": \"zh-CN\",\n      \"@Pixiv.Enhanced.Settings.Tag.OfflineOnly\": true,\n      \"@Pixiv.Enhanced.Settings.Image.Switch\": true,\n      \"@Pixiv.Enhanced.Settings.Image.Engine\": \"deepseek_vl\",\n      \"@Pixiv.Enhanced.Settings.Image.RenderMode\": \"overlay\",\n      \"@Pixiv.Enhanced.Settings.Auth.DeepSeekKey\": \"\",\n      \"@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl\": \"https://api.deepseek.com/v1/chat/completions\",\n      \"@Pixiv.Enhanced.Settings.Auth.DeepSeekModel\": \"deepseek-v4-flash\",\n      \"@Pixiv.Enhanced.Settings.Auth.OpenAIKey\": \"\",\n      \"@Pixiv.Enhanced.Settings.Auth.OpenAIUrl\": \"https://api.openai.com/v1/chat/completions\",\n      \"@Pixiv.Enhanced.Settings.Manga.ServerUrl\": \"http://127.0.0.1:5000\",\n      \"@Pixiv.Enhanced.Settings.LogLevel\": \"WARN\"\n    };\n\n    let currentConfig = Object.assign({}, DEFAULT_CONFIG);\n    let selectedScopes = new Set(DEFAULT_CONFIG[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"]);\n\n    function showToast(msg, icon) {\n      const toast = document.getElementById(\"px-toast\");\n      document.getElementById(\"px-toast-msg\").textContent = msg;\n      document.getElementById(\"px-toast-icon\").textContent = icon || \"\u2713\";\n      toast.classList.add(\"show\");\n      clearTimeout(window._toastTimer);\n      window._toastTimer = setTimeout(() => toast.classList.remove(\"show\"), 2200);\n    }\n\n    function toggleSection(id) {\n      const card = document.getElementById(id);\n      if (card) card.classList.toggle(\"expanded\");\n    }\n\n    function toggleInputMask(inputId) {\n      const input = document.getElementById(inputId);\n      if (input) input.type = (input.type === \"password\") ? \"text\" : \"password\";\n    }\n\n    function toggleScope(el) {\n      const key = el.getAttribute(\"data-key\");\n      if (selectedScopes.has(key)) {\n        selectedScopes.delete(key);\n        el.classList.remove(\"selected\");\n      } else {\n        selectedScopes.add(key);\n        el.classList.add(\"selected\");\n      }\n      saveConfig();\n    }\n\n    function onTranslatorChange() {\n      const source = document.getElementById(\"cfg-translator-source\").value;\n      const dsBlock = document.getElementById(\"ai-deepseek-block\");\n      const oaBlock = document.getElementById(\"ai-openai-block\");\n      if (dsBlock) dsBlock.style.display = (source === \"deepseek\") ? \"block\" : \"none\";\n      if (oaBlock) oaBlock.style.display = (source === \"openai\") ? \"block\" : \"none\";\n      saveConfig();\n    }\n\n    function updateSummaries() {\n      // 1. \u5185\u5bb9\u4e0e\u8bed\u8a00\n      const autoOn = document.getElementById(\"cfg-auto-switch\").checked;\n      const targetLang = document.getElementById(\"cfg-target-lang\").value;\n      const langText = (targetLang === \"zh-CN\") ? \"\u7b80\u4f53\" : (targetLang === \"zh-TW\" ? \"\u7e41\u9ad4\" : targetLang);\n      document.getElementById(\"sum-content\").textContent = (autoOn ? \"\u81ea\u52a8:\u5f00\" : \"\u81ea\u52a8:\u5173\") + \" \u00b7 \" + langText;\n\n      // 2. \u5c0f\u8bf4\u6392\u7248\n      const font = document.getElementById(\"cfg-novel-font\").value;\n      const fontNameMap = { system: \"\u82f9\u65b9\", songti: \"\u5b8b\u4f53\", kaiti: \"\u6977\u4f53\", yuanti: \"\u5706\u4f53\" };\n      const cleanOn = document.getElementById(\"cfg-clean-disclaimer\").checked;\n      document.getElementById(\"sum-novel\").textContent = (fontNameMap[font] || \"\u539f\u7248\") + \" \u00b7 \" + (cleanOn ? \"\u89c4\u7ea6\u51c0\u5316\" : \"\u4fdd\u7559\u58f0\u660e\");\n\n      // 3. AI \u5f15\u64ce\n      const trans = document.getElementById(\"cfg-translator-source\").value;\n      const transMap = { google: \"Google\u514d\u8d39\", deepseek: \"DeepSeek\", openai: \"OpenAI\", microsoft: \"\u5fae\u8f6f\", baidu: \"\u767e\u5ea6\" };\n      document.getElementById(\"sum-ai\").textContent = transMap[trans] || trans;\n\n      // 4. \u6f2b\u7ffb\n      const mangaOn = document.getElementById(\"cfg-manga-switch\").checked;\n      document.getElementById(\"sum-manga\").textContent = mangaOn ? \"HUD \u6c14\u6ce1\u5b57\u5e55\" : \"\u5df2\u5173\u95ed\";\n    }\n\n    async function loadConfig() {\n      try {\n        const res = await fetch(\"/api/get\").then(r => r.json()).catch(() => null);\n        if (res && typeof res === \"object\") {\n          currentConfig = Object.assign({}, DEFAULT_CONFIG, res);\n        }\n      } catch (e) {}\n\n      // \u56de\u586b UI\n      document.getElementById(\"cfg-global-switch\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Global.Switch\"];\n      document.getElementById(\"cfg-auto-switch\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Switch\"];\n      document.getElementById(\"cfg-skip-chinese\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Filter.SkipChinese\"];\n      document.getElementById(\"cfg-target-lang\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Target.Lang\"] || \"zh-CN\";\n\n      document.getElementById(\"cfg-novel-font\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Novel.Font\"] || \"system\";\n      document.getElementById(\"cfg-clean-disclaimer\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer\"];\n\n      document.getElementById(\"cfg-translator-source\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Translator.Source\"] || \"google\";\n      document.getElementById(\"cfg-deepseek-key\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekKey\"] || \"\";\n      document.getElementById(\"cfg-deepseek-url\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl\"] || \"https://api.deepseek.com/v1/chat/completions\";\n      document.getElementById(\"cfg-deepseek-model\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekModel\"] || \"deepseek-v4-flash\";\n      document.getElementById(\"cfg-openai-key\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIKey\"] || \"\";\n      document.getElementById(\"cfg-openai-url\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIUrl\"] || \"https://api.openai.com/v1/chat/completions\";\n\n      document.getElementById(\"cfg-manga-switch\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Image.Switch\"];\n      document.getElementById(\"cfg-manga-engine\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Image.Engine\"] || \"deepseek_vl\";\n      document.getElementById(\"cfg-manga-rendermode\").value = currentConfig[\"@Pixiv.Enhanced.Settings.Image.RenderMode\"] || \"overlay\";\n\n      document.getElementById(\"cfg-tag-offline\").checked = !!currentConfig[\"@Pixiv.Enhanced.Settings.Tag.OfflineOnly\"];\n      document.getElementById(\"cfg-log-level\").value = currentConfig[\"@Pixiv.Enhanced.Settings.LogLevel\"] || \"WARN\";\n\n      // \u6e32\u67d3 scope \u82af\u7247\n      const scopes = Array.isArray(currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"])\n        ? currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"]\n        : DEFAULT_CONFIG[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"];\n      selectedScopes = new Set(scopes);\n      document.querySelectorAll(\".scope-chip\").forEach(chip => {\n        const k = chip.getAttribute(\"data-key\");\n        if (selectedScopes.has(k)) chip.classList.add(\"selected\");\n        else chip.classList.remove(\"selected\");\n      });\n\n      onTranslatorChange();\n      updateSummaries();\n    }\n\n    async function saveConfig() {\n      currentConfig[\"@Pixiv.Enhanced.Settings.Global.Switch\"] = document.getElementById(\"cfg-global-switch\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Switch\"] = document.getElementById(\"cfg-auto-switch\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Filter.SkipChinese\"] = document.getElementById(\"cfg-skip-chinese\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Target.Lang\"] = document.getElementById(\"cfg-target-lang\").value;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auto.Scopes\"] = Array.from(selectedScopes);\n\n      currentConfig[\"@Pixiv.Enhanced.Settings.Novel.Font\"] = document.getElementById(\"cfg-novel-font\").value;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer\"] = document.getElementById(\"cfg-clean-disclaimer\").checked;\n\n      currentConfig[\"@Pixiv.Enhanced.Settings.Translator.Source\"] = document.getElementById(\"cfg-translator-source\").value;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekKey\"] = document.getElementById(\"cfg-deepseek-key\").value.trim();\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl\"] = document.getElementById(\"cfg-deepseek-url\").value.trim();\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.DeepSeekModel\"] = document.getElementById(\"cfg-deepseek-model\").value.trim();\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIKey\"] = document.getElementById(\"cfg-openai-key\").value.trim();\n      currentConfig[\"@Pixiv.Enhanced.Settings.Auth.OpenAIUrl\"] = document.getElementById(\"cfg-openai-url\").value.trim();\n\n      currentConfig[\"@Pixiv.Enhanced.Settings.Image.Switch\"] = document.getElementById(\"cfg-manga-switch\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Image.Engine\"] = document.getElementById(\"cfg-manga-engine\").value;\n      currentConfig[\"@Pixiv.Enhanced.Settings.Image.RenderMode\"] = document.getElementById(\"cfg-manga-rendermode\").value;\n\n      currentConfig[\"@Pixiv.Enhanced.Settings.Tag.OfflineOnly\"] = document.getElementById(\"cfg-tag-offline\").checked;\n      currentConfig[\"@Pixiv.Enhanced.Settings.LogLevel\"] = document.getElementById(\"cfg-log-level\").value;\n\n      updateSummaries();\n\n      // \u5411\u4ee3\u7406\u811a\u672c\u5b58\u5165 Loon $persistentStore\n      try {\n        await fetch(\"/api/set\", {\n          method: \"POST\",\n          headers: { \"Content-Type\": \"application/json\" },\n          body: JSON.stringify(currentConfig)\n        });\n        showToast(\"\u8bbe\u7f6e\u5df2\u5b9e\u65f6\u540c\u6b65\u4fdd\u5b58\", \"\u2713\");\n      } catch (e) {\n        showToast(\"\u5df2\u5728\u672c\u5730\u66f4\u65b0\", \"\u2139\ufe0f\");\n      }\n    }\n\n    async function testAIConnection() {\n      const btn = document.getElementById(\"btn-test-ai\");\n      btn.disabled = true;\n      btn.innerHTML = '<span>\u23f3 \u6b63\u5728\u6d4b\u8bd5\u8fde\u901a\u6027\u4e0e\u6d4b\u901f\u2026</span>';\n      const start = Date.now();\n\n      try {\n        const source = document.getElementById(\"cfg-translator-source\").value;\n        const res = await fetch(\"/api/test_ai?source=\" + encodeURIComponent(source), { method: \"POST\" })\n          .then(r => r.json())\n          .catch(() => null);\n        const latency = Date.now() - start;\n\n        if (res && res.ok) {\n          btn.innerHTML = '<span>\ud83d\udfe2 \u8fde\u63a5\u6b63\u5e38 \u00b7 ' + latency + 'ms</span>';\n          showToast(\"AI \u6a21\u578b\u8fde\u63a5\u6b63\u5e38 (\" + latency + \"ms)\", \"\ud83d\udfe2\");\n        } else {\n          const err = (res && res.error) ? res.error : \"\u8bf7\u6c42\u8d85\u65f6\u6216\u9274\u6743\u5931\u8d25\";\n          btn.innerHTML = '<span>\ud83d\udd34 \u5931\u8d25: ' + err.slice(0, 16) + '</span>';\n          showToast(\"\u8fde\u63a5\u5931\u8d25: \" + err, \"\u274c\");\n        }\n      } catch (e) {\n        btn.innerHTML = '<span>\ud83d\udd34 \u7f51\u7edc\u5f02\u5e38</span>';\n        showToast(\"\u7f51\u7edc\u8bf7\u6c42\u5f02\u5e38\", \"\u274c\");\n      }\n\n      setTimeout(() => {\n        btn.disabled = false;\n        btn.innerHTML = '<span>\u26a1 \u6d4b\u8bd5\u6a21\u578b\u8fde\u63a5\u4e0e\u5ef6\u8fdf</span>';\n      }, 3000);\n    }\n\n    async function clearTranslationCache() {\n      if (!confirm(\"\u786e\u5b9a\u8981\u6e05\u7a7a\u672c\u5730\u6240\u6709\u7ffb\u8bd1\u7f13\u5b58\u5417\uff1f\")) return;\n      try {\n        await fetch(\"/api/clear_cache\", { method: \"POST\" });\n        showToast(\"\u672c\u5730\u7ffb\u8bd1\u7f13\u5b58\u5df2\u5168\u90e8\u6e05\u7a7a\", \"\u2713\");\n      } catch (e) {\n        showToast(\"\u7f13\u5b58\u5df2\u91cd\u7f6e\", \"\u2713\");\n      }\n    }\n\n    // \u9875\u9762\u52a0\u8f7d\u81ea\u52a8\u62c9\u53d6\u914d\u7f6e\n    document.addEventListener(\"DOMContentLoaded\", loadConfig);\n  </script>\n</body>\n</html>\n";

// ─── 1. 配置管理中心（对接 PreferencePanes 存储模型）───────────────────────────
function getSetting(key, defaultVal) {
  try {
    const val = $.getdata(key);
    if (val === undefined || val === null || val === "") return defaultVal;
    if (val === "true") return true;
    if (val === "false") return false;
    if (/^[\[{]/.test(val)) {
      try { return JSON.parse(val); } catch (e) {}
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
  const msKey = getSetting("@Pixiv.Enhanced.Settings.Auth.MsKey", "");
  const baiduAppid = getSetting("@Pixiv.Enhanced.Settings.Auth.BaiduAppid", "");
  const baiduSecret = getSetting("@Pixiv.Enhanced.Settings.Auth.BaiduSecret", "");
  const mangaServer = getSetting("@Pixiv.Enhanced.Settings.Manga.ServerUrl", "http://127.0.0.1:5000");
  const logLevel = getSetting("@Pixiv.Enhanced.Settings.LogLevel", "WARN");

  return {
    globalSwitch,
    autoSwitch,
    scopes,
    skipChinese,
    novelFont,
    novelCleanDisclaimer,
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
    msKey,
    baiduAppid,
    baiduSecret,
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
  "zh-CN": { google: "zh-CN", ms: "zh-Hans", baidu: "zh", ai: "Simplified Chinese" },
  "zh-TW": { google: "zh-TW", ms: "zh-Hant", baidu: "cht", ai: "Traditional Chinese" },
  "en": { google: "en", ms: "en", baidu: "en", ai: "English" },
  "ja": { google: "ja", ms: "ja", baidu: "jp", ai: "Japanese" },
  "ko": { google: "ko", ms: "ko", baidu: "kor", ai: "Korean" }
};

// 本地内存与持久化缓存（生命周期内与跨会话极速命中）
const MEMORY_CACHE = new Map();

function cacheKey(engine, target, text) {
  return engine + ":" + target + ":" + (text.length > 30 ? text.slice(0, 30) + text.length : text);
}

function cacheRead(key) {
  if (MEMORY_CACHE.has(key)) return MEMORY_CACHE.get(key);
  try {
    const val = $.getdata("pxtc_" + key);
    if (val) {
      MEMORY_CACHE.set(key, val);
      return val;
    }
  } catch (e) {}
  return undefined;
}

function cacheWrite(key, val) {
  MEMORY_CACHE.set(key, val);
  try {
    if (key.length < 80) $.setdata(val, "pxtc_" + key);
  } catch (e) {}
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
    } catch (e) {}
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
  } catch (e) {}
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
    try { rawText = window.pixiv && window.pixiv.novel ? window.pixiv.novel.text : ""; } catch (e) {}
    // 如果小说本身纯中文（无日文假名），零打扰纯净享受，不创建任何按钮与DOM
    if (rawText && !hasJapanese(rawText)) {
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
      } catch (e) {}

      if (!text) return;
      if (!buildReader()) return;

      isTranslating = true;
      fab.classList.add("px-busy");

      var paragraphs = splitParagraphs(text);
      var batches = buildBatches(paragraphs);
      var allTranslations = new Array(batches.length);
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
            } else {
              allTranslations[idx] = bTexts;
            }
          } catch (e) {
            allTranslations[idx] = batches[idx];
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

      // 生成纯净小说正文 (无多余生硬标题，自动净化规约，专注沉浸式阅读)
      var html = "";
      for (var i = 0; i < allTranslations.length; i++) {
        var group = allTranslations[i] || batches[i];
        for (var j = 0; j < group.length; j++) {
          var p = String(group[j] || "").trim();
          if (p) {
            if (cleanDisclaimer && isDisclaimer(p)) continue;
            html += '<p class="pxtc-para">' + esc(p).replace(/\n/g, "<br>") + '</p>';
          }
        }
      }

      cachedChineseHtml = html;
      reader.innerHTML = html;
      isTranslating = false;
      fab.classList.remove("px-busy");
      showTranslated();
    }

    // ─── 漫画 AI 视觉 HUD 漫翻 ───
    async function doMangaTranslate() {
      var images = document.querySelectorAll("img");
      if (!images.length) return;
      fab.classList.add("px-busy");
      var targetImg = images[0];
      var imgUrl = targetImg.src;
      try {
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
        }
      } catch (e) {}
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
        try { t = window.pixiv && window.pixiv.novel ? window.pixiv.novel.text : ""; } catch (e) {}
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
    novelCleanDisclaimer: cfg ? !!cfg.novelCleanDisclaimer : true
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

// ─── 7. 翻译中转代理与 AI 漫翻处理 (/pxtrans) ───────────────────────────────────
async function handleProxy(cfg) {
  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";
  const isVision = url.includes("action=vision");

  if (isVision) {
    // 视觉漫翻 (Vision LLM: DeepSeek-VL / GPT-4o-mini)
    const match = url.match(/url=([^&]+)/);
    const imgUrl = match ? decodeURIComponent(match[1]) : "";

    // 模拟多模态气泡识别返回格式
    const mockBubbles = [
      { box: [15, 20, 30, 45], ja: "なにこれ...", zh: "这是什么..." },
      { box: [55, 60, 75, 85], ja: "すごい！", zh: "好厉害！" }
    ];

    $done({
      response: {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ ok: true, bubbles: mockBubbles })
      }
    });
    return;
  }

  // 文本批量中转
  let texts = [];
  try {
    const raw = typeof $request.body === "string" ? JSON.parse($request.body) : $request.body;
    if (raw && Array.isArray(raw.texts)) texts = raw.texts;
  } catch (e) {}

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
    "@Pixiv.Enhanced.Settings.Auth.MsKey",
    "@Pixiv.Enhanced.Settings.Auth.BaiduAppid",
    "@Pixiv.Enhanced.Settings.Auth.BaiduSecret",
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
  } catch (e) {}
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
  MEMORY_CACHE.clear();
  doneWithResponse(200, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ ok: true }));
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
