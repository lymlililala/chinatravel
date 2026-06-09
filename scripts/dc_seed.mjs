/**
 * Seed script for Discover China.
 * Upserts all posts and destinations into Supabase.
 *
 * Usage:
 *   node scripts/dc_seed.mjs
 *
 * Tables: dc_posts, dc_destinations
 * Supabase project: tixgzezefjjsyuzgdhcd
 */

import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Load .env (gitignored) so the secret key never lives in a tracked file.
if (existsSync('.env')) process.loadEnvFile('.env')

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://tixgzezefjjsyuzgdhcd.supabase.co'
// New-format Supabase secret key (sb_secret_…), read from the environment only.
// Set it in .env (local) or as a Vercel env var — never hardcode it here.
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY
if (!SUPABASE_SECRET_KEY) {
  console.error('❌ Missing SUPABASE_SECRET_KEY. Set it in .env or the environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)

// ─── dc_posts data ────────────────────────────────────────────────────────────
const posts = [
  // ── Toolkit ──────────────────────────────────────────────────────────────
  {
    slug: 'china-visa-entry-guide',
    filePath: 'src/content/posts/toolkit/china-visa-entry-guide.md',
    title: 'China Visa & Entry Guide 2025: 144-Hour & 15-Day Transit Visa-Free Explained',
    description:
      'Everything international travellers need to know about entering China in 2025 — tourist visas, the 144-hour transit visa-free policy, and the expanded 15-day visa-free program.',
    author: 'Discover China Editorial Team',
    tags: ['visa', 'entry', 'toolkit', 'beginners'],
    category: 'toolkit',
    featured: true,
    draft: false,
    pubDatetime: '2025-01-10T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## The Tourist Visa (L Visa)

For most travellers, the standard **L visa** (tourist visa) remains the most reliable way to visit China.

### How to apply

Required documents: valid passport (6+ months validity), completed application form, passport photo, round-trip flight itinerary, hotel bookings, bank statement.

Processing time: standard 4–7 business days.

## The 144-Hour Transit Visa-Free Policy

If you are transiting through certain Chinese cities on your way to a third country, you may enter visa-free for **up to 144 hours (6 days)**.

### Key conditions

- You must hold a confirmed onward ticket to a **third country** (not where you came from)
- You must stay within the **designated visa-free zone** of the city
- Available at Beijing (PEK/PKX), Shanghai (PVG/SHA), Guangzhou, Chengdu, Xi'an, and more

## The 15-Day Visa-Free Bilateral Agreements

Since late 2023, China has signed 15-day mutual visa-free agreements with many countries including France, Germany, Italy, Spain, Netherlands, Switzerland, Malaysia, Thailand, Singapore, and Australia (pilot).

## Practical Tips

- Book your outbound ticket before you arrive if using the transit exemption
- Register your accommodation within 24 hours of arrival
- Keep a photocopy of your passport

*Last updated: May 2026*`,
  },
  {
    slug: 'china-payment-guide',
    filePath: 'src/content/posts/toolkit/china-payment-guide.md',
    title: 'Money & Payment in China 2025: How Foreigners Can Use Alipay and WeChat Pay',
    description:
      'China is nearly cashless — here is exactly how to link your foreign Visa/Mastercard to Alipay and WeChat Pay so you can pay everywhere from street stalls to five-star restaurants.',
    author: 'Discover China Editorial Team',
    tags: ['payment', 'money', 'alipay', 'wechat', 'toolkit'],
    category: 'toolkit',
    featured: true,
    draft: false,
    pubDatetime: '2025-01-15T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## The Big Picture

Most Chinese people pay by scanning QR codes. The two dominant platforms are **Alipay (支付宝)** and **WeChat Pay (微信支付)**.

## Link a Foreign Card to Alipay

1. Download Alipay from App Store or Google Play
2. Register with your phone number
3. Verify identity: tap profile → International Users → submit passport details
4. Add your Visa or Mastercard
5. Top up International Balance (min ~¥50, ~3% fee)
6. Pay at any Alipay QR code

Accepted cards: Visa ✅, Mastercard ✅, JCB ✅, Amex ⚠️ limited

## Link a Foreign Card to WeChat Pay

1. Download WeChat and create an account
2. Me → Services → Wallet → Cards → Add a Card
3. Enter card details and verify

## Do I Still Need Cash?

Keep ¥500–¥1,000 as backup for small rural guesthouses, some taxis, and emergencies.

## Avoiding Common Pitfalls

- Call your bank before travelling and inform them of China mobile payments
- Set up payment apps before arrival — you need internet first
- Your card issuer's foreign transaction fee applies

*Last updated: May 2026*`,
  },
  {
    slug: 'china-apps-internet-guide',
    filePath: 'src/content/posts/toolkit/china-apps-internet-guide.md',
    title: 'Essential Apps for Travelling China in 2025 (And How to Stay Connected)',
    description:
      'The definitive list of apps every international traveller needs in China — maps, transport, translation, food — plus honest advice on internet access and the Great Firewall.',
    author: 'Discover China Editorial Team',
    tags: ['apps', 'internet', 'toolkit', 'connectivity'],
    category: 'toolkit',
    featured: false,
    draft: false,
    pubDatetime: '2025-01-20T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## Must-Have Apps

**Amap (高德地图)** — China's most accurate mapping app. English mode available. Download offline maps.

**DiDi (滴滴)** — China's Uber. Cheaper than taxis. English app, accepts foreign cards.

**Trip.com / 12306** — For high-speed train tickets.

**DeepL + WeChat translator** — Best offline translation.

**WeChat** — Essential for menus (QR), contacts, and WeChat Pay.

**Meituan / Eleme** — Food delivery with English mode.

## Internet Access: The Great Firewall

The Great Firewall blocks: Google, Facebook, Instagram, WhatsApp, Twitter/X, most Western news sites.

### Your options

**Option 1: VPN** — Set up BEFORE you arrive. Try ExpressVPN, NordVPN, or Astrill.

**Option 2: Chinese alternatives** — Amap (not Google Maps), WeChat (not WhatsApp), Baidu.

**Option 3: International roaming** — Bypasses the Firewall entirely. Check your carrier's China rates.

**Option 4: Local SIM** — Cheap (~¥100–¥200) but subject to the Firewall.

## Pre-Arrival Checklist

- [ ] Download Amap + offline maps
- [ ] Install DiDi and add payment method
- [ ] Set up Alipay
- [ ] Install and test VPN on all devices
- [ ] Download DeepL offline (Chinese Simplified)
- [ ] Register WeChat

*Last updated: May 2026*`,
  },
  {
    slug: 'china-transport-guide',
    filePath: 'src/content/posts/toolkit/china-transport-guide.md',
    title: 'Getting Around China in 2025: A Complete Guide to High-Speed Trains, Metros & More',
    description:
      "China's high-speed rail network is the world's largest. Here is exactly how to book tickets, navigate stations, and travel between cities like a local — even without Mandarin.",
    author: 'Discover China Editorial Team',
    tags: ['transport', 'trains', 'metro', 'toolkit'],
    category: 'toolkit',
    featured: false,
    draft: false,
    pubDatetime: '2025-01-25T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## High-Speed Trains

China's bullet trains hit 350 km/h. Beijing–Shanghai (1,200 km) takes just 4 hours.

### Seat Classes

| Class | Chinese | Notes |
|-------|---------|-------|
| Business | 商务座 | Spacious, meals on some routes |
| First Class | 一等座 | Extra legroom, 4-across |
| Second Class | 二等座 | Standard, very affordable |

### How to Book

**Trip.com** — English, accepts foreign cards, small service fee. Best for first-timers.

**12306** — Official, no fee, requires Chinese phone number to register.

### At the Station

Arrive 30–45 minutes early. Security screening mandatory. Show passport at e-gates.

## City Metros

Fast, cheap (¥2–¥8), clean, bilingual signs in major cities. Pay with Alipay/WeChat QR or stored-value card.

## DiDi (Ride-Hailing)

Cheaper than taxis, English app, trackable. Set up before you need it.

## Practical Tips

- Book trains early — popular routes sell out days in advance
- Golden Week (Oct 1–7) and Spring Festival: book weeks ahead
- Show your ticket to station staff if lost — they will guide you

*Last updated: May 2026*`,
  },

  // ── Destinations ──────────────────────────────────────────────────────────
  {
    slug: 'beijing-travel-guide',
    filePath: 'src/content/posts/destinations/beijing-travel-guide.md',
    title: 'Beijing Travel Guide: Imperial History, Modern Buzz & Practical Tips',
    description:
      'Everything you need to plan a trip to Beijing — the Great Wall, Forbidden City, hutong neighbourhoods, food, day trips, and how to get around China\'s capital.',
    author: 'Discover China Editorial Team',
    tags: ['beijing', 'destinations', 'culture', 'history'],
    category: 'destinations',
    featured: true,
    draft: false,
    pubDatetime: '2025-02-01T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## Top Things to See

**The Forbidden City (故宫)** — Home to 24 emperors over 600 years. 9,000 rooms in a 72-hectare compound. Book tickets in advance online. Allow 3–4 hours.

**The Great Wall** — Mutianyu (recommended for first-timers: cable car + toboggan), Jinshanling (best hiking), Badaling (most crowded).

**Temple of Heaven (天坛)** — 15th-century complex for imperial harvest prayers. Arrive early to see locals doing tai chi.

**Summer Palace (颐和园)** — Imperial garden on Kunming Lake. Hire a rowing boat.

**Beijing Hutongs** — Grey-tiled alley neighbourhoods near the Drum Tower. Best explored on foot or by rickshaw.

## Where to Eat

**Peking Duck** — Quanjude (classic), Dadong (modern), Duck de Chine.

**Jianbing** — Street food crêpe with egg and chilli (¥8–¥15).

**Yangrou Paomo** — Lamb soup with torn flatbread. Try Donglaishun.

## Getting Around

Metro covers all tourist sites. DiDi for surface-level trips. Cycling in hutongs via Meituan Bike.

## Practical Info

Best time: Spring (Apr–May) or Autumn (Sep–Oct). Airport: Beijing Capital (PEK) or Daxing (PKX).

*Last updated: May 2026*`,
  },
  {
    slug: 'shanghai-travel-guide',
    filePath: 'src/content/posts/destinations/shanghai-travel-guide.md',
    title: 'Shanghai Travel Guide: The Bund, Art Deco Glamour & the City That Never Sleeps',
    description:
      'Plan your Shanghai trip with our complete guide — the Bund, Pudong skyline, Yu Garden, French Concession, local food, nightlife, and day trip ideas.',
    author: 'Discover China Editorial Team',
    tags: ['shanghai', 'destinations', 'food', 'culture'],
    category: 'destinations',
    featured: false,
    draft: false,
    pubDatetime: '2025-02-05T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## Top Things to See

**The Bund (外滩)** — Colonial-era banking houses facing Pudong's futuristic towers. Walk it at night.

**Pudong** — Shanghai Tower (632m, 118th floor observation deck), Oriental Pearl Tower. Metro Line 2.

**French Concession** — Art Deco villas, Xintiandi (restored shikumen), Tianzifang (craft laneways), Fuxing Park.

**Yu Garden (豫园)** — Ming-dynasty classical garden in the Old City. ¥40. Combine with City God Temple.

## Where to Eat

**Soup Dumplings (小笼包)** — Din Tai Fung (consistent, English menus), Nanxiang Steamed Bun Restaurant at Yu Garden.

**Sheng Jian Bao** — Pan-fried pork dumplings. Yang's Fry-Dumpling across the city.

**Hairy Crab** — In season October–December.

## Getting Around

Metro: 24 lines, 500+ stations, from ¥3. Maglev from Pudong Airport to Longyang Road in 7.5 minutes (¥50).

## Day Trips

Suzhou (25 min), Hangzhou (45 min), Zhujiajiao water town (1 hr).

*Last updated: May 2026*`,
  },
  {
    slug: 'xian-travel-guide',
    filePath: 'src/content/posts/destinations/xian-travel-guide.md',
    title: "Xi'an Travel Guide: Terracotta Warriors, the Silk Road & Muslim Quarter Food",
    description:
      "Xi'an was the starting point of the Silk Road and capital of 13 Chinese dynasties. Our guide covers the Terracotta Army, City Wall, Muslim Quarter, and how to do it all in 3–4 days.",
    author: 'Discover China Editorial Team',
    tags: ['xian', 'destinations', 'history', 'food', 'culture'],
    category: 'destinations',
    featured: false,
    draft: false,
    pubDatetime: '2025-02-10T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## Top Things to See

**Terracotta Army (兵马俑)** — 8,000 warriors buried to guard Emperor Qin Shi Huang. 35km east of city. Tickets ¥120, book online. Allow half a day minimum.

**Xi'an City Wall (城墙)** — 14km Ming-dynasty wall, wide enough to cycle. Rent a bike (included in ¥98 ticket). Best at dusk from the south gate.

**Muslim Quarter (回民街)** — Historic neighbourhood since the Tang dynasty. The Great Mosque (✅ non-Muslims in courtyard). Must-eat: Roujiamo (lamb flatbread burger), Biangbiang Noodles, Yangrou Paomo.

**Shaanxi History Museum** — One of China's best museums. Free (reserve tickets online — sell out fast).

## Practical Info

Getting there: high-speed rail from Beijing (~4.5 hrs), Shanghai (~6 hrs), Chengdu (~3 hrs).

Best time: Spring (Mar–May) or Autumn (Sep–Nov).

Day trips: Huashan sacred mountain (~1.5 hrs), Famen Temple (1.5 hrs by bus).

*Last updated: May 2026*`,
  },
  {
    slug: 'chengdu-travel-guide',
    filePath: 'src/content/posts/destinations/chengdu-travel-guide.md',
    title: "Chengdu Travel Guide: Giant Pandas, Sichuan Hotpot & a City That Knows How to Live",
    description:
      "Chengdu is China's most relaxed major city — famous for giant pandas, the world's spiciest cuisine, teahouse culture, and its role as the gateway to Tibet and the Sichuan highlands.",
    author: 'Discover China Editorial Team',
    tags: ['chengdu', 'destinations', 'food', 'nature'],
    category: 'destinations',
    featured: false,
    draft: false,
    pubDatetime: '2025-02-15T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## Top Things to See

**Giant Panda Base (大熊猫繁育研究基地)** — Best place in the world to see pandas. Arrive at 7:30am for feeding time. Tickets ¥55, book in advance. Also has red pandas.

**Leshan Giant Buddha (乐山大佛)** — World's largest stone Buddha at 71m. 2.5 hrs by train. Take the boat for the best view.

**Jinli Ancient Street (锦里)** — Restored Qing-dynasty street by the Wuhou Shrine. Beautiful lit at night.

**Teahouse Culture** — Spend an afternoon in Renmin Park's teahouse gardens. Local, not touristy.

## Where to Eat

**Sichuan Hotpot** — Haidilao (theatrical service, English menus), Xiaolongkan (authentic, intense).

**Mapo Tofu** — Silken tofu in spiced pork sauce. Chen Mapo Tofu restaurant.

**Dan Dan Noodles** — Thin noodles with sesame paste and chilli oil. ¥10–¥15 at noodle shops.

## Day Trips

Leshan (2.5 hrs), Emei Shan sacred mountain (2 hrs), Jiuzhaigou lakes (1 hr by plane).

*Last updated: May 2026*`,
  },
  {
    slug: 'guilin-travel-guide',
    filePath: 'src/content/posts/destinations/guilin-travel-guide.md',
    title: 'Guilin Travel Guide: Li River Karst Mountains, Yangshuo & the Longji Rice Terraces',
    description:
      "Guilin's jagged limestone karst mountains and jade-green rivers are among China's most iconic landscapes. Here is how to explore them without the crowds.",
    author: 'Discover China Editorial Team',
    tags: ['guilin', 'destinations', 'nature', 'outdoors'],
    category: 'destinations',
    featured: false,
    draft: false,
    pubDatetime: '2025-02-20T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## The Li River

The 83km stretch from Guilin to Yangshuo is one of China's most beautiful river journeys.

**Official cruise** (4–5 hrs) — Large cruise ship, ¥210–¥320. Departs ~9:30am.

**Cycling from Yangshuo** — More immersive. Flat roads, real villages, same scenery.

## Yangshuo

The town at the end of the cruise. Best base for exploring.

- **Cycling** — Hire a bike (¥20–¥30/day) and cycle the Yulong River: sugarcane fields, water buffalo, ancient bridges.
- **Rock climbing** — World-class limestone. ChinaClimb offers guided climbing.
- **Impression Liu Sanjie** — Zhang Yimou's spectacular outdoor night show on the Li River. Tickets ¥218–¥998.

## Longji Rice Terraces

2 hours north of Guilin. 700-year-old cascading paddies cut by Zhuang and Yao peoples.

Best season: June–July (flooded green) or September–October (golden harvest).

Stay overnight to catch sunrise and mist.

## Practical Info

Best time: April–November. Getting there: flights or high-speed rail from Guangzhou (~2.5 hrs).

*Last updated: May 2026*`,
  },
  {
    slug: 'dali-travel-guide',
    filePath: 'src/content/posts/destinations/dali-travel-guide.md',
    title: "Dali Travel Guide: Ancient Town, Erhai Lake & Yunnan's Most Beloved Escape",
    description:
      "Dali is where travellers come to slow down — a 700-year-old walled town beside a mountain lake in Yunnan province, home to the Bai minority and some of China's most relaxed café culture.",
    author: 'Discover China Editorial Team',
    tags: ['dali', 'destinations', 'nature', 'culture', 'solo'],
    category: 'destinations',
    featured: false,
    draft: false,
    pubDatetime: '2025-02-25T08:00:00Z',
    modDatetime: '2026-05-01T10:00:00Z',
    content: `## Dali Old Town

A compact grid of Ming and Qing dynasty streets enclosed by original city walls. Almost entirely pedestrianised.

**Three Pagodas (崇圣寺三塔)** — Tang-dynasty pagodas reflected in a pool before Cangshan mountains. Visit at sunrise (¥75).

**Tie-dye and marble** — Dali is famous for indigo tie-dye and polished Dali marble. Both make excellent gifts.

## Erhai Lake

The 250km² freshwater lake is crystal clear, one of China's cleanest.

**Circumnavigation by e-scooter** — The 120km lake circuit road, fully doable in a day (~¥80 rental). Absolutely recommended.

**Shuanglang Village** — Most atmospheric village on the eastern shore. Bai courtyard guesthouses, beautiful sunrise.

## Cangshan Mountain

4,122m peak west of Dali. Cable car to ~2,600m (¥80 up, ¥60 down). Forest walks along the ridge.

## Practical Info

Getting there: fly to Dali Airport (DLU) or high-speed rail (~30 min by DiDi from old town).

From Kunming: 2.5 hrs by high-speed train. From Lijiang: 1.5 hrs.

Stay 3–4 days minimum. Many travellers stay weeks.

*Last updated: May 2026*`,
  },
]

// ─── dc_destinations data ─────────────────────────────────────────────────────
const destinations = [
  {
    slug: 'beijing',
    name: 'Beijing',
    tagline: 'Imperial grandeur meets modern China',
    imageUrl: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&q=80',
    imageAlt: 'The Great Wall of China near Beijing',
    tag: 'beijing',
    highlights: ['Great Wall', 'Forbidden City', 'Temple of Heaven'],
    sortOrder: 1,
    active: true,
  },
  {
    slug: 'shanghai',
    name: 'Shanghai',
    tagline: 'The city that never sleeps',
    imageUrl: 'https://images.unsplash.com/photo-1537944434965-cf4679d1a598?w=600&q=80',
    imageAlt: 'Shanghai Bund skyline at night',
    tag: 'shanghai',
    highlights: ['The Bund', 'Yu Garden', 'French Concession'],
    sortOrder: 2,
    active: true,
  },
  {
    slug: 'xian',
    name: "Xi'an",
    tagline: 'Cradle of Chinese civilisation',
    imageUrl: 'https://images.unsplash.com/photo-1591451427710-ad34d2cfd9d1?w=600&q=80',
    imageAlt: "Terracotta Warriors in Xi'an",
    tag: 'xian',
    highlights: ['Terracotta Army', 'City Wall', 'Muslim Quarter'],
    sortOrder: 3,
    active: true,
  },
  {
    slug: 'chengdu',
    name: 'Chengdu',
    tagline: 'Pandas, hotpot & laid-back vibes',
    imageUrl: 'https://images.unsplash.com/photo-1569880153113-76e33fc52d5f?w=600&q=80',
    imageAlt: 'Giant panda in Chengdu Research Base',
    tag: 'chengdu',
    highlights: ['Giant Pandas', 'Hotpot', 'Leshan Buddha'],
    sortOrder: 4,
    active: true,
  },
  {
    slug: 'guilin',
    name: 'Guilin',
    tagline: 'Karst mountains & emerald rivers',
    imageUrl: 'https://images.unsplash.com/photo-1513415756790-2ac1db1297d0?w=600&q=80',
    imageAlt: 'Li River karst scenery in Guilin',
    tag: 'guilin',
    highlights: ['Li River Cruise', 'Longji Terraces', 'Reed Flute Cave'],
    sortOrder: 5,
    active: true,
  },
  {
    slug: 'dali',
    name: 'Dali',
    tagline: 'Ancient town by the Erhai Lake',
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
    imageAlt: 'Old Town of Dali with Cangshan mountains',
    tag: 'dali',
    highlights: ['Old Town', 'Erhai Lake', 'Cangshan Mountains'],
    sortOrder: 6,
    active: true,
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function checkTable(tableName) {
  const { error } = await supabase.from(tableName).select('id').limit(1)
  if (error) {
    console.error(`\n❌ Table "${tableName}" not found or not accessible.`)
    console.error(`   Please run the SQL in scripts/dc_create-tables.mjs first.`)
    console.error(`   👉 https://supabase.com/dashboard/project/tixgzezefjjsyuzgdhcd/sql/new`)
    return false
  }
  return true
}

async function upsertBatch(tableName, rows, conflictColumn, label) {
  const BATCH = 10
  let success = 0
  let failed = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from(tableName)
      .upsert(batch, { onConflict: conflictColumn })

    const batchNum = Math.floor(i / BATCH) + 1
    if (error) {
      console.error(`  ❌ ${label} batch ${batchNum}: ${error.message}`)
      failed += batch.length
    }
    else {
      console.log(`  ✅ ${label} batch ${batchNum}: ${batch.length} rows`)
      success += batch.length
    }
  }

  return { success, failed }
}

// ─── Seed dc_posts ────────────────────────────────────────────────────────────
async function seedPosts() {
  console.log(`\n📝 Seeding dc_posts (${posts.length} articles)...`)

  if (!(await checkTable('dc_posts'))) return

  const rows = posts.map(p => ({
    slug: p.slug,
    file_path: p.filePath,
    title: p.title,
    description: p.description,
    author: p.author,
    tags: p.tags,
    category: p.category,
    featured: p.featured,
    draft: p.draft,
    pub_datetime: p.pubDatetime,
    mod_datetime: p.modDatetime ?? null,
    og_image: p.ogImage ?? null,
    content: p.content,
    updated_at: new Date().toISOString(),
  }))

  const { success, failed } = await upsertBatch('dc_posts', rows, 'slug', 'posts')
  console.log(`  → ${success} uploaded, ${failed} failed`)
}

// ─── Seed dc_destinations ─────────────────────────────────────────────────────
async function seedDestinations() {
  console.log(`\n🗺️  Seeding dc_destinations (${destinations.length} destinations)...`)

  if (!(await checkTable('dc_destinations'))) return

  const rows = destinations.map(d => ({
    slug: d.slug,
    name: d.name,
    tagline: d.tagline,
    image_url: d.imageUrl,
    image_alt: d.imageAlt,
    tag: d.tag,
    highlights: d.highlights,
    sort_order: d.sortOrder,
    active: d.active,
    updated_at: new Date().toISOString(),
  }))

  const { success, failed } = await upsertBatch('dc_destinations', rows, 'slug', 'destinations')
  console.log(`  → ${success} uploaded, ${failed} failed`)
}

// ─── Verify ───────────────────────────────────────────────────────────────────
async function verify() {
  console.log('\n📊 Verification:')

  const tables = ['dc_posts', 'dc_destinations', 'dc_subscribers']
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.log(`  ${t}: ❌ ${error.message}`)
    }
    else {
      console.log(`  ${t}: ✅ ${count} rows`)
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Discover China — Supabase seed')
  console.log(`   Project: tixgzezefjjsyuzgdhcd`)
  console.log(`   Tables:  dc_posts, dc_destinations`)

  await seedPosts()
  await seedDestinations()
  await verify()

  console.log('\n🎉 Seed complete!\n')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
