import { getRelativeLocaleUrl } from "astro:i18n";
import { slugifyStr } from "./slugify";
import config from "@/config";

/**
 * Derive the URL slug path directly from the collection `id`.
 * Astro's glob loader sets `id` to the relative path inside the
 * collection base, e.g. "toolkit/china-visa-entry-guide" or
 * "destinations/beijing". Each segment is slugified individually so
 * the result is URL-safe.
 *
 * Using `id` (always a clean relative path) instead of `filePath`
 * (which can be an absolute path at build time) avoids the fragile
 * string replace that previously broke sub-directory routing.
 */
function getPostSlugPath(id: string, _filePath?: string | undefined): string {
  return id
    .split("/")
    .filter(seg => seg !== "" && !seg.startsWith("_"))
    .map(seg => slugifyStr(seg))
    .join("/");
}

/**
 * Returns the slug-only path for use as a route param in `getStaticPaths`.
 * No base prefix, no locale — Astro handles those at a higher level.
 * e.g. `/examples/my-post`
 */
export function getPostSlug(id: string, filePath: string | undefined): string {
  return `/${getPostSlugPath(id, filePath)}`;
}

/**
 * Returns a fully navigable URL for use in `<a href>` and RSS links.
 * Applies both locale routing and the configured Astro base via
 * `getRelativeLocaleUrl`.
 * e.g. `/posts/my-post` or `/en/posts/my-post`
 */
export function getPostUrl(
  id: string,
  filePath: string | undefined,
  locale: string | undefined = config.site.lang
): string {
  return getRelativeLocaleUrl(locale, `posts/${getPostSlugPath(id, filePath)}`);
}
