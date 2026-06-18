// DeepSeek 客户端 —— 零依赖（Node 18+ 原生 fetch），OpenAI 兼容 chat completions。
// 用于：聚类(2-cluster)、合成(3-synthesize)、自评分(4-publish)。
//
// 用法：
//   import { DeepSeek } from './deepseek.mjs'
//   const ds = new DeepSeek()
//   const text = await ds.chat([{ role: 'user', content: '...' }])
//   const obj  = await ds.chatJSON([{ role: 'user', content: '... 只返回 JSON' }])

import { loadEnv } from './lib/env.mjs'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export class DeepSeek {
  constructor(opts = {}) {
    loadEnv()
    this.apiKey = opts.apiKey || process.env.DEEPSEEK_API_KEY
    this.baseUrl = (opts.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
    this.model = opts.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat'
    this.maxRetries = opts.maxRetries ?? 3
    this.minIntervalMs = opts.minIntervalMs ?? 300
    this.timeoutMs = opts.timeoutMs ?? 120000 // 单次请求超时 120s，超时中断重试
    this._lastAt = 0
    // 累计 token 用量，便于成本核算
    this.usage = { prompt: 0, completion: 0, calls: 0 }
    if (!this.apiKey) throw new Error('缺少 DEEPSEEK_API_KEY（检查 scripts/wechat/.env）')
  }

  async _throttle() {
    const wait = this._lastAt + this.minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    this._lastAt = Date.now()
  }

  /**
   * 原始 chat 调用，返回完整响应 JSON。
   * @param {Array} messages  OpenAI 风格消息
   * @param {object} [opts]   { temperature, maxTokens, jsonMode }
   */
  async _complete(messages, opts = {}) {
    const body = {
      model: opts.model || this.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 8000
    }
    if (opts.jsonMode) body.response_format = { type: 'json_object' }

    let lastErr
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this._throttle()
      // 单次请求超时控制：卡住则中断并重试，避免一个慢请求拖死整个流程
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), this.timeoutMs)
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body),
          signal: ac.signal
        })
        if (!res.ok) {
          const txt = await res.text()
          // 429/5xx 重试，其它（4xx）直接抛
          if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
            await sleep(1500 * (attempt + 1))
            continue
          }
          throw new Error(`DeepSeek HTTP ${res.status}: ${txt.slice(0, 300)}`)
        }
        const json = await res.json()
        if (json.usage) {
          this.usage.prompt += json.usage.prompt_tokens || 0
          this.usage.completion += json.usage.completion_tokens || 0
          this.usage.calls += 1
        }
        return json
      } catch (e) {
        lastErr = e
        if (attempt < this.maxRetries) await sleep(1200 * (attempt + 1))
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastErr
  }

  /** 返回纯文本回复 */
  async chat(messages, opts = {}) {
    const json = await this._complete(messages, opts)
    return json.choices?.[0]?.message?.content ?? ''
  }

  /** 强制 JSON 输出并解析；解析失败自动重试一次（提高 temperature 不利于稳定，故降到 0.2） */
  async chatJSON(messages, opts = {}) {
    const o = { temperature: 0.2, ...opts, jsonMode: true }
    let raw = await this.chat(messages, o)
    try {
      return JSON.parse(sanitizeJSON(stripFence(raw)))
    } catch {
      // 再试一次，附加更强约束
      raw = await this.chat(
        [...messages, { role: 'system', content: '上次输出不是合法 JSON。只输出一个合法 JSON 对象，字符串内的换行/制表符等必须转义（\\n \\t），不要任何解释或代码围栏。' }],
        o
      )
      return JSON.parse(sanitizeJSON(stripFence(raw)))
    }
  }

  /** 成本估算（DeepSeek 定价随时变，按粗略 ¥/百万 token 估） */
  costEstimate({ inPerM = 2, outPerM = 3 } = {}) {
    const yuan = (this.usage.prompt / 1e6) * inPerM + (this.usage.completion / 1e6) * outPerM
    return { ...this.usage, yuan: Number(yuan.toFixed(3)) }
  }
}

function stripFence(s) {
  // 去掉可能的 ```json ... ``` 围栏
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

// LLM 常在 JSON 字符串值里塞入未转义的原始换行/制表符，导致 JSON.parse 失败。
// 这里在“字符串字面量内部”把裸控制字符转义，字符串外的格式化空白保持不变。
function sanitizeJSON(s) {
  let out = ''
  let inStr = false
  let esc = false
  for (const ch of s) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue }
      if (ch === '\\') { out += ch; esc = true; continue }
      if (ch === '"') { out += ch; inStr = false; continue }
      if (ch === '\n') { out += '\\n'; continue }
      if (ch === '\r') { out += '\\r'; continue }
      if (ch === '\t') { out += '\\t'; continue }
      out += ch
    } else {
      if (ch === '"') { inStr = true }
      out += ch
    }
  }
  return out
}

export default DeepSeek
