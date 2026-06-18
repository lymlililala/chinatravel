// 次幂数据 client 用法示例 —— 直接运行：node examples.mjs
// 注意：每次调用都会消耗余额（见下方计费），跑前心里有数。

import { CimiClient, HOT_CATEGORIES } from './client.mjs'

const cimi = new CimiClient()

// 0) 换取 token（其余方法会自动换，这里仅演示）
await cimi.authenticate()
console.log('已获取 token，余额:', cimi.balance)

// 1) 关键词 → 文章（v3，带公众号信息，分页 1-5）
const articles = await cimi.searchArticles('AI 工具', { page: 1 })
console.log('\n[关键词搜文章] 共', articles.length, '篇')
for (const a of articles.slice(0, 3)) {
  console.log(' -', a.nickname, '|', stripHtml(a.title))
}

// 1b) 翻页迭代器（自动翻 page 1..5）
// for await (const a of cimi.iterSearchArticles('AI 工具', { maxPages: 3 })) { ... }

// 2) 关键词 → 公众号（拿 wxid）
const accounts = await cimi.searchAccounts('AI 工具')
console.log('\n[搜公众号] 共', accounts.length, '个')
const target = accounts[0]
if (target) console.log(' 选中:', target.nickname, target.wxid)

// 3) 指定公众号 → 历史文章（翻页迭代器）
if (target?.wxid) {
  console.log('\n[历史文章]')
  let n = 0
  for await (const a of cimi.iterAccountHistory(target.wxid, { maxPages: 1 })) {
    console.log(' -', a.published_at, stripHtml(a.title))
    if (++n >= 5) break
  }
}

// 4) 取正文（只正文 HTML，入库用这个）
if (articles[0]) {
  const html = await cimi.articleBody(articles[0].content_url)
  console.log('\n[正文] 长度:', html.length, '字符')
}

// 5) 选题 / 爆文（按类目）
const { items: hot } = await cimi.hotArticles({ category: 'ai', readNum: 10000 })
console.log('\n[AI 爆文] 共', hot.length, '篇；可用类目:', Object.keys(HOT_CATEGORIES).length, '个')

console.log('\n剩余余额:', cimi.balance)

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '')
}
