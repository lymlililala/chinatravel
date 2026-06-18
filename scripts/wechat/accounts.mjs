// 0) 解析旅游公众号名 → wxid。一次性步骤，结果落 accounts.json，人工核对。
// 用法：node scripts/wechat/accounts.mjs
//       node scripts/wechat/accounts.mjs --only "马蜂窝旅游,地道风物"   # 只解析部分
//
// 注意：cimidata searchAccounts 只返回 nickname/wxid/biz/description，
//       不返回粉丝数/更新频率。"粉丝多、更新勤、质量高"靠下面这份人工精选种子名单
//       保证；本脚本只负责把名字解析成 wxid（含同名号候选，供人工纠错）。

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { CimiClient } from './cimidata/client.mjs'
import { DATA_DIR, ACCOUNTS_FILE } from './lib/env.mjs'

// 目标公众号 —— 国内目的地/攻略优先，文化/地理深度次之。
// 已知重广告/低质号不入选；同名号问题留 candidates 供人工核对后改 wxid。
const ACCOUNT_NAMES = [
  // ── 平台/攻略型（覆盖国内目的地最广，更新最勤）──
  '马蜂窝旅游', '携程旅行', '去哪儿攻略', '飞猪', '穷游锦囊', '背包客栈',
  // ── 地理/文化深度（质量最高，适合写常青目的地/文化文）──
  '中国国家地理', '地道风物', '星球研究所', '中华遗产', '物道',
  // ── 城市/在地文化 ──
  '那一座城', '行李旅宿',
  // ── 媒体/资讯型旅游号 ──
  '凤凰网旅游', '新浪旅游', '中国旅游', '孤独星球'
]

const onlyArg = process.argv.find(a => a.startsWith('--only'))
const only = onlyArg ? (onlyArg.split('=')[1] || process.argv[process.argv.indexOf(onlyArg) + 1] || '').split(',').map(s => s.trim()).filter(Boolean) : null
const names = only && only.length ? ACCOUNT_NAMES.filter(n => only.includes(n)) : ACCOUNT_NAMES

mkdirSync(DATA_DIR, { recursive: true })
const OUT = ACCOUNTS_FILE

// 已解析的保留（增量）
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const byName = new Map(existing.map(a => [a.name, a]))

const cimi = new CimiClient({ minIntervalMs: 2500 })
const sleep = ms => new Promise(r => setTimeout(r, ms))

// cimidata 搜索需预热：同名首次常报 1002「没有找到结果，请稍后再试」，重试即可。
async function searchWithRetry(name, tries = 4) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const r = await cimi.searchAccounts(name)
      if (r.length) return r
    } catch (e) {
      lastErr = e
      if (e.code !== 1002) throw e // 非「稍后再试」错误直接抛
    }
    await sleep(6000) // 等预热
  }
  if (lastErr) throw lastErr
  return []
}

console.log(`解析 ${names.length} 个旅游公众号 wxid（含重试，较慢）…\n`)

for (const name of names) {
  if (byName.get(name)?.wxid) {
    console.log(`✓ 已有  ${name}  ${byName.get(name).wxid}`)
    continue
  }
  try {
    const accounts = await searchWithRetry(name)
    // 取昵称精确匹配优先，否则第一个
    const exact = accounts.find(a => a.nickname === name)
    const best = exact || accounts[0]
    if (!best) {
      console.log(`✗ 未找到  ${name}`)
      byName.set(name, { name, wxid: null, candidates: [] })
      continue
    }
    byName.set(name, {
      name,
      nickname: best.nickname,
      wxid: best.wxid,
      biz: best.biz,
      description: best.description,
      // 留候选供人工纠错（同名号问题）
      candidates: accounts.slice(0, 5).map(a => ({ nickname: a.nickname, wxid: a.wxid, description: a.description }))
    })
    const flag = exact ? '✓' : '?'
    console.log(`${flag} ${name}  →  ${best.nickname}  ${best.wxid}${exact ? '' : '  (非精确匹配，请核对)'}`)
  } catch (e) {
    console.log(`✗ 出错  ${name}: ${e.message}`)
    byName.set(name, { name, wxid: null, error: e.message })
  }
}

const result = ACCOUNT_NAMES.map(n => byName.get(n)).filter(Boolean)
writeFileSync(OUT, JSON.stringify(result, null, 2))
console.log(`\n已写入 ${OUT}`)
console.log(`成功 ${result.filter(a => a.wxid).length}/${ACCOUNT_NAMES.length}，余额 ${cimi.balance}`)
console.log('⚠️  请打开 accounts.json 核对带 (非精确匹配) 的项，必要时从 candidates 手动改 wxid；')
console.log('    剔除解析错/同名号/低质号后，再跑 1-crawl.mjs。')
