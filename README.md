# 个人网安新闻博客

这是一个本地演示用的中文网络安全新闻聚合博客。它通过服务端拉取 RSS/Atom，只在页面展示标题、短摘要、来源、发布时间和原文链接，不做全文转载。

## 使用方式

```powershell
npm.cmd install
npm.cmd run dev
```

然后访问：

```text
http://localhost:3000
```

## 功能

- 聚合 FreeBuf、安全客、Seebug Paper、嘶吼、SecWiki News 等中文安全资讯 RSS。
- 支持关键词搜索、来源筛选、标签筛选。
- 服务端将 RSS 摘要转为纯文本，前端使用 `textContent` 渲染，避免直接插入 RSS HTML。
- 每 30 分钟自动刷新一次；单个 RSS 源失败不会影响其他来源。
- 保存本地缓存到 `data/news-cache.json`，方便断网或来源超时时继续演示。

## 常用命令

```powershell
npm.cmd run check
npm.cmd run dev
```
