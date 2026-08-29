/*
------------------------------------------
@Name: B站分区接口重写
@Version: 1.0.0
@Desc: B站旧分区接口 /x/v2/channel/region/list 已 404，重写到新接口 /x/v2/region
@Author: TomCatXue
@Date: 2026-08-29

===== Loon =====
[MITM]
hostname = app.bilibili.com

[Script]
http-request ^https?://app\.bilibili\.com/x/v2/channel/region/list script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/bilibili_region/bilibili_region.js, requires-body=false, timeout=10
------------------------------------------
*/

// 旧：/x/v2/channel/region/list?access_key=xxx&...
// 新：/x/v2/region?access_key=xxx&...
// 只改路径，query 参数原样保留
const url = $request.url;
const newUrl = url.replace("/channel/region/list", "/region");
$done({ url: newUrl });
