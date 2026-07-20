// 可选) 关键词发现更多旅游公众号候选 —— 用 cimidata searchAccounts 扫旅游关键词，
// 汇总去重成候选表，供人工挑选后扩充 accounts.mjs 的种子名单。
// 用法：node scripts/wechat/discover.mjs
//       node scripts/wechat/discover.mjs --keywords "古镇,自驾,周边游"
//
// 产物：data/discovered-accounts.json（不自动入 accounts.json，需人工筛）。

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CimiClient } from './cimidata/client.mjs'
import { DATA_DIR } from './lib/env.mjs'

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i === -1 ? def : process.argv[i + 1]
}

// 默认旅游关键词（覆盖目的地/玩法/人群/垂类深度）。
// 选词对准本站已发文偏薄的维度：美食深度、户外徒步、摄影风光、文博非遗、
// 民宿在地、冰雪海岛、人文历史 —— 这些垂类号往往比平台号「更新勤、质量高」。
const DEFAULT_KEYWORDS = [
  // 综合/攻略
  '旅游攻略', '旅行', '国内旅游', '自由行', '小众旅行', '周边游', '城市漫步',
  // 玩法
  '古镇', '自驾游', '徒步', '露营', '骑行', '潜水', '滑雪', '海岛',
  // 人群
  '亲子游', '背包客', '穷游', '一个人旅行',
  // 垂类深度（对准本站薄弱面）
  '美食旅行', '地方美食', '民宿', '风光摄影', '旅行摄影',
  '博物馆', '非遗', '古建筑', '人文地理', '历史文化', '国家公园', '世界遗产'
]
const kwArg = arg('--keywords', null)
const KEYWORDS = kwArg ? kwArg.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_KEYWORDS

mkdirSync(DATA_DIR, { recursive: true })
const OUT = join(DATA_DIR, 'discovered-accounts.json')

const cimi = new CimiClient({ minIntervalMs: 2500 })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const byWxid = new Map()

console.log(`扫 ${KEYWORDS.length} 个旅游关键词发现公众号候选…\n`)

for (const kw of KEYWORDS) {
  let accounts = []
  for (let i = 0; i < 3; i++) {
    try {
      accounts = await cimi.searchAccounts(kw)
      if (accounts.length) break
    } catch (e) {
      if (e.code !== 1002) { console.log(`  ✗ ${kw}: ${e.message}`); break }
    }
    await sleep(6000)
  }
  let added = 0
  for (const a of accounts) {
    if (!a.wxid) continue
    const prev = byWxid.get(a.wxid)
    if (prev) {
      prev.keywords.add(kw)
    } else {
      byWxid.set(a.wxid, {
        nickname: a.nickname,
        wxid: a.wxid,
        biz: a.biz,
        description: a.description,
        keywords: new Set([kw])
      })
      added++
    }
  }
  console.log(`  ${kw}: ${accounts.length} 条，新增 ${added} 个`)
}

// 命中关键词数越多越可能是核心旅游号，按此排序供人工挑选
const result = [...byWxid.values()]
  .map(a => ({ ...a, keywords: [...a.keywords] }))
  .sort((a, b) => b.keywords.length - a.keywords.length)

writeFileSync(OUT, JSON.stringify(result, null, 2))
console.log(`\n发现 ${result.length} 个去重候选 → ${OUT}，余额 ${cimi.balance}`)
console.log('⚠️  人工筛选（看 nickname/description/命中关键词数），把高质量号补进 accounts.mjs 的 ACCOUNT_NAMES。')
