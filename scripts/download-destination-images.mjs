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
// Verified via en.wikipedia.org API (May 2026)
const DESTINATION_IMAGES = {
  // ── NORTH CHINA ──
  "beijing.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling-edit.jpg/960px-The_Great_Wall_of_China_at_Jinshanling-edit.jpg",
  "pingyao.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Pingyao-oldtown.jpg/960px-Pingyao-oldtown.jpg",
  "harbin.jpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/26935-Harbin_%2829661238117%29.jpg/960px-26935-Harbin_%2829661238117%29.jpg",
  "tianjin.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/%E5%A4%A9%E6%B4%A5%E4%B9%8B%E7%9C%BC%E5%8C%971.jpg/960px-%E5%A4%A9%E6%B4%A5%E4%B9%8B%E7%9C%BC%E5%8C%971.jpg",
  "dalian.jpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Xigang%2C_Dalian%2C_Liaoning%2C_China_-_panoramio_%2818%29.jpg/960px-Xigang%2C_Dalian%2C_Liaoning%2C_China_-_panoramio_%2818%29.jpg",
  "changbai.jpg":      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/%E4%BB%8E%E9%95%BF%E7%99%BD%E5%B1%B1%E8%A5%BF%E5%9D%A1%E7%9C%8B%E5%A4%A9%E6%B1%A0-2017-08-24_1.jpg/960px-%E4%BB%8E%E9%95%BF%E7%99%BD%E5%B1%B1%E8%A5%BF%E5%9D%A1%E7%9C%8B%E5%A4%A9%E6%B1%A0-2017-08-24_1.jpg",
  "shanghai.jpg":      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Shanghai_skyline_from_the_bund.jpg/960px-Shanghai_skyline_from_the_bund.jpg",
  // ── EAST CHINA ──
  "hangzhou.jpg":      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/West_Lake%2C_Hangzhou_2025.jpg/960px-West_Lake%2C_Hangzhou_2025.jpg",
  "huangshan.jpg":     "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Huangshan_pic_4.jpg/960px-Huangshan_pic_4.jpg",
  "suzhou.jpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/%E4%B8%9C%E6%96%B9%E4%B9%8B%E9%97%A81.jpg/960px-%E4%B8%9C%E6%96%B9%E4%B9%8B%E9%97%A81.jpg",
  "qingdao.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Qingdao_Harbour_51341-Qingdao_%2849055637186%29.jpg/960px-Qingdao_Harbour_51341-Qingdao_%2849055637186%29.jpg",
  "nanjing.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nanjing_CBD_from_City_Wall.jpg/960px-Nanjing_CBD_from_City_Wall.jpg",
  "anhui.jpg":         "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Yixian_Hongcun_2016.09.09_17-27-03.jpg/960px-Yixian_Hongcun_2016.09.09_17-27-03.jpg",
  "xidi.jpg":          "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/%E8%A5%BF%E9%80%92%E7%89%8C%E6%A5%BC.jpg/960px-%E8%A5%BF%E9%80%92%E7%89%8C%E6%A5%BC.jpg",
  "jiangxi.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/16137-Lushan_%2831834519847%29.jpg/960px-16137-Lushan_%2831834519847%29.jpg",
  // ── CENTRAL CHINA ──
  "wuhan.jpg":         "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/CN_-_Hubei_-_Wuhan_-_Kranichpagode.jpg/960px-CN_-_Hubei_-_Wuhan_-_Kranichpagode.jpg",
  "zhangjiajie.jpg":   "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/1_tianzishan_wulingyuan_zhangjiajie_2012.jpg/960px-1_tianzishan_wulingyuan_zhangjiajie_2012.jpg",
  "fenghuang.jpg":     "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Fenghuang_hunan.jpg/960px-Fenghuang_hunan.jpg",
  "luoyang.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/27427-Luoyang_%2849067744628%29.jpg/960px-27427-Luoyang_%2849067744628%29.jpg",
  // ── SOUTH CHINA ──
  "guangzhou.jpg":     "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Canton_Tower_20241027.jpg/960px-Canton_Tower_20241027.jpg",
  "hainan.jpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/SuperStar_Aquarius_at_Phoenix_Island%2C_Sanya_Bay_-_01.jpg/960px-SuperStar_Aquarius_at_Phoenix_Island%2C_Sanya_Bay_-_01.jpg",
  "guilin.jpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/87318-Li-River.jpg/960px-87318-Li-River.jpg",
  "gulangyu.jpg":      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/2018%E5%B9%B4%E7%9A%84%E9%BC%93%E6%B5%AA%E5%B1%BF.jpg/960px-2018%E5%B9%B4%E7%9A%84%E9%BC%93%E6%B5%AA%E5%B1%BF.jpg",
  "chaoshan.jpg":      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Paifangjie_%28cropped%29.jpg/960px-Paifangjie_%28cropped%29.jpg",
  "fuzhou.jpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/%E4%B8%9C%E7%99%BE%E4%B8%AD%E5%BF%83A%E9%A6%8610%E6%A5%BC%E7%9E%AD%E6%9C%9B%E5%8F%B0%E8%A5%BF%E4%B8%89%E5%9D%8A%E4%B8%83%E5%B7%B7.jpg/960px-%E4%B8%9C%E7%99%BE%E4%B8%AD%E5%BF%83A%E9%A6%8610%E6%A5%BC%E7%9E%AD%E6%9C%9B%E5%8F%B0%E8%A5%BF%E4%B8%89%E5%9D%8A%E4%B8%83%E5%B7%B7.jpg",
  "macau.jpg":         "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/%E5%A4%A7%E4%B8%89%E5%B7%B4%E7%89%8C%E5%9D%8A.jpg/960px-%E5%A4%A7%E4%B8%89%E5%B7%B4%E7%89%8C%E5%9D%8A.jpg",
  // ── SOUTHWEST ──
  "chengdu.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Grosser_Panda.JPG/960px-Grosser_Panda.JPG",
  "chongqing.jpg":     "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Chongqing_Nightscape.jpg/960px-Chongqing_Nightscape.jpg",
  "jiuzhaigou.jpg":    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/1_jiuzhaigou_valley_wu_hua_hai_2011b.jpg/960px-1_jiuzhaigou_valley_wu_hua_hai_2011b.jpg",
  "lijiang.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Black_Dragon_%E9%BB%91%E9%BE%99%E6%BD%AD_%285496141333%29.jpg/960px-Black_Dragon_%E9%BB%91%E9%BE%99%E6%BD%AD_%285496141333%29.jpg",
  "zhangye.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Zhangye_National_Geopark_5.jpg/960px-Zhangye_National_Geopark_5.jpg",
  "yunnan.jpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/%E8%99%8E%E8%B7%B3%E5%B3%A1.JPG/960px-%E8%99%8E%E8%B7%B3%E5%B3%A1.JPG",
  "dali.jpg":          "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/%E5%B4%87%E5%9C%A3%E5%AF%BA%E4%B8%89%E5%A1%94_-_panoramio_%285%29.jpg/960px-%E5%B4%87%E5%9C%A3%E5%AF%BA%E4%B8%89%E5%A1%94_-_panoramio_%285%29.jpg",
  "guizhou.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Huangguoshu_Waterfall_in_October_2020%2C_Picture12.jpg/960px-Huangguoshu_Waterfall_in_October_2020%2C_Picture12.jpg",
  "tibet.jpg":         "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Potala_Palace_HQ.jpg/960px-Potala_Palace_HQ.jpg",
  "xishuangbanna.jpg": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Jinghongcity.jpg/960px-Jinghongcity.jpg",
  // ── NORTHWEST ──
  "xian.jpg":          "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/51714-Terracota-Army.jpg/960px-51714-Terracota-Army.jpg",
  "dunhuang.jpg":      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/2015-09-20-132538_-_Mondsichelsee_und_D%C3%BCnen.jpg/960px-2015-09-20-132538_-_Mondsichelsee_und_D%C3%BCnen.jpg",
  "xinjiang.jpg":      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Lake_Kanas.jpg/960px-Lake_Kanas.jpg",
  "qinghai.jpg":       "https://upload.wikimedia.org/wikipedia/commons/6/6f/Qinghai_lake.jpg",
  "kashgar.jpg":       "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/H%C3%ABytgah_Mosque%2C_Kashi_%2820230923100109%29.jpg/960px-H%C3%ABytgah_Mosque%2C_Kashi_%2820230923100109%29.jpg",
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
