// slug 生成 + 站内唯一性。站内 slug 为干净英文 kebab（词边界截断，无随机后缀；
// 仅在真实冲突时追加 -2/-3）。非 ASCII 丢弃（合成阶段要求 DeepSeek 产出英文 slug）。

const MAX_LEN = 60

/**
 * 英文标题/slug → kebab。按词边界截断到 ≤MAX_LEN，避免切在词中间
 * （旧实现 70 字符硬截断会产出 "...-northw" 这种半截词）。
 */
export function slugify(s) {
  const kebab = (s || '')
    .toLowerCase()
    .replace(/[''’`]/g, '')        // 先去撇号/引号：China's → chinas（而非 china-s）
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  if (kebab.length <= MAX_LEN) return kebab
  // 在 MAX_LEN 内的最后一个 '-' 处截断（保住完整词）
  const cut = kebab.slice(0, MAX_LEN)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, '')
}

/**
 * 生成站内唯一 slug。优先用干净主体；冲突时追加 -2、-3 …（不再用随机后缀）。
 * @param {string} base   英文 slug 主体（来自 DeepSeek 产出，已 slugify 或原始）
 * @param {Set<string>} existing  现有 slug 集合（含本批已分配的）
 */
export function uniqueSlug(base, existing) {
  const core = slugify(base) || 'wx-article'
  let slug = core
  let n = 2
  while (existing.has(slug)) slug = `${core}-${n++}`
  existing.add(slug)
  return slug
}
