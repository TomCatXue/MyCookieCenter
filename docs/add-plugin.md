# 添加一个功能插件

本文介绍如何为 MyCookieCenter 新增一个**非签到类**功能插件（解锁会员、请求净化、响应改写等）。
项目采用 **"一插件一文件夹"** 范式，接入只需新建 1 个子目录 + 1 个 `.plugin` 文件。

> 新增**签到脚本**（抓 Cookie + cron）请看 [add-app.md](./add-app.md)。

---

## 总览

新增功能插件需改动 **1 个脚本目录 + 1 个 .plugin 文件 + 2 处索引**：

1. `plugins/<插件名>/<插件名>.js` —— 新建脚本
2. `plugins/<插件名>/README.md` —— 该插件的详细文档
3. `loon/<Name>.plugin` —— 对应的 Loon 插件文件（PascalCase 命名）
4. `plugins/README.md` —— 在插件清单表格追加一行
5. 根目录 `README.md` —— 在"特殊功能插件"章节追加一行

---

## 第 1 步：创建脚本目录

```bash
mkdir plugins/myplugin
```

## 第 2 步：编写脚本

在 `plugins/myplugin/myplugin.js` 中编写请求/响应改写逻辑：

- `http-request` 脚本：通过 `$request.headers` / `$request.body` 读取请求数据，`$done({})` 返回修改后的请求
- `http-response` 脚本：通过 `$response.body` 读取响应，`$done({ body })` 返回修改后的响应

头部注释统一包含 4 段平台配置（Loon / Surge / Quantumult X / Stash），与本插件 README 逐字一致。

## 第 3 步：编写 README

在 `plugins/myplugin/README.md` 中写明功能说明、使用方式、各平台配置。

## 第 4 步：创建 Loon 插件文件

在 `loon/` 下新建 `MyPlugin.plugin`（PascalCase 命名），包含元信息 + 参数开关 + MITM + Script 规则：

```ini
#!name = 插件显示名
#!desc = 一句话功能描述
#!author = 作者
#!homepage = https://github.com/TomCatXue/MyCookieCenter
#!icon = 图标URL
#!tag = 标签1, 标签2

#!switch = myplugin_switch,开关显示名

[MITM]
hostname = 目标域名

[Script]
http-request <匹配正则> tag=插件名, script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/myplugin/myplugin.js, requires-body=false, enable={myplugin_switch}
```

## 第 5 步：更新索引

- 在 `plugins/README.md` 插件清单表格追加一行
- 在 `loon/README.md` 独立功能表格追加一行
- 在根目录 `README.md` 的"特殊功能插件"章节追加一行

## ✅ 验证

1. 在 Loon 中导入新 `.plugin` 文件
2. 打开对应开关，对目标域名开启 MITM
3. 触发对应请求，确认功能生效

## 详细规范

见 [`CONTRIBUTING.md`](../CONTRIBUTING.md)。
