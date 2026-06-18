// 源文持久化层 —— 采集的公众号原文落本地 JSON（data/sources.json），跨运行增量保留。
// 零依赖、无 Supabase。接口签名与 aiskillnav 版一致，下游脚本无需改调用。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './env.mjs'

const SOURCES_FILE = join(DATA_DIR, 'sources.json')

function readAll() {
  if (!existsSync(SOURCES_FILE)) return []
  try {
    const arr = JSON.parse(readFileSync(SOURCES_FILE, 'utf8'))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeAll(rows) {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(SOURCES_FILE, JSON.stringify(rows, null, 2))
}

/** 取库中已有的全部 sn（用于爬取前去重，避免重复拉正文花钱） */
export async function existingSns() {
  return new Set(readAll().map(r => r.sn))
}

/** 批量 upsert 源文（按 sn 去重，已存在则合并更新）。 */
export async function upsertSources(rows) {
  if (!rows.length) return 0
  const all = readAll()
  const bySn = new Map(all.map(r => [r.sn, r]))
  for (const row of rows) {
    if (!row.sn) continue
    bySn.set(row.sn, { ...bySn.get(row.sn), ...row })
  }
  writeAll([...bySn.values()])
  return rows.length
}

/**
 * 读取最近 N 天、含正文的源文（供 cluster/synthesize 使用）。
 * @param {object} [opts] { sinceDays=7, minBodyLen=150 }
 * @returns 数组：{ sn, account, wxid, title, digest, content_url, published_at, body_text }
 */
export async function fetchSources({ sinceDays = 7, minBodyLen = 150 } = {}) {
  const since = Date.now() - sinceDays * 86400 * 1000
  return readAll()
    .filter(s => s.body_text && s.body_text.length >= minBodyLen)
    .filter(s => {
      const t = s.published_at ? new Date(s.published_at).getTime() : NaN
      return Number.isNaN(t) ? true : t >= since
    })
    .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
}
