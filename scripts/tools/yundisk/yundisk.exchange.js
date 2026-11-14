#!/usr/bin/env node
/**
 * 移动云盘商品抢兑
 * cron: 59 9,15,23 * * *（内部预热，00:00/10:00/16:00 准点首发）
 * 变量：ydyp_data / YDYP_AUTH / YDYP_EXCHANGE_PRIZES
 */

import('./ydyp.exchange.node.js').catch(error => {
  console.error(error.stack || error.message);
  if (typeof $done !== 'undefined') $done({});
});
