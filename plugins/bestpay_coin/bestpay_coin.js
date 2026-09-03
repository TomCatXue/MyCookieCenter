/**
 * 翼支付 · 权益币与做任务秒刷助手 (Loon 响应注入型)
 * @version 1.1.0
 * @date 2026-09-03
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

  // 防短时间重复执行（1分钟内只跑一次）
  const lastRun = sessionStorage.getItem('__bestpay_last_run__');
  if (lastRun && Date.now() - parseInt(lastRun, 10) < 60000) {
    return;
  }

  // 1. 创建醒目拟态浮窗 HUD
  const hud = document.createElement('div');
  hud.id = 'bestpay_auto_hud';
  hud.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top, 44px) + 50px);left:12px;right:12px;z-index:2147483647;background:rgba(18,22,33,0.96);backdrop-filter:blur(16px);border:1.5px solid #FFD700;border-radius:14px;padding:12px 16px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,0.5);transition:all 0.3s ease;';
  hud.innerHTML = '<div style="display:flex;align-items:center;font-weight:700;color:#FFD700;margin-bottom:4px;font-size:14px;"><span style="font-size:16px;margin-right:6px;">⚡</span> 翼支付权益助手 · 正在秒刷任务...</div><div id="bestpay_hud_msg" style="color:#B0B8C4;font-size:12px;">正在连接原生容器...</div>';
  
  function updateHud(text, isDone = false) {
    const el = document.getElementById('bestpay_hud_msg');
    if (el) el.innerHTML = text;
    if (isDone) {
      setTimeout(() => {
        hud.style.opacity = '0';
        hud.style.transform = 'translateY(-20px)';
        setTimeout(() => hud.remove(), 400);
      }, 4000);
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
    sessionStorage.setItem('__bestpay_last_run__', String(Date.now()));
    await waitBridge();
    await sleep(600);

    const summary = [];

    // ==================== 1. 一键收取悬浮权益币与能量球 ====================
    updateHud('正在收取所有悬浮权益币...');
    try {
      const homeRes = await rpc('com.bestpay.marketingadapter.api.y2025.score.market.ScoreMarketService.greenEnergyHomePage', {});
      const scoreActivityNo = (homeRes && homeRes.result) ? (homeRes.result.scoreActivityNo || '') : '';
      
      if (scoreActivityNo) {
        const starQueryRes = await rpc('com.bestpay.marketingadapter.api.y2025.score.market.ScoreMarketService.starReceiveQuery', { scoreActivityNo });
        const recordList = (starQueryRes && starQueryRes.result) ? (starQueryRes.result.receiveInitSuccessRecordNoList || []) : [];
        
        if (recordList.length > 0) {
          const recvRes = await rpc('com.bestpay.marketingadapter.api.y2025.score.market.ScoreMarketService.starReceive', {
            scoreActivityNo: scoreActivityNo,
            recordList: recordList
          });
          if (recvRes && (recvRes.success || recvRes.code === '1000')) {
            summary.push('权益币全收');
          }
        }
      }
    } catch(e) {}
    await sleep(300);

    // ==================== 2. 每日签到打卡 ====================
    updateHud('正在执行每日自动签到...');
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
        summary.push('今日已签到');
      }
    } catch(e) {}
    await sleep(300);

    // ==================== 3. 开启每日宝箱 ====================
    updateHud('正在开启每日福利宝箱...');
    try {
      const boxRes = await rpc('com.bestpay.minsheng.mkt.api.money.MakeMoneyService.openTreasureBox', {});
      if (boxRes && (boxRes.success || boxRes.code === '1000')) {
        summary.push('宝箱已开');
      }
    } catch(e) {}
    await sleep(300);

    // ==================== 4. 扫描并执行任务完整状态机 ====================
    updateHud('正在扫描所有可做任务...');
    let finishCount = 0;
    try {
      // 场景 A：赚钱专区组合任务
      const comboRes = await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionOutputService.queryTheMonthTaskList', {
        channel: 'App',
        requestKey: 'NEW_LIST_KEY',
        sceneType: 'MONEYMAKINGCOMBINEDTASK'
      });
      
      // 场景 B：通用常规任务
      const normalRes = await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newQueryTheMonthTaskList', {
        channel: 'App',
        requestKey: 'NEW_LIST_KEY',
        sceneType: ''
      });

      let rawList = [];
      if (comboRes && comboRes.result && comboRes.result.missionList) {
        rawList = rawList.concat(comboRes.result.missionList);
      }
      if (normalRes && normalRes.result && normalRes.result.missionList) {
        rawList = rawList.concat(normalRes.result.missionList);
      }

      // 展平父子任务并去重
      let taskMap = new Map();
      for (const item of rawList) {
        if (!item || !item.taskNo) continue;
        taskMap.set(item.taskNo, item);
        if (item.subMissionList && Array.isArray(item.subMissionList)) {
          for (const sub of item.subMissionList) {
            if (sub && sub.taskNo) taskMap.set(sub.taskNo, sub);
          }
        }
      }

      const tasksToProcess = Array.from(taskMap.values()).filter(t => t.status !== 'FINISH');
      console.log('待处理任务总数:', tasksToProcess.length);

      for (let i = 0; i < tasksToProcess.length; i++) {
        const t = tasksToProcess[i];
        const tName = t.taskName || ('任务 ' + (i + 1));
        
        // 步骤 1：如果处于 INITIAL，必须先执行 newOpenTask 开启任务
        if (t.status === 'INITIAL') {
          updateHud('[' + (i + 1) + '/' + tasksToProcess.length + '] 开启: ' + tName);
          await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newOpenTask', {
            channel: 'App',
            taskNo: t.taskNo
          });
          await sleep(300);
        }

        // 步骤 2：如果不是已完成，发送完成浏览通知
        if (t.status !== 'DOWN') {
          updateHud('[' + (i + 1) + '/' + tasksToProcess.length + '] 秒做: ' + tName);
          await rpc('com.bestpay.redbag.product.api.y2022.mission.service.MissionTaskService.sendTaskMessAge', {
            notifyType: 'FINISH',
            missionType: t.businessType || 'MMS_MONEY_ADV',
            taskNo: t.taskNo
          });
          await sleep(350);
        }

        // 步骤 3：领取任务金币奖励
        updateHud('[' + (i + 1) + '/' + tasksToProcess.length + '] 领奖: ' + tName);
        const rewRes = await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newGetReward', {
          channel: 'App',
          taskNo: t.taskNo
        });
        if (rewRes && (rewRes.success || rewRes.code === '1000' || (rewRes.result && rewRes.result.status === 'FINISH'))) {
          finishCount++;
        }
        await sleep(300);
      }

      if (finishCount > 0) {
        summary.push('搞定 ' + finishCount + ' 个任务');
      }
    } catch(e) {
      console.log('任务处理出错:', e);
    }
    await sleep(300);

    // ==================== 5. 领取累计任务奖励 ====================
    try {
      await rpc('com.bestpay.minsheng.mkt.api.money.MakeMoneyService.receiveCumulativeTaskAward', {});
    } catch(e) {}

    // 全部执行完毕
    const resultText = summary.join(' · ') || '今日任务均已全部完成';
    updateHud('<div style="color:#00E676;font-weight:700;font-size:13px;margin-bottom:2px;">🎉 今日任务已全部秒清搞定！</div><div style="color:#D1D5DB;font-size:11px;">' + resultText + '</div>', true);

    // 触发系统通知
    fetch('https://render.bestpay.cn/__bestpay_notify__?msg=' + encodeURIComponent(resultText)).catch(() => {});

    // 如果完成了新任务，延迟 1.5 秒自动刷新一次页面展示最新到账金币与勾选状态
    if (finishCount > 0) {
      setTimeout(() => {
        window.location.reload();
      }, 1800);
    }
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

