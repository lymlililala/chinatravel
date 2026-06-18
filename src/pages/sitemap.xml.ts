import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import { getUniqueTags } from "@/utils/getUniqueTags";
import { postFilter } from "@/utils/postFilter";
import { slugifyStr } from "@/utils/slugify";
import config from "@/config";

// Tag pages with fewer than this many posts are thin/low-value: they are
// noindexed at the page level (src/pages/tags/[tag]/[...page].astro) and
// excluded from the @astrojs/sitemap output (astro.config.ts). Mirror the same
// threshold here so this sitemap never advertises a noindexed URL — submitting
// a noindexed page is what triggers GSC's "excluded by noindex" warning.
const TAG_INDEX_THRESHOLD = 3;

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildUrl(path: string, site: URL): string {
  return xmlEscape(new URL(path, site).href);
}

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    return new Response("Site URL not configured", { status: 500 });
  }

  const posts = await getCollection("posts");
  const sortedPosts = getSortedPosts(posts);
  const uniqueTags = getUniqueTags(posts);

  // Count non-draft posts per tag slug so we can drop thin tag pages, matching
  // getUniqueTags' slugging and the [tag] route's noindex condition.
  const tagCounts = new Map<string, number>();
  for (const post of posts.filter(postFilter)) {
    for (const slug of new Set(post.data.tags.map(slugifyStr))) {
      tagCounts.set(slug, (tagCounts.get(slug) ?? 0) + 1);
    }
  }

  const urls: string[] = [];

  // Homepage
  urls.push(buildUrl("/", site));

  // Static pages
  urls.push(buildUrl("/about/", site));
  urls.push(buildUrl("/posts/", site));
  urls.push(buildUrl("/search/", site));
  urls.push(buildUrl("/tags/", site));

  if (config.features?.showArchives !== false) {
    urls.push(buildUrl("/archives/", site));
  }

  // All blog posts
  for (const post of sortedPosts) {
    const postUrl = getPostUrl(post.id, post.filePath, config.site.lang);
    urls.push(buildUrl(postUrl, site));
  }

  // All tag pages — skip thin ones (they are noindexed, so they must not
  // appear in the sitemap).
  for (const { tag } of uniqueTags) {
    if ((tagCounts.get(tag) ?? 0) < TAG_INDEX_THRESHOLD) continue;
    urls.push(buildUrl(`/tags/${tag}/`, site));
  }

  const urlsetEntries = urls
    .map(loc => `  <url>\n    <loc>${loc}</loc>\n  </url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlsetEntries}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
