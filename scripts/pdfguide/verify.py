#!/usr/bin/env python3
"""巡检新生成的文章是否守住硬约束。

  python3 scripts/pdfguide/verify.py                 # 检查 SLUGS 里的全部文章
  python3 scripts/pdfguide/verify.py --fix-draft     # 不合格的自动置 draft:true

检查项：价格/来源/时刻表痕迹、图片 markdown、Table of contents 唯一性、
内链白名单、词数区间、frontmatter 必需字段与 FAQ 对数。
"""

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
POSTS = os.path.join(ROOT, "src", "content", "posts", "destinations")

SLUGS = [
    "sanqingshan-jiangxi-guide", "yuntai-mountain-henan-guide", "beidaihe-seaside-guide",
    "northern-xinjiang-road-trip-guide", "qiandao-lake-zhejiang-guide", "taipei-city-guide",
    "weihai-shandong-coast-guide", "hongcun-huizhou-villages-guide",
    "shanhaiguan-great-wall-sea-guide", "changzhou-jiangsu-guide",
    "shuhe-old-town-lijiang-guide", "nyingchi-eastern-tibet-guide",
    "hengdian-world-studios-guide", "haikou-hainan-guide", "yantai-shandong-guide",
    "gannan-tibetan-gansu-guide", "baiyangdian-wetlands-guide",
    "qinhuangdao-hebei-coast-guide", "shaoxing-zhejiang-guide",
    "libo-karst-waterfalls-guizhou-guide", "shunan-bamboo-sea-sichuan-guide",
    "hengshan-hunan-guide", "xixi-wetland-hangzhou-guide", "dujiangyan-sichuan-guide",
    "yesanpo-hebei-guide", "yandangshan-zhejiang-guide", "qingchengshan-sichuan-guide",
]

ALLOWED_LINKS = {
    "/tags/itinerary", "/tags/food", "/tags/culture", "/tags/history", "/tags/nature",
    "/tags/hiking", "/tags/beijing", "/tags/shanghai", "/tags/sichuan", "/tags/yunnan",
    "/tags/tibet", "/tags/north-china", "/tags/east-china", "/tags/southwest-china",
}

CHECKS = [
    ("PRICE", re.compile(r"[¥￥]\s?\d|\b\d+\s?(?:RMB|yuan)\b|\b(?:RMB|yuan)\s?\d")),
    # Only a money claim counts — "buy tickets at the marked window" is fine, so the
    # phrase must carry a figure, a cost verb, or an explicit free/paid assertion.
    ("PRICE_PHRASE", re.compile(
        r"\b(?:admission|entrance|entry|ticket)s?\b[^.\n]{0,40}?"
        r"\b(?:costs?|priced|fee\s+of|for\s+(?:about\s+)?\d|\d+\s?(?:RMB|yuan))"
        r"|\bfree\s+(?:of\s+charge|entry|admission)\b"
        r"|\b(?:cheap|expensive|pricey)\s+(?:ticket|entry|admission)", re.I)),
    ("SOURCE", re.compile(r"\baccording to\b|\bsources?\s+say\b|\bguidebooks?\b|\bas reported\b", re.I)),
    ("HOURS", re.compile(r"\b\d{1,2}[:.]\d{2}\s?(?:am|pm)?\s?[–—-]\s?\d{1,2}[:.]\d{2}\b"
                         r"|\bopens?\s+at\s+\d|\bcloses?\s+at\s+\d", re.I)),
    ("PHONE_URL", re.compile(r"https?://|www\.|\b\d{3,4}-\d{7,8}\b")),
    # 正文里只允许站内图库插入的 /img/... 本地图；外链图（Pexels/Unsplash 等）一律禁止
    ("REMOTE_IMAGE", re.compile(r"!\[[^\]]*\]\(\s*(?!/img/)")),
    # Chinese proper names on first mention are required by the brief; only flag runs
    # that look like leftover Chinese prose (i.e. carrying sentence punctuation).
    ("CHINESE_PROSE", re.compile(r"[一-鿿][，。、；：！？][一-鿿]")),
]


def body_words(body: str) -> int:
    text = re.sub(r"```.*?```", " ", body, flags=re.S)
    text = re.sub(r"[|#>*_`\-]+", " ", text)
    return len(text.split())


def check(slug: str) -> tuple[list[str], dict]:
    path = os.path.join(POSTS, f"{slug}.md")
    if not os.path.isfile(path):
        return ["MISSING_FILE"], {}
    raw = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if not m:
        return ["NO_FRONTMATTER"], {}
    head, body = m.group(1), m.group(2)

    problems = [tag for tag, rx in CHECKS if rx.search(body)]

    if head.count("faq:") and (pairs := len(re.findall(r"^\s+- question:", head, re.M))) < 3:
        problems.append(f"FAQ_{pairs}")
    elif "faq:" not in head:
        problems.append("FAQ_0")

    for field in ("author:", "pubDatetime:", "title:", "draft:", "tags:", "description:"):
        if not re.search(rf"^{field}", head, re.M):
            problems.append(f"NO_{field.rstrip(':').upper()}")

    desc = re.search(r'^description:\s*"(.*)"\s*$', head, re.M)
    if desc and not (120 <= len(desc.group(1)) <= 165):
        problems.append(f"DESC_LEN_{len(desc.group(1))}")

    toc = body.count("## Table of contents")
    if toc != 1:
        problems.append(f"TOC_{toc}")

    links = set(re.findall(r"\]\((/tags/[a-z-]+)\)", body))
    if bad := links - ALLOWED_LINKS:
        problems.append("LINK_" + ",".join(sorted(bad)))
    if not 2 <= len(links) <= 4:
        problems.append(f"LINK_COUNT_{len(links)}")

    words = body_words(body)
    if not 1700 <= words <= 2600:
        problems.append(f"WORDS_{words}")

    return problems, {"words": words, "path": path, "draft": "draft: true" in head}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix-draft", action="store_true", help="把不合格文章置 draft:true")
    args = ap.parse_args()

    ok = bad = 0
    for slug in SLUGS:
        problems, info = check(slug)
        if problems:
            bad += 1
            print(f"✗ {slug:42} {info.get('words', 0):>5}w  {' '.join(problems)}")
            if args.fix_draft and info.get("path") and not info["draft"]:
                raw = open(info["path"], encoding="utf-8").read()
                open(info["path"], "w", encoding="utf-8").write(
                    raw.replace("draft: false", "draft: true", 1)
                )
                print(f"    → 已置 draft: true")
        else:
            ok += 1
            print(f"✓ {slug:42} {info['words']:>5}w")
    print(f"\n合格 {ok} / {len(SLUGS)}，不合格 {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
