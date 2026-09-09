/**
 * B站空降助手 (SponsorBlock + 弹幕双引擎) - Loon Script
 * 拦截视频 view 接口，注入 SponsorBlock 社区片段与弹幕高能标记到播放器进度条
 *
 * 特性：
 * 1. 优先查询 SponsorBlock 数据库 (bsbsb.top) 获取精准跳过片段 (广告/片头/片尾/无用内容)
 * 2. 若 SponsorBlock 无数据，自动解析弹幕 XML 提取高能/空降时间点
 * 3. 原生注入到 view_points 和 high_energy，兼容所有 B站 App 版本 (国内版/国际版/iPad/HD)
 */

const AIRDROP_KEYWORDS = /空降|高能预警|前方高能|高能|空降成功|空降指引|空降地址|空降位置|空降点|跳过|空降倒计时|高能进度/i;
const TIME_PATTERN = /(\d{1,2})\s*[:：分]\s*(\d{1,2})\s*秒?/;

let body = $response.body;
let data;

try {
    data = JSON.parse(body);
} catch (e) {
    $done({});
}

if (!data || data.code !== 0 || !data.data) {
    $done({});
}

const d = data.data;
const bvid = d.bvid || "";
const cid = d.cid || 0;
const aid = d.aid || 0;
const duration = d.duration || 0;

if (!d.view_points) d.view_points = [];
if (!d.high_energy) d.high_energy = { show: true, segments: [] };
d.high_energy.show = true;

// 1. 优先查询 SponsorBlock API
if (bvid) {
    const sbUrl = `https://bsbsb.top/api/skipSegments?videoID=${bvid}`;
    $httpClient.get({
        url: sbUrl,
        timeout: 3000
    }, function (err, res, resBody) {
        if (!err && resBody) {
            try {
                const segments = JSON.parse(resBody);
                if (Array.isArray(segments) && segments.length > 0) {
                    segments.forEach(function (s) {
                        if (!s.segment || s.segment.length < 2) return;
                        const start = Math.floor(s.segment[0]);
                        const end = Math.ceil(s.segment[1]);
                        const category = s.category;
                        const label = category === 'sponsor' ? '广告/赞助' :
                                      category === 'intro' ? '片头' :
                                      category === 'outro' ? '片尾' :
                                      category === 'selfpromo' ? '自推' : '空降片段';
                        d.view_points.push({
                            from: start,
                            to: end,
                            type: 1,
                            content: label,
                            icon_url: "",
                            image_url: ""
                        });
                        d.high_energy.segments.push({
                            start: start,
                            end: end,
                            text: label
                        });
                    });
                    $done({ body: JSON.stringify(data) });
                    return;
                }
            } catch (e) {}
        }

        // 2. SponsorBlock 无数据时，回退到弹幕 XML 解析
        fallbackDanmakuAnalysis();
    });
} else {
    fallbackDanmakuAnalysis();
}

function fallbackDanmakuAnalysis() {
    if (!cid) {
        $done({ body: JSON.stringify(data) });
        return;
    }

    const dmUrl = `https://comment.bilibili.com/${cid}.xml`;
    $httpClient.get({
        url: dmUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
            "Referer": "https://www.bilibili.com/video/av" + aid
        },
        timeout: 3000
    }, function (error, response, dmBody) {
        if (error || !dmBody) {
            $done({ body: JSON.stringify(data) });
            return;
        }

        const points = parseDanmakuForAirdrop(dmBody);
        if (points.length > 0) {
            points.forEach(function (p) {
                d.view_points.push({
                    from: p.time,
                    to: p.time + 8,
                    type: 1,
                    content: p.text.length > 20 ? p.text.substring(0, 20) + "..." : p.text,
                    icon_url: "",
                    image_url: ""
                });
                d.high_energy.segments.push({
                    start: p.time,
                    end: p.time + 8,
                    text: p.text.length > 10 ? p.text.substring(0, 10) + "..." : p.text
                });
            });
        }
        $done({ body: JSON.stringify(data) });
    });
}

function parseDanmakuForAirdrop(xml) {
    const points = [];
    const danmakuRegex = /<d\s+p="([\d.]+)[^"]*"[^>]*>([\s\S]*?)<\/d>/g;
    let match;
    let count = 0;

    while ((match = danmakuRegex.exec(xml)) !== null && count < 5000) {
        count++;
        const time = parseFloat(match[1]);
        const text = match[2].trim();

        if (!AIRDROP_KEYWORDS.test(text)) continue;
        AIRDROP_KEYWORDS.lastIndex = 0;

        const timeMatch = text.match(TIME_PATTERN);
        if (timeMatch) {
            const min = parseInt(timeMatch[1]);
            const sec = parseInt(timeMatch[2]);
            const targetTime = min * 60 + sec;
            if (targetTime > 0 && targetTime < (duration > 0 ? duration : 99999)) {
                points.push({ time: targetTime, text: text });
                continue;
            }
        }

        if (time > 0 && time < (duration > 0 ? duration : 99999)) {
            points.push({ time: time, text: text });
        }
    }

    points.sort(function (a, b) { return a.time - b.time; });

    const unique = [];
    const seen = {};
    points.forEach(function (p) {
        const key = Math.floor(p.time / 5);
        if (!seen[key]) {
            seen[key] = true;
            unique.push(p);
        }
    });

    return unique;
}
