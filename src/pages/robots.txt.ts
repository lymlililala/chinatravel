import type { APIRoute } from "astro";

const getRobotsTxt = (sitemapURL: URL) => `# roamchinatravel.com - robots.txt
# https://www.robotstxt.org/robotstxt.html

# Allow all crawlers full access
User-agent: *
Allow: /

# Block access to internal/build paths
Disallow: /_astro/
Disallow: /api/

# Common AI training bots - block to protect content
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: Omgilibot
Disallow: /

User-agent: FacebookBot
Disallow: /

# Sitemap location
Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL("sitemap-index.xml", site);
  return new Response(getRobotsTxt(sitemapURL), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
