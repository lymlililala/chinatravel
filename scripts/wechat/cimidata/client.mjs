// 次幂数据 (cimidata) API 客户端 —— 零依赖、可整目录复制到其它仓库使用
// 运行环境：Node 18+（用原生 fetch，无需安装任何包）
//
// 用法：
//   import { CimiClient } from './client.mjs'
//   const cimi = new CimiClient()            // 自动从同目录 .env 读 CIMIDATA_ACCESS_TOKEN
//   const r = await cimi.searchArticles('AI 工具')
//
// 所有接口的 access_token 走 query，body 走 JSON。返回统一 { code, data, msg, balance? }，
// code !== 200 会抛错；余额会缓存在 client.balance 上。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// --- 极简 .env 加载器（不依赖 dotenv）：优先同目录 .env，再退到上一级 ---
function loadDotEnv(...candidates) {
  for (const p of candidates) {
    try {
      const txt = readFileSync(p, 'utf8')
      for (const line of txt.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
      }
      return p
    } catch {
      // 文件不存在就跳过
    }
  }
  return null
}

const __dir = dirname(fileURLToPath(import.meta.url))
loadDotEnv(join(__dir, '.env'), join(__dir, '..', '.env'))

const sleep = ms => new Promise(r => setTimeout(r, ms))

// 爆文接口的类目对照表（category -> 中文名）
export const HOT_CATEGORIES = {
  xiaolvshu: '小绿书', yuer: '育儿', keji: '科技', tiyu: '体育健身', caijing: '财经',
  meishi: '美食', yiliao: '医疗', yule: '娱乐', qinggan: '情感', lishi: '历史',
  junshi: '军事国际', shishang: '美妆时尚', wenhua: '文化', qiche: '汽车', youxi: '游戏',
  lvyou: '旅游', fangchan: '房产', jiangkang: '健康养生', zhichang: '职场', sheying: '摄影',
  zixun: '资讯热点', jiaoyu: '教育', biancheng: '开发者', dianying: '影视', meizhuang: '美妆',
  shenghuo: '生活', shuma: '数码', meiti: '媒体', mengchong: '宠物', sannong: '三农',
  xingzuo: '星座命理', gaoxiao: '搞笑', dongman: '动漫', jiaju: '家居', kexue: '科学',
  yingxiao: '商业营销', chuangye: '个人成长', bizhi: '壁纸头像', falv: '法律', minsheng: '民生',
  wenan: '文案', tizhi: '体制', wenzhai: '文摘', ai: 'AI', other: '其它'
}

export class CimiError extends Error {
  constructor(json) {
    super(`cimidata 错误 code=${json.code} msg=${json.msg || ''}`)
    this.name = 'CimiError'
    this.code = json.code
    this.response = json
  }
}

export class CimiClient {
  /**
   * @param {object} [opts]
   * @param {string} [opts.appId]         用户名，默认读 process.env.CIMIDATA_APP_ID
   * @param {string} [opts.appSecret]     密钥，默认读 process.env.CIMIDATA_APP_SECRET
   * @param {string} [opts.accessToken]   可选：已有 token 时直接传，跳过换取
   * @param {string} [opts.baseUrl]       默认 https://www.cimidata.com
   * @param {number} [opts.minIntervalMs] 两次请求最小间隔，默认 1100ms（history/current 限频 1QS）
   * @param {number} [opts.maxRetries]    网络层失败重试次数，默认 2
   */
  constructor(opts = {}) {
    this.appId = opts.appId || process.env.CIMIDATA_APP_ID
    this.appSecret = opts.appSecret || process.env.CIMIDATA_APP_SECRET
    this.accessToken = opts.accessToken || process.env.CIMIDATA_ACCESS_TOKEN || null
    this.tokenExpiry = 0 // ms 时间戳；token 有效期 7 天
    this.baseUrl = (opts.baseUrl || process.env.CIMIDATA_BASE_URL || 'https://www.cimidata.com').replace(/\/+$/, '')
    this.minIntervalMs = opts.minIntervalMs ?? 1100
    this.maxRetries = opts.maxRetries ?? 2
    this.balance = null
    this._lastAt = 0
    if (!this.accessToken && !(this.appId && this.appSecret)) {
      throw new Error('缺少凭证：在 .env 设置 CIMIDATA_APP_ID + CIMIDATA_APP_SECRET（或直接传 accessToken）')
    }
  }

  async _throttle() {
    const wait = this._lastAt + this.minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    this._lastAt = Date.now()
  }

  /** 用 app_id/app_secret 换取 access_token（有效期 7 天）。返回 token 字符串。 */
  async authenticate() {
    if (!this.appId || !this.appSecret) {
      throw new Error('无法换取 token：缺少 app_id / app_secret')
    }
    await this._throttle()
    const res = await fetch(`${this.baseUrl}/api/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret })
    })
    let json
    try {
      json = await res.json()
    } catch {
      throw new Error(`换取 token 失败：非 JSON 响应 HTTP ${res.status}`)
    }
    if (json.code !== 200 || !json.data?.access_token) throw new CimiError(json)
    this.accessToken = json.data.access_token
    // 留 1 小时安全余量，提前续期
    this.tokenExpiry = Date.now() + 7 * 24 * 3600 * 1000 - 3600 * 1000
    return this.accessToken
  }

  /** 确保有可用 token：无 token 或将过期则自动换取。 */
  async ensureToken() {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      if (this.appId && this.appSecret) await this.authenticate()
    }
    return this.accessToken
  }

  /** 底层请求：access_token 进 query，body 进 JSON。code!==200 抛 CimiError。 */
  async request(path, body = {}, { query = {} } = {}) {
    await this.ensureToken()
    let lastErr
    let reauthed = false
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this._throttle()
      const qs = new URLSearchParams({ access_token: this.accessToken, ...query })
      const url = `${this.baseUrl}${path}?${qs.toString()}`
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        let json
        try {
          json = await res.json()
        } catch {
          throw new Error(`非 JSON 响应 HTTP ${res.status}`)
        }
        if (typeof json.balance === 'number') this.balance = json.balance
        if (json.code !== 200) {
          // token 失效（2040）且有 app_id/secret 时，自动重新换取一次再重试
          if (json.code === 2040 && this.appId && this.appSecret && !reauthed) {
            reauthed = true
            await this.authenticate()
            continue
          }
          // 服务端临时故障（500 内部错误 / 1002 稍后再试）→ 退避重试，不直接放弃
          if ((json.code === 500 || json.code === 1002) && attempt < this.maxRetries) {
            await sleep(1200 * (attempt + 1))
            continue
          }
          throw new CimiError(json)
        }
        return json
      } catch (e) {
        lastErr = e
        // 业务错误（参数错等）不重试；仅网络/解析类错误重试
        if (e instanceof CimiError) throw e
        if (attempt < this.maxRetries) await sleep(800 * (attempt + 1))
      }
    }
    throw lastErr
  }

  // ============ 关键词 → 文章 ============

  /** v3 关键词搜文章（带 nickname / wxid，分页 1-5）。0.05/次 */
  async searchArticles(keyword, { page = 1 } = {}) {
    const { data } = await this.request('/api/v3/articles/search', { keyword, page })
    return data.items || []
  }

  /** v2 关键词搜文章（数据库版，无分页）。0.02/次 */
  async searchArticlesDb(keyword) {
    const { data } = await this.request('/api/v2/articles/search', { keyword })
    return data.items || []
  }

  /** v3 搜文章翻页迭代器（page 1..maxPages） */
  async *iterSearchArticles(keyword, { maxPages = 5 } = {}) {
    for (let page = 1; page <= Math.min(maxPages, 5); page++) {
      const items = await this.searchArticles(keyword, { page })
      if (!items.length) break
      for (const it of items) yield it
    }
  }

  // ============ 关键词 → 公众号 ============

  /** v3 关键词搜公众号（单次约 20 条，返回含 wxid）。0.1/次 */
  async searchAccounts(keyword) {
    const { data } = await this.request('/api/v3/accounts/search', { keyword })
    return data.accounts || []
  }

  // ============ 指定公众号 → 文章 ============

  /** 历史发文列表（每次 10 条，last_id 翻页）。0.05/次
   *  wxid 优先；只给 nickname 时首次可能报错，需等 ~30-60s 重试（见 withNicknameRetry）。 */
  async accountHistory(wxid, { nickname, lastId } = {}) {
    const body = {}
    if (wxid) body.wxid = wxid
    if (nickname) body.nickname = nickname
    const query = lastId ? { last_id: lastId } : {}
    const { data } = await this.request('/api/v2/articles/history', body, { query })
    return { items: data.items || [], lastId: data.last_id || null }
  }

  /** 历史发文翻页迭代器，自动用 last_id 翻到底或到 maxPages */
  async *iterAccountHistory(wxid, { nickname, maxPages = 50 } = {}) {
    let lastId = undefined
    for (let page = 0; page < maxPages; page++) {
      const { items, lastId: next } = await this.accountHistory(wxid, { nickname, lastId })
      if (!items.length) break
      for (const it of items) yield it
      if (!next || next === lastId) break
      lastId = next
    }
  }

  /** 某号今天的发文（默认当天）。限频 1QS */
  async accountToday(wxid, { nickname } = {}) {
    const body = {}
    if (wxid) body.wxid = wxid
    if (nickname) body.nickname = nickname
    const { data } = await this.request('/api/v2/articles/current', body)
    return data || []
  }

  // ============ 正文 ============

  /** 只取正文 HTML（推荐入库用，干净）。0.01/次 */
  async articleBody(url) {
    const { data } = await this.request('/api/v3/articles/detail', { url })
    return data.html || ''
  }

  /** 完整页面 HTML（含 JS，一般不用）。0.01/次 */
  async articleFullPage(url) {
    const { data } = await this.request('/api/v2/articles/detail', { url })
    return data.html || ''
  }

  // ============ 选题 / 爆文 ============

  /** 微信爆文（44 个 category 见 HOT_CATEGORIES，last_id 翻页）。0.1/次 */
  async hotArticles({ category, readNum, publishedAt, lastId } = {}) {
    const body = {}
    if (category) body.category = category
    if (readNum != null) body.read_num = readNum
    if (publishedAt) body.published_at = publishedAt
    if (lastId != null) body.last_id = lastId
    const { data } = await this.request('/api/v2/hot/articles', body)
    return { items: data.items || [], lastId: data.last_id ?? null }
  }

  // ============ 辅助 ============

  /** 仅凭 nickname 查询时的重试封装：首次失败等待后重试（文档要求 ~30-60s） */
  async withNicknameRetry(fn, { waitMs = 35000, retries = 1 } = {}) {
    let lastErr
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn()
      } catch (e) {
        lastErr = e
        if (i < retries) await sleep(waitMs)
      }
    }
    throw lastErr
  }
}

export default CimiClient
