// 穷举矩阵：尝试多种 key × message 组合，匹配已知正确签名
const crypto = require('crypto');
const SALT = "EBRYFkVMReKBGsU2";
const rt = "onb3Mjnj-nSn3ug7Gne4kEFE5i94@as5MuzK8Q3uU2als43ChuQAA";
const dev = "354d1154f4b6e9d59cefa191ab25ead2";
const rnd = 502054479;
const ts = 1785134898;
const devName = "iPhone";
const devTok = "ad4fc1289ecd53f672a5051d5bdca4c48feeb0a6b7c5689ccaa0f3f3d350d2e7";
const EXPECTED = "dd32c264a65d9888ed05cc9d1be7249ca71b2b2b7425a65194a5bf7ce72a94dc";

const full = {
    random: rnd, deviceId: dev, refCgi: "", deviceName: devName,
    refreshToken: rt, wxToken: 1, timestamp: ts, inBackground: 0, deviceToken: devTok
};
const b4 = { refreshToken: rt, deviceId: dev, random: rnd, timestamp: ts };

function hmac(k, m) { return crypto.createHmac('sha256', k).update(m, 'utf8').digest('hex'); }
function sortedKV(o, sep = "&") { return Object.keys(o).sort().map(k => k + "=" + o[k]).join(sep); }
function sortedVals(o, sep = "&") { return Object.keys(o).sort().map(k => o[k]).join(sep); }
function sortedObj(o) { const s = {}; Object.keys(o).sort().forEach(k => s[k] = o[k]); return s; }

const keys = {
    "rt_dev_rnd": rt + "_" + dev + "_" + SALT + "_" + rnd,
    "rt_dev_ts": rt + "_" + dev + "_" + SALT + "_" + ts,
    "rt_rnd_dev": rt + "_" + rnd + "_" + SALT + "_" + dev,
    "dev_rt_rnd": dev + "_" + rt + "_" + SALT + "_" + rnd,
    "dev_rt_ts": dev + "_" + rt + "_" + SALT + "_" + ts,
    "rt_dev_rnd_str": rt + "_" + dev + "_" + SALT + "_" + String(rnd),
    "SALT_only": SALT,
    "rt_only": rt,
};

const msgs = {
    "kv4&": sortedKV(b4),
    "kvfull&": sortedKV(full),
    "jsonFull": JSON.stringify(full),
    "jsonSortedFull": JSON.stringify(sortedObj(full)),
    "vals4&": sortedVals(b4),
    "valsFull&": sortedVals(full),
    "rndts_nosep": "" + rnd + ts,
    "tsrnd_nosep": "" + ts + rnd,
    "rt_ts": rt + ts,
    "rt": rt,
    "dev": dev,
    "empty": "",
    "rnd_ts_": rnd + "_" + ts,
    "ts_rnd_": ts + "_" + rnd,
    "b64jsonFull": Buffer.from(JSON.stringify(full)).toString('base64'),
    "b64jsonSorted": Buffer.from(JSON.stringify(sortedObj(full))).toString('base64'),
    "kv4_nosep": sortedKV(b4, ""),
    "kvfull_nosep": sortedKV(full, ""),
    "rt_dev_rnd_ts_": [rt, dev, rnd, ts].join("_"),
    "dev_rnd_ts": dev + "_" + rnd + "_" + ts,
};

let found = false;
for (const [kn, k] of Object.entries(keys)) {
    for (const [mn, m] of Object.entries(msgs)) {
        const s = hmac(k, m);
        if (s === EXPECTED) {
            console.log(`MATCH!!! key=${kn} msg=${mn}`);
            console.log("  KEY:", k);
            console.log("  MSG:", m);
            found = true;
        }
    }
}
if (!found) console.log("NO MATCH in " + (Object.keys(keys).length * Object.keys(msgs).length) + " combos.");
console.log("\nSample key (rt_dev_rnd):", keys["rt_dev_rnd"]);
