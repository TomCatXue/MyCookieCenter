<!DOCTYPE html>
<html lang="zh-CN">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
  <title>Pixiv 增强设置</title>
  <style>
    :root {
      --bg-color: #f2f2f7;
      --card-bg: #ffffff;
      --card-border: rgba(60, 60, 67, 0.12);
      --separator-color: rgba(60, 60, 67, 0.12);
      --text-primary: #000000;
      --text-secondary: #8e8e93;
      --tint-blue: #0096fa;
      --tint-green: #34c759;
      --tint-orange: #ff9500;
      --tint-purple: #af52de;
      --tint-indigo: #5856d6;
      --tint-cyan: #5ac8fa;
      --tint-gray: #8e8e93;
      --switch-bg: #e9e9ea;
      --badge-bg: rgba(142, 142, 147, 0.12);
      --badge-text: #8e8e93;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #000000;
        --card-bg: #1c1c1e;
        --card-border: rgba(255, 255, 255, 0.12);
        --separator-color: rgba(84, 84, 88, 0.35);
        --text-primary: #ffffff;
        --text-secondary: #8e8e93;
        --switch-bg: #39393d;
        --badge-bg: rgba(255, 255, 255, 0.12);
        --badge-text: #aeaeb2;
      }
    }

    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", sans-serif;
      padding: calc(env(safe-area-inset-top, 20px) + 16px) 16px calc(env(safe-area-inset-bottom, 20px) + 32px);
      max-width: 680px;
      margin: 0 auto;
      line-height: 1.5;
      font-size: 16px;
      overflow-x: hidden;
    }

    /* ─── 页面大标题头部 (Pix-Scripting 风格) ─── */
    .brand-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 22px;
      padding: 4px 6px;
    }

    .brand-icon {
      width: 52px;
      height: 52px;
      border-radius: 13px;
      background: var(--tint-blue);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      box-shadow: none;
      flex-shrink: 0;
    }

    .brand-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.4px;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 6px;
      background: rgba(0, 150, 250, 0.15);
      color: var(--tint-blue);
      letter-spacing: 0;
    }

    .brand-sub {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    /* ─── Grouped 卡片容器 ─── */
    .section-card {
      background: var(--card-bg);
      border-radius: 14px;
      border: 0.5px solid var(--card-border);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      margin-bottom: 6px;
      overflow: hidden;
      transition: all 0.25s ease;
    }

    .section-header {
      display: flex;
      align-items: center;
      padding: 13px 16px;
      cursor: pointer;
      user-select: none;
      gap: 12px;
      min-height: 50px;
    }

    .section-header:active {
      background: rgba(127, 127, 127, 0.08);
    }

    .section-icon {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      flex-shrink: 0;
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      flex: 1;
      color: var(--text-primary);
    }

    .section-summary {
      font-size: 12px;
      color: var(--badge-text);
      background: var(--badge-bg);
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 500;
      max-width: 140px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: opacity 0.2s;
    }

    .chevron-icon {
      width: 14px;
      height: 14px;
      color: var(--text-secondary);
      transition: transform 0.25s ease;
      flex-shrink: 0;
    }

    .section-card.expanded .chevron-icon {
      transform: rotate(90deg);
    }

    .section-card.expanded .section-summary {
      opacity: 0;
      pointer-events: none;
    }

    .section-body {
      display: none;
      border-top: 0.5px solid var(--separator-color);
    }

    .section-card.expanded .section-body {
      display: block;
    }

    /* ─── 设置条目 (Row) ─── */
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      min-height: 48px;
      position: relative;
    }

    .setting-row:not(:last-child)::after {
      content: "";
      position: absolute;
      left: 16px;
      right: 0;
      bottom: 0;
      height: 0.5px;
      background: var(--separator-color);
    }

    .setting-info {
      flex: 1;
      padding-right: 12px;
    }

    .setting-label {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .setting-desc {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
      line-height: 1.35;
    }

    .cache {
      padding: 8px 16px 14px;
    }

    .cache-metric-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 42px;
      border-bottom: 0.5px solid var(--separator-color);
    }

    .cache-metric-row:last-child {
      border-bottom: 0;
    }

    .cache-metric-label {
      color: var(--text-secondary);
      font-size: 14px;
    }

    .cache-metric-value {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
    }

    .cache-action {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-top: 12px;
    }

    .cache-action .secondary-btn {
      flex: 0 0 auto;
      padding: 8px 13px;
      font-size: 14px;
    }

    /* ─── 控件：iOS 原生质感 Toggle 开关 ─── */
    .switch-wrap {
      position: relative;
      width: 51px;
      height: 31px;
      flex-shrink: 0;
    }

    .switch-wrap input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .switch-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--switch-bg);
      transition: background-color 0.25s ease;
      border-radius: 31px;
    }

    .switch-slider::before {
      position: absolute;
      content: "";
      height: 27px;
      width: 27px;
      left: 2px;
      bottom: 2px;
      background-color: white;
      transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      border-radius: 50%;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    }

    .switch-wrap input:checked+.switch-slider {
      background-color: var(--tint-green);
    }

    .switch-wrap input:checked+.switch-slider::before {
      transform: translateX(20px);
    }

    /* ─── 控件：Select 选择器 ─── */
    .select-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .select-input {
      appearance: none;
      -webkit-appearance: none;
      background: rgba(127, 127, 127, 0.1);
      border: none;
      padding: 6px 28px 6px 12px;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      color: var(--tint-blue);
      font-weight: 500;
      outline: none;
      cursor: pointer;
    }

    .select-arrow {
      position: absolute;
      right: 8px;
      width: 12px;
      height: 12px;
      color: var(--tint-blue);
      pointer-events: none;
    }

    /* ─── 控件：单行输入框 (带显隐眼睛) ─── */
    .input-wrap {
      display: flex;
      align-items: center;
      background: rgba(127, 127, 127, 0.08);
      border-radius: 8px;
      padding: 6px 10px;
      width: 100%;
      margin-top: 6px;
      border: 0.5px solid var(--separator-color);
    }

    .text-input {
      flex: 1;
      background: transparent;
      border: none;
      font-size: 14px;
      font-family: inherit;
      color: var(--text-primary);
      outline: none;
    }

    .text-input::placeholder {
      color: var(--text-secondary);
      opacity: 0.6;
    }

    .input-action-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      padding: 2px 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
    }

    /* ─── 控件：多选 Scope 芯片胶囊 ─── */
    .scope-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 16px 14px;
    }

    .scope-chip {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--separator-color);
      border-radius: 8px;
      color: var(--text-secondary);
      background: transparent;
      font-size: 13px;
      line-height: 1.2;
      cursor: pointer;
      user-select: none;
    }

    .scope-chip.selected {
      position: relative;
      padding-right: 27px;
      color: var(--tint-blue);
      background: rgba(0, 150, 250, 0.16);
      border-color: var(--tint-blue);
      font-weight: 600;
    }

    .scope-chip.selected::after {
      content: "✓";
      position: absolute;
      right: 9px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--tint-blue);
      font-size: 12px;
      font-weight: 700;
    }

    /* ─── 操作按钮 (Button) ─── */
    .action-btn-row {
      padding: 12px 16px;
      display: flex;
      gap: 10px;
    }

    .primary-btn {
      flex: 1;
      background: var(--tint-blue);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 11px 16px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(0, 150, 250, 0.25);
      transition: transform 0.12s, opacity 0.2s;
    }

    .primary-btn:active {
      transform: scale(0.97);
      opacity: 0.9;
    }

    .secondary-btn {
      flex: 1;
      background: rgba(127, 127, 127, 0.12);
      color: var(--text-primary);
      border: none;
      border-radius: 10px;
      padding: 11px 16px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: transform 0.12s, opacity 0.2s;
    }

    .secondary-btn:active {
      transform: scale(0.97);
    }

    .danger-btn {
      color: #ff3b30;
      background: rgba(255, 59, 48, 0.1);
    }

    /* ─── 分组说明注脚 (Footer) ─── */
    .section-footer {
      font-size: 12px;
      color: var(--text-secondary);
      margin: 6px 16px 20px;
      line-height: 1.4;
      padding: 0 4px;
    }

    /* ─── 提示 Toast 悬浮胶囊 ─── */
    #px-toast {
      position: fixed;
      top: calc(env(safe-area-inset-top, 20px) + 12px);
      left: 50%;
      transform: translateX(-50%) translateY(-60px);
      background: rgba(20, 20, 20, 0.9);
      -webkit-backdrop-filter: blur(20px);
      backdrop-filter: blur(20px);
      color: #fff;
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      z-index: 999999;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      pointer-events: none;
    }

    #px-toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>

<body>

  <!-- 提示 Toast 胶囊 -->
  <div id="px-toast">
    <span id="px-toast-icon">✓</span>
    <span id="px-toast-msg">设置已自动保存</span>
  </div>

  <!-- 页面主标头 (对标 Pix-Scripting) -->
  <div class="brand-header">
    <div class="brand-icon">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="m5 8 6 6" />
        <path d="m4 14 6-6 2-3" />
        <path d="M2 5h12" />
        <path d="M7 2h1" />
        <path d="m22 22-5-10-5 10" />
        <path d="M14 18h6" />
      </svg>
    </div>
    <div>
      <div class="brand-title">
        Pixiv 增强设置
        <span class="brand-badge">v4.1</span>
      </div>
      <div class="brand-sub">全局日文汉化 · AI 视觉漫翻 · 出版级排版</div>
    </div>
  </div>

  <!-- ─── 第一组：界面汉化与智能过滤 ─── -->
  <div class="section-card expanded" id="sec-content">
    <div class="section-header" onclick="toggleSection('sec-content')">
      <div class="section-icon" style="background: var(--tint-blue);">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path
            d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
        </svg>
      </div>
      <div class="section-title">界面汉化与过滤</div>
      <div class="section-summary" id="sum-content">自动:开 · 简体</div>
      <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </div>
    <div class="section-body">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">启用 Pixiv 增强翻译</div>
          <div class="setting-desc">总开关：接管日文文本汉化与漫画对白识别</div>
        </div>
        <label class="switch-wrap">
          <input type="checkbox" id="cfg-global-switch" onchange="saveConfig()">
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">默认全自动汉化</div>
          <div class="setting-desc">进入首页、榜单、详情与小说时直接呈现中文，无需点击</div>
        </div>
        <label class="switch-wrap">
          <input type="checkbox" id="cfg-auto-switch" onchange="saveConfig()">
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">智能豁免纯中文作品</div>
          <div class="setting-desc">作者本身使用中文创作时自动跳过，节省配额与零延迟</div>
        </div>
        <label class="switch-wrap">
          <input type="checkbox" id="cfg-skip-chinese" onchange="saveConfig()">
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">目标语言</div>
          <div class="setting-desc">期望将外语内容翻译为的目标语种</div>
        </div>
        <div class="select-wrap">
          <select class="select-input" id="cfg-target-lang" onchange="saveConfig()">
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語 (原文)</option>
            <option value="ko">한국어</option>
          </select>
          <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
      <div style="padding: 10px 16px 4px;">
        <div class="setting-label" style="font-size: 14px;">翻译生效模块</div>
      </div>
      <div class="scope-chips" id="scope-chips-container">
        <div class="scope-chip" data-key="illust_title" onclick="toggleScope(this)">作品标题</div>
        <div class="scope-chip" data-key="illust_caption" onclick="toggleScope(this)">作品简介 (就地汉化)</div>
        <div class="scope-chip" data-key="tags" onclick="toggleScope(this)">日文标签 (Tag)</div>
        <div class="scope-chip" data-key="novels" onclick="toggleScope(this)">小说列表与正文</div>
        <div class="scope-chip" data-key="comments" onclick="toggleScope(this)">评论区 (全语种)</div>
        <div class="scope-chip" data-key="user_profile" onclick="toggleScope(this)">画师简介</div>
        <div class="scope-chip" data-key="spotlight" onclick="toggleScope(this)">Pixivision 特辑</div>
      </div>
    </div>
  </div>
  <div class="section-footer">
    首页卡片将同时改写底层模型，简介就地展示中文，彻底消除“点击查看更多”弹窗；标签副标题已自动净空，杜绝上下重复堆叠。
  </div>

  <!-- ─── 第二组：小说出版级沉浸排版 ─── -->
  <div class="section-card expanded" id="sec-novel">
    <div class="section-header" onclick="toggleSection('sec-novel')">
      <div class="section-icon" style="background: var(--tint-indigo);">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path
            d="M18 2H6c-1.2 0-2 .8-2 2v16c0 1.2.8 2 2 2h12c1.2 0 2-.8 2-2V4c0-1.2-.8-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
        </svg>
      </div>
      <div class="section-title">小说出版级排版</div>
      <div class="section-summary" id="sum-novel">系统默认 · 规约净化</div>
      <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </div>
    <div class="section-body">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">排版字体风格</div>
          <div class="setting-desc">对标 Pix-Scripting 规范，自由注入精致中文印刷字体</div>
        </div>
        <div class="select-wrap">
          <select class="select-input" id="cfg-novel-font" onchange="saveConfig()">
            <option value="system">系统默认 (苹方)</option>
            <option value="songti">经典宋体 (纸书质感)</option>
            <option value="kaiti">优美楷体 (古雅风格)</option>
            <option value="yuanti">柔和圆体 (亲和温润)</option>
          </select>
          <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">自动净化作者免责声明</div>
          <div class="setting-desc">智能过滤台本商用授权、禁止转载等规约，只呈现小说故事</div>
        </div>
        <label class="switch-wrap">
          <input type="checkbox" id="cfg-clean-disclaimer" onchange="saveConfig()">
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">显示原文</div>
          <div class="setting-desc">开启后按原文在上、译文在下的段落对显示；关闭后仅显示译文</div>
        </div>
        <label class="switch-wrap">
          <input type="checkbox" id="cfg-novel-show-original" onchange="saveConfig()">
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>
  </div>
  <div class="section-footer">
    字号、行距、暗黑模式背景及文字颜色严格同态继承 Pixiv 官方设置，阅读正文上方不再插入生硬标题，保持 100% 沉浸阅读。
  </div>

  <div class="section-card" id="sec-floating">
    <div class="section-header" onclick="toggleSection('sec-floating')">
      <div class="section-icon" style="background: var(--tint-gray);">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round">
          <path d="M6 12h12" />
          <path d="M12 6v12" />
        </svg>
      </div>
      <div class="section-title">悬浮按钮</div>
      <div class="section-summary" id="sum-floating">已开启</div>
      <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </div>
    <div class="section-body">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">显示悬浮按钮</div>
          <div class="setting-desc">翻译过程中显示，位置会自动避开页面控件</div>
        </div>
        <label class="switch-wrap">
          <input type="checkbox" id="cfg-floating-switch" onchange="saveConfig()">
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>
  </div>

  <!-- ─── 第三组：智能 AI 与模型端点 (对标 customAISettings) ─── -->
  <div class="section-card expanded" id="sec-ai">
    <div class="section-header" onclick="toggleSection('sec-ai')">
      <div class="section-icon" style="background: var(--tint-purple);">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path
            d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z" />
        </svg>
      </div>
      <div class="section-title">智能 AI 与模型端点</div>
      <div class="section-summary" id="sum-ai">Google 免费</div>
      <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </div>
    <div class="section-body">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">翻译引擎切换</div>
          <div class="setting-desc">选择底层文本翻译所使用的服务通道</div>
        </div>
        <div class="select-wrap">
          <select class="select-input" id="cfg-translator-source" onchange="onTranslatorChange()">
            <option value="google">Google 免费切片并发 (极速)</option>
            <option value="deepseek">DeepSeek AI (文学润色/需Key)</option>
            <option value="openai">OpenAI / 兼容接口 (需Key)</option>
          </select>
          <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      <!-- DeepSeek 专属配置区 -->
      <div id="ai-deepseek-block" style="padding: 10px 16px 14px; border-bottom: 0.5px solid var(--separator-color);">
        <div class="setting-label" style="font-size: 14px;">DeepSeek API Key</div>
        <div class="input-wrap">
          <input type="password" class="text-input" id="cfg-deepseek-key" placeholder="sk-..." onchange="saveConfig()">
          <button type="button" class="input-action-btn" onclick="toggleInputMask('cfg-deepseek-key')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path
                d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
            </svg>
          </button>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <div style="flex: 2;">
            <div class="setting-desc">端点 URL</div>
            <div class="input-wrap"><input type="text" class="text-input" id="cfg-deepseek-url"
                value="https://api.deepseek.com/v1/chat/completions" onchange="saveConfig()"></div>
          </div>
          <div style="flex: 1.2;">
            <div class="setting-desc">模型名称</div>
            <div class="input-wrap"><input type="text" class="text-input" id="cfg-deepseek-model"
                value="deepseek-v4-flash" onchange="saveConfig()"></div>
          </div>
        </div>
      </div>

      <!-- OpenAI 专属配置区 -->
      <div id="ai-openai-block"
        style="padding: 10px 16px 14px; border-bottom: 0.5px solid var(--separator-color); display: none;">
        <div class="setting-label" style="font-size: 14px;">OpenAI API Key</div>
        <div class="input-wrap">
          <input type="password" class="text-input" id="cfg-openai-key" placeholder="sk-..." onchange="saveConfig()">
          <button type="button" class="input-action-btn" onclick="toggleInputMask('cfg-openai-key')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path
                d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
            </svg>
          </button>
        </div>
        <div style="margin-top: 8px;">
          <div class="setting-desc">OpenAI 兼容端点 URL</div>
          <div class="input-wrap"><input type="text" class="text-input" id="cfg-openai-url"
              value="https://api.openai.com/v1/chat/completions" onchange="saveConfig()"></div>
        </div>
      </div>

      <!-- 测试连接按钮 (对标 customAISettings 测速与连通性检验) -->
      <div class="action-btn-row">
        <button type="button" class="primary-btn" id="btn-test-ai" onclick="testAIConnection()">
          <span>⚡ 测试模型连接与延迟</span>
        </button>
      </div>
    </div>
  </div>
  <div class="section-footer">
    配置保存在本地 Loon 中。Google 免费源已启用多切片并发加速，无需任何 Key 即可达到 120Hz 丝滑体验。
  </div>

  <!-- ─── 第四组：漫画多模态 AI 漫翻 ─── -->
  <div class="section-card" id="sec-manga">
    <div class="section-header" onclick="toggleSection('sec-manga')">
      <div class="section-icon" style="background: var(--tint-cyan);">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path
            d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
        </svg>
      </div>
      <div class="section-title">漫画多模态 AI 漫翻</div>
      <div class="section-summary" id="sum-manga">HUD 气泡字幕</div>
      <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </div>
    <div class="section-body">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">启用图片/漫画 AI 翻译</div>
          <div class="setting-desc">阅读漫画或插画大图时支持智能视觉字幕识别</div>
        </div>
        <label class="switch-wrap">
          <input type="checkbox" id="cfg-manga-switch" onchange="saveConfig()">
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">视觉模型</div>
          <div class="setting-desc">独立于上方文本翻译引擎，专门处理对白框气泡定位</div>
        </div>
        <div class="select-wrap">
          <select class="select-input" id="cfg-manga-engine" onchange="saveConfig()">
            <option value="deepseek_vl">DeepSeek-VL (推荐/极高性价比)</option>
            <option value="gpt4o_mini">GPT-4o-mini Vision (气泡高精度)</option>
            <option value="manga_translator">自建 manga-image-translator</option>
          </select>
          <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">展现样式</div>
          <div class="setting-desc">HUD 气泡字幕覆盖保留 100% 原始超清画质，内存占用 < 100KB</div>
          </div>
          <div class="select-wrap">
            <select class="select-input" id="cfg-manga-rendermode" onchange="saveConfig()">
              <option value="overlay">HUD 气泡字幕悬浮覆盖</option>
              <option value="inpaint">AI 抹字整图重绘 (需自建)</option>
            </select>
            <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
    <div class="section-footer">
      HUD 模式仅发送图片链接，模型返回对白坐标后在屏幕上悬浮半透明对白框，杜绝 iOS 内存膨胀断网。
    </div>

    <!-- ─── 第五组：高级选项与缓存管理 ─── -->
    <div class="section-card" id="sec-advanced">
      <div class="section-header" onclick="toggleSection('sec-advanced')">
        <div class="section-icon" style="background: var(--tint-gray);">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </div>
        <div class="section-title">高级选项与缓存管理</div>
        <div class="section-summary" id="sum-advanced">已就绪</div>
        <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
      <div class="section-body">
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">标签优先使用离线词典</div>
            <div class="setting-desc">内置 2500+ ACG 日文 Tag 映射表，0ms 响应且副标自动净空</div>
          </div>
          <label class="switch-wrap">
            <input type="checkbox" id="cfg-tag-offline" checked onchange="saveConfig()">
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">日志输出级别</div>
            <div class="setting-desc">控制 Loon 脚本日志的详细程度</div>
          </div>
          <div class="select-wrap">
            <select class="select-input" id="cfg-log-level" onchange="saveConfig()">
              <option value="WARN">警告与错误 (推荐)</option>
              <option value="INFO">基础信息</option>
              <option value="DEBUG">详细调试 (含测速)</option>
              <option value="OFF">关闭</option>
            </select>
            <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        <div class="cache" id="cache-summary">
          <div class="setting-label">翻译缓存</div>
          <div class="setting-desc">翻译结果会暂存在本地，以减少重复请求</div>
          <div class="cache-metrics">
            <div class="cache-metric-row">
              <span class="cache-metric-label">已使用</span>
              <strong class="cache-metric-value" id="cache-size">读取中…</strong>
            </div>
            <div class="cache-metric-row">
              <span class="cache-metric-label">缓存条目</span>
              <strong class="cache-metric-value" id="cache-count">读取中…</strong>
            </div>
          </div>
          <div class="cache-action">
            <button type="button" class="secondary-btn danger-btn" onclick="confirmClearCache()">
              <span>清理缓存</span>
            </button>
            <div class="setting-desc" id="cache-feedback" aria-live="polite"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="section-footer">
      图片镜像分流提示：如需节省代理流量并实现看图秒开，可在 Loon 的 [Rule] 段添加规则：<code
        style="background: rgba(127,127,127,0.15); padding: 1px 4px; border-radius: 4px;">DOMAIN,i.pixiv.re,DIRECT</code>。
    </div>

    <script>
      // 默认初始配置字典
      const DEFAULT_CONFIG = {
        "@Pixiv.Enhanced.Settings.Global.Switch": true,
        "@Pixiv.Enhanced.Settings.Auto.Switch": true,
        "@Pixiv.Enhanced.Settings.Auto.Scopes": ["illust_title", "illust_caption", "tags", "comments", "user_profile", "novels", "spotlight"],
        "@Pixiv.Enhanced.Settings.Filter.SkipChinese": true,
        "@Pixiv.Enhanced.Settings.Novel.Font": "system",
        "@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer": true,
        "@Pixiv.Enhanced.Settings.Novel.ShowOriginal": true,
        "@Pixiv.Enhanced.Settings.Floating.Switch": true,
        "@Pixiv.Enhanced.Settings.Translator.Source": "google",
        "@Pixiv.Enhanced.Settings.Target.Lang": "zh-CN",
        "@Pixiv.Enhanced.Settings.Tag.OfflineOnly": true,
        "@Pixiv.Enhanced.Settings.Image.Switch": true,
        "@Pixiv.Enhanced.Settings.Image.Engine": "deepseek_vl",
        "@Pixiv.Enhanced.Settings.Image.RenderMode": "overlay",
        "@Pixiv.Enhanced.Settings.Auth.DeepSeekKey": "",
        "@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl": "https://api.deepseek.com/v1/chat/completions",
        "@Pixiv.Enhanced.Settings.Auth.DeepSeekModel": "deepseek-v4-flash",
        "@Pixiv.Enhanced.Settings.Auth.OpenAIKey": "",
        "@Pixiv.Enhanced.Settings.Auth.OpenAIUrl": "https://api.openai.com/v1/chat/completions",
        "@Pixiv.Enhanced.Settings.Manga.ServerUrl": "http://127.0.0.1:5000",
        "@Pixiv.Enhanced.Settings.LogLevel": "WARN"
      };

      let currentConfig = Object.assign({}, DEFAULT_CONFIG);
      let selectedScopes = new Set(DEFAULT_CONFIG["@Pixiv.Enhanced.Settings.Auto.Scopes"]);

      function showToast(msg, icon) {
        const toast = document.getElementById("px-toast");
        document.getElementById("px-toast-msg").textContent = msg;
        document.getElementById("px-toast-icon").textContent = icon || "✓";
        toast.classList.add("show");
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
      }

      function toggleSection(id) {
        const card = document.getElementById(id);
        if (card) card.classList.toggle("expanded");
      }

      function toggleInputMask(inputId) {
        const input = document.getElementById(inputId);
        if (input) input.type = (input.type === "password") ? "text" : "password";
      }

      function toggleScope(el) {
        const key = el.getAttribute("data-key");
        if (selectedScopes.has(key)) {
          selectedScopes.delete(key);
          el.classList.remove("selected");
        } else {
          selectedScopes.add(key);
          el.classList.add("selected");
        }
        saveConfig();
      }

      function onTranslatorChange() {
        const source = document.getElementById("cfg-translator-source").value;
        const dsBlock = document.getElementById("ai-deepseek-block");
        const oaBlock = document.getElementById("ai-openai-block");
        if (dsBlock) dsBlock.style.display = (source === "deepseek") ? "block" : "none";
        if (oaBlock) oaBlock.style.display = (source === "openai") ? "block" : "none";
        saveConfig();
      }

      function updateSummaries() {
        // 1. 内容与语言
        const autoOn = document.getElementById("cfg-auto-switch").checked;
        const targetLang = document.getElementById("cfg-target-lang").value;
        const langText = (targetLang === "zh-CN") ? "简体" : (targetLang === "zh-TW" ? "繁體" : targetLang);
        document.getElementById("sum-content").textContent = (autoOn ? "自动:开" : "自动:关") + " · " + langText;

        // 2. 小说排版
        const font = document.getElementById("cfg-novel-font").value;
        const fontNameMap = { system: "苹方", songti: "宋体", kaiti: "楷体", yuanti: "圆体" };
        const cleanOn = document.getElementById("cfg-clean-disclaimer").checked;
        document.getElementById("sum-novel").textContent = (fontNameMap[font] || "原版") + " · " + (cleanOn ? "规约净化" : "保留声明");

        const floatingOn = document.getElementById("cfg-floating-switch").checked;
        document.getElementById("sum-floating").textContent = floatingOn ? "已开启" : "已关闭";

        // 3. AI 引擎
        const trans = document.getElementById("cfg-translator-source").value;
        const transMap = { google: "Google免费", deepseek: "DeepSeek", openai: "OpenAI" };
        document.getElementById("sum-ai").textContent = transMap[trans] || trans;

        // 4. 漫翻
        const mangaOn = document.getElementById("cfg-manga-switch").checked;
        document.getElementById("sum-manga").textContent = mangaOn ? "HUD 气泡字幕" : "已关闭";
      }

      async function loadConfig() {
        try {
          const res = await fetch("/api/get").then(r => r.json()).catch(() => null);
          if (res && typeof res === "object") {
            currentConfig = Object.assign({}, DEFAULT_CONFIG, res);
          }
        } catch (e) { }

        // 回填 UI
        document.getElementById("cfg-global-switch").checked = !!currentConfig["@Pixiv.Enhanced.Settings.Global.Switch"];
        document.getElementById("cfg-auto-switch").checked = !!currentConfig["@Pixiv.Enhanced.Settings.Auto.Switch"];
        document.getElementById("cfg-skip-chinese").checked = !!currentConfig["@Pixiv.Enhanced.Settings.Filter.SkipChinese"];
        document.getElementById("cfg-target-lang").value = currentConfig["@Pixiv.Enhanced.Settings.Target.Lang"] || "zh-CN";

        document.getElementById("cfg-novel-font").value = currentConfig["@Pixiv.Enhanced.Settings.Novel.Font"] || "system";
        document.getElementById("cfg-clean-disclaimer").checked = !!currentConfig["@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer"];
        document.getElementById("cfg-novel-show-original").checked = currentConfig["@Pixiv.Enhanced.Settings.Novel.ShowOriginal"] !== false;
        document.getElementById("cfg-floating-switch").checked = currentConfig["@Pixiv.Enhanced.Settings.Floating.Switch"] !== false;

        document.getElementById("cfg-translator-source").value = currentConfig["@Pixiv.Enhanced.Settings.Translator.Source"] || "google";
        document.getElementById("cfg-deepseek-key").value = currentConfig["@Pixiv.Enhanced.Settings.Auth.DeepSeekKey"] || "";
        document.getElementById("cfg-deepseek-url").value = currentConfig["@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl"] || "https://api.deepseek.com/v1/chat/completions";
        document.getElementById("cfg-deepseek-model").value = currentConfig["@Pixiv.Enhanced.Settings.Auth.DeepSeekModel"] || "deepseek-v4-flash";
        document.getElementById("cfg-openai-key").value = currentConfig["@Pixiv.Enhanced.Settings.Auth.OpenAIKey"] || "";
        document.getElementById("cfg-openai-url").value = currentConfig["@Pixiv.Enhanced.Settings.Auth.OpenAIUrl"] || "https://api.openai.com/v1/chat/completions";

        document.getElementById("cfg-manga-switch").checked = !!currentConfig["@Pixiv.Enhanced.Settings.Image.Switch"];
        document.getElementById("cfg-manga-engine").value = currentConfig["@Pixiv.Enhanced.Settings.Image.Engine"] || "deepseek_vl";
        document.getElementById("cfg-manga-rendermode").value = currentConfig["@Pixiv.Enhanced.Settings.Image.RenderMode"] || "overlay";

        document.getElementById("cfg-tag-offline").checked = !!currentConfig["@Pixiv.Enhanced.Settings.Tag.OfflineOnly"];
        document.getElementById("cfg-log-level").value = currentConfig["@Pixiv.Enhanced.Settings.LogLevel"] || "WARN";

        // 渲染 scope 芯片
        const scopes = Array.isArray(currentConfig["@Pixiv.Enhanced.Settings.Auto.Scopes"])
          ? currentConfig["@Pixiv.Enhanced.Settings.Auto.Scopes"]
          : DEFAULT_CONFIG["@Pixiv.Enhanced.Settings.Auto.Scopes"];
        selectedScopes = new Set(scopes);
        document.querySelectorAll(".scope-chip").forEach(chip => {
          const k = chip.getAttribute("data-key");
          if (selectedScopes.has(k)) chip.classList.add("selected");
          else chip.classList.remove("selected");
        });

        onTranslatorChange();
        updateSummaries();
      }

      async function saveConfig() {
        currentConfig["@Pixiv.Enhanced.Settings.Global.Switch"] = document.getElementById("cfg-global-switch").checked;
        currentConfig["@Pixiv.Enhanced.Settings.Auto.Switch"] = document.getElementById("cfg-auto-switch").checked;
        currentConfig["@Pixiv.Enhanced.Settings.Filter.SkipChinese"] = document.getElementById("cfg-skip-chinese").checked;
        currentConfig["@Pixiv.Enhanced.Settings.Target.Lang"] = document.getElementById("cfg-target-lang").value;
        currentConfig["@Pixiv.Enhanced.Settings.Auto.Scopes"] = Array.from(selectedScopes);

        currentConfig["@Pixiv.Enhanced.Settings.Novel.Font"] = document.getElementById("cfg-novel-font").value;
        currentConfig["@Pixiv.Enhanced.Settings.Novel.CleanDisclaimer"] = document.getElementById("cfg-clean-disclaimer").checked;
        currentConfig["@Pixiv.Enhanced.Settings.Novel.ShowOriginal"] = document.getElementById("cfg-novel-show-original").checked;
        currentConfig["@Pixiv.Enhanced.Settings.Floating.Switch"] = document.getElementById("cfg-floating-switch").checked;

        currentConfig["@Pixiv.Enhanced.Settings.Translator.Source"] = document.getElementById("cfg-translator-source").value;
        currentConfig["@Pixiv.Enhanced.Settings.Auth.DeepSeekKey"] = document.getElementById("cfg-deepseek-key").value.trim();
        currentConfig["@Pixiv.Enhanced.Settings.Auth.DeepSeekUrl"] = document.getElementById("cfg-deepseek-url").value.trim();
        currentConfig["@Pixiv.Enhanced.Settings.Auth.DeepSeekModel"] = document.getElementById("cfg-deepseek-model").value.trim();
        currentConfig["@Pixiv.Enhanced.Settings.Auth.OpenAIKey"] = document.getElementById("cfg-openai-key").value.trim();
        currentConfig["@Pixiv.Enhanced.Settings.Auth.OpenAIUrl"] = document.getElementById("cfg-openai-url").value.trim();

        currentConfig["@Pixiv.Enhanced.Settings.Image.Switch"] = document.getElementById("cfg-manga-switch").checked;
        currentConfig["@Pixiv.Enhanced.Settings.Image.Engine"] = document.getElementById("cfg-manga-engine").value;
        currentConfig["@Pixiv.Enhanced.Settings.Image.RenderMode"] = document.getElementById("cfg-manga-rendermode").value;

        currentConfig["@Pixiv.Enhanced.Settings.Tag.OfflineOnly"] = document.getElementById("cfg-tag-offline").checked;
        currentConfig["@Pixiv.Enhanced.Settings.LogLevel"] = document.getElementById("cfg-log-level").value;

        updateSummaries();

        // 向代理脚本存入 Loon $persistentStore
        try {
          await fetch("/api/set", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(currentConfig)
          });
          showToast("设置已实时同步保存", "✓");
        } catch (e) {
          showToast("已在本地更新", "ℹ️");
        }
      }

      async function testAIConnection() {
        const btn = document.getElementById("btn-test-ai");
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ 正在测试连通性与测速…</span>';
        const start = Date.now();

        try {
          const source = document.getElementById("cfg-translator-source").value;
          const res = await fetch("/api/test_ai?source=" + encodeURIComponent(source), { method: "POST" })
            .then(r => r.json())
            .catch(() => null);
          const latency = Date.now() - start;

          if (res && res.ok) {
            btn.innerHTML = '<span>🟢 连接正常 · ' + latency + 'ms</span>';
            showToast("AI 模型连接正常 (" + latency + "ms)", "🟢");
          } else {
            const err = (res && res.error) ? res.error : "请求超时或鉴权失败";
            btn.innerHTML = '<span>🔴 失败: ' + err.slice(0, 16) + '</span>';
            showToast("连接失败: " + err, "❌");
          }
        } catch (e) {
          btn.innerHTML = '<span>🔴 网络异常</span>';
          showToast("网络请求异常", "❌");
        }

        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = '<span>⚡ 测试模型连接与延迟</span>';
        }, 3000);
      }

      async function loadCacheStats() {
        const sizeEl = document.getElementById("cache-size");
        const countEl = document.getElementById("cache-count");
        try {
          const res = await fetch("/api/cache_stats").then(r => r.json());
          if (!res || !res.ok) throw new Error("统计不可用");
          sizeEl.textContent = res.sizeText;
          countEl.textContent = res.count + " 个";
        } catch (e) {
          sizeEl.textContent = "不可用";
          countEl.textContent = "不可用";
        }
      }

      async function confirmClearCache() {
        if (!confirm("清理缓存将删除所有已保存的翻译缓存，不会影响插件设置。\n\n确定继续吗？")) return;
        const feedback = document.getElementById("cache-feedback");
        feedback.textContent = "正在清理…";
        try {
          const res = await fetch("/api/clear_cache", { method: "POST" }).then(r => r.json());
          if (!res || !res.ok) throw new Error("清理失败");
          feedback.textContent = "缓存已清理 · 已释放 " + res.sizeText + " · 已删除 " + res.count + " 条";
          showToast("缓存已清理", "✓");
          await loadCacheStats();
        } catch (e) {
          feedback.textContent = "清理失败，请稍后重试";
          showToast("清理缓存失败", "!");
        }
      }

      // 页面加载自动拉取配置
      document.addEventListener("DOMContentLoaded", () => {
        loadConfig();
        loadCacheStats();
      });
    </script>
</body>

</html>