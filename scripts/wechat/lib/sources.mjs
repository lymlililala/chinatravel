// 源文持久化层 —— 双实现，下游脚本（1-crawl / 2-cluster / 3-synthesize）零改动。
//   ① 有 SUPABASE_SECRET_KEY → Supabase 表 dc_wx_sources（CI / 生产，跨运行保留）。
//   ② 否则                   → 本地 data/sources.json（本地开发，无库依赖）。
// 接口签名与原版一致：existingSns() / upsertSources(rows) / fetchSources(opts)。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './env.mjs'
import { hasSupabase, getSupabase } from './supabase.mjs'

const SOURCES_FILE = join(DATA_DIR, 'sources.json')
const TABLE = 'dc_wx_sources'
const USE_DB = hasSupabase()

// ── 本地 JSON 实现 ───────────────────────────────────────────────────────────
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

// ── Supabase 分页读取（PostgREST 单请求默认上限 1000，需翻页取全量） ──────────
async function selectAll(builder, pageSize = 1000) {
  const sb = getSupabase()
  const out = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await builder(sb).range(from, from + pageSize - 1)
    if (error) throw new Error(`${TABLE} 读取失败: ${error.message}`)
    out.push(...data)
    if (data.length < pageSize) break
  }
  return out
}

// ── 公共接口 ─────────────────────────────────────────────────────────────────

/** 取库中已有的全部 sn（采集前去重，避免重复拉正文花钱）。 */
export async function existingSns() {
  if (!USE_DB) return new Set(readAll().map(r => r.sn))
  const rows = await selectAll(sb => sb.from(TABLE).select('sn'))
  return new Set(rows.map(r => r.sn))
}

/** 批量 upsert 源文（按 sn 去重，已存在则合并更新）。 */
export async function upsertSources(rows) {
  if (!rows.length) return 0
  if (!USE_DB) {
    const all = readAll()
    const bySn = new Map(all.map(r => [r.sn, r]))
    for (const row of rows) {
      if (!row.sn) continue
      bySn.set(row.sn, { ...bySn.get(row.sn), ...row })
    }
    writeAll([...bySn.values()])
    return rows.length
  }
  const sb = getSupabase()
  const clean = rows
    .filter(r => r.sn)
    .map(r => ({
      sn: r.sn,
      account: r.account ?? null,
      wxid: r.wxid ?? null,
      title: r.title ?? null,
      digest: r.digest ?? '',
      content_url: r.content_url ?? null,
      published_at: r.published_at ?? null,
      body_text: r.body_text ?? '',
      updated_at: new Date().toISOString(),
    }))
  // 分批 upsert，避免单请求过大
  const CHUNK = 500
  for (let i = 0; i < clean.length; i += CHUNK) {
    const { error } = await sb.from(TABLE).upsert(clean.slice(i, i + CHUNK), { onConflict: 'sn' })
    if (error) throw new Error(`${TABLE} 写入失败: ${error.message}`)
  }
  return clean.length
}

/**
 * 读取最近 N 天、含正文的源文（供 cluster/synthesize 使用）。
 * @param {object} [opts] { sinceDays=7, minBodyLen=150 }
 * @returns 数组：{ sn, account, wxid, title, digest, content_url, published_at, body_text }
 */
export async function fetchSources({ sinceDays = 7, minBodyLen = 150 } = {}) {
  const sinceMs = Date.now() - sinceDays * 86400 * 1000
  const sinceIso = new Date(sinceMs).toISOString()

  let rows
  if (!USE_DB) {
    rows = readAll()
  } else {
    rows = await selectAll(sb =>
      sb.from(TABLE).select('*').gte('published_at', sinceIso).order('published_at', { ascending: false })
    )
  }

  return rows
    .filter(s => s.body_text && s.body_text.length >= minBodyLen)
    .filter(s => {
      const t = s.published_at ? new Date(s.published_at).getTime() : NaN
      return Number.isNaN(t) ? true : t >= sinceMs
    })
    .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
}
