/**
 * 咪咕音乐签到
 * cron: 0 8 * * *
 * tag: 咪咕音乐
 * @tag 咪咕音乐
 * new Env('咪咕音乐')
 *
 * 青龙专版：环境变量只需填一个账号密码
 *   MIGU_AUTH = 手机号@密码
 *   （多账号可用换行或 & 分隔，密码含 & / @ 时用 JSON 数组）
 * 默认全开（签到/社区/听歌/评论），仅「设置彩铃」默认关闭；
 * 评论正文默认从 10 句诗句中每次随机取一句。
 */
/**
 * 脚本名称：咪咕音乐签到
 * 活动规则：咪咕音乐 AI豆中心：每日签到、社区入口、歌曲评论、彩铃、听歌领 AI豆
 * 脚本说明：账号由环境变量 MIGU_AUTH 提供（手机号@密码），脚本按官方网页登录链路
 *          passport.migu.cn（RSA 加密手机号/密码）→ c.musicapp.migu.cn 换 pacmtoken → 用户资料，
 *          再用 uid/手机号/本机出口 IP/deviceId 生成安卓 8.9.5 原生 ce，逐账号缓存复用。
 *          日常任务走同账号 H5 接口；原生接口按 V005 现场签名（请求路径+ce+13位时间戳+请求体）。
 *          每日执行：签到（新人七日/普通自动分流）、社区入口、听歌领奖；
 *          听歌开启后按 MP3 实际时长真实计时、每 10 秒上报一次并独立核对服务端增量；
 *          评论与彩铃是真实副作用（公开评论/改变本人铃音），彩铃默认关闭。
 * 配置说明：boxjs「咪咕音乐签到」中：
 *          - MIGU_AUTH         手机号@密码，多个用 & 或换行分隔；密码含 & / @ 时用 JSON：[{"phone":"138...","password":"..."}]
 *          - migu_listen        默认 true：真实计时听歌上报（需能取到音频二进制，Node / Quantumult X 可解析 MP3）
 *          - migu_listen_seconds 本次最多实播秒数，默认 1800（1..1800），全部档位达标提前结束
 *          - migu_comment       默认 true：公开发一条歌曲评论（每天最多一条）；歌曲自动从「咪咕尖叫榜·全网热歌榜」公开接口读取（取带 songId 的条目、优先非 VIP）
 *          - migu_comment_text  评论正文，支持用 | 或换行写多条，每次随机取一条；留空默认使用 10 句诗句（每条 1..120 字，不含链接/@）
 *          - migu_ringtone      默认 false：从「一日一铃」免费库随机设置一条，会改变本人彩铃
 *          - migu_ip            可选：生成 ce 时使用的客户端地址，留空用本机/出口 IP
 *          - migu_dgdd          默认 true：动感地带1314粉丝节（主会场访问/浏览/分享/视频 + 分会场报名/签到/抽奖）
 *          - migu_dgdd_prize    可选：主会场抽奖 prizeId（格式 FSJ_YYMM_XXXX，如 2026-11 为 FSJ_2611_BDWPYK）；留空则只做任务不抽主会场奖
 *          - migu_debug         调试模式
 *          Node 环境变量同名可用
 * 更新时间：2026-11-13

------------------ Surge 配置 ------------------

[Script]
咪咕音乐签到 = type=cron,cronexp="0 8 * * *",wake-system=1,timeout=3600,script-path=https://raw.githubusercontent.com/jy0703/scripts/main/scripts/migu_sign.js,script-update-interval=0

------------------- Loon 配置 -------------------

[Script]
cron "0 8 * * *" script-path=https://raw.githubusercontent.com/jy0703/scripts/main/scripts/migu_sign.js, timeout=3600, tag=咪咕音乐签到

--------------- Quantumult X 配置 ---------------

[task_local]
0 8 * * * https://raw.githubusercontent.com/jy0703/scripts/main/scripts/migu_sign.js, tag=咪咕音乐签到, img-url=https://raw.githubusercontent.com/jy0703/scripts/main/icons/migu.png, enabled=true

 */

const $ = new Env('咪咕音乐');
$.daidaiTasks = [];

// ---- 业务常量（照 py 源码逐一搬运） ----
const API_ORIGIN = 'https://app.c.nf.migu.cn';
const USER_ORIGIN = 'https://app.u.nf.migu.cn';
const PD_ORIGIN = 'https://app.pd.nf.migu.cn';
const PASSPORT = 'https://passport.migu.cn';
const WEB_API = 'https://c.musicapp.migu.cn';
const WEB_ORIGIN = 'https://music.migu.cn';
const UA_WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const LOGIN_PARAMS = [['sourceid', '220029'], ['forceAuthn', 'true'], ['hideRegister', '1'], ['hideForgetPass', '1'], ['callbackURL', 'PostToken']];

const SONGS = '/act-jbzx/song-task/v2.0';
const BALANCE = '/act-jbzx/ai-bean/query-available';
const LISTEN_URL = '/strategy/listen-url/v3.4';
const SONG_REPORT = '/act-message/report/song-duration/v1';
const RECEIVE_REWARD = '/act-jbzx/receive-task-rewards/v2.0';
const COMMENT_TASK = 'c840d039adfd4c04920d92c04120baa8';
const COMMENT_LIST = '/user/comment/stack/v1.0';
const COMMENT_ADD = '/user/api/comment/add/v2.0';
const NEW_SIGN_STATUS = '/act-jbzx/new-user-receive/status';
const NORMAL_SIGN_STATUS = '/act-jbzx/sign/status';
const NEW_SIGN = '/act-jbzx/new-user-receive';
const NORMAL_SIGN = '/act-jbzx/sign';
const MOBILE_STATUS = '/phoneCode/isMobile';
const RBT_STATUS = '/ringbacktone/rbt-all-status/v1.0';
const RBT_IDS = '/ringbacktone/setting-contentid-list/v2.0';
const RBT_SETTINGS = '/ringbacktone/setting-list/v1.0';
const RBT_LIBRARY = '/ringbacktone/queryLib/v2.0';
const RBT_IDLE = '/ringbacktone/idle-list/v1.0';
const RBT_DAILY_PAGE = '/bmw/page-info/v1.0';
const RBT_DAILY_GROUP = '/bmw/container-group/v1.0';
const RBT_DAILY_SOURCE = '/bmw/page-datasource/v1.0';
const RBT_NEXT_OP = '/v1.0/rbt/get-next-operation';
const RBT_PRICE = '/strategy/biz-info-and-times/v1.0';
const RBT_SET_TO_PLAY = '/ringbacktone/vrbt-set-to-play/v2.0';
const RBT_PAGE_ID = '69df566b1dec4544e9c1ca00';
const COMMENT_RANK_ID = '83048887';
const RANK_INFO = '/pc/bmw/rank/rank-info/v1.0';
// ---- 动感地带1314粉丝节（每月13/14号） ----
const DGDD_MAIN = 'MAC_KF_HS_DGDD1314FSJ';
const DGDD_SUB = 'MAC_WJ_MB_DGDD1314FSJCDYLSMP';
const DGDD_REFERER = 'https://h5.nf.migu.cn/app/gm/v1/index.html?id=100266';
const DGDD_SUB_REFERER = 'https://h5.nf.migu.cn/app/gm/v1/index.html?id=103804';
const DGDD_STATE = '/act-dgddbayfsj/taskState';
const DGDD_VISIT = '/act-dgddbayfsj/visit-activity';
const DGDD_REPORT = '/act-dgddbayfsj/report';
const DGDD_PRIZE = '/act-dgddbayfsj/prize';
const DGDD_JOIN = '/act-task/join-activity';
const DRAW_TIMES = '/act-draw/query-times';
const DRAW_DO = '/act-draw/draw';

// 官方 APK 签名证书字符（公开常量）、App 侧静态编码表，均为 py 源码原值
const APK_CERT_PREFIX = '308202333082019ca00302010202044d';
const APP_CODEC_KEY = 'ccTWaprX2aWmTIgA';
const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const MEDIA_HOSTS = ['freetyst.nf.migu.cn', 'freevod.nf.migu.cn'];
const DEFAULT_COMMENT = [
    '此曲只应天上有，人间能得几回闻。',
    '此情可待成追忆，只是当时已惘然。',
    '海上生明月，天涯共此时。',
    '但愿人长久，千里共婵娟。',
    '千门万户曈曈日，总把新桃换旧符。',
    '春风得意马蹄疾，一日看尽长安花。',
    '海内存知己，天涯若比邻。',
    '欲穷千里目，更上一层楼。',
    '采菊东篱下，悠然见南山。',
    '落红不是无情物，化作春泥更护花。'
];
const HEADER_ALLOW = ['accept', 'accept-language', 'appid', 'brand', 'buildid', 'ce', 'channel',
    'gsm', 'hwid', 'language', 'mgm-network-operators', 'mgm-network-standard',
    'mgm-network-type', 'mgm-user-agent', 'mode', 'oaid', 'os', 'osversion',
    'pkgname', 'platform', 'randomsessionkey', 'recommendstatus', 'subchannel',
    'token', 'ua', 'user-agent', 'userlevel', 'verify', 'version'];
const LISTEN_PARAMS = [['albumId', '64446'], ['contentId', '600919000009796787'],
    ['lowerQualityContentId', '600919000009796787'], ['netType', '00'],
    ['resourceType', '2'], ['songId', '4030758'], ['toneFlag', 'PQ']];
const LOGIN_CHALLENGES = {
    '4002': '图形验证码', '4044': '图形计算验证码', '4045': '汉字验证码',
    '6123': '滑块验证', '6103': '二次短信验证', '6118': '语音验证',
    '6119': '绑定手机验证', '4016': '密码尝试次数限制'
};

// 接口白名单：只允许 py 已核验过的路径，签名/身份模式不符直接拒绝
const PATHS = {};
function allow(method, path, origin, native) { PATHS[method + ' ' + path] = { origin: origin, native: !!native }; }
allow('GET', '/act-task/query-tasks', API_ORIGIN, false);
allow('GET', BALANCE, API_ORIGIN, false);
allow('GET', '/act-jbzx/music-bean-accumulate', API_ORIGIN, false);
allow('POST', '/act-task/task-report', API_ORIGIN, false);
allow('GET', NEW_SIGN_STATUS, API_ORIGIN, false);
allow('GET', NORMAL_SIGN_STATUS, API_ORIGIN, false);
allow('POST', NEW_SIGN, API_ORIGIN, false);
allow('POST', NORMAL_SIGN, API_ORIGIN, false);
allow('GET', MOBILE_STATUS, API_ORIGIN, false);
allow('GET', COMMENT_LIST, API_ORIGIN, true);
allow('POST', COMMENT_ADD, USER_ORIGIN, true);
allow('GET', RBT_STATUS, API_ORIGIN, true);
allow('GET', RBT_IDS, API_ORIGIN, true);
allow('GET', RBT_SETTINGS, API_ORIGIN, true);
allow('GET', RBT_LIBRARY, PD_ORIGIN, true);
allow('GET', RBT_IDLE, PD_ORIGIN, true);
allow('GET', RBT_DAILY_PAGE, API_ORIGIN, true);
allow('GET', RBT_DAILY_GROUP, API_ORIGIN, true);
allow('GET', RBT_DAILY_SOURCE, API_ORIGIN, true);
allow('GET', RBT_NEXT_OP, API_ORIGIN, true);
allow('GET', RBT_PRICE, API_ORIGIN, true);
allow('POST', RBT_SET_TO_PLAY, API_ORIGIN, true);
allow('GET', SONGS, API_ORIGIN, true);
allow('GET', LISTEN_URL, API_ORIGIN, true);
allow('POST', SONG_REPORT, API_ORIGIN, true);
allow('POST', RECEIVE_REWARD, API_ORIGIN, true);
allow('GET', DGDD_STATE, API_ORIGIN, false);
allow('POST', DGDD_VISIT, API_ORIGIN, false);
allow('POST', DGDD_REPORT, API_ORIGIN, false);
allow('POST', DGDD_PRIZE, API_ORIGIN, false);
allow('GET', DGDD_JOIN, API_ORIGIN, false);
allow('POST', DRAW_TIMES, API_ORIGIN, false);
allow('POST', DRAW_DO, API_ORIGIN, false);

class MiguError extends Error { }

function Crypt(type, a, b, c) { function MD5(string) { function RotateLeft(lValue, iShiftBits) { return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits)); } function AddUnsigned(lX, lY) { var lX4, lY4, lX8, lY8, lResult; lX8 = (lX & 0x80000000); lY8 = (lY & 0x80000000); lX4 = (lX & 0x40000000); lY4 = (lY & 0x40000000); lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF); if (lX4 & lY4) { return (lResult ^ 0x80000000 ^ lX8 ^ lY8); } if (lX4 | lY4) { if (lResult & 0x40000000) { return (lResult ^ 0xC0000000 ^ lX8 ^ lY8); } else { return (lResult ^ 0x40000000 ^ lX8 ^ lY8); } } else { return (lResult ^ lX8 ^ lY8); } } function F(x, y, z) { return (x & y) | ((~x) & z); } function G(x, y, z) { return (x & z) | (y & (~z)); } function H(x, y, z) { return (x ^ y ^ z); } function I(x, y, z) { return (y ^ (x | (~z))); } function FF(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }; function GG(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }; function HH(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }; function II(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }; function ConvertToWordArray(string) { var lWordCount; var lMessageLength = string.length; var lNumberOfWords_temp1 = lMessageLength + 8; var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64; var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16; var lWordArray = Array(lNumberOfWords - 1); var lBytePosition = 0; var lByteCount = 0; while (lByteCount < lMessageLength) { lWordCount = (lByteCount - (lByteCount % 4)) / 4; lBytePosition = (lByteCount % 4) * 8; lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition)); lByteCount++; } lWordCount = (lByteCount - (lByteCount % 4)) / 4; lBytePosition = (lByteCount % 4) * 8; lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition); lWordArray[lNumberOfWords - 2] = lMessageLength << 3; lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29; return lWordArray; }; function WordToHex(lValue) { var WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount; for (lCount = 0; lCount <= 3; lCount++) { lByte = (lValue >>> (lCount * 8)) & 255; WordToHexValue_temp = "0" + lByte.toString(16); WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2); } return WordToHexValue; }; function Utf8Encode(string) { string = string.replace(/\r\n/g, "\n"); var utftext = ""; for (var n = 0; n < string.length; n++) { var c = string.charCodeAt(n); if (c < 128) { utftext += String.fromCharCode(c); } else if ((c > 127) && (c < 2048)) { utftext += String.fromCharCode((c >> 6) | 192); utftext += String.fromCharCode((c & 63) | 128); } else { utftext += String.fromCharCode((c >> 12) | 224); utftext += String.fromCharCode(((c >> 6) & 63) | 128); utftext += String.fromCharCode((c & 63) | 128); } } return utftext; }; var x = Array(); var k, AA, BB, CC, DD, a, b, c, d; var S11 = 7, S12 = 12, S13 = 17, S14 = 22; var S21 = 5, S22 = 9, S23 = 14, S24 = 20; var S31 = 4, S32 = 11, S33 = 16, S34 = 23; var S41 = 6, S42 = 10, S43 = 15, S44 = 21; string = Utf8Encode(string); x = ConvertToWordArray(string); a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476; for (k = 0; k < x.length; k += 16) { AA = a; BB = b; CC = c; DD = d; a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478); d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756); c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB); b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE); a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF); d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A); c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613); b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501); a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8); d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF); c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1); b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE); a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122); d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193); c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E); b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821); a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562); d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340); c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51); b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA); a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D); d = GG(d, a, b, c, x[k + 10], S22, 0x2441453); c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681); b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8); a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6); d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6); c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87); b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED); a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905); d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8); c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9); b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A); a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942); d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681); c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122); b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C); a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44); d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9); c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60); b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70); a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6); d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA); c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085); b = HH(b, c, d, a, x[k + 6], S34, 0x4881D05); a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039); d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5); c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8); b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665); a = II(a, b, c, d, x[k + 0], S41, 0xF4292244); d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97); c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7); b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039); a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3); d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92); c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D); b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1); a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F); d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0); c = II(c, d, a, b, x[k + 6], S43, 0xA3014314); b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1); a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82); d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235); c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB); b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391); a = AddUnsigned(a, AA); b = AddUnsigned(b, BB); c = AddUnsigned(c, CC); d = AddUnsigned(d, DD); } var temp = WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d); return temp.toLowerCase(); } function _rsa(pem, string) { function Utf8Encode(str) { const out = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) out.push(c); else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63)); else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const c2 = str.charCodeAt(++i); const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); out.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63)); } else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } return out; } function SHA256(msg) { const K = [ 0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2 ]; let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]; const rr = (x, n) => (x >>> n) | (x << (32 - n)); const data = msg.slice(); const bitLenHi = Math.floor(data.length / 536870912), bitLenLo = (data.length * 8) >>> 0; data.push(0x80); while (data.length % 64 !== 56) data.push(0); data.push((bitLenHi >>> 24) & 255, (bitLenHi >>> 16) & 255, (bitLenHi >>> 8) & 255, bitLenHi & 255); data.push((bitLenLo >>> 24) & 255, (bitLenLo >>> 16) & 255, (bitLenLo >>> 8) & 255, bitLenLo & 255); const w = new Array(64); for (let i = 0; i < data.length; i += 64) { for (let j = 0; j < 16; j++) { w[j] = ((data[i + j * 4] << 24) | (data[i + j * 4 + 1] << 16) | (data[i + j * 4 + 2] << 8) | data[i + j * 4 + 3]) >>> 0; } for (let j = 16; j < 64; j++) { const s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3); const s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10); w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0; } let [a, b, c, d, e, f, g, h] = H; for (let j = 0; j < 64; j++) { const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25); const ch = (e & f) ^ (~e & g); const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0; const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22); const mj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + mj) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; } H = H.map((v, idx) => (v + [a, b, c, d, e, f, g, h][idx]) >>> 0); } const out = []; for (const v of H) out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return out; } function BytesToBase64(bytes) { const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < bytes.length; i += 3) { const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]; s += CHARS[b0 >> 2]; s += b1 === undefined ? CHARS[(b0 & 3) << 4] + '==' : b2 === undefined ? CHARS[((b0 & 3) << 4) | (b1 >> 4)] + CHARS[(b1 & 15) << 2] + '=' : CHARS[((b0 & 3) << 4) | (b1 >> 4)] + CHARS[((b1 & 15) << 2) | (b2 >> 6)] + CHARS[b2 & 63]; } return s; } function Base64ToBytes(b64) { const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const map = {}; for (let i = 0; i < 64; i++) map[CHARS[i]] = i; const bytes = []; let acc = 0, bits = 0; for (const c of b64.replace(/[^A-Za-z0-9+/]/g, '')) { acc = (acc << 6) | map[c]; bits += 6; if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); } } return bytes; } function BytesToBigInt(bytes) { let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b); return n; } function BigIntToBytes(n, len) { const out = new Array(len).fill(0); for (let i = len - 1; i >= 0 && n > 0n; i--) { out[i] = Number(n & 0xffn); n >>= 8n; } return out; } function ModPow(base, exp, mod) { let r = 1n; base %= mod; while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; base = (base * base) % mod; exp >>= 1n; } return r; } function DerRead(buf, off) { const tag = buf[off++]; let len = buf[off++]; if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[off + i]; off += n; } return { tag, start: off, len }; } function DerChildren(buf, start, end) { const list = []; let off = start; while (off < end) { const t = DerRead(buf, off); list.push(t); off = t.start + t.len; } return list; } if (!_rsa._k || _rsa._kp !== pem) { try { const der = Base64ToBytes(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')); let seqs = DerChildren(der, DerRead(der, 0).start, der.length); const inner = seqs.find(s => s.tag === 0x04); if (inner) { const seq2 = DerRead(der, inner.start); seqs = DerChildren(der, seq2.start, seq2.start + seq2.len); } const ints = seqs.filter(s => s.tag === 0x02); const n = BytesToBigInt(der.slice(ints[1].start, ints[1].start + ints[1].len)); const d = BytesToBigInt(der.slice(ints[3].start, ints[3].start + ints[3].len)); _rsa._k = { n, d, k: (n.toString(16).length + 1) >> 1 }; _rsa._kp = pem; } catch (e) { $.logErr('❌ [签名] 私钥解析失败: ' + (e.message || e)); return null; } } const key = _rsa._k; try { const digestInfo = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20, ...SHA256(Utf8Encode(string))]; const padded = [0x00, 0x01, ...new Array(key.k - digestInfo.length - 3).fill(0xff), 0x00, ...digestInfo]; const sig = ModPow(BytesToBigInt(padded), key.d, key.n); return BytesToBase64(BigIntToBytes(sig, key.k)).replace(/\//g, '_').replace(/\+/g, '-'); } catch (e) { $.logErr('❌ [签名] 签名异常: ' + (e.message || e)); return null; } } function _rsaenc(b64Pub, string) { function Utf8Encode(str) { const out = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) out.push(c); else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63)); else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const c2 = str.charCodeAt(++i); const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); out.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63)); } else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } return out; } function BytesToBase64(bytes) { const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < bytes.length; i += 3) { const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]; s += CHARS[b0 >> 2]; s += b1 === undefined ? CHARS[(b0 & 3) << 4] + '==' : b2 === undefined ? CHARS[((b0 & 3) << 4) | (b1 >> 4)] + CHARS[(b1 & 15) << 2] + '=' : CHARS[((b0 & 3) << 4) | (b1 >> 4)] + CHARS[((b1 & 15) << 2) | (b2 >> 6)] + CHARS[b2 & 63]; } return s; } function Base64ToBytes(b64) { const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const map = {}; for (let i = 0; i < 64; i++) map[CHARS[i]] = i; const bytes = []; let acc = 0, bits = 0; for (const c of String(b64).replace(/[^A-Za-z0-9+/]/g, '')) { acc = (acc << 6) | map[c]; bits += 6; if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); } } return bytes; } function BytesToBigInt(bytes) { let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b); return n; } function BigIntToBytes(n, len) { const out = new Array(len).fill(0); for (let i = len - 1; i >= 0 && n > 0n; i--) { out[i] = Number(n & 0xffn); n >>= 8n; } return out; } function ModPow(base, exp, mod) { let r = 1n; base %= mod; while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; base = (base * base) % mod; exp >>= 1n; } return r; } function DerRead(buf, off) { const tag = buf[off++]; let len = buf[off++]; if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[off + i]; off += n; } return { tag, start: off, len }; } function DerChildren(buf, start, end) { const list = []; let off = start; while (off < end) { const t = DerRead(buf, off); list.push(t); off = t.start + t.len; } return list; } if (!_rsaenc._k || _rsaenc._kp !== b64Pub) { try { let der = Base64ToBytes(String(b64Pub).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')); if (der.length > 5 && der.slice(0, 5).map(b => String.fromCharCode(b)).join('') === '-----') { der = Base64ToBytes(der.map(b => String.fromCharCode(b)).join('').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')); } const outer = DerRead(der, 0); const bitStr = DerChildren(der, outer.start, outer.start + outer.len).find(s => s.tag === 0x03); let ints; if (bitStr) { const seq = DerRead(der, bitStr.start + 1); ints = DerChildren(der, seq.start, seq.start + seq.len).filter(s => s.tag === 0x02); } else { ints = DerChildren(der, outer.start, outer.start + outer.len).filter(s => s.tag === 0x02); if (ints.length < 2) throw new Error('公钥解析失败(支持 SPKI/PKCS#1)'); } const n = BytesToBigInt(der.slice(ints[0].start, ints[0].start + ints[0].len)); const e = BytesToBigInt(der.slice(ints[1].start, ints[1].start + ints[1].len)); _rsaenc._k = { n, e, k: (n.toString(16).length + 1) >> 1 }; _rsaenc._kp = b64Pub; } catch (err) { $.logErr('❌ [加密] 公钥解析失败: ' + (err.message || err)); return null; } } const key = _rsaenc._k; try { const msg = Utf8Encode(string); const psLen = key.k - msg.length - 3; if (psLen < 8) { $.logErr('❌ [加密] 明文超出 RSA 长度上限'); return null; } const ps = new Array(psLen); for (let i = 0; i < psLen; i++) ps[i] = 1 + Math.floor(Math.random() * 255); const padded = [0x00, 0x02, ...ps, 0x00, ...msg]; return BytesToBase64(BigIntToBytes(ModPow(BytesToBigInt(padded), key.e, key.n), key.k)); } catch (err) { $.logErr('❌ [加密] RSA 加密异常: ' + (err.message || err)); return null; } } function _hmac(b64Key, msg) { function Utf8Encode(str) { const out = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) out.push(c); else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63)); else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const c2 = str.charCodeAt(++i); const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); out.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63)); } else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } return out; } function SHA256(msg) { const K = [ 0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2 ]; let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]; const rr = (x, n) => (x >>> n) | (x << (32 - n)); const data = msg.slice(); const bitLenHi = Math.floor(data.length / 536870912), bitLenLo = (data.length * 8) >>> 0; data.push(0x80); while (data.length % 64 !== 56) data.push(0); data.push((bitLenHi >>> 24) & 255, (bitLenHi >>> 16) & 255, (bitLenHi >>> 8) & 255, bitLenHi & 255); data.push((bitLenLo >>> 24) & 255, (bitLenLo >>> 16) & 255, (bitLenLo >>> 8) & 255, bitLenLo & 255); const w = new Array(64); for (let i = 0; i < data.length; i += 64) { for (let j = 0; j < 16; j++) { w[j] = ((data[i + j * 4] << 24) | (data[i + j * 4 + 1] << 16) | (data[i + j * 4 + 2] << 8) | data[i + j * 4 + 3]) >>> 0; } for (let j = 16; j < 64; j++) { const s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3); const s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10); w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0; } let [a, b, c, d, e, f, g, h] = H; for (let j = 0; j < 64; j++) { const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25); const ch = (e & f) ^ (~e & g); const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0; const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22); const mj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + mj) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; } H = H.map((v, idx) => (v + [a, b, c, d, e, f, g, h][idx]) >>> 0); } const out = []; for (const v of H) out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return out; } function Base64ToBytes(b64) { const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const map = {}; for (let i = 0; i < 64; i++) map[CHARS[i]] = i; const bytes = []; let acc = 0, bits = 0; for (const c of b64.replace(/[^A-Za-z0-9+/]/g, '')) { acc = (acc << 6) | map[c]; bits += 6; if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); } } return bytes; } let key = Utf8Encode(b64Key); if (key.length > 64) key = SHA256(key); while (key.length < 64) key.push(0); const inner = SHA256(key.map(b => b ^ 0x36).concat(Utf8Encode(msg))); const outer = SHA256(key.map(b => b ^ 0x5c).concat(inner)); return outer.map(b => b.toString(16).padStart(2, '0')).join(''); } function _aes(plain, keyStr, ivStr, ecb, ivp) { function Utf8Encode(str) { const out = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) out.push(c); else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63)); else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const c2 = str.charCodeAt(++i); const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); out.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63)); } else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } return out; } function BytesToBase64(bytes) { const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < bytes.length; i += 3) { const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]; s += CHARS[b0 >> 2]; s += b1 === undefined ? CHARS[(b0 & 3) << 4] + '==' : b2 === undefined ? CHARS[((b0 & 3) << 4) | (b1 >> 4)] + CHARS[(b1 & 15) << 2] + '=' : CHARS[((b0 & 3) << 4) | (b1 >> 4)] + CHARS[((b1 & 15) << 2) | (b2 >> 6)] + CHARS[b2 & 63]; } return s; } const SBOX = (function () { function gmul(a, b) { let p = 0; for (let i = 0; i < 8; i++) { if ((b >> i) & 1) p ^= a; a = ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; } return p; } const sbox = new Array(256); for (let x = 0; x < 256; x++) { let inv = 0; if (x !== 0) { inv = 1; while (gmul(inv, x) !== 1) inv++; } const r = (v, n) => ((v << n) | (v >> (8 - n))) & 0xff; sbox[x] = (inv ^ r(inv, 1) ^ r(inv, 2) ^ r(inv, 3) ^ r(inv, 4) ^ 0x63) & 0xff; } return sbox; })(); function expandKey(key) { const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]; const Nk = key.length >> 2, Nr = Nk + 6, tw = 4 * (Nr + 1); const w = []; for (let i = 0; i < Nk; i++) w.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]); for (let i = Nk; i < tw; i++) { let t = w[i - 1].slice(); if (i % Nk === 0) { t = [t[1], t[2], t[3], t[0]].map(b => SBOX[b]); t[0] ^= RCON[i / Nk - 1]; } else if (Nk > 6 && i % Nk === 4) t = t.map(b => SBOX[b]); w.push([w[i - Nk][0] ^ t[0], w[i - Nk][1] ^ t[1], w[i - Nk][2] ^ t[2], w[i - Nk][3] ^ t[3]]); } const rk = []; for (let round = 0; round <= Nr; round++) { const blk = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) blk[4 * c + r] = w[4 * round + c][r]; rk.push(blk); } return { rk: rk, Nr: Nr }; } function encryptBlock(input, rk, Nr) { let s = input.slice(); const addRK = (round) => { for (let i = 0; i < 16; i++) s[i] ^= rk[round][i]; }; const xtime = (a) => ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; addRK(0); for (let round = 1; round <= Nr; round++) { for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]; const t = s.slice(); for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) t[4 * c + r] = s[4 * ((c + r) % 4) + r]; s = t; if (round < Nr) { for (let c = 0; c < 4; c++) { const a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3]; s[4 * c] = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3; s[4 * c + 1] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3; s[4 * c + 2] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3); s[4 * c + 3] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3); } } addRK(round); } return s; } const data = Utf8Encode(plain); const padLen = 16 - (data.length % 16); for (let i = 0; i < padLen; i++) data.push(padLen); const ks = expandKey(Utf8Encode(keyStr)); let prev = ecb ? null : Utf8Encode(ivStr).slice(0, 16); const out = ivp ? prev.slice() : []; for (let off = 0; off < data.length; off += 16) { const blk = new Array(16); for (let i = 0; i < 16; i++) blk[i] = data[off + i] ^ (ecb ? 0 : prev[i]); prev = encryptBlock(blk, ks.rk, ks.Nr); out.push(...prev); } return BytesToBase64(out); } function _aesdec(cipher, keyStr, ecb, hexIn, ivStr) { function Base64ToBytes(b64) { const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const map = {}; for (let i = 0; i < 64; i++) map[CHARS[i]] = i; const bytes = []; let acc = 0, bits = 0; for (const c of String(b64).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '')) { acc = (acc << 6) | map[c]; bits += 6; if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); } } return bytes; } function HexToBytes(h) { const s = String(h).replace(/[^0-9a-fA-F]/g, ''); const bytes = []; for (let i = 0; i + 1 < s.length; i += 2) bytes.push(parseInt(s.substr(i, 2), 16)); if (s.length % 2) bytes.push(parseInt(s.slice(-1), 16)); return bytes; } function BytesToUtf8(bytes) { let s = ''; for (let i = 0; i < bytes.length;) { const b = bytes[i]; if (b < 128) { s += String.fromCharCode(b); i += 1; } else if (b >= 240 && i + 3 < bytes.length) { const cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63); const v = cp - 0x10000; s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)); i += 4; } else if (b >= 224 && i + 2 < bytes.length) { s += String.fromCharCode(((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)); i += 3; } else if (b >= 192 && i + 1 < bytes.length) { s += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63)); i += 2; } else { s += String.fromCharCode(b); i += 1; } } return s; } const SBOX = (function () { function gmul(a, b) { let p = 0; for (let i = 0; i < 8; i++) { if ((b >> i) & 1) p ^= a; a = ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; } return p; } const sbox = new Array(256); for (let x = 0; x < 256; x++) { let inv = 0; if (x !== 0) { inv = 1; while (gmul(inv, x) !== 1) inv++; } const r = (v, n) => ((v << n) | (v >> (8 - n))) & 0xff; sbox[x] = (inv ^ r(inv, 1) ^ r(inv, 2) ^ r(inv, 3) ^ r(inv, 4) ^ 0x63) & 0xff; } return sbox; })(); const INV_SBOX = (function () { const inv = new Array(256); for (let i = 0; i < 256; i++) inv[SBOX[i]] = i; return inv; })(); function expandKey(key) { const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]; const Nk = key.length >> 2, Nr = Nk + 6, tw = 4 * (Nr + 1); const w = []; for (let i = 0; i < Nk; i++) w.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]); for (let i = Nk; i < tw; i++) { let t = w[i - 1].slice(); if (i % Nk === 0) { t = [t[1], t[2], t[3], t[0]].map(b => SBOX[b]); t[0] ^= RCON[i / Nk - 1]; } else if (Nk > 6 && i % Nk === 4) t = t.map(b => SBOX[b]); w.push([w[i - Nk][0] ^ t[0], w[i - Nk][1] ^ t[1], w[i - Nk][2] ^ t[2], w[i - Nk][3] ^ t[3]]); } const rk = []; for (let round = 0; round <= Nr; round++) { const blk = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) blk[4 * c + r] = w[4 * round + c][r]; rk.push(blk); } return { rk: rk, Nr: Nr }; } function decryptBlock(input, rk, Nr) { let s = input.slice(); const addRK = (round) => { for (let i = 0; i < 16; i++) s[i] ^= rk[round][i]; }; const xtime = (a) => ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; const mul = (a, b) => { let p = 0; for (let i = 0; i < 8; i++) { if ((b >> i) & 1) p ^= a; a = xtime(a); } return p; }; const irows = () => { const t = s.slice(); for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) t[4 * c + r] = s[4 * (((c - r) % 4 + 4) % 4) + r]; s = t; }; addRK(Nr); for (let round = Nr - 1; round >= 1; round--) { irows(); for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]]; addRK(round); for (let c = 0; c < 4; c++) { const a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3]; s[4 * c] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9); s[4 * c + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13); s[4 * c + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11); s[4 * c + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14); } } irows(); for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]]; addRK(0); return s; } const raw = hexIn ? HexToBytes(cipher) : Base64ToBytes(cipher); if (!raw.length || raw.length % 16) return ''; const ks = expandKey(function Utf8Encode(str) { const out = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) out.push(c); else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63)); else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const c2 = str.charCodeAt(++i); const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); out.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63)); } else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } return out; }(keyStr)); let prev = null, start = 0; if (!ecb) { if (ivStr) { prev = _u8(ivStr).slice(0, 16); while (prev.length < 16) prev.push(0); start = 0; } else { prev = raw.slice(0, 16); start = 16; } } const out = []; for (let off = start; off < raw.length; off += 16) { const blk = raw.slice(off, off + 16); const dec = decryptBlock(blk, ks.rk, ks.Nr); const plainBlk = ecb ? dec : dec.map((b, i) => b ^ prev[i]); out.push(...plainBlk); if (!ecb) prev = blk; } const padLen = out[out.length - 1]; if (padLen >= 1 && padLen <= 16 && out.length >= padLen) { let ok = true; for (let i = 0; i < padLen; i++) if (out[out.length - 1 - i] !== padLen) ok = false; if (ok) out.length -= padLen; } return BytesToUtf8(out); } function _sha256hex(string) { function Utf8Encode(str) { const out = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) out.push(c); else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63)); else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const c2 = str.charCodeAt(++i); const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); out.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63)); } else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } return out; } function SHA256(msg) { const K = [ 0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2 ]; let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]; const rr = (x, n) => (x >>> n) | (x << (32 - n)); const data = msg.slice(); const bitLenHi = Math.floor(data.length / 536870912), bitLenLo = (data.length * 8) >>> 0; data.push(0x80); while (data.length % 64 !== 56) data.push(0); data.push((bitLenHi >>> 24) & 255, (bitLenHi >>> 16) & 255, (bitLenHi >>> 8) & 255, bitLenHi & 255); data.push((bitLenLo >>> 24) & 255, (bitLenLo >>> 16) & 255, (bitLenLo >>> 8) & 255, bitLenLo & 255); const w = new Array(64); for (let i = 0; i < data.length; i += 64) { for (let j = 0; j < 16; j++) { w[j] = ((data[i + j * 4] << 24) | (data[i + j * 4 + 1] << 16) | (data[i + j * 4 + 2] << 8) | data[i + j * 4 + 3]) >>> 0; } for (let j = 16; j < 64; j++) { const s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3); const s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10); w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0; } let [a, b, c, d, e, f, g, h] = H; for (let j = 0; j < 64; j++) { const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25); const ch = (e & f) ^ (~e & g); const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0; const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22); const mj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + mj) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; } H = H.map((v, idx) => (v + [a, b, c, d, e, f, g, h][idx]) >>> 0); } const out = []; for (const v of H) out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return out; } function Base64ToBytes(b64) { const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const map = {}; for (let i = 0; i < 64; i++) map[CHARS[i]] = i; const bytes = []; let acc = 0, bits = 0; for (const c of b64.replace(/[^A-Za-z0-9+/]/g, '')) { acc = (acc << 6) | map[c]; bits += 6; if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); } } return bytes; } return SHA256(Utf8Encode(string)).map(b => b.toString(16).padStart(2, '0')).join(''); } function _b64(str) { const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const u = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) u.push(c); else if (c < 2048) u.push(192 | (c >> 6), 128 | (c & 63)); else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const c2 = str.charCodeAt(++i); const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); u.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63)); } else u.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } let out = ''; for (let i = 0; i < u.length; i += 3) { const b0 = u[i], b1 = u[i + 1], b2 = u[i + 2]; out += B[b0 >> 2]; out += b1 === undefined ? B[(b0 & 3) << 4] + '==' : b2 === undefined ? B[((b0 & 3) << 4) | (b1 >> 4)] + B[(b1 & 15) << 2] + '=' : B[((b0 & 3) << 4) | (b1 >> 4)] + B[((b1 & 15) << 2) | (b2 >> 6)] + B[b2 & 63]; } return out; } function _b64d(b64) { const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const map = {}; for (let i = 0; i < 64; i++) map[CH[i]] = i; const bytes = []; let acc = 0, bits = 0; for (const c of String(b64).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '')) { acc = (acc << 6) | map[c]; bits += 6; if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); } } let s = ''; for (let i = 0; i < bytes.length;) { const b = bytes[i]; if (b < 128) { s += String.fromCharCode(b); i += 1; } else if (b >= 240 && i + 3 < bytes.length) { const cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63); const v = cp - 0x10000; s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)); i += 4; } else if (b >= 224 && i + 2 < bytes.length) { s += String.fromCharCode(((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)); i += 3; } else if (b >= 192 && i + 1 < bytes.length) { s += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63)); i += 2; } else { s += String.fromCharCode(b); i += 1; } } return s; }function _des(data, keyStr) { const IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7]; const FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25]; const PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4]; const PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32]; const EX = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1]; const PP = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25]; const SB = [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13,15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9,10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12,7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14,2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3,12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13,4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12,13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]; const SH = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]; function permute(bits, table) { const out = []; for (let i = 0; i < table.length; i++) out.push(bits[table[i] - 1]); return out; } function toBits(bytes) { const bits = []; for (let i = 0; i < bytes.length; i++) { for (let j = 7; j >= 0; j--) bits.push((bytes[i] >> j) & 1); } return bits; } function fromBits(bits) { const out = []; for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let b = 0; b < 8; b++) v = (v << 1) | bits[i + b]; out.push(v); } return out; } function utf8(str) { const out = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) out.push(c); else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63)); else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const c2 = str.charCodeAt(++i); const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); out.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63)); } else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } return out; } function toBase64(bytes) { const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < bytes.length; i += 3) { const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]; s += CH[b0 >> 2]; s += b1 === undefined ? CH[(b0 & 3) << 4] + '==' : b2 === undefined ? CH[((b0 & 3) << 4) | (b1 >> 4)] + CH[(b1 & 15) << 2] + '=' : CH[((b0 & 3) << 4) | (b1 >> 4)] + CH[((b1 & 15) << 2) | (b2 >> 6)] + CH[b2 & 63]; } return s; } function subkeys(keyBytes) { const pc = permute(toBits(keyBytes), PC1); const C = pc.slice(0, 28); const D = pc.slice(28, 56); const keys = []; for (let r = 0; r < 16; r++) { for (let s = 0; s < SH[r]; s++) { C.push(C.shift()); D.push(D.shift()); } keys.push(permute(C.concat(D), PC2)); } return keys; } function encryptBlock(bytes8, keys) { const bits = permute(toBits(bytes8), IP); let L = bits.slice(0, 32); let R = bits.slice(32, 64); for (let r = 0; r < 16; r++) { const x = permute(R, EX).map((b, i) => b ^ keys[r][i]); const sres = []; for (let i = 0; i < 8; i++) { const e6 = x.slice(i * 6, i * 6 + 6); const row = (e6[0] << 1) | e6[5]; const col = (e6[1] << 3) | (e6[2] << 2) | (e6[3] << 1) | e6[4]; const v = SB[i * 64 + row * 16 + col]; for (let b = 3; b >= 0; b--) sres.push((v >> b) & 1); } const f = permute(sres, PP); const next = L.map((b, i) => b ^ f[i]); L = R; R = next; } return fromBits(permute(R.concat(L), FP)); } const keys = subkeys(utf8(String(keyStr)).slice(0, 8)); const bytes = utf8(String(data)); const pad = 8 - (bytes.length % 8); for (let i = 0; i < pad; i++) bytes.push(pad); const ct = []; for (let i = 0; i < bytes.length; i += 8) ct.push.apply(ct, encryptBlock(bytes.slice(i, i + 8), keys)); return toBase64(ct); } function _u8(str) { const out = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) out.push(c); else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63)); else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const c2 = str.charCodeAt(++i); const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff); out.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63)); } else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } return out; } function _b64ToBytes(b64) { const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const map = {}; for (let i = 0; i < 64; i++) map[CH[i]] = i; const bytes = []; let acc = 0, bits = 0; for (const c of String(b64).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '')) { acc = (acc << 6) | map[c]; bits += 6; if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); } } return bytes; } function _bytesToB64(bytes) { const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = ''; for (let i = 0; i < bytes.length; i += 3) { const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]; s += CH[b0 >> 2]; s += b1 === undefined ? CH[(b0 & 3) << 4] + '==' : b2 === undefined ? CH[((b0 & 3) << 4) | (b1 >> 4)] + CH[(b1 & 15) << 2] + '=' : CH[((b0 & 3) << 4) | (b1 >> 4)] + CH[((b1 & 15) << 2) | (b2 >> 6)] + CH[b2 & 63]; } return s; } switch (type) { case 'sha256': return _sha256hex(a); case 'md5': return MD5(a); case 'rsa-sha256': return _rsa(a, b); case 'rsa-enc-pkcs1': return _rsaenc(a, b); case 'hmac-sha256': return _hmac(a, b); case 'aes-cbc': return _aes(a, b, c); case 'aes-ecb': return _aes(a, b, null, true); case 'aes-cbc-ivp': return _aes(a, b, c, false, 2); case 'aes-cbc-dec-iv': return _aesdec(a, b, false, false, c); case 'base64-to-hex': return _b64ToBytes(a).map(x => ('0' + x.toString(16)).slice(-2)).join(''); case 'hex-to-base64': { const _hx = String(a).replace(/[^0-9a-fA-F]/g, ''); const _bs = []; for (let i = 0; i + 1 < _hx.length; i += 2) _bs.push(parseInt(_hx.substr(i, 2), 16)); return _bytesToB64(_bs); } case 'aes-cbc-dec': return _aesdec(a, b, false); case 'aes-ecb-dec': return _aesdec(a, b, true); case 'aes-ecb-dec-hex': return _aesdec(a, b, true, true); case 'base64-encode': return _b64(String(a)); case 'base64-decode': return _b64d(a); case 'des-ecb': return _des(a, b); default: return null; } }

// ---- 编码/签名核心（逐行对齐 py：additive_encode / legacy_native_sign） ----

function strBytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            const c2 = str.charCodeAt(++i);
            const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
            out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
}

function utf8Decode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i++];
        if (b < 0x80) out += String.fromCharCode(b);
        else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else if (b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        else {
            const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
            const v = cp - 0x10000;
            out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
        }
    }
    return out;
}

function bytesToHex(bytes, upper) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += ('0' + (bytes[i] & 255).toString(16)).slice(-2);
    return upper ? s.toUpperCase() : s;
}

function hexToBytes(hex) {
    const out = [];
    for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    return out;
}

function additiveEncode(plaintext) {
    const data = strBytes(plaintext);
    const key = strBytes(APP_CODEC_KEY);
    const out = [];
    for (let i = 0; i < data.length; i++) out.push((data[i] + key[i % key.length]) & 255);
    return bytesToHex(out, true);
}

function additiveDecode(ciphertext) {
    if (!/^(?:[0-9A-F]{2})+$/.test(ciphertext)) throw new MiguError('原生编码串格式异常');
    const raw = hexToBytes(ciphertext);
    const key = strBytes(APP_CODEC_KEY);
    const out = [];
    for (let i = 0; i < raw.length; i++) out.push((raw[i] - key[i % key.length]) & 255);
    return utf8Decode(out);
}

const MG_K = [];
for (let i = 0; i < 64; i++) MG_K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
// py: (7,12,17,22)*4 + (5,9,14,20)*4 + (4,11,16,23)*4 + (6,10,15,21)*4（按 16 步分组重复）
const MG_S = [];
[[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]].forEach(function (group) {
    for (let r = 0; r < 4; r++) for (let k = 0; k < group.length; k++) MG_S.push(group[k]);
});

function mgCompress(state, block) {
    const w = [];
    for (let i = 0; i < 16; i++) w.push((block[i * 4] | (block[i * 4 + 1] << 8) | (block[i * 4 + 2] << 16) | (block[i * 4 + 3] << 24)) >>> 0);
    let a = state[0], b = state[1], c = state[2], d = state[3];
    for (let i = 0; i < 64; i++) {
        let f, g;
        if (i < 16) { f = (b & c) | ((~b) & d); g = i; }
        else if (i < 32) { f = (d & b) | ((~d) & c); g = (5 * i + 1) % 16; }
        else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
        else { f = c ^ (b | (~d)); g = (7 * i) % 16; }
        const total = (a + f + MG_K[i] + w[g]) >>> 0;
        const shift = MG_S[i];
        const rotated = ((total << shift) | (total >>> (32 - shift))) >>> 0;
        const na = d, nb = (b + rotated) >>> 0, nc = b, nd = c;
        a = na; b = nb; c = nc; d = nd;
    }
    return [(state[0] + a) >>> 0, (state[1] + b) >>> 0, (state[2] + c) >>> 0, (state[3] + d) >>> 0];
}

// py legacy_native_sign：初始 B/D 互换、不写消息长度，尾部仅补 0x80 与零
function mgSignBytes(data) {
    const combined = data.concat(strBytes(APK_CERT_PREFIX));
    let rolling = 0x7a;
    const transformed = [];
    for (let i = 0; i < combined.length; i++) {
        rolling = (rolling + combined[i] * 2 + 1) & 255;
        transformed.push(rolling);
    }
    let state = [0x67452301, 0x10325476, 0x98badcfe, 0xefcdab89];
    const full = transformed.length - (transformed.length % 64);
    for (let off = 0; off < full; off += 64) state = mgCompress(state, transformed.slice(off, off + 64));
    const tail = transformed.slice(full);
    if (tail.length) {
        const block = tail.concat([0x80]);
        while (block.length < 64) block.push(0);
        state = mgCompress(state, block);
    }
    // struct.pack('<4I')：四个 uint32 小端拼接
    let hex = '';
    for (let i = 0; i < state.length; i++) {
        for (let k = 0; k < 4; k++) hex += ('0' + ((state[i] >>> (k * 8)) & 255).toString(16)).slice(-2);
    }
    return hex.toUpperCase();
}

function v005Sign(target, ce, timestamp, body) {
    if (!target || target.charAt(0) !== '/' || /[\r\n#]/.test(target) || target.indexOf('://') >= 0) throw new MiguError('签名目标异常');
    if (!/^[0-9a-fA-F]+$/.test(ce) || ce.length % 2) throw new MiguError('ce 格式异常');
    if (!/^\d{13}$/.test(timestamp)) throw new MiguError('时间戳格式异常');
    const canonical = strBytes(target + ce + timestamp).concat(strBytes(body || ''));
    return mgSignBytes(canonical);
}

// ---- HTTP / 工具 ----

function hget(headers, name) {
    if (!headers) return undefined;
    const low = String(name).toLowerCase();
    const keys = Object.keys(headers);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === low) return headers[keys[i]];
    }
    return undefined;
}

function statusOf(res) {
    if (!res) return 0;
    const v = res.statusCode !== undefined ? res.statusCode : res.status;
    return parseInt(v, 10) || 0;
}

function bodyOf(res) {
    if (!res) return '';
    if (typeof res === 'string') return res;
    if (typeof res.body === 'string') return res.body;
    if (res.body === undefined || res.body === null) return '';
    return String(res.body);
}

function httpCall(method, url, headers, body, timeout) {
    return new Promise(function (resolve, reject) {
        const opt = { url: url, headers: Object.assign({}, headers || {}), timeout: timeout || 30000, followRedirect: false };
        if (method === 'POST') opt.body = body === undefined ? '' : body;
        const fn = method === 'POST' ? $.http.post.bind($.http) : $.http.get.bind($.http);
        fn(opt).then(resolve).catch(function (e) {
            const msg = e && e.message ? e.message : (typeof e === 'string' ? e : 'unknown');
            reject(new MiguError('网络请求失败：' + msg));
        });
    });
}

function parseJson(text, what) {
    const obj = $.toObj(String(text || ''), null);
    if (!obj || typeof obj !== 'object') throw new MiguError((what || '接口') + '返回不是 JSON');
    return obj;
}

function encodeQuery(pairs) {
    return pairs.map(function (p) {
        return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1] === undefined || p[1] === null ? '' : p[1]);
    }).join('&');
}

function formEncode(obj) {
    return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
}

function parseCommentList(raw) {
    const list = [];
    String(raw || '').split(/[|\n\r]+/).forEach(function (t) {
        t = t.trim();
        if (t && list.indexOf(t) < 0) list.push(t);
    });
    return list.length ? list : DEFAULT_COMMENT.slice();
}

// 榜单返回里挑可评论的歌：只要带 songId 的条目，优先非 VIP 标记
function parseRankSongs(contents) {
    if (!Array.isArray(contents)) return [];
    const free = [];
    const all = [];
    contents.forEach(function (x) {
        if (!x || typeof x.songId !== 'string' || !/^\d{1,24}$/.test(x.songId)) return;
        if (all.some(function (o) { return o.songId === x.songId; })) return;
        const item = { songId: x.songId, name: typeof x.txt === 'string' ? x.txt : '' };
        all.push(item);
        if (!x.vip) free.push(item);
    });
    return free.length ? free : all;
}

async function fetchRankSongs(rankId) {
    const url = API_ORIGIN + RANK_INFO + '?' + encodeQuery([['rankId', rankId || COMMENT_RANK_ID]]);
    const res = await httpCall('GET', url, {
        'Accept': 'application/json', 'Origin': WEB_ORIGIN, 'Referer': WEB_ORIGIN + '/', 'User-Agent': UA_WEB
    }, undefined, 15000);
    if (statusOf(res) !== 200) throw new MiguError('榜单未返回 200');
    const obj = parseJson(bodyOf(res), '榜单');
    if (String(obj.code) !== '000000' || !obj.data || !Array.isArray(obj.data.contents)) throw new MiguError('榜单结构变化');
    const songs = parseRankSongs(obj.data.contents);
    if (!songs.length) throw new MiguError('榜单没有可评论歌曲');
    return songs;
}

// 按北京时间逐日轮换：同一天固定一首，第二天换列表里的下一首，循环使用
function pickByDay(list, day) {
    if (list.length === 1) return list[0];
    const d = new Date(day + 'T00:00:00Z');
    const doy = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
    return list[doy % list.length];
}

function maskPhone(phone) {
    const s = String(phone || '');
    return s.length >= 8 ? s.slice(0, 3) + '****' + s.slice(-4) : s;
}

function secText(ms) {
    return Math.round((ms || 0) / 1000) + ' 秒';
}

function claimText(list) {
    if (!list || !list.length) return '';
    let total = 0;
    list.forEach(function (x) { if (x && typeof x.num === 'number') total += x.num; });
    return ' 已领 ' + list.length + ' 档' + (total > 0 ? ' +' + total + ' AI豆' : '');
}

function todayBeijing() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function sleep(ms) {
    return $.wait(ms);
}

function uuid4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function randomHex(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += (Math.random() * 16 | 0).toString(16);
    return s;
}

function walkObjects(value, out) {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) walkObjects(value[i], out);
    } else if (value && typeof value === 'object') {
        out.push(value);
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) walkObjects(value[keys[i]], out);
    }
    return out;
}

function debugLog(content, title) {
    if (!$.is_debug) return;
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    $.log('\n----- ' + (title || 'debug') + ' -----\n' + text + '\n----- ' + $.time('HH:mm:ss') + ' -----');
}

// ---- 账号与缓存 ----

function loadAccounts() {
    const raw = String(getEnv('MIGU_AUTH', 'migu_data') || '').trim();
    if (!raw) return [];
    let list = [];
    if (raw.charAt(0) === '[') {
        const arr = $.toObj(raw, null);
        if (!Array.isArray(arr)) throw new MiguError('MIGU_AUTH 不是有效 JSON 数组');
        list = arr.map(function (x) { return { phone: String(x.phone || '').trim(), password: String(x.password || '') }; });
    } else {
        raw.split(/[\n\r&]+/).forEach(function (item) {
            item = item.trim();
            if (!item) return;
            const at = item.indexOf('@');
            if (at < 1) throw new MiguError('账号需写成 手机号@密码');
            list.push({ phone: item.slice(0, at).trim(), password: item.slice(at + 1) });
        });
    }
    const seen = {};
    const out = [];
    list.forEach(function (a) {
        if (!/^1\d{10}$/.test(a.phone)) throw new MiguError('手机号格式不正确：' + maskPhone(a.phone));
        if (!a.password || a.password.length > 128) throw new MiguError('账号 ' + maskPhone(a.phone) + ' 密码为空或过长');
        if (/\x00-\x1f\x7f/.test(a.password)) throw new MiguError('账号 ' + maskPhone(a.phone) + ' 密码含控制字符');
        if (seen[a.phone]) { $.log('账号 ' + maskPhone(a.phone) + ' 重复，已跳过'); return; }
        seen[a.phone] = true;
        out.push(a);
    });
    return out;
}

function accountKey(phone) {
    return Crypt('sha256', phone).slice(0, 20);
}

function loadNativeCache(key) {
    const raw = $.getdata('migu_native_' + key);
    if (!raw) return null;
    const obj = $.toObj(String(raw), null);
    if (!obj || !obj.config) return null;
    try {
        return validateContext(obj.config);
    } catch (e) {
        $.log('原生配置缓存校验失败：' + e.message + '，将重新登录');
        return null;
    }
}

function saveNativeCache(key, ctx) {
    const cacheKey = 'migu_native_' + key;
    const text = JSON.stringify({ updateTime: Date.now(), config: { headers: ctx.headers, listen_params: ctx.listen_params } });
    $.setdata(text, cacheKey);
    pushDaidai({ boxjs: [[cacheKey, text]] });
}

function clearNativeCache(key) {
    $.setdata('', 'migu_native_' + key);
}

function validateContext(obj) {
    if (!obj || typeof obj !== 'object' || !obj.headers || typeof obj.headers !== 'object') throw new MiguError('原生配置结构不正确');
    const headers = {};
    Object.keys(obj.headers).forEach(function (k) {
        const low = String(k).toLowerCase();
        if (headers[low] !== undefined) throw new MiguError('原生配置存在大小写重复头部');
        headers[low] = obj.headers[k];
    });
    Object.keys(headers).forEach(function (k) {
        if (HEADER_ALLOW.indexOf(k) < 0) throw new MiguError('原生配置包含不应保存的头部');
        const v = headers[k];
        if (typeof v !== 'string' || /[\x00-\x1f\x7f]/.test(k + v)) throw new MiguError('原生配置头部含非法字符');
    });
    if (headers.ua !== 'Android_migu' || headers.version !== '8.9.5') throw new MiguError('仅支持安卓 8.9.5 原生配置');
    if (!headers.ce) throw new MiguError('原生配置缺少 ce');
    const account = parseQuery(additiveDecode(headers.ce));
    if (!account.uid || !account.deviceId) throw new MiguError('ce 账号字段缺失');
    const params = obj.listen_params;
    if (!Array.isArray(params) || !params.length || params.length > 30) throw new MiguError('听歌参数结构不正确');
    const allowed = ['albumId', 'contentId', 'lowerQualityContentId', 'netType', 'resourceType', 'songId', 'toneFlag'];
    const map = {};
    params.forEach(function (p) {
        if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string' || typeof p[1] !== 'string') throw new MiguError('听歌参数结构不正确');
        if (allowed.indexOf(p[0]) < 0 || p[1].length > 500 || /[\x00-\x1f]/.test(p[1])) throw new MiguError('听歌参数结构不正确');
        map[p[0]] = p[1];
    });
    if (map.toneFlag !== 'PQ' || !map.songId || !map.contentId || !map.resourceType) throw new MiguError('听歌参数校验失败');
    return {
        headers: headers,
        listen_params: params.map(function (p) { return [p[0], p[1]]; }),
        uid: String(account.uid),
        deviceId: String(account.deviceId),
        ce: headers.ce,
        phone: account.msisdn || ''
    };
}

function parseQuery(str) {
    const out = {};
    String(str || '').split('&').forEach(function (kv) {
        if (!kv) return;
        const i = kv.indexOf('=');
        const k = i < 0 ? kv : kv.slice(0, i);
        const v = i < 0 ? '' : kv.slice(i + 1);
        try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { out[k] = v; }
    });
    return out;
}

// ---- 登录链路（passport → pacmtoken → 用户资料 → ce） ----

function cookieJarAdd(jar, headers) {
    let raw = hget(headers, 'set-cookie');
    if (!raw) return;
    const list = Array.isArray(raw) ? raw : [String(raw)];
    list.forEach(function (chunk) {
        String(chunk).split(/,(?=\s*[A-Za-z0-9_.\-]+=)/).forEach(function (one) {
            const first = String(one).split(';')[0].trim();
            const i = first.indexOf('=');
            if (i <= 0) return;
            const name = first.slice(0, i).trim();
            const value = first.slice(i + 1).trim();
            if (!name || /^(path|domain|expires|max-age|secure|httponly|samesite)$/i.test(name)) return;
            jar[name] = value;
        });
    });
}

function cookieHeader(jar) {
    const keys = Object.keys(jar);
    if (!keys.length) return '';
    return keys.map(function (k) { return k + '=' + jar[k]; }).join('; ');
}

function withCookies(headers, jar) {
    const c = cookieHeader(jar);
    if (c) headers.Cookie = c;
    return headers;
}

function parseAttrs(tag) {
    const attrs = {};
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4];
    return attrs;
}

function parsePasswordForm(html) {
    const forms = html.match(/<form\b[^>]*class\s*=\s*"[^"]*\bJ_ValidPsdForm\b[^"]*"[^>]*>[\s\S]*?<\/form>/i);
    if (!forms) throw new MiguError('官方密码登录页结构变化，停止');
    const formTag = forms[0].slice(0, forms[0].indexOf('>') + 1);
    const formAttrs = parseAttrs(formTag);
    const action = formAttrs.action || '';
    const keyUrl = formAttrs['cmcc-rsaajax'] || formAttrs['cmcc-rsaAjax'] || '';
    if (!/\/authn$/.test(action) || !/\/password\/publickey$/.test(keyUrl)) throw new MiguError('官方表单目标变化，停止');
    const hidden = {};
    let callback = null;
    const inputs = forms[0].match(/<input\b[^>]*>/gi) || [];
    inputs.forEach(function (tag) {
        const a = parseAttrs(tag);
        if (a.id === 'callbackURL') callback = a.value;
        if ((a['class'] || '').split(/\s+/).indexOf('j_imgdisplay') >= 0 && a.value && a.value !== '0') throw new MiguError('官方页面要求图形验证，请本人在官网完成');
        if ((a.type || '').toLowerCase() !== 'hidden' || !a.name) return;
        if (hidden[a.name] !== undefined) throw new MiguError('官方登录表单含重复隐藏参数，停止');
        hidden[a.name] = a.value === undefined ? '' : a.value;
    });
    if (callback === null) {
        // callbackURL 在表单外，py 的 HTMLParser 是整页扫描
        const m = html.match(/<input\b[^>]*\bid\s*=\s*"callbackURL"[^>]*>/i);
        if (m) callback = parseAttrs(m[0]).value;
    }
    if (callback !== 'PostToken') throw new MiguError('官方登录回跳参数变化，停止');
    const allowedHidden = ['sourceID', 'appType', 'relayState', 'loginID', 'enpassword', 'fingerPrint', 'fingerPrintDetail'];
    Object.keys(hidden).forEach(function (k) {
        if (allowedHidden.indexOf(k) < 0) throw new MiguError('官方密码表单参数变化，停止');
    });
    if (hidden.sourceID !== '220029' || hidden.appType !== '0' || (hidden.relayState || '') !== '') throw new MiguError('官方密码表单参数变化，停止');
    return { action: PASSPORT + '/authn', keyUrl: PASSPORT + '/password/publickey', hidden: hidden };
}

function derLen(n) {
    if (n < 0x80) return [n];
    const bytes = [];
    let x = n;
    while (x > 0) { bytes.unshift(x & 255); x = Math.floor(x / 256); }
    return [0x80 | bytes.length].concat(bytes);
}

function derTlv(tag, content) {
    return [tag].concat(derLen(content.length), content);
}

function derInt(hex) {
    let b = hexToBytes(hex);
    while (b.length > 1 && b[0] === 0) b = b.slice(1);
    if (!b.length) b = [0];
    if (b[0] & 0x80) b = [0].concat(b);
    return derTlv(0x02, b);
}

function rsaPublicPem(modulusHex, exponentHex) {
    const rsaPub = derTlv(0x30, derInt(modulusHex).concat(derInt(exponentHex)));
    const algId = derTlv(0x30, [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
    const bitStr = derTlv(0x03, [0x00].concat(rsaPub));
    return Crypt('hex-to-base64', bytesToHex(derTlv(0x30, algId.concat(bitStr))));
}

function rsaEncryptField(value, key) {
    const modulus = String(key.modulus || '');
    const exponent = String(key.publicExponent || '');
    if (!/^[0-9a-fA-F]{256,1024}$/.test(modulus) || !/^[0-9a-fA-F]{1,8}$/.test(exponent)) throw new MiguError('官方 RSA 公钥格式无法验证');
    const pem = rsaPublicPem(modulus, exponent);
    const cipher = Crypt('rsa-enc-pkcs1', pem, value);
    if (!cipher) throw new MiguError('RSA 加密失败');
    return Crypt('base64-to-hex', cipher);
}

async function resolveIp() {
    const manual = String(getEnv('migu_ip') || '').trim();
    if (manual) return manual;
    if ($.isNode()) {
        try {
            const os = require('os');
            const nets = os.networkInterfaces();
            const names = Object.keys(nets);
            for (let i = 0; i < names.length; i++) {
                const list = nets[names[i]] || [];
                for (let j = 0; j < list.length; j++) {
                    const a = list[j];
                    if (a && a.family !== 'IPv6' && !a.internal && /^\d+\.\d+\.\d+\.\d+$/.test(String(a.address))) return a.address;
                }
            }
        } catch (e) { }
    }
    const probes = ['https://api.ipify.org', 'https://ip.3322.net'];
    for (let i = 0; i < probes.length; i++) {
        try {
            const res = await httpCall('GET', probes[i], { 'User-Agent': UA_WEB }, undefined, 8000);
            const m = String(bodyOf(res)).match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
            if (m) return m[0];
        } catch (e) { }
    }
    $.log('未能取得出口 IP，ce 使用 127.0.0.1');
    return '127.0.0.1';
}

async function webLogin(account) {
    const jar = {};
    const baseHeaders = { 'User-Agent': UA_WEB, 'Accept': 'application/json, text/plain, */*' };
    const loginUrl = PASSPORT + '/login?' + encodeQuery(LOGIN_PARAMS);

    let res = await httpCall('GET', loginUrl, withCookies(Object.assign({}, baseHeaders), jar));
    cookieJarAdd(jar, res.headers);
    if (statusOf(res) !== 200) throw new MiguError('官方登录页未返回 200');
    const form = parsePasswordForm(bodyOf(res));

    res = await httpCall('POST', form.keyUrl, withCookies(Object.assign({}, baseHeaders, {
        'Origin': PASSPORT, 'Referer': loginUrl, 'X-Requested-With': 'XMLHttpRequest'
    }), jar), '');
    cookieJarAdd(jar, res.headers);
    if (statusOf(res) !== 200) throw new MiguError('官方 RSA 公钥接口未返回 200');
    const keyReply = parseJson(bodyOf(res), 'RSA 公钥');
    if (String(keyReply.status) !== '2000' || !keyReply.result || typeof keyReply.result !== 'object') throw new MiguError('无法取得官方 RSA 公钥');

    const fields = Object.assign({}, form.hidden);
    fields.loginID = rsaEncryptField(account.phone, keyReply.result);
    fields.enpassword = rsaEncryptField(account.password, keyReply.result);
    fields.captcha = '';
    fields.fingerPrint = '';
    fields.fingerPrintDetail = '';

    res = await httpCall('POST', form.action, withCookies(Object.assign({}, baseHeaders, {
        'Origin': PASSPORT, 'Referer': loginUrl, 'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded'
    }), jar), formEncode(fields));
    cookieJarAdd(jar, res.headers);
    if (statusOf(res) !== 200) throw new MiguError('官方登录接口未返回 200');
    const result = parseJson(bodyOf(res), '登录');
    const status = /^\d{1,8}$/.test(String(result.status)) ? String(result.status) : 'unknown';
    if (status !== '2000') {
        if (LOGIN_CHALLENGES[status]) throw new MiguError('官方要求' + LOGIN_CHALLENGES[status] + '（状态' + status + '），已停止');
        throw new MiguError('官方密码登录未成功（状态' + status + '），详细信息已隐藏');
    }
    const shortToken = result.result && result.result.token;
    if (typeof shortToken !== 'string' || !shortToken) throw new MiguError('登录成功响应缺少 token');
    return exchangeToken(shortToken, jar, account.phone);
}

async function exchangeToken(shortToken, jar, accountPhone) {
    const deviceId = randomHex(32);
    const baseHeaders = { 'User-Agent': UA_WEB, 'Accept': 'application/json, text/plain, */*', 'Origin': WEB_ORIGIN, 'Referer': WEB_ORIGIN + '/', 'deviceId': deviceId };
    const url = WEB_API + '/user/h5/token-validate/v3.0?' + encodeQuery([
        ['token', shortToken], ['type', '2'], ['sourceId', '220029'], ['activityId', 'MUSIC-WWW']
    ]);
    let res = await httpCall('GET', url, withCookies(Object.assign({}, baseHeaders), jar));
    cookieJarAdd(jar, res.headers);
    if (statusOf(res) !== 200) throw new MiguError('登录后换票未返回 200');
    const obj = parseJson(bodyOf(res), '换票');
    const token = hget(res.headers, 'pacmtoken');
    if (String(obj.code) !== '000000' || !token || !obj.data || typeof obj.data !== 'object') throw new MiguError('登录后换票未获成功');

    res = await httpCall('GET', WEB_API + '/user/h5/user-info/v1.0', withCookies(Object.assign({}, baseHeaders, { 'pacmtoken': token }), jar));
    cookieJarAdd(jar, res.headers);
    if (statusOf(res) !== 200) throw new MiguError('用户资料接口未返回 200');
    const user = parseJson(bodyOf(res), '用户资料');
    const profile = user.data;
    if (String(user.code) !== '000000' || !profile || typeof profile.userId !== 'string' || !profile.userId) throw new MiguError('无法独立确认登录资料');
    const supplied = obj.data.userId;
    if (supplied !== undefined && supplied !== null && String(supplied) !== profile.userId) throw new MiguError('换票与用户资料身份不一致');
    const phone = String(profile.msisdn || '');
    const masked = phone.indexOf('*') >= 0;
    const expectedMasked = accountPhone.slice(0, 3) + '****' + accountPhone.slice(-4);
    if (phone !== accountPhone && phone !== expectedMasked) throw new MiguError('登录资料手机号与本人输入不一致，停止');
    return { uid: profile.userId, deviceId: deviceId, phone: phone };
}

async function loginAndBuild(account) {
    const web = await webLogin(account);
    const ip = await resolveIp();
    const identity = encodeQuery([['uid', web.uid], ['msisdn', account.phone], ['ip', ip], ['deviceId', web.deviceId]]);
    const ce = additiveEncode(identity);
    const headers = {
        ce: ce,
        ua: 'Android_migu',
        version: '8.9.5',
        appid: 'music',
        platform: 'Android',
        'accept-language': 'zh-CN',
        'user-agent': 'MGMobileMusic/8.9.5',
        channel: '0146951',
        subchannel: '',
        os: 'Android',
        mode: 'android',
        pkgname: 'cmccwm.mobilemusic',
        verify: 'verify',
        recommendstatus: '1',
        randomsessionkey: '000000'
    };
    const ctx = validateContext({ headers: headers, listen_params: LISTEN_PARAMS });
    if (ctx.phone && ctx.phone !== account.phone && ctx.phone.indexOf('*') < 0) throw new MiguError('ce 手机号与账号不一致');
    return ctx;
}

// ---- 日常状态记录（只做本地防重：评论/彩铃/结算） ----

class Journal {
    constructor(key) {
        this.storeKey = 'migu_journal_' + key;
        const obj = $.toObj(String($.getdata(this.storeKey) || ''), null);
        const day = todayBeijing();
        if (!obj || obj.day !== day || typeof obj.tasks !== 'object') {
            this.data = { day: day, tasks: {}, settle: {} };
        } else {
            this.data = { day: day, tasks: obj.tasks || {}, settle: obj.settle || {}, picks: obj.picks || {} };
        }
    }
    save() { $.setdata(JSON.stringify(this.data), this.storeKey); }
    get(name) { return this.data.tasks[name] || null; }
    set(name, value) { this.data.tasks[name] = value; this.save(); }
    settled(name) { return this.data.settle[name] === this.data.day; }
    // 评论正文每次随机取一句（真实发布前仍有本地/服务端防重保护）
    pick(name, candidates) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    markSettled(name) { this.data.settle[name] = this.data.day; this.save(); }
}

function songTime(data) {
    const v = data && data.songTime;
    if (typeof v !== 'number' || v < 0) throw new MiguError('服务端 songTime 格式不正确');
    return Math.floor(v);
}

function listenGoalReached(data) {
    if (!data || !Array.isArray(data.tasks) || !data.tasks.length) return false;
    return data.allCompleted === true && data.tasks.every(function (t) {
        return t && typeof t.status === 'number' && (t.status === 1 || t.status === 2);
    });
}

function listenTarget(data) {
    if (!data || !Array.isArray(data.tasks) || !data.tasks.length) throw new MiguError('服务端听歌档位缺失');
    let target = 0;
    data.tasks.forEach(function (t) {
        const v = t && t.needTime;
        if (typeof v !== 'number' || !(v > 0) || v > 1800000) throw new MiguError('服务端听歌门槛结构变化');
        if (v > target) target = v;
    });
    return target;
}

// ---- 客户端 ----

class MiguClient {
    constructor(ctx, journal) {
        this.ctx = ctx;
        this.journal = journal || null;
        this.lastSongState = null;
        this.verifiedDailyPayload = null;
    }

    songId() {
        for (let i = 0; i < this.ctx.listen_params.length; i++) {
            if (this.ctx.listen_params[i][0] === 'songId') return this.ctx.listen_params[i][1];
        }
        throw new MiguError('听歌参数缺少 songId');
    }

    async send(method, origin, path, opts) {
        opts = opts || {};
        const spec = PATHS[method + ' ' + path];
        if (!spec) throw new MiguError('拒绝未核对的接口：' + path);
        if (spec.origin !== origin) throw new MiguError('接口域名不匹配：' + path);
        const native = !!opts.native;
        if (!native && spec.native) throw new MiguError('该接口必须使用原生签名');
        if (native && !spec.native) throw new MiguError('该接口不接受原生签名');
        if (path === '/act-task/task-report') {
            const reportTaskId = opts.payload && opts.payload.taskId;
            if (reportTaskId !== 'qsq' && reportTaskId !== 'sign') throw new MiguError('任务上报只允许 qsq/sign');
        }
        if (path === NEW_SIGN || path === NORMAL_SIGN) {
            if (opts.payload !== undefined || opts.params !== undefined) throw new MiguError('签到不接受自定义参数');
        }
        if ((path === RBT_STATUS || path === RBT_IDS) && (opts.params !== undefined || opts.payload !== undefined)) throw new MiguError('彩铃查询不接受操作参数');
        if (path === RBT_SETTINGS) {
            if (opts.payload !== undefined || JSON.stringify(opts.params) !== JSON.stringify([['status', '1'], ['mediaType', '2']])) throw new MiguError('仅允许查询当前视频彩铃设置');
        }
        if (path === RBT_LIBRARY) {
            const p = JSON.stringify(opts.params);
            if (opts.payload !== undefined || (p !== JSON.stringify([['queryType', '1'], ['friendMsisdn', ''], ['friendUid', '']]) &&
                p !== JSON.stringify([['queryType', '2'], ['friendMsisdn', ''], ['friendUid', '']]))) throw new MiguError('仅允许查询本人彩铃库');
        }
        if (path === RBT_IDLE) {
            const p = JSON.stringify(opts.params);
            if (opts.payload !== undefined || (p !== JSON.stringify([['status', '0'], ['mediaType', '1']]) &&
                p !== JSON.stringify([['status', '0'], ['mediaType', '2']]))) throw new MiguError('仅允许查询本人闲置铃音');
        }
        if (path === RBT_SET_TO_PLAY && (opts.params !== undefined || opts.payload === undefined || JSON.stringify(opts.payload) !== this.verifiedDailyPayload)) throw new MiguError('每日推荐设置未通过本次鉴权核验');
        if ((path === RBT_DAILY_PAGE || path === RBT_DAILY_GROUP || path === RBT_DAILY_SOURCE || path === RBT_NEXT_OP || path === RBT_PRICE) && opts.payload !== undefined) throw new MiguError('每日推荐只读查询不接受请求体');

        const params = opts.params || [];
        const qs = encodeQuery(params);
        const target = path + (qs ? '?' + qs : '');
        let bodyStr = null;
        if (opts.payload !== undefined) bodyStr = JSON.stringify(opts.payload);
        else if (method === 'POST') bodyStr = '';
        const headers = Object.assign({}, this.ctx.headers);
        if (!native) {
            headers.uid = this.ctx.uid;
            headers.deviceId = this.ctx.deviceId;
            headers.activityId = opts.activityId || 'MAC_KF_CBH_JBZX';
            headers.platform = 'H5';
            headers.IMEI = 'h5page';
            headers.IMSI = 'h5page';
            headers.Origin = 'https://h5.nf.migu.cn';
            headers.Referer = opts.referer || 'https://h5.nf.migu.cn/app/v4/n/gold-coin-center/index.html?rightScreen=T&hideMiniPlayer=1';
        }
        if (bodyStr !== null) headers['Content-Type'] = opts.contentType || 'application/json';
        if (native) {
            const ts = String(Date.now());
            headers.timestamp = ts;
            headers.signVersion = 'V005';
            headers.sign = v005Sign(target, this.ctx.ce, ts, bodyStr || '');
        }
        debugLog({ method: method, url: origin + target, bodyLength: bodyStr ? bodyStr.length : 0 }, 'request');
        const res = await httpCall(method, origin + target, headers, bodyStr);
        return this.consume(res, path, !!opts.decodeHex, !!opts.raw);
    }

    async sendRaw(method, origin, path, bodyStr, contentType, extraHeaders) {
        const spec = PATHS[method + ' ' + path];
        if (!spec || spec.origin !== origin || !spec.native) throw new MiguError('拒绝未核对的原生接口：' + path);
        const headers = Object.assign({}, this.ctx.headers, extraHeaders || {});
        if (contentType) headers['Content-Type'] = contentType;
        const ts = String(Date.now());
        headers.timestamp = ts;
        headers.signVersion = 'V005';
        headers.sign = v005Sign(path, this.ctx.ce, ts, bodyStr || '');
        const res = await httpCall(method, origin + path, headers, bodyStr);
        return this.consume(res, path, false);
    }

    consume(res, path, decodeHex, raw) {
        const status = statusOf(res);
        if (status !== 200) throw new MiguError(path + ' 未返回 200（HTTP ' + status + '）');
        let text = bodyOf(res);
        let obj;
        try {
            if (decodeHex && /^[0-9A-F]+$/.test(text) && text.length % 2 === 0) obj = parseJson(additiveDecode(text), path);
            else obj = parseJson(text, path);
        } catch (e) {
            if (e instanceof MiguError) throw e;
            throw new MiguError(path + ' 返回无法解析');
        }
        if (raw) return obj;
        const marker = hget(res.headers, 'sign-result') !== undefined ? hget(res.headers, 'sign-result') : hget(res.headers, 'sign_result');
        if (String(obj.code) !== '000000' || (marker !== undefined && marker !== null && marker !== '' && marker !== '000000')) {
            const code = /^[A-Za-z0-9]{1,12}$/.test(String(obj.code)) ? String(obj.code) : 'hidden';
            throw new MiguError(path + ' 未获业务成功（code=' + code + '）');
        }
        return obj.data;
    }

    // ---- 福利任务 ----
    async tasks() {
        const data = await this.send('GET', API_ORIGIN, '/act-task/query-tasks');
        if (!Array.isArray(data) || !data.length || data.some(function (t) { return !t || typeof t !== 'object'; })) throw new MiguError('福利任务列表结构变化');
        return data;
    }

    async task(id) {
        const matches = (await this.tasks()).filter(function (t) { return t.id === id; });
        if (matches.length !== 1) throw new MiguError('任务未开放或 ID 变化：' + id);
        const t = matches[0];
        ['needCompleteTime', 'completeTime'].forEach(function (k) {
            if (typeof t[k] !== 'number' || t[k] < 0) throw new MiguError('任务计数格式变化');
        });
        if (t.needCompleteTime !== 1) throw new MiguError('任务要求不再是 1 次，停止以免重复操作');
        return t;
    }

    async complete(id) {
        const t = await this.task(id);
        return t.completeTime >= t.needCompleteTime;
    }

    async balance() {
        const data = await this.send('GET', API_ORIGIN, BALANCE);
        if (!data || typeof data.availableNum !== 'number' || data.availableNum < 0) throw new MiguError('AI豆余额结构变化');
        return data.availableNum;
    }

    async settle(key) {
        const name = 'settle_' + key;
        if (this.journal && this.journal.settled(name)) return null;
        // 先落本地记录再发请求：结果不确定时宁可当天不再结算，也不重复追加
        if (this.journal) this.journal.markSettled(name);
        const data = await this.send('GET', API_ORIGIN, '/act-jbzx/music-bean-accumulate');
        if (!data || typeof data.num !== 'number' || data.num < 0) throw new MiguError('结算结果无法核验');
        $.log('AI豆结算：+' + data.num);
        return data.num;
    }

    // ---- 签到 ----
    async signPlan() {
        const data = await this.send('GET', API_ORIGIN, NEW_SIGN_STATUS);
        if (!data || typeof data.signTask !== 'boolean') throw new MiguError('签到分流结构变化');
        if (data.signTask) {
            const st = await this.send('GET', API_ORIGIN, NORMAL_SIGN_STATUS);
            if (!st || typeof st.isSign !== 'boolean') throw new MiguError('普通签到状态无法核验');
            if (!Array.isArray(st.days) || !st.days.length) throw new MiguError('普通签到未提供有效日历');
            return { mode: 'normal', signed: st.isSign, day: null, path: NORMAL_SIGN };
        }
        const day = data.currentDay;
        if (typeof day !== 'number' || day < 1 || day > 7 || !Array.isArray(data.days)) throw new MiguError('新人签到日历变化');
        const today = data.days.filter(function (d) { return d && typeof d.day === 'number' && d.day === day; });
        if (today.length !== 1 || typeof data.isSign !== 'boolean' || typeof today[0].sign !== 'boolean') throw new MiguError('新人签到当天状态异常');
        const receive = today[0].receiveStatus;
        if (typeof receive !== 'number' || (receive !== 0 && receive !== 1)) throw new MiguError('新人签到今天不可领取');
        return { mode: 'new_user', signed: data.isSign || today[0].sign || receive === 1, day: day, path: NEW_SIGN };
    }

    async sign() {
        const plan = await this.signPlan();
        const mode = plan.mode === 'normal' ? '普通签到' : '新人第' + plan.day + '天';
        if (plan.signed) {
            $.log(mode + '：服务端显示今天已签到，跳过');
            return mode + ' 今日已签';
        }
        await this.send('POST', API_ORIGIN, plan.path);
        const delays = [1, 2, 4];
        for (let i = 0; i < delays.length; i++) {
            await sleep(delays[i] * 1000);
            const after = await this.signPlan();
            if (after.mode === plan.mode && after.day === plan.day && after.signed) {
                $.log(mode + '：已提交并独立核验');
                return mode + ' 已提交并核验';
            }
        }
        throw new MiguError('签到返回成功但当天状态未确认（不重复提交、不切换接口）');
    }

    // ---- 社区 ----
    async community() {
        if (await this.complete('qsq')) {
            $.log('社区：服务端已完成 1/1，跳过');
            return '已完成 1/1';
        }
        await this.send('POST', API_ORIGIN, '/act-task/task-report', { payload: { taskId: 'qsq' } });
        const delays = [1, 2, 4];
        for (let i = 0; i < delays.length; i++) {
            await sleep(delays[i] * 1000);
            if (await this.complete('qsq')) {
                await this.settle('community');
                return '已完成 1/1';
            }
        }
        throw new MiguError('社区上报后服务端未确认完成（不重复上报）');
    }

    // ---- 动感地带1314粉丝节 ----
    async dgddState() {
        return await this.send('GET', API_ORIGIN, DGDD_STATE, { activityId: DGDD_MAIN, referer: DGDD_REFERER, raw: true });
    }
    async dgddVisit() {
        return await this.send('POST', API_ORIGIN, DGDD_VISIT, { activityId: DGDD_MAIN, referer: DGDD_REFERER, raw: true, payload: {} });
    }
    async dgddReport(type) {
        return await this.send('POST', API_ORIGIN, DGDD_REPORT, { activityId: DGDD_MAIN, referer: DGDD_REFERER, raw: true, payload: { type: type } });
    }
    async dgddPrize(prizeId) {
        return await this.send('POST', API_ORIGIN, DGDD_PRIZE, { activityId: DGDD_MAIN, referer: DGDD_REFERER, raw: true, payload: { prizeId: prizeId } });
    }
    async dgddJoin() {
        return await this.send('GET', API_ORIGIN, DGDD_JOIN, { activityId: DGDD_SUB, referer: DGDD_SUB_REFERER, raw: true });
    }
    async dgddSubTasks() {
        return await this.send('GET', API_ORIGIN, '/act-task/query-tasks', { activityId: DGDD_SUB, referer: DGDD_SUB_REFERER, raw: true });
    }
    async dgddSubReport(taskId) {
        return await this.send('POST', API_ORIGIN, '/act-task/task-report', { activityId: DGDD_SUB, referer: DGDD_SUB_REFERER, raw: true, payload: { taskId: taskId } });
    }
    async dgddTimes() {
        return await this.send('POST', API_ORIGIN, DRAW_TIMES, { activityId: DGDD_SUB, referer: DGDD_SUB_REFERER, raw: true, payload: {}, params: [['activityId', DGDD_SUB]] });
    }
    async dgddDraw() {
        return await this.send('POST', API_ORIGIN, DRAW_DO, { activityId: DGDD_SUB, referer: DGDD_SUB_REFERER, raw: true, payload: {} });
    }

    async dgdd() {
        const parts = [];
        const st = await this.dgddState();
        if (!st || String(st.code) !== '000000' || !st.data || typeof st.data !== 'object') {
            throw new MiguError('主会场状态异常（code=' + (st && st.code) + '）');
        }
        const d = st.data;
        const dgddUser = d.isDgdd === true;
        const score = typeof d.scoreTotal === 'number' ? d.scoreTotal : null;
        parts.push('主会场' + (score !== null ? ' 次数' + score : '') + (dgddUser ? '·动感' : '·非动感'));

        const visit = await this.dgddVisit();
        parts.push('访问' + (visit && String(visit.code) === '000000' ? '✓' : (visit && visit.code) || '?'));

        const order = [['preview', '浏览'], ['share', '分享'], ['video', '视频']];
        const tasks = d.tasks || {};
        for (let i = 0; i < order.length; i++) {
            const key = order[i][0];
            const label = order[i][1];
            const t = tasks[key];
            if (!t) continue;
            const done = typeof t.time === 'number' ? t.time : 0;
            const need = typeof t.needTime === 'number' ? t.needTime : 0;
            if (need >= 0 && done >= need) {
                parts.push(label + '已达标');
                continue;
            }
            const r = await this.dgddReport(key);
            if (r && String(r.code) === '000000') parts.push(label + '✓');
            else parts.push(label + ' ' + (r && r.code ? r.code : '?'));
        }

        const prizeId = String(getEnv('migu_dgdd_prize') || '').trim();
        if (prizeId) {
            const p = await this.dgddPrize(prizeId);
            if (p && String(p.code) === '000000') {
                const name = p.data && (p.data.prizeName || p.data.name || p.data.prize);
                parts.push('抽奖✓' + (name ? '：' + name : ''));
            } else if (p && String(p.code) === '200012') {
                parts.push('抽奖未中奖');
            } else {
                parts.push('抽奖 ' + (p && p.code ? p.code : '?'));
            }
        } else {
            parts.push('主会场抽奖跳过(未配prizeId)');
        }

        try {
            await this.dgddJoin();
            const sub = await this.dgddSubTasks();
            if (sub && String(sub.code) === '000000' && Array.isArray(sub.data)) {
                const song = sub.data.filter(function (x) { return x.id === 'song'; })[0];
                const sign = sub.data.filter(function (x) { return x.id === 'sign'; })[0];
                if (song) parts.push('听歌' + (song.completeTime || 0) + '/' + (song.needCompleteTime || 0));
                if (sign) {
                    if (sign.rceiveTime >= sign.needCompleteTime) {
                        parts.push('门票签到已领');
                    } else {
                        const sr = await this.dgddSubReport('sign');
                        if (sr && String(sr.code) === '000000') parts.push('门票签到✓');
                        else parts.push('门票签到 ' + (sr && sr.code ? sr.code : '?'));
                    }
                }
            } else if (sub && String(sub.code) !== '000000') {
                parts.push('门票状态 ' + sub.code);
            }
            const times = await this.dgddTimes();
            if (times && String(times.code) === '000000' && times.data) {
                const rest = typeof times.data.restTime === 'number' ? times.data.restTime : 0;
                if (rest > 0) {
                    const dr = await this.dgddDraw();
                    if (dr && String(dr.code) === '000000') parts.push('门票抽奖✓');
                    else parts.push('门票抽奖 ' + (dr && dr.code ? dr.code : '?'));
                } else {
                    parts.push('门票抽奖次数0');
                }
            }
        } catch (e) {
            parts.push('门票 ' + e.message);
        }

        const summary = parts.join(' ');
        $.log('1314节：' + summary);
        return summary;
    }

    // ---- 评论 ----
    async comments(songId) {
        const data = await this.send('GET', API_ORIGIN, COMMENT_LIST, {
            native: true,
            params: [['resourceType', '2'], ['resourceId', songId || this.songId()], ['queryType', '1'],
                ['commentId', ''], ['hotCommentStart', '0'], ['pageSize', '20']]
        });
        if (!data || !Array.isArray(data.comments)) throw new MiguError('歌曲评论列表无法验证');
        return data.comments;
    }

    async ownedComment(text, reportId, songId) {
        const target = songId || this.songId();
        const list = await this.comments(target);
        for (let i = 0; i < list.length; i++) {
            const c = list[i];
            if (!c || typeof c !== 'object' || !c.user || typeof c.user !== 'object') continue;
            const owner = String(c.user.userId !== undefined ? c.user.userId : (c.user.uid !== undefined ? c.user.uid : (c.user.mUserId !== undefined ? c.user.mUserId : '')));
            if (owner !== this.ctx.uid || c.commentInfo !== text) continue;
            if (c.targetResourceId !== undefined && c.targetResourceId !== null && String(c.targetResourceId) !== target) continue;
            const cid = String(c.commentId === undefined || c.commentId === null ? '' : c.commentId);
            if (reportId !== undefined && reportId !== null && cid !== String(reportId)) continue;
            if (/^[A-Za-z0-9_-]{1,100}$/.test(cid)) return cid;
        }
        return null;
    }

    async ownedAnyComment(texts, songId) {
        const target = songId || this.songId();
        const list = await this.comments(target);
        for (let i = 0; i < list.length; i++) {
            const c = list[i];
            if (!c || typeof c !== 'object' || !c.user || typeof c.user !== 'object') continue;
            const owner = String(c.user.userId !== undefined ? c.user.userId : (c.user.uid !== undefined ? c.user.uid : (c.user.mUserId !== undefined ? c.user.mUserId : '')));
            if (owner !== this.ctx.uid) continue;
            if (c.targetResourceId !== undefined && c.targetResourceId !== null && String(c.targetResourceId) !== target) continue;
            if (texts.indexOf(c.commentInfo) >= 0) return true;
        }
        return false;
    }

    async publishComment(candidates, songPool) {
        const list = (Array.isArray(candidates) ? candidates : [candidates]).filter(function (t) { return typeof t === 'string' && t.trim(); });
        if (!list.length) throw new MiguError('没有可用的评论正文');
        list.forEach(function (t) {
            if (t.length > 120 || /[\x00-\x1f]/.test(t)) throw new MiguError('评论必须是 1..120 字单行文字');
            if (/https?:\/\/|www\.|@/i.test(t)) throw new MiguError('评论不发布链接、推广或点名内容');
        });
        const pool = (Array.isArray(songPool) && songPool.length)
            ? songPool.map(function (x) { return typeof x === 'string' ? { songId: x, name: '' } : x; })
                .filter(function (x) { return x && /^\d{1,24}$/.test(String(x.songId)); })
            : [{ songId: this.songId(), name: '' }];
        if (!pool.length) throw new MiguError('榜单没有合法歌曲 ID');
        let chosen = pool.length === 1 ? pool[0] : pickByDay(pool, todayBeijing());
        if (pool.length > 1) {
            try {
                await this.comments(chosen.songId);
            } catch (e) {
                $.log('今日歌曲「' + (chosen.name || chosen.songId) + '」评论列表不可用（' + e.message + '），改用听歌那首');
                chosen = { songId: this.songId(), name: '' };
            }
        }
        const song = chosen.songId;
        const songName = chosen.name || song;
        const text = this.journal ? this.journal.pick('comment', list) : list[Math.floor(Math.random() * list.length)];
        if (await this.complete(COMMENT_TASK)) {
            $.log('评论：服务端已完成 1/1，不重复发布');
            return '已完成 1/1';
        }
        const digest = Crypt('sha256', text).slice(0, 16);
        const prior = this.journal ? this.journal.get('comment') : null;
        if (prior && (prior.status === 'attempting' || prior.status === 'posted' || prior.status === 'uncertain')) {
            throw new MiguError('今日已有评论提交记录，不重复发布');
        }
        if (await this.ownedAnyComment(list, song)) throw new MiguError('本人已有相同歌曲评论，不重复发布');
        const payload = { resourceId: song, resourceType: '2', commentInfo: text };
        if (this.journal) this.journal.set('comment', { status: 'attempting', digest: digest, song: song });
        $.log('发布评论：' + text + '（歌曲 ' + songName + '）');
        let data;
        try {
            data = await this.send('POST', USER_ORIGIN, COMMENT_ADD, { native: true, payload: payload });
        } catch (e) {
            if (this.journal) this.journal.set('comment', { status: 'uncertain', digest: digest, song: song });
            throw e;
        }
        const reportId = data && data.reportId;
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(reportId === undefined || reportId === null ? '' : reportId))) {
            if (this.journal) this.journal.set('comment', { status: 'uncertain', digest: digest, song: song });
            throw new MiguError('评论响应缺少可验证 ID，绝不重复发布');
        }
        if (this.journal) this.journal.set('comment', { status: 'posted', digest: digest, reportId: String(reportId), song: song });
        const delays = [1, 2, 4, 8, 10];
        let visible = false;
        for (let i = 0; i < delays.length; i++) {
            await sleep(delays[i] * 1000);
            visible = visible || !!(await this.ownedComment(text, String(reportId), song));
            if (visible && (await this.complete(COMMENT_TASK))) {
                if (this.journal) this.journal.set('comment', { status: 'confirmed', digest: digest, reportId: String(reportId), song: song });
                await this.settle('comment');
                return '已发布并核对 1/1（歌曲 ' + songName + '）';
            }
        }
        throw new MiguError('评论已提交但列表/任务未同时确认（可能待审核），不重发');
    }

    // ---- 彩铃（只读） ----
    async idleRingtones(media) {
        const data = await this.send('GET', PD_ORIGIN, RBT_IDLE, { native: true, params: [['status', '0'], ['mediaType', media]] });
        if (!Array.isArray(data) || data.some(function (x) { return !x || typeof x !== 'object'; })) throw new MiguError('闲置彩铃列表结构变化');
        return data;
    }

    validIdle(item) {
        if (!item || typeof item !== 'object') return false;
        const expiry = item.validateDate;
        const today = todayBeijing();
        return item.isExpired === false && item.willExpire === false && item.isDiy === false && item.vipType === '' &&
            item.status === 2 && item.vrbtStatus === 1 && item.resourceType === 'M' && item.rbtType === 1 &&
            typeof expiry === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry > today &&
            typeof item.contentId === 'string' && /^[0-9]{1,24}$/.test(item.contentId);
    }

    async ringtoneCheck() {
        const task = await this.task('vrbt');
        const mobile = await this.send('GET', API_ORIGIN, MOBILE_STATUS);
        if (mobile !== 'true' && mobile !== 'false') throw new MiguError('移动资格返回格式变化');
        const funcs = await this.send('GET', API_ORIGIN, RBT_STATUS, { native: true });
        if (!funcs || typeof funcs.vrbtStatus !== 'boolean' || typeof funcs.ovrbtStatus !== 'boolean') throw new MiguError('彩铃功能状态无法核验');
        const refs = await this.send('GET', API_ORIGIN, RBT_IDS, { native: true });
        const settings = await this.send('GET', API_ORIGIN, RBT_SETTINGS, { native: true, params: [['status', '1'], ['mediaType', '2']] });
        if (!Array.isArray(refs) || refs.some(function (x) { return typeof x !== 'string'; }) || !Array.isArray(settings)) throw new MiguError('彩铃设置查询结构变化');
        const audio = await this.send('GET', PD_ORIGIN, RBT_LIBRARY, { native: true, params: [['queryType', '1'], ['friendMsisdn', ''], ['friendUid', '']] });
        const video = await this.send('GET', PD_ORIGIN, RBT_LIBRARY, { native: true, params: [['queryType', '2'], ['friendMsisdn', ''], ['friendUid', '']] });
        if (!audio || !Array.isArray(audio.rbtInfoList) || !video || !Array.isArray(video.rbtInfoNewList) ||
            !Array.isArray(video.sceneVrbtList) || !video.clpVrbtRespList || typeof video.clpVrbtRespList !== 'object') throw new MiguError('本人彩铃库结构变化');
        const idleAudio = await this.idleRingtones('1');
        const idleVideo = await this.idleRingtones('2');
        const result = {
            taskComplete: task.completeTime >= 1,
            mobileEligible: mobile === 'true',
            videoFunctionActive: funcs.vrbtStatus,
            callerVideoActive: funcs.ovrbtStatus,
            idReferenceCount: refs.length,
            effectiveVideoCount: settings.length,
            audioLibraryCount: audio.rbtInfoList.length,
            videoLibraryCount: video.rbtInfoNewList.length,
            sceneVideoCount: video.sceneVrbtList.length,
            idleAudioCount: idleAudio.length,
            idleVideoCount: idleVideo.length,
            eligibleIdleVideoCount: idleVideo.filter(this.validIdle.bind(this)).length
        };
        $.log('彩铃：本月任务' + (result.taskComplete ? '已完成' : '未完成') + '；移动资格' + (result.mobileEligible ? '符合' : '不符合') +
            '；视频彩铃功能' + (result.videoFunctionActive ? '已开通' : '未开通'));
        $.log('彩铃库：音频' + result.audioLibraryCount + '条，视频' + result.videoLibraryCount + '条；生效视频设置' +
            result.effectiveVideoCount + '条，ID引用' + result.idReferenceCount + '个');
        $.log('闲置列表：音频' + result.idleAudioCount + '条，视频' + result.idleVideoCount + '条，有效非VIP候选' + result.eligibleIdleVideoCount + '条');
        return result;
    }

    async dailyRingtoneCandidates() {
        const page = await this.send('GET', API_ORIGIN, RBT_DAILY_PAGE, { native: true, params: [['pageId', RBT_PAGE_ID]] });
        const tabs = walkObjects(page, []).filter(function (x) { return x.title === '推荐' && x.renderMode === 'containerGroup'; });
        if (tabs.length !== 1 || !/^[A-Za-z0-9]{1,64}$/.test(String(tabs[0].id || ''))) throw new MiguError('彩铃推荐页布局变化');
        const group = await this.send('GET', API_ORIGIN, RBT_DAILY_GROUP, { native: true, params: [['containerId', tabs[0].id]] });
        const sections = walkObjects(group, []).filter(function (x) {
            return typeof x.title === 'string' && x.title.replace(/ /g, '').replace(/｜/g, '|') === '一日一铃|选今日所爱';
        });
        if (sections.length !== 1) throw new MiguError('未唯一找到官方一日一铃栏目');
        const comps = sections[0].components;
        if (!Array.isArray(comps) || comps.length !== 1 || !comps[0] || typeof comps[0] !== 'object') throw new MiguError('一日一铃组件结构变化');
        const comp = comps[0];
        const source = comp.dataSource;
        if (!source || typeof source !== 'object' || source.type !== '8' || !/^[A-Za-z0-9]{1,64}$/.test(String(source.id || '')) ||
            comp.styleCode !== 'com_l_recommend_big_style_v1') throw new MiguError('一日一铃数据源结构变化');
        const rows = await this.send('GET', API_ORIGIN, RBT_DAILY_SOURCE, {
            native: true,
            params: [['dataId', source.id], ['pageSize', '20'], ['pageNum', '1'], ['styleCode', comp.styleCode]]
        });
        if (!Array.isArray(rows) || rows.length > 100) throw new MiguError('每日推荐返回不能核验');
        const candidates = [];
        rows.forEach(function (row) {
            const v = row && row.shortVideoPlayInfo;
            if (!v || typeof v !== 'object') return;
            if (v.resourceType !== 'M' || v.isValidate !== 1 || v.publicStatus !== 1 || v.setRingFlag !== 0) return;
            if (typeof v.contentId !== 'string' || !/^\d{1,24}$/.test(v.contentId)) return;
            if (typeof v.copyrightId !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(v.copyrightId)) return;
            if (typeof v.title !== 'string' || !v.title.length || v.title.length > 300 || /[\x00-\x1f]/.test(v.title)) return;
            if (!candidates.some(function (x) { return x.contentId === v.contentId; })) candidates.push(v);
        });
        if (!candidates.length) throw new MiguError('一日一铃没有可核验候选');
        return candidates;
    }

    async dailyRingtoneQuote(candidate) {
        const cid = candidate.contentId, copyright = candidate.copyrightId;
        const auth = await this.send('GET', API_ORIGIN, RBT_NEXT_OP, {
            native: true,
            params: [['oprType', '6'], ['contentId', cid], ['copyrightId', copyright], ['resourceType', 'M'],
                ['isOvrbtSet', ''], ['withDiamondVip', '2']]
        });
        if (!auth || auth.showType !== 99 || auth.bizCheckCode !== 0 || auth.proposalVrbtFunc !== false ||
            auth.proposalOvrbtFunc !== false || auth.needFollow !== false ||
            (auth.proposalCrbtFunc !== undefined && auth.proposalCrbtFunc !== null && auth.proposalCrbtFunc !== false) ||
            (auth.proposalLightscreentFunc !== undefined && auth.proposalLightscreentFunc !== null && auth.proposalLightscreentFunc !== false) ||
            (auth.buttonList !== undefined && auth.buttonList !== null && !(Array.isArray(auth.buttonList) && !auth.buttonList.length))) return false;
        if (auth.contentId !== undefined && auth.contentId !== null && auth.contentId !== '' && auth.contentId !== cid) return false;
        const prices = await this.send('GET', API_ORIGIN, RBT_PRICE, {
            native: true,
            params: [['contentId', cid], ['copyrightId', copyright + 'M'], ['periodNum', '1'], ['periodUnit', '0']]
        });
        if (!Array.isArray(prices)) return false;
        return prices.some(function (row) {
            if (!row || typeof row !== 'object') return false;
            if (row.bizType !== '00' || row.payType !== '00') return false;
            if (typeof row.desc !== 'string' || row.desc.indexOf('免费库') < 0 || row.desc.indexOf('免费') < 0) return false;
            return typeof row.salePrice === 'string' && /^0+(?:\.0+)?$/.test(row.salePrice) &&
                typeof row.originalPrice === 'string' && /^0+(?:\.0+)?$/.test(row.originalPrice);
        });
    }

    async setDailyRingtone(journal) {
        const key = 'daily_ringtone';
        const prior = journal.get(key);
        if (prior && (prior.status === 'confirmed' || prior.status === 'confirmed_readonly')) {
            $.log('今天已执行过随机设铃，跳过');
            return null;
        }
        if (prior && (prior.status === 'attempting' || prior.status === 'uncertain')) throw new MiguError('今日已有未确认的设铃记录，不重复设置');
        if (await this.complete('vrbt')) {
            $.log('本月彩铃任务已完成，跳过设置，不反复换铃');
            return null;
        }
        const funcs = await this.send('GET', API_ORIGIN, RBT_STATUS, { native: true });
        if (!funcs || funcs.vrbtStatus !== true) throw new MiguError('视频彩铃功能未开通，不自动开通');
        if ((await this.send('GET', API_ORIGIN, MOBILE_STATUS)) !== 'true') throw new MiguError('移动资格未确认，不设置');
        const before = await this.send('GET', API_ORIGIN, RBT_SETTINGS, { native: true, params: [['status', '1'], ['mediaType', '2']] });
        if (!Array.isArray(before) || before.some(function (x) { return !x || typeof x.contentId !== 'string'; })) throw new MiguError('原生效铃音不能确认');
        const activeIds = before.map(function (x) { return x.contentId; });
        const candidates = (await this.dailyRingtoneCandidates()).filter(function (x) { return activeIds.indexOf(x.contentId) < 0; });
        const approved = [];
        for (let i = 0; i < Math.min(candidates.length, 3); i++) {
            if (await this.dailyRingtoneQuote(candidates[i])) approved.push(candidates[i]);
        }
        if (!approved.length) throw new MiguError('前三条候选未通过免费库鉴权，不购买');
        const chosen = approved[Math.floor(Math.random() * approved.length)];
        if (!(await this.dailyRingtoneQuote(chosen))) throw new MiguError('所选铃音最新鉴权或资费已变化');
        const users = chosen.user;
        if (!Array.isArray(users) || !users.length || !users[0] || typeof users[0] !== 'object') throw new MiguError('铃音作者信息无法核对');
        const author = users[0].videoUserId;
        if (typeof author !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(author)) throw new MiguError('铃音作者标识无法核对');
        const payload = {
            orderDayLength: '', needFollow: false, asyncLightScreen: false, openRbtCombination: false,
            onlyPlaying: '0', isOvrbtSet: '0', resourceType: 'M', contentId: chosen.contentId,
            copyrightId: chosen.copyrightId, contentName: chosen.title, authorId: author, needQueryClpStatus: true
        };
        const digest = Crypt('sha256', chosen.contentId).slice(0, 16);
        journal.set(key, { status: 'attempting', digest: digest });
        this.verifiedDailyPayload = JSON.stringify(payload);
        $.log('本日随机设置免费库铃音：' + chosen.title);
        try {
            await this.send('POST', API_ORIGIN, RBT_SET_TO_PLAY, { native: true, payload: payload });
        } finally {
            this.verifiedDailyPayload = null;
        }
        journal.set(key, { status: 'uncertain', digest: digest });
        let effective = false;
        const delays = [1, 2, 4, 8];
        for (let i = 0; i < delays.length; i++) {
            await sleep(delays[i] * 1000);
            const active = await this.send('GET', API_ORIGIN, RBT_SETTINGS, { native: true, params: [['status', '1'], ['mediaType', '2']] });
            effective = Array.isArray(active) && active.some(function (x) { return x && x.contentId === chosen.contentId; });
            if (effective) break;
        }
        if (!effective) throw new MiguError('设置已提交但生效列表未确认，不重发');
        journal.set(key, { status: 'confirmed', digest: digest });
        const done = await this.complete('vrbt');
        $.log('本日铃音已核验生效；本月福利任务' + (done ? '1/1' : '仍 0/1'));
        if (done) await this.settle('ringtone_' + todayBeijing().slice(0, 7));
        return chosen.title;
    }

    // ---- 听歌 ----
    async songs() {
        const data = await this.send('GET', API_ORIGIN, SONGS, { native: true, decodeHex: true });
        if (!data || typeof data !== 'object') throw new MiguError('听歌状态返回异常');
        return data;
    }

    async listenInfo() {
        const data = await this.send('GET', API_ORIGIN, LISTEN_URL, { native: true, decodeHex: true, params: this.ctx.listen_params });
        if (!data || typeof data.url !== 'string') throw new MiguError('未取得有效播放地址');
        if (String(data.freeListenType) !== '0') throw new MiguError('当前歌曲不是完整免费播放类型，不绕过付费限制');
        const host = String(data.url).replace(/^https:\/\//, '').split(/[\/?#]/)[0].split('@').pop().split(':')[0];
        if (!/^https:\/\//.test(data.url) || MEDIA_HOSTS.indexOf(host) < 0) throw new MiguError('音频地址不是已验证的官方域名');
        return data;
    }

    async reportInterval(duration, before) {
        if (duration < 1000 || duration > 10000) throw new MiguError('播放计时不合法');
        const transaction = uuid4();
        const wire = additiveEncode(JSON.stringify({ duration: duration, transactionId: transaction }));
        await this.sendRaw('POST', API_ORIGIN, SONG_REPORT, wire, 'application/json;charset=utf-8');
        let after = before;
        let state = null;
        const delays = [1, 2, 4];
        for (let i = 0; i < delays.length; i++) {
            await sleep(delays[i] * 1000);
            state = await this.songs();
            after = songTime(state);
            if (after >= before + duration || listenGoalReached(state)) break;
        }
        this.lastSongState = state;
        if (listenGoalReached(state) && after < before + duration) {
            $.log('服务端全部档位已达标；本区间未全额记账，不重放');
            return after;
        }
        if (after < before + duration) throw new MiguError('上报成功但查询增量不足，停止，不虚报');
        return after;
    }

    async claimListening() {
        const claimed = [];
        for (let round = 0; round < 7; round++) {
            const state = await this.songs();
            const tasks = state && Array.isArray(state.tasks) ? state.tasks : null;
            if (!tasks || !tasks.length) throw new MiguError('领奖前档位结构无法验证');
            const cand = tasks.filter(function (t) { return t && typeof t.status === 'number' && t.status === 1; })[0];
            if (!cand) return claimed;
            const id = cand.id;
            if (typeof id !== 'string' || !/^SONG_[1-7]$/.test(id) || claimed.some(function (x) { return x.id === id; })) throw new MiguError('待领档位不是已验证的听歌任务');
            const tierName = typeof cand.name === 'string' && cand.name ? cand.name : id;
            const tierNum = typeof cand.num === 'number' && cand.num >= 0 ? cand.num : null;
            await this.sendRaw('POST', API_ORIGIN, RECEIVE_REWARD, JSON.stringify({ taskId: id }), 'application/json', { activityId: 'MAC_KF_CBH_JBZX' });
            let confirmed = false;
            const delays = [1, 2, 4];
            for (let i = 0; i < delays.length; i++) {
                await sleep(delays[i] * 1000);
                const st = await this.songs();
                const tier = (st.tasks || []).filter(function (t) { return t && t.id === id; })[0] || {};
                if (tier.status === 2) { confirmed = true; break; }
            }
            if (!confirmed) throw new MiguError(id + ' 领取后未确认 status=2，不重复提交');
            claimed.push({ id: id, name: tierName, num: tierNum });
            $.log(tierName + '：' + (tierNum === null ? '' : '+' + tierNum + ' AI豆，') + '已独立核对 status=2');
        }
        return claimed;
    }

    async listen(seconds) {
        let state = await this.songs();
        let before = songTime(state);
        const reached = listenGoalReached(state);
        if (reached) {
            const claimed = await this.claimListening();
            return { skipped: true, added: 0, claimed: claimed, before: before, after: before };
        }
        const target = listenTarget(state);
        let remaining = Math.min(seconds, Math.max(0, Math.ceil((target - before) / 1000)));
        if (remaining < 1) {
            const claimed = await this.claimListening();
            return { skipped: true, added: 0, claimed: claimed, before: before, after: before };
        }
        $.log('听歌：服务端 ' + secText(before) + '，本次最多实播 ' + Math.round(remaining) + ' 秒');
        let total = 0;
        while (remaining >= 1) {
            const info = await this.listenInfo();
            $.log('已取得新音频地址，下载并校验 MP3');
            const audio = await downloadAudio(info.url);
            const parsed = mp3Duration(audio);
            $.log('MP3 时长 ' + parsed.seconds.toFixed(2) + ' 秒');
            let trackRemaining = Math.min(remaining, Math.floor(parsed.seconds));
            while (trackRemaining >= 1) {
                const sec = Math.min(10, trackRemaining);
                const start = Date.now();
                await sleep(Math.round(sec * 1000));
                const measured = Math.min(10000, Math.floor(sec * 1000), Date.now() - start);
                if (measured < 1000) throw new MiguError('音频提前结束，不继续上报');
                total += measured;
                remaining -= measured / 1000;
                trackRemaining -= measured / 1000;
                $.log('本区间实播 ' + secText(measured) + '，累计 ' + secText(total));
                before = await this.reportInterval(measured, before);
                $.log('独立查询确认服务端时长：' + secText(before));
                if (listenGoalReached(this.lastSongState)) { remaining = 0; break; }
            }
        }
        const claimed = await this.claimListening();
        return { skipped: false, added: total, claimed: claimed, before: null, after: before };
    }
}

// ---- 音频下载与 MP3 时长（耗时校验，不虚报） ----

function respBytes(res) {
    if (res && res.rawBody && typeof res.rawBody.length === 'number') return Array.prototype.slice.call(res.rawBody);
    if (res && res.bodyBytes && typeof res.bodyBytes.length === 'number') return Array.prototype.slice.call(res.bodyBytes);
    const body = typeof res === 'string' ? res : (res && res.body);
    if (typeof body !== 'string') return null;
    const out = [];
    for (let i = 0; i < body.length; i++) {
        const c = body.charCodeAt(i);
        if (c === 0xfffd || c > 255) return null;
        out.push(c);
    }
    return out;
}

async function downloadAudio(url) {
    const res = await httpCall('GET', url, { 'Accept': 'audio/mpeg', 'Accept-Encoding': 'identity' }, undefined, 60000);
    if (statusOf(res) !== 200) throw new MiguError('音频下载未返回完整 200');
    const length = hget(res.headers, 'content-length');
    if (length !== undefined && length !== null && !/^\d+$/.test(String(length))) throw new MiguError('音频长度无效');
    if (length !== undefined && length !== null && parseInt(length, 10) > MAX_MEDIA_BYTES) throw new MiguError('音频超过大小上限');
    const bytes = respBytes(res);
    if (!bytes) throw new MiguError('当前环境拿不到音频原始字节，无法核验时长（用 Node / Quantumult X 运行）');
    if (bytes.length < 1024 || bytes.length > MAX_MEDIA_BYTES) throw new MiguError('音频为空、截断或超限');
    if (length !== undefined && length !== null && bytes.length !== parseInt(length, 10)) throw new MiguError('音频下载长度不一致');
    return bytes;
}

function mp3Duration(bytes) {
    let i = 0;
    if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
        i = 10 + size;
    }
    const brV1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const brV2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    let samples = 0, rate = 0, frames = 0, junk = 0;
    while (i + 4 <= bytes.length) {
        if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) {
            i++;
            junk++;
            if (junk > 4096 && !frames) break;
            continue;
        }
        const b1 = bytes[i + 1], b2 = bytes[i + 2];
        const ver = (b1 >> 3) & 3;
        const layer = (b1 >> 1) & 3;
        const brIdx = (b2 >> 4) & 15;
        const srIdx = (b2 >> 2) & 3;
        const pad = (b2 >> 1) & 1;
        if (ver === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) { i++; junk++; continue; }
        const rates = ver === 3 ? [44100, 48000, 32000] : (ver === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000]);
        const sampleRate = rates[srIdx];
        const bitrate = (ver === 3 ? brV1 : brV2)[brIdx];
        const spf = ver === 3 ? 1152 : 576;
        const frameLen = Math.floor((ver === 3 ? 144 : 72) * bitrate * 1000 / sampleRate) + pad;
        if (frameLen < 24 || i + frameLen > bytes.length) break;
        samples += spf;
        rate = sampleRate;
        frames++;
        junk = 0;
        i += frameLen;
    }
    if (!frames || !rate) throw new MiguError('下载内容不是可识别的有效 MP3');
    const seconds = samples / rate;
    if (!(seconds >= 1 && seconds <= 1800)) throw new MiguError('MP3 时长不在 1..1800 秒');
    return { seconds: seconds, frames: frames, rate: rate };
}

// ---- 账号执行 ----

async function openClient(account, key) {
    const cached = loadNativeCache(key);
    if (cached) return { ctx: cached, cached: true };
    // 新登录的配置先核验后落盘，避免把不可用配置写进缓存
    const ctx = await loginAndBuild(account);
    return { ctx: ctx, cached: false };
}

async function verifyContext(client) {
    const state = await client.songs();
    const ms = songTime(state);
    const tasks = await client.tasks();
    const balance = await client.balance();
    await client.listenInfo();
    return { ms: ms, taskCount: tasks.length, balance: balance };
}

async function runAccount(account, index) {
    const label = '账号' + index + '（' + maskPhone(account.phone) + '）';
    const key = accountKey(account.phone);
    const journal = new Journal(key);
    $.log('\n=== ' + label + ' ===');
    let opened = await openClient(account, key);
    let client = new MiguClient(opened.ctx, journal);
    let info;
    try {
        info = await verifyContext(client);
    } catch (e) {
        if (!opened.cached) throw e;
        $.log('缓存配置核验失败（' + e.message + '），清缓存重新登录一次');
        clearNativeCache(key);
        opened = await openClient(account, key);
        client = new MiguClient(opened.ctx, journal);
        info = await verifyContext(client);
    }
    if (!opened.cached) {
        saveNativeCache(key, opened.ctx);
        $.log('登录后四项只读核验通过，已缓存本账号原生配置');
    }
    $.log('只读核验：听歌 ' + secText(info.ms) + '，任务 ' + info.taskCount + ' 项，AI豆 ' + info.balance);

    const lines = [];
    const ok = function (name, text) { lines.push('• ' + name + ': ' + text); };
    const fail = function (name, e) { $.log('❌ ' + name + '：' + e.message); lines.push('• ' + name + ': ' + e.message); };

    try { ok('签到', await client.sign()); } catch (e) { fail('签到', e); }
    try { ok('社区', await client.community()); } catch (e) { fail('社区', e); }

    if ($.dgddOn) {
        try { ok('1314节', await client.dgdd()); } catch (e) { fail('1314节', e); }
    }

    if ($.commentOn) {
        try {
            const pool = await fetchRankSongs();
            $.log('已从咪咕尖叫榜·全网热歌榜取到 ' + pool.length + ' 首可评论歌曲');
            ok('评论', await client.publishComment($.commentList, pool));
        } catch (e) { fail('评论', e); }
    }

    if ($.ringtoneOn) {
        try {
            await client.ringtoneCheck();
            const title = await client.setDailyRingtone(journal);
            if (title) ok('彩铃', '已设置「' + title + '」');
        } catch (e) { fail('彩铃', e); }
    }

    try {
        if ($.listenOn) {
            const r = await client.listen($.seconds);
            const claimed = claimText(r.claimed);
            if (r.skipped) {
                ok('听歌', '已达标，跳过播放' + claimed);
            } else {
                ok('听歌', '实播 ' + secText(r.added) + '，服务端 ' + secText(r.after) + claimed);
            }
        } else {
            const claimed = await client.claimListening();
            ok('听歌', claimed.length ? claimText(claimed) : '无待领档位');
        }
    } catch (e) { fail('听歌', e); }

    try {
        const afterBalance = await client.balance();
        const delta = afterBalance - info.balance;
        const sign = delta >= 0 ? '+' : '';
        ok('AI豆', info.balance + ' → ' + afterBalance + '（' + sign + delta + '）');
        $.log('AI豆：' + info.balance + ' → ' + afterBalance + '（' + sign + delta + '）');
    } catch (e) { fail('AI豆', e); }

    return { mask: maskPhone(account.phone), lines: lines };
}

// ---- 通知 ----

// 每台手机一个稳定的来源标识：BoxJS「呆呆面板同步」分区的 @daidai.device 手填；
// 没填就自动生成一次并写回本地，保证同一台手机以后每次抓包都落在面板的同一行。
function getDaidaiSource() {
    try {
        let v = String($.getdata('@daidai.device') || $.getdata('DAIDAI_DEVICE') || '').trim();
        v = v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
        if (v) return v;
        v = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        $.setdata(v, '@daidai.device');
        $.log(`[呆呆推送] 未设置 @daidai.device，已自动生成来源标识: ${v}（可在 BoxJS 里改成好记的名字）`);
        return v;
    } catch (e) { return ''; }
}

// 重写抓到的数据即时推呆呆面板（仅手机侧；网关同值跳过，失败静默不影响主流程）
// POST 包成 Promise 登记进 $.daidaiTasks，由入口统一 await，避免 $done() 后请求被丢弃
function pushDaidai(payload) {
    try {
        if ($.isNode()) return;
        const api = (getEnv('TOOLS_API', '@tools.address') || '').replace(/\/+$/, '');
        const token = getEnv('TOOLS_API_TOKEN', '@tools.token') || '';
        const envs = (payload.envs || []).map(([name, value]) => ({ name, value: String(value) }));
        const boxjs = (payload.boxjs || []).map(([key, value]) => ({ key, value: String(value) }));
        if (!api || !token) { $.log('[呆呆推送] 跳过：BoxJS「取凭证网关(tools)」的 @tools.address / @tools.token 未配置'); return; }
        if (!envs.length && !boxjs.length) return;
        const source = getDaidaiSource();   // 两台手机各占面板同名变量的一行
        const url = `${api}/api/daidai/env/sync`;
        const isLoon = typeof $.isLoon === 'function' && $.isLoon();
        const isQuanX = typeof $.isQuanX === 'function' && $.isQuanX();
        const opts = {
            url,
            headers: { 'X-Token': token, 'Content-Type': 'application/json' },
            body: $.toStr({ envs, boxjs, source }),
            // Loon 的 $httpClient 默认沿「当前路由」(代理节点) 发请求，局域网网关会被发到节点上超时；
            // 且它默认超时只有 5000ms、单位是毫秒（Surge/Stash/Shadowrocket 是秒），必须按平台区分
            timeout: (isLoon || isQuanX) ? 15000 : 15,
        };
        if (isLoon) opts.node = 'DIRECT';   // Loon 专用：强制直连，别把内网请求丢给代理节点
        $.log(`[呆呆推送] → ${url}${source ? ` (来源 ${source})` : ''}`);
        const task = new Promise((resolve) => {
            let settled = false;
            const finish = (line) => {
                if (settled) return;
                settled = true;
                if (line) $.log(line);
                resolve();
            };
            // 兜底超时：网关不通/隧道卡住也不能把重写脚本挂死（要大于客户端 timeout）
            const timer = setTimeout(() => finish('[呆呆推送] 超时已忽略(20s)'), 20000);
            try {
                $.post(opts, (err, resp, data) => {
                    clearTimeout(timer);
                    const r = $.toObj(data) || {};
                    const fail = (r.failed || []).map(f => f.name || f.key).join(',');
                    if (err || r.error || fail) {
                        finish(`[呆呆推送] 异常已忽略(${url}): ${err && (err.message || err) || r.error || fail}`);
                    } else {
                        const parts = [
                            r.source && `来源 ${r.source}`,
                            (r.created || []).length && `新建 ${r.created.length}`,
                            (r.updated || []).length && `更新 ${r.updated.length}`,
                            (r.unchanged || []).length && `同值跳过 ${r.unchanged.length}`,
                            (r.boxjs && r.boxjs.updated || []).length && `box.dat 写 ${r.boxjs.updated.length}`,
                            (r.config_sh && r.config_sh.updated || []).length && `config.sh 写 ${r.config_sh.updated.length}`,
                        ].filter(Boolean).join('、');
                        finish(`[呆呆推送] 完成: ${parts || '网关已受理'}`);
                    }
                });
            } catch (e) { clearTimeout(timer); finish(`[呆呆推送] 异常已忽略: ${e.message || e}`); }
        });
        $.daidaiTasks.push(task);
        return task;
    } catch (e) { $.log(`[呆呆推送] 异常已忽略: ${e.message || e}`); }
}

function getEnv() {
    for (let i = 0; i < arguments.length; i++) {
        let key = arguments[i];
        let value = $.isNode()
            ? process.env[key] || process.env[key.toUpperCase()] || process.env[key.toLowerCase()] || $.getdata(key)
            : $.getdata(key);
        if (value) return value;
    }
    return '';
}

async function sendMsg(subtitle, message) {
    if (!message && !subtitle) return;
    try {
        if ($.isNode()) {
            let notify;
            try { notify = require('./sendNotify'); } catch (e) { notify = require('./utils/sendNotify'); }
            await notify.sendNotify($.name, [subtitle, message].filter(Boolean).join('\n\n'));
        } else {
            $.msg($.name, subtitle || '', message || '');
        }
    } catch (e) {
        $.log('\n' + [subtitle, message].filter(Boolean).join('\n\n'));
    }
}

// ---- 入口 ----

!(async () => {
    $.is_debug = /^(true|1|yes|on)$/i.test(String(getEnv('migu_debug') || ''));
    $.commentOn = !/^(false|0|no|off)$/i.test(String(getEnv('migu_comment') || ''));
    $.ringtoneOn = /^(true|1|yes|on)$/i.test(String(getEnv('migu_ringtone') || ''));
    $.listenOn = !/^(false|0|no|off)$/i.test(String(getEnv('migu_listen') || ''));
    $.dgddOn = !/^(false|0|no|off)$/i.test(String(getEnv('migu_dgdd') || ''));
    $.seconds = parseInt(getEnv('migu_listen_seconds') || '1800', 10);
    $.commentList = parseCommentList(getEnv('migu_comment_text'));
    if (!(($.seconds >= 1 && $.seconds <= 1800))) throw new MiguError('migu_listen_seconds 需在 1..1800');

    const accounts = loadAccounts();
    if (!accounts.length) throw new MiguError('未找到 MIGU_AUTH 变量，请填写 手机号@密码 ❌');

    $.log('共 ' + accounts.length + ' 个账号；听歌' + ($.listenOn ? '开启' : '关闭') +
        '，评论' + ($.commentOn ? '开启' : '关闭') + '，彩铃设置' + ($.ringtoneOn ? '开启' : '关闭') +
        '，1314节' + ($.dgddOn ? '开启' : '关闭'));
    const summary = [];
    for (let i = 0; i < accounts.length; i++) {
        try {
            const result = await runAccount(accounts[i], i + 1);
            if (result.lines.length) {
                summary.push(accounts.length > 1
                    ? '【账号 ' + (i + 1) + ': ' + result.mask + '】\n' + result.lines.join('\n')
                    : result.lines.join('\n'));
            }
        } catch (e) {
            $.log('账号 ' + maskPhone(accounts[i].phone) + ' 停止：' + e.message);
            summary.push((accounts.length > 1 ? '【账号 ' + (i + 1) + ': ' + maskPhone(accounts[i].phone) + '】\n' : '') +
                '• 执行失败: ' + e.message);
        }
    }
    if (summary.length) {
        const subtitle = accounts.length === 1 ? '执行完成 (1个账号)' : '执行完成 (' + accounts.length + '个账号)';
        await sendMsg(subtitle, summary.join('\n\n'));
    }
})()
    .catch(function (e) {
        $.logErr(e);
    })
    .finally(async function () {
        // 抓包即时推送是异步 POST：必须等它落地再 $.done()，Loon/Surge 在 $done() 后会丢弃未完成请求
        if ($.daidaiTasks && $.daidaiTasks.length) await Promise.all($.daidaiTasks);
        $.isNode() || $.done();
    });


// Node 原生 HTTP 客户端：零第三方依赖（青龙/呆呆面板容器可能没有 got/iconv-lite/tough-cookie）
function nodeHttpRequest(opts, cb) {
  let u;
  try { u = new URL(opts.url); } catch (e) { return cb(e || new Error('invalid url')); }
  const secure = u.protocol === 'https:';
  const mod = secure ? require('https') : require('http');
  const headers = Object.assign({}, opts.headers || {});
  const payload = opts.body == null ? null : Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(String(opts.body));
  if (payload && headers['content-length'] == null && headers['Content-Length'] == null) headers['Content-Length'] = payload.length;
  let finished = false;
  const done = (err, res, body) => { if (finished) return; finished = true; cb(err, res, body); };
  let req;
  try {
    req = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (secure ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method: (opts.method || 'GET').toUpperCase(),
      headers: headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        const zlib = require('zlib');
        const finish = (buf) => {
          const status = res.statusCode || 0;
          const resp = { status: status, statusCode: status, headers: res.headers, rawBody: buf, body: buf.toString('utf8') };
          done(null, resp, resp.body);
        };
        if (enc === 'gzip' || enc === 'x-gzip') zlib.gunzip(raw, (e, d) => e ? done(e) : finish(d));
        else if (enc === 'deflate' || enc === 'x-deflate') zlib.inflate(raw, (e, d) => e ? done(e) : finish(d));
        else if (enc === 'br') zlib.brotliDecompress(raw, (e, d) => e ? done(e) : finish(d));
        else finish(raw);
      });
    });
  } catch (e) { return done(e); }
  req.setTimeout(opts.timeout || 30000, () => req.destroy(new Error('request timeout')));
  req.on('error', (e) => done(e));
  if (payload) req.write(payload);
  req.end();
}

function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, r) => { s.call(this, t, ((t, s, a) => { t ? r(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, r) => e(r))) })) } runScript(t, e) { return new Promise((s => { let r = this.getdata("@chavy_boxjs_userCfgs.httpapi"); r = r ? r.replace(/\n/g, "").trim() : r; let a = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); a = a ? 1 * a : 20, a = e && e.timeout ? e.timeout : a; const [i, o] = r.split("@"), n = { url: `http://${o}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: a }, headers: { "X-Key": i, Accept: "*/*" }, timeout: a }; this.post(n, ((t, e, r) => s(r))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e); if (!s && !r) return {}; { const r = s ? t : e; try { return JSON.parse(this.fs.readFileSync(r)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e), a = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, a) : r ? this.fs.writeFileSync(e, a) : this.fs.writeFileSync(t, a) } } lodash_get(t, e, s = void 0) { const r = e.replace(/\[(\d+)\]/g, ".$1").split("."); let a = t; for (const t of r) if (a = Object(a)[t], void 0 === a) return s; return a } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, r) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[r + 1]) >> 0 == +e[r + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, r] = /^@(.*?)\.(.*?)$/.exec(t), a = s ? this.getval(s) : ""; if (a) try { const t = JSON.parse(a); e = t ? this.lodash_get(t, r, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, r, a] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(r), o = r ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, a, t), s = this.setval(JSON.stringify(e), r) } catch (e) { const i = {}; this.lodash_set(i, a, t), s = this.setval(JSON.stringify(i), r) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { if (t && !t.headers) t.headers = {}; } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": nodeHttpRequest(t, e) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": t.method = s, nodeHttpRequest(t, e) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let r = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in r) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? r[e] : ("00" + r[e]).substr(("" + r[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let r = t[s]; null != r && "" !== r && ("object" == typeof r && (r = JSON.stringify(r)), e += `${s}=${r}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", r = "", a) { const i = t => { switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: return { url: t.url || t.openUrl || t["open-url"] }; case "Loon": return { openUrl: t.openUrl || t.url || t["open-url"], mediaUrl: t.mediaUrl || t["media-url"] }; case "Quantumult X": return { "open-url": t["open-url"] || t.url || t.openUrl, "media-url": t["media-url"] || t.mediaUrl, "update-pasteboard": t["update-pasteboard"] || t.updatePasteboard }; case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, r, i(a)); break; case "Quantumult X": $notify(e, s, r, i(a)); case "Node.js": }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), r && t.push(r), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, t.stack) } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
