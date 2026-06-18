// 3) 合成：逐簇取成员源文全文（中文），DeepSeek 综合提炼 + 翻译，产出一篇全新原创**英文**
//    中国旅游常青指南（本站 Markdown 方言 + frontmatter 字段）。
// 用法：node scripts/wechat/3-synthesize.mjs
//       node scripts/wechat/3-synthesize.mjs --limit 3   # 只合成前 3 簇试跑

import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DeepSeek } from './deepseek.mjs'
import { truncate } from './lib/clean-html.mjs'
import { uniqueSlug } from './lib/slug.mjs'
import { loadExistingPosts, isDuplicate } from './lib/dedup.mjs'
import { fetchSources } from './lib/sources.mjs'
import { DATA_DIR, POSTS_DIR } from './lib/env.mjs'

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i === -1 ? def : process.argv[i + 1]
}

// meta description 兜底裁剪到 ≤160（质量闸门上限 165，留余量）：按词边界截断，不留半词/省略号。
function clampDesc(s, max = 160) {
  const desc = (s || '').trim()
  if (desc.length <= max) return desc
  const cut = desc.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, '')
}
const LIMIT = arg('--limit', null) ? Number(arg('--limit', null)) : null
const DAYS = Number(arg('--days', 14))

const CLU = join(DATA_DIR, 'clusters.json')
const OUT = join(DATA_DIR, 'drafts.json')
if (!existsSync(CLU)) { console.error('缺少 clusters.json，先跑 2-cluster.mjs'); process.exit(1) }

// 站内现有 slug = src/content/posts/destinations 下的 .md 文件名（去后缀），用于查重
function existingSlugs() {
  const set = new Set()
  try {
    for (const f of readdirSync(POSTS_DIR)) {
      if (f.endsWith('.md') || f.endsWith('.mdx')) set.add(f.replace(/\.mdx?$/, ''))
    }
  } catch { /* 目录不存在则空集 */ }
  return set
}

const sources = await fetchSources({ sinceDays: DAYS })
const bySn = new Map(sources.map(s => [s.sn, s]))
let clusters = JSON.parse(readFileSync(CLU, 'utf8'))
if (LIMIT) clusters = clusters.slice(0, LIMIT)

const ds = new DeepSeek()
const existing = existingSlugs()
console.log(`站内现有 ${existing.size} 篇文章 slug。开始合成 ${clusters.length} 篇 …\n`)

const SYS = `You are a seasoned travel writer for Roam China Travel — an English-language guide for international travellers visiting mainland China.
You will be given several Chinese WeChat travel articles on one topic as REFERENCE MATERIAL. Synthesize them into a brand-new, well-structured, ORIGINAL ENGLISH article.

IRON RULES:
1. This is original synthesis + translation, NOT a literal translation or rewrite of any single source. Never copy/paraphrase any one source paragraph-by-paragraph. Re-organise, distil the consensus, add your own logical framework. The output must read as native English written for foreigners — no leftover Chinese, no "本文/小编/公众号".
2. Write for an INTERNATIONAL audience visiting China. Proactively cover what foreigners need: best time to visit, how to get there, getting around (metro/high-speed rail), tickets/booking, mobile payment (Alipay/WeChat Pay), visa/144-hour transit where relevant, money, etiquette. Use Chinese place names with pinyin and characters on first mention, e.g. West Lake (西湖, Xī Hú).
3. Body in Markdown, following this site dialect:
   - Sections use ## and ###; bullet points use - ; steps use ordered lists.
   - The FIRST line of the body after a short intro paragraph must be exactly "## Table of contents" on its own (it is auto-filled — leave it empty).
   - Tables use | pipes |. Bold key terms with **...**. Prices like ¥120.
   - No fabricated facts: do not invent ticket prices, opening hours, or URLs you are unsure of — describe them qualitatively instead.
   - Be thorough and specific: include concrete sections such as top sights, suggested day-by-day routing, getting there & around, where to stay, food, best time to visit, costs, and practical tips. Aim for genuine depth, not padding.
4. Naturally weave in 2-4 internal links as Markdown links to relevant on-site tag hubs, choosing paths from this whitelist by relevance (do NOT invent other paths):
   /tags/itinerary, /tags/food, /tags/culture, /tags/history, /tags/nature, /tags/hiking, /tags/beijing, /tags/shanghai, /tags/sichuan, /tags/yunnan, /tags/guangdong, /tags/tibet, /tags/north-china, /tags/east-china, /tags/southwest-china
   e.g. For more routes, see our [China itineraries](/tags/itinerary).
5. Insert 3-5 inline images at natural points in the body (after the intro/first major section, then spread through). Use EXACTLY this placeholder syntax — do NOT invent image URLs (real URLs are filled in later):
   ![descriptive alt text of the scene](IMG: short comma-separated visual keywords)
   - The alt text must be a specific, vivid description of what the photo shows (like a caption).
   - The IMG keywords name the subject for image selection, e.g. (IMG: dunhuang desert dunes, camel) or (IMG: west lake hangzhou, pagoda). Prefer the destination + a concrete subject.
   - Do not put images inside tables or the FAQ.
6. Body length: 1800-2500 English words. Write a rich, genuinely useful guide at the upper end of that range.

Return ONLY JSON:
{
 "slug":"clean-lowercase-hyphenated-slug, max 6 words, start with the place/topic, NO date, NO random suffix (e.g. northwest-china-landscapes-guide)",
 "title":"English title (50-70 chars, compelling, includes the destination)",
 "description":"English meta description, STRICTLY 140-158 characters (never exceed 160), one sentence, no trailing ellipsis",
 "content":"full Markdown body (starts with a short intro paragraph, then '## Table of contents', includes 3-5 ![alt](IMG: ...) image placeholders)",
 "tags":["english lowercase tags, prefer on-site tags"],
 "faq":[{"question":"...","answer":"..."}],  // >= 3 pairs, foreigner-relevant
 "level":"beginner|intermediate|advanced",
 "estimated_minutes":int,
 "category":"destination|itinerary|food|culture|practical"
}`

const drafts = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const doneTopics = new Set(drafts.map(d => d._topic))

// 库内已发布文章（dc_posts 镜像）——合成前判重的依据。无库则为 null（仅站内 slug 兜底）。
const existingPosts = await loadExistingPosts()
if (existingPosts) console.log(`判重库：dc_posts 已有 ${existingPosts.length} 篇\n`)
let skippedDup = 0

for (const c of clusters) {
  if (doneTopics.has(c.topic)) { console.log(`✓ 已合成跳过: ${c.topic}`); continue }
  const members = (c.sources || []).map(s => bySn.get(s.sn)).filter(Boolean)
  if (members.length < 2) { console.log(`✗ 源文不足跳过: ${c.topic}`); continue }

  // 判重：与库内已有文章实质重复则跳过（省合成费 + 防伤 SEO）
  const dup = await isDuplicate(c, existingPosts, ds)
  if (dup.dup) { console.log(`⊘ 判重跳过: ${c.working_title}  [${dup.reason}] ↔ ${dup.match || ''}`); skippedDup++; continue }

  const material = members
    .map((m, i) => `### Source ${i + 1}: ${m.title}（WeChat account: ${m.account}）\n${truncate(m.body_text, 5000)}`)
    .join('\n\n---\n\n')

  const userMsg = `Topic: ${c.topic}\nWorking title: ${c.working_title}\nAngle: ${c.angle}\nSuggested category: ${c.suggested_category}\nSuggested tags: ${(c.suggested_tags || []).join(', ')}\nSuggested level: ${c.suggested_level || 'intermediate'}\n\nReference material (Chinese):\n\n${material}`

  console.log(`合成中: ${c.working_title}  (${members.length} 源文)`)
  try {
    const d = await ds.chatJSON([{ role: 'system', content: SYS }, { role: 'user', content: userMsg }], { maxTokens: 12000, temperature: 0.6 })
    d.slug = uniqueSlug(d.slug || c.working_title, existing)
    d.description = clampDesc(d.description)
    // 用建议值兜底
    d.category = d.category || c.suggested_category || 'destination'
    d.level = d.level || c.suggested_level || 'intermediate'
    d.tags = Array.isArray(d.tags) && d.tags.length ? d.tags : (c.suggested_tags || [])
    d.faq = Array.isArray(d.faq) ? d.faq : []
    d.estimated_minutes = d.estimated_minutes || Math.max(5, Math.round((d.content || '').split(/\s+/).length / 200))
    // provenance：记录来源，备查与合规追溯（不入文章，仅留 data/）
    d._topic = c.topic
    d._sources = members.map(m => ({ sn: m.sn, account: m.account, title: m.title, url: m.content_url }))
    drafts.push(d)
    writeFileSync(OUT, JSON.stringify(drafts, null, 2))
    console.log(`  ✓ ${d.slug}  ${(d.content || '').length} 字符  ${(d.faq || []).length} FAQ`)
  } catch (e) {
    console.log(`  ✗ 合成失败: ${e.message}`)
  }
}

console.log(`\n已写入 ${OUT}（共 ${drafts.length} 篇草稿，本次判重跳过 ${skippedDup}）`)
console.log('用量:', ds.costEstimate())
console.log('⚠️  抽查 drafts.json 1-2 篇（原创度/英文质量/frontmatter/FAQ/字数），再跑 4-publish.mjs')
