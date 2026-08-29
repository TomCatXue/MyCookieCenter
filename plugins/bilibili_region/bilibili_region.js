/*
------------------------------------------
@Name: B站分区接口重写
@Version: 1.0.0
@Desc: B站旧分区接口 /x/v2/channel/region/list 已 404，重写到新接口 /x/v2/region
@Author: TomCatXue
@Date: 2026-08-29

Loon 配置见 bilibili_region.plugin
------------------------------------------
*/

// 旧：/x/v2/channel/region/list?access_key=xxx&...
// 新：/x/v2/region?access_key=xxx&...
// 只改路径，query 参数原样保留
const url = $request.url;
const newUrl = url.replace("/channel/region/list", "/region");
$done({ url: newUrl });
