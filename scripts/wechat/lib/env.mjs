// 共享 .env 加载器 —— 零依赖。被流水线各脚本复用。
// 加载顺序：scripts/wechat/.env（DeepSeek）→ cimidata/.env（采集凭证）。
// 已存在的 process.env 优先，不覆盖。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const WECHAT_DIR = join(__dir, '..')

let _loaded = false

export function loadEnv() {
  if (_loaded) return
  for (const p of [join(WECHAT_DIR, '.env'), join(WECHAT_DIR, 'cimidata', '.env')]) {
    try {
      const txt = readFileSync(p, 'utf8')
      for (const line of txt.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
      }
    } catch {
      // 文件不存在就跳过
    }
  }
  _loaded = true
}

export function requireEnv(name) {
  loadEnv()
  const v = process.env[name]
  if (!v) throw new Error(`缺少环境变量 ${name}（检查 scripts/wechat/.env）`)
  return v
}

// 数据目录（gitignored），各阶段产物落这里
export const DATA_DIR = join(WECHAT_DIR, 'data')

// 账号 wxid 映射（提交入库供复核/CI，故放在 data/ 之外）
export const ACCOUNTS_FILE = join(WECHAT_DIR, 'accounts.json')

// 本站文章发布目录（Astro content collection：src/content/posts/destinations）
export const POSTS_DIR = join(WECHAT_DIR, '..', '..', 'src', 'content', 'posts', 'destinations')
