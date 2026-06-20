// 1b) 关键词搜索采集：用次幂 searchArticles 按「主题关键词」搜文章 → 拉正文 → 入库
//     （与 1-crawl 按号采集平行）。同时按主题产出聚焦的 data/clusters.json，
//     可直接接 3-synthesize / 4-publish，无需先跑 2-cluster 的全池自动聚类。
//
// 用法：
//   node scripts/wechat/1-search.mjs                 # 跑内置 THEMES（足球/世界杯专题）
//   node scripts/wechat/1-search.mjs --max-pages 2   # 每个关键词翻几页（1-5）
//   node scripts/wechat/1-search.mjs --per-cluster 5 # 每个主题最多取几篇做源文
//   node scripts/wechat/1-search.mjs --no-clusters   # 只入库，不写 clusters.json
//
// 产物：入库 dc_wx_sources（或本地 sources.json）+ data/clusters.json。

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CimiClient } from './cimidata/client.mjs'
import { htmlToText } from './lib/clean-html.mjs'
import { DATA_DIR } from './lib/env.mjs'
import { existingSns, upsertSources } from './lib/sources.mjs'

function arg(name, def) {
  const i = process.argv.indexOf(name)
  if (i === -1) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const MAX_PAGES = Number(arg('--max-pages', 2))
const PER_CLUSTER = Number(arg('--per-cluster', 5))
const NO_CLUSTERS = arg('--no-clusters', false) === true

// ── 专题定义 ─────────────────────────────────────────────────────────────────
// 每个主题 = 一组检索关键词 + 一篇英文常青指南的编辑元信息（喂给 3-synthesize）。
// 站点定位：面向来中国大陆的外国游客 → 世界杯角度取「中国侧」（村超/苏超/中国观赛热），
// 不取「出境去美加墨」（与站点反方向、无 SEO 价值）。
const THEMES = [
  {
    topic: 'Cun Chao village football Guizhou',
    keywords: ['村超', '榕江 村超', '贵州 村超 旅游'],
    working_title: "Cun Chao: Inside Guizhou's Viral Village Super League",
    angle: "How a rural football league in Rongjiang, Guizhou exploded into a cultural-tourism phenomenon — and how foreign travellers can experience the matches, food and Miao/Dong culture around it.",
    suggested_category: 'culture',
    suggested_tags: ['guizhou', 'culture', 'southwest-china', 'food', 'minority-cultures'],
    suggested_level: 'intermediate',
  },
  {
    topic: 'Su Super League Jiangsu city football',
    keywords: ['苏超', '江苏城市足球联赛', '苏超 旅游'],
    working_title: 'The Su Super League: Football, City Rivalries & Travel Across Jiangsu',
    angle: "Jiangsu's amateur city football league (苏超) turned matchdays into a province-wide travel craze — a visitor's guide to the cities, derbies, food and how to catch a game.",
    suggested_category: 'culture',
    suggested_tags: ['jiangsu', 'culture', 'east-china', 'food', 'urban'],
    suggested_level: 'intermediate',
  },
  {
    topic: 'China and the 2026 World Cup viewing fan culture',
    keywords: ['世界杯 中国', '世界杯 观赛 城市', '2026世界杯 中国元素'],
    working_title: 'China & the 2026 World Cup: Where to Watch and the Football-Travel Boom',
    angle: "China's men didn't qualify, but the country is all over the 2026 World Cup — referees, brands, late-night viewing parties and a homegrown football-tourism wave. A guide for visitors in China riding the buzz.",
    suggested_category: 'culture',
    suggested_tags: ['culture', 'urban', 'food', 'itinerary', 'china'],
    suggested_level: 'beginner',
  },
]

function snOf(url) {
  const m = url.match(/[?&]sn=([0-9a-f]+)/i)
  return m ? m[1] : url
}
const stripTags = s => (s || '').replace(/<[^>]+>/g, '').trim()

mkdirSync(DATA_DIR, { recursive: true })
const cimi = new CimiClient()

const seen = await existingSns()
console.log(`库中已有 ${seen.size} 篇。搜索 ${THEMES.length} 个专题，每关键词最多 ${MAX_PAGES} 页\n`)

const fresh = new Map()   // sn -> rec（本次新发现、需拉正文）
const themeHits = []      // 每主题命中的 sn 列表（含已在库的，供建簇）

for (const th of THEMES) {
  const sns = []
  for (const kw of th.keywords) {
    let items = []
    try {
      for await (const it of cimi.iterSearchArticles(kw, { maxPages: MAX_PAGES })) items.push(it)
    } catch (e) {
      console.log(`  ✗ [${kw}] ${e.message}`)
    }
    let added = 0
    for (const it of items) {
      if (!it.content_url) continue
      const sn = snOf(it.content_url)
      if (!sns.includes(sn)) sns.push(sn)
      if (seen.has(sn) || fresh.has(sn)) continue
      fresh.set(sn, {
        sn,
        account: stripTags(it.nickname) || '微信公众号',
        wxid: it.usename || '',
        title: stripTags(it.title),
        digest: '',
        content_url: it.content_url,
        published_at: it.published_at || new Date().toISOString(),
        body_text: '',
      })
      added++
    }
    console.log(`  [${th.topic.slice(0, 20)}] ${kw}: ${items.length} 命中，新增 ${added}`)
  }
  themeHits.push({ ...th, sns })
}

// ── 拉正文（仅本次新发现的）──────────────────────────────────────────────────
const recs = [...fresh.values()]
console.log(`\n拉取正文 ${recs.length} 篇 …`)
let n = 0
for (const s of recs) {
  try {
    s.body_text = htmlToText(await cimi.articleBody(s.content_url))
  } catch (e) {
    console.log(`  正文失败 [${s.account}] ${s.title.slice(0, 18)}: ${e.message}`)
  }
  if (++n % 15 === 0) {
    await upsertSources(recs.filter(r => r.body_text))
    console.log(`  …${n}/${recs.length}  余额 ${cimi.balance}`)
  }
}
const written = await upsertSources(recs.filter(r => r.body_text))
console.log(`写入 ${written} 篇（新发现 ${recs.length}），余额 ${cimi.balance}`)

// ── 建聚焦 clusters.json ──────────────────────────────────────────────────────
if (!NO_CLUSTERS) {
  // 正文长度查表（本次拉的有 body_text；已在库的当作够长，留给 3-synthesize 的 fetchSources 兜底）
  const lenBySn = new Map(recs.map(r => [r.sn, (r.body_text || '').length]))
  const clusters = []
  for (const th of themeHits) {
    // 优先正文长（信息量大）的源文；未拉正文（已在库）的排后但仍纳入
    const ranked = [...th.sns].sort((a, b) => (lenBySn.get(b) ?? 99999) - (lenBySn.get(a) ?? 99999))
    const picked = ranked
      .filter(sn => (lenBySn.get(sn) ?? 99999) >= 200)   // 太短的（赛程通告等）丢弃
      .slice(0, PER_CLUSTER)
    if (picked.length < 2) {
      console.log(`  ⚠️  主题「${th.topic}」可用源文不足（${picked.length}），跳过建簇`)
      continue
    }
    clusters.push({
      topic: th.topic,
      working_title: th.working_title,
      angle: th.angle,
      suggested_category: th.suggested_category,
      suggested_tags: th.suggested_tags,
      suggested_level: th.suggested_level,
      source_ids: [],
      sources: picked.map(sn => {
        const r = fresh.get(sn)
        return { sn, account: r?.account || '', title: r?.title || '' }
      }),
    })
  }
  const OUT = join(DATA_DIR, 'clusters.json')
  writeFileSync(OUT, JSON.stringify(clusters, null, 2))
  console.log(`\n产出 ${clusters.length} 个专题簇 → ${OUT}`)
  for (const c of clusters) console.log(`  · [${c.suggested_category}] ${c.working_title}  (${c.sources.length} 源文)`)
  console.log('⚠️  接着跑：node scripts/wechat/3-synthesize.mjs --days 365  然后 4-publish.mjs')
}
