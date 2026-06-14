import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import config from "@/config";

export async function GET() {
  const posts = await getCollection("posts");
  const sortedPosts = getSortedPosts(posts);

  const response = await rss({
    title: config.site.title,
    description: config.site.description,
    site: config.site.url,
    items: sortedPosts.map(({ data, id, filePath }) => ({
      link: getPostUrl(id, filePath, config.site.lang),
      title: data.title,
      description: data.description,
      pubDate: new Date(data.modDatetime ?? data.pubDatetime),
    })),
  });

  // Inject the XSL stylesheet reference manually. We avoid @astrojs/rss's
  // `stylesheet` option because it makes Rollup try to bundle the .xsl file
  // as a JS module, which breaks the production build. The stylesheet lives in
  // public/ and is served as-is.
  const xml = await response.text();
  const styled = xml.replace(
    /^(<\?xml[^>]*\?>)/,
    `$1<?xml-stylesheet href="/rss-styles.xsl" type="text/xsl"?>`
  );

  return new Response(styled, {
    headers: { "Content-Type": "application/xml" },
  });
}
