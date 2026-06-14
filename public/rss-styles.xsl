<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/rss/channel">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title><xsl:value-of select="title"/> &#8226; RSS Feed</title>
        <style>
          :root {
            --bg: #fdfbf7;
            --fg: #1c1917;
            --muted: #6b6258;
            --accent: #c0392b;
            --card: #ffffff;
            --border: #e7e1d6;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #18130e;
              --fg: #f0e6d3;
              --muted: #b3a892;
              --accent: #e8a020;
              --card: #221b14;
              --border: #3a3026;
            }
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: var(--bg);
            color: var(--fg);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
          }
          .wrap { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
          .brand { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.5rem; }
          .logo {
            display: inline-flex; align-items: center; justify-content: center;
            width: 2.25rem; height: 2.25rem; border-radius: 0.6rem;
            background: var(--accent); color: #fff; font-weight: 800; font-size: 1.1rem;
          }
          .brand-name { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.02em;
            font-family: Georgia, "Times New Roman", serif; }
          .brand-name .accent { color: var(--accent); }
          .banner {
            background: var(--card); border: 1px solid var(--border);
            border-radius: 0.85rem; padding: 1.1rem 1.25rem; margin-bottom: 2rem;
            font-size: 0.92rem; color: var(--muted);
          }
          .banner strong { color: var(--fg); }
          h1 {
            font-family: Georgia, "Times New Roman", serif;
            font-size: 2rem; line-height: 1.2; letter-spacing: -0.02em;
            margin: 0 0 0.5rem;
          }
          .channel-desc { color: var(--muted); margin: 0 0 2.25rem; font-size: 1rem; }
          .count { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.72rem;
            font-weight: 700; color: var(--accent); margin-bottom: 1rem; }
          .item {
            padding: 1.4rem 0; border-top: 1px solid var(--border);
          }
          .item a.item-title {
            font-family: Georgia, "Times New Roman", serif;
            font-size: 1.22rem; font-weight: 700; color: var(--fg);
            text-decoration: none; line-height: 1.35; display: inline-block;
          }
          .item a.item-title:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
          .date { font-size: 0.78rem; color: var(--muted); margin: 0.35rem 0 0.6rem; }
          .desc { color: var(--muted); font-size: 0.95rem; margin: 0; }
          footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border);
            font-size: 0.82rem; color: var(--muted); }
          footer a { color: var(--accent); text-decoration: none; }
          footer a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="brand">
            <span class="logo" aria-hidden="true">&#26053;</span>
            <span class="brand-name">Roam<span class="accent">China</span> Travel</span>
          </div>

          <div class="banner">
            &#128225; <strong>This is an RSS feed.</strong> Subscribe by copying the URL from your browser's
            address bar into your favourite RSS reader (Feedly, Inoreader, NetNewsWire&#8230;) to get our latest
            China travel guides delivered automatically.
          </div>

          <h1><xsl:value-of select="title"/></h1>
          <p class="channel-desc"><xsl:value-of select="description"/></p>

          <div class="count">
            <xsl:value-of select="count(item)"/> recent article<xsl:if test="count(item) != 1">s</xsl:if>
          </div>

          <xsl:for-each select="item">
            <div class="item">
              <a class="item-title" href="{link}"><xsl:value-of select="title"/></a>
              <div class="date"><xsl:value-of select="pubDate"/></div>
              <p class="desc"><xsl:value-of select="description"/></p>
            </div>
          </xsl:for-each>

          <footer>
            Visit <a href="{link}"><xsl:value-of select="link"/></a> to read more.
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
