# 旅游公众号采集 → 英文中国旅游文章流水线

离线内容流水线：从一批**国内旅游公众号**采集中文文章正文，DeepSeek 语义聚类后
**综合提炼 + 翻译为原创英文**中国旅游常青指南，经质量闸门 + AI 自评分后写成本站
Astro Markdown 文章（`src/content/posts/destinations/*.md`）。

> ⚠️ **只在本地/小服务器跑，绝不上 Vercel**（数据中心 IP 会被采集源封、函数时长不够）。
> 站点本身只读 Markdown，无运行时依赖。

## 前置

1. Node 22+（零依赖，原生 fetch）。
2. 凭证（均在 gitignored `.env`，勿提交）：
   - `scripts/wechat/cimidata/.env` — `CIMIDATA_APP_ID` / `CIMIDATA_APP_SECRET`（采集，见 `cimidata/README.md`）
   - `scripts/wechat/.env` — `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`、
     `PEXELS_API_KEY`（配图，必填）、`UNSPLASH_ACCESS_KEY`（配图回退源，可选）

## 给现有文章批量配图（add-images.mjs）

给仓库里**已有正文、但没图**的文章补图（封面 ogImage + 正文若干张），用景点关键词
搜 Pexels/Unsplash，命中校验 + 关键词降级，未命中回退写死池。原文写前自动备份到
`data/img-backup/<slug>.md`，可还原。

```bash
# 指定文章（不带 .md）
node scripts/wechat/add-images.mjs --slugs zhangye-danxia-rainbow-mountains-guide,sanya-beach-guide --inline 3
# 批量：取无图文章前 N 篇
node scripts/wechat/add-images.mjs --all --limit 20 --inline 3
# 只看将插什么，不写文件
node scripts/wechat/add-images.mjs --all --limit 5 --dry-run
```

也可在 GitHub 上跑：**Actions → "Add images to posts"** 手动触发（填篇数），
自动给无图文章配图并开 PR，人工审图后合并。需先在仓库
**Settings → Secrets and variables → Actions** 配置 `PEXELS_API_KEY`（必填）、
`UNSPLASH_ACCESS_KEY`（可选）。见 `.github/workflows/add-images.yml`。


## 流水线（顺序跑）

```bash
# 0) 解析旅游公众号名 → wxid（一次性，含限频重试）。产物 accounts.json
node scripts/wechat/accounts.mjs
#    打开 accounts.json 人工核对，剔除错配/同名/低质号，必要时从 candidates 改 wxid

# (可选) 关键词发现更多候选号，人工筛后补进 accounts.mjs
node scripts/wechat/discover.mjs

# 1) 采集历史文章 + 正文（按 sn 去重，增量）。产物 data/sources.json
node scripts/wechat/1-crawl.mjs --max-pages 1          # 试跑省钱
node scripts/wechat/1-crawl.mjs --max-pages 3 --since 2026-06-01
node scripts/wechat/1-crawl.mjs --no-body              # 只看列表不拉正文

# 2) DeepSeek 语义聚类（3-6 篇/簇）。产物 data/clusters.json —— 跑完人工审一遍
node scripts/wechat/2-cluster.mjs --max-clusters 8

# 3) 逐簇综合 + 翻译为原创英文文章。产物 data/drafts.json —— 抽查质量
node scripts/wechat/3-synthesize.mjs --limit 2         # 先试 2 篇
node scripts/wechat/3-synthesize.mjs                   # 全部

# 4) 质量闸门 + AI 自评分 → 写 .md（过线 draft:false，否则 draft:true）
node scripts/wechat/4-publish.mjs --dry-run            # 先只看判定
node scripts/wechat/4-publish.mjs --threshold 80       # 实际写文件

# 5) 本站校验
npx astro check
npm run dev    # 打开新生成的文章确认渲染、FAQ 结构化数据正常
```

也可一键串跑（小批量试跑）：`bash scripts/wechat/run-all.sh`

每阶段产物落 `data/`（gitignored），可单独重跑、增量、人工审。

## 公众号名单（第 0 步）

`accounts.mjs` 里的 `ACCOUNT_NAMES` 是**人工精选**的国内旅游号（目的地/攻略优先，
文化/地理深度次之）。`searchAccounts` API 只返回 nickname/wxid/biz/description，
**不返回粉丝数/更新频率**——"粉丝多、更新勤、质量高"靠这份种子名单保证。
名单为模型知识整理（搜索受限环境下），**务必跑完 `accounts.json` 后人工核对**，
用 `discover.mjs` 关键词发现补充候选。

## 质量与合规设计

- **多源综合 + 翻译为原创英文**，而非逐篇翻译/洗稿：每篇综合 3-6 篇中文源文重新组织。
- **双闸门**（`lib/quality.mjs` + AI 自评分）：命中套话指纹 / 正文 <6000 字符 /
  FAQ <2 对 / 残留中文过多 → 进草稿（`draft:true`）不发布。
- **草稿机制**：不过线的文写 `draft:true`，Astro 不渲染，便于人工复核后改 false 放行。
- **provenance**：`data/drafts.json` / `published.json` 记录每篇由哪些源文 URL 合成，
  备查与合规追溯；源正文只落本地 `data/`、不入文章、不外传。
- 文章含 `faq:` frontmatter（≥3 对）驱动 FAQPage 结构化数据；正文内链到站内
  `/tags/*` 聚合页强化站内链接。

## 文件

```
scripts/wechat/
├── cimidata/         采集 API 客户端（零依赖，整目录可复制）
├── deepseek.mjs      DeepSeek 客户端（OpenAI 兼容，零依赖，JSON 容错）
├── lib/
│   ├── env.mjs        共享 .env 加载 + DATA_DIR + POSTS_DIR
│   ├── clean-html.mjs 正文 HTML → 纯文本
│   ├── slug.mjs       slug 生成 + 站内查重
│   ├── sources.mjs    源文本地 JSON 持久化（data/sources.json）
│   └── quality.mjs    英文指纹/薄内容/FAQ 闸门
├── accounts.mjs      0) 精选旅游号 → 解析 wxid
├── discover.mjs      0') 关键词发现更多候选号（可选）
├── 1-crawl.mjs       1) 采集
├── 2-cluster.mjs     2) 聚类（旅游主题）
├── 3-synthesize.mjs  3) 中→英原创合成
├── 4-publish.mjs     4) 写 .md 到 src/content/posts/destinations/
├── accounts.json     0) 产物（提交入库，供复核/CI）
└── data/             产物（gitignored）
```

## 配图

文章正文与封面都用 **Pexels 按景点搜图**（热链其 CDN，与现有文章一样不下载本地）。

- 合成阶段（`3-synthesize.mjs`）让模型在正文里插 3-5 个图片占位
  `![描述性 alt](IMG: 关键词)`（关键词写景点名，如 `IMG: Mogao Caves Dunhuang`）。
- 发布阶段（`4-publish.mjs` + `lib/images.mjs`）按关键词调 **Pexels** 搜图：
  - **相关性校验**：Pexels 搜不到时不返回空、而是返回一堆不相关兜底图，所以会检查
    结果 `alt` 是否含查询里的地名实义词，不含则判未命中。
  - **关键词降级**：完整关键词 → 核心两词 → alt 实义词，逐级重试。
  - **命中** → 用真实景点图；**未命中** → 回退写死 Unsplash 图池（`IMG_THEMES`）。
  - 结果缓存到 `data/image-cache.json`，省配额、可复跑。
  - 封面 `ogImage` 复用正文第一张图。
- key 配在 `scripts/wechat/.env` 的 `PEXELS_API_KEY`（免费即时：https://www.pexels.com/api/ ，
  额度 200/时、2.5万/月，免署名、可热链）。没配 key 时自动全走写死图池。
- **为什么不用源文图**：公众号正文图（`mmbiz.qpic.cn`）有防盗链，本站引用会被微信拒
  （403/空白），不可用。
- **为什么不用 Wikimedia**（逐景点真实图最全）：本地网络封了 wikimedia.org，只有 Vercel
  构建时可达——可作为后期增强（仿 `scripts/download-destination-images.mjs`）。
