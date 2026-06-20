// 全站封面 ogImage 去重：同一张图被多篇用作封面时，保留首篇（按 slug 升序），
// 其余文章按「标题主景点 + 地名」重搜一张**全站未用过**的新图替换 ogImage。
// 正文图不动。finder.used 预填全站所有图 URL（封面+正文），保证重搜不再撞任何已用图。
//
// 用法：
//   node scripts/wechat/dedupe-covers.mjs --dry-run     # 只报告将替换哪些
//   node scripts/wechat/dedupe-covers.mjs --limit 40    # 实改前 N 篇（Pexels 200/时限流）
//   node scripts/wechat/dedupe-covers.mjs               # 实改全部

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ImageFinder } from './lib/images.mjs'
import { POSTS_DIR } from './lib/env.mjs'

const DRY = process.argv.includes('--dry-run')
const li = process.argv.indexOf('--limit')
const LIMIT = li >= 0 ? Number(process.argv[li + 1]) : null

// 去重范围：destinations + toolkit 两个发布目录（同站渲染，封面须跨目录唯一）。
// POSTS_DIR 指向 .../posts/destinations；toolkit 是其同级目录。
const CONTENT_DIRS = [POSTS_DIR, join(POSTS_DIR, '..', 'toolkit')]
function listMd() {
  const out = []
  for (const dir of CONTENT_DIRS) {
    try { for (const f of readdirSync(dir)) if (f.endsWith('.md')) out.push(join(dir, f)) }
    catch { /* 目录不存在跳过 */ }
  }
  return out
}

const normId = u => (u || '').replace(/\?.*$/, '')   // 去 query，判“同一张图”

function splitDoc(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  return m ? { fm: m[1], body: m[2] } : null
}
function fmField(fm, name) {
  const m = fm.match(new RegExp(`^${name}:\\s*"?(.+?)"?\\s*$`, 'm'))
  return m ? m[1] : ''
}
function fmTags(fm) {
  const m = fm.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m)
  if (!m) return []
  return [...m[1].matchAll(/-\s*"?(.+?)"?\s*$/gm)].map(x => x[1].trim())
}
const TITLE_STOP = /\b(guide|complete|ultimate|travel|itinerary|tips|best|the|a|an|of|to|in|and|how|when|where|getting|there|days?|day|2025|2026)\b/gi
const clean = s => (s || '').replace(TITLE_STOP, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim()
const GEO_SKIP = ['destinations', 'nature', 'culture', 'history', 'food', 'itinerary', 'hiking', 'photography', 'adventure', 'coastal', 'urban']
function subjectOf(title, tags) {
  const head = (title || '').split(/[:：|—-]/)[0]
  const s = clean(head) || head.trim()
  let geo = (tags || []).find(t => /^[a-z-]+$/.test(t) && !GEO_SKIP.includes(t)) || ''
  if (geo && new RegExp(`\\b${geo}\\b`, 'i').test(s)) geo = ''
  return [s, geo].filter(Boolean).join(' ').trim()
}

const files = listMd()   // 完整路径（destinations + toolkit）

// 第一遍：建全站已用图 URL 全集 + 每篇封面映射
const allUsedUrls = new Set()
const coverOf = []
for (const fp of files) {
  const f = fp.split('/').pop()
  const raw = readFileSync(fp, 'utf8')
  const doc = splitDoc(raw)
  if (!doc) continue
  const og = (doc.fm.match(/^ogImage:\s*"?([^"\n]+)"?/m) || [])[1] || ''
  if (og) allUsedUrls.add(og.trim())
  for (const m of doc.body.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)) allUsedUrls.add(m[1].trim())
  coverOf.push({ file: f, slug: f.replace(/\.md$/, ''), coverRaw: og.trim(), coverNorm: normId(og.trim()), fm: doc.fm, body: doc.body, fp })
}

// 第二遍：按 coverNorm 分组，首篇保留，其余待替换
const byCover = new Map()
for (const c of coverOf) {
  if (!c.coverNorm) continue
  if (!byCover.has(c.coverNorm)) byCover.set(c.coverNorm, [])
  byCover.get(c.coverNorm).push(c)
}
let toReplace = []
for (const [, group] of byCover) {
  if (group.length < 2) continue
  group.sort((a, b) => a.slug.localeCompare(b.slug))
  toReplace.push(...group.slice(1))
}
toReplace.sort((a, b) => a.slug.localeCompare(b.slug))
if (LIMIT) toReplace = toReplace.slice(0, LIMIT)

console.log(`全站 ${coverOf.length} 篇，重复封面需替换 ${toReplace.length} 篇${DRY ? '（dry-run）' : ''}\n`)

const finder = new ImageFinder()
if (!finder.enabled) { console.error('⚠️ 未配置图片 API key'); process.exit(1) }
for (const u of allUsedUrls) { finder.used.add(u); finder.used.add(normId(u)) }

// 深搜保底：直接打 Pexels（per_page=80 + 翻页），绕过 8 张/词的缓存上限，
// 为泛主题/偏门文章兜出一张全站未用过的图。仅在常规 find + broad 都枯竭时调用。
const PK = process.env.PEXELS_API_KEY
async function deepSearch(queries) {
  if (!PK) return null
  for (const q of queries.filter(Boolean)) {
    for (let page = 1; page <= 4; page++) {
      let json
      try {
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=80&page=${page}&orientation=landscape`
        const res = await fetch(url, { headers: { Authorization: PK } })
        if (res.status === 429) return null
        if (!res.ok) break
        json = await res.json()
      } catch { break }
      const photos = json.photos || []
      if (!photos.length) break
      for (const p of photos) {
        const u = p.src?.large || p.src?.original
        if (u && !finder.used.has(u) && !finder.used.has(normId(u))) {
          finder.used.add(u); finder.used.add(normId(u)); finder.stats.pexels++
          return { url: u, source: 'pexels**' }   // ** 深搜兜底
        }
      }
    }
  }
  return null
}

// 保底层：精确景点搜不到时，用大量多样化「中国主题」宽泛词强制取一张未用过的图。
// 放宽相关性（偏门小城/泛主题文章无对应景点图），只保证“全站不重复”。
// 词池足够大且按 seed 旋转，避免不同文章都从同一词头部抢图导致很快枯竭。
const BROAD_POOL = [
  'China landscape mountains', 'China scenery nature', 'China traditional architecture',
  'China temple pagoda', 'China ancient town', 'China rice terraces', 'China river valley',
  'China lake reflection', 'China bamboo forest', 'China tea plantation', 'China great wall',
  'China misty mountains', 'China village countryside', 'China lanterns festival',
  'China garden classical', 'China waterfall nature', 'China snow winter scenery',
  'China autumn foliage', 'China desert dunes', 'China grassland prairie',
  'China city skyline night', 'China old street', 'China stone bridge canal',
  'Chinese new year decoration', 'China karst hills', 'China sunrise peak',
]
async function fallbackAny(geo, seed = '') {
  // 省份优先 + 词池按 seed 旋转（不同文章错开起点）
  const rot = (seed || '').length % BROAD_POOL.length
  const rotated = [...BROAD_POOL.slice(rot), ...BROAD_POOL.slice(0, rot)]
  const broad = [
    geo ? `${geo} China landscape` : '', geo ? `${geo} scenery` : '', geo ? `${geo} China city` : '',
    ...rotated,
  ].filter(Boolean)
  for (const source of finder.sources) {
    if (finder.disabled.has(source.name)) continue
    for (const q of broad) {
      const photos = await finder._search(source, q)
      const pick = photos.find(p => !finder.used.has(p.url) && !finder.used.has(normId(p.url)))
      if (pick) {
        finder.used.add(pick.url); finder.used.add(normId(pick.url))
        finder.stats[source.name]++
        if (source.name === 'unsplash') await finder._pingDownload(pick.downloadLocation)
        return { url: pick.url, source: source.name + '*' } // * 标记保底（非精确景点）
      }
    }
  }
  return null
}

let done = 0, missed = 0, fb = 0

// 预取共享 fresh 池：循环前用多样化中国主题词深搜翻页，集中收集 N 张全站未用过的图入队。
// 解决“逐篇深搜时结果大量已被前文用光”——把搜图与分配解耦，剩余泛主题文章直接出队，零重复。
const freshQueue = []
async function prefetchFresh(need) {
  if (!PK || need <= 0) return
  const seeds = [...BROAD_POOL,
    'Beijing landmark', 'Shanghai skyline', 'China high speed train', 'China airport terminal',
    'China night market', 'China mountain temple', 'China spring blossom', 'China summer coast',
    'Chinese street food', 'China panda', 'China silk road', 'China forbidden city',
    'China west lake', 'China yangtze river', 'China terracotta', 'China modern architecture']
  for (const q of seeds) {
    if (freshQueue.length >= need) break
    for (let page = 1; page <= 5 && freshQueue.length < need; page++) {
      let json
      try {
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=80&page=${page}&orientation=landscape`
        const res = await fetch(url, { headers: { Authorization: PK } })
        if (res.status === 429) return
        if (!res.ok) break
        json = await res.json()
      } catch { break }
      const photos = json.photos || []
      if (!photos.length) break
      for (const p of photos) {
        const u = p.src?.large || p.src?.original
        if (u && !finder.used.has(u) && !finder.used.has(normId(u))) {
          finder.used.add(u); finder.used.add(normId(u))
          freshQueue.push(u)
        }
      }
    }
  }
}
// 先估算可能走兜底的篇数（无 geo 的泛主题），预取略多于此
if (!DRY) await prefetchFresh(toReplace.length)

for (const c of toReplace) {
  const title = fmField(c.fm, 'title')
  const tags = fmTags(c.fm)
  const kw = subjectOf(title, tags)
  const geo = (tags || []).find(t => /^[a-z-]+$/.test(t) && !GEO_SKIP.includes(t)) || ''
  let hit = await finder.find(kw, title)
  // normId 守卫：find() 只按完整 URL 去重，但同图不同 query（旧 ?w=1200&q=85 vs 新 ?...&fit=crop）
  // 会漏判 → 归一化已撞则丢弃，转保底层重取一张真正未用过的图。
  if (hit && finder.used.has(normId(hit.url))) hit = null
  if (!hit) { hit = await fallbackAny(geo, c.slug); if (hit) fb++ }
  // 终极兜底：常规 + broad 都枯竭 → 深搜翻页（景点词 → 省份 → 通用 China 主题）
  if (!hit) {
    hit = await deepSearch([kw, geo ? `${geo} China` : '', 'China travel landmark', 'China landscape', 'Chinese culture architecture'])
    if (hit) fb++
  }
  // 最终兜底：从预取的共享 fresh 池出队一张唯一图（泛主题文章保证零重复）
  if (!hit && freshQueue.length) {
    const u = freshQueue.shift()
    hit = { url: u, source: 'pexels(pool)' }
    fb++
  }
  if (!hit) { console.log(`✗ 未搜到新图（保留原图）: ${c.slug}  [kw: ${kw}]`); missed++; continue }
  finder.used.add(hit.url); finder.used.add(normId(hit.url))
  console.log(`${DRY ? '将替换' : '✓'} ${c.slug}  [kw: ${kw}] → ${hit.source} ${normId(hit.url).slice(-40)}`)
  if (DRY) { done++; continue }
  const newFm = c.fm.replace(/^ogImage:.*$/m, `ogImage: "${hit.url}"`)
  writeFileSync(c.fp, `---\n${newFm}\n---\n${c.body}`)
  done++
}

console.log(`\n${DRY ? '(dry-run) ' : ''}替换 ${done} 篇（其中保底层 ${fb} 篇），未命中保留 ${missed} 篇`)
console.log('配图来源:', finder.stats)
