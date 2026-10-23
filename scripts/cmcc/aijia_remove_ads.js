/*
------------------------------------------
@Description: 移动爱家 · 全方位去广告与界面纯净增强脚本
@Author: TomCatXue
@Updated: 2026-10-23 18:20
@Version: v1.0.8
------------------------------------------
*/
(function () {
  "use strict";

  // 1. 请求阶段：针对 H5 画布与模板，剥离缓存协商头，强制服务端返回完整 200 响应体（彻底根除 304 缓存穿透）
  if (typeof $response === "undefined") {
    if (typeof $request === "object" && $request.headers) {
      deleteHeader($request.headers, "if-none-match");
      deleteHeader($request.headers, "if-modified-since");
      deleteHeader($request.headers, "If-None-Match");
      deleteHeader($request.headers, "If-Modified-Since");
      $done({ headers: $request.headers });
      return;
    }
    $done({});
    return;
  }

  // 2. 响应阶段基础校验
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

  // 移动网关 AES 加密凭证
  var AES_KEY = "RYV0hCV1lV25KYVJ";
  var AES_IV = "VjFSQ1ZtVkQxRTlQ";

  // 参数解析
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
    LaunchAdClean: true,
    HomeClean: true,
    SmartPageClean: true,
    DiscoverClean: true,
    WalletClean: true,
    MineClean: true
  };

  function enabled(name) {
    var value = Object.prototype.hasOwnProperty.call(ARGUMENTS, name)
      ? ARGUMENTS[name]
      : ARGUMENT_DEFAULTS[name];
    return value === true || value === "true" || value === 1 || value === "1";
  }

  // 请求类型识别
  var isJfShopRequest = /app\.jf\.10086\.cn\/cmcc-h5-shop\//.test(url);
  var isJfAdRequest = /app\.jf\.10086\.cn\/cmcc-h5-shop\/cms\/(?:advertisePosition|advertisePage|globalIcon)(?:\?|$)/.test(url);
  var isMiguVideoRequest = /display-sc\.miguvideo\.com\/display\/v3\/static/.test(url);
  var isCanvasLayoutRequest = /res\.coc\.10086\.cn\/.*rightsmarket-h5-canvas.*\.layout\..*\.json/.test(url);
  var isKomectVideoRequest = /video\.komect\.com\/camera\/core\/api\/bind\/queryList/.test(url);
  var isHjqShopLayout = /shop\.hjq\.komect\.com\/hjqmall\/layout\/index\//.test(url);
  var isHjqBannerRequest = /(?:base\.hjq\.komect\.com\/(?:base\/idx\/getBannerContentList|keel\/idx\/getTabBannerList|hjq-prov\/api\/provApply\/homepage\/getBannerList)|base\/idx\/getBannerContentList)/.test(url);
  var isHjqContentRequest = /(?:base\.hjq\.komect\.com\/)?(?:idx\/(?:getHomePageList|getFrameList|getPlaceList|getTabContentList)|keel\/idx\/getAfLiveCardList|base\/deviceidx\/getDeviceContentList)/.test(url);
  var isUmpLaunchRequest = /\/admsg\/v2\/launch(?:\?|$)/i.test(url);
  var isHebaoPayAdRequest = /p\.10086\.cn\/wap\/v1\/(?:polymeriza-page\/(?:banner|popup|activity|business|group-cards|many-cards|marquee)|float\/window|guess\/shop|page-position\/query)(?:\?|$)/.test(url);
  var isPlaintextRequest = isJfShopRequest || isMiguVideoRequest || isCanvasLayoutRequest || isKomectVideoRequest || isHjqShopLayout || isHjqBannerRequest || isHjqContentRequest || isUmpLaunchRequest || isJfAdRequest || isHebaoPayAdRequest;

  // 严格安全校验：原生接口必须带 x-pen=14；明文 H5 接口按域名放行。
  var isNativeEncryptedRequest = /(?:client|apm)\.app\.coc\.10086\.cn\/biz-orange\/DN\//.test(url);
  var xPen = String(getHeader($response.headers, "x-pen"));
  if (isNativeEncryptedRequest && xPen !== "14") {
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

  // ==================== 1. 首页最上方轮播图与运营位净化 ====================
  function filterHomePage(payload) {
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.areaList)) return false;
    var changed = false;

    var cleanHome = enabled("HomeClean");
    var hideCarousel = enabled("HideCarousel");

    var removedAreas = {
      "20241010002": true, // 首页横幅轮播区
      "20250923002": true,
      "20260529002": true,
      "20260508002": true,
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

      // 顶部页签运营位（XBYYW01）
      if (cleanHome && areaId === "20250829002") {
        var moduleCount = area.moduleList.length;
        area.moduleList = area.moduleList.filter(function (module) {
          return String(module && module.moduleId) !== "XBYYW01" && String(module && module.moduleId) !== "XBYYW02";
        });
        if (area.moduleList.length !== moduleCount) changed = true;
      }

      // 等级条横幅运营位（XBYYW02 - AI优选专区）
      if (cleanHome && areaId === "20250916002") {
        var modCount = area.moduleList.length;
        area.moduleList = area.moduleList.filter(function (module) {
          return !String(module && module.moduleId || "").startsWith("XBYYW");
        });
        if (area.moduleList.length !== modCount) changed = true;
      }

      // 问候语签到广告
      if (cleanHome && areaId === "20250829004") {
        area.moduleList.forEach(function (module) {
          if (String(module && module.moduleId) !== "XBAN01" || !Array.isArray(module.adverList)) return;
          var adCount = module.adverList.length;
          module.adverList = module.adverList.filter(function (adver) {
            return JSON.stringify(adver).indexOf("签到") < 0;
          });
          if (module.adverList.length !== adCount) changed = true;
        });
      }

      // 中部 icon 角标
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

  // ==================== 2. 智能页面右上角广告净化 ====================
  function filterTitleBar(payload) {
    if (!enabled("SmartPageClean") && !enabled("HideCarousel")) return false;
    var body = payload && payload.rspBody;
    if (!body || typeof body !== "object") return false;
    var changed = false;

    function cleanAreas(areaList) {
      if (!Array.isArray(areaList)) return;
      areaList.forEach(function (area) {
        if (!Array.isArray(area && area.moduleList)) return;
        area.moduleList.forEach(function (module) {
          if (String(module && module.moduleId) === "title_icon" && Array.isArray(module.adverList) && module.adverList.length > 0) {
            module.adverList.splice(0, module.adverList.length);
            changed = true;
          }
        });
      });
    }

    cleanAreas(body.areaList);
    cleanAreas(body.topAreaList);
    cleanAreas(body.iconList);
    cleanAreas(body.dataList);
    if (body.data && typeof body.data === "object") {
      cleanAreas(body.data.areaList);
      cleanAreas(body.data.topAreaList);
      cleanAreas(body.data.iconList);
    }

    return changed;
  }

  // ==================== 3. 移动爱家 / 智能专区 H5 画布布局净化 ====================
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

        // 轮播图组件与排行榜轮播大图
        if (filterCarousel && (
          name.indexOf("SwiperComp") >= 0 ||
          name.indexOf("LeaderboardEntrComp") >= 0
        )) {
          return false;
        }

        // 浮层图片、悬浮动效、营销触点弹窗与常规弹窗
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

  // ==================== 4. 发现页短视频与新闻资讯文章流净化 ====================
  function filterMiguVideo(payload) {
    if (!enabled("DiscoverClean")) return false;
    if (!payload || typeof payload !== "object") return false;
    var changed = false;
    var body = payload.body;
    if (payload.body && typeof payload.body === "object") {
      // 组件型响应里的 body.data 是资讯/视频卡片本身，不应清空；整页内容才清空 groups。
      if (
        !Array.isArray(payload.body.groups) &&
        !Array.isArray(payload.body.data)
      ) {
        return false;
      }
    }
    // 页面结构下按组件类型移除焦点大图，保留导航与普通内容。
    if (body && Array.isArray(body.groups)) {
      body.groups.forEach(function (group) {
        if (!group || !Array.isArray(group.components)) return;
        var before = group.components.length;
        var kept = group.components.filter(function (component) {
          return String(component && component.compType) !== "BIG_CAROUSEL_IMG";
        });
        if (kept.length !== before) {
          group.components.splice.apply(group.components, [0, group.components.length].concat(kept));
          changed = true;
        }
      });
    }
    return changed;
  }

  // ==================== 4.1 移动爱家设备列表与摄像头中心推广横幅清理 ====================
  function filterKomectVideo(payload) {
    if (!enabled("HomeClean") && !enabled("HideCarousel")) return false;
    if (!payload || typeof payload !== "object") return false;
    var changed = false;
    if (Array.isArray(payload.configArray) && payload.configArray.length > 0) {
      payload.configArray = [];
      changed = true;
    }
    return changed;
  }

  // ==================== 4.2 移动爱家商城首页布局净化（保留Icon功能入口，移除视频/引流/瀑布流） ====================
  function filterHjqShopLayout(url, payload) {
    if (!enabled("HomeClean") && !enabled("HideCarousel")) return false;
    if (!payload || typeof payload !== "object") return false;
    var changed = false;

    if (/\/hjqmall\/layout\/index\/content(?:\?|$)/.test(url)) {
      if (Array.isArray(payload.data)) {
        var beforeLen = payload.data.length;
        payload.data = payload.data.filter(function (item) {
          var pattern = String(item && item.patternCode);
          var title = String(item && item.titleLeftText);
          // 保留首页 Icon 入口与服务宫格，仅移除轮播、视频、瀑布流与纯营销楼层。
          if (pattern === "p002") return true;
          if (enabled("HomeClean") && pattern === "p121") {
            return title.indexOf("视频") < 0 && title.indexOf("影音") < 0;
          }
          if (pattern === "p121") return true;
          return false;
        });
        if (payload.data.length !== beforeLen) changed = true;
      }
    }

    if (/\/hjqmall\/layout\/index\/frame(?:\?|$)/.test(url)) {
      if (payload.data && Array.isArray(payload.data.frameList)) {
        var beforeFrameLen = payload.data.frameList.length;
        payload.data.frameList = payload.data.frameList.filter(function (item) {
          var pattern = String(item && item.patternCode);
          var title = String(item && item.titleLeftText);
          if (pattern === "p002") return true;
          if (enabled("HomeClean") && pattern === "p121") {
            return title.indexOf("视频") < 0 && title.indexOf("影音") < 0;
          }
          if (pattern === "p121") return true;
          return false;
        });
        if (payload.data.frameList.length !== beforeFrameLen) changed = true;
      }
    }

    return changed;
  }

  // ==================== 4.3 和家亲原生 Banner / 首页楼层清洗 ====================
  function filterHjqBanner(url, payload) {
    if (!enabled("HideCarousel")) return false;
    if (payload === null || payload === undefined) return false;
    var changed = false;

    function stripList(root, key) {
      if (!root || typeof root !== "object") return;
      if (!Array.isArray(root[key])) return;
      if (root[key].length === 0) return;
      root[key] = [];
      changed = true;
    }

    function walk(value, depth) {
      if (depth > 8 || value === null || value === undefined) return;
      if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i += 1) walk(value[i], depth + 1);
        return;
      }
      if (typeof value !== "object") return;
      stripList(value, "bannerList");
      stripList(value, "bannerContentList");
      stripList(value, "bannerInfoList");
      stripList(value, "topRecommendList");
      stripList(value, "operationFloatList");
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (
          key === "bannerList" ||
          key === "bannerContentList" ||
          key === "bannerInfoList" ||
          key === "topRecommendList" ||
          key === "operationFloatList"
        ) continue;
        walk(value[key], depth + 1);
      }
    }

    walk(payload, 0);

    // 楼层内容兜底：若返回的是 tab 内容，仅保留非营销类型的 pattern
    if (enabled("HomeClean") && /idx\/getTabContentList/.test(url)) {
      var dropPatterns = {
        pattern11: true,
        pattern58: true,
        pattern100: true,
        pattern112: true,
        pattern137: true,
        pattern163: true,
        pattern170: true,
        pattern200: true,
        pattern201: true,
        patternAIHomeBanner: true,
        patternGuangDianTong: true
      };
      function filterFrames(list) {
        if (!Array.isArray(list)) return false;
        var before = list.length;
        var kept = list.filter(function (item) {
          var p = String(item && (item.pattern || item.patternCode) || "");
          return !dropPatterns[p];
        });
        if (kept.length !== before) {
          changed = true;
          list.splice.apply(list, [0, list.length].concat(kept));
        }
        return kept.length !== before;
      }
      if (payload.data) {
        filterFrames(payload.data);
        if (payload.data && Array.isArray(payload.data.frameList)) filterFrames(payload.data.frameList);
        if (payload.data && Array.isArray(payload.data.placeList)) filterFrames(payload.data.placeList);
      }
      if (Array.isArray(payload)) filterFrames(payload);
    }

    // getBannerContentList 若直接返回数组，用原位清空保证调用方可见。
    if (Array.isArray(payload) && !/idx\/getTabContentList/.test(url)) {
      if (payload.length > 0) {
        payload.splice(0, payload.length);
        changed = true;
      }
    }

    return changed;
  }

  // ==================== 4.4 友盟 U-Push 启动广告清洗（admsg/v2/launch） ====================
  function filterUmpLaunch(payload) {
    if (!enabled("HideCarousel") || !enabled("LaunchAdClean")) return false;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    var changed = false;
    var directKeys = ["launch", "launchList", "launchMsgList", "adList", "msgList"];

    function clearArray(root, key) {
      if (
        root &&
        typeof root === "object" &&
        Array.isArray(root[key]) &&
        root[key].length > 0
      ) {
        root[key].splice(0, root[key].length);
        changed = true;
      }
    }

    directKeys.forEach(function (key) {
      clearArray(payload, key);
    });

    // 部分版本将启动广告包装在 data 内；只清理明确命名的广告数组，不清空通用 data。
    if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
      directKeys.forEach(function (key) {
        clearArray(payload.data, key);
      });
    }

    return changed;
  }

  // ==================== 5. 我的钱包 / 充话费下方所有模块净化 ====================
  function filterJfShop(url, payload) {
    if (!enabled("WalletClean")) return false;
    if (!payload || typeof payload !== "object") return false;
    var changed = false;

    // 1. /cmcc-h5-shop/cms/contents: 充话费下方全部模块（轮播图、端AI推荐、爆品必抢、会员优享卡片、公告、猜你喜欢、弹窗、话费广告位）
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
        // 只保留十宫格功能入口（2000000000001185），剔除轮播、推荐、公告、会员卡片与话费广告位。
        list = list.filter(function (m) {
          var mid = Number(m && m.moduleId);
          return mid === 2000000000001185;
        });
        if (list.length !== beforeLen) {
          payload.resultJson = isStr ? JSON.stringify(list) : list;
          changed = true;
        }
      }
    }

    // 2. /cmcc-h5-shop/hePay/all: 移动钱包、借钱吧与活动推荐（清空使前端彻底不渲染容器）
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
        if (rj.heBaoWallet !== null || rj.digitalAsset !== null || rj.zoneApplication !== null) {
          rj.heBaoWallet = null;
          rj.digitalAsset = null;
          rj.zoneApplication = null;
          payload.resultJson = isStrRj ? JSON.stringify(rj) : rj;
          changed = true;
        }
      }
    }

    // 3. /cmcc-h5-shop/cms/yourFavorite: 精彩推荐信息流
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
        var pageResult = fav.pageResult;
        if (
          pageResult.pageData.length > 0 ||
          Number(pageResult.count) !== 0 ||
          Number(pageResult.pageCount) !== 0
        ) {
          pageResult.pageData = [];
          pageResult.count = 0;
          pageResult.pageCount = 0;
          payload.resultJson = isStrFav ? JSON.stringify(fav) : fav;
          changed = true;
        }
      }
    }

    return changed;
  }

  // ==================== 4.5 移动爱家钱包 H5 广告位净化 ====================
  function filterJfAds(url, payload) {
    if (!enabled("WalletClean")) return false;
    if (!payload || typeof payload !== "object") return false;
    var changed = false;

    // /cms/advertisePosition 为浮层广告位；/cms/advertisePage 为登录引导等整页广告。
    if (/\/(?:advertisePosition|advertisePage)(?:\?|$)/.test(url)) {
      var current = payload.resultJson;
      var isEmpty =
        current === null ||
        current === undefined ||
        (Array.isArray(current) && current.length === 0) ||
        (typeof current === "object" && !Array.isArray(current) && Object.keys(current).length === 0);
      if (!isEmpty) {
        payload.resultJson = Array.isArray(current) ? [] : null;
        changed = true;
      }
    }

    // /cms/globalIcon 为全局悬浮推广图标。
    if (/\/globalIcon(?:\?|$)/.test(url)) {
      var icon = payload.resultJson;
      if (icon && typeof icon === "object") {
        if (
          icon.globalIconUrl ||
          icon.cornerIconUrl ||
          icon.linkUrl ||
          icon.linkClickable === true ||
          icon.showOnHome === true
        ) {
          icon.globalIconUrl = "";
          icon.cornerIconUrl = null;
          icon.linkUrl = "";
          icon.linkClickable = false;
          icon.showOnHome = false;
          changed = true;
        }
      }
    }

    return changed;
  }

  // ==================== 6. 「我的」页面基础净化 ====================
  function filterMyPage(payload) {
    if (!enabled("MineClean")) return false;
    var body = payload && payload.rspBody;
    if (!body || !Array.isArray(body.areaList)) return false;

    var cleanMine = enabled("MineClean");
    var hideCarousel = enabled("HideCarousel");

    var pureAdAreas = {
      "20230721012": true,
      "20230721008": true,
      "20260610006": true,
      "20250219002": true,
      "20230721040": true,
      "20230721034": true
    };

    var before = body.areaList.length;
    body.areaList = body.areaList.filter(function (area) {
      if (!area) return false;
      var aid = String(area.areaId || "");
      var aname = String(area.areaName || "");

      if (cleanMine && pureAdAreas[aid]) {
        return false;
      }
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

    return body.areaList.length !== before;
  }

  // ==================== 核心分发链路 ====================
  try {
    // 1. 明文 JSON 接口分发（钱包、发现页、画布）
    if (isPlaintextRequest) {
      if (isHebaoPayAdRequest) {
        $done({
          status: 200,
          headers: { "Content-Type": "application/json;charset=UTF-8" },
          body: JSON.stringify({
            msgCd: "WAP00000",
            msgInfo: "成功",
            body: {
              bannerArrayList: [],
              groupCardMold: [],
              businessAllList: [],
              shopArrayList: [],
              sortList: [],
              popupArrayList: [],
              floatList: [],
              activityList: [],
              marqueeList: [],
              cards: [],
              groupCards: [],
              manyCards: []
            }
          })
        });
        return;
      }

      var plainJson;
      try {
        plainJson = JSON.parse(responseBody);
      } catch (e) {
        $done({});
        return;
      }
      var plainChanged = false;
      if (isJfShopRequest && !isJfAdRequest) {
        plainChanged = filterJfShop(url, plainJson);
      } else if (isMiguVideoRequest) {
        plainChanged = filterMiguVideo(plainJson);
      } else if (isCanvasLayoutRequest) {
        plainChanged = filterCanvasLayout(plainJson);
      } else if (isKomectVideoRequest) {
        plainChanged = filterKomectVideo(plainJson);
      } else if (isHjqShopLayout) {
        plainChanged = filterHjqShopLayout(url, plainJson);
      } else if (isHjqBannerRequest || isHjqContentRequest) {
        plainChanged = filterHjqBanner(url, plainJson);
      } else if (isUmpLaunchRequest) {
        plainChanged = filterUmpLaunch(plainJson);
      } else if (isJfAdRequest) {
        plainChanged = filterJfAds(url, plainJson);
      }
      if (!plainChanged) {
        $done({});
        return;
      }
      $done({ body: JSON.stringify(plainJson) });
      return;
    }

    if (!isNativeEncryptedRequest) {
      $done({});
      return;
    }

    // 2. 原生 AES 加密接口分发（首页顶部轮播、标题栏右上角图标、「我的」页面）
    var declaredLength = parseInt(getHeader($response.headers, "content-length"), 10);
    if (declaredLength > 0 && declaredLength < responseBody.length) {
      responseBody = responseBody.slice(0, declaredLength);
    }
    responseBody = responseBody.replace(/\s+/g, "");
    var payload = decryptJson(responseBody, AES_KEY, AES_IV);
    var changed = false;

    if (/\/DN\/homePage\/getTopAreaList(?:\?|$)/.test(url)) {
      changed = filterHomePage(payload);
    } else if (/\/DN\/titleBar\/getIcon(?:\?|$)/.test(url)) {
      changed = filterTitleBar(payload);
    } else if (/\/DN\/myPageNew\/getMyPageNew(?:\?|$)/.test(url)) {
      changed = filterMyPage(payload);
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
