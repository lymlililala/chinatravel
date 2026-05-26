/**
 * Download destination images from Wikimedia Commons to public/destinations/
 * 
 * This script runs during build time on Vercel (where Wikimedia is accessible).
 * The downloaded images are served from Vercel's CDN, bypassing any regional blocks.
 * 
 * Run: node scripts/download-destination-images.mjs
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from "fs";
import { get as httpsGet } from "https";
import { get as httpGet } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEST_DIR = path.join(__dirname, "../public/destinations");

if (!existsSync(DEST_DIR)) {
  mkdirSync(DEST_DIR, { recursive: true });
}

// Map of filename -> Wikimedia Commons URL
// Verified via en.wikipedia.org API (June 2026)
const DESTINATION_IMAGES = {
  // Southwest
  "zhangye.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Zhangye_National_Geopark_5.jpg/960px-Zhangye_National_Geopark_5.jpg",
  "yunnan.jpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/%E8%99%8E%E8%B7%B3%E5%B3%A1.JPG/960px-%E8%99%8E%E8%B7%B3%E5%B3%A1.JPG",
  "dali.jpg":          "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/%E5%B4%87%E5%9C%A3%E5%AF%BA%E4%B8%89%E5%A1%94_-_panoramio_%285%29.jpg/960px-%E5%B4%87%E5%9C%A3%E5%AF%BA%E4%B8%89%E5%A1%94_-_panoramio_%285%29.jpg",
  "guizhou.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Huangguoshu_Waterfall_in_October_2020%2C_Picture12.jpg/960px-Huangguoshu_Waterfall_in_October_2020%2C_Picture12.jpg",
  "tibet.jpg":         "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Potala_Palace_HQ.jpg/960px-Potala_Palace_HQ.jpg",
  "xishuangbanna.jpg": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Jinghongcity.jpg/960px-Jinghongcity.jpg",
  // Northwest
  "xian.jpg":          "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/51714-Terracota-Army.jpg/960px-51714-Terracota-Army.jpg",
  "dunhuang.jpg":      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/2015-09-20-132538_-_Mondsichelsee_und_D%C3%BCnen.jpg/960px-2015-09-20-132538_-_Mondsichelsee_und_D%C3%BCnen.jpg",
  "kashgar.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/H%C3%ABytgah_Mosque%2C_Kashi_%2820230923100109%29.jpg/960px-H%C3%ABytgah_Mosque%2C_Kashi_%2820230923100109%29.jpg",
  // East China
  "anhui.jpg":         "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Yixian_Hongcun_2016.09.09_17-27-03.jpg/960px-Yixian_Hongcun_2016.09.09_17-27-03.jpg",
  "xidi.jpg":          "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/%E8%A5%BF%E9%80%92%E7%89%8C%E6%A5%BC.jpg/960px-%E8%A5%BF%E9%80%92%E7%89%8C%E6%A5%BC.jpg",
  // South China
  "fuzhou.jpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/%E4%B8%9C%E7%99%BE%E4%B8%AD%E5%BF%83A%E9%A6%8610%E6%A5%BC%E7%9E%AD%E6%9C%9B%E5%8F%B0%E8%A5%BF%E4%B8%89%E5%9D%8A%E4%B8%83%E5%B7%B7.jpg/960px-%E4%B8%9C%E7%99%BE%E4%B8%AD%E5%BF%83A%E9%A6%8610%E6%A5%BC%E7%9E%AD%E6%9C%9B%E5%8F%B0%E8%A5%BF%E4%B8%89%E5%9D%8A%E4%B8%83%E5%B7%B7.jpg",
};

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    const getter = url.startsWith("https://") ? httpsGet : httpGet;
    
    const request = getter(url, {
      headers: {
        "User-Agent": "RoamChinaBot/1.0 (https://roamchinatravel.com; build-script)",
        "Accept": "image/jpeg,image/*",
      },
      timeout: 30000,
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        // Follow redirect
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        const size = statSync(destPath).size;
        if (size < 5000) {
          reject(new Error(`File too small: ${size} bytes`));
        } else {
          resolve(size);
        }
      });
    });
    
    request.on("error", (err) => {
      file.close();
      reject(err);
    });
    
    request.on("timeout", () => {
      request.destroy();
      file.close();
      reject(new Error("Request timed out"));
    });
  });
}

async function main() {
  console.log("📸 Downloading destination images...");
  let success = 0;
  let failed = 0;
  
  for (const [filename, url] of Object.entries(DESTINATION_IMAGES)) {
    const destPath = path.join(DEST_DIR, filename);
    
    // Skip if already downloaded (at least 50KB)
    if (existsSync(destPath) && statSync(destPath).size > 50000) {
      console.log(`  ✓ Skip (exists): ${filename}`);
      success++;
      continue;
    }
    
    try {
      const size = await downloadFile(url, destPath);
      console.log(`  ✓ Downloaded (${Math.round(size/1024)}KB): ${filename}`);
      success++;
    } catch (err) {
      console.error(`  ✗ Failed: ${filename} - ${err.message}`);
      failed++;
    }
    
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n✅ Done: ${success} succeeded, ${failed} failed`);
  
  if (failed > 0) {
    console.log("⚠️  Some images failed to download. The site will use external URLs as fallback.");
    // Don't exit with error - allow build to continue
  }
}

main().catch(console.error);
