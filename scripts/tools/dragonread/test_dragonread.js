/**
 * 番茄小说去广告逻辑单元测试
 */
const assert = require("assert");

// 模拟 Loon 运行时环境
function runScriptWithMock(url, responseBody, scriptCode) {
  let doneResult = null;
  const mock$ = {
    log: function() {}
  };
  const mock$request = { url: url };
  const mock$response = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: responseBody
  };
  const mock$done = function(res) {
    doneResult = res;
  };

  // 通过 Function 执行待测代码
  const fn = new Function("$request", "$response", "$done", "$", scriptCode);
  fn(mock$request, mock$response, mock$done, mock$);

  return doneResult;
}

// 导出测试套件
function runTests(scriptCode) {
  console.log("=== 开始运行番茄小说去广告自动化测试 ===");

  // 1. 测试 VIP 接口注入 (带斜杠与不带斜杠兼容性)
  {
    console.log("1. 测试 VIP 接口注入...");
    for (const testUrl of [
      "https://api5-normal-c-lq.fqnovel.com/api/novel/account/v1/vip/info/",
      "https://api5-normal-lf.fqnovel.com/api/novel/account/v1/vip/info"
    ]) {
      const rawBody = JSON.stringify({
        code: 0,
        message: "success",
        data: {
          is_vip: 0,
          vip_type: 0,
          ad_free: 0,
          expire_time: 0
        }
      });

      const res = runScriptWithMock(testUrl, rawBody, scriptCode);
      assert(res && res.body, "必须返回改写后的响应正文");
      const json = JSON.parse(res.body);
      assert.strictEqual(json.data.is_vip, 1, "is_vip 必须为 1");
      assert.strictEqual(json.data.ad_free, 1, "ad_free 必须为 1");
      assert.strictEqual(json.data.is_ad_free, 1, "is_ad_free 必须为 1");
      assert.strictEqual(json.data.has_vip, 1, "has_vip 必须为 1");
      assert.strictEqual(json.data.is_svip, 1, "is_svip 必须为 1");
      assert.strictEqual(json.data.expire_time, 4070880000, "expire_time 必须设为远期时间戳");
      assert.strictEqual(json.data.vip_expire_time, 4070880000, "vip_expire_time 必须设为远期时间戳");
    }
    console.log("   ✓ VIP 接口注入测试通过");
  }

  // 2. 测试用户信息中的 VIP 标识注入
  {
    console.log("2. 测试用户信息 VIP 注入...");
    const url = "https://api5-normal-c-lq.fqnovel.com/reading/user/info";
    const rawBody = JSON.stringify({
      code: 0,
      data: {
        user_id: 123456,
        user_name: "TestUser",
        is_vip: 0
      }
    });

    const res = runScriptWithMock(url, rawBody, scriptCode);
    assert(res && res.body, "必须返回改写后的响应正文");
    const json = JSON.parse(res.body);
    assert.strictEqual(json.data.is_vip, 1, "用户信息 is_vip 必须为 1");
    assert.strictEqual(json.data.ad_free, 1, "用户信息 ad_free 必须为 1");
    assert.strictEqual(json.data.has_vip, 1, "用户信息 has_vip 必须为 1");
    console.log("   ✓ 用户信息 VIP 注入测试通过");
  }

  // 3. 测试阅读流正文广告清洗
  {
    console.log("3. 测试阅读正文广告清洗...");
    for (const testUrl of [
      "https://api5-normal-c-lq.fqnovel.com/reading/reader/full/v1/?item_id=123",
      "https://api5-normal-lf.fqnovel.com/reading/chapter/detail?chapter_id=456"
    ]) {
      const rawBody = JSON.stringify({
        code: 0,
        data: {
          novel_data: {
            content: "这是正文第一段，内容包含正常的文学宣传和广告讨论。\n这是正文第二段。",
            chapter_title: "第一章",
            ad_info: { ad_id: "999", type: "interstitial" },
            chapter_ad: { banner: "http://ad.com" },
            flow_ad_list: [{ id: "ad1" }],
            commercial: { id: "c1" },
            promotion: { id: "p1" },
            need_ad: true,
            show_ad: 1
          }
        }
      });

      const res = runScriptWithMock(testUrl, rawBody, scriptCode);
      assert(res && res.body, "必须返回改写后的正文");
      const json = JSON.parse(res.body);
      assert(json.data.novel_data.content.includes("文学宣传和广告讨论"), "正文字符串必须毫发无损");
      assert.strictEqual(json.data.novel_data.ad_info, undefined, "ad_info 必须被删除");
      assert.strictEqual(json.data.novel_data.chapter_ad, undefined, "chapter_ad 必须被删除");
      assert.strictEqual(json.data.novel_data.flow_ad_list, undefined, "flow_ad_list 必须被删除");
      assert.strictEqual(json.data.novel_data.commercial, undefined, "commercial 必须被删除");
      assert.strictEqual(json.data.novel_data.promotion, undefined, "promotion 必须被删除");
      assert.strictEqual(json.data.novel_data.need_ad, false, "need_ad 必须置为 false");
      assert.strictEqual(json.data.novel_data.show_ad, 0, "show_ad 必须置为 0");
    }
    console.log("   ✓ 阅读正文广告清洗测试通过");
  }

  // 4. 测试底栏 Tab 净化
  {
    console.log("4. 测试底栏 Tab 净化...");
    const url = "https://api5-normal-c-lq.fqnovel.com/reading/bookapi/bookmall/tab";
    const rawBody = JSON.stringify({
      code: 0,
      data: {
        tabs: [
          { name: "书架", tab_id: "bookshelf", schema: "novel://bookshelf" },
          { name: "书城", tab_id: "bookmall", schema: "novel://bookmall" },
          { name: "福利", tab_id: "welfare", schema: "novel://luckycat_task" },
          { name: "我的", tab_id: "mine", schema: "novel://user_center" }
        ]
      }
    });

    const res = runScriptWithMock(url, rawBody, scriptCode);
    assert(res && res.body, "必须返回改写后的 Tab 配置");
    const json = JSON.parse(res.body);
    const tabNames = json.data.tabs.map(t => t.name);
    assert.deepStrictEqual(tabNames, ["书架", "书城", "我的"], "福利 Tab 必须被剥离");
    console.log("   ✓ 底栏 Tab 净化测试通过");
  }

  // 5. 测试招财猫与商业化广告接口置空兜底
  {
    console.log("5. 测试招财猫接口置空兜底...");
    const url = "https://api5-normal-c-lq.fqnovel.com/luckycat/crossover/v1/get_timer_widget";
    const rawBody = JSON.stringify({
      code: 0,
      data: {
        timer_widget: { icon: "http://pendant.png", time: 30 }
      }
    });

    const res = runScriptWithMock(url, rawBody, scriptCode);
    assert(res && res.body, "必须返回改写后的响应");
    const json = JSON.parse(res.body);
    assert.deepStrictEqual(json.data, {}, "招财猫数据对象必须被置空");
    console.log("   ✓ 招财猫接口置空测试通过");
  }

  // 6. 测试非 JSON 与异常容错
  {
    console.log("6. 测试非 JSON 与空响应容错...");
    const url = "https://api5-normal-c-lq.fqnovel.com/api/ad/something";
    const rawBody = "<html><body>502 Bad Gateway</body></html>";

    const res = runScriptWithMock(url, rawBody, scriptCode);
    assert(res !== undefined, "异常情况下必须调用 $done({})");
    console.log("   ✓ 容错测试通过");
  }

  console.log("🎉 所有单元测试全部通过！");
}

module.exports = { runTests };
