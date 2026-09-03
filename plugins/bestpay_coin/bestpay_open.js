/**
 * 翼支付 · 权益中心直达唤醒脚本
 * @version 1.1.0
 * @date 2026-09-03
 * GitHub: https://github.com/TomCatXue/MyCookieCenter
 * 
 * 在 BoxJS 中点击运行，弹出横幅通知，点击直接跳转唤起翼支付 App 进入赚钱专区/绿色能量页面。
 */

const targetH5 = 'https://render.bestpay.cn/marketing-h5/index.html';
// 翼支付原生容器要求 url 参数为未转义的完整 http 地址，否则会因解析失败导致白屏
const jumpUrl = 'bestpay://web?isHome=true&title=&url=' + targetH5;

if (typeof $notification !== 'undefined') {
  $notification.post(
    '翼支付 · 权益中心',
    '🚀 轻触直达权益币专区',
    '点击本通知立即打开翼支付【绿色能量 / 赚钱专区】，自动完成收币与签到！',
    jumpUrl
  );
} else {
  console.log('[翼支付] 跳转链接: ' + jumpUrl);
}

$done({});
