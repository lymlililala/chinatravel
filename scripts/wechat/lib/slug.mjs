// slug 生成 + 站内唯一性。站内 slug 全为英文 kebab + 短随机后缀（如 ...-x5qo5s）。

/** 英文标题 → kebab slug；非 ASCII 丢弃（合成阶段要求 DeepSeek 产出英文 slug） */
export function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 70)
}

function randSuffix(n = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/**
 * 生成站内唯一 slug。
 * @param {string} base   英文 slug 主体（来自 DeepSeek 产出，已 slugify 或原始）
 * @param {Set<string>} existing  现有 slug 集合（含本批已分配的）
 */
export function uniqueSlug(base, existing) {
  let core = slugify(base) || 'wx-article'
  // 站内惯例：主体 + 短后缀
  let slug = `${core}-${randSuffix()}`
  while (existing.has(slug)) slug = `${core}-${randSuffix()}`
  existing.add(slug)
  return slug
}
