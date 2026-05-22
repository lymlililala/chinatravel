import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import { getUniqueTags } from "@/utils/getUniqueTags";
import { slugifyStr } from "@/utils/slugify";
import config from "@/config";

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

  // All tag pages
  for (const { tag } of uniqueTags) {
    urls.push(buildUrl(`/tags/${slugifyStr(tag)}/`, site));
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
