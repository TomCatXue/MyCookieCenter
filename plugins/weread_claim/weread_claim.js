/*
#!name=微信读书自动领取增强版 V2
#!desc=动态认证版，自动保存vid/skey/basever
#!author=TomCatXue

[Script]
http-request ^https:\/\/i\.weread\.qq\.com\/ script-path=weread_claim_enhanced_v2.js
cron "0 9 * * *" script-path=weread_claim_enhanced_v2.js

[MITM]
hostname = i.weread.qq.com
*/

const AUTH_KEY = "weread_auth_v2";
const API = "https://i.weread.qq.com";
const PF = "weread_wx-2001-iap-2001-iphone";

let $ = new Env("WeRead");

(async () => {
    try {
        if (typeof $request !== "undefined") {
            saveAuth();
            $done({});
            return;
        }

        await runClaim();
    } catch(e) {
        $.msg("WeRead", "执行异常", String(e));
    }

    $done({});
})();


function saveAuth() {
    let h = $request.headers || {};
    let auth = {};

    for (let k in h) {
        let key = k.toLowerCase();

        if (key === "vid") auth.vid = h[k];
        if (key === "skey") auth.skey = h[k];
        if (key === "basever") auth.basever = h[k];
        if (key === "channelid") auth.channelid = h[k];
        if (key === "user-agent") auth.ua = h[k];
    }

    if (auth.vid && auth.skey) {
        $.setdata(JSON.stringify(auth), AUTH_KEY);
        $.log("[WeRead] auth saved");
    }
}


function getAuth() {
    let data = $.getdata(AUTH_KEY);
    if (!data) return null;

    try {
        return JSON.parse(data);
    } catch(e) {
        return null;
    }
}


function getHeaders(a) {
    return {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "User-Agent": a.ua || "WeRead",
        "channelid": a.channelid || "AppStore",
        "basever": a.basever || "",
        "v": a.basever || "",
        "vid": a.vid,
        "skey": a.skey
    };
}


function encode(obj) {
    let str = JSON.stringify(obj);

    if (typeof $base64 !== "undefined") {
        return $base64.encode(str);
    }

    return str;
}


function decode(str) {
    try {
        if (typeof $base64 !== "undefined") {
            return JSON.parse($base64.decode(str));
        }

        return JSON.parse(str);
    } catch(e) {
        return null;
    }
}


function post(url, body, headers) {
    return new Promise((resolve,reject)=>{

        $httpClient.post({
            url,
            headers,
            body,
            timeout:10000
        },(err,res,data)=>{

            if(err) reject(err);
            else resolve({
                status:res.status,
                body:data
            });

        });

    });
}


async function runClaim(){

    let auth=getAuth();

    if(!auth){
        $.msg("WeRead","没有认证","请打开微信读书刷新一次");
        return;
    }


    let result=await post(
        API+"/weekly/exchange",
        encode({
            awardLevelId:0,
            unread:1,
            isExchangeAward:0,
            pf:PF,
            awardChoiceType:0
        }),
        getHeaders(auth)
    );


    if(result.status!==200){
        $.msg("WeRead","请求失败","HTTP "+result.status);
        return;
    }


    let data=decode(result.body);

    if(!data){
        $.msg("WeRead","解析失败",result.body.slice(0,100));
        return;
    }


    let awards=[];

    if(data.readtimeAwards)
        awards.push(...data.readtimeAwards);

    if(data.readdayAwards)
        awards.push(...data.readdayAwards);


    let count=0;


    for(let item of awards){

        if(item.awardStatus!==1)
            continue;


        let choices=item.awardChoices||[];

        let choice =
            choices.find(x=>x.choiceType===2 && x.canChoice===1)
            ||
            choices.find(x=>x.choiceType===1 && x.canChoice===1);


        if(!choice)
            continue;


        let r=await post(
            API+"/weekly/exchange",
            encode({
                unread:1,
                awardChoiceType:choice.choiceType,
                awardLevelId:item.awardLevelId,
                isExchangeAward:1,
                pf:PF
            }),
            getHeaders(auth)
        );


        if(r.status===200)
            count++;

    }


    $.msg("WeRead","领取完成","成功领取 "+count+" 个奖励");

}



function Env(name){

    this.name=name;

    this.getdata=function(k){

        if(typeof $persistentStore!=="undefined")
            return $persistentStore.read(k);

        if(typeof $prefs!=="undefined")
            return $prefs.valueForKey(k);

        return null;
    };


    this.setdata=function(v,k){

        if(typeof $persistentStore!=="undefined")
            return $persistentStore.write(v,k);

        if(typeof $prefs!=="undefined")
            return $prefs.setValueForKey(v,k);

        return false;
    };


    this.msg=function(t,s,b){

        if(typeof $notification!=="undefined")
            $notification.post(t,s,b);

    };


    this.log=function(){
        console.log.apply(console,arguments);
    };

}
