// PDF 攻略 → 原创英文文章流水线（一次性/可增量）
//
//   node scripts/pdfguide/build.mjs --list            # 只看待写主题与覆盖判定
//   node scripts/pdfguide/build.mjs --limit 1         # 先试 1 篇
//   node scripts/pdfguide/build.mjs                   # 全部空缺主题
//
// 素材：gonglue/.../全部131个景点/*.pdf（中文攻略，2010-2013 年份，仅当结构与
// 本地风物的参考，不搬运其事实性数据）。产物：src/content/posts/destinations/*.md
//
// 硬约束（与站点定位一致）：
//   * 不写票价/费用数字 —— 素材年代久远，价格必然过时
//   * 不提任何来源、出处、"according to" 之类的转述痕迹
//   * 面向英文母语读者的行文，而非中译英腔
//   * 只写站内尚无专文的主题，避免与既有 901 篇自相残杀
//
// 质量闸门沿用 scripts/wechat/lib/quality.mjs：不过线写 draft:true，人工复核放行。

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DeepSeek } from '../wechat/deepseek.mjs'
import { checkQuality } from '../wechat/lib/quality.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const PDF_DIR = join(
  ROOT,
  'gonglue/全国旅游攻略/全国旅游攻略 国内穷游自驾游旅行地图电子版周边游线路美食指南/全部131个景点',
)
const POSTS = join(ROOT, 'src/content/posts/destinations')
const DATA = join(HERE, 'data')
const AUTHOR = 'Roam China Travel Editorial Team'

// 站内尚无专文的主题：中文 PDF 名 → { slug 关键词, 英文标题线索 }
// slug 关键词同时用于"站内是否已有"判定，改动这里就能扩/缩范围。
const TOPICS = [
  ['三清山', 'sanqing', 'Sanqingshan (三清山), Jiangxi'],
  ['云台山', 'yuntai', 'Yuntai Mountain (云台山), Henan'],
  ['北戴河', 'beidaihe', 'Beidaihe (北戴河), Hebei seaside'],
  ['北疆', 'northern-xinjiang', 'Northern Xinjiang loop'],
  ['千岛湖', 'qiandao', 'Qiandao Lake (千岛湖), Zhejiang'],
  ['台北', 'taipei', 'Taipei (台北), Taiwan'],
  ['威海', 'weihai', 'Weihai (威海), Shandong coast'],
  ['宏村', 'hongcun', 'Hongcun (宏村) and the Huizhou villages, Anhui'],
  ['山海关', 'shanhaiguan', 'Shanhaiguan (山海关), where the Great Wall meets the sea'],
  ['常州', 'changzhou', 'Changzhou (常州), Jiangsu'],
  ['束河', 'shuhe', 'Shuhe Old Town (束河), Lijiang'],
  ['林芝', 'nyingchi', 'Nyingchi (林芝), eastern Tibet'],
  ['横店', 'hengdian', 'Hengdian World Studios (横店), Zhejiang'],
  ['海口', 'haikou', 'Haikou (海口), Hainan'],
  ['烟台', 'yantai', 'Yantai (烟台), Shandong'],
  ['甘南', 'gannan', 'Gannan (甘南), Tibetan Gansu'],
  ['白洋淀', 'baiyangdian', 'Baiyangdian (白洋淀) wetlands, Hebei'],
  ['秦皇岛', 'qinhuangdao', 'Qinhuangdao (秦皇岛), Hebei'],
  ['绍兴', 'shaoxing', 'Shaoxing (绍兴), Zhejiang'],
  ['荔波', 'libo', 'Libo (荔波) karst and waterfalls, Guizhou'],
  ['蜀南竹海', 'bamboo-sea', 'Shunan Bamboo Sea (蜀南竹海), Sichuan'],
  ['衡山', 'hengshan', 'Mount Heng (衡山), Hunan'],
  ['西溪湿地', 'xixi', 'Xixi Wetland (西溪湿地), Hangzhou'],
  ['都江堰', 'dujiangyan', 'Dujiangyan (都江堰), Sichuan'],
  ['野三坡', 'yesanpo', 'Yesanpo (野三坡), Hebei'],
  ['雁荡山', 'yandang', 'Yandangshan (雁荡山), Zhejiang'],
  ['青城山', 'qingcheng', 'Mount Qingcheng (青城山), Sichuan'],
]

const SYS = `You are a senior travel editor writing original English guides for RoamChina, an independent China travel site for international visitors. You will be given rough Chinese notes about one destination. Treat them ONLY as background on geography, layout, seasons, local dishes and route logic. Write a completely new English article — never translate sentence by sentence.

Hard rules:
1. NEVER mention prices, fees, ticket costs or any money figures. Do not write ¥, RMB, yuan, "free entry", "costs about", or a budget table. Describe value qualitatively instead ("worth a half-day", "book ahead in peak season").
2. NEVER reference where the information came from: no "according to", no sources, no guidebooks, no locals-say attributions, no dates of publication.
3. NEVER state opening hours, phone numbers, URLs, bus route numbers or precise timetables — these go stale. Describe them qualitatively ("morning slots fill first", "regular buses run from the east bus station").
4. Write like a British-English travel magazine writer for readers who have never been to China: concrete, sensory, confident, no filler, no listicle padding, no marketing adjectives ("breathtaking", "must-see", "hidden gem", "nestled"). Vary sentence length. Prefer active voice. No "In conclusion".
5. Use Chinese place names with characters on first mention, e.g. West Lake (西湖).

Structure (Markdown, this site's dialect):
- One short scene-setting intro paragraph (2-4 sentences), then exactly "## Table of contents" on its own line (auto-filled later — leave it empty).
- Then ## sections with ### sub-sections. Bullets with "-". Tables with | pipes | where a comparison genuinely helps.
- Cover, in whatever order suits the place: what it actually is and why it is worth the trip, the main sights or walking route, how to get there and get around, when to go (season by season), where to base yourself, what to eat, and honest practical advice including what to skip.
- Weave in 2-4 internal links to on-site hubs, chosen by relevance from this whitelist ONLY:
  /tags/itinerary, /tags/food, /tags/culture, /tags/history, /tags/nature, /tags/hiking, /tags/beijing, /tags/shanghai, /tags/sichuan, /tags/yunnan, /tags/tibet, /tags/north-china, /tags/east-china, /tags/southwest-china
- No images: photos are added separately by the site's image pipeline. Do not write any ![...](...) markup.
- Body length: 1800-2400 English words of real substance.

Return ONLY JSON:
{
 "slug":"lowercase-hyphenated, max 6 words, starts with the place, ends with -guide",
 "title":"English title, 50-70 chars, includes the destination",
 "description":"meta description, STRICTLY 140-158 chars, one sentence, no ellipsis",
 "content":"full Markdown body",
 "tags":["lowercase english tags, 4-7, include the province and 2-3 themes"],
 "faq":[{"question":"...","answer":"..."}],
 "category":"destination|itinerary|food|culture|practical"
}`

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i === -1 ? def : process.argv[i + 1]
}

function existingSlugs() {
  const set = new Set()
  for (const dir of ['destinations', 'toolkit']) {
    const d = join(ROOT, 'src/content/posts', dir)
    if (!existsSync(d)) continue
    for (const f of readdirSync(d)) if (f.endsWith('.md')) set.add(f.replace(/\.md$/, ''))
  }
  return set
}

function pdfPath(zh) {
  const files = readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf') && f.startsWith(zh))
  return files.length ? join(PDF_DIR, files[0]) : null
}

function pdfText(path, maxChars = 14000) {
  const raw = execFileSync('pdftotext', ['-enc', 'UTF-8', path, '-'], {
    maxBuffer: 32 * 1024 * 1024,
  }).toString()
  // 目录/页眉页脚噪声占比高，压掉重复空白后截断
  const text = raw.replace(//g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return text.slice(0, maxChars)
}

function yamlString(s) {
  return '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').trim() + '"'
}

function frontmatter({ title, description, tags, faq, draft }) {
  const lines = ['---']
  lines.push(`author: ${yamlString(AUTHOR)}`)
  lines.push(`pubDatetime: ${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}`)
  lines.push(`title: ${yamlString(title)}`)
  lines.push(`draft: ${draft ? 'true' : 'false'}`)
  lines.push('tags:')
  for (const t of (tags?.length ? tags : ['others'])) lines.push(`  - ${yamlString(t)}`)
  lines.push(`description: ${yamlString(description)}`)
  if (faq?.length) {
    lines.push('faq:')
    for (const f of faq) {
      lines.push(`  - question: ${yamlString(f.question)}`)
      lines.push(`    answer: ${yamlString(f.answer)}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

// 违规巡检：价格/来源/时刻表痕迹。命中即降级为草稿，人工再看。
const BANNED = [
  [/[¥￥]\s?\d|(\bRMB\b|\byuan\b)\s?\d|\d+\s?(?:RMB|yuan)\b/i, 'PRICE'],
  [/\b(?:admission|entry|ticket|entrance)\s+(?:is|costs?|fee)\b/i, 'PRICE_PHRASE'],
  [/\baccording to\b|\bsources?\s+say\b|\bas reported\b|\bguidebook\b/i, 'SOURCE'],
  [/\bopen(?:s|ing)?\s+(?:from\s+)?\d{1,2}[:.]\d{2}\b|\b\d{1,2}[:.]\d{2}\s?[–-]\s?\d{1,2}[:.]\d{2}\b/, 'HOURS'],
  [/[一-鿿]{12,}/, 'CHINESE_BLOCK'],
]

function violations(text) {
  return BANNED.filter(([re]) => re.test(text)).map(([, tag]) => tag)
}

async function main() {
  const list = process.argv.includes('--list')
  const limit = arg('--limit', null) ? Number(arg('--limit', null)) : null
  const slugs = existingSlugs()

  const todo = []
  for (const [zh, key, hint] of TOPICS) {
    const covered = [...slugs].some(s => s.includes(key))
    const path = pdfPath(zh)
    todo.push({ zh, key, hint, covered, path })
  }

  if (list) {
    for (const t of todo) {
      console.log(
        `${t.covered ? '⊘ 已有' : '＋ 待写'}  ${t.zh.padEnd(6)} ${t.key.padEnd(20)} ${t.path ? '' : '(缺 PDF)'}`,
      )
    }
    console.log(`\n待写 ${todo.filter(t => !t.covered && t.path).length} / ${TOPICS.length}`)
    return
  }

  mkdirSync(DATA, { recursive: true })
  const logPath = join(DATA, 'generated.json')
  const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : []
  const done = new Set(log.map(x => x.zh))

  const ds = new DeepSeek()
  let queue = todo.filter(t => !t.covered && t.path && !done.has(t.zh))
  if (limit) queue = queue.slice(0, limit)
  console.log(`本次生成 ${queue.length} 篇\n`)

  for (const t of queue) {
    const material = pdfText(t.path)
    const userMsg = `Destination: ${t.hint}\n\nBackground notes (Chinese, for orientation only — do not translate, do not reuse any figures):\n\n${material}`
    console.log(`合成中: ${t.zh} → ${t.key}`)
    let d
    try {
      d = await ds.chatJSON([
        { role: 'system', content: SYS },
        { role: 'user', content: userMsg },
      ], { maxTokens: 12000, temperature: 0.55 })
    } catch (e) {
      console.log(`  ✗ 失败: ${e.message}`)
      continue
    }

    let slug = (d.slug || t.key).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
    if (slugs.has(slug)) slug = `${slug}-2026`
    const body = (d.content || '').trim()
    const q = checkQuality({ title: d.title, content: body, summary: d.description, faq: d.faq })
    const vio = violations(body)
    const draft = !q.pass || vio.length > 0

    const md = `${frontmatter({ title: d.title, description: d.description, tags: d.tags, faq: d.faq, draft })}\n\n${body}\n`
    writeFileSync(join(POSTS, `${slug}.md`), md)
    slugs.add(slug)
    log.push({ zh: t.zh, slug, draft, chars: body.length, faq: (d.faq || []).length, quality: q.reasons, violations: vio })
    writeFileSync(logPath, JSON.stringify(log, null, 2))
    console.log(
      `  ${draft ? '△ 草稿' : '✓ 发布'} ${slug}  ${body.length} 字符  ${(d.faq || []).length} FAQ` +
      `${q.reasons.length ? '  闸门:' + q.reasons.join(',') : ''}${vio.length ? '  违规:' + vio.join(',') : ''}`,
    )
  }

  console.log('\n用量:', ds.costEstimate())
  console.log(`日志: ${logPath}`)
}

main()
