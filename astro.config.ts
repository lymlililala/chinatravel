import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import { getThinTagSlugs } from "./src/utils/thinTagSlugs";
import config from "./astro-paper.config";

// Tag pages with fewer than this many posts are thin/low-value: they are
// noindexed at the page level and excluded from the sitemap below.
const TAG_INDEX_THRESHOLD = 3;
const thinTagSlugs = getThinTagSlugs(TAG_INDEX_THRESHOLD);

export default defineConfig({
  site: config.site.url,
  integrations: [
    mdx(),
    sitemap({
      filter: page => {
        if (
          config.features?.showArchives === false &&
          page.endsWith("/archives/")
        ) {
          return false;
        }
        // Drop thin tag pages (and their pagination) from the sitemap.
        const tagMatch = page.match(/\/tags\/([^/]+)(?:\/|$)/);
        if (tagMatch && thinTagSlugs.has(decodeURIComponent(tagMatch[1]))) {
          return false;
        }
        // Drop tag pagination pages (/tags/<slug>/2/, /3/, …) — "page 2+" of a
        // tag listing is low-value; only the first page stays in the sitemap.
        if (/\/tags\/[^/]+\/\d+\/?$/.test(page)) {
          return false;
        }
        return true;
      },
    }),
  ],
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    remarkPlugins: [remarkToc, [remarkCollapse, { test: "Table of contents" }]],
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Playfair Display",
      cssVariable: "--font-playfair",
      provider: fontProviders.google(),
      fallbacks: ["Georgia", "serif"],
      weights: [400, 500, 600, 700, 800, 900],
      styles: ["normal", "italic"],
      formats: ["woff", "ttf"],
    },
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
      formats: ["woff", "ttf"],
    },
    {
      name: "Inter",
      cssVariable: "--font-inter",
      provider: fontProviders.google(),
      fallbacks: ["system-ui", "sans-serif"],
      weights: [400, 500, 600, 700],
      styles: ["normal"],
      formats: ["woff", "ttf"],
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
