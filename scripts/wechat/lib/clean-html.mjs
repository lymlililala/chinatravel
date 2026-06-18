// 公众号正文 HTML → 干净纯文本。零依赖正则实现，喂给 DeepSeek 用。
// cimidata articleBody 返回 rich_media_content 富文本；我们只要可读文字，丢弃图片/脚本/样式。

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&ldquo;': '“', '&rdquo;': '”', '&mdash;': '—',
  '&hellip;': '…', '&middot;': '·', '&times;': '×'
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, m => ENTITIES[m] ?? m)
}

/** 把公众号正文 HTML 转为带段落的纯文本 */
export function htmlToText(html) {
  if (!html) return ''
  let s = html
  // 去掉 script/style/注释整体
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
       .replace(/<style[\s\S]*?<\/style>/gi, '')
       .replace(/<!--[\s\S]*?-->/g, '')
  // 块级标签转换行
  s = s.replace(/<\/(p|div|section|h[1-6]|li|tr|blockquote|br)\s*>/gi, '\n')
       .replace(/<br\s*\/?>/gi, '\n')
       .replace(/<\/(td|th)\s*>/gi, '\t')
  // 列表项前缀
  s = s.replace(/<li[^>]*>/gi, '- ')
  // 去掉所有剩余标签
  s = s.replace(/<[^>]+>/g, '')
  // 解码实体
  s = decodeEntities(s)
  // 收敛空白：每行 trim，去多余空行
  s = s.split('\n').map(l => l.replace(/​/g, '').replace(/[ \t]+/g, ' ').trim()).join('\n')
  s = s.replace(/\n{3,}/g, '\n\n').trim()
  return s
}

/** 截断到 N 字符（喂模型控制 context） */
export function truncate(s, n = 6000) {
  if (!s || s.length <= n) return s
  return s.slice(0, n) + '\n…(正文已截断)'
}

export default htmlToText
