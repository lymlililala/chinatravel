import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyStr } from "./slugify";

/**
 * Build-time helper for the sitemap integration (which runs in astro.config,
 * where the content collection API is not available).
 *
 * Reads post frontmatter directly off disk, counts how many non-draft posts
 * use each tag (grouped by slug, mirroring getUniqueTags / the [tag] route),
 * and returns the set of tag slugs that fall below `threshold` posts. These
 * "thin" tag pages are noindexed at the page level and excluded from the
 * sitemap so they stop consuming crawl budget.
 */

const POSTS_DIR = fileURLToPath(new URL("../content/posts", import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Extract the `tags` values from a frontmatter block (list or inline form). */
function extractTags(frontmatter: string): string[] {
  // inline: tags: ["a", "b"]
  const inline = frontmatter.match(/^tags:\s*\[(.*)\]\s*$/m);
  if (inline) {
    return inline[1]
      .split(",")
      .map(s => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  // list:
  //   tags:
  //     - a
  //     - b
  const block = frontmatter.match(/^tags:\s*\n((?:[ \t]*-[ \t]*.+\n?)+)/m);
  if (block) {
    return block[1]
      .split("\n")
      .map(line => line.replace(/^[ \t]*-[ \t]*/, "").trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [];
}

export function getThinTagSlugs(threshold = 3): Set<string> {
  const counts = new Map<string, number>();

  for (const file of walk(POSTS_DIR)) {
    const txt = readFileSync(file, "utf8");
    const fmMatch = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) continue;
    const frontmatter = fmMatch[1];

    if (/^draft:\s*true\s*$/m.test(frontmatter)) continue;

    // Dedup per post by slug so a post counts once per tag.
    const slugs = new Set(extractTags(frontmatter).map(slugifyStr));
    for (const slug of slugs) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  const thin = new Set<string>();
  for (const [slug, count] of counts) {
    if (count < threshold) thin.add(slug);
  }
  return thin;
}
