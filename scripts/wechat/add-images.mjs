// 给现有 .md 文章批量配图（封面 ogImage + 正文若干张），用 ImageFinder（Pexels→Unsplash）。
// 这批"离线手动"文章正文结构清晰（H2 章节）但无图；本脚本按 主景点 + 章节标题 搜图插入。
//
// 用法：
//   node scripts/wechat/add-images.mjs --slugs a,b,c          # 指定文章（不带 .md）
//   node scripts/wechat/add-images.mjs --slugs a --inline 3   # 每篇正文插 3 张（默认 3）
//   node scripts/wechat/add-images.mjs --slugs a --dry-run    # 只打印将插什么，不写文件
//   node scripts/wechat/add-images.mjs --all --limit 5        # 取无图文章前 N 篇
//
// 安全：写文件前把原文备份到 data/img-backup/<slug>.md，可手动还原。

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageFinder } from './lib/images.mjs'
import { DATA_DIR, POSTS_DIR } from './lib/env.mjs'

function arg(name, def) {
  const i = process.argv.indexOf(name)
  if (i === -1) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const DRY = arg('--dry-run', false) === true
const ALL = arg('--all', false) === true
const LIMIT = arg('--limit', null) ? Number(arg('--limit', null)) : null
const INLINE = Number(arg('--inline', 3))
const slugsArg = arg('--slugs', null)

const BACKUP_DIR = join(DATA_DIR, 'img-backup')

function listPosts() {
  return readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
}

// 选定要处理的 slug 列表
let slugs = []
if (slugsArg && slugsArg !== true) {
  slugs = String(slugsArg).split(',').map(s => s.trim().replace(/\.md$/, '')).filter(Boolean)
} else if (ALL) {
  // 取没有正文图的文章
  slugs = listPosts().filter(s => {
    const body = readFileSync(join(POSTS_DIR, `${s}.md`), 'utf8')
    return !/!\[[^\]]*\]\(/.test(body)
  })
  if (LIMIT) slugs = slugs.slice(0, LIMIT)
} else {
  console.error('请用 --slugs a,b,c 指定文章，或 --all [--limit N] 批量。')
  process.exit(1)
}

// 拆分 frontmatter 与正文
function splitDoc(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  return { fm: m[1], body: m[2] }
}

// 从 frontmatter 取 title / tags
function fmField(fm, name) {
  const m = fm.match(new RegExp(`^${name}:\\s*"?(.+?)"?\\s*$`, 'm'))
  return m ? m[1] : ''
}
function fmTags(fm) {
  const m = fm.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m)
  if (!m) return []
  return [...m[1].matchAll(/-\s*"?(.+?)"?\s*$/gm)].map(x => x[1].trim())
}

// 从标题提取"主景点"关键词：去掉冒号后的副标题、去掉通用词与数字（年份/天数）
const TITLE_STOP = /\b(guide|complete|ultimate|travel|itinerary|tips|best|the|a|an|of|to|in|and|how|when|where|getting|there|days?|day)\b/gi
function clean(s) {
  return (s || '').replace(TITLE_STOP, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim()
}
function mainSubject(title, tags) {
  const head = (title || '').split(/[:：|—-]/)[0]               // 冒号前主词
  const s = clean(head)
  // 兜底地名 tag（gansu/sichuan…）；若主词里已含该地名则不重复附加
  let geo = (tags || []).find(t => /^[a-z-]+$/.test(t) && !['destinations', 'nature', 'culture', 'history', 'food', 'itinerary', 'hiking', 'photography', 'adventure', 'coastal', 'urban'].includes(t)) || ''
  if (geo && new RegExp(`\\b${geo}\\b`, 'i').test(s)) geo = '' // 主词已含省份 → 去重，避免 "Beijing beijing"
  return { subject: s || head.trim(), geo }
}

// 从一个 H2 标题提取「具体景点」搜图词：
//   - 取分隔符（— : | （）前的主段，剥掉 "Day N:"/"Part N:" 等前缀
//   - 优先保留括号内中文景点名对应的英文主段（中文搜图命中差，故用英文段 + 中文仅作语义）
//   - 去掉通用词/数字；若剥完为空（纯通用章节如 Practical Tips），返回 ''（交由上层降级）
const SECTION_GENERIC = /^(essential information|a brief history|the main structures?|practical (tips|information)|before you (arrive|go)|overview|getting (there|around)|recommended itinerary|where to stay|what to (see|do)|costs?|best time|food|dining|tips|history|introduction)$/i
function sectionSubject(h2) {
  let s = (h2 || '').replace(/^##\s*/, '').trim()
  s = s.replace(/^(day|part|stop|stage)\s*\d+\s*[:：-]\s*/i, '') // 去 "Day 2:" 前缀
  const head = s.split(/[—–\-:：|(（]/)[0].trim()                  // 取分隔符前主段
  if (SECTION_GENERIC.test(head)) return ''                       // 纯通用章节 → 无具体景点
  const cleaned = clean(head)
  return cleaned
}

// 给一个 H2 标题 + 主景点，产出「具体优先、逐级扩大」的查询列表（按优先级，逐个试到命中为止）。
function sectionQueries(subject, geo, h2) {
  const sec = sectionSubject(h2)
  const subjGeo = [subject, geo].filter(Boolean).join(' ').trim()
  const qs = []
  if (sec) {
    qs.push([sec, geo].filter(Boolean).join(' ').trim()) // ① 章节景点 + 省份（最具体）
    qs.push(sec)                                          // ② 章节景点单独
    qs.push([sec, subject].filter(Boolean).join(' ').trim()) // ③ 章节景点 + 主景点
  }
  qs.push(subjGeo)                                        // ④ 主景点 + 省份（兜底）
  // 去重、去空、去过短
  return [...new Set(qs)].filter(q => q && q.length >= 3)
}

// 不在这些「非内容章节」前插图（ToC 占位、FAQ、相关推荐等）
const SKIP_H2 = /table of contents|faq|frequently asked|related|further reading|references?/i

const finder = new ImageFinder()
if (!finder.enabled) { console.error('⚠️  未配置图片 API key（PEXELS_API_KEY / UNSPLASH_ACCESS_KEY）'); process.exit(1) }
if (!DRY) mkdirSync(BACKUP_DIR, { recursive: true })

console.log(`处理 ${slugs.length} 篇，每篇封面 + 正文 ${INLINE} 张${DRY ? '（dry-run）' : ''}\n`)

let done = 0
for (const slug of slugs) {
  const fp = join(POSTS_DIR, `${slug}.md`)
  if (!existsSync(fp)) { console.log(`✗ 不存在: ${slug}`); continue }
  const raw = readFileSync(fp, 'utf8')
  const doc = splitDoc(raw)
  if (!doc) { console.log(`✗ frontmatter 解析失败: ${slug}`); continue }
  if (/!\[[^\]]*\]\(/.test(doc.body)) { console.log(`• 已有正文图，跳过: ${slug}`); continue }

  const title = fmField(doc.fm, 'title')
  const tags = fmTags(doc.fm)
  const { subject, geo } = mainSubject(title, tags)

  // 正文 H2 章节位置（在这些标题前插图），排除 ToC/FAQ 等非内容章节
  const lines = doc.body.split('\n')
  const h2idx = lines.map((l, i) => (/^##\s+/.test(l) && !SKIP_H2.test(l)) ? i : -1).filter(i => i >= 0)
  // 均匀挑 INLINE 个插入点（跳过第一个紧贴开头的，从第1个 H2 起均匀分布）
  const picks = []
  if (h2idx.length) {
    const step = Math.max(1, Math.floor(h2idx.length / INLINE))
    for (let k = 0; k < h2idx.length && picks.length < INLINE; k += step) picks.push(h2idx[k])
  }

  // 封面图：用主景点搜
  const coverKw = [subject, geo].filter(Boolean).join(' ')
  const cover = await finder.find(coverKw, title)

  // 逐个插入点搜图：每个 H2 按「具体景点→省份→主景点」分级查询，命中即停
  const inserts = {} // lineIndex -> markdown image
  const insertKw = {} // lineIndex -> 实际命中的查询词（dry-run 展示用）
  for (const li of picks) {
    const h2 = lines[li]
    const queries = sectionQueries(subject, geo, h2)
    let hit = null, usedKw = ''
    for (const q of queries) {
      hit = await finder.find(q, `${title} ${h2}`)
      if (hit) { usedKw = q; break }
    }
    if (hit) {
      const altBase = h2.replace(/^##\s*/, '').trim()
      inserts[li] = `![${subject}${altBase ? ' — ' + altBase : ''}](${hit.url})\n`
      insertKw[li] = usedKw
    }
  }

  console.log(`${slug}`)
  console.log(`  主景点关键词: "${coverKw}"`)
  console.log(`  封面: ${cover ? cover.source : '未命中(跳过封面)'}`)
  console.log(`  正文插图: ${Object.keys(inserts).length}/${picks.length} 命中`)
  if (DRY) {
    for (const li of picks) console.log(`    @${lines[li]}  -> ${inserts[li] ? `[kw: ${insertKw[li]}] ` + inserts[li].trim().slice(0, 50) : '未命中'}`)
    continue
  }

  // 构造新正文：默认在选定 H2 之前插图；但若文章含 "## Table of contents" 占位，
  // 紧跟其后的首个内容章节，其图必须插在标题「之后」——插在标题之前会落入主题的
  // 目录渲染区（ToC 占位 ↔ 下一个 ##）被吞掉、线上不显示。其余照旧插在标题之前。
  const tocLine = lines.findIndex(l => /^##\s+table of contents/i.test(l))
  const afterAnchor = new Set()
  if (tocLine >= 0) {
    for (const li of picks) {
      if (li > tocLine && !lines.slice(tocLine + 1, li).some(l => /^##\s/.test(l))) afterAnchor.add(li)
    }
  }
  const newLines = []
  for (let i = 0; i < lines.length; i++) {
    if (inserts[i] && !afterAnchor.has(i)) newLines.push(inserts[i])          // 插在该 H2 之前
    newLines.push(lines[i])
    if (inserts[i] && afterAnchor.has(i)) { newLines.push(''); newLines.push(inserts[i].trim()) } // 插在该 H2 之后
  }
  let newBody = newLines.join('\n')

  // 写回 ogImage 到 frontmatter（已有则替换，没有则在 description 后追加）
  let newFm = doc.fm
  if (cover) {
    if (/^ogImage:/m.test(newFm)) newFm = newFm.replace(/^ogImage:.*$/m, `ogImage: "${cover.url}"`)
    else newFm = newFm.replace(/^(description:.*)$/m, `$1\nogImage: "${cover.url}"`)
  }

  copyFileSync(fp, join(BACKUP_DIR, `${slug}.md`))   // 备份原文
  writeFileSync(fp, `---\n${newFm}\n---\n${newBody}`)
  done++
}

console.log(`\n完成 ${DRY ? '(dry-run) ' : ''}${done}/${slugs.length} 篇`)
console.log('配图来源:', finder.stats)
if (!DRY && done) console.log(`原文已备份到 ${BACKUP_DIR}（可手动还原）`)
