import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fontData, experimental_getFontFileURL } from "astro:assets";
import { getFontPathByWeight } from "@/utils/getFontPathByWeight";

/** A 400/700 font pair ready to hand to satori. */
export type OgFontPair = {
  /** Font family name to reference in satori styles. */
  family: string;
  regular: ArrayBuffer;
  bold: ArrayBuffer;
};

// Bundled fallback fonts (OFL, JetBrains Mono) committed under src/assets/fonts.
// These OG endpoints are prerendered at build time (Node, cwd = project root),
// so we read the source files straight off disk. Used whenever the remote
// Google font can't be fetched (offline/network-restricted builds) so the OG
// image still renders instead of crashing the whole build.
const FALLBACK_DIR = "src/assets/fonts";
const FALLBACK_REGULAR = "JetBrainsMono-Regular.ttf";
const FALLBACK_BOLD = "JetBrainsMono-Bold.ttf";

let fallbackPromise: Promise<OgFontPair> | null = null;

async function loadBundledFont(filename: string): Promise<ArrayBuffer> {
  const buf = await readFile(join(process.cwd(), FALLBACK_DIR, filename));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function loadFallbackFonts(): Promise<OgFontPair> {
  fallbackPromise ??= (async () => {
    const [regular, bold] = await Promise.all([
      loadBundledFont(FALLBACK_REGULAR),
      loadBundledFont(FALLBACK_BOLD),
    ]);
    return { family: "JetBrains Mono", regular, bold };
  })();
  return fallbackPromise;
}

/**
 * Resolve the 400/700 OG font pair, preferring the configured Google font and
 * falling back to a bundled local font when the remote fetch is unavailable.
 *
 * Returns the resolved font family name so callers reference the right one in
 * satori styles — it differs between the remote and fallback paths.
 */
export async function getOgFonts(
  cssVariable: keyof typeof fontData,
  remoteFamily: string,
  context: URL
): Promise<OgFontPair> {
  const fonts = fontData[cssVariable];
  const regularPath = fonts && getFontPathByWeight(fonts, 400);
  const boldPath = fonts && getFontPathByWeight(fonts, 700);

  if (regularPath && boldPath) {
    try {
      const [regular, bold] = await Promise.all([
        fetch(experimental_getFontFileURL(regularPath, context)).then(res =>
          res.arrayBuffer()
        ),
        fetch(experimental_getFontFileURL(boldPath, context)).then(res =>
          res.arrayBuffer()
        ),
      ]);
      return { family: remoteFamily, regular, bold };
    } catch {
      // Remote font fetch failed — fall through to the bundled fallback.
    }
  }

  return loadFallbackFonts();
}
