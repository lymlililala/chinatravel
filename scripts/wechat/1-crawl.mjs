// 1) 采集：逐号取历史文章列表 + 正文，写入 Supabase wx_sources（按 sn 去重，跨运行增量）。
// 用法：
//   node scripts/wechat/1-crawl.mjs --today          # 只采当天新文（日更用，省钱）
//   node scripts/wechat/1-crawl.mjs --since 2026-06-01
//   node scripts/wechat/1-crawl.mjs --max-pages 3    # 每号翻几页历史
//   node scripts/wechat/1-crawl.mjs --no-body        # 只列表不拉正文

import { readFileSync, existsSync } from 'node:fs'
import { CimiClient } from './cimidata/client.mjs'
import { htmlToText } from './lib/clean-html.mjs'
import { ACCOUNTS_FILE } from './lib/env.mjs'
import { existingSns, upsertSources } from './lib/sources.mjs'

function arg(name, def) {
  const i = process.argv.indexOf(name)
  if (i === -1) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const MAX_PAGES = Number(arg('--max-pages', 2))
const TODAY = arg('--today', false) === true
// --today 等价于 since = 今天 0 点
let SINCE = arg('--since', null)
if (TODAY) SINCE = new Date().toISOString().slice(0, 10)
const NO_BODY = arg('--no-body', false) === true

if (!existsSync(ACCOUNTS_FILE)) {
  console.error('缺少 accounts.json，请先跑 node scripts/wechat/accounts.mjs')
  process.exit(1)
}
const accounts = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8')).filter(a => a.wxid)

function snOf(url) {
  const m = url.match(/[?&]sn=([0-9a-f]+)/i)
  return m ? m[1] : url
}

// 库中已有的 sn → 去重，已采过的不再拉正文（省钱）
const seen = await existingSns()
console.log(`库中已有 ${seen.size} 篇。采集 ${accounts.length} 个号，每号最多 ${MAX_PAGES} 页${SINCE ? `，仅 ${SINCE} 之后` : ''}${NO_BODY ? '，跳过正文' : ''}\n`)

const cimi = new CimiClient()
const sinceTs = SINCE ? new Date(SINCE).getTime() : null
const fresh = new Map() // sn -> rec（本次新发现的）

for (const acc of accounts) {
  let got = 0
  try {
    for await (const item of cimi.iterAccountHistory(acc.wxid, { maxPages: MAX_PAGES })) {
      const sn = snOf(item.content_url)
      if (seen.has(sn) || fresh.has(sn)) continue
      if (sinceTs && new Date(item.published_at).getTime() < sinceTs) continue
      fresh.set(sn, {
        sn,
        account: acc.name,
        wxid: acc.wxid,
        title: item.title,
        digest: item.digest || '',
        content_url: item.content_url,
        published_at: item.published_at,
        body_text: ''
      })
      got++
    }
    console.log(`  ${acc.name}: 新增 ${got} 篇`)
  } catch (e) {
    console.log(`  ${acc.name}: 列表出错 ${e.message}`)
  }
}

const recs = [...fresh.values()]
let bodyCount = 0

// 拉正文
if (!NO_BODY) {
  console.log(`\n拉取正文 ${recs.length} 篇 …`)
  for (const s of recs) {
    try {
      const html = await cimi.articleBody(s.content_url)
      s.body_text = htmlToText(html)
      bodyCount++
    } catch (e) {
      console.log(`  正文失败 [${s.account}] ${s.title?.slice(0, 20)}: ${e.message}`)
    }
    if (bodyCount % 20 === 0 && bodyCount) {
      // 阶段性写库，防中断丢失（只写已拿到正文的）
      await upsertSources(recs.filter(r => r.body_text))
      console.log(`  …${bodyCount}/${recs.length}  余额 ${cimi.balance}`)
    }
  }
}

// 最终写库（有正文的入库；--no-body 时也写入元数据）
const toWrite = NO_BODY ? recs : recs.filter(r => r.body_text)
const written = await upsertSources(toWrite)
console.log(`\n写入 wx_sources：${written} 篇（本次新发现 ${recs.length}，拉正文 ${bodyCount}），余额 ${cimi.balance}`)
