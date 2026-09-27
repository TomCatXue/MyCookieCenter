// SCRIPT_VERSION = "2026-09-27.r2"
/**
 * 用心读书 · 离线静态 Mock 回放脚本
 * 适配 2.7.1 (v3) 与 2.6.3 (v2) 鉴权、设备列表与更新接口
 */

const MOCK_RESPONSE_BY_PATH = {
  // v3 接口密文 (Key: SQ#ma8tVEs5Eiu1., IV: 8800992343426547)
  "v3/app/get.version.ios": "S2L3pr50xgK0s9WBAAUUqwxRDo8JPlABUZiLf/9vFWmFz4A3nnLmUWc3xMwYAdWxGBtD74n8hv3nE8F5tIwrKDU8itYzK9Knd6DyX9JvnXBqTYZdhKc3gEdF8zOHmlHnbZcGDit404Nlpnis/RzObJ/fEd8yjZxMQtOwIR7MEcYJtIeFXmVSCAegJshzpeXQf6NQXzU2CjZ98QBc68xEZUMJ4AUgNc7LY552PXC4yLA=",
  "v3/authority/checking": "S2L3pr50xgK0s9WBAAUUqwxRDo8JPlABUZiLf/9vFWkzvmwMYIJFDc/leGOhEKMY90eSX4HYhZ3Y2qwb9ZuvOPejJmK2aniuj6ta6Sx6n9dG9P3/dt3WfxavcB73wnb/9z6SbQVZpt+QqLWPNNrD+iECnvp3L0qm0YAF3iFB9IxexerwKELdl9f2T8ZTFXOqeTBnRUF13py51B3NOiLLCxVDCiXOT52NvP1/1NPiRRsuDCe5jh0IYhV/wQTllyvR",
  "v3/authority/list": "S2L3pr50xgK0s9WBAAUUqwxRDo8JPlABUZiLf/9vFWmeb1C4dJvgt3yz/Hbt3XhjY9cwHr0NESZzFKBZm0fHF75zrseYuqRFQ8shjAC2h5gcSjhD27Djclq7HVi+F/R/uLi3DmEV808CNfDBM/dCFseLzQgACtSDqwRzHnN1g29b5xGf2o9OLkV2XcXpZ6yODlf3WDLMaYxH1X5Vn4NRovtnjaGnh1EJCbahQR7NeP4i2WZAxo8CMyBCjTQ5szt68ogQg9zq4Q4lSArC3QIPKe3zw8TvtZzbxoNsHpTBZJpyfRosa+TXv27RsfS/uIAZ50I1uqdzPhHaJ2/sSXqzigqHwHYfdnE0krfOYrc8/cSZ1jSdhfc1h4eWNo5cJPq5SKkWKZ9KwHLAbJ2VoMODbWcxMDbHV3poIXKrRBX4ZTLq0cuRduDnVt934FxvySB9G0icBEWYXu+vDCsYJ8tk94xqCy0Z22syyAtoCkYt+VemLqfSOk0kozhVmlH65DOCvGCma3H3FS8Qhy8Bft0Xfw==",
  "v3/authority/verify": "S2L3pr50xgK0s9WBAAUUqwxRDo8JPlABUZiLf/9vFWmELsm20Fy45rl4B+AIifPXi76oiBixVMud/mCacJbB7kfpbRfYJanDTMEwc5ZoYpBKo6sh0rTrRLwHqmoleIb6nGcIFr9NWq+3/8j4darkI3GYME0AOmFi75yUmCGdr7v57OeI3+B6w4c0Q9/Toh+Cl6r/v2+nMbb2ix/jLIFb2P6hev+Zgz4ky0ROvRTUMYvJ05lBGnKoxvt6fB3+fqVGUMAOowwLPX+Gd8n+6D6TeexKJt24bUjNSAa8BRawFyLroOc6ovcBoVztILqOIIEz+ZV23sM3Os4LhO6fFYFMlRFbFPuTJnhtK84D3UG6dNkt5cjYUgJ5pv68w1cA9U3r",
  "v3/authority/devices": "S2L3pr50xgK0s9WBAAUUqwxRDo8JPlABUZiLf/9vFWmeb1C4dJvgt3yz/Hbt3XhjY9cwHr0NESZzFKBZm0fHFyzl5Ep0WiZBnSgc7D4qVbPI1svvv1mqOZZifJTnaDxl3Eun0Yotav7tQR5Q/OB4339yUH47nEf6tHo3HFUASddy1FHmKhlF1oDuXr1YMpjYuaGjpn9Ix98YOti7eWBTM9KAR/kWqlZPPkt7+RtC7u5fUpnM5FS/VGS3YlZRgYPOuKfzjlboVwuanxC+oAUR3Nd4ZZWYOQ2RKW5x9BziIxmICCn0zThQ0JqDK6++G02jsSXtvErMmZRMSOIxFQxWDnglDAZBTw09gWW2lwp7Oaz/DOd595hVteBOg0mt8RK+NRo9NWduwndxOIFH7NIzwH/snLggv3hIdoJUPtV7QllGIgcTukelRDputm8IJnrI",
  "v3/authority/bindtomember": "S2L3pr50xgK0s9WBAAUUqwxRDo8JPlABUZiLf/9vFWkzvmwMYIJFDc/leGOhEKMYkkv6PF9IgavDT8L6fwQJ+dtLdOcSyhf0V5ZjkA4cg4P3FrD/FlM3z3KODpiPkXXlGviiVkPdkwBQrrjFJVSPUA==",

  // v2 接口兼容
  "v2/authority/checking": "cxASdYoqg3ZsSzrtjmMFJZPnyQkxkzA+jAqAbI8Y1OHP90XvWKRhenGQZr/Nx9dEL4L0UDYsN8KZdsN5slY0v1ZwAkpCdhgCiUgJL7g9nc0="
};

function normalizeMockPath(rawUrl) {
  const cleaned = String(rawUrl || "").split("?")[0].replace(/\/+$/, "");
  const match = cleaned.match(/\/(v[23]\/.+)$/);
  if (match) return match[1];
  return cleaned.replace(/^https?:\/\/[^\/]+/i, "").replace(/^\/+|\/+$/g, "");
}

function getMockResponse(url) {
  const path = normalizeMockPath(url);
  return MOCK_RESPONSE_BY_PATH[path] || "";
}

if (typeof $request !== "undefined") {
  const responseBody = getMockResponse($request.url || "");
  if (!responseBody) {
    $done({ response: { status: 404, headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ code: 404, msg: "mock not found" }) } });
  } else {
    $done({ response: { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, body: responseBody } });
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MOCK_RESPONSE_BY_PATH, normalizeMockPath, getMockResponse };
}
