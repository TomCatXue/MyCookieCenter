// 多邻国 Duolingo 订阅等级解锁
// 真机实测：只有 "GOLD" 能触发完整解锁（SUPER/PREMIUM 仅改 UI）
let obj = { "subscriberLevel": "GOLD" };

$done({ body: JSON.stringify(obj), status: 200 });
