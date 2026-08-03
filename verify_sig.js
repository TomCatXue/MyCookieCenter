// 验证微信读书 /login 签名算法，使用 HAR 抓包的真实样本
// 已知正确 signature = dd32c264a65d9888ed05cc9d1be7249ca71b2b2b7425a65194a5bf7ce72a94dc

const crypto = require('crypto');

const SALT = "EBRYFkVMReKBGsU2";
const refreshToken = "onb3Mjnj-nSn3ug7Gne4kEFE5i94@as5MuzK8Q3uU2als43ChuQAA";
const deviceId = "354d1154f4b6e9d59cefa191ab25ead2";
const random = 502054479;
const timestamp = 1785134898;
const EXPECTED = "dd32c264a65d9888ed05cc9d1be7249ca71b2b2b7425a65194a5bf7ce72a94dc";

// 完整 body（来自 HAR）
const fullBody = {
    random, deviceId, refCgi: "", deviceName: "iPhone",
    refreshToken, wxToken: 1, timestamp,
    inBackground: 0,
    deviceToken: "ad4fc1289ecd53f672a5051d5bdca4c48feeb0a6b7c5689ccaa0f3f3d350d2e7"
};

function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

// 当前插件用的 key 构建
const keyCurrent = refreshToken + "_" + deviceId + "_" + SALT + "_" + random;
console.log("KEY:", keyCurrent);
console.log("EXPECTED:", EXPECTED);

// 候选 message 格式
const candidates = {};

// 1. 当前插件 signableString: 只含 4 个字段，sorted key=value&
const body4 = { refreshToken, deviceId, random, timestamp };
candidates["1. sorted 4-field key=value& (current)"] =
    Object.keys(body4).sort().map(k => k + "=" + body4[k]).join("&");

// 2. sorted 全字段 key=value& (无 signature)
candidates["2. sorted full-body key=value& (no sig)"] =
    Object.keys(fullBody).sort().map(k => k + "=" + fullBody[k]).join("&");

// 3. JSON.stringify full body
candidates["3. JSON full body"] = JSON.stringify(fullBody);

// 4. JSON full body, sorted keys
const sortedFull = {};
Object.keys(fullBody).sort().forEach(k => sortedFull[k] = fullBody[k]);
candidates["4. JSON sorted full body"] = JSON.stringify(sortedFull);

// 5. 只有 random+timestamp
candidates["5. random_timestamp"] = random + "_" + timestamp;

// 6. key=value 无 &
const body4b = { refreshToken, deviceId, random, timestamp };
candidates["6. sorted 4-field key=value no &"] =
    Object.keys(body4b).sort().map(k => k + "=" + body4b[k]).join("");

// 7. raw values joined by _
candidates["7. refreshToken_deviceId_random_timestamp"] =
    [refreshToken, deviceId, random, timestamp].join("_");

// 8. 仅 refreshToken 作为 message
candidates["8. refreshToken only"] = refreshToken;

// 9. timestamp+random 形式 (类似网页版 sg 反向)
candidates["9. timestamp+random+SALT"] = "" + timestamp + random + SALT;

for (const [name, msg] of Object.entries(candidates)) {
    const sig = hmac(keyCurrent, msg);
    const ok = sig === EXPECTED ? "  <<< MATCH!!!" : "";
    console.log(`\n${name}`);
    console.log("  msg: " + (msg.length > 120 ? msg.slice(0, 120) + "..." : msg));
    console.log("  sig: " + sig + ok);
}

// 也试一下 key 的变体
console.log("\n=== KEY 变体测试 (msg=候选2) ===");
const msg2 = Object.keys(fullBody).sort().map(k => k + "=" + fullBody[k]).join("&");
const keyVariants = {
    "a. rt_dev_salt_rand (current)": keyCurrent,
    "b. rt_dev_salt_rand (string rand)": refreshToken + "_" + deviceId + "_" + SALT + "_" + String(random),
    "c. dev_rt_salt_rand": deviceId + "_" + refreshToken + "_" + SALT + "_" + random,
    "d. salt only": SALT,
    "e. rt_dev_rand_salt": refreshToken + "_" + deviceId + "_" + random + "_" + SALT,
};
for (const [name, k] of Object.entries(keyVariants)) {
    const sig = hmac(k, msg2);
    const ok = sig === EXPECTED ? "  <<< MATCH!!!" : "";
    console.log(`${name}: ${sig}${ok}`);
}
