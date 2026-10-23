/*
------------------------------------------
@Description: 中国移动 · 移动爱家全方位净化增强脚本（含首页轮播、智能爱家、发现页音视频/文章、钱包充话费、借钱与信息流）
@Author: Yuheng0101, anker1209, ccyykk666, sooyaaabo; 轮播与专区全方位净化 TomCatXue
@Updated: 2026-10-23 17:30
@Version: v1.1.2
------------------------------------------
*/
(function () {
  "use strict";

  if (
    typeof $response !== "object" ||
    Number($response.status) !== 200 ||
    !$response.body ||
    typeof $request !== "object" ||
    !$request.url
  ) {
    $done({});
    return;
  }

  var responseBody = $response.body;
  var url = String($request.url);

  var AES_KEY = "RYV0hCV1lV25KYVJ";
  var AES_IV = "VjFSQ1ZtVkQxRTlQ";
  var H5_AES_KEY = "UVic06tpXgMNiApm";
  var H5_AES_IV = "9791027341711819";
  var RECHARGE_AES_KEY = "043AOQGK6ykklyZA";

  var ARGUMENTS = {};
  if (typeof $argument === "object" && $argument !== null) {
    ARGUMENTS = $argument;
  } else if (typeof $argument === "string" && $argument.trim().length > 0) {
    try {
      ARGUMENTS = JSON.parse($argument);
    } catch (e) {
      $argument.split("&").forEach(function (pair) {
        var parts = pair.split("=");
        if (parts.length === 2) ARGUMENTS[parts[0].trim()] = parts[1].trim();
      });
    }
  }

  var ARGUMENT_DEFAULTS = {
    HideCarousel: true,
    HomeBasicClean: true,
    ServicePageClean: true,
    MineClean: true,
    WalletClean: true,
    DiscoverClean: true,
    SmartPageClean: true,
    HideTopFamily: false,
    HideTopAge: false,
    HideTopPhone: false,
    HideTopNearby: false,
    HideTopAI: false,
    HideTopEnterprise: false,
    HideMyCheckIn: false,
    HideMyMarketing: false,
    HideMyServices: false,
    HideMyFamilyCube: false,
    HideMyDevicesCube: false,
    HideMyMiniProgram: false,
    HideMyDigitalHuman: false,
    HideMySelections: false,
    HideMyGroup: false,
    HideMyRingtone: false,
    HideMyCloudDrive: false,
    HideMyToolbox: false,
    HideMyLifeServices: false
  };

  function enabled(name) {
    var val = undefined;
    if (typeof ARGUMENTS === "object" && ARGUMENTS !== null && Object.prototype.hasOwnProperty.call(ARGUMENTS, name)) {
      val = ARGUMENTS[name];
    }
    if (val === undefined && typeof $persistentStore !== "undefined" && typeof $persistentStore.read === "function") {
      val = $persistentStore.read(name);
    }
    if (val === undefined && typeof $prefs !== "undefined" && typeof $prefs.valueForKey === "function") {
      val = $prefs.valueForKey(name);
    }
    if (val === undefined) {
      val = ARGUMENT_DEFAULTS[name];
    }
    return val === true || val === "true" || val === 1 || val === "1";
  }

  var isNavigationRequest = /\/DN\/init\/getNavigation(?:\?|$)/.test(url);
  if (
    isNavigationRequest &&
    !enabled("HideTopFamily") &&
    !enabled("HideTopAge") &&
    !enabled("HideTopPhone") &&
    !enabled("HideTopNearby") &&
    !enabled("HideTopAI") &&
    !enabled("HideTopEnterprise")
  ) {
    $done({});
    return;
  }

  var isMyPageRequest = /\/DN\/myPageNew\/getMyPageNew(?:\?|$)/.test(url);
  if (
    isMyPageRequest &&
    !enabled("MineClean") &&
    !enabled("HideCarousel") &&
    !enabled("HideMyCheckIn") &&
    !enabled("HideMyMarketing") &&
    !enabled("HideMyServices") &&
    !enabled("HideMyFamilyCube") &&
    !enabled("HideMyDevicesCube") &&
    !enabled("HideMyMiniProgram") &&
    !enabled("HideMyDigitalHuman") &&
    !enabled("HideMySelections") &&
    !enabled("HideMyGroup") &&
    !enabled("HideMyRingtone") &&
    !enabled("HideMyCloudDrive") &&
    !enabled("HideMyToolbox") &&
    !enabled("HideMyLifeServices")
  ) {
    $done({});
    return;
  }

  var isRechargeRequest = /\/i\/v1\/cust\/(?:aiMainQry|iopBatchQry)\//.test(url);
  var isH5Request =
    /\/(?:DH\/(?:message_query\/message\/query\/list|myCardVoucher\/getBannerList)|DA\/(?:commonBoard\/getCommonBoard|baseServiceFunction\/getAdverList))(?:\?|$)/.test(url) ||
    /h\.app\.coc\.10086\.cn/.test(url);
  var isJfShopRequest = /app\.jf\.10086\.cn\/cmcc-h5-shop\//.test(url);
  var isMiguVideoRequest = /display-sc\.miguvideo\.com\/display\/v3\/static/.test(url);
  var isCanvasLayoutRequest = /res\.coc\.10086\.cn\/.*rightsmarket-h5-canvas.*\.layout\..*\.json/.test(url);
  var isPlaintextRequest = isJfShopRequest || isMiguVideoRequest || isCanvasLayoutRequest;

  var xPen = (isRechargeRequest || isPlaintextRequest)
    ? ""
    : String(getHeader($response.headers, "x-pen"));

  if (
    !isRechargeRequest &&
    !isPlaintextRequest &&
    ((isH5Request && xPen !== "1") || (!isH5Request && xPen !== "14"))
  ) {
    $done({});
    return;
  }

  function utf8Encode(text) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        var low = text.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
      }
    }
    return bytes;
  }

  function utf8Decode(bytes) {
    var text = "";
    for (var i = 0; i < bytes.length;) {
      var first = bytes[i++];
      var code;
      if (first < 0x80) {
        code = first;
      } else if ((first & 0xe0) === 0xc0) {
        code = ((first & 0x1f) << 6) | (bytes[i++] & 0x3f);
      } else if ((first & 0xf0) === 0xe0) {
        code = ((first & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      } else {
        code = ((first & 0x07) << 18) |
          ((bytes[i++] & 0x3f) << 12) |
          ((bytes[i++] & 0x3f) << 6) |
          (bytes[i++] & 0x3f);
      }
      if (code <= 0xffff) {
        text += String.fromCharCode(code);
      } else {
        code -= 0x10000;
        text += String.fromCharCode(0xd800 | (code >> 10), 0xdc00 | (code & 0x3ff));
      }
    }
    return text;
  }

  var BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var BASE64_DECODE = (function () {
    var map = [];
    for (var i = 0; i < 64; i++) map[BASE64.charCodeAt(i)] = i;
    return map;
  })();

  function base64Decode(text) {
    text = String(text).replace(/\s+/g, "");
    var length = text.length;
    if (!length || length % 4 !== 0) throw new Error("base64");
    var padding = text.charCodeAt(length - 1) === 61
      ? (text.charCodeAt(length - 2) === 61 ? 2 : 1)
      : 0;
    var bytes = new Array((length >>> 2) * 3 - padding);
    var output = 0;
    for (var i = 0; i < length; i += 4) {
      var c0 = BASE64_DECODE[text.charCodeAt(i)];
      var c1 = BASE64_DECODE[text.charCodeAt(i + 1)];
      var code2 = text.charCodeAt(i + 2);
      var code3 = text.charCodeAt(i + 3);
      var c2 = code2 === 61 ? 0 : BASE64_DECODE[code2];
      var c3 = code3 === 61 ? 0 : BASE64_DECODE[code3];
      if (
        c0 === undefined ||
        c1 === undefined ||
        c2 === undefined ||
        c3 === undefined
      ) throw new Error("base64");
      var value = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
      bytes[output++] = (value >>> 16) & 0xff;
      if (code2 !== 61) bytes[output++] = (value >>> 8) & 0xff;
      if (code3 !== 61) bytes[output++] = value & 0xff;
    }
    return bytes;
  }

  function base64Encode(bytes) {
    var text = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i];
      var b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      var value = (a << 16) | (b << 8) | c;
      text += BASE64.charAt((value >>> 18) & 0x3f);
      text += BASE64.charAt((value >>> 12) & 0x3f);
      text += i + 1 < bytes.length ? BASE64.charAt((value >>> 6) & 0x3f) : "=";
      text += i + 2 < bytes.length ? BASE64.charAt(value & 0x3f) : "=";
    }
    return text;
  }

  function aesCbcEncrypt(bytes, key, iv) {
    return $crypto.aes.encrypt(new Uint8Array(bytes), {
      mode: "cbc",
      key: new Uint8Array(key),
      iv: new Uint8Array(iv),
      padding: "pkcs7"
    }).ciphertext;
  }

  function aesCbcDecrypt(bytes, key, iv) {
    return $crypto.aes.decrypt(new Uint8Array(bytes), {
      mode: "cbc",
      key: new Uint8Array(key),
      iv: new Uint8Array(iv),
      padding: "pkcs7"
    });
  }

  function leftRotate(value, count) {
    return ((value << count) | (value >>> (32 - count))) >>> 0;
  }

  function md5(text) {
    var bytes = utf8Encode(text);
    var bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var low = bitLength >>> 0;
    var high = Math.floor(bitLength / 0x100000000) >>> 0;
    for (var i = 0; i < 4; i++) bytes.push((low >>> (8 * i)) & 0xff);
    for (i = 0; i < 4; i++) bytes.push((high >>> (8 * i)) & 0xff);

    var shifts = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];
    var constants = [];
    for (i = 0; i < 64; i++) constants[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;

    var a0 = 0x67452301;
    var b0 = 0xefcdab89;
    var c0 = 0x98badcfe;
    var d0 = 0x10325476;

    for (var offset = 0; offset < bytes.length; offset += 64) {
      var words = new Array(16);
      for (i = 0; i < 16; i++) {
        var at = offset + i * 4;
        words[i] = (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
      }
      var a = a0;
      var b = b0;
      var c = c0;
      var d = d0;
      for (i = 0; i < 64; i++) {
        var f;
        var g;
        if (i < 16) {
          f = (b & c) | (~b & d);
          g = i;
        } else if (i < 32) {
          f = (d & b) | (~d & c);
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          f = b ^ c ^ d;
          g = (3 * i + 5) % 16;
        } else {
          f = c ^ (b | ~d);
          g = (7 * i) % 16;
        }
        var oldD = d;
        d = c;
        c = b;
        var sum = (a + (f >>> 0) + constants[i] + words[g]) >>> 0;
        b = (b + leftRotate(sum, shifts[i])) >>> 0;
        a = oldD;
      }
      a0 = (a0 + a) >>> 0;
      b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0;
      d0 = (d0 + d) >>> 0;
    }

    function littleEndianHex(value) {
      var result = "";
      for (var i = 0; i < 4; i++) result += ("0" + ((value >>> (i * 8)) & 0xff).toString(16)).slice(-2);
      return result;
    }

    return littleEndianHex(a0) + littleEndianHex(b0) + littleEndianHex(c0) + littleEndianHex(d0);
  }

  function getHeader(headers, wanted) {
    if (!headers) return undefined;
    wanted = wanted.toLowerCase();
    for (var name in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, name) && name.toLowerCase() === wanted) return headers[name];
    }
    return undefined;
  }

  function setHeader(headers, wanted, value) {
    var lower = wanted.toLowerCase();
    for (var name in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, name) && name.toLowerCase() === lower) {
        headers[name] = value;
        return;
      }
    }
    headers[wanted] = value;
  }

  function deleteHeader(headers, wanted) {
    var lower = wanted.toLowerCase();
    for (var name in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, name) && name.toLowerCase() === lower) delete headers[name];
    }
  }

  function decryptJson(ciphertext, keyText, ivText) {
    return JSON.parse(
      utf8Decode(
        aesCbcDecrypt(
          base64Decode(String(ciphertext).replace(/\s+/g, "")),
          utf8Encode(keyText),
          utf8Encode(ivText)
        )
      )
    );
  }

  function encryptJson(payload, keyText, ivText) {
    return base64Encode(
      aesCbcEncrypt(
        utf8Encode(JSON.stringify(payload)),
        utf8Encode(keyText),
        utf8Encode(ivText)
      )
    );
  }

  function signedResult(body) {
    var nonce = getHeader($request.headers, "x-nonce");
    if (nonce === undefined || nonce === null) nonce = "";

    var headers = {};
    var originalHeaders = $response.headers || {};
    for (var name in originalHeaders) {
      if (Object.prototype.hasOwnProperty.call(originalHeaders, name)) {
        headers[name] = originalHeaders[name];
      }
    }
    if (nonce !== "") {
      setHeader(headers, "r-token", md5(String(nonce) + "+" + body));
    }
    deleteHeader(headers, "content-length");
    return { body: body, headers: headers };
  }

  function isWaterfallArea(area) {
    if (!area) return false;
    var aid = String(area.areaId || "");
    var aname = String(area.areaName || "");
    if (aid === "20251125008" || aname.indexOf("瀑布流") >= 0) return true;
    if (String(area.waterfall) === "1") return true;

    if (Array.isArray(area.additionInfo)) {
      for (var index = 0; index < area.additionInfo.length; index += 1) {
        var item = area.additionInfo[index];
        var itemKey = String(item && item.name || "").toLowerCase();
        var itemVal = String(item && item.value || "");
        if (
          itemKey.indexOf("waterfall") >= 0 &&
          (itemVal === "1" || itemVal === "")
        ) return true;
      }
    }

    if (Array.isArray(area.moduleList)) {
      for (var mIdx = 0; mIdx < area.moduleList.length; mIdx += 1) {
        var mod = area.moduleList[mIdx];
        var modId = String(mod && mod.moduleId || "").toLowerCase();
        if (modId.indexOf("waterfall") >= 0) return true;
      }
    }

    return !!(
      area.additionInfoMap &&
      String(area.additionInfoMap.waterfall) === "1"
    );
  }

  function filterHomePage(payload) {
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.areaList)) return false;
    var changed = false;

    var cleanHome = enabled("HomeBasicClean");
    var hideCarousel = enabled("HideCarousel");

    var removedAreas = {
      "20250923002": true,
      "20260529002": true,
      "20260508002": true,
      "20241010002": true,
      "20251125008": true, // 瀑布流关联tab
      "20250609002": true,
      "20250929002": true,
      "20241115002": true,
      "20241213006": true,
      "20241115004": true,
      "20241119002": true
    };
    var before = body.areaList.length;
    body.areaList = body.areaList.filter(function (area) {
      if (!area) return false;
      var aid = String(area.areaId || "");
      var aname = String(area.areaName || "");

      if (cleanHome && (removedAreas[aid] || isWaterfallArea(area))) {
        return false;
      }
      if (hideCarousel && (
        aname.indexOf("轮播") >= 0 ||
        aname.indexOf("横幅") >= 0 ||
        aname.indexOf("走马灯") >= 0 ||
        aid === "20241010002" ||
        String(area.areaType || "").toLowerCase() === "banner"
      )) {
        return false;
      }
      return true;
    });
    if (body.areaList.length !== before) changed = true;

    if (cleanHome) {
      var pageNo = Number(body.lastPageNo);
      if (
        (pageNo === 1 || (body.areaList.length === 0 && pageNo > 1)) &&
        body.lastPage !== true
      ) {
        body.lastPage = true;
        changed = true;
      }
    }

    body.areaList.forEach(function (area) {
      var areaId = String(area && area.areaId);
      if (!Array.isArray(area.moduleList)) return;

      if (cleanHome && areaId === "20250829002") {
        var moduleCount = area.moduleList.length;
        area.moduleList = area.moduleList.filter(function (module) {
          return String(module && module.moduleId) !== "XBYYW01";
        });
        if (area.moduleList.length !== moduleCount) changed = true;
      }

      if (cleanHome && areaId === "20250916002") {
        var moduleCount = area.moduleList.length;
        area.moduleList = area.moduleList.filter(function (module) {
          return !String(module && module.moduleId || "").startsWith("XBYYW");
        });
        if (area.moduleList.length !== moduleCount) changed = true;
      }

      if (areaId === "20250829002") {
        var topSwitchByTabId = {
          "1": "HideTopFamily",
          "2": "HideTopAge",
          "3": "HideTopPhone",
          "4": "HideTopNearby",
          "5": "HideTopAI",
          "6": "HideTopEnterprise"
        };
        area.moduleList.forEach(function (module) {
          if (String(module && module.moduleId) !== "XBTB01" || !Array.isArray(module.codeTableList)) return;
          var tabCount = module.codeTableList.length;
          module.codeTableList = module.codeTableList.filter(function (tab) {
            var switchName = topSwitchByTabId[String(tab && tab.tabId)];
            return !switchName || !enabled(switchName);
          });
          if (module.codeTableList.length !== tabCount) changed = true;
        });
      }

      if (cleanHome && areaId === "20250829004") {
        area.moduleList.forEach(function (module) {
          if (String(module && module.moduleId) !== "XBAN01" || !Array.isArray(module.adverList)) return;
          var adCount = module.adverList.length;
          module.adverList = module.adverList.filter(function (adver) {
            var str = JSON.stringify(adver);
            if (str.indexOf("礼包") >= 0 || str.indexOf("优惠") >= 0 || str.indexOf("推广") >= 0 || str.indexOf("活动") >= 0) return false;
            return true;
          });
          if (module.adverList.length !== adCount) changed = true;
        });
      }

      if (cleanHome && areaId === "20250829008") {
        area.moduleList.forEach(function (module) {
          if (String(module && module.moduleId) !== "XBZB01" || !Array.isArray(module.adverList)) return;
          module.adverList.forEach(function (adver) {
            if (
              String(adver && adver.cornerIsShow) !== "1" &&
              String(adver && adver.vCornerMarkShow) !== "1" &&
              !String(adver && adver.vCornerMark || "")
            ) return;
            adver.cornerIsShow = "0";
            adver.vCornerMarkShow = "0";
            adver.vCornerMark = "";
            changed = true;
          });
        });
      }
    });
    return changed;
  }

  function shouldHideTopTab(tab) {
    var channelId = String(tab && tab.channelId || "");
    var tabId = String(tab && tab.tabId || "");
    if (channelId === "P00000063396" || tabId === "1") return enabled("HideTopFamily");
    if (channelId === "P00000063397" || tabId === "2") return enabled("HideTopAge");
    if (channelId === "P00000090722" || tabId === "3") return enabled("HideTopPhone");
    if (channelId === "P00000090723" || tabId === "4") return enabled("HideTopNearby");
    if (channelId === "P00000091555" || channelId === "P00000091557" || tabId === "5") return enabled("HideTopAI");
    if (channelId === "P00000091556" || tabId === "6") return enabled("HideTopEnterprise");
    return false;
  }

  function filterNavigation(payload) {
    var body = payload && payload.rspBody;
    if (!body) return false;
    var changed = false;

    var topTabs = body.labelList && body.labelList.topTabList;
    if (Array.isArray(topTabs)) {
      var topCount = topTabs.length;
      body.labelList.topTabList = topTabs.filter(function (tab) {
        return !shouldHideTopTab(tab);
      });
      if (body.labelList.topTabList.length !== topCount) changed = true;
    }

    return changed;
  }

  function filterSearchWords(payload) {
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.searchWordList) || body.searchWordList.length === 0) return false;
    body.searchWordList = [];
    return true;
  }

  function filterMyPage(payload) {
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.areaList)) return false;

    var cleanMine = enabled("MineClean");
    var hideCarousel = enabled("HideCarousel");

    // 纯商业广告/弹窗区域（受 MineClean 控制）
    var pureAdAreas = {
      "20230721012": true, // 营销区域
      "20240206004": true, // 权益卡片新
      "20230908006": true, // 品牌入口
      "20260610006": true,
      "20250219002": true,
      "20230721040": true,
      "20230721034": true
    };

    // 13 个细分功能区域与开关映射表（受对应 HideMy* 开关控制，默认 false 不隐藏）
    var featureAreaToSwitch = {
      "20230721008": "HideMyCheckIn",       // 签到浮窗
      "20230721012": "HideMyMarketing",     // 营销区域
      "20240206004": "HideMyMarketing",     // 权益卡片新
      "20230908006": "HideMyMarketing",     // 品牌入口
      "20230721018": "HideMyServices",      // 我的服务
      "20260104006": "HideMyServices",      // 我的服务cube卡片
      "20240708002": "HideMyFamilyCube",    // 我的家庭
      "20240429006": "HideMyFamilyCube",    // 我的家庭cube卡片
      "20240528002": "HideMyFamilyCube",    // 家庭管理cube卡片
      "20251024002": "HideMyDevicesCube",   // 我的设备
      "20251016004": "HideMyDevicesCube",   // 我的设备（cubeList）
      "20260610004": "HideMyDevicesCube",   // 新通话cube卡片id
      "20231017002": "HideMyMiniProgram",   // 我的账户
      "20230721020": "HideMyDigitalHuman",  // AI智能助理
      "20230721030": "HideMySelections",    // 我的优选
      "20230721036": "HideMyGroup",         // 我的集团
      "20251230002": "HideMyRingtone",      // 我的彩铃
      "20240624002": "HideMyCloudDrive",    // 我的云盘
      "20230721044": "HideMyToolbox",       // 百宝箱
      "20230928004": "HideMyLifeServices",  // 生活服务
      "20260610008": "HideMyMarketing"      // 卡券包包
    };

    var before = body.areaList.length;
    body.areaList = body.areaList.filter(function (area) {
      if (!area) return false;
      var aid = String(area.areaId || "");
      var aname = String(area.areaName || "");

      // 1. 基础纯商业广告位清理
      if (cleanMine && pureAdAreas[aid]) {
        return false;
      }

      // 2. 轮播图/横幅清理
      if (hideCarousel && (
        aname.indexOf("轮播") >= 0 ||
        aname.indexOf("横幅") >= 0 ||
        aname.indexOf("走马灯") >= 0 ||
        String(area.areaType || "").toLowerCase() === "banner"
      )) {
        return false;
      }

      // 3. 细分功能区开关过滤（当且仅当对应开关显式开启时隐藏，关闭时完整保留）
      var sw = featureAreaToSwitch[aid];
      if (sw && enabled(sw)) {
        return false;
      }

      return true;
    });

    var cubeChanged = false;
    if (Array.isArray(body.cubeList)) {
      var cubeBefore = body.cubeList.length;
      body.cubeList.forEach(function (cube) {
        if (!cube || cube.isShow === "0") return;
        var cubeId = String(cube.areaId || "");
        var sw = featureAreaToSwitch[cubeId];
        if (sw && enabled(sw) && cube.isShow !== "0") {
          cube.isShow = "0";
          cubeChanged = true;
        }
      });
      if (body.cubeList.length !== cubeBefore) cubeChanged = true;
    }

    return body.areaList.length !== before || cubeChanged;
  }

  function filterServicePages(payload) {
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.areaList)) return false;
    var isRemainingPage = String(body.pageCode) === "00028";

    var cleanService = enabled("ServicePageClean");
    var hideCarousel = enabled("HideCarousel");

    var waterfallAreas = {
      "20260320004": true,
      "20260320008": true,
      "20260320012": true,
      "20260320016": true,
      "20260320020": true
    };
    var waterfallFloors = {
      "20260320006": true,
      "20260320010": true,
      "20260320014": true,
      "20260320018": true,
      "20260320022": true
    };
    var clearWaterfall = cleanService && !!(
      body.waterfall &&
      waterfallFloors[String(body.waterfall.floorCode)]
    );
    if (cleanService && !clearWaterfall) {
      for (var areaIndex = 0; areaIndex < body.areaList.length; areaIndex += 1) {
        var areaId = String(
          body.areaList[areaIndex] && body.areaList[areaIndex].areaId
        );
        if (waterfallAreas[areaId]) {
          clearWaterfall = true;
          break;
        }
      }
    }

    var serviceAdAreas = {
      "20230515006": true,
      "20230609002": true,
      "20230515007": true,
      "20230621006": true,
      "20230621022": true,
      "20230621026": true,
      "20230621030": true,
      "20230515017": true,
      "20230515018": true,
      "20230719002": true,
      "20240513002": true,
      "20230719004": true,
      "20260320004": true,
      "20260320008": true,
      "20260320012": true,
      "20260320016": true,
      "20260320020": true
    };
    if (enabled("MineClean")) {
      serviceAdAreas["20230621010"] = true;
      serviceAdAreas["20230621014"] = true;
    }
    if (isRemainingPage) serviceAdAreas["20230515019"] = true;

    var before = body.areaList.length;
    body.areaList = body.areaList.filter(function (area) {
      if (!area) return false;
      var aid = String(area.areaId || "");
      var aname = String(area.areaName || "");

      // 1. 专区基础广告位清理
      if (cleanService && serviceAdAreas[aid]) {
        return false;
      }

      // 2. 轮播图/横幅/走马灯清理（受 HideCarousel 轮播总开关控制）
      if (hideCarousel && (
        aname.indexOf("轮播") >= 0 ||
        aname.indexOf("横幅") >= 0 ||
        aname.indexOf("走马灯") >= 0 ||
        String(area.areaType || "").toLowerCase() === "banner"
      )) {
        return false;
      }
      return true;
    });
    var changed = body.areaList.length !== before;

    if (
      clearWaterfall &&
      body.waterfall !== null &&
      body.waterfall !== undefined
    ) {
      body.waterfall = null;
      changed = true;
    }

    body.areaList.forEach(function (area) {
      if (!Array.isArray(area && area.moduleList)) return;
      var areaId = String(area.areaId);

      if (cleanService && isRemainingPage && areaId === "20230612004") {
        var bottomCount = area.moduleList.length;
        area.moduleList = area.moduleList.filter(function (module) {
          return String(module && module.moduleId) !== "market-button-2-001";
        });
        if (area.moduleList.length !== bottomCount) changed = true;
      }

      area.moduleList.forEach(function (module) {
        if (!Array.isArray(module && module.adverList)) return;
        var adCount = module.adverList.length;
        module.adverList = module.adverList.filter(function (adver) {
          if (!adver) return false;
          var mid = String(adver.markId || "");
          var cid = String(adver.channelId || "");
          var link = String(adver.linkUrl || "");
          var title = String(adver.advTitle || "");

          if (cleanService && isRemainingPage && areaId === "20230510013" && mid === "1392480007") {
            return false;
          }

          // 四大目标推广广告过滤（归属 HideCarousel 轮播总开关统一控制）
          if (hideCarousel && (
            cid === "P00000042131" || cid === "P00000042132" ||
            cid === "P00000042133" || cid === "P00000042134" ||
            link.indexOf("broadbandBooking") >= 0 ||
            link.indexOf("MobileSmartBox") >= 0 ||
            link.indexOf("CameraWithScreen") >= 0 ||
            link.indexOf("HallFamilyFusionVerMediumhigh") >= 0 ||
            title.indexOf("办宽带") >= 0 || title.indexOf("移动智盒") >= 0 ||
            title.indexOf("带屏摄像头") >= 0 || title.indexOf("融合套餐") >= 0
          )) {
            return false;
          }
          return true;
        });
        if (module.adverList.length !== adCount) changed = true;
      });

      if (cleanService && areaId === "20230515002") {
        area.moduleList.forEach(function (module) {
          if (!Array.isArray(module && module.adverList)) return;
          var adCount = module.adverList.length;
          module.adverList = module.adverList.filter(function (adver) {
            return (
              String(adver && adver.markId) !== "1066197397" &&
              String(adver && adver.vSubject2) !== "领取本月红包"
            );
          });
          if (module.adverList.length !== adCount) changed = true;
        });
      }

      if (cleanService && areaId === "20230515008") {
        var moduleCount = area.moduleList.length;
        area.moduleList.forEach(function (module) {
          if (!Array.isArray(module && module.adverList)) return;
          var adCount = module.adverList.length;
          module.adverList = module.adverList.filter(function (adver) {
            return String(adver && adver.markId) !== "1535899052";
          });
          if (module.adverList.length !== adCount) changed = true;
        });
        area.moduleList = area.moduleList.filter(function (module) {
          return (
            String(module && module.moduleId) !== "market-banner-1-001" &&
            (!Array.isArray(module && module.adverList) || module.adverList.length > 0)
          );
        });
        if (area.moduleList.length !== moduleCount) changed = true;
      }
    });

    return changed;
  }

  function filterMessageRecommendations(payload) {
    var body = payload && payload.rspBody;
    if (!body || typeof body !== "object") return false;
    var changed = false;

    for (var category in body) {
      if (!Object.prototype.hasOwnProperty.call(body, category) || !Array.isArray(body[category])) continue;
      var before = body[category].length;
      body[category] = body[category].filter(function (message) {
        return String(message && message.messageId) !== "1541887004";
      });
      if (body[category].length !== before) changed = true;
    }

    return changed;
  }

  function filterCouponRecommendations(payload) {
    if (!enabled("HideCarousel")) return false;
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.adverList) || body.adverList.length === 0) return false;
    body.adverList = [];
    return true;
  }

  function filterRechargeCommonBoard(payload) {
    if (!enabled("HideCarousel")) return false;
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.commonBoardDbList)) return false;
    var before = body.commonBoardDbList.length;
    body.commonBoardDbList = body.commonBoardDbList.filter(function (item) {
      return String(item && item.advLocation) !== "1";
    });
    return body.commonBoardDbList.length !== before;
  }

  function filterRechargePage(url, payload) {
    if (/\/i\/v1\/cust\/aiMainQry\//.test(url)) {
      if (!payload || String(payload.showFlag) === "0") return false;
      payload.showFlag = "0";
      return true;
    }

    if (/\/i\/v1\/cust\/iopBatchQry\//.test(url)) {
      if (
        !payload ||
        !Array.isArray(payload.specialOfferZone) ||
        payload.specialOfferZone.length === 0
      ) return false;
      payload.specialOfferZone = [];
      return true;
    }

    return false;
  }

  function filterTitleBar(payload) {
    if (!enabled("SmartPageClean") && !enabled("HideCarousel")) return false;
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.areaList)) return false;
    var changed = false;

    body.areaList.forEach(function (area) {
      if (!Array.isArray(area && area.moduleList)) return;
      area.moduleList.forEach(function (module) {
        if (String(module && module.moduleId) === "title_icon" && Array.isArray(module.adverList) && module.adverList.length > 0) {
          module.adverList = [];
          changed = true;
        }
      });
    });

    return changed;
  }

  function filterJfShop(url, payload) {
    if (!enabled("WalletClean")) return false;
    if (!payload || typeof payload !== "object") return false;
    var changed = false;

    if (/\/cmcc-h5-shop\/cms\/contents(?:\?|$)/.test(url)) {
      var list = payload.resultJson;
      var isStr = false;
      if (typeof list === "string") {
        try {
          list = JSON.parse(list);
          isStr = true;
        } catch (e) {}
      }
      if (Array.isArray(list)) {
        var beforeLen = list.length;
        list = list.filter(function (m) {
          var mid = Number(m && m.moduleId);
          return mid === 2000000000001185 || mid === 2000000000001062;
        });
        if (list.length !== beforeLen) {
          payload.resultJson = isStr ? JSON.stringify(list) : list;
          changed = true;
        }
      }
    }

    if (/\/cmcc-h5-shop\/hePay\/all(?:\?|$)/.test(url)) {
      var rj = payload.resultJson;
      var isStrRj = false;
      if (typeof rj === "string") {
        try {
          rj = JSON.parse(rj);
          isStrRj = true;
        } catch (e) {}
      }
      if (rj && typeof rj === "object") {
        if (rj.heBaoWallet !== null || rj.digitalAsset !== null) {
          rj.heBaoWallet = null;
          rj.digitalAsset = null;
          payload.resultJson = isStrRj ? JSON.stringify(rj) : rj;
          changed = true;
        }
      }
    }

    if (/\/cmcc-h5-shop\/cms\/yourFavorite(?:\?|$)/.test(url)) {
      var fav = payload.resultJson;
      var isStrFav = false;
      if (typeof fav === "string") {
        try {
          fav = JSON.parse(fav);
          isStrFav = true;
        } catch (e) {}
      }
      if (fav && fav.pageResult && Array.isArray(fav.pageResult.pageData)) {
        if (fav.pageResult.pageData.length > 0) {
          fav.pageResult.pageData = [];
          fav.pageResult.count = 0;
          fav.pageResult.pageCount = 0;
          payload.resultJson = isStrFav ? JSON.stringify(fav) : fav;
          changed = true;
        }
      }
    }

    return changed;
  }

  function filterMiguVideo(payload) {
    if (!enabled("DiscoverClean")) return false;
    if (!payload || typeof payload !== "object") return false;
    var changed = false;
    if (payload.body && typeof payload.body === "object") {
      if (Array.isArray(payload.body.groups) && payload.body.groups.length > 0) {
        payload.body.groups = [];
        changed = true;
      }
      if (Array.isArray(payload.body.data) && payload.body.data.length > 0) {
        payload.body.data = [];
        changed = true;
      }
    }
    return changed;
  }

  function filterCanvasLayout(payload) {
    if (!enabled("SmartPageClean") && !enabled("HideCarousel")) return false;
    if (!payload || !Array.isArray(payload.instanceList)) return false;
    var changed = false;

    var filterCarousel = enabled("HideCarousel");
    var filterSmart = enabled("SmartPageClean");

    var beforeRows = payload.instanceList.length;
    payload.instanceList = payload.instanceList.map(function (row) {
      if (!Array.isArray(row)) return row;
      return row.filter(function (sub) {
        var inst = sub && sub.instance;
        var name = String(inst && inst.name || "");

        if (filterCarousel && (
          name.indexOf("SwiperComp") >= 0 ||
          name.indexOf("LeaderboardEntrComp") >= 0
        )) {
          return false;
        }

        if (filterSmart && (
          name.indexOf("FloatingPicComp") >= 0 ||
          name.indexOf("FloatComp") >= 0 ||
          name.indexOf("DialogComp") >= 0 ||
          name.indexOf("CTOPDialogComp") >= 0
        )) {
          return false;
        }

        return true;
      });
    }).filter(function (row) {
      return Array.isArray(row) && row.length > 0;
    });

    if (payload.instanceList.length !== beforeRows) changed = true;
    return changed;
  }

  function filterAggregationData(payload) {
    var body = payload && payload.rspBody;
    if (!body) return false;
    var changed = false;

    if (Object.prototype.hasOwnProperty.call(body, "topPullSecond")) {
      delete body.topPullSecond;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, "notSufficientFundsAdver")) {
      delete body.notSufficientFundsAdver;
      changed = true;
    }

    // 彻底清空所有开屏弹窗与浮层广告（包含 isAdvert=0 的“幸运三日签”等各类商业活动弹窗）
    if (Array.isArray(body.popUpList) && body.popUpList.length > 0) {
      body.popUpList = [];
      changed = true;
    }

    // 彻底清空开屏全屏抽屉广告 (drawerOpens)
    if (Array.isArray(body.drawerOpens) && body.drawerOpens.length > 0) {
      body.drawerOpens = [];
      changed = true;
    }

    if (body.englishPop && Object.keys(body.englishPop).length > 0) {
      body.englishPop = {};
      changed = true;
    }

    if (body.cardPopup && Object.keys(body.cardPopup).length > 0) {
      body.cardPopup = {};
      changed = true;
    }
    if (body.cardReminderPopup && Object.keys(body.cardReminderPopup).length > 0) {
      body.cardReminderPopup = {};
      changed = true;
    }
    if (body.clipboardPop && Object.keys(body.clipboardPop).length > 0) {
      body.clipboardPop = {};
      changed = true;
    }
    if (body.iopBirthdayPopup && Object.keys(body.iopBirthdayPopup).length > 0) {
      body.iopBirthdayPopup = {};
      changed = true;
    }
    if (body.iopBridalGiftPopup && Object.keys(body.iopBridalGiftPopup).length > 0) {
      body.iopBridalGiftPopup = {};
      changed = true;
    }
    if (body.cardAdvers && Array.isArray(body.cardAdvers.dataList) && body.cardAdvers.dataList.length > 0) {
      body.cardAdvers.dataList = [];
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, "suspensionAdver")) {
      delete body.suspensionAdver;
      changed = true;
    }

    var provinceConfig = body.provinceCodeChanage;
    if (provinceConfig && Array.isArray(provinceConfig.areaList)) {
      provinceConfig.areaList.forEach(function (area) {
        if (!Array.isArray(area.moduleList)) return;
        area.moduleList.forEach(function (module) {
          if (!Array.isArray(module.adverList)) return;
          var before = module.adverList.length;
          module.adverList = module.adverList.filter(function (adver) {
            return JSON.stringify(adver).indexOf("签到") < 0;
          });
          if (module.adverList.length !== before) changed = true;
        });
      });
    }

    return changed;
  }

  try {
    if (isPlaintextRequest) {
      var plainJson;
      try {
        plainJson = JSON.parse(responseBody);
      } catch (e) {
        $done({});
        return;
      }
      var plainChanged = false;
      if (isJfShopRequest) {
        plainChanged = filterJfShop(url, plainJson);
      } else if (isMiguVideoRequest) {
        plainChanged = filterMiguVideo(plainJson);
      } else if (isCanvasLayoutRequest) {
        plainChanged = filterCanvasLayout(plainJson);
      }
      if (!plainChanged) {
        $done({});
        return;
      }
      $done({ body: JSON.stringify(plainJson) });
      return;
    }

    if (isRechargeRequest) {
      var rechargeEnvelope = JSON.parse(responseBody);
      var rechargeOutParam =
        rechargeEnvelope &&
        rechargeEnvelope.data &&
        rechargeEnvelope.data.outParam;
      if (typeof rechargeOutParam !== "string" || rechargeOutParam === "") {
        $done({});
        return;
      }

      var rechargeCiphertext = utf8Decode(
        base64Decode(rechargeOutParam.replace(/\s/g, ""))
      ).replace(/\s/g, "");
      var rechargePayload = decryptJson(
        rechargeCiphertext,
        RECHARGE_AES_KEY,
        RECHARGE_AES_KEY
      );
      if (!filterRechargePage(url, rechargePayload)) {
        $done({});
        return;
      }

      rechargeEnvelope.data.outParam = base64Encode(
        utf8Encode(
          encryptJson(
            rechargePayload,
            RECHARGE_AES_KEY,
            RECHARGE_AES_KEY
          )
        )
      );
      $done({ body: JSON.stringify(rechargeEnvelope) });
      return;
    }

    if (isH5Request) {
      var messageEnvelope = JSON.parse(responseBody);
      if (!messageEnvelope || typeof messageEnvelope.body !== "string") {
        $done({});
        return;
      }

      var messagePayload = decryptJson(
        messageEnvelope.body,
        H5_AES_KEY,
        H5_AES_IV
      );
      var h5Changed = false;
      if (/\/DH\/myCardVoucher\/getBannerList(?:\?|$)/.test(url)) {
        h5Changed = filterCouponRecommendations(messagePayload);
      } else if (/\/DA\/commonBoard\/getCommonBoard(?:\?|$)/.test(url)) {
        h5Changed = filterRechargeCommonBoard(messagePayload);
      } else if (/\/DA\/baseServiceFunction\/getAdverList(?:\?|$)/.test(url)) {
        h5Changed = filterServicePages(messagePayload);
      } else {
        h5Changed = filterMessageRecommendations(messagePayload);
      }
      if (!h5Changed) {
        $done({});
        return;
      }

      messageEnvelope.body = encryptJson(
        messagePayload,
        H5_AES_KEY,
        H5_AES_IV
      );
      var messageBody = JSON.stringify(messageEnvelope);
      $done(signedResult(messageBody));
      return;
    }

    var declaredLength = parseInt(getHeader($response.headers, "content-length"), 10);
    if (declaredLength > 0 && declaredLength < responseBody.length) {
      responseBody = responseBody.slice(0, declaredLength);
    }
    responseBody = responseBody.replace(/\s+/g, "");

    var payload = decryptJson(responseBody, AES_KEY, AES_IV);
    var changed = false;

    if (/\/DN\/homePage\/getTopAreaList(?:\?|$)/.test(url)) {
      changed = filterHomePage(payload);
    } else if (/\/DN\/myPageNew\/getMyPageNew(?:\?|$)/.test(url)) {
      changed = filterMyPage(payload);
    } else if (/\/DN\/multipleInterfaces\/aggregationData(?:\?|$)/.test(url)) {
      changed = filterAggregationData(payload);
    } else if (/\/DN\/init\/getNavigation(?:\?|$)/.test(url)) {
      changed = filterNavigation(payload);
    } else if (/\/DN\/searchWord\/getSearchWordInfo(?:\?|$)/.test(url)) {
      changed = filterSearchWords(payload);
    } else if (/\/DA\/baseServiceFunction\/getAdverList(?:\?|$)/.test(url)) {
      changed = filterServicePages(payload);
    } else if (/\/DN\/titleBar\/getIcon(?:\?|$)/.test(url)) {
      changed = filterTitleBar(payload);
    }

    if (!changed) {
      $done({});
      return;
    }

    $done(signedResult(encryptJson(payload, AES_KEY, AES_IV)));
  } catch (error) {
    $done({});
  }
})();
