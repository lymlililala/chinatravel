# 写作规范（PDF 攻略 → 原创英文文章）

给并行写手的统一契约。每篇产出一个文件：
`src/content/posts/destinations/<slug>.md`

## 素材

`scripts/pdfguide/data/src/<key>.txt` 是该目的地的中文攻略正文（2010–2013 年的旧
资料）。**只当作地理、片区分布、季节、当地菜式、路线逻辑的背景参考**，不要逐句翻译，
不要沿用其中任何数字。

## 硬约束

1. **不出现任何价格/费用**：无 ¥、￥、RMB、yuan、"admission is"、"costs about"、
   免费/收费金额、预算表。要表达价值就写定性的（"worth a half-day"、
   "book ahead in peak season"）。
2. **不提来源**：没有 "according to"、没有出处、没有 guidebook/locals say 之类转述，
   不写资料年份。
3. **不写会过期的硬信息**：营业时间、电话、网址、公交车次号、精确班次时刻。改为定性
   描述（"morning slots fill first"、"regular buses leave from the east bus station"）。
4. **英文母语读者的行文**，不是中译英腔：具体、有画面、克制。禁用
   breathtaking / must-see / hidden gem / nestled / a feast for the eyes / In conclusion。
   句长有变化，多用主动语态。不要每段都以 "The" 开头。
5. 中文地名首次出现给汉字：West Lake (西湖)、Sanqingshan (三清山)。
6. **不要写任何图片 markdown**（`![...]`）——配图由站内图库流水线单独插入。

## 结构（本站 Markdown 方言）

```markdown
（2–4 句场景化开场段，不要小标题）

## Table of contents

（留空，站点自动填充）

## <第一个实质小节>
...
```

- 小节用 `##`，子项用 `###`；列表用 `- `；确有对比价值时才用 `|` 表格。
- 内容覆盖（顺序按地方特点自行安排）：它到底是什么、为什么值得跑一趟；主要看点或
  徒步/游览动线；怎么到、怎么在当地移动；四季分别是什么体验；住在哪一片合适；
  吃什么；以及诚实的实操建议（含**什么可以跳过**）。
- 正文内嵌 2–4 条站内链接，**只能**从这个白名单里挑：
  `/tags/itinerary`、`/tags/food`、`/tags/culture`、`/tags/history`、`/tags/nature`、
  `/tags/hiking`、`/tags/beijing`、`/tags/shanghai`、`/tags/sichuan`、`/tags/yunnan`、
  `/tags/tibet`、`/tags/north-china`、`/tags/east-china`、`/tags/southwest-china`
- 正文长度 **1800–2400 英文词**，要有真东西，不要注水。

## frontmatter 模板

```yaml
---
author: "Roam China Travel Editorial Team"
pubDatetime: <ISO8601，如 2026-08-02T14:30:00Z>
title: "<50–70 字符，含目的地>"
draft: false
tags:
  - "<省份或地区>"
  - "<主题 2–3 个>"
description: "<140–158 字符，一句话，不要省略号>"
faq:
  - question: "..."
    answer: "..."
  - question: "..."
    answer: "..."
  - question: "..."
    answer: "..."
---
```

- `faq` **至少 3 对**，问的是外国旅行者真会问的（怎么去、待多久、什么季节、
  需不需要提前订、体力要求、能不能当天往返）。答案里同样不许出现价格与营业时间。
- tags 用小写英文，优先复用站内已有 tag（province 名、nature、hiking、culture、
  history、food、itinerary、east-china、north-china、southwest-china 等）。

## 自检（交付前逐条过）

- [ ] `grep -nE '[¥￥]|RMB|yuan|according to|guidebook'` 无命中
- [ ] 无 `![`、无营业时间/电话/网址
- [ ] 有且仅有一处 `## Table of contents`，且紧跟在开场段之后
- [ ] frontmatter 字段齐全、YAML 合法（含双引号转义）
- [ ] 词数 1800–2400
- [ ] 内链只用白名单路径
