/**
 * 翼支付 · 权益币与做任务秒刷助手 (Loon 响应注入型)
 * GitHub: https://github.com/TomCatXue/MyCookieCenter
 * 
 * 功能特性：
 * 1. 自动收币：打开赚钱专区/绿色能量页面瞬间，全自动一键收取所有漂浮的权益币与能量球
 * 2. 自动签到：自动触发每日签到发奖
 * 3. 自动做任务：自动扫描并秒完成所有浏览类任务，直接提交领奖
 * 4. 自动开宝箱：自动开启每日福利宝箱
 * 5. 双重反馈：页面顶部原生拟态玻璃 HUD 实时进度展示 + iOS 震动横幅系统通知
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

  // 1. 创建优雅拟态浮窗 HUD
  const hud = document.createElement('div');
  hud.id = 'bestpay_auto_hud';
  hud.style.cssText = 'position:fixed;top:18px;left:15px;right:15px;z-index:999999;background:rgba(20,25,35,0.92);backdrop-filter:blur(12px);border:1px solid rgba(255,215,0,0.3);border-radius:14px;padding:12px 16px;color:#fff;font-family:-apple-system,sans-serif;font-size:13px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,0.35);transition:all 0.3s ease;';
  hud.innerHTML = '<div style="display:flex;align-items:center;font-weight:600;color:#FFD700;margin-bottom:4px;"><span style="font-size:16px;margin-right:6px;">⚡</span> 翼支付权益助手 · 正在自动秒刷...</div><div id="bestpay_hud_msg" style="color:#E0E0E0;font-size:12px;">正在连接原生容器...</div>';
  
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

  function waitBridge() {
    return new Promise(resolve => {
      if (window.AlipayJSBridge || window.BestpayHtml5) return resolve();
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

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function runAutoTasks() {
    await waitBridge();
    await sleep(600);

    const summary = [];

    // 动作 1：一键收取悬浮权益币与能量球
    updateHud('正在一键收取所有悬浮权益币...');
    try {
      const starRes = await rpc('com.bestpay.marketingadapter.api.y2025.score.market.ScoreMarketService.starReceive', {});
      if (starRes && (starRes.success || starRes.code === '1000' || starRes.result)) {
        summary.push('权益币已全收');
      }
    } catch(e) {}
    await sleep(350);

    // 动作 2：每日自动签到打卡
    updateHud('正在执行每日自动签到...');
    try {
      const signRes = await rpc('com.bestpay.marketingadapter.api.y2025.sign.SignInPopupService.distributePrize', {});
      if (signRes && (signRes.success || signRes.code === '1000')) {
        summary.push('今日签到成功');
      } else {
        summary.push('今日已签过到');
      }
    } catch(e) {}
    await sleep(350);

    // 动作 3：自动开启每日福利宝箱
    updateHud('正在开启每日福利宝箱...');
    try {
      const boxRes = await rpc('com.bestpay.minsheng.mkt.api.money.MakeMoneyService.openTreasureBox', {});
      if (boxRes && (boxRes.success || boxRes.code === '1000')) {
        summary.push('宝箱已开');
      }
    } catch(e) {}
    await sleep(350);

    // 动作 4：自动遍历并秒完成所有可浏览任务
    updateHud('正在扫描并自动完成浏览任务...');
    let finishCount = 0;
    try {
      const taskListRes = await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newQueryTheMonthTaskList', { sceneNo: 'MONEYMAKINGCOMBINEDTASK' });
      const tasks = (taskListRes && taskListRes.result) ? (taskListRes.result.subMissionList || taskListRes.result.allTaskList || []) : [];
      
      for (const t of tasks) {
        if (t && (t.status === 'INITIAL' || t.status === 'OPEN' || t.status === 'DOWN')) {
          // 提交秒完成浏览
          await rpc('com.bestpay.redbag.product.api.y2022.mission.service.MissionTaskService.sendTaskMessAge', {
            notifyType: 'FINISH',
            missionType: t.businessType || 'MMS_MONEY_ADV',
            taskNo: t.taskNo
          });
          await sleep(250);
          // 提交领奖
          await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newGetReward', {
            channel: 'App',
            taskNo: t.taskNo
          });
          finishCount++;
          await sleep(250);
        }
      }
      if (finishCount > 0) {
        summary.push('秒清 ' + finishCount + ' 个任务');
      }
    } catch(e) {}
    await sleep(350);

    // 动作 5：领取累计任务奖励
    try {
      await rpc('com.bestpay.minsheng.mkt.api.money.MakeMoneyService.receiveCumulativeTaskAward', {});
    } catch(e) {}

    // 全部完成：更新浮窗展示并发送通知
    const resultText = summary.join(' · ') || '今日任务均已全部完成';
    updateHud('<span style="color:#00E676;font-weight:600;">🎉 今日任务已全部搞定！</span><br><span style="color:#B0B0B0;font-size:11px;">' + resultText + '</span>', true);

    // 触发 Loon 系统通知
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
    const msg = decodeURIComponent(url.split('msg=')[1] || '今日任务与权益币已全部秒清！');
    if (typeof $notification !== 'undefined') {
      $notification.post(
        '翼支付 · 权益币秒刷',
        '⚡ 自动收币与任务已全部完成',
        msg,
        'bestpay://'
      );
    }
    $done({ response: { status: 200, body: 'ok' } });
  } else {
    $done({});
  }
}
