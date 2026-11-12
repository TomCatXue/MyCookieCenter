// 多邻国 Duolingo 订阅等级解锁
// 真机抓包确认：免费值为 "FREE"，付费等级填 "SUPER"（旧版 "GOLD" 已废弃）
let obj = { "subscriberLevel": "SUPER" };

$done({ body: JSON.stringify(obj), status: 200 });
