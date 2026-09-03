/**
 * 翼支付 · 权益币与做任务秒刷助手 (Loon 响应注入型)
 * @version 1.2.0
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

  // 1. 创建显眼拟态浮窗 HUD
  const hud = document.createElement('div');
  hud.id = 'bestpay_auto_hud';
  hud.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top, 44px) + 50px);left:12px;right:12px;z-index:2147483647;background:rgba(15,20,30,0.96);backdrop-filter:blur(16px);border:1.5px solid #FFD700;border-radius:14px;padding:12px 16px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,0.5);transition:all 0.3s ease;';
  hud.innerHTML = '<div style="display:flex;align-items:center;font-weight:700;color:#FFD700;margin-bottom:4px;font-size:14px;"><span style="font-size:16px;margin-right:6px;">⚡</span> 翼支付权益助手 · 正在秒刷任务...</div><div id="bestpay_hud_msg" style="color:#B0B8C4;font-size:12px;">正在连接原生容器与登录会话...</div>';
  
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

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function waitBridge() {
    return new Promise(resolve => {
      if (window.AlipayJSBridge && window.AlipayJSBridge.call) return resolve();
      document.addEventListener('AlipayJSBridgeReady', resolve, false);
      setTimeout(resolve, 2500);
    });
  }

  // 提取用户真实凭证信息
  function getAuth() {
    let sessionKey = '';
    let productNo = '';
    let ipTId = '';
    let ipRId = '';
    let appType = '45';

    try {
      const raw = localStorage.getItem('BestpayHtml5_userInfo');
      if (raw) {
        const u = JSON.parse(raw);
        sessionKey = u.sessionKey || sessionKey;
        productNo = u.productNo || productNo;
        ipTId = u.ipTId || ipTId;
        ipRId = u.ipRId || ipRId;
        appType = u.appType || appType;
      }
      const sk = localStorage.getItem('BestpayHtml5_sessionKey');
      if (sk) sessionKey = sk;
    } catch(e) {}

    if (!ipTId) {
      const m = document.cookie.match(/ipTId=([^;]+)/);
      if (m) ipTId = m[1];
    }

    return { sessionKey, productNo, ipTId, ipRId, appType };
  }

  async function waitForSession() {
    for (let i = 0; i < 15; i++) {
      const a = getAuth();
      if (a.sessionKey) return a;
      await sleep(300);
    }
    // 兜底调用桥接主动获取
    if (window.BestpayHtml5 && window.BestpayHtml5.User && window.BestpayHtml5.User.getSessionKey) {
      await new Promise(r => {
        window.BestpayHtml5.User.getSessionKey({ noAutoLogin: true }, res => {
          if (res && res.sessionKey) {
            localStorage.setItem('BestpayHtml5_sessionKey', res.sessionKey);
          }
          r();
        }, r);
      });
    }
    return getAuth();
  }

  function rpc(operationType, params = {}) {
    return new Promise((resolve) => {
      if (!window.AlipayJSBridge || !window.AlipayJSBridge.call) {
        return resolve({ success: false, error: 'no_bridge' });
      }

      const auth = getAuth();
      const mergedParams = {
        ...params,
        sessionKey: auth.sessionKey || '',
        productNo: auth.productNo || '',
        ipTId: auth.ipTId || '',
        ipRId: auth.ipRId || ''
      };

      const w = {
        "00": "8901010699000000",
        "45": "8901010699000045",
        "117": "8901010699000117",
        "116": "8901010699000116",
        "115": "8901010699000115",
        "130": "8901010699000130",
        "133": "8901010699000133"
      };

      const headers = {
        sessionKey: auth.sessionKey || '',
        authSsuCode: w[auth.appType] || '8901010699000045',
        'event-context': JSON.stringify({
          env: 'PRD',
          tntId: '0101',
          ipTId: auth.ipTId || '',
          ipRId: auth.ipRId || ''
        })
      };

      try {
        window.AlipayJSBridge.call('rpc', {
          operationType: operationType,
          requestData: [mergedParams],
          headers: headers
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
    updateHud('正在确认账号会话就绪...');
    const auth = await waitForSession();
    console.log('[翼支付助手] 当前会话状态:', auth.sessionKey ? '已获取 sessionKey' : '未获取到 sessionKey');

    const summary = [];

    // ==================== 1. 一键收取悬浮权益币与能量球 ====================
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
            summary.push('权益币全收');
          }
        } else {
          summary.push('权益币已全收');
        }
      }
    } catch(e) {}
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
        summary.push('今日已签到');
      }
    } catch(e) {}
    await sleep(350);

    // ==================== 3. 开启每日宝箱 ====================
    updateHud('正在开启每日福利宝箱...');
    try {
      const boxRes = await rpc('com.bestpay.minsheng.mkt.api.money.MakeMoneyService.openTreasureBox', {});
      if (boxRes && (boxRes.success || boxRes.code === '1000')) {
        summary.push('宝箱已开');
      }
    } catch(e) {}
    await sleep(350);

    // ==================== 4. 扫描并执行任务完整状态机 ====================
    updateHud('正在检索当月任务列表...');
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
      console.log('[翼支付助手] 待处理任务数:', tasksToProcess.length);

      for (let i = 0; i < tasksToProcess.length; i++) {
        const t = tasksToProcess[i];
        const tName = t.taskName || ('任务 ' + (i + 1));
        
        // 步骤 1：未开启任务先调用 newOpenTask
        if (t.status === 'INITIAL') {
          updateHud('[' + (i + 1) + '/' + tasksToProcess.length + '] 开启: ' + tName);
          await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newOpenTask', {
            channel: 'App',
            taskNo: t.taskNo
          });
          await sleep(300);
        }

        // 步骤 2：发送完成浏览通知
        if (t.status !== 'DOWN') {
          updateHud('[' + (i + 1) + '/' + tasksToProcess.length + '] 秒做: ' + tName);
          const sendRes = await rpc('com.bestpay.redbag.product.api.y2022.mission.service.MissionTaskService.sendTaskMessAge', {
            notifyType: 'FINISH',
            missionType: t.businessType || 'MMS_MONEY_ADV',
            taskNo: t.taskNo
          });
          console.log('[翼支付助手] sendTaskMessAge 返回:', tName, JSON.stringify(sendRes));
          await sleep(350);
        }

        // 步骤 3：领取任务金币奖励
        updateHud('[' + (i + 1) + '/' + tasksToProcess.length + '] 领奖: ' + tName);
        const rewRes = await rpc('com.bestpay.marketingadapter.api.y2024.mission.MissionService.newGetReward', {
          channel: 'App',
          taskNo: t.taskNo
        });
        console.log('[翼支付助手] newGetReward 返回:', tName, JSON.stringify(rewRes));
        
        if (rewRes && (rewRes.success || rewRes.code === '1000' || (rewRes.result && rewRes.result.status === 'FINISH'))) {
          finishCount++;
        }
        await sleep(300);
      }

      if (finishCount > 0) {
        summary.push('秒清 ' + finishCount + ' 个任务');
      }
    } catch(e) {
      console.log('[翼支付助手] 任务异常:', e);
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
