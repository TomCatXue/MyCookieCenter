# 微信读书 · 模块化增强套件

> 本套件全面重构解耦为两大独立插件：**防强更去广告** 与 **优雅书架（下架书籍注入）**，职责单一、互不干扰。

---

## 插件一：微信读书 · 防强更去广告 (`WeReadEnhance.plugin`)

### 🎯 功能与痛点解决
1. **彻底根治更新弹窗**：通过对 WeRead 10.2.0 脱壳 Mach-O 二进制（`0x100a9d10c - 0x100a9d118`）逆向查明，若配置的 `upgrade_query_interval <= 0`，客户端汇编会触发保底指令回退为 86400 秒（24小时）向苹果商店发起嗅探。
   - 规则层增加 `DOMAIN, itunes.apple.com, REJECT`，物理切断商店嗅探请求；
   - 脚本层锁定 `upgrade_query_interval = 2147483647`，彻底杜绝弹窗。
2. **纯净阅读与去广告**：
   - 过滤发现页营销卡片与推荐流广告（`discoverfeed`）；
   - 清空底部与发现页红点、通知计数（`mobileSync`）；
   - 清除个人主页勋章与未读红点（`user/profile`）；
   - 阅读器界面极简：清空在读人数与阅读统计（`readingStat`）、章节评论数字（`chapterReview`）、读者圈子入口（`groups/readerEntrance`）、想法与点评列表（`review/list`）。

### 📱 订阅链接
```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/loon/WeReadEnhance.plugin
```

---

## 插件二：微信读书 · 优雅书架 (`WeReadShelf.plugin`)

### 🎯 真实抓包剖析与突破机理
通过对用户最新真实抓包文件（`65_1790410674787.har`）的深度审计：
1. **订阅下架书全自动捕获**：
   - 实测证实服务端的订阅接口（`https://i.weread.qq.com/subscription/books?v2=1`）将所有下架书籍规整下发在 **`offshelfBooks`** 数组中；
   - 脚本自动读取 `offshelfBooks`，提取书籍完整元数据（`bookId`, `title`, `author`, `cover`, `format`, `version` 等）落盘缓存；
2. **虚拟书架动态注入**：
   - 当客户端发起 `/shelf/sync` 同步书架时，自动将捕获的下架书注入进书架 `books` 数组，并从 `removed` 数组中剔除，实现下架书在 App 书架中常驻；
3. **全链路阅读鉴权放行（解决无法点击/无法阅读）**：
   - `/book/info`：强制改写 `soldout = 0`、`isPaid = 1`、`free = 1`、`price = 0`、`maxFreeChapter = 999999`；
   - `/book/readinfo`：强制改写嵌套的 `bookInfo.soldout = 0`、`bookInfo.isPaid = 1`；
   - `/book/paytime`（最关键）：抓包证实未购下架书返回 `time: 0` 会触发客户端 `isPaiedNormalSoldoutBook` 阻断。脚本拦截并将其改写为当前时间戳（`time > 0`），使客户端判定为已购买，彻底解除阅读器拦截！
4. **加入书架容错**：
   - 拦截 `/shelf/add` 强制响应 `{"succ": 1}`，保证点击添加交互顺畅。

### 📱 订阅链接
```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/scripts/tools/wxread_enhance/wxread_shelf.js
```
*(或在 Loon 中导入插件配置：`https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/loon/WeReadShelf.plugin`)*

### 💡 优雅书架使用方法
- **全自动捕获（推荐）**：在 Loon 开启本插件后，打开微信读书 App，点进“订阅”（或作者主页），只要页面列出了这本下架书，脚本便会自动将其捕获；随后返回书架下拉刷新一次，该书便会自动常驻在书架首位，点击即可进入正文阅读；
- **手动指定**：在 Loon 插件参数【下架书籍ID列表】中填入目标书籍 ID（多个用英文逗号分隔，如 `23665510,490081`），返回书架下拉刷新即可。
