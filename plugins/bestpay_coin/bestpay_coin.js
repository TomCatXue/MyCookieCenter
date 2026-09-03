/**
 * 翼支付 · 权益币与签到秒刷助手 (方案 1 精简版)
 * @version 1.3.0
 * @date 2026-09-03
 * GitHub: https://github.com/TomCatXue/MyCookieCenter
 * 
 * 核心功能：
 * 1. 一键全收：进入页面瞬间自动提取能量配置与所有待收权益币/能量球，一键秒收
 * 2. 自动签到：自动查询弹窗配置并完成每日签到打卡
 * 3. 自动开箱：自动领取每日福利宝箱
 * 4. 拟态浮窗：顶部半透明深色磨砂 HUD 实时反馈
 */

const isResponse = typeof $response !== 'undefined';
const isRequest = typeof $request !== 'undefined';

if (isResponse) {
  handleResponse();
} else if (isRequest) {
  handleNotificationTrigger();
} else {
  $done({});
}

function handleResponse() {
  let body = $response.body;
  if (!body) {
    $done({});
    return;
  }

  const runnerScript = `
<script>
(function() {
  if (window.__bestpay_auto_injected__) return;
  window.__bestpay_auto_injected__ = true;

  // 1. 创建显眼拟态浮窗 HUD
  const hud = document.createElement('div');
  hud.id = 'bestpay_auto_hud';
  hud.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top, 44px) + 50px);left:12px;right:12px;z-index:2147483647;background:rgba(15,20,30,0.96);backdrop-filter:blur(16px);border:1.5px solid #FFD700;border-radius:14px;padding:12px 16px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,0.5);transition:all 0.3s ease;';
  hud.innerHTML = '<div style="display:flex;align-items:center;font-weight:700;color:#FFD700;margin-bottom:4px;font-size:14px;"><span style="font-size:16px;margin-right:6px;">⚡</span> 翼支付权益助手 · 正在自动收取...</div><div id="bestpay_hud_msg" style="color:#B0B8C4;font-size:12px;">正在连接原生容器...</div>';
  
  function updateHud(text, isDone = false) {
    const el = document.getElementById('bestpay_hud_msg');
    if (el) el.innerHTML = text;
    if (isDone) {
      setTimeout(() => {
        hud.style.opacity = '0';
        hud.style.transform = 'translateY(-20px)';
        setTimeout(() => hud.remove(), 400);
      }, 4500);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(hud);
  });
  if (document.body) document.body.appendChild(hud);

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function waitBridge() {
    return new Promise(resolve => {
      if (window.AlipayJSBridge && window.AlipayJSBridge.call) return resolve();
      document.addEventListener('AlipayJSBridgeReady', resolve, false);
      setTimeout(resolve, 2000);
    });
  }

  function rpc(operationType, params = {}) {
    return new Promise((resolve) => {
      if (!window.AlipayJSBridge || !window.AlipayJSBridge.call) {
        return resolve({ success: false, error: 'no_bridge' });
      }
      try {
        window.AlipayJSBridge.call('rpc', {
          operationType: operationType,
          requestData: [params],
          headers: {
            'event-context': JSON.stringify({ env: 'PRD', tntId: '0101' })
          }
        }, function(res) {
          if (!res) return resolve({ success: false });
          let data = res;
          if (res.data) {
            try {
              data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            } catch(e) { data = res.data; }
          }
          resolve(data);
        });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  }

  async function runAutoTasks() {
    await waitBridge();
    await sleep(600);

    const summary = [];

    // ==================== 1. 一键收取所有权益币与能量球 ====================
    updateHud('正在获取能量配置与待收权益币...');
    try {
      const homeRes = await rpc('com.bestpay.marketingadapter.api.y2025.score.market.ScoreMarketService.greenEnergyHomePage', {});
      const scoreActivityNo = (homeRes && homeRes.result) ? (homeRes.result.scoreActivityNo || '') : '';
      
      if (scoreActivityNo) {
        const starQueryRes = await rpc('com.bestpay.marketingadapter.api.y2025.score.market.ScoreMarketService.starReceiveQuery', { scoreActivityNo });
        const recordList = (starQueryRes && starQueryRes.result) ? (starQueryRes.result.receiveInitSuccessRecordNoList || []) : [];
        
        if (recordList.length > 0) {
          updateHud('发现 ' + recordList.length + ' 个待收权益币，正在全收...');
          const recvRes = await rpc('com.bestpay.marketingadapter.api.y2025.score.market.ScoreMarketService.starReceive', {
            scoreActivityNo: scoreActivityNo,
            recordList: recordList
          });
          if (recvRes && (recvRes.success || recvRes.code === '1000')) {
            summary.push('收取 ' + recordList.length + ' 个权益币');
          }
        } else {
          summary.push('暂无待收权益币');
        }
      }
    } catch(e) {
      console.log('[翼支付] 收币异常:', e);
    }
    await sleep(350);

    // ==================== 2. 每日签到打卡 ====================
    updateHud('正在执行每日签到打卡...');
    try {
      const popRes = await rpc('com.bestpay.marketingadapter.api.y2025.sign.SignInPopupService.querySigInPopUpDetail', {});
      const { awardPoolNo, prizeNo } = (popRes && popRes.result) ? popRes.result : {};
      
      if (awardPoolNo && prizeNo) {
        const signRes = await rpc('com.bestpay.marketingadapter.api.y2025.sign.SignInPopupService.distributePrize', {
          awardPoolNo: awardPoolNo,
          prizeNo: prizeNo
        });
        if (signRes && (signRes.success || signRes.code === '1000')) {
          summary.push('签到成功');
        }
      } else {
        summary.push('今日已签过到');
      }
    } catch(e) {
      console.log('[翼支付] 签到异常:', e);
    }
    await sleep(350);

    // ==================== 3. 开启每日福利宝箱 ====================
    updateHud('正在开启每日福利宝箱...');
    try {
      const boxRes = await rpc('com.bestpay.minsheng.mkt.api.money.MakeMoneyService.openTreasureBox', {});
      if (boxRes && (boxRes.success || boxRes.code === '1000')) {
        summary.push('宝箱已开');
      }
    } catch(e) {}
    await sleep(300);

    // 全部执行完毕
    const resultText = summary.join(' · ') || '权益币已全收，签到完成';
    updateHud('<div style="color:#00E676;font-weight:700;font-size:13px;margin-bottom:2px;">🎉 权益币与签到已全部搞定！</div><div style="color:#D1D5DB;font-size:11px;">' + resultText + '</div>', true);

    // 触发系统通知
    fetch('https://render.bestpay.cn/__bestpay_notify__?msg=' + encodeURIComponent(resultText)).catch(() => {});
  }

  runAutoTasks();
})();
</script>
`;

  if (body.includes('</body>')) {
    body = body.replace('</body>', runnerScript + '</body>');
  } else {
    body += runnerScript;
  }
  $done({ body });
}

function handleNotificationTrigger() {
  const url = $request.url;
  if (url.includes('__bestpay_notify__')) {
    const msg = decodeURIComponent(url.split('msg=')[1] || '今日权益币已收取，签到完成！');
    if (typeof $notification !== 'undefined') {
      $notification.post(
        '翼支付 · 权益币助手',
        '⚡ 权益币全收与签到完成',
        msg,
        'bestpay://'
      );
    }
    $done({ response: { status: 200, body: 'ok' } });
  } else {
    $done({});
  }
}
