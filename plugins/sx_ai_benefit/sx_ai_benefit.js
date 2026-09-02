/**
 * 山西电信体验AI领福利 - 凭证捕获与状态管理脚本
 * GitHub: https://github.com/TomCatXue/MyCookieCenter
 */

const isRequest = typeof $request !== 'undefined';

if (isRequest) {
  handleCapture();
} else {
  handleManual();
}

function handleCapture() {
  const url = $request.url || '';
  const headers = $request.headers || {};

  if (url.includes('/sx_ai_benefit/h5/HD')) {
    const cookie = headers['Cookie'] || headers['cookie'];
    if (cookie) {
      $persistentStore.write(cookie, 'sx_benefit_cookie');
      $persistentStore.write(url, 'sx_benefit_url');
      const utmScha = getQueryParam(url, 'utm_scha') || '';
      $persistentStore.write(utmScha, 'sx_benefit_utm_scha');
      const ua = headers['User-Agent'] || headers['user-agent'] || 'CtClient;13.2.0;iOS;26.6.1;iPhone 16e';
      $persistentStore.write(ua, 'sx_benefit_ua');

      const match = url.match(/(HD\d{8}[A-Za-z0-9]+)/i);
      const code = match ? match[1] : '已捕获';
      if (match && match[1]) {
        $persistentStore.write(match[1], 'sx_monitor_current_code');
      }

      $notification.post(
        '山西电信AI领福利',
        '🎉 活动凭证捕获成功',
        `已记录最新活动批次 [${code}] 与 Cookie 凭证！`
      );
      console.log('[电信福利] 捕获活动凭据成功: ' + url);
    }
  }
  $done({});
}

function handleManual() {
  const cookie = $persistentStore.read('sx_benefit_cookie');
  const activityUrl = $persistentStore.read('sx_benefit_url');
  const code = $persistentStore.read('sx_monitor_current_code') || '无';

  if (!cookie || !activityUrl) {
    $notification.post(
      '山西电信AI领福利',
      '⚠️ 未找到活动凭据',
      '请先在电信APP首页搜索【领福利】并点击进入活动页面完成自动录制！'
    );
  } else {
    $notification.post(
      '山西电信AI领福利',
      '✅ 凭据正常有效',
      `当前记录批次: ${code}\n可在活动页面直接操作，或重新进入刷新凭证。`
    );
  }
  $done({});
}

function getQueryParam(rawUrl, name) {
  const reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
  const r = rawUrl.split('?')[1]?.match(reg);
  return r != null ? unescape(r[2]) : null;
}
