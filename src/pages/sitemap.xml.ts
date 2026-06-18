import type { APIRoute } from "astro";
import type { CollectionEntry } from "astro:content";
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

/** A post's "last updated" date — modDatetime when set, else pubDatetime. */
function postDate(post: CollectionEntry<"posts">): Date {
  return new Date(post.data.modDatetime ?? post.data.pubDatetime);
}

/** W3C sitemap date (YYYY-MM-DD); returns "" for missing/invalid dates. */
function lastmod(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

type SitemapUrl = { loc: string; lastmod?: string };

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    return new Response("Site URL not configured", { status: 500 });
  }

  const posts = await getCollection("posts");
  const sortedPosts = getSortedPosts(posts);
  const uniqueTags = getUniqueTags(posts);

  // Per tag slug: post count (to drop thin/noindexed tags) and the most recent
  // post date (to set the tag page's lastmod). Mirrors getUniqueTags' slugging
  // and the [tag] route's noindex condition.
  const tagCounts = new Map<string, number>();
  const tagLatest = new Map<string, Date>();
  for (const post of posts.filter(postFilter)) {
    const date = postDate(post);
    for (const slug of new Set(post.data.tags.map(slugifyStr))) {
      tagCounts.set(slug, (tagCounts.get(slug) ?? 0) + 1);
      const prev = tagLatest.get(slug);
      if (!prev || date > prev) tagLatest.set(slug, date);
    }
  }

  // Newest post date drives lastmod for content-aggregating pages (home, post
  // list, tag index): they change whenever the latest post does.
  const siteLastmod = lastmod(
    sortedPosts.length ? postDate(sortedPosts[0]) : undefined
  );

  const urls: SitemapUrl[] = [];

  // Homepage + content-listing pages (lastmod tracks the newest post).
  urls.push({ loc: buildUrl("/", site), lastmod: siteLastmod });
  urls.push({ loc: buildUrl("/posts/", site), lastmod: siteLastmod });
  urls.push({ loc: buildUrl("/tags/", site), lastmod: siteLastmod });

  // Static pages whose content is not derived from post dates — no lastmod.
  urls.push({ loc: buildUrl("/about/", site) });
  urls.push({ loc: buildUrl("/search/", site) });

  if (config.features?.showArchives !== false) {
    urls.push({ loc: buildUrl("/archives/", site), lastmod: siteLastmod });
  }

  // All blog posts.
  for (const post of sortedPosts) {
    const postUrl = getPostUrl(post.id, post.filePath, config.site.lang);
    urls.push({ loc: buildUrl(postUrl, site), lastmod: lastmod(postDate(post)) });
  }

  // All tag pages — skip thin ones (they are noindexed, so they must not
  // appear in the sitemap).
  for (const { tag } of uniqueTags) {
    if ((tagCounts.get(tag) ?? 0) < TAG_INDEX_THRESHOLD) continue;
    urls.push({
      loc: buildUrl(`/tags/${tag}/`, site),
      lastmod: lastmod(tagLatest.get(tag)),
    });
  }

  const urlsetEntries = urls
    .map(({ loc, lastmod }) =>
      lastmod
        ? `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
        : `  <url>\n    <loc>${loc}</loc>\n  </url>`
    )
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
