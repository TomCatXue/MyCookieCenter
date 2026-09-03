/**
 * B站空降助手·进度条看点打点脚本 (方案A: ViewPoints 原生刻度标记) - Loon
 * 
 * 功能：
 * 1. 拦截播放进度请求 (gRPC ViewProgress 与 JSON x/v2/view)
 * 2. 自动提取当前视频 aid / cid 并无损计算真实 BVID
 * 3. 异步查询 SponsorBlock 官方社区数据库 (bsbsb.top)
 * 4. 自动在进度条对应的广告、片头、片尾区间生成原生看点断点 (Point) 与悬浮标签文字
 * 5. 设置 point_permanent: true，常驻在播放进度条上，进视频一眼即知有无广告
 */

const XOR_CODE = 23442827791579n;
const MAX_AID = 1n << 51n;
const BASE = 58n;
const BVID_CHARS = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";

function toBvid(avid) {
    if (!avid) return "";
    try {
        const bytes = ["B", "V", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
        let bvIndex = bytes.length - 1;
        let tmp = (MAX_AID | BigInt(avid)) ^ XOR_CODE;
        while (tmp > 0n) {
            bytes[bvIndex] = BVID_CHARS[Number(tmp % BASE)];
            tmp = tmp / BASE;
            bvIndex -= 1;
        }
        [bytes[3], bytes[9]] = [bytes[9], bytes[3]];
        [bytes[4], bytes[7]] = [bytes[7], bytes[4]];
        return bytes.join("");
    } catch (e) {
        return "";
    }
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
}

function getCategoryLabel(cat) {
    switch (cat) {
        case "sponsor": return "【广告插播】";
        case "intro": return "【片头】";
        case "outro": return "【片尾】";
        case "selfpromo": return "【自推广告】";
        case "interaction": return "【求三连互动】";
        default: return "【空降片段】";
    }
}

function encodeVarint(n) {
    const bytes = [];
    let val = BigInt(n);
    while (true) {
        const b = Number(val & 0x7fn);
        val >>= 7n;
        if (val > 0n) {
            bytes.push(b | 0x80);
        } else {
            bytes.push(b);
            break;
        }
    }
    return bytes;
}

function makeTag(fieldNum, wireType) {
    return encodeVarint((fieldNum << 3) | wireType);
}

function encodeUtf8(str) {
    const encoded = unescape(encodeURIComponent(str));
    const bytes = [];
    for (let i = 0; i < encoded.length; i++) {
        bytes.push(encoded.charCodeAt(i));
    }
    return bytes;
}

function encodePointField(fromSec, toSec, label) {
    const p = [];
    p.push(...makeTag(1, 0), ...encodeVarint(1));
    p.push(...makeTag(2, 0), ...encodeVarint(fromSec));
    p.push(...makeTag(3, 0), ...encodeVarint(toSec));
    const contentBytes = encodeUtf8(label);
    p.push(...makeTag(4, 2), ...encodeVarint(contentBytes.length), ...contentBytes);

    const res = [];
    res.push(...makeTag(3, 2), ...encodeVarint(p.length), ...p);
    return res;
}

function encodePointPermanentField() {
    return [...makeTag(5, 0), ...encodeVarint(1)];
}

function parseAidCidFromGrpc(rawBytes) {
    let aid = 0;
    let cid = 0;
    if (!rawBytes || rawBytes.length < 6) return { aid, cid };
    
    let pos = 5;
    const len = rawBytes.length;
    while (pos < len) {
        let tagVal = 0;
        let shift = 0;
        while (pos < len) {
            const b = rawBytes[pos++];
            tagVal |= (b & 0x7f) << shift;
            shift += 7;
            if (!(b & 0x80)) break;
        }
        const fieldNum = tagVal >> 3;
        const wireType = tagVal & 0x7;
        
        if (wireType === 0) {
            let val = 0n;
            let valShift = 0n;
            while (pos < len) {
                const b = rawBytes[pos++];
                val |= BigInt(b & 0x7f) << valShift;
                valShift += 7n;
                if (!(b & 0x80)) break;
            }
            if (fieldNum === 1) aid = val.toString();
            else if (fieldNum === 2) cid = val.toString();
        } else if (wireType === 2) {
            let strLen = 0;
            let lenShift = 0;
            while (pos < len) {
                const b = rawBytes[pos++];
                strLen |= (b & 0x7f) << lenShift;
                lenShift += 7;
                if (!(b & 0x80)) break;
            }
            pos += strLen;
        } else {
            break;
        }
    }
    return { aid, cid };
}

const url = typeof $request !== "undefined" && $request.url ? $request.url : "";

if (url.includes("ViewProgress")) {
    handleGrpcViewProgress();
} else {
    handleJsonView();
}

function handleGrpcViewProgress() {
    let reqBytes = null;
    let respBytes = null;

    if (typeof $request !== "undefined" && $request.bodyBytes) {
        reqBytes = new Uint8Array($request.bodyBytes);
    } else if (typeof $request !== "undefined" && typeof $request.body === "string") {
        reqBytes = new Uint8Array(Array.from($request.body).map(c => c.charCodeAt(0)));
    }

    if (typeof $response !== "undefined" && $response.bodyBytes) {
        respBytes = new Uint8Array($response.bodyBytes);
    } else if (typeof $response !== "undefined" && typeof $response.body === "string") {
        respBytes = new Uint8Array(Array.from($response.body).map(c => c.charCodeAt(0)));
    }

    if (!reqBytes || !respBytes || respBytes.length < 5) {
        $done({});
        return;
    }

    const { aid, cid } = parseAidCidFromGrpc(reqBytes);
    const bvid = toBvid(aid);

    if (!bvid) {
        $done({});
        return;
    }

    const sbUrl = "https://bsbsb.top/api/skipSegments?videoID=" + bvid + "&cid=" + (cid || "");
    $httpClient.get({
        url: sbUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
            "Referer": "https://www.bilibili.com"
        },
        timeout: 2500
    }, function (err, res, resBody) {
        if (err || !resBody) {
            $done({});
            return;
        }

        try {
            const segments = JSON.parse(resBody);
            if (!Array.isArray(segments) || segments.length === 0) {
                $done({});
                return;
            }

            const extraBytes = [];
            segments.forEach(function (s) {
                if (!s.segment || s.segment.length < 2) return;
                const start = Math.floor(s.segment[0]);
                const end = Math.ceil(s.segment[1]);
                const label = getCategoryLabel(s.category) + " " + formatTime(start) + " - " + formatTime(end);
                extraBytes.push(...encodePointField(start, end, label));
            });

            extraBytes.push(...encodePointPermanentField());

            if (extraBytes.length === 0) {
                $done({});
                return;
            }

            const oldPayloadLen = (respBytes[1] << 24) | (respBytes[2] << 16) | (respBytes[3] << 8) | respBytes[4];
            const newPayloadLen = oldPayloadLen + extraBytes.length;

            const finalBytes = new Uint8Array(respBytes.length + extraBytes.length);
            finalBytes.set(respBytes, 0);
            finalBytes.set(extraBytes, respBytes.length);

            finalBytes[1] = (newPayloadLen >> 24) & 0xff;
            finalBytes[2] = (newPayloadLen >> 16) & 0xff;
            finalBytes[3] = (newPayloadLen >> 8) & 0xff;
            finalBytes[4] = newPayloadLen & 0xff;

            $done({ bodyBytes: finalBytes.buffer });
        } catch (e) {
            $done({});
        }
    });
}

function handleJsonView() {
    if (typeof $response === "undefined" || !$response.body) {
        $done({});
        return;
    }

    let data;
    try {
        data = JSON.parse($response.body);
    } catch (e) {
        $done({});
        return;
    }

    if (!data || data.code !== 0 || !data.data) {
        $done({});
        return;
    }

    const d = data.data;
    const bvid = d.bvid || toBvid(d.aid);
    const cid = d.cid || 0;

    if (!bvid) {
        $done({});
        return;
    }

    const sbUrl = "https://bsbsb.top/api/skipSegments?videoID=" + bvid + "&cid=" + cid;
    $httpClient.get({
        url: sbUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
            "Referer": "https://www.bilibili.com"
        },
        timeout: 2500
    }, function (err, res, resBody) {
        if (err || !resBody) {
            $done({});
            return;
        }

        try {
            const segments = JSON.parse(resBody);
            if (Array.isArray(segments) && segments.length > 0) {
                if (!d.view_points) d.view_points = [];
                d.point_permanent = true;

                segments.forEach(function (s) {
                    if (!s.segment || s.segment.length < 2) return;
                    const start = Math.floor(s.segment[0]);
                    const end = Math.ceil(s.segment[1]);
                    const label = getCategoryLabel(s.category) + " " + formatTime(start) + " - " + formatTime(end);
                    d.view_points.push({
                        type: 1,
                        from: start,
                        to: end,
                        content: label,
                        imgUrl: "",
                        logoUrl: ""
                    });
                });

                $done({ body: JSON.stringify(data) });
                return;
            }
        } catch (e) {}

        $done({});
    });
}
