/*
------------------------------------------
@Description: 中国移动 · 页面、横幅与轮播精准净化增强脚本
@Author: Yuheng0101, anker1209, ccyykk666, sooyaaabo; 轮播净化与防VPN增强 TomCatXue
@Updated: 2026-10-22
@Version: v3.3.0
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
    var value = Object.prototype.hasOwnProperty.call(ARGUMENTS, name)
      ? ARGUMENTS[name]
      : ARGUMENT_DEFAULTS[name];
    return value === true || value === "true" || value === 1 || value === "1";
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
  if (isMyPageRequest && !enabled("MineClean")) {
    $done({});
    return;
  }

  var isRechargeRequest = /\/i\/v1\/cust\/(?:aiMainQry|iopBatchQry)\//.test(url);
  var isH5Request =
    /\/(?:DH\/(?:message_query\/message\/query\/list|myCardVoucher\/getBannerList)|DA\/(?:commonBoard\/getCommonBoard|baseServiceFunction\/getAdverList))(?:\?|$)/.test(url) ||
    /h\.app\.coc\.10086\.cn/.test(url);
  var xPen = isRechargeRequest
    ? ""
    : String(getHeader($response.headers, "x-pen"));

  if (
    (!isRechargeRequest && isH5Request && xPen !== "1") ||
    (!isRechargeRequest && !isH5Request && xPen !== "14")
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
          base64Decode(ciphertext),
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
    if (String(area.waterfall) === "1") return true;

    if (Array.isArray(area.additionInfo)) {
      for (var index = 0; index < area.additionInfo.length; index += 1) {
        var item = area.additionInfo[index];
        if (
          String(item && item.name).toLowerCase() === "waterfall" &&
          String(item && item.value) === "1"
        ) return true;
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

    var removedAreas = {
      "20250923002": true,
      "20260529002": true,
      "20260508002": true,
      "20241010002": true,
      "20250609002": true,
      "20250929002": true,
      "20241115002": true,
      "20241213006": true,
      "20241115004": true,
      "20241119002": true
    };
    var before = body.areaList.length;
    body.areaList = body.areaList.filter(function (area) {
      return (
        !removedAreas[String(area && area.areaId)] &&
        !isWaterfallArea(area)
      );
    });
    changed = body.areaList.length !== before;
    var pageNo = Number(body.lastPageNo);

    if (
      (pageNo === 1 || (body.areaList.length === 0 && pageNo > 1)) &&
      body.lastPage !== true
    ) {
      body.lastPage = true;
      changed = true;
    }

    body.areaList.forEach(function (area) {
      var areaId = String(area && area.areaId);
      if (!Array.isArray(area.moduleList)) return;

      if (areaId === "20250829002") {
        var moduleCount = area.moduleList.length;
        area.moduleList = area.moduleList.filter(function (module) {
          return String(module && module.moduleId) !== "XBYYW01";
        });
        if (area.moduleList.length !== moduleCount) changed = true;

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

      if (areaId === "20250829004") {
        area.moduleList.forEach(function (module) {
          if (String(module && module.moduleId) !== "XBAN01" || !Array.isArray(module.adverList)) return;
          var adCount = module.adverList.length;
          module.adverList = module.adverList.filter(function (adver) {
            return JSON.stringify(adver).indexOf("签到") < 0;
          });
          if (module.adverList.length !== adCount) changed = true;
        });
      }

      if (areaId === "20250829008") {
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
    if (channelId === "P00000063396") return enabled("HideTopFamily");
    if (channelId === "P00000063397") return enabled("HideTopAge");
    if (channelId === "P00000090722") return enabled("HideTopPhone");
    if (channelId === "P00000090723") return enabled("HideTopNearby");
    if (channelId === "P00000091556") return enabled("HideTopEnterprise");
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
    if (!enabled("MineClean")) return false;
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.areaList)) return false;
    var removedAreas = {
      "20260610006": true,
      "20230721008": true,
      "20230721012": true,
      "20251024002": true,
      "20230721020": true,
      "20251230002": true,
      "20240624002": true,
      "20250219002": true,
      "20230721040": true,
      "20230928004": true,
      "20240708002": true,
      "20230721034": true
    };
    var before = body.areaList.length;
    body.areaList = body.areaList.filter(function (area) {
      return !removedAreas[String(area && area.areaId)];
    });
    return body.areaList.length !== before;
  }

  function filterServicePages(payload) {
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.areaList)) return false;
    var isRemainingPage = String(body.pageCode) === "00028";

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
    var clearWaterfall = !!(
      body.waterfall &&
      waterfallFloors[String(body.waterfall.floorCode)]
    );
    if (!clearWaterfall) {
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

    var removedAreas = {
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
      removedAreas["20230621010"] = true;
      removedAreas["20230621014"] = true;
    }
    if (isRemainingPage) removedAreas["20230515019"] = true;

    var hideCarousel = enabled("HideCarousel");
    var before = body.areaList.length;
    body.areaList = body.areaList.filter(function (area) {
      if (!area) return false;
      var aid = String(area.areaId || "");
      var aname = String(area.areaName || "");
      if (removedAreas[aid]) return false;
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

      if (isRemainingPage && areaId === "20230612004") {
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

          if (isRemainingPage && areaId === "20230510013" && mid === "1392480007") {
            return false;
          }

          if (
            cid === "P00000042131" || cid === "P00000042132" ||
            cid === "P00000042133" || cid === "P00000042134" ||
            link.indexOf("broadbandBooking") >= 0 ||
            link.indexOf("MobileSmartBox") >= 0 ||
            link.indexOf("CameraWithScreen") >= 0 ||
            link.indexOf("HallFamilyFusionVerMediumhigh") >= 0 ||
            title.indexOf("办宽带") >= 0 || title.indexOf("移动智盒") >= 0 ||
            title.indexOf("带屏摄像头") >= 0 || title.indexOf("融合套餐") >= 0
          ) {
            return false;
          }
          return true;
        });
        if (module.adverList.length !== adCount) changed = true;
      });

      if (areaId === "20230515002") {
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

      if (areaId === "20230515008") {
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
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.adverList) || body.adverList.length === 0) return false;
    body.adverList = [];
    return true;
  }

  function filterRechargeCommonBoard(payload) {
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

    if (Array.isArray(body.popUpList)) {
      var popupCount = body.popUpList.length;
      body.popUpList = body.popUpList.filter(function (item) {
        return String(item && item.isAdvert) !== "1";
      });
      if (body.popUpList.length !== popupCount) changed = true;
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
