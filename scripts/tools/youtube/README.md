# YouTube 去广告与增强

配合 [`YouTube_Ad.plugin`](../../../loon/YouTube_Ad.plugin) 使用，Loon 侧注入，无需在 App 内操作。

## 文件

| 文件 | 作用 |
| :--- | :--- |
| `youtube_request.js` | **请求层**：拦截播放请求，剥离广告参数、解锁高码率画质 |
| `youtube_response.js` | **响应层**：主体逻辑。移除广告位、短片按钮、商品卡、智能助手、竖屏直播；注入「精彩跳转」「通勤模式」「画中画」「后台播放」；字幕中英机翻在 Protobuf 响应层注入 |
| `youtube_ump.js` | **UMP 播放器层**：拦截播放器配置，注入通勤模式控件与音视频资源 |
| `youtube_key.js` | **配置键定义**：`YouTubeConfig` / `YouTubeQuality` 的读写封装，被上面三个脚本共用 |
| `youtube_subtitle.js` | **占位文件**（245 字节）。字幕逻辑已于 v1.1.0 迁入 `youtube_response.js`，此文件仅防止历史客户端缓存更新时触发 404，**不要删除** |

## 构建说明

`youtube_request.js` / `youtube_response.js` / `youtube_ump.js` / `youtube_key.js` 四个文件头部都标注：

```js
// Generated from modules/youtube/src/ and assets/; run npm run build --workspace youtube.
```

即它们是从模块源码**构建产物**，直接改这四个文件会在下次构建时被覆盖。

## 插件开关

在 Loon 插件参数里可单独控制，共 11 项：

| 开关 | 作用 |
| :--- | :--- |
| `autoHd` | 自动选择最高画质 |
| `jumpAhead` | 精彩跳转（跳过空白段） |
| `onTheGo` | 通勤模式 |
| `translation_enabled` | 外语字幕中英机翻 |

其余开关见插件内 `[Argument]` 段。

## 相关

- 插件：[`loon/YouTube_Ad.plugin`](../../../loon/YouTube_Ad.plugin) (v1.1.1)
- 上游来源：Maasea、gholts、RuCu6、devchristian1337
