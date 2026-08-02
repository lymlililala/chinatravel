#!/usr/bin/env python3
"""Match posts to pic/ albums and emit scripts/pic-plan.json.

For every post we pick one cover plus N body photos, preferring albums whose
attraction name matches the post slug/title and falling back to the province
pool. Images are never reused across posts while unused ones remain, so a
single album can serve several posts without repeating the same frame.

Nothing is written except scripts/pic-plan.json — run pic_build.py next.
"""

import argparse
import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS = os.path.join(ROOT, "src", "content", "posts")
INDEX = os.path.join(ROOT, "scripts", "pic-index.json")
OUT = os.path.join(ROOT, "scripts", "pic-plan.json")

STOP = {
    "the", "and", "for", "with", "your", "you", "from", "what", "how", "why", "when",
    "where", "guide", "guides", "complete", "full", "best", "top", "china", "chinas",
    "chinese", "travel", "traveller", "travellers", "tips", "itinerary", "day", "days",
    "visit", "visiting", "2026", "2025", "everything", "need", "know", "about", "into",
    "out", "off", "all", "one", "two", "three", "more", "most", "guidebook", "food",
    "tour", "tours", "trip", "trips", "guided",
}

# Iconic national fallbacks for practical toolkit posts with no location of their own.
NATIONAL_HINTS = [
    "长城", "外滩", "西湖", "兵马俑", "故宫", "布达拉宫", "漓江", "黄山",
    "洱海", "丽江", "九寨沟", "张家界", "苏州", "阳朔",
]


def slug_tokens(text: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if t and t not in STOP]


def read_frontmatter(path: str) -> tuple[dict, str]:
    raw = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", raw, re.S)
    if not m:
        return {}, raw
    head, body = m.group(1), m.group(2)
    data: dict[str, str] = {}
    for line in head.splitlines():
        km = re.match(r"^([A-Za-z_]+):\s*(.*)$", line)
        if km:
            data[km.group(1)] = km.group(2).strip().strip('"')
    data["_tags"] = " ".join(re.findall(r"^\s*-\s*\"?([^\"\n]+)\"?", head, re.M))
    return data, body


def load_posts() -> list[dict]:
    posts = []
    for dirpath, _dirs, files in os.walk(POSTS):
        for f in sorted(files):
            if not f.endswith(".md"):
                continue
            path = os.path.join(dirpath, f)
            pid = os.path.relpath(path, POSTS)[:-3]
            fm, body = read_frontmatter(path)
            if fm.get("draft", "false").lower() == "true":
                continue
            posts.append(
                {
                    "id": pid,
                    "path": os.path.relpath(path, ROOT),
                    "title": fm.get("title", ""),
                    "tags": fm.get("_tags", ""),
                    "tokens": slug_tokens(pid.split("/")[-1]),
                    "titleTokens": slug_tokens(fm.get("title", "") + " " + fm.get("_tags", "")),
                    "tagTokens": slug_tokens(fm.get("_tags", "")),
                    "h2": re.findall(r"^##\s+(.+)$", body, re.M),
                    "hasImages": bool(re.search(r"^!\[", body, re.M)),
                }
            )
    return sorted(posts, key=lambda p: p["id"])


def album_score(album: dict, post: dict) -> int:
    """Higher is better. 0 means the album is not usable for this post.

    Province agreement is mandatory: without it a Dali (Yunnan) post could pull
    Dalian (Liaoning) photos, or a Quanzhou (Fujian) post could pull 全州
    (Guangxi) — same pinyin, wrong place. Posts with no province of their own
    fall back to the national pool in main().
    """
    tokens = set(post["tokens"])
    title_tokens = set(post["titleTokens"])
    prov_tokens = set(album["provinceTokens"])

    if not prov_tokens & (tokens | title_tokens):
        return 0
    # A province named in the slug is the post's actual subject. A province that
    # only appears in the tags is still a deliberate editorial signal (posts like
    # baiyangdian-wetlands-guide carry `tags: [hebei]` without repeating it in the
    # slug), so it counts nearly as much. A province appearing only in the prose
    # title is usually a passing mention ("day trip from Beijing") — weakest.
    tag_tokens = set(post["tagTokens"])
    if prov_tokens & tokens:
        score = 40
    elif prov_tokens & tag_tokens:
        score = 34
    else:
        score = 12

    # Attraction-level match, syllable aligned: "lijiang" == li+jiang matches
    # 丽江, but "dali" does not match 大连 (da+lian).
    syls = album["pinyinWords"]
    joins = {
        "".join(syls[i:j])
        for i in range(len(syls))
        for j in range(i + 1, min(i + 5, len(syls)) + 1)
    }
    if any(len(t) >= 4 and t in joins for t in tokens if t not in prov_tokens):
        score += 60

    # Semantic overlap on the English label (west-lake, great-wall, terracotta…)
    en_words = {w for w in slug_tokens(album["en"]) if w not in prov_tokens}
    score += 18 * len(en_words & (tokens | title_tokens))

    # Mild prominence bonus: the photographers shot far more frames of 故宫 or
    # 长城 than of a minor park, so album size is a decent fame proxy.
    score += min(8, album["count"] // 8)
    return score


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--body", type=int, default=3, help="body photos per destination post")
    ap.add_argument(
        "--body-toolkit",
        type=int,
        default=2,
        help="body photos for practical toolkit posts (scenery adds less there)",
    )
    ap.add_argument("--only", default="", help="limit to posts whose id starts with this")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    index = json.load(open(INDEX, encoding="utf-8"))
    albums = index["albums"]
    posts = load_posts()
    if args.only:
        posts = [p for p in posts if p["id"].startswith(args.only)]
    if args.limit:
        posts = posts[: args.limit]

    # Deterministic ordering: posts with an explicit attraction match get first pick.
    used: set[str] = set()
    plan = []
    stats = {"attraction": 0, "province": 0, "national": 0}

    scored = []
    for post in posts:
        ranked = sorted(
            ((album_score(a, post), i) for i, a in enumerate(albums)),
            key=lambda x: (-x[0], x[1]),
        )
        best = ranked[0][0]
        scored.append((best, post, [i for s, i in ranked if s > 0][:12]))
    scored.sort(key=lambda x: (-x[0], x[1]["id"]))

    for best, post, candidates in scored:
        if best >= 60:
            stats["attraction"] += 1
        elif best >= 34:
            stats["province"] += 1
        else:
            stats["national"] += 1
            iconic = [
                i
                for i, a in enumerate(albums)
                if any(h in a["zh"] for h in NATIONAL_HINTS)
            ]
            # Rotate the pool per post so 300+ location-less guides don't all open
            # with the same landmark, and fall through to the whole library so the
            # iconic albums can never run dry.
            seed = int(hashlib.sha1(post["id"].encode()).hexdigest(), 16)
            rest = [i for i in range(len(albums)) if i not in set(iconic)]
            iconic = iconic[seed % max(1, len(iconic)) :] + iconic
            rest = rest[seed % max(1, len(rest)) :] + rest
            candidates = (iconic + rest)[:60]

        want = 1 + (args.body if post["id"].startswith("destinations/") else args.body_toolkit)
        picks = []
        # One frame per album first (distinct alt text + visual variety), then a
        # second pass allows repeats from the same album if candidates run short.
        for allow_repeat in (False, True):
            for ai in candidates:
                album = albums[ai]
                if not allow_repeat and any(pk["album"] == album["zh"] for pk in picks):
                    continue
                pool = album["files"][: album.get("landscapeCount") or len(album["files"])]
                for fname in pool:
                    key = f"{album['dir']}/{fname}"
                    if key in used:
                        continue
                    used.add(key)
                    picks.append(
                        {
                            "src": key,
                            "album": album["zh"],
                            "alt": album["en"],
                            "province": album["province"],
                        }
                    )
                    break
                if len(picks) >= want:
                    break
            if len(picks) >= want:
                break

        if not picks:
            continue
        plan.append(
            {
                "id": post["id"],
                "path": post["path"],
                "title": post["title"],
                "matchScore": best,
                "hasImages": post["hasImages"],
                "h2": post["h2"],
                "cover": picks[0],
                "body": picks[1:],
            }
        )

    plan.sort(key=lambda p: p["id"])
    json.dump(
        {"posts": plan, "stats": stats, "imageTotal": sum(1 + len(p["body"]) for p in plan)},
        open(OUT, "w", encoding="utf-8"),
        ensure_ascii=False,
        indent=1,
    )
    print(f"posts planned: {len(plan)}  images: {sum(1 + len(p['body']) for p in plan)}")
    print(f"match quality: {stats}")
    for p in plan[:8]:
        print(f"  [{p['matchScore']:3}] {p['id']:58} <- {p['cover']['album']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
