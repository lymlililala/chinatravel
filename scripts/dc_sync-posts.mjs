/**
 * dc_posts 真镜像同步：递归扫 src/content/posts 下所有 .md → 解析 frontmatter → upsert dc_posts。
 * 替代 dc_seed.mjs 的硬编码快照，使 DB 成为磁盘全部文章的真实镜像（合成判重的依据）。
 *
 * 用法：node scripts/dc_sync-posts.mjs [--dry-run]
 * 需要 SUPABASE_SECRET_KEY（CI Secrets 或项目根 .env）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { getSupabase } from './wechat/lib/supabase.mjs'

const DRY = process.argv.includes('--dry-run')
const ROOT = process.cwd()
const POSTS_ROOT = join(ROOT, 'src', 'content', 'posts')

// ── 递归收集 .md/.mdx ────────────────────────────────────────────────────────
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.mdx?$/.test(name)) out.push(p)
  }
  return out
}

// ── 轻量 frontmatter 解析（针对本仓库生成式、缩进一致的 YAML 子集） ──────────
// 支持：顶层标量（含引号字符串、布尔）、`key:` 后的 `  - item` 块列表；
// 其它嵌套块（如 faq:）整体跳过。返回 { data, body }。
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: md }
  const body = m[2]
  const lines = m[1].split(/\r?\n/)
  const data = {}

  const unquote = s => {
    s = s.trim()
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1).replace(/\\"/g, '"')
    }
    return s
  }
  const coerce = s => {
    if (s === 'true') return true
    if (s === 'false') return false
    return unquote(s)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || line.startsWith('#')) continue
    const top = line.match(/^([A-Za-z0-9_]+):(.*)$/)
    if (!top) continue // 缩进行：归属上一个 key，这里在块列表分支里前瞻处理
    const key = top[1]
    const rest = top[2].trim()

    if (rest === '') {
      // 可能是块列表或嵌套对象：前瞻缩进行
      const items = []
      let isList = false
      let j = i + 1
      for (; j < lines.length; j++) {
        const l = lines[j]
        if (!l.trim()) continue
        if (/^[A-Za-z0-9_]+:/.test(l)) break // 下一个顶层 key
        const li = l.match(/^\s+-\s+(.*)$/)
        if (li) { isList = true; items.push(unquote(li[1])) }
        // 嵌套对象的缩进行（如 faq 的 question/answer）：忽略
      }
      if (isList) data[key] = items
      i = j - 1
    } else {
      data[key] = coerce(rest)
    }
  }
  return { data, body }
}

function categoryFromPath(relPath) {
  // src/content/posts/<category>/...  → <category>
  const parts = relPath.split('/')
  const idx = parts.indexOf('posts')
  return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : 'destination'
}

function toRow(file) {
  const md = readFileSync(file, 'utf8')
  const { data, body } = parseFrontmatter(md)
  const relPath = relative(ROOT, file)
  const slug = basename(file).replace(/\.mdx?$/, '')
  return {
    slug,
    file_path: relPath,
    title: data.title || slug,
    description: data.description || data.summary || '',
    author: data.author || 'Roam China Travel Editorial Team',
    tags: Array.isArray(data.tags) ? data.tags : [],
    category: data.category || categoryFromPath(relPath),
    featured: data.featured === true,
    draft: data.draft === true,
    pub_datetime: data.pubDatetime || data.pubDate || new Date().toISOString(),
    mod_datetime: data.modDatetime || null,
    og_image: data.ogImage || null,
    content: body,
    updated_at: new Date().toISOString(),
  }
}

async function upsertBatch(sb, rows, BATCH = 100) {
  let ok = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await sb.from('dc_posts').upsert(batch, { onConflict: 'slug' })
    if (error) { console.error(`  ❌ batch ${i / BATCH + 1}: ${error.message}`); continue }
    ok += batch.length
    console.log(`  ✅ ${ok}/${rows.length}`)
  }
  return ok
}

async function main() {
  const files = walk(POSTS_ROOT)
  console.log(`扫描到 ${files.length} 篇 .md`)
  const rows = files.map(toRow)

  // slug 唯一性自检（dc_posts.slug 是 UNIQUE）
  const seen = new Map()
  for (const r of rows) {
    if (seen.has(r.slug)) console.warn(`  ⚠️  slug 冲突: ${r.slug}\n     ${seen.get(r.slug)}\n     ${r.file_path}`)
    else seen.set(r.slug, r.file_path)
  }

  if (DRY) {
    console.log('[DRY-RUN] 不写库。样例行：')
    console.log(JSON.stringify({ ...rows[0], content: (rows[0]?.content || '').slice(0, 80) + '…' }, null, 2))
    return
  }

  const sb = getSupabase()
  const ok = await upsertBatch(sb, rows)
  console.log(`\n✅ 同步完成：${ok}/${rows.length} 篇 upsert 到 dc_posts`)
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
