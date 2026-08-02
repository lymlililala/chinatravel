#!/usr/bin/env python3
"""Write the planned photos into the post markdown.

For every post in scripts/pic-plan.json:
  * frontmatter `ogImage` -> /img/<post id>/cover.webp
  * remote hot-linked body images (Pexels/Unsplash) are removed
  * local body photos are inserted under evenly spaced H2 sections

Dry run by default; pass --write to modify files. Re-running is safe: posts that
already reference /img/<id>/ are skipped unless --force is given.
"""

import argparse
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = os.path.join(ROOT, "scripts", "pic-plan.json")

REMOTE_IMG = re.compile(r"^!\[[^\]]*\]\(\s*https?://[^)]*\)\s*$", re.M)
# Previously inserted local photos, so re-running with --force replaces them
# instead of stacking a second copy under every heading.
LOCAL_IMG = re.compile(r"^!\[[^\]]*\]\(\s*/img/[^)]*\)\s*$", re.M)
SKIP_H2 = re.compile(
    r"table of contents|frequently asked|faq|further reading|related guides",
    re.I,
)


def pick_sections(body: str, count: int) -> list[int]:
    """Line indexes of the H2 headings that should be followed by a photo."""
    lines = body.splitlines()
    heads = [
        i
        for i, line in enumerate(lines)
        if line.startswith("## ") and not SKIP_H2.search(line)
    ]
    if not heads or count <= 0:
        return []
    if len(heads) <= count:
        return heads[:count]
    # Spread the photos across the article instead of stacking them at the top.
    step = len(heads) / (count + 1)
    chosen = []
    for n in range(1, count + 1):
        idx = heads[min(len(heads) - 1, int(round(step * n)) - 1 if n > 1 else 0)]
        if idx not in chosen:
            chosen.append(idx)
    for h in heads:  # top up if rounding collided
        if len(chosen) >= count:
            break
        if h not in chosen:
            chosen.append(h)
    return sorted(chosen)[:count]


def set_ogimage(head: str, path: str) -> str:
    line = f'ogImage: "{path}"'
    if re.search(r"^ogImage:", head, re.M):
        return re.sub(r"^ogImage:.*$", line, head, count=1, flags=re.M)
    # Sit next to description so the frontmatter keeps a predictable shape.
    if re.search(r"^description:", head, re.M):
        return re.sub(r"^(description:.*)$", r"\1\n" + line, head, count=1, flags=re.M)
    return head.rstrip() + "\n" + line


def tidy_alt(alt: str) -> str:
    """Keep alt text short and readable.

    Album labels occasionally romanise into long chains ("Qinghua University
    Yuan Qing Dynasty Imperial Classical Garden Yizhi"); keep the leading nouns
    and preserve the ", Province" tail that tells readers where the photo is.
    """
    alt = alt.replace("[", "").replace("]", "")
    head, _, tail = alt.partition(",")
    words = head.split()
    if len(words) > 6:
        head = " ".join(words[:6])
    return f"{head.strip()}, {tail.strip()}" if tail.strip() else head.strip()


def apply_post(post: dict, force: bool) -> tuple[bool, str]:
    path = os.path.join(ROOT, post["path"])
    raw = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if not m:
        return False, "no frontmatter"
    head, body = m.group(1), m.group(2)

    base = f"/img/{post['id']}"
    if base in raw and not force:
        return False, "already has local images"

    head = set_ogimage(head, f"{base}/cover.webp")

    removed = len(REMOTE_IMG.findall(body))
    body = REMOTE_IMG.sub("", body)
    body = LOCAL_IMG.sub("", body)
    body = re.sub(r"\n{3,}", "\n\n", body)

    picks = post["body"]
    targets = pick_sections(body, len(picks))
    lines = body.splitlines()
    for offset, (line_idx, img) in enumerate(zip(targets, picks)):
        alt = tidy_alt(img["alt"])
        block = ["", f"![{alt}]({base}/{offset + 1}.webp)"]
        at = line_idx + 1 + offset * len(block)
        lines[at:at] = block
    body = "\n".join(lines)
    body = re.sub(r"\n{3,}", "\n\n", body).rstrip() + "\n"

    out = f"---\n{head}\n---\n{body}"
    if out == raw:
        return False, "unchanged"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(out)
    return True, f"cover + {len(targets)} body (removed {removed} remote)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="actually modify the markdown")
    ap.add_argument("--force", action="store_true", help="rewrite posts already done")
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    plan = json.load(open(PLAN, encoding="utf-8"))
    posts = [p for p in plan["posts"] if p["id"].startswith(args.only)]
    if args.limit:
        posts = posts[: args.limit]

    if not args.write:
        print(f"DRY RUN — {len(posts)} posts would be updated. Sample:")
        for p in posts[:5]:
            print(f"  {p['id']}")
            print(f"    ogImage: /img/{p['id']}/cover.webp")
            for i, img in enumerate(p["body"], start=1):
                print(f"    body {i}: /img/{p['id']}/{i}.webp  alt={img['alt']}")
        return 0

    changed = skipped = 0
    reasons: dict[str, int] = {}
    for p in posts:
        ok, why = apply_post(p, args.force)
        if ok:
            changed += 1
        else:
            skipped += 1
            reasons[why] = reasons.get(why, 0) + 1
    print(f"updated {changed} posts, skipped {skipped} {reasons if reasons else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
