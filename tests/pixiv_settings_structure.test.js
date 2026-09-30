const assert = require("assert");
const fs = require("fs");

const settings = fs.readFileSync("scripts/tools/pixiv/settings.html", "utf8");
const enhanced = fs.readFileSync("scripts/tools/pixiv/pixiv_enhanced.js", "utf8");

assert(settings.includes('id="cfg-floating-switch"'), "settings page needs the floating-button master switch");
assert(!settings.includes('class="section-card expanded"'), "settings sections should be collapsed by default");
assert(settings.includes('id="cfg-novel-show-original"'), "novel settings need a show-original switch");
assert(!settings.includes('value="microsoft"'), "Microsoft translator must be removed from settings");
assert(!settings.includes('value="baidu"'), "Baidu translator must be removed from settings");
assert(settings.includes("独立于上方文本翻译引擎"), "manga model scope must be explicit");
assert(!settings.includes("cache-overview"), "cache stats must not use the old oversized layout");
assert(!settings.includes("cache-stats>div"), "cache stats must not use nested metric cards");
assert(!settings.includes("悬浮按钮位置与交互"), "low-level floating-button positioning must be removed");
assert(settings.includes('id="cache-size"'), "settings page needs a real cache-size display");
assert(settings.includes('id="cache-count"'), "settings page needs a real cache-count display");
assert(settings.includes("cache-metric-row"), "cache metrics should use compact setting rows");
assert(settings.includes(".scope-chip.selected::after"), "selected translation scopes need a visible check marker");
assert(settings.includes("confirmClearCache"), "cache clearing needs an explicit confirmation flow");
assert(enhanced.includes('"@Pixiv.Enhanced.Settings.Floating.Switch"'), "runtime must persist the floating-button switch");
assert(enhanced.includes('"@Pixiv.Enhanced.Settings.Novel.ShowOriginal"'), "runtime must persist novel original visibility");
assert(!enhanced.includes('"@Pixiv.Enhanced.Settings.Auth.MsKey"'), "Microsoft credentials must be removed from runtime config");
assert(!enhanced.includes('"@Pixiv.Enhanced.Settings.Auth.BaiduAppid"'), "Baidu credentials must be removed from runtime config");
assert(enhanced.includes("handleApiCacheStats"), "runtime must expose cache statistics");
assert(enhanced.includes("translation-pair"), "novel rendering must use paragraph pairs");
assert(enhanced.includes("translateMangaImage"), "manga translation must call a real model adapter");
assert(!enhanced.includes("mockBubbles"), "manga translation must not return mock bubbles");
assert(enhanced.includes("imageSwitch"), "manga enable switch must reach runtime");
assert(enhanced.includes("if (!imageSwitch)"), "disabled manga translation must not start");
assert(enhanced.includes("positionFabAroundNativeControls"), "floating button must avoid native controls");
assert(enhanced.includes("cfg.deepseekKey"), "visual translation must reuse saved DeepSeek credentials");
assert(enhanced.includes("cfg.openaiKey"), "visual translation must reuse saved OpenAI credentials");

console.log("pixiv settings structure: PASS");