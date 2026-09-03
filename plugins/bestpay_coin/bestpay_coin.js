/**
 * 翼支付 · 权益币与做任务秒刷助手 (Loon 响应注入型)
 * GitHub: https://github.com/TomCatXue/MyCookieCenter
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

  // 1. 创建显眼拟态浮窗 HUD（位于导航栏下方安全区域，避免被灵动岛遮挡）
  const hud = document.createElement('div');
  hud.id = 'bestpay_auto_hud';
  hud.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top, 44px) + 50px);left:12px;right:12px;z-index:2147483647;background:rgba(18,22,33,0.96);backdrop-filter:blur(16px);border:1.5px solid #FFD700;border-radius:14px;padding:12px 16px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,0.5);transition:all 0.3s ease;';
  hud.innerHTML = '<div style="display:flex;align-items:center;font-weight:700;color:#FFD700;margin-bottom:4px;font-size:14px;"><span style="font-size:16px;margin-right:6px;">⚡</span> 翼支付权益助手 · 自动秒刷中...</div><div id="bestpay_hud_msg" style="color:#B0B8C4;font-size:12px;">正在连接原生容器，请稍候...</div>';
  
  function updateHud(text, isDone = false) {
    const el = document.getElementById('bestpay_hud_msg');
    if (el) el.innerHTML = text;
    if (isDone) {
      setTimeout(() => {
        hud.style.opacity = '0';
        hud.style.transform = 'translateY(-20px)';
        setTimeout(() => hud.remove(), 400);
      }, 5000);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(hud);
  });
  if (document.body) document.body.appendChild(hud);

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

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function runAutoTasks() {
    await waitBridge();
    await sleep(700);

    const summary = [];

    // ==================== 1. 一键收取所有权益币/能量球 ====================
    updateHud('正在获取能量配置与待收权益币...');
    try {
      // 先调 greenEnergyHomePage 获取活动编号
      const homeRes = await rpc('com.bestpay.marketingadapter.api.y2025.score.market.ScoreMarketService.greenEnergyHomePage', {});
      const scoreActivityNo = (homeRes && homeRes.result) ? (homeRes.result.scoreActivityNo || '') : '';
      
      if (scoreActivityNo) {
        // 查待收取记录
        const starQueryRes = await rpc('com.bestpay.marketingadapter.api.y2025.score.market.ScoreMarketService.starReceiveQuery', { scoreActivityNo });
        const recordList = (starQueryRes && starQueryRes.result) ? (starQueryRes.result.receiveInitSuccessRecordNoList || []) : [];
        
        if (recordList.length > 0) {
          updateHud('发现 ' + recordList.length + ' 个待收权益币，正在一键收取...');
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
      console.log('收币异常:', e);
    }
    await sleep(350);

    // ==================== 2. 每日签到打卡 ====================
    updateHud('正在检测每日签到状态...');
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
    } catch(e) {}
    await sleep(350);

    // ==================== 3. 自动开启每日宝箱 ====================
    updateHud('正在开启每日福利宝箱...');
    try {
      const boxRes = await rpc('com.bestpay.minsheng.mkt.api.money.MakeMoneyService.openTreasureBox', {});
      if (boxRes && (boxRes.success || boxRes.code === '1000')) {
        summary.push('宝箱已开');
      }
    } catch(e) {}
    await sleep(350);

    // ==================== 4. 扫描并自动完成所有浏览任务 ====================
    updateHud('正在检索当月任务列表...');
    let finishCount = 0;
    try {
      const taskListRes = await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newQueryTheMonthTaskList', {
        channel: 'App',
        requestKey: 'NEW_LIST_KEY',
        sceneType: ''
      });
      
      let allTasks = [];
      if (taskListRes && taskListRes.result) {
        const mList = taskListRes.result.missionList || [];
        for (const item of mList) {
          allTasks.push(item);
          if (item.subMissionList && Array.isArray(item.subMissionList)) {
            allTasks = allTasks.concat(item.subMissionList);
          }
        }
      }

      for (const t of allTasks) {
        if (!t || !t.taskNo) continue;
        
        // 尚未完成的任务 -> 秒完成浏览
        if (t.status === 'INITIAL' || t.status === 'OPEN') {
          updateHud('正在秒完成: ' + (t.taskName || '浏览任务') + '...');
          await rpc('com.bestpay.redbag.product.api.y2022.mission.service.MissionTaskService.sendTaskMessAge', {
            notifyType: 'FINISH',
            missionType: t.businessType || 'MMS_MONEY_ADV',
            taskNo: t.taskNo
          });
          await sleep(300);
          
          // 提交领奖
          await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newGetReward', {
            channel: 'App',
            taskNo: t.taskNo
          });
          finishCount++;
          await sleep(300);
        } else if (t.status === 'DOWN') {
          // 已达标但未领奖
          await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newGetReward', {
            channel: 'App',
            taskNo: t.taskNo
          });
          finishCount++;
          await sleep(300);
        }
      }
      if (finishCount > 0) {
        summary.push('秒做 ' + finishCount + ' 个任务');
      }
    } catch(e) {
      console.log('任务流转异常:', e);
    }
    await sleep(350);

    // ==================== 5. 领取累计任务奖励 ====================
    try {
      await rpc('com.bestpay.minsheng.mkt.api.money.MakeMoneyService.receiveCumulativeTaskAward', {});
    } catch(e) {}

    // 全部执行完毕
    const resultText = summary.join(' · ') || '今日任务均已全部完成';
    updateHud('<div style="color:#00E676;font-weight:700;font-size:13px;margin-bottom:2px;">🎉 今日任务已全部搞定！</div><div style="color:#D1D5DB;font-size:11px;">' + resultText + '</div>', true);

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
