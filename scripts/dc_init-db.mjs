/**
 * Discover China — Full database initialisation (create tables + seed data)
 *
 * This script:
 *   1. Creates dc_posts, dc_destinations, dc_subscribers tables (via pg direct connection)
 *   2. Upserts all posts and destinations
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:[DB_PASSWORD]@db.tixgzezefjjsyuzgdhcd.supabase.co:5432/postgres" \
 *   node scripts/dc_init-db.mjs
 *
 * Get DB_PASSWORD from Supabase Dashboard:
 *   https://supabase.com/dashboard/project/tixgzezefjjsyuzgdhcd/settings/database
 *   → "Connection string" → copy the password portion
 *
 * If you don't have the password, run the SQL manually:
 *   https://supabase.com/dashboard/project/tixgzezefjjsyuzgdhcd/sql/new
 *   Paste: scripts/dc_schema.sql
 *   Then run: node scripts/dc_seed.mjs
 */

import pkg from 'pg'
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const { Client } = pkg

// Load .env (gitignored) so the secret key never lives in a tracked file.
if (existsSync('.env')) process.loadEnvFile('.env')

// ─── Supabase config ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://tixgzezefjjsyuzgdhcd.supabase.co'
// New-format Supabase secret key (sb_secret_…), read from the environment only.
// Set it in .env (local) or as a Vercel env var — never hardcode it here.
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY
if (!SUPABASE_SECRET_KEY) {
  console.error('❌ Missing SUPABASE_SECRET_KEY. Set it in .env or the environment.')
  process.exit(1)
}

const DATABASE_URL = process.env.DATABASE_URL

// ─── DDL SQL ─────────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS dc_posts (
  id            BIGSERIAL     PRIMARY KEY,
  slug          TEXT          NOT NULL UNIQUE,
  file_path     TEXT          NOT NULL,
  title         TEXT          NOT NULL,
  description   TEXT          NOT NULL,
  author        TEXT          NOT NULL DEFAULT 'Discover China Editorial Team',
  tags          TEXT[]        NOT NULL DEFAULT '{}',
  category      TEXT          NOT NULL,
  featured      BOOLEAN       NOT NULL DEFAULT FALSE,
  draft         BOOLEAN       NOT NULL DEFAULT FALSE,
  pub_datetime  TIMESTAMPTZ   NOT NULL,
  mod_datetime  TIMESTAMPTZ,
  og_image      TEXT,
  content       TEXT          NOT NULL,
  word_count    INT           GENERATED ALWAYS AS (
                  array_length(regexp_split_to_array(trim(content), '\\s+'), 1)
                ) STORED,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dc_posts_idx_slug      ON dc_posts (slug);
CREATE INDEX IF NOT EXISTS dc_posts_idx_category  ON dc_posts (category);
CREATE INDEX IF NOT EXISTS dc_posts_idx_tags      ON dc_posts USING GIN (tags);
CREATE INDEX IF NOT EXISTS dc_posts_idx_featured  ON dc_posts (featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS dc_posts_idx_pub       ON dc_posts (pub_datetime DESC);
ALTER TABLE dc_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dc_posts' AND policyname = 'dc_posts_public_read') THEN
    CREATE POLICY dc_posts_public_read ON dc_posts FOR SELECT TO anon USING (draft = FALSE);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dc_destinations (
  id          BIGSERIAL   PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  tagline     TEXT        NOT NULL,
  image_url   TEXT        NOT NULL,
  image_alt   TEXT        NOT NULL,
  tag         TEXT        NOT NULL,
  highlights  TEXT[]      NOT NULL DEFAULT '{}',
  sort_order  INT         NOT NULL DEFAULT 0,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dc_destinations_idx_tag   ON dc_destinations (tag);
CREATE INDEX IF NOT EXISTS dc_destinations_idx_order ON dc_destinations (sort_order);
ALTER TABLE dc_destinations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dc_destinations' AND policyname = 'dc_destinations_public_read') THEN
    CREATE POLICY dc_destinations_public_read ON dc_destinations FOR SELECT TO anon USING (active = TRUE);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dc_subscribers (
  id              BIGSERIAL   PRIMARY KEY,
  email           TEXT        NOT NULL UNIQUE,
  source          TEXT        NOT NULL DEFAULT 'homepage',
  confirmed       BOOLEAN     NOT NULL DEFAULT FALSE,
  confirm_token   TEXT,
  subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dc_subscribers_idx_email     ON dc_subscribers (email);
CREATE INDEX IF NOT EXISTS dc_subscribers_idx_confirmed ON dc_subscribers (confirmed);
ALTER TABLE dc_subscribers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dc_subscribers' AND policyname = 'dc_subscribers_insert') THEN
    CREATE POLICY dc_subscribers_insert ON dc_subscribers FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;
`

// ─── Check existing tables ────────────────────────────────────────────────────
async function getExistingTables(supabase) {
  const tables = ['dc_posts', 'dc_destinations', 'dc_subscribers']
  const existing = []
  for (const t of tables) {
    const { error } = await supabase.from(t).select('id').limit(1)
    if (!error) existing.push(t)
  }
  return existing
}

// ─── Create tables via pg ─────────────────────────────────────────────────────
async function createTables() {
  if (!DATABASE_URL) return false

  console.log('\n🔗 Connecting to PostgreSQL...')
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })

  try {
    await client.connect()
    console.log('✅ Connected!')
    console.log('📦 Running schema SQL...')
    await client.query(SCHEMA_SQL)
    console.log('✅ Tables created / already exist!')
    await client.end()
    return true
  }
  catch (err) {
    console.error('❌ pg error:', err.message)
    try { await client.end() } catch (_) {}
    return false
  }
}

// ─── Seed data ────────────────────────────────────────────────────────────────
const posts = [
  {
    slug: 'china-visa-entry-guide',
    file_path: 'src/content/posts/toolkit/china-visa-entry-guide.md',
    title: 'China Visa & Entry Guide 2025: 144-Hour & 15-Day Transit Visa-Free Explained',
    description: 'Everything international travellers need to know about entering China in 2025 — tourist visas, the 144-hour transit visa-free policy, and the expanded 15-day visa-free program.',
    author: 'Discover China Editorial Team',
    tags: ['visa', 'entry', 'toolkit', 'beginners'],
    category: 'toolkit',
    featured: true,
    draft: false,
    pub_datetime: '2025-01-10T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## The Tourist Visa (L Visa)\n\nFor most travellers, the standard **L visa** (tourist visa) remains the most reliable way to visit China.\n\n### How to apply\n\nRequired documents: valid passport (6+ months validity), completed application form, passport photo, round-trip flight itinerary, hotel bookings, bank statement.\n\nProcessing time: standard 4–7 business days.\n\n## The 144-Hour Transit Visa-Free Policy\n\nIf you are transiting through certain Chinese cities on your way to a third country, you may enter visa-free for **up to 144 hours (6 days)**.\n\n### Key conditions\n\n- You must hold a confirmed onward ticket to a **third country** (not where you came from)\n- You must stay within the **designated visa-free zone** of the city\n- Available at Beijing (PEK/PKX), Shanghai (PVG/SHA), Guangzhou, Chengdu, Xi'an, and more\n\n## The 15-Day Visa-Free Bilateral Agreements\n\nSince late 2023, China has signed 15-day mutual visa-free agreements with many countries including France, Germany, Italy, Spain, Netherlands, Switzerland, Malaysia, Thailand, Singapore, and Australia (pilot).\n\n## Practical Tips\n\n- Book your outbound ticket before you arrive if using the transit exemption\n- Register your accommodation within 24 hours of arrival\n- Keep a photocopy of your passport\n\n*Last updated: May 2026*`,
  },
  {
    slug: 'china-payment-guide',
    file_path: 'src/content/posts/toolkit/china-payment-guide.md',
    title: 'Money & Payment in China 2025: How Foreigners Can Use Alipay and WeChat Pay',
    description: 'China is nearly cashless — here is exactly how to link your foreign Visa/Mastercard to Alipay and WeChat Pay so you can pay everywhere from street stalls to five-star restaurants.',
    author: 'Discover China Editorial Team',
    tags: ['payment', 'money', 'alipay', 'wechat', 'toolkit'],
    category: 'toolkit',
    featured: true,
    draft: false,
    pub_datetime: '2025-01-15T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## The Big Picture\n\nMost Chinese people pay by scanning QR codes. The two dominant platforms are **Alipay (支付宝)** and **WeChat Pay (微信支付)**.\n\n## Link a Foreign Card to Alipay\n\n1. Download Alipay from App Store or Google Play\n2. Register with your phone number\n3. Verify identity: tap profile → International Users → submit passport details\n4. Add your Visa or Mastercard\n5. Top up International Balance (min ~¥50, ~3% fee)\n6. Pay at any Alipay QR code\n\nAccepted cards: Visa ✅, Mastercard ✅, JCB ✅, Amex ⚠️ limited\n\n## Link a Foreign Card to WeChat Pay\n\n1. Download WeChat and create an account\n2. Me → Services → Wallet → Cards → Add a Card\n3. Enter card details and verify\n\n## Do I Still Need Cash?\n\nKeep ¥500–¥1,000 as backup for small rural guesthouses, some taxis, and emergencies.\n\n## Avoiding Common Pitfalls\n\n- Call your bank before travelling and inform them of China mobile payments\n- Set up payment apps before arrival — you need internet first\n- Your card issuer's foreign transaction fee applies\n\n*Last updated: May 2026*`,
  },
  {
    slug: 'china-apps-internet-guide',
    file_path: 'src/content/posts/toolkit/china-apps-internet-guide.md',
    title: 'Essential Apps for Travelling China in 2025 (And How to Stay Connected)',
    description: 'The definitive list of apps every international traveller needs in China — maps, transport, translation, food — plus honest advice on internet access and the Great Firewall.',
    author: 'Discover China Editorial Team',
    tags: ['apps', 'internet', 'toolkit', 'connectivity'],
    category: 'toolkit',
    featured: false,
    draft: false,
    pub_datetime: '2025-01-20T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## Must-Have Apps\n\n**Amap (高德地图)** — China's most accurate mapping app. English mode available. Download offline maps.\n\n**DiDi (滴滴)** — China's Uber. Cheaper than taxis. English app, accepts foreign cards.\n\n**Trip.com / 12306** — For high-speed train tickets.\n\n**DeepL + WeChat translator** — Best offline translation.\n\n**WeChat** — Essential for menus (QR), contacts, and WeChat Pay.\n\n**Meituan / Eleme** — Food delivery with English mode.\n\n## Internet Access: The Great Firewall\n\nThe Great Firewall blocks: Google, Facebook, Instagram, WhatsApp, Twitter/X, most Western news sites.\n\n### Your options\n\n**Option 1: VPN** — Set up BEFORE you arrive. Try ExpressVPN, NordVPN, or Astrill.\n\n**Option 2: Chinese alternatives** — Amap (not Google Maps), WeChat (not WhatsApp), Baidu.\n\n**Option 3: International roaming** — Bypasses the Firewall entirely. Check your carrier's China rates.\n\n**Option 4: Local SIM** — Cheap (~¥100–¥200) but subject to the Firewall.\n\n## Pre-Arrival Checklist\n\n- [ ] Download Amap + offline maps\n- [ ] Install DiDi and add payment method\n- [ ] Set up Alipay\n- [ ] Install and test VPN on all devices\n- [ ] Download DeepL offline (Chinese Simplified)\n- [ ] Register WeChat\n\n*Last updated: May 2026*`,
  },
  {
    slug: 'china-transport-guide',
    file_path: 'src/content/posts/toolkit/china-transport-guide.md',
    title: "Getting Around China in 2025: A Complete Guide to High-Speed Trains, Metros & More",
    description: "China's high-speed rail network is the world's largest. Here is exactly how to book tickets, navigate stations, and travel between cities like a local — even without Mandarin.",
    author: 'Discover China Editorial Team',
    tags: ['transport', 'trains', 'metro', 'toolkit'],
    category: 'toolkit',
    featured: false,
    draft: false,
    pub_datetime: '2025-01-25T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## High-Speed Trains\n\nChina's bullet trains hit 350 km/h. Beijing–Shanghai (1,200 km) takes just 4 hours.\n\n### Seat Classes\n\n| Class | Chinese | Notes |\n|-------|---------|-------|\n| Business | 商务座 | Spacious, meals on some routes |\n| First Class | 一等座 | Extra legroom, 4-across |\n| Second Class | 二等座 | Standard, very affordable |\n\n### How to Book\n\n**Trip.com** — English, accepts foreign cards, small service fee. Best for first-timers.\n\n**12306** — Official, no fee, requires Chinese phone number to register.\n\n### At the Station\n\nArrive 30–45 minutes early. Security screening mandatory. Show passport at e-gates.\n\n## City Metros\n\nFast, cheap (¥2–¥8), clean, bilingual signs in major cities. Pay with Alipay/WeChat QR or stored-value card.\n\n## DiDi (Ride-Hailing)\n\nCheaper than taxis, English app, trackable. Set up before you need it.\n\n## Practical Tips\n\n- Book trains early — popular routes sell out days in advance\n- Golden Week (Oct 1–7) and Spring Festival: book weeks ahead\n- Show your ticket to station staff if lost — they will guide you\n\n*Last updated: May 2026*`,
  },
  {
    slug: 'beijing-travel-guide',
    file_path: 'src/content/posts/destinations/beijing-travel-guide.md',
    title: "Beijing Travel Guide: Imperial History, Modern Buzz & Practical Tips",
    description: "Everything you need to plan a trip to Beijing — the Great Wall, Forbidden City, hutong neighbourhoods, food, day trips, and how to get around China's capital.",
    author: 'Discover China Editorial Team',
    tags: ['beijing', 'destinations', 'culture', 'history'],
    category: 'destinations',
    featured: true,
    draft: false,
    pub_datetime: '2025-02-01T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## Top Things to See\n\n**The Forbidden City (故宫)** — Home to 24 emperors over 600 years. 9,000 rooms in a 72-hectare compound. Book tickets in advance online. Allow 3–4 hours.\n\n**The Great Wall** — Mutianyu (recommended for first-timers: cable car + toboggan), Jinshanling (best hiking), Badaling (most crowded).\n\n**Temple of Heaven (天坛)** — 15th-century complex for imperial harvest prayers. Arrive early to see locals doing tai chi.\n\n**Summer Palace (颐和园)** — Imperial garden on Kunming Lake. Hire a rowing boat.\n\n**Beijing Hutongs** — Grey-tiled alley neighbourhoods near the Drum Tower. Best explored on foot or by rickshaw.\n\n## Where to Eat\n\n**Peking Duck** — Quanjude (classic), Dadong (modern), Duck de Chine.\n\n**Jianbing** — Street food crêpe with egg and chilli (¥8–¥15).\n\n**Yangrou Paomo** — Lamb soup with torn flatbread. Try Donglaishun.\n\n## Getting Around\n\nMetro covers all tourist sites. DiDi for surface-level trips. Cycling in hutongs via Meituan Bike.\n\n## Practical Info\n\nBest time: Spring (Apr–May) or Autumn (Sep–Oct). Airport: Beijing Capital (PEK) or Daxing (PKX).\n\n*Last updated: May 2026*`,
  },
  {
    slug: 'shanghai-travel-guide',
    file_path: 'src/content/posts/destinations/shanghai-travel-guide.md',
    title: "Shanghai Travel Guide: The Bund, Art Deco Glamour & the City That Never Sleeps",
    description: "Plan your Shanghai trip with our complete guide — the Bund, Pudong skyline, Yu Garden, French Concession, local food, nightlife, and day trip ideas.",
    author: 'Discover China Editorial Team',
    tags: ['shanghai', 'destinations', 'food', 'culture'],
    category: 'destinations',
    featured: false,
    draft: false,
    pub_datetime: '2025-02-05T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## Top Things to See\n\n**The Bund (外滩)** — Colonial-era banking houses facing Pudong's futuristic towers. Walk it at night.\n\n**Pudong** — Shanghai Tower (632m, 118th floor observation deck), Oriental Pearl Tower. Metro Line 2.\n\n**French Concession** — Art Deco villas, Xintiandi (restored shikumen), Tianzifang (craft laneways), Fuxing Park.\n\n**Yu Garden (豫园)** — Ming-dynasty classical garden in the Old City. ¥40. Combine with City God Temple.\n\n## Where to Eat\n\n**Soup Dumplings (小笼包)** — Din Tai Fung (consistent, English menus), Nanxiang Steamed Bun Restaurant at Yu Garden.\n\n**Sheng Jian Bao** — Pan-fried pork dumplings. Yang's Fry-Dumpling across the city.\n\n**Hairy Crab** — In season October–December.\n\n## Getting Around\n\nMetro: 24 lines, 500+ stations, from ¥3. Maglev from Pudong Airport to Longyang Road in 7.5 minutes (¥50).\n\n## Day Trips\n\nSuzhou (25 min), Hangzhou (45 min), Zhujiajiao water town (1 hr).\n\n*Last updated: May 2026*`,
  },
  {
    slug: 'xian-travel-guide',
    file_path: 'src/content/posts/destinations/xian-travel-guide.md',
    title: "Xi'an Travel Guide: Terracotta Warriors, the Silk Road & Muslim Quarter Food",
    description: "Xi'an was the starting point of the Silk Road and capital of 13 Chinese dynasties. Our guide covers the Terracotta Army, City Wall, Muslim Quarter, and how to do it all in 3–4 days.",
    author: 'Discover China Editorial Team',
    tags: ['xian', 'destinations', 'history', 'food', 'culture'],
    category: 'destinations',
    featured: false,
    draft: false,
    pub_datetime: '2025-02-10T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## Top Things to See\n\n**Terracotta Army (兵马俑)** — 8,000 warriors buried to guard Emperor Qin Shi Huang. 35km east of city. Tickets ¥120, book online. Allow half a day minimum.\n\n**Xi'an City Wall (城墙)** — 14km Ming-dynasty wall, wide enough to cycle. Rent a bike (included in ¥98 ticket). Best at dusk from the south gate.\n\n**Muslim Quarter (回民街)** — Historic neighbourhood since the Tang dynasty. The Great Mosque (✅ non-Muslims in courtyard). Must-eat: Roujiamo (lamb flatbread burger), Biangbiang Noodles, Yangrou Paomo.\n\n**Shaanxi History Museum** — One of China's best museums. Free (reserve tickets online — sell out fast).\n\n## Practical Info\n\nGetting there: high-speed rail from Beijing (~4.5 hrs), Shanghai (~6 hrs), Chengdu (~3 hrs).\n\nBest time: Spring (Mar–May) or Autumn (Sep–Nov).\n\nDay trips: Huashan sacred mountain (~1.5 hrs), Famen Temple (1.5 hrs by bus).\n\n*Last updated: May 2026*`,
  },
  {
    slug: 'chengdu-travel-guide',
    file_path: 'src/content/posts/destinations/chengdu-travel-guide.md',
    title: "Chengdu Travel Guide: Giant Pandas, Sichuan Hotpot & a City That Knows How to Live",
    description: "Chengdu is China's most relaxed major city — famous for giant pandas, the world's spiciest cuisine, teahouse culture, and its role as the gateway to Tibet and the Sichuan highlands.",
    author: 'Discover China Editorial Team',
    tags: ['chengdu', 'destinations', 'food', 'nature'],
    category: 'destinations',
    featured: false,
    draft: false,
    pub_datetime: '2025-02-15T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## Top Things to See\n\n**Giant Panda Base (大熊猫繁育研究基地)** — Best place in the world to see pandas. Arrive at 7:30am for feeding time. Tickets ¥55, book in advance. Also has red pandas.\n\n**Leshan Giant Buddha (乐山大佛)** — World's largest stone Buddha at 71m. 2.5 hrs by train. Take the boat for the best view.\n\n**Jinli Ancient Street (锦里)** — Restored Qing-dynasty street by the Wuhou Shrine. Beautiful lit at night.\n\n**Teahouse Culture** — Spend an afternoon in Renmin Park's teahouse gardens. Local, not touristy.\n\n## Where to Eat\n\n**Sichuan Hotpot** — Haidilao (theatrical service, English menus), Xiaolongkan (authentic, intense).\n\n**Mapo Tofu** — Silken tofu in spiced pork sauce. Chen Mapo Tofu restaurant.\n\n**Dan Dan Noodles** — Thin noodles with sesame paste and chilli oil. ¥10–¥15 at noodle shops.\n\n## Day Trips\n\nLeshan (2.5 hrs), Emei Shan sacred mountain (2 hrs), Jiuzhaigou lakes (1 hr by plane).\n\n*Last updated: May 2026*`,
  },
  {
    slug: 'guilin-travel-guide',
    file_path: 'src/content/posts/destinations/guilin-travel-guide.md',
    title: "Guilin Travel Guide: Li River Karst Mountains, Yangshuo & the Longji Rice Terraces",
    description: "Guilin's jagged limestone karst mountains and jade-green rivers are among China's most iconic landscapes. Here is how to explore them without the crowds.",
    author: 'Discover China Editorial Team',
    tags: ['guilin', 'destinations', 'nature', 'outdoors'],
    category: 'destinations',
    featured: false,
    draft: false,
    pub_datetime: '2025-02-20T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## The Li River\n\nThe 83km stretch from Guilin to Yangshuo is one of China's most beautiful river journeys.\n\n**Official cruise** (4–5 hrs) — Large cruise ship, ¥210–¥320. Departs ~9:30am.\n\n**Cycling from Yangshuo** — More immersive. Flat roads, real villages, same scenery.\n\n## Yangshuo\n\nThe town at the end of the cruise. Best base for exploring.\n\n- **Cycling** — Hire a bike (¥20–¥30/day) and cycle the Yulong River: sugarcane fields, water buffalo, ancient bridges.\n- **Rock climbing** — World-class limestone. ChinaClimb offers guided climbing.\n- **Impression Liu Sanjie** — Zhang Yimou's spectacular outdoor night show on the Li River. Tickets ¥218–¥998.\n\n## Longji Rice Terraces\n\n2 hours north of Guilin. 700-year-old cascading paddies cut by Zhuang and Yao peoples.\n\nBest season: June–July (flooded green) or September–October (golden harvest).\n\nStay overnight to catch sunrise and mist.\n\n## Practical Info\n\nBest time: April–November. Getting there: flights or high-speed rail from Guangzhou (~2.5 hrs).\n\n*Last updated: May 2026*`,
  },
  {
    slug: 'dali-travel-guide',
    file_path: 'src/content/posts/destinations/dali-travel-guide.md',
    title: "Dali Travel Guide: Ancient Town, Erhai Lake & Yunnan's Most Beloved Escape",
    description: "Dali is where travellers come to slow down — a 700-year-old walled town beside a mountain lake in Yunnan province, home to the Bai minority and some of China's most relaxed café culture.",
    author: 'Discover China Editorial Team',
    tags: ['dali', 'destinations', 'nature', 'culture', 'solo'],
    category: 'destinations',
    featured: false,
    draft: false,
    pub_datetime: '2025-02-25T08:00:00Z',
    mod_datetime: '2026-05-01T10:00:00Z',
    content: `## Dali Old Town\n\nA compact grid of Ming and Qing dynasty streets enclosed by original city walls. Almost entirely pedestrianised.\n\n**Three Pagodas (崇圣寺三塔)** — Tang-dynasty pagodas reflected in a pool before Cangshan mountains. Visit at sunrise (¥75).\n\n**Tie-dye and marble** — Dali is famous for indigo tie-dye and polished Dali marble. Both make excellent gifts.\n\n## Erhai Lake\n\nThe 250km² freshwater lake is crystal clear, one of China's cleanest.\n\n**Circumnavigation by e-scooter** — The 120km lake circuit road, fully doable in a day (~¥80 rental). Absolutely recommended.\n\n**Shuanglang Village** — Most atmospheric village on the eastern shore. Bai courtyard guesthouses, beautiful sunrise.\n\n## Cangshan Mountain\n\n4,122m peak west of Dali. Cable car to ~2,600m (¥80 up, ¥60 down). Forest walks along the ridge.\n\n## Practical Info\n\nGetting there: fly to Dali Airport (DLU) or high-speed rail (~30 min by DiDi from old town).\n\nFrom Kunming: 2.5 hrs by high-speed train. From Lijiang: 1.5 hrs.\n\nStay 3–4 days minimum. Many travellers stay weeks.\n\n*Last updated: May 2026*`,
  },
]

const destinations = [
  { slug: 'beijing', name: 'Beijing', tagline: 'Imperial grandeur meets modern China', image_url: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&q=80', image_alt: 'The Great Wall of China near Beijing', tag: 'beijing', highlights: ['Great Wall', 'Forbidden City', 'Temple of Heaven'], sort_order: 1, active: true },
  { slug: 'shanghai', name: 'Shanghai', tagline: 'The city that never sleeps', image_url: 'https://images.unsplash.com/photo-1537944434965-cf4679d1a598?w=600&q=80', image_alt: 'Shanghai Bund skyline at night', tag: 'shanghai', highlights: ['The Bund', 'Yu Garden', 'French Concession'], sort_order: 2, active: true },
  { slug: 'xian', name: "Xi'an", tagline: 'Cradle of Chinese civilisation', image_url: 'https://images.unsplash.com/photo-1591451427710-ad34d2cfd9d1?w=600&q=80', image_alt: "Terracotta Warriors in Xi'an", tag: 'xian', highlights: ['Terracotta Army', 'City Wall', 'Muslim Quarter'], sort_order: 3, active: true },
  { slug: 'chengdu', name: 'Chengdu', tagline: 'Pandas, hotpot & laid-back vibes', image_url: 'https://images.unsplash.com/photo-1569880153113-76e33fc52d5f?w=600&q=80', image_alt: 'Giant panda in Chengdu Research Base', tag: 'chengdu', highlights: ['Giant Pandas', 'Hotpot', 'Leshan Buddha'], sort_order: 4, active: true },
  { slug: 'guilin', name: 'Guilin', tagline: 'Karst mountains & emerald rivers', image_url: 'https://images.unsplash.com/photo-1513415756790-2ac1db1297d0?w=600&q=80', image_alt: 'Li River karst scenery in Guilin', tag: 'guilin', highlights: ['Li River Cruise', 'Longji Terraces', 'Reed Flute Cave'], sort_order: 5, active: true },
  { slug: 'dali', name: 'Dali', tagline: 'Ancient town by the Erhai Lake', image_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80', image_alt: 'Old Town of Dali with Cangshan mountains', tag: 'dali', highlights: ['Old Town', 'Erhai Lake', 'Cangshan Mountains'], sort_order: 6, active: true },
]

// ─── Seed via Supabase REST ───────────────────────────────────────────────────
async function seedData(supabase) {
  console.log('\n📝 Seeding dc_posts...')
  const postRows = posts.map(p => ({ ...p, updated_at: new Date().toISOString() }))
  const { error: pe } = await supabase.from('dc_posts').upsert(postRows, { onConflict: 'slug' })
  if (pe) { console.error('  ❌ dc_posts error:', pe.message); return false }
  console.log(`  ✅ ${postRows.length} posts upserted`)

  console.log('\n🗺️  Seeding dc_destinations...')
  const destRows = destinations.map(d => ({ ...d, updated_at: new Date().toISOString() }))
  const { error: de } = await supabase.from('dc_destinations').upsert(destRows, { onConflict: 'slug' })
  if (de) { console.error('  ❌ dc_destinations error:', de.message); return false }
  console.log(`  ✅ ${destRows.length} destinations upserted`)

  return true
}

// ─── Verify ───────────────────────────────────────────────────────────────────
async function verify(supabase) {
  console.log('\n📊 Row counts:')
  for (const t of ['dc_posts', 'dc_destinations', 'dc_subscribers']) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
    console.log(`   ${t.padEnd(20)} ${error ? '❌ ' + error.message : '✅ ' + count + ' rows'}`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Discover China — Full DB init + seed')
  console.log(`   Project: tixgzezefjjsyuzgdhcd`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)

  // Step 1: Check if tables already exist
  const existing = await getExistingTables(supabase)
  const needed = ['dc_posts', 'dc_destinations', 'dc_subscribers'].filter(t => !existing.includes(t))

  if (existing.length > 0) console.log('\n✅ Existing tables:', existing.join(', '))

  // Step 2: Create missing tables
  if (needed.length > 0) {
    console.log('\n⚡ Tables to create:', needed.join(', '))

    if (!DATABASE_URL) {
      // Print instructions
      console.log('\n' + '═'.repeat(68))
      console.log('⚠️  No DATABASE_URL provided.')
      console.log('To create tables, either:')
      console.log()
      console.log('Option A — Provide DATABASE_URL and rerun:')
      console.log('  DATABASE_URL="postgresql://postgres:[PASSWORD]@db.tixgzezefjjsyuzgdhcd.supabase.co:5432/postgres"')
      console.log('  node scripts/dc_init-db.mjs')
      console.log()
      console.log('Option B — Paste scripts/dc_schema.sql into:')
      console.log('  https://supabase.com/dashboard/project/tixgzezefjjsyuzgdhcd/sql/new')
      console.log()
      console.log('Then rerun: node scripts/dc_seed.mjs')
      console.log('═'.repeat(68))
      process.exit(1)
    }

    const created = await createTables()
    if (!created) {
      console.error('\n❌ Failed to create tables. Check your DATABASE_URL.')
      process.exit(1)
    }
  }
  else {
    console.log('✅ All tables exist, proceeding to seed...')
  }

  // Step 3: Seed data
  const seeded = await seedData(supabase)
  if (!seeded) {
    console.error('\n❌ Seeding failed.')
    process.exit(1)
  }

  // Step 4: Verify
  await verify(supabase)

  console.log('\n🎉 Done!\n')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
