/**
 * 山西电信体验AI领福利 - 上线智能监控与凭证捕获脚本
 * GitHub: https://github.com/TomCatXue/MyCookieCenter
 * 
 * 功能特性：
 * 1. 自动录制：在电信APP搜索“领福利”自动捕获搜索接口模板
 * 2. 凭证捕获：进入活动页面自动捕获最新 Cookie 与鉴权参数
 * 3. 随机轮询：每月 1-8 号白天以 25~50 分钟不规则随机间隔检测新活动上线
 * 4. 查到即止：一旦检测到当月新批次活动并发送直达通知后，当月彻底休眠，绝不多发一个包
 */

const isRequest = typeof $request !== 'undefined';

if (isRequest) {
  handleRequest();
} else {
  handleCron();
}

// ==================== 1. 自动录制与凭证捕获 ====================
function handleRequest() {
  const url = $request.url || '';
  const headers = $request.headers || {};
  const body = $request.body || '';

  // 场景 A：捕获活动 H5 页面凭证与 Cookie
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
      if (match && match[1]) {
        $persistentStore.write(match[1], 'sx_monitor_current_code');
      }

      $notification.post(
        '山西电信AI领福利',
        '🎉 活动凭证捕获成功',
        '已成功记录本期活动 Cookie 与链接！'
      );
      console.log('[电信福利] 捕获活动凭据成功: ' + url);
    }
  }

  // 场景 B：捕获“领福利”搜索请求模板
  const isSearch = decodeURIComponent(url).includes('领福利') ||
                   (typeof body === 'string' && decodeURIComponent(body).includes('领福利'));
  if (isSearch && !url.includes('/sx_ai_benefit/h5/')) {
    console.log('[电信监控] 成功录制搜索接口: ' + url);
    $persistentStore.write(url, 'sx_monitor_url');
    $persistentStore.write($request.method, 'sx_monitor_method');
    $persistentStore.write(JSON.stringify(headers), 'sx_monitor_headers');
    if (body) {
      $persistentStore.write(body, 'sx_monitor_body');
    }

    $persistentStore.write('0', 'sx_monitor_last_run_ts');
    $persistentStore.write('0', 'sx_monitor_next_interval');

    $notification.post(
      '山西电信福利监控',
      '✅ 搜索模板已成功录制',
      '已启用 1~8 号不规则随机监控。一旦检测到新批次上线将立即通知，随后本月彻底停止。'
    );
  }

  $done({});
}

// ==================== 2. 智能不规则随机轮询 ====================
async function handleCron() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const currentYearMonth = `${year}${month}`; // 形如 "202610"

  // 核心机制 1：单次终结熔断——本月已通知过，当月剩余时间彻底休眠
  const notifiedMonth = $persistentStore.read('sx_monitor_notified_month');
  if (notifiedMonth === currentYearMonth) {
    console.log(`[电信监控] 本月（${currentYearMonth}）新活动已通知，当月任务已彻底终结，保持静默。`);
    $done({});
    return;
  }

  const searchUrl = $persistentStore.read('sx_monitor_url');
  const method = $persistentStore.read('sx_monitor_method') || 'POST';
  const headersStr = $persistentStore.read('sx_monitor_headers');
  const body = $persistentStore.read('sx_monitor_body') || '';
  const lastCode = $persistentStore.read('sx_monitor_current_code') || 'HD20260901GF9KY';

  if (!searchUrl || !headersStr) {
    console.log('[电信监控] 尚未录制搜索模板，请先在中国电信APP首页搜索一次【领福利】');
    $done({});
    return;
  }

  // 核心机制 2：动态随机时间窗（无规则发包）
  const nowTs = Date.now();
  const lastRunTs = parseInt($persistentStore.read('sx_monitor_last_run_ts') || '0', 10);
  const nextInterval = parseInt($persistentStore.read('sx_monitor_next_interval') || '0', 10);

  // 尚未到达随机冷却时间，直接静默退出（不产生任何网络流量）
  if (nowTs - lastRunTs < nextInterval) {
    const remainingMins = Math.ceil((nextInterval - (nowTs - lastRunTs)) / 60000);
    console.log(`[电信监控] 处于随机冷却中，距离下次探测约 ${remainingMins} 分钟...`);
    $done({});
    return;
  }

  // 生成下一次随机间隔：25 ~ 50 分钟
  const newRandomInterval = (Math.floor(Math.random() * 26) + 25) * 60 * 1000;
  $persistentStore.write(String(nowTs), 'sx_monitor_last_run_ts');
  $persistentStore.write(String(newRandomInterval), 'sx_monitor_next_interval');

  // 核心机制 3：秒级随机抖动（随机睡眠 3 ~ 18 秒，打乱时间戳整点特征）
  const jitterMs = Math.floor(Math.random() * 15000) + 3000;
  console.log(`[电信监控] 命中随机触发点，执行 ${(jitterMs / 1000).toFixed(1)} 秒防特征抖动后发包...`);
  await sleep(jitterMs);

  let headers = {};
  try {
    headers = JSON.parse(headersStr);
  } catch (e) {
    headers = { 'User-Agent': 'CtClient;13.2.0;iOS;26.6.1;iPhone 16e' };
  }

  const requestOptions = {
    url: searchUrl,
    method: method,
    headers: headers,
    body: body
  };

  $httpClient[method.toLowerCase()](requestOptions, (err, resp, data) => {
    if (err) {
      console.log('[电信监控] 轮询网络异常: ' + err);
      $done({});
      return;
    }

    try {
      const regex = /sx_ai_benefit\/h5\/(HD\d{8}[A-Za-z0-9]+)/i;
      const match = data.match(regex);

      if (match && match[1]) {
        const foundCode = match[1];
        console.log(`[电信监控] 匹配到活动代码: ${foundCode}`);

        const isCurrentMonth = foundCode.includes(currentYearMonth);

        if (foundCode !== lastCode && isCurrentMonth) {
          // 🎉 抓到当月新批次活动上线！
          $persistentStore.write(foundCode, 'sx_monitor_current_code');
          // 标记本月终结锁，后续所有执行直接拦截
          $persistentStore.write(currentYearMonth, 'sx_monitor_notified_month');

          $notification.post(
            '🚨 山西电信AI领福利正式上线！',
            `新批次代码: ${foundCode}`,
            '💥 1000份腾讯视频会员已放水！点击直达电信APP搜索抢兑！',
            { 'open-url': 'ctclient://' }
          );
          console.log('[电信监控] 新活动上线通知已送达，已开启本月终结熔断，后续不再发包。');
        } else {
          console.log(`[电信监控] 活动尚未更新为当月批次，将在 ${(newRandomInterval / 60000).toFixed(0)} 分钟后随机复查。`);
        }
      } else {
        console.log(`[电信监控] 搜索结果暂无活动入口，将在 ${(newRandomInterval / 60000).toFixed(0)} 分钟后随机复查。`);
      }
    } catch (e) {
      console.log('[电信监控] 解析响应异常: ' + e.message);
    } finally {
      $done({});
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getQueryParam(rawUrl, name) {
  const reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
  const r = rawUrl.split('?')[1]?.match(reg);
  return r != null ? unescape(r[2]) : null;
}
