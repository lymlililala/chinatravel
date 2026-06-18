// 4) 发布：质量闸门 + DeepSeek 英文自评分。过线 → 写 .md（draft:false，可见）；
//    否则 → 写 .md 但 draft:true（Astro 不渲染，便于人工复核后放行）。
// 用法：
//   node scripts/wechat/4-publish.mjs --dry-run     # 只打印评分与判定，不写文件
//   node scripts/wechat/4-publish.mjs               # 实际写 .md
//   node scripts/wechat/4-publish.mjs --threshold 75

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DeepSeek } from './deepseek.mjs'
import { checkQuality } from './lib/quality.mjs'
import { ImageFinder } from './lib/images.mjs'
import { DATA_DIR, POSTS_DIR } from './lib/env.mjs'
import { hasSupabase, getSupabase } from './lib/supabase.mjs'

function arg(name, def) {
  const i = process.argv.indexOf(name)
  if (i === -1) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const DRY = arg('--dry-run', false) === true
const THRESHOLD = Number(arg('--threshold', 82))
const MAX_PUBLISH = Number(arg('--max-publish', 4)) // 单次最多发布几篇（全自动护栏：防一晚灌水伤 SEO）

const AUTHOR = 'Roam China Travel Editorial Team'

// ── 配图 ───────────────────────────────────────────────────────────────────
// 图源用 Unsplash（与现有文章一致：?w=1200&q=85）。下面这些 photo ID 全部取自本站
// 现有文章、已验证可加载、且无防盗链问题（公众号 mmbiz 图防盗链，无法在本站显示，故不用）。
// 按主题分组；合成阶段产出的 ![alt](IMG: 关键词) 占位会按关键词匹配到最贴近的主题图。
// 注意：池中 ID 已逐个用 curl 验证返回 200（坏图会让文章配图空白）；新增 ID 前务必验证。
const IMG_THEMES = {
  mountains: ['1464822759023-fed622ff2c3b', '1506905925346-21bda4d32df4', '1513407030348-c983a97b98d8'],
  water_town: ['1570168007204-dfb528c6958f', '1531761535209-180857e963b9', '1516738901171-8eb4fc13bd20'],
  city: ['1474181487882-5abf3f0ba6c2', '1508804185872-d7badad00f7d', '1509316785289-025f5b846b35'],
  temple: ['1547981609-4b6bfe67ca0b', '1545569341-9eb8b30979d9', '1518241353330-0f7941c2d9b5'],
  desert: ['1473580044384-7ba9967e16a0', '1469474968028-56623f02e42e'],
  water: ['1507525428034-b723cf961d3e', '1499652848871-1527a310b13a'],
  food: ['1552566626-52f8b828add9', '1501854140801-50d01698950b'],
  nature: ['1437846972679-9e6e537be46e', '1490730141103-6cac27aaab94', '1497366216548-37526070297c'],
  village: ['1558618666-fcd25c85cd64', '1504457047772-27faf1c00561']
}
// 关键词 → 主题（占位 IMG 关键词命中其一即归入该主题）
const KEYWORD_THEME = [
  [/mountain|peak|cliff|gorge|karst|huangshan|zhangjiajie|tibet|himalaya|valley/i, 'mountains'],
  [/water.?town|canal|bridge|hongcun|wuzhen|zhujiajiao|suzhou|venice|ancient town|village lane/i, 'water_town'],
  [/city|skyline|urban|bund|shanghai|street|night|metro|building/i, 'city'],
  [/temple|pagoda|monastery|buddh|shrine|palace|forbidden|grotto|mural|dunhuang/i, 'temple'],
  [/desert|dune|gobi|sand|camel|mangya|yardang/i, 'desert'],
  [/lake|river|sea|coast|beach|west lake|waterfall|li river/i, 'water'],
  [/food|dish|noodle|dumpling|hotpot|cuisine|market|tea/i, 'food'],
  [/grassland|meadow|nalati|prairie|flower|rapeseed|forest|park|autumn/i, 'nature'],
  [/village|hutong|courtyard|rural|terrace/i, 'village']
]
const ALL_IDS = [...new Set(Object.values(IMG_THEMES).flat())]

function imgUrl(id) { return `https://images.unsplash.com/photo-${id}?w=1200&q=85` }

function themeFor(text) {
  for (const [re, theme] of KEYWORD_THEME) if (re.test(text)) return theme
  return null
}

/** 写死池兜底：给一段关键词/alt 文本挑一张不重复的图 URL（按 used 去重，确定性） */
function fallbackUrl(text, used, seed) {
  const theme = themeFor(text)
  const pool = (theme && IMG_THEMES[theme]) || ALL_IDS
  const fresh = pool.filter(id => !used.has(id))
  const pickFrom = fresh.length ? fresh : pool
  const id = pickFrom[seed % pickFrom.length]
  used.add(id)
  return imgUrl(id)
}

/**
 * 把正文里的 ![alt](IMG: keywords) 占位替换为真实图：优先 Pexels 按景点搜，
 * 未命中回退写死池。返回 {content, ogImage}。
 * @param {ImageFinder} finder  配图客户端（无 key 时 find() 恒返回 null → 全走兜底）
 */
async function resolveImages(content, tags, slug, finder) {
  const usedIds = new Set()      // 写死池已用 ID
  const firstImages = []          // 按出现顺序记录每张最终 URL（取第一张做封面）
  let seed = (slug || '').length

  const matches = [...(content || '').matchAll(/!\[([^\]]*)\]\(\s*IMG:\s*([^)]*)\)/gi)]
  let out = content || ''
  for (const m of matches) {
    const [whole, alt, kw] = m
    let url = null
    const hit = await finder.find(kw.trim(), alt.trim())
    if (hit) url = hit.url
    if (!url) url = fallbackUrl(`${kw} ${alt}`, usedIds, seed++)
    firstImages.push(url)
    out = out.replace(whole, `![${alt.trim()}](${url})`)
  }

  // 封面 ogImage：优先用正文第二张图，避免封面与正文首图重复（同一张图出现两次）；
  // 不足两张时退而用第一张；都没有则按 tags 选写死池一张。
  let ogImage = firstImages[1] || firstImages[0]
  if (!ogImage) {
    const t = (tags || []).map(x => themeFor(x)).find(Boolean)
    const pool = (t && IMG_THEMES[t]) || ALL_IDS
    ogImage = imgUrl(pool[(slug || '').length % pool.length])
  }
  return { content: out, ogImage }
}

// ── YAML frontmatter 输出（仅处理本流水线产出的字段，安全转义）──
function yamlString(s) {
  return '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').trim() + '"'
}

function buildFrontmatter({ title, description, pubDatetime, tags, ogImage, faq, featured, draft }) {
  const lines = ['---']
  lines.push(`author: ${yamlString(AUTHOR)}`)
  lines.push(`pubDatetime: ${pubDatetime}`)
  lines.push(`title: ${yamlString(title)}`)
  if (featured) lines.push('featured: true')
  lines.push(`draft: ${draft ? 'true' : 'false'}`)
  lines.push('tags:')
  for (const t of (tags && tags.length ? tags : ['others'])) lines.push(`  - ${yamlString(t)}`)
  lines.push(`description: ${yamlString(description)}`)
  lines.push(`ogImage: ${yamlString(ogImage)}`)
  if (faq && faq.length) {
    lines.push('faq:')
    for (const f of faq) {
      lines.push(`  - question: ${yamlString(f.question)}`)
      lines.push(`    answer: ${yamlString(f.answer)}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

const DRAFTS = join(DATA_DIR, 'drafts.json')
const OUT = join(DATA_DIR, 'published.json')
if (!existsSync(DRAFTS)) { console.error('缺少 drafts.json，先跑 3-synthesize.mjs'); process.exit(1) }
const drafts = JSON.parse(readFileSync(DRAFTS, 'utf8'))

const ds = new DeepSeek()
const finder = new ImageFinder()
if (!finder.enabled) console.log('⚠️  未配置 PEXELS_API_KEY / UNSPLASH_ACCESS_KEY，正文配图将全部回退写死图池。')
const SCORE_SYS = `You are a strict content quality reviewer for an English China-travel guide. Score this article on 4 dimensions (each 0-100) and give an overall:
- originality (reads like original synthesis, not a rewrite/translation patchwork)
- depth (useful, specific, information-dense for a traveller)
- accuracy (no obvious errors / fabricated facts)
- readability (native English, clear structure)
Return ONLY JSON: {"originality":int,"depth":int,"accuracy":int,"readability":int,"overall":int,"issues":["short issue"]}`

const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const donePub = new Set(results.filter(r => r.action && r.action !== 'error').map(r => r.slug))

if (!DRY) mkdirSync(POSTS_DIR, { recursive: true })

let pub = 0, draft = 0

for (const d of drafts) {
  if (donePub.has(d.slug)) { console.log(`✓ 已处理跳过 ${d.slug}`); continue }

  // 硬性闸门
  const q = checkQuality(d)
  let score = null, decision, reasonText

  if (!q.pass) {
    decision = 'draft'
    reasonText = `闸门未过: ${q.reasons.join(',')}`
  } else {
    // 软性：AI 自评分
    try {
      score = await ds.chatJSON(
        [{ role: 'system', content: SCORE_SYS }, { role: 'user', content: `Title: ${d.title}\n\n${d.content}` }],
        { maxTokens: 600 }
      )
    } catch (e) {
      score = { overall: 0, issues: ['评分失败:' + e.message] }
    }
    decision = (score.overall ?? 0) >= THRESHOLD ? 'publish' : 'draft'
    reasonText = `overall=${score.overall} (阈值${THRESHOLD}) faq=${q.faqPairs} len=${q.len} img=${q.images} links=${q.links}`
  }

  // 单次发布上限：已达上限的，过线也转草稿（不渲染），留待后续放行
  if (decision === 'publish' && pub >= MAX_PUBLISH) {
    decision = 'draft'
    reasonText += ` | 超过单次上限 ${MAX_PUBLISH}，转草稿`
  }

  console.log(`${decision === 'publish' ? '🟢 发布' : '🟡 草稿'}  ${d.slug}`)
  console.log(`     ${reasonText}`)
  if (score?.issues?.length) console.log(`     问题: ${score.issues.join('; ')}`)

  // 解析正文图片占位 ![alt](IMG: kw) → 真实图（Pexels 按景点搜，未命中回退写死池）
  const { content: bodyWithImages, ogImage } = await resolveImages(d.content, d.tags, d.slug, finder)

  const pubDatetime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const frontmatter = buildFrontmatter({
    title: d.title,
    description: d.description || d.summary || '',
    pubDatetime,
    tags: d.tags,
    ogImage,
    faq: d.faq,
    featured: false,
    draft: decision !== 'publish'
  })
  const md = `${frontmatter}\n\n${bodyWithImages.trim()}\n`
  const filePath = join(POSTS_DIR, `${d.slug}.md`)

  let action = decision
  if (!DRY) {
    try {
      writeFileSync(filePath, md)
      action = `${decision}:written`
      // 发布成功的同步进 dc_posts 镜像，让后续判重立刻能查到这篇（避免下一轮重复生成）
      if (decision === 'publish' && hasSupabase()) {
        try {
          await getSupabase().from('dc_posts').upsert({
            slug: d.slug,
            file_path: `src/content/posts/destinations/${d.slug}.md`,
            title: d.title,
            description: d.description || d.summary || '',
            author: AUTHOR,
            tags: d.tags || [],
            category: d.category || 'destination',
            featured: false,
            draft: false,
            pub_datetime: pubDatetime,
            og_image: ogImage,
            content: bodyWithImages.trim(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'slug' })
        } catch (e) {
          console.log(`     ⚠️  dc_posts 回写失败（不影响发布）: ${e.message}`)
        }
      }
    } catch (e) {
      action = 'error'
      console.log(`     ✗ 写文件失败: ${e.message}`)
    }
  }

  results.push({
    slug: d.slug,
    title: d.title,
    decision,
    action,
    file: `src/content/posts/destinations/${d.slug}.md`,
    score: score?.overall ?? null,
    quality: q.reasons,
    sources: d._sources?.map(s => s.url)
  })
  if (!DRY) writeFileSync(OUT, JSON.stringify(results, null, 2))
  if (decision === 'publish') pub++; else draft++
}

console.log(`\n${DRY ? '[DRY-RUN] ' : ''}完成：发布 ${pub}，草稿 ${draft}`)
if (!DRY) {
  console.log(`文件写入 ${POSTS_DIR}`)
  console.log(`记录写入 ${OUT}`)
}
console.log('DeepSeek 用量:', ds.costEstimate())
if (finder.enabled) console.log('配图来源:', finder.stats)
