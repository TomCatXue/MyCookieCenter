#!/usr/bin/env node
/**
 * 移动云盘签到
 * cron: 5 8 * * *
 * 变量：ydyp_data / YDYP_AUTH
 */

import('./ydyp.node.js').catch(error => {
  console.error(error.stack || error.message);
  if (typeof $done !== 'undefined') $done({});
});
