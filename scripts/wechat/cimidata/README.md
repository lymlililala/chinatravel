# 次幂数据 (cimidata) API 客户端

公众号文章数据的可复用封装。**零依赖**（Node 18+ 原生 `fetch`），整个目录可直接复制到其它仓库使用。

## 快速开始

```bash
cp .env.example .env      # 填入 app_id / app_secret
node examples.mjs         # 跑示例（会消耗余额）
```

```js
import { CimiClient } from './client.mjs'

const cimi = new CimiClient()                 // 自动从同目录 .env 读凭证
const articles = await cimi.searchArticles('AI 工具')   // 自动换 token
const html = await cimi.articleBody(articles[0].content_url)
console.log('余额:', cimi.balance)
```

## 鉴权机制

- 用 `app_id` + `app_secret` 调 `/api/v2/token` 换 **7 天有效**的 `access_token`（JWT）。
- 客户端**自动完成**：首次请求时换取并缓存，过期或遇 `2040 无效的token` 自动续期重试。
- `app_id` / `app_secret` 找次幂商务获取。

## 方法一览

| 方法 | 接口 | 计费 | 说明 |
|---|---|---|---|
| `searchArticles(kw, {page})` | `v3/articles/search` | 0.05 | 关键词搜文章，带 `nickname`/`usename`(wxid)，分页 1-5 |
| `searchArticlesDb(kw)` | `v2/articles/search` | 0.02 | 关键词搜文章（数据库版，无分页） |
| `iterSearchArticles(kw, {maxPages})` | — | — | 上者的翻页异步迭代器 |
| `searchAccounts(kw)` | `v3/accounts/search` | 0.1 | 关键词搜公众号，返回含 `wxid`，约 20 条 |
| `accountHistory(wxid, {nickname, lastId})` | `v2/articles/history` | 0.05 | 历史发文，每次 10 条，`last_id` 翻页 |
| `iterAccountHistory(wxid, {maxPages})` | — | — | 历史发文翻页异步迭代器 |
| `accountToday(wxid, {nickname})` | `v2/articles/current` | — | 某号今日发文，限频 1QS |
| `articleBody(url)` | `v3/articles/detail` | 0.01 | **只取正文 HTML（入库推荐）** |
| `articleFullPage(url)` | `v2/articles/detail` | 0.01 | 完整页面 HTML（含 JS，少用） |
| `hotArticles({category, readNum, publishedAt, lastId})` | `v2/hot/articles` | 0.1 | 微信爆文，44 类目见 `HOT_CATEGORIES` |
| `authenticate()` / `ensureToken()` | `v2/token` | 免费 | 换取/确保 token |

## 两条典型采集链路

```js
// A. 关键词线：关键词 → 文章 → 正文
for await (const a of cimi.iterSearchArticles('AI 工具', { maxPages: 5 })) {
  const html = await cimi.articleBody(a.content_url)
  // ...入库 a + html
}

// B. 按号线：名字 → wxid → 历史列表 → 正文
const [acc] = await cimi.searchAccounts('某公众号名')
for await (const a of cimi.iterAccountHistory(acc.wxid, { maxPages: 50 })) {
  const html = await cimi.articleBody(a.content_url)
  // ...入库
}
```

## 注意事项

- **只给 nickname 查询**：首次可能报错，需等 ~30-60s 重试。用 `cimi.withNicknameRetry(() => cimi.accountHistory(null, { nickname }))` 封装。
- **限频**：`history`/`current` 为 1QS；客户端默认 `minIntervalMs=1100` 已留余量，可在构造时调整。
- **余额**：每次响应带 `balance`，缓存在 `cimi.balance`，注意监控。
- **wxid 获取**：除接口外，也可访问 https://www.cimidata.com/tools/wxid ，或在公众号文章网页源码搜 `var user_name`（`gh_` 开头）。
- **合规**：正文受原作者版权。建议入库正文仅作数据源，对外展示给摘要 + 原文链接，勿全文转载当原创内容发布。

## 文件

```
cimidata/
├── client.mjs      核心客户端（CimiClient 类 + HOT_CATEGORIES）
├── examples.mjs    用法示例
├── README.md       本文件
├── .env.example    凭证模板
└── .env            本地凭证（gitignored，勿提交）
```
