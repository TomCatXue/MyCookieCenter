/*
------------------------------------------
@Name: 微信读书 · OnePatch 验证绕过
@Version: 1.0.0
@Desc: 注入到微信文章WebView, swizzle原生验证方法
------------------------------------------
触发: 每次打开微信文章(需先安装VIP解锁插件)
原理: OnePatch热修复框架暴露 fixMethod() 到WebView全局,
      用这个API把 validateMemberCardSummaryResponse: 改成永远返回YES
效果: 会员接口的验证被绕过, 配合HTTP字段伪造可实现完整解锁
持久: swizzle在App存活期间有效, 杀进程后需重新打开一篇文章激活
*/

var body = $response.body;

// 确保是HTML内容才注入
if (!body || (body.indexOf("<html") === -1 && body.indexOf("<body") === -1 && body.indexOf("<head") === -1)) {
    $done({});
    return;
}

var payload = "<script>(function(){" +
    // 等待OnePatch框架初始化
    "var _retry=0,_max=20;" +
    "function _patch(){" +
        // 检查API可用
        "if(typeof fixMethod==='undefined'&&typeof __fixMethod==='undefined'){" +
            "if(++_retry<_max){setTimeout(_patch,300);}" +
            "return;" +
        "}" +
        "try{" +
            // swizzle1: validateMemberCardSummaryResponse: → 始终YES
            "__fixMethod('WRVIPCardSummary','validateMemberCardSummaryResponse_',false," +
                "function(self,_cmd,response){return true;});" +
            // swizzle2: memberCardExchange 兑换验证也绕过
            "__fixMethod('WRVIPCardSummary','validateObjId_',false," +
                "function(self,_cmd,objId){return true;});" +
            // 用 __c 直接标记当前已解锁
            "var WRPayManager=require('WRPayManager');" +
            "if(WRPayManager){" +
                // 尝试直接设置过期时间为10年后
                "var far=new Date();far.setFullYear(far.getFullYear()+10);" +
                "__c(WRPayManager,'updateExpiredTime_',Math.floor(far.getTime()/1000));" +
            "}" +
            "console.log('[OnePatch] ✅ 验证绕过已生效');" +
        "}catch(e){" +
            "console.log('[OnePatch] 错误:',e.message);" +
            "if(++_retry<_max){setTimeout(_patch,500);}" +
        "}" +
    "}" +
    // 立即尝试, 如果API未就绪则延迟重试 (最多等6秒)
    "setTimeout(_patch,100);" +
"})();</script>";

// 注入到 </body> 前, 没有 body 则追加到末尾
if (body.indexOf("</body>") !== -1) {
    body = body.replace("</body>", payload + "</body>");
} else if (body.indexOf("</html>") !== -1) {
    body = body.replace("</html>", payload + "</html>");
} else {
    body += payload;
}

$done({ body: body });
