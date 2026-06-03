# 网安罗盘

这是一个本地演示用的网络安全综合入口。它聚合中文安全 RSS，同时把资讯、赛事、资源、学习路线和安全工具箱拆成独立页面，默认使用浅色主题，并保留深色主题切换。

## 使用方式

```powershell
npm.cmd install
npm.cmd run dev
```

然后访问：

```text
http://localhost:3000
```

常用页面：

- `http://localhost:3000/`
- `http://localhost:3000/news`
- `http://localhost:3000/events`
- `http://localhost:3000/resources`
- `http://localhost:3000/roadmap`
- `http://localhost:3000/tools`

## 功能

- 聚合 FreeBuf、安全客、Seebug Paper、嘶吼、SecWiki News 等中文安全资讯 RSS。
- 支持关键词搜索、来源筛选、标签筛选和手动刷新。
- 展示网络安全比赛日历入口：`http://www.supermatch.fun/`。
- 提供资源、学习路线、安全工具箱等独立栏目页。
- 安全工具箱使用本地 `tools-data.json`，支持搜索、标签筛选、工具计数和无链接状态。
- 服务端将 RSS 摘要转为纯文本，前端使用 `textContent` 渲染，避免直接插入 RSS HTML。
- 每 30 分钟自动刷新一次；单个 RSS 源失败不会影响其他来源。
- 保存本地缓存到 `data/news-cache.json`，方便断网或来源超时时继续演示。

## 常用命令

```powershell
npm.cmd run check
npm.cmd run dev
```
