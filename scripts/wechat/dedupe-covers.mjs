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

const files = readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'))

// 第一遍：建全站已用图 URL 全集 + 每篇封面映射
const allUsedUrls = new Set()
const coverOf = []
for (const f of files) {
  const fp = join(POSTS_DIR, f)
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

// 保底层：精确景点搜不到时，用「省份 + 中国风光」宽泛词强制取一张未用过的图。
// 放宽相关性（偏门小城无对应景点图），只保证“全站不重复”。失败返回 null。
async function fallbackAny(geo) {
  const broad = [
    geo ? `${geo} China landscape` : '', geo ? `${geo} scenery` : '',
    'China landscape mountains', 'China scenery nature', 'China traditional architecture',
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
for (const c of toReplace) {
  const title = fmField(c.fm, 'title')
  const tags = fmTags(c.fm)
  const kw = subjectOf(title, tags)
  const geo = (tags || []).find(t => /^[a-z-]+$/.test(t) && !GEO_SKIP.includes(t)) || ''
  let hit = await finder.find(kw, title)
  // normId 守卫：find() 只按完整 URL 去重，但同图不同 query（旧 ?w=1200&q=85 vs 新 ?...&fit=crop）
  // 会漏判 → 归一化已撞则丢弃，转保底层重取一张真正未用过的图。
  if (hit && finder.used.has(normId(hit.url))) hit = null
  if (!hit) { hit = await fallbackAny(geo); if (hit) fb++ }
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
