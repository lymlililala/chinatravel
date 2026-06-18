// 景点配图 —— 按关键词搜图（热链 CDN），含相关性校验 + 关键词降级 + 缓存。
// 主力 Pexels（覆盖广、配额大），未命中回退 Unsplash（覆盖少但能补位）。
// 两家都搜不到/不相关时返回 null，由调用方回退到写死图池，保证文章一定有图、且不塞错图。
//
// 实测要点：
//  - Pexels 搜不到时不返回空，而是返回一堆不相关兜底图（total_results 恒高），
//    必须用「结果 alt 是否含查询地名词」做相关性校验。
//  - Unsplash demo 仅 50 req/时，且要求署名 + 触发 download 端点（本客户端自动处理）。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv, DATA_DIR } from './env.mjs'

const CACHE_FILE = join(DATA_DIR, 'image-cache.json')

// 英文停用词：相关性校验时忽略，只看实义词（地名/景点名）是否命中
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'on', 'and', 'to', 'view', 'china',
  'chinese', 'scenic', 'beautiful', 'landscape', 'scenery', 'travel', 'tourism', 'photo', 'image',
  'aerial', 'summer', 'winter', 'autumn', 'spring', 'sunset', 'sunrise', 'night', 'day'])

function loadCache() {
  if (!existsSync(CACHE_FILE)) return {}
  try { return JSON.parse(readFileSync(CACHE_FILE, 'utf8')) } catch { return {} }
}
function saveCache(c) {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2))
}

function terms(s) {
  return (s || '').toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !STOPWORDS.has(w)) || []
}

/** 相关性：查询里的实义词，至少有一个出现在结果描述里，才算真命中 */
function isRelevant(query, desc) {
  const qt = terms(query)
  if (!qt.length) return false
  const dt = new Set(terms(desc))
  return qt.some(w => dt.has(w))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── 各图源适配器：search(query) → [{ url, desc, credit?, downloadLocation? }] ──

class PexelsSource {
  constructor(key) { this.key = key; this.name = 'pexels' }
  async search(query) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`
    const res = await fetch(url, { headers: { Authorization: this.key } })
    if (res.status === 429) throw { rateLimited: true }
    if (!res.ok) return []
    const json = await res.json()
    return (json.photos || []).map(p => ({
      url: p.src?.large || p.src?.original,
      desc: p.alt || '',
      credit: p.photographer || ''
    })).filter(p => p.url)
  }
}

class UnsplashSource {
  constructor(key) { this.key = key; this.name = 'unsplash' }
  async search(query) {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${this.key}` } })
    if (res.status === 403 || res.status === 429) throw { rateLimited: true }
    if (!res.ok) return []
    const json = await res.json()
    return (json.results || []).map(p => {
      const base = p.urls?.raw || p.urls?.regular || ''
      // raw/regular 已带 query；热链时追加压缩/裁剪参数
      const url = base ? `${base}${base.includes('?') ? '&' : '?'}w=1200&q=85&fit=crop` : ''
      return {
        url,
        desc: p.description || p.alt_description || '',
        credit: p.user?.name || '',
        // 合规：用图时应 ping 一次 download_location（带 client_id）
        downloadLocation: p.links?.download_location || ''
      }
    }).filter(p => p.url)
  }
}

/**
 * 统一配图客户端：Pexels 优先 → Unsplash 回退。
 * find(keyword, alt) → { url, source, credit } | null
 */
export class ImageFinder {
  constructor(opts = {}) {
    loadEnv()
    const pk = opts.pexelsKey || process.env.PEXELS_API_KEY
    const uk = opts.unsplashKey || process.env.UNSPLASH_ACCESS_KEY
    this.sources = []
    if (pk) this.sources.push(new PexelsSource(pk))
    if (uk) this.sources.push(new UnsplashSource(uk))
    this.enabled = this.sources.length > 0
    this.unsplashKey = uk || null
    this.cache = loadCache()          // { "src:query": [photos] }
    this.used = new Set()             // 本次运行已用图 URL（跨文章去重）
    this.disabled = new Set()         // 本次运行已限频的源名（不再调）
    this.stats = { pexels: 0, unsplash: 0, miss: 0, calls: 0 }
  }

  async _search(source, query) {
    const ck = `${source.name}:${query}`
    if (this.cache[ck]) return this.cache[ck]
    let photos = []
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.stats.calls++
        photos = await source.search(query)
        break
      } catch (e) {
        if (e && e.rateLimited) { this.disabled.add(source.name); return [] }
        await sleep(700 * (attempt + 1))
      }
    }
    this.cache[ck] = photos
    saveCache(this.cache)
    return photos
  }

  /** 合规：Unsplash 用图前 ping 一次 download_location（失败不影响展示） */
  async _pingDownload(loc) {
    if (!loc || !this.unsplashKey) return
    try { await fetch(`${loc}&client_id=${this.unsplashKey}`) } catch { /* 忽略 */ }
  }

  /**
   * @param {string} keyword  IMG: 后的关键词（如 "Mogao Caves Dunhuang"）
   * @param {string} [alt]    合成产出的 alt，用于降级查询与相关性判断
   * @returns {Promise<{url,source,credit}|null>}
   */
  async find(keyword, alt = '') {
    if (!this.enabled) return null
    const kw = (keyword || '').trim()
    const core = terms(kw).slice(0, 2).join(' ')
    const altCore = terms(alt).slice(0, 2).join(' ')
    const queries = [...new Set([kw, core, altCore].filter(q => q && q.length >= 3))]

    // 先把每个源都试完完整降级链：Pexels 全部查询 → 再 Unsplash 全部查询
    for (const source of this.sources) {
      if (this.disabled.has(source.name)) continue
      for (const q of queries) {
        const photos = await this._search(source, q)
        const pick = photos.find(p => !this.used.has(p.url) && isRelevant(kw, p.desc))
        if (pick) {
          this.used.add(pick.url)
          this.stats[source.name]++
          if (source.name === 'unsplash') await this._pingDownload(pick.downloadLocation)
          return { url: pick.url, source: source.name, credit: pick.credit }
        }
      }
    }
    this.stats.miss++
    return null
  }
}

export default ImageFinder
