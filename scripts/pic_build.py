#!/usr/bin/env python3
"""Encode the planned photos into public/img/<post>/ as webp.

Reads scripts/pic-plan.json (see pic_assign.py) and writes:
  public/img/<post id>/cover.webp   — wider, used as ogImage
  public/img/<post id>/1..N.webp    — body photos

Existing outputs are skipped so re-runs are cheap. cwebp does the resize and
encode in one pass; concurrency defaults to the CPU count.
"""

import argparse
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = os.path.join(ROOT, "scripts", "pic-plan.json")
OUTDIR = os.path.join(ROOT, "public", "img")


def encode(src: str, dst: str, width: int, quality: int, force: bool) -> tuple[str, int]:
    if os.path.exists(dst) and not force:
        return dst, os.path.getsize(dst)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cmd = [
        "cwebp", "-quiet", "-q", str(quality), "-m", "6", "-metadata", "none",
        "-resize", str(width), "0", os.path.join(ROOT, src), "-o", dst,
    ]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0 or not os.path.exists(dst):
        # A handful of sources are odd BMPs that cwebp refuses; Pillow reads them.
        try:
            from PIL import Image

            with Image.open(os.path.join(ROOT, src)) as im:
                im = im.convert("RGB")
                if im.width > width:
                    im = im.resize(
                        (width, round(im.height * width / im.width)), Image.LANCZOS
                    )
                im.save(dst, "WEBP", quality=quality, method=6)
        except Exception:
            return dst, -1
    return dst, os.path.getsize(dst)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cover-width", type=int, default=1600)
    ap.add_argument("--body-width", type=int, default=1200)
    ap.add_argument("--quality", type=int, default=72)
    ap.add_argument("--only", default="", help="limit to posts whose id starts with this")
    ap.add_argument("--limit-images", type=int, default=0, help="stop after N images (sizing probe)")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    plan = json.load(open(PLAN, encoding="utf-8"))
    jobs: list[tuple[str, str, int]] = []
    for post in plan["posts"]:
        if args.only and not post["id"].startswith(args.only):
            continue
        base = os.path.join(OUTDIR, post["id"])
        jobs.append((post["cover"]["src"], os.path.join(base, "cover.webp"), args.cover_width))
        for i, img in enumerate(post["body"], start=1):
            jobs.append((img["src"], os.path.join(base, f"{i}.webp"), args.body_width))
    if args.limit_images:
        jobs = jobs[: args.limit_images]

    total = 0
    failed = []
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = [
            pool.submit(encode, src, dst, width, args.quality, args.force)
            for src, dst, width in jobs
        ]
        for n, fut in enumerate(futures, start=1):
            dst, size = fut.result()
            if size < 0:
                failed.append(dst)
            else:
                total += size
            if n % 250 == 0:
                print(f"  {n}/{len(jobs)}  {total / 1e6:.1f} MB so far")

    ok = len(jobs) - len(failed)
    print(f"encoded {ok}/{len(jobs)} images, {total / 1e6:.1f} MB total")
    if ok:
        print(f"average {total / ok / 1024:.0f} KB per image")
    for f in failed[:10]:
        print(f"  FAILED {f}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
