// 一次性修复：含 "## Table of contents" 占位的文章里，被插在「目录占位 ↔ 首个内容章节」
// 之间的图片会被主题的目录渲染逻辑吞掉（线上不显示）。本脚本把这些图移到首个内容章节
// 标题「之后」（正文区），脱离目录渲染区。幂等：无可移动的图则跳过。
//   node scripts/wechat/fix-toc-images.mjs            # 实改
//   node scripts/wechat/fix-toc-images.mjs --dry-run  # 只报告

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { POSTS_DIR } from './lib/env.mjs'

const DRY = process.argv.includes('--dry-run')
const files = readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'))

let fixed = 0, moved = 0
for (const f of files) {
  const fp = join(POSTS_DIR, f)
  const raw = readFileSync(fp, 'utf8')
  const lines = raw.split('\n')
  const tocIdx = lines.findIndex(l => /^##\s+table of contents/i.test(l))
  if (tocIdx < 0) continue
  // 首个内容章节（ToC 之后第一个 "## "）
  let nextH2 = -1
  for (let i = tocIdx + 1; i < lines.length; i++) { if (/^##\s/.test(lines[i])) { nextH2 = i; break } }
  if (nextH2 < 0) continue
  // ToC ↔ 首个章节之间的图片行
  const imgIdx = []
  for (let i = tocIdx + 1; i < nextH2; i++) if (/^!\[/.test(lines[i])) imgIdx.push(i)
  if (!imgIdx.length) continue
  const imgs = imgIdx.map(i => lines[i])
  const drop = new Set(imgIdx)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i)) continue                 // 删掉 ToC 区的图
    out.push(lines[i])
    if (i === nextH2) { out.push(''); out.push(...imgs) } // 移到首个章节标题之后
  }
  // 收尾：折叠 ToC 占位下因删图留下的连续空行（最多保留一个）
  const cleaned = []
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '' && out[i - 1] === '') continue
    cleaned.push(out[i])
  }
  if (DRY) { console.log(`would fix ${f}  (移动 ${imgs.length} 张)`); fixed++; moved += imgs.length; continue }
  writeFileSync(fp, cleaned.join('\n'))
  console.log(`✓ ${f}  (移动 ${imgs.length} 张到首章节后)`)
  fixed++; moved += imgs.length
}
console.log(`\n${DRY ? '(dry-run) ' : ''}修复 ${fixed} 篇，移动 ${moved} 张图`)
