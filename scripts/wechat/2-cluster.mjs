// 2) 聚类：DeepSeek 对源文池语义聚类，产出适合写英文中国旅游常青指南的主题簇（每簇 3-6 篇）。
// 数据源：data/sources.json（读最近 N 天，无需重爬）。
// 用法：node scripts/wechat/2-cluster.mjs --days 14 --max-clusters 8

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DeepSeek } from './deepseek.mjs'
import { DATA_DIR } from './lib/env.mjs'
import { fetchSources } from './lib/sources.mjs'

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i === -1 ? def : process.argv[i + 1]
}
const MAX_CLUSTERS = Number(arg('--max-clusters', 8))
const DAYS = Number(arg('--days', 14))

mkdirSync(DATA_DIR, { recursive: true })
const OUT = join(DATA_DIR, 'clusters.json')

const sources = await fetchSources({ sinceDays: DAYS, minBodyLen: 200 })
console.log(`读取源文最近 ${DAYS} 天：${sources.length} 篇（Supabase dc_wx_sources 或本地 sources.json）`)
// 给模型的精简清单（不含全文，省 token）
const list = sources.map((s, i) => ({ id: i, account: s.account, title: s.title, digest: (s.digest || '').slice(0, 80) }))

// 站内真实标签词（取自现有文章 tags），提示模型 tags 向其靠拢，便于站内内链聚合
const PILLAR_TAGS = [
  'nature', 'culture', 'history', 'food', 'itinerary', 'hiking', 'photography',
  'destinations', 'day-trip', 'accommodation', 'coastal', 'urban', 'adventure', 'cycling',
  'buddhism', 'silk-road', 'minority-cultures', 'UNESCO heritage',
  // 地区/省份
  'beijing', 'shanghai', 'sichuan', 'yunnan', 'guangdong', 'guizhou', 'guangxi',
  'tibet', 'xinjiang', 'gansu', 'shaanxi', 'henan', 'fujian', 'zhejiang', 'jiangsu',
  'chengdu', 'xian', 'chongqing', 'guangzhou', 'hong-kong',
  // 大区
  'north-china', 'east-china', 'south-china', 'southwest-china', 'northwest-china', 'northeast-china'
]

const ds = new DeepSeek()

const sys = `You are a senior editor at an English-language China travel guide site (international travellers planning trips to mainland China).
Below is a batch of articles crawled from Chinese travel WeChat accounts (title + digest only, in Chinese).
Task: cluster them by topic into themes that can each be written up as an EVERGREEN English China-travel guide.

Requirements:
1. Each cluster picks 3-6 semantically related source articles that complement each other (give their ids).
2. Exclude: time-sensitive news, promotions/ads, recruitment, anything with no lasting travel value (don't force weak clusters).
3. Prefer evergreen angles useful to foreign visitors: destination guides, itineraries, food, culture, practical how-to (visas, payment, transport, booking) — not one-off events.
4. Tags should map to these real on-site tags where relevant (for internal linking): ${PILLAR_TAGS.join(', ')}.
5. At most ${MAX_CLUSTERS} clusters. Quality over quantity.

Return ONLY JSON:
{"clusters":[{
  "topic":"short English topic name",
  "working_title":"proposed English article title (compelling, not clickbait)",
  "angle":"what makes this article distinct / what the reader gets (one sentence)",
  "source_ids":[array of ints],
  "suggested_category":"one of: destination|itinerary|food|culture|practical",
  "suggested_tags":["english lowercase tags, prefer the on-site tags above"],
  "suggested_level":"beginner|intermediate|advanced"
}]}`

console.log(`对 ${list.length} 篇源文聚类（最多 ${MAX_CLUSTERS} 簇）…`)
const out = await ds.chatJSON(
  [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(list) }],
  { maxTokens: 4000 }
)

// 可观测性：0 簇时区分“模型返回空”“被过滤砍光”“结构异常”，避免静默退出甩锅给下游。
const rawClusters = Array.isArray(out.clusters) ? out.clusters : []
const clusters = rawClusters.filter(c => Array.isArray(c.source_ids) && c.source_ids.length >= 2)
const dropped = rawClusters.length - clusters.length
if (dropped > 0) console.log(`⚠️  模型返回 ${rawClusters.length} 簇，过滤掉 ${dropped} 簇（source_ids 不足 2 篇）`)
if (clusters.length === 0) {
  if (!Array.isArray(out.clusters)) console.log(`⚠️  模型返回结构异常，无 clusters 数组。顶层 keys: ${Object.keys(out).join(', ')}`)
  console.log('⚠️  0 簇。模型原始返回（前 800 字）：', JSON.stringify(out).slice(0, 800))
}
// 回填源文引用（sn / title），供下一步取全文
for (const c of clusters) {
  c.sources = c.source_ids.map(id => sources[id]).filter(Boolean).map(s => ({ sn: s.sn, account: s.account, title: s.title }))
}

writeFileSync(OUT, JSON.stringify(clusters, null, 2))
console.log(`\n产出 ${clusters.length} 个主题簇 → ${OUT}`)
for (const c of clusters) console.log(`  · [${c.suggested_category}] ${c.working_title}  (${c.source_ids.length} 源文)`)
console.log('用量:', ds.costEstimate())
console.log('⚠️  请打开 clusters.json 审一遍主题归并是否合理，再跑 3-synthesize.mjs')
