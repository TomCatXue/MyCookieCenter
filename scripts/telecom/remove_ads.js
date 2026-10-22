/**
 * 中国电信营业厅 · 全广告面净化
 *
 * 目标版本：CtClient 13.1.0 (CTPocket.app)
 * 适配层：Loon response script（JSON）
 *
 * 设计原则：
 * 1. 纯广告接口只清广告数组/对象，不做整接口拒绝；
 * 2. 混合接口只删明确广告标记，保留业务数组；
 * 3. advertisingSpaceInfos 等复用容器不盲删，避免清空话费/流量/积分入口；
 * 4. 异常、非 2xx、非 JSON、Protobuf 均原样透传。
 *
 * @author TomCatXue
 * @version 1.1.2
 * @date 2026-10-22
 */
(function () {
  "use strict";

  var args = readArguments();
  var switches = {
    SplashClean: enabled(args, "SplashClean", true),
    CarouselClean: enabled(args, "CarouselClean", true),
    AdSpaceClean: enabled(args, "AdSpaceClean", true),
    PopupClean: enabled(args, "PopupClean", true),
    FeedNativeClean: enabled(args, "FeedNativeClean", false),
    LocalPromoClean: enabled(args, "LocalPromoClean", false),
    BroadbandPromoClean: enabled(args, "BroadbandPromoClean", false),
    MallPromoClean: enabled(args, "MallPromoClean", false),
    MessageMarketingClean: enabled(args, "MessageMarketingClean", false),
    MinePromoClean: enabled(args, "MinePromoClean", false),
    AiPromoClean: enabled(args, "AiPromoClean", false),
    LivePromoClean: enabled(args, "LivePromoClean", false),
    PointsPromoClean: enabled(args, "PointsPromoClean", false),
    UpgradePromoClean: enabled(args, "UpgradePromoClean", false)
  };

  if (!$response || !$request || !$request.url) {
    $done({});
    return;
  }

  var status = Number($response.status || $response.statusCode || 0);
  if (status && (status < 200 || status >= 300)) {
    $done({});
    return;
  }

  var body = $response.body;
  if (typeof body !== "string" || body.length === 0) {
    $done({});
    return;
  }

  var contentType = getHeader($response.headers, "content-type").toLowerCase();
  if (
    contentType &&
    contentType.indexOf("json") < 0 &&
    /application\/x-protobuf|application\/octet-stream|application\/protobuf/i.test(contentType)
  ) {
    $done({});
    return;
  }

  var parsed;
  try {
    parsed = JSON.parse(stripBom(body));
  } catch (e) {
    $done({});
    return;
  }

  var result = route(String($request.url), parsed);
  if (!result || !result.changed) {
    $done({});
    return;
  }

  var headers = copyHeaders($response.headers);
  removeHeader(headers, "content-length");
  removeHeader(headers, "content-encoding");
  $done({ body: JSON.stringify(result.value), headers: headers });

  function route(url, root) {
    var path = pathOf(url);

    if (/\/(?:getSplash|getSplashUrl|splash)(?:\/|$)/i.test(path) ||
        /\/query\/(?:getSplash|getSplashUrl|splash)(?:\/|$)/i.test(path)) {
      return cleanSplash(root, switches.SplashClean);
    }

    if (/\/query\/advertising\/(?:compositeAd|serviceChannelAd|mallPackageAd)(?:\/|$)/i.test(path)) {
      return cleanAdContract(root, switches.AdSpaceClean);
    }

    if (/\/query\/(?:queryAdvertisingSpace|queryAdveSpac|queryCustomerAdvertising)(?:\/|$)/i.test(path)) {
      return cleanAdContract(root, switches.AdSpaceClean);
    }

    if (/\/query\/queryMyChannelAdvSpace(?:\/|$)/i.test(path)) {
      return cleanMineAdSpace(root, switches.AdSpaceClean);
    }

    if (/\/query\/(?:queryAdRotation|queryTabCardAdList|queryIndexNearTabADSpa|qryNearConfigAdvertising|queryRollImage)(?:\/|$)/i.test(path)) {
      return cleanCarousel(root, switches.CarouselClean);
    }

    if (/\/query\/(?:getFeedList|getRecommendContentList|getRecommendFollowList|queryGuessYouLike)(?:\/|$)/i.test(path)) {
      return cleanFeed(root, switches.FeedNativeClean);
    }

    if (/\/query\/(?:getPopupInfo|getPopUpWindows|accountInfoPopup|getCareGuideDialog)(?:\/|$)/i.test(path) ||
        /\/query\/(?:suspendWindow(?:ForQuery|ForWap|V2)?|suspend\/suspendWindow|loginSuspendWindow)(?:\/|$)/i.test(path) ||
        /\/query\/xhPromote\/promotionalWindow(?:\/|$)/i.test(path)) {
      return cleanPopup(root, switches.PopupClean);
    }

    if (/\/query\/(?:queryMessageList|getMessageCenterList|queryServiceMessage|queryMessageChannel|queryOneLevelMsg|queryTwoLevelMsg|queryThreeLevelMsg|indexMsgList)(?:\/|$)/i.test(path)) {
      return cleanMessages(root, switches.MessageMarketingClean);
    }

    if (/\/query\/(?:queryLocalTabAdSpace|queryLocalOAOSaleList|getLocalExclusive)(?:\/|$)/i.test(path)) {
      return cleanLocal(root, switches.LocalPromoClean);
    }

    if (/\/query\/(?:qryBroadbandADSpace|queryBroadbandServiceFloor|getBroadbandSndScreenList|getSecondScreenList)(?:\/|$)/i.test(path)) {
      return cleanBroadband(root, switches.BroadbandPromoClean);
    }

    if (/\/query\/(?:yzfMallAdArea|yzfMallActivityArea|yzfMallTopArea|yzfMallJglArea|yzfMallRapidRecycleArea|qryHomeMall)(?:\/|$)/i.test(path)) {
      return cleanMall(root, switches.MallPromoClean);
    }

    if (/\/query\/(?:queryRechargePageAD|queryRechargePageADSpace|queryRechargePageTabADSpace|rechargeCenterCommonADFloor|usageAnalysisCommonADFloor|querySettingPageAdList|queryBusHallAdvSpace|bottomTieADSpace|assistAdvSpace|qryTraAdvertisingSpace)(?:\/|$)/i.test(path)) {
      return cleanAdContract(root, switches.AdSpaceClean);
    }

    if (/\/query\/(?:queryRechargeMarketing|queryRechargePageV2|queryRechargePageFlow|queryRechargePageTab|queryRechargeSecuritySetting)(?:\/|$)/i.test(path)) {
      return cleanRechargeMarketing(root, switches.PopupClean);
    }

    if (/\/query\/(?:queryAIMarketingService|queryAIServiceFloor)(?:\/|$)/i.test(path)) {
      return cleanAi(root, switches.AiPromoClean);
    }

    if (/\/query\/(?:directSeedingAdGuide|recommendDirectSeedingList|queryLiveCard|myLiveCard|getLiveRoomGiftList|queryAnchorRankList)(?:\/|$)/i.test(path)) {
      return cleanLive(root, switches.LivePromoClean);
    }

    if (/\/query\/(?:queryIntegralAd|queryUpgrade5GAd)(?:\/|$)/i.test(path)) {
      return cleanPointsAndUpgrade(root, switches.PointsPromoClean, switches.UpgradePromoClean);
    }

    if (/\/query\/(?:queryMyChannelPageHead|qryMyChannelPageTail|myChannelFloor|queryMyChannelTop|queryMyChannelCoreData)(?:\/|$)/i.test(path)) {
      return cleanMine(root, switches.MinePromoClean);
    }

    return null;
  }

  function cleanSplash(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = clearArrays(holder, [
      "splash", "splashAds", "splashList", "splashInfos", "splashImages",
      "uniSplashAdInfos", "mutableSplashList", "adSplashList"
    ]);
    changed = clearProps(holder, [
      "splashPath", "splashTarget", "splashWebviewTarget", "splashScreenConfig",
      "adSplashInfo", "splashAdInfo"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanAdContract(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = filterArrays(holder, [
      "advertisingSpaceInfos", "advertisingSpaceInfosStr",
      "advertisingSpaceV2DetailInfos", "advertisingSpaces"
    ], isNativeAd);
    changed = clearArrays(holder, [
      "advertisingBannerList", "advertisingInfos", "advertisingList",
      "advertisingListLeft", "advertisingListRight", "advertisingLeft",
      "advertisingRight", "advertisingRightBottom", "advertisingRightTop",
      "advertiseSpaceConfs", "advertisingRotationInfos",
      "advertisingRotationInfosItemArr", "adList", "adLists", "adListArr",
      "adListTop", "adListBottom", "adItems", "adItem", "adItemInfos",
      "adInfo", "adInfos", "ads", "adsInfo", "adverList", "advertList",
      "bottomAdList", "bottomAdvertisingSpaceInfos", "bottomBannerList",
      "bottomTieADSpaceFirInfos", "bottomTieADSpaceSecInfos",
      "compoundADSpaceInfo", "compoundADSpaceInfos", "guideAdList",
      "qryTraAdvertisingSpaceInfos", "serviceAdvertisingList",
      "settingPageAdList", "settingPageAdSecList", "tabAdList", "topAdList",
      "userInformationAdList", "ywRecommendAdList"
    ]) || changed;
    changed = clearProps(holder, [
      "advertisingSpaceInfo", "advertisingSpaceModel", "advertisingBean",
      "adModel", "adSpaceModel", "adView", "advertisingArea",
      "advertisingMap", "eventMarketingAdveSpac", "advertisingBottom"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanCarousel(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = clearArrays(holder, [
      "carouselDataArr", "carouselList", "bannerList", "bannerInfos",
      "advertisingRotationInfos", "advertisingBannerList",
      "rollImageList", "rollImages", "rotationAdListBottom",
      "rotationAdListTop", "topCarouselList", "threeADLeftListArr"
    ]);
    changed = clearProps(holder, [
      "carouselModel", "carouselView", "carouselAdV", "carouselAdView",
      "bannerModel", "bannerView", "advertisingMap"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanFeed(root, on) {
    if (!on) return null;
    var changed = walkAndFilter(root, isNativeAd);
    return changed ? result(root) : null;
  }

  function cleanPopup(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = clearArrays(holder, [
      "popUpList", "popupList", "popups", "promotionList", "suspendWindows",
      "suspendWindowForQueryInfos", "suspendWindowV2Infos", "floatList",
      "promotionalWindowList", "moreListPopupBean", "popupsConf"
    ]);
    changed = clearProps(holder, [
      "popupView", "popupWindowContent", "popupWindowTitle",
      "promotionPopUpContent", "promotionPopUpDesc", "promotionPopUpTitle",
      "promotionPopUpButtonTxt", "promotionPopUpButtonLink",
      "promotionPopUpButtonLinkType", "suspendWindow", "suspendTitle",
      "suspendType", "floatView", "floatIcon", "popupInfo",
      "popupLink", "popupLinkType", "popupTitle",
      "bubbleFloatView", "promotionalWindow"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanRechargeMarketing(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = clearArrays(holder, [
      "rechargeMemMarketings", "marketingpositions", "promotionList"
    ]);
    changed = clearArrays(holder, [
      "rechargeMarketingpositionsModel", "rechargeMemMarketingList",
      "marketingActivityList"
    ]) || changed;
    changed = clearProps(holder, [
      "bannerConf", "promotionMsgInfo", "marketingInfo",
      "canPromotionPopUp", "promotion", "rechargeMarketing",
      "rechargeMarketingpositions"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanMessages(root, on) {
    if (!on) return null;
    var changed = walkAndFilter(root, isMarketingMessage);
    return changed ? result(root) : null;
  }

  function cleanLocal(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = clearArrays(holder, [
      "homeLocalTabAdSpaceLocalDiscountList",
      "homeLocalTabAdSpaceLocalServiceList",
      "homeLocalTabAdSpaceLocalVideoList",
      "homeLocalTabAdSpaceList",
      "localDiscountAdList", "localServiceAdList",
      "recommendAdList", "recommendServiceAdList"
    ]);
    changed = clearProps(holder, [
      "homeLocalTabAdSpaceModel", "homeLocalTabAdSpaceFloorTitle",
      "localDiscountAdBean", "homeLocalTabMapAreaUnauthorizedLocationAd"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanBroadband(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = filterArrays(holder, ["broadbandADSpaceInfo"], isNativeAd);
    changed = clearArrays(holder, [
      "broadbandAdList", "broadbandServiceAdList",
      "adItem", "adItemsUp", "adItemsDown"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanMall(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = filterArrays(holder, ["advertisingSpaceInfos"], isNativeAd);
    changed = clearArrays(holder, [
      "advertisingBottomList",
      "advertisingLeft", "advertisingRight", "advertisingRightTop",
      "advertisingRightBottom", "mallAdItems", "mallJglAreaAdList",
      "productAdvertisingList", "recommendAdList",
      "serviceAdvertisingList"
    ]) || changed;
    changed = clearProps(holder, [
      "advertisement", "advertisementModel", "advertisementView",
      "productAdvertising", "mallAdAreaAdvertisingBottom",
      "mallRapidRecycleAreaAdvertisingModel"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanAi(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = clearArrays(holder, [
      "aIMarketingServiceList", "aiMarketingServiceList", "homeAIServiceAdList"
    ]);
    changed = filterArrays(holder, ["marketingPositions"], isNativeAd) || changed;
    changed = clearProps(holder, [
      "aIMarketingServiceModel", "aiMarketingServiceModel",
      "marketingCard", "marketingInfo", "marketingActivitiesModel"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanLive(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = clearArrays(holder, ["liveAdList"]);
    changed = clearProps(holder, [
      "liveEndView", "liveEndADView", "adModel", "directSeedingAdGuide",
      "liveAdInfo", "livePopupInfo", "couponDialog", "marketDialog"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanPointsAndUpgrade(root, pointsOn, upgradeOn) {
    if (!pointsOn && !upgradeOn) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = false;
    if (pointsOn) {
      changed = clearArrays(holder, ["integralsAd", "integralAdList", "myIntegralAdList"]) || changed;
      changed = clearProps(holder, ["integralAd", "myIntegralAdlModel"]) || changed;
    }
    if (upgradeOn) {
      changed = clearArrays(holder, ["upgrade5GAdList", "adList"]) || changed;
      changed = clearProps(holder, ["upgrade5GAd", "upgrade5GFloor", "floorConf"]) || changed;
    }
    return changed ? result(root) : null;
  }

  function cleanMineAdSpace(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = filterArrays(holder, [
      "myChannelAdvSpaceInfos", "fixedAdveSpacInfos", "movableAdveSpacInfos"
    ], isNativeAd);
    changed = clearArrays(holder, ["recommendAdList", "recommendAdvertisingInfos"]) || changed;
    changed = clearProps(holder, [
      "myWalletAdvertisingSpace", "advertisingSpaceInfo",
      "advertisingSpaceModel", "fixedAdSpace", "nonfixedAdSpace"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function cleanMine(root, on) {
    if (!on) return null;
    var holder = unwrap(root);
    if (!isObject(holder)) return null;
    var changed = filterArrays(holder, [
      "myChannelAdvSpaceInfos", "fixedAdveSpacInfos", "movableAdveSpacInfos"
    ], isNativeAd);
    changed = clearArrays(holder, [
      "recommendAdList", "recommendAdvertisingInfos", "personalAdList",
      "userInformationAdList"
    ]) || changed;
    changed = clearProps(holder, [
      "myWalletAdvertisingSpace", "fixedAdSpace", "nonfixedAdSpace",
      "recommendForMe", "myCommunicationBottomAdList"
    ]) || changed;
    return changed ? result(root) : null;
  }

  function walkAndFilter(root, predicate) {
    var changed = false;
    var seen = [];
    walk(root);
    return changed;

    function walk(node) {
      if (!node || typeof node !== "object" || seen.indexOf(node) >= 0) return;
      seen.push(node);

      if (Array.isArray(node)) {
        for (var i = node.length - 1; i >= 0; i -= 1) {
          if (predicate(node[i])) {
            node.splice(i, 1);
            changed = true;
          } else {
            walk(node[i]);
          }
        }
        return;
      }

      Object.keys(node).forEach(function (key) {
        if (isNamedAdContainer(key) && Array.isArray(node[key])) {
          if (node[key].length > 0) {
            node[key] = [];
            changed = true;
          }
          return;
        }
        walk(node[key]);
      });
    }
  }

  function isNamedAdContainer(key) {
    return /^(?:adItems|adItemInfos|contentCardAdList|recommendCardAdList|marketingMessageList|marketingMessages|msgMarketingListArr|msgMarketingMessageList|serviceMarketingList)$/i.test(key);
  }

  function isNativeAd(item) {
    if (!isObject(item)) return false;
    var flags = [
      "adType", "isAd", "is_ad", "isAdvert", "isAdvertisement",
      "advertiseFlag", "advertisingFlag", "isCommercial", "isMarketing"
    ];
    for (var i = 0; i < flags.length; i += 1) {
      if (truthy(item[flags[i]])) return true;
    }
    var kind = String(item.recommendType || item.cardType || item.card_type || "").toLowerCase();
    if (/^(?:ad|advert|advertisement|commercial|marketing|promotion)$/.test(kind)) return true;
    return isObject(item.adInfo) || isObject(item.adItem) || isObject(item.adItemInfo) || isObject(item.adData);
  }

  function isMarketingMessage(item) {
    if (!isObject(item)) return false;
    var flags = [
      "isMarketing", "isMarketingMessage", "marketingFlag",
      "isAdvertisement", "advertiseFlag", "isCommercial"
    ];
    for (var i = 0; i < flags.length; i += 1) {
      if (truthy(item[flags[i]])) return true;
    }
    var type = String(
      item.messageType || item.msgType || item.category ||
      item.messageCategory || item.marketingType || ""
    ).toLowerCase();
    return /marketing|promotion|commercial|广告|营销|推广/.test(type);
  }

  function unwrap(root) {
    if (!isObject(root)) return null;
    if (isObject(root.data)) return root.data;
    if (isObject(root.result)) return root.result;
    if (isObject(root.body)) return root.body;
    return root;
  }

  function result(value) {
    return { changed: true, value: value };
  }

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function clearArrays(holder, keys) {
    var changed = false;
    keys.forEach(function (key) {
      if (Array.isArray(holder[key]) && holder[key].length > 0) {
        holder[key] = [];
        changed = true;
      }
    });
    return changed;
  }

  function filterArrays(holder, keys, predicate) {
    var changed = false;
    keys.forEach(function (key) {
      if (!Array.isArray(holder[key]) || holder[key].length === 0) return;
      var before = holder[key];
      var after = before.filter(function (item) {
        return !predicate(item);
      });
      if (after.length !== before.length) {
        holder[key] = after;
        changed = true;
      }
    });
    return changed;
  }

  function clearProps(holder, keys) {
    var changed = false;
    keys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(holder, key)) return;
      var current = holder[key];
      if (current === null || current === undefined || current === "") return;
      holder[key] = null;
      changed = true;
    });
    return changed;
  }

  function truthy(value) {
    if (value === true || value === 1) return true;
    var normalized = String(value).toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }

  function pathOf(url) {
    var clean = String(url).split("#")[0].split("?")[0];
    var match = clean.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)$/i);
    return match ? match[1] : clean;
  }

  function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  function getHeader(headers, name) {
    if (!headers) return "";
    var lower = String(name).toLowerCase();
    for (var key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === lower) {
        return String(headers[key] || "");
      }
    }
    return "";
  }

  function copyHeaders(headers) {
    var copy = {};
    if (!headers) return copy;
    for (var key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) copy[key] = headers[key];
    }
    return copy;
  }

  function removeHeader(headers, name) {
    var lower = String(name).toLowerCase();
    Object.keys(headers).forEach(function (key) {
      if (key.toLowerCase() === lower) delete headers[key];
    });
  }

  function readArguments() {
    if (typeof $argument === "object" && $argument !== null) return $argument;
    if (typeof $argument !== "string" || !$argument.trim()) return {};
    try {
      return JSON.parse($argument);
    } catch (e) {
      var result = {};
      $argument.split("&").forEach(function (pair) {
        var parts = pair.split("=");
        if (parts.length === 2) result[parts[0].trim()] = parts[1].trim();
      });
      return result;
    }
  }

  function enabled(args, key, fallback) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) return fallback;
    return truthy(args[key]);
  }
})();
