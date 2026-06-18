// Supabase 客户端封装 —— 供采集落库（dc_wx_sources）与 dc_posts 镜像同步共用。
// SUPABASE_SECRET_KEY 来自：① 已注入的 process.env（CI / Vercel）；否则 ② 项目根 .env。
// 与 scripts/dc_*.mjs 用同一项目、同一 URL。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://tixgzezefjjsyuzgdhcd.supabase.co'

const __dir = dirname(fileURLToPath(import.meta.url))
// scripts/wechat/lib → 项目根
const ROOT_ENV = join(__dir, '..', '..', '..', '.env')

// 从根 .env 兜底读取（不覆盖已存在的 process.env）。仅取需要的键。
function loadRootEnv() {
  try {
    const txt = readFileSync(ROOT_ENV, 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  } catch {
    // 根 .env 不存在（如 CI 用真实环境变量）则跳过
  }
}

/** 是否具备走 Supabase 的条件（决定 sources 持久层走 DB 还是本地 JSON）。 */
export function hasSupabase() {
  if (!process.env.SUPABASE_SECRET_KEY) loadRootEnv()
  return !!process.env.SUPABASE_SECRET_KEY
}

let _client = null

/** 取（懒加载）Supabase 客户端；缺 key 抛错。 */
export function getSupabase() {
  if (_client) return _client
  if (!process.env.SUPABASE_SECRET_KEY) loadRootEnv()
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) throw new Error('缺少 SUPABASE_SECRET_KEY（CI 用 Secrets，本地用项目根 .env）')
  _client = createClient(SUPABASE_URL, key)
  return _client
}
