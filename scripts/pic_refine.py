#!/usr/bin/env python3
"""按"同省算对题"的口径精修配图。

规则（编辑决定，见对话）：
  * toolkit/ 实用指南（签证、支付、天气…）一律无图 —— 风景照与主题无关。
  * destinations/ 允许同省照片：alt 会诚实写出照片拍的是哪里，读者不会被误导。
    只有跨省 / 完全不相干（全国兜底池抓来的地标）才处理：先尝试换成本省相册，
    没有本省相册就去图。

关键设计：**优先保留已有图片**。已提交的 3300 张 webp 若全部重新分配，git
历史会再胖 250MB，所以只要现有配图的省份与文章一致就原地不动，仅重编码那些
必须换的。

  python3 scripts/pic_refine.py             # 只报告
  python3 scripts/pic_refine.py --write
"""

import argparse
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "scripts", "pic-index.json")
PUBLIC_IMG = os.path.join(ROOT, "public", "img")
POSTS = os.path.join(ROOT, "src", "content", "posts")

REGIONS = {
    "northwest": {"gansu", "qinghai", "xinjiang", "ningxia", "shaanxi"},
    "southwest": {"sichuan", "yunnan", "guizhou", "tibet", "chongqing", "guangxi"},
    "north-china": {"beijing", "hebei", "shanxi", "tianjin", "inner-mongolia"},
    "east-china": {"jiangsu", "zhejiang", "shanghai", "anhui", "shandong", "fujian", "jiangxi"},
    "south-china": {"guangdong", "guangxi", "hainan", "hong-kong", "macau"},
    "northeast": {"liaoning", "jilin", "heilongjiang"},
    "central-china": {"henan", "hubei", "hunan", "jiangxi"},
}


def load_albums() -> list[dict]:
    return json.load(open(INDEX, encoding="utf-8"))["albums"]


def post_places(slug: str, tags: set[str], albums: list[dict]) -> tuple[set[str], set[str]]:
    """返回 (直接命名的省/市, 区域展开出的省份)。

    直接命名的优先级要高得多：赤峰（内蒙古）的文章标了 north-china，区域展开会
    把北京也算进来，若不区分就会拿故宫的照片。
    """
    words = {t for t in re.split(r"[^a-z0-9]+", slug.lower()) if t}
    direct: set[str] = set()
    for album in albums:
        for tok in album["provinceTokens"]:
            if tok in words or tok in slug.lower() or tok in tags:
                direct.add(tok)
    region: set[str] = set()
    for tag in tags | words:
        region |= REGIONS.get(tag, set())
    return direct, region - direct


def album_places(album: dict) -> set[str]:
    return set(album["provinceTokens"])


def alt_matches_place(alts: list[str], places: set[str], albums_by_en: dict) -> bool:
    """现有配图是否落在文章所属省份内 —— 用 alt 文本反查它来自哪个相册。"""
    for alt in alts:
        album = albums_by_en.get(alt.strip())
        if album and album_places(album) & places:
            return True
        # alt 尾部通常带 ", <Province>"，相册名变动时作为兜底
        tail = {t for t in re.split(r"[^a-z0-9]+", alt.lower()) if t}
        if tail & places:
            return True
    return False


def score(album: dict, slug: str, direct: set[str], region: set[str]) -> int:
    places = direct | region
    if not album_places(album) & places:
        return 0
    # 文章直接点名的省份 > 区域展开出来的省份
    s = 70 if album_places(album) & direct else 20
    syls = album["pinyinWords"]
    joins = {
        "".join(syls[i:j])
        for i in range(len(syls))
        for j in range(i + 1, min(i + 5, len(syls)) + 1)
    }
    subject = {t for t in re.split(r"[^a-z0-9]+", slug.lower()) if len(t) >= 5} - places
    if any(t in joins for t in subject):
        s += 60
    s += min(8, album["count"] // 8)
    return s


def read_md(path: str) -> tuple[str, str]:
    raw = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    return (m.group(1), m.group(2)) if m else ("", raw)


def write_md(path: str, head: str, body: str) -> None:
    body = re.sub(r"\n{3,}", "\n\n", body).strip() + "\n"
    open(path, "w", encoding="utf-8").write(f"---\n{head.rstrip()}\n---\n\n{body}")


def strip_post(path: str, post_id: str) -> None:
    head, body = read_md(path)
    head = re.sub(r"^ogImage:.*\n?", "", head, flags=re.M)
    body = re.sub(r"^!\[[^\]]*\]\(\s*/img/[^)]*\)\s*$\n?", "", body, flags=re.M)
    write_md(path, head, body)
    d = os.path.join(PUBLIC_IMG, post_id)
    if os.path.isdir(d):
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))
        os.rmdir(d)


def replace_post(path: str, post_id: str, picks: list[dict], cw: int, bw: int, q: int) -> None:
    base = f"/img/{post_id}"
    out = os.path.join(PUBLIC_IMG, post_id)
    os.makedirs(out, exist_ok=True)
    for old in os.listdir(out):
        os.remove(os.path.join(out, old))
    for i, img in enumerate(picks):
        dst = os.path.join(out, "cover.webp" if i == 0 else f"{i}.webp")
        subprocess.run(
            ["cwebp", "-quiet", "-q", str(q), "-m", "6", "-metadata", "none",
             "-resize", str(cw if i == 0 else bw), "0",
             os.path.join(ROOT, img["src"]), "-o", dst],
            check=False, capture_output=True,
        )
    head, body = read_md(path)
    line = f'ogImage: "{base}/cover.webp"'
    head = (re.sub(r"^ogImage:.*$", line, head, count=1, flags=re.M)
            if re.search(r"^ogImage:", head, re.M)
            else re.sub(r"^(description:.*)$", r"\1\n" + line, head, count=1, flags=re.M))
    body = re.sub(r"^!\[[^\]]*\]\(\s*/img/[^)]*\)\s*$\n?", "", body, flags=re.M)
    lines = re.sub(r"\n{3,}", "\n\n", body).splitlines()
    heads = [i for i, l in enumerate(lines)
             if l.startswith("## ") and not re.search(r"table of contents|faq|frequently", l, re.I)]
    inline = picks[1:]
    if heads and inline:
        step = len(heads) / (len(inline) + 1)
        targets = sorted({heads[min(len(heads) - 1, max(0, int(round(step * n)) - 1))]
                          for n in range(1, len(inline) + 1)})
        for off, (idx, img) in enumerate(zip(targets, inline)):
            block = ["", f"![{img['alt'].strip(' —–-,·')}]({base}/{off + 1}.webp)"]
            at = idx + 1 + off * len(block)
            lines[at:at] = block
    write_md(path, head, "\n".join(lines))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--cover-width", type=int, default=1200)
    ap.add_argument("--body-width", type=int, default=1000)
    ap.add_argument("--quality", type=int, default=65)
    args = ap.parse_args()

    albums = load_albums()
    by_en = {a["en"]: a for a in albums}
    used: set[str] = set()
    kept = replaced = stripped_toolkit = stripped_nomatch = 0
    samples = {"replaced": [], "stripped": []}

    for sub in ("destinations", "toolkit"):
        d = os.path.join(POSTS, sub)
        for f in sorted(os.listdir(d)):
            if not f.endswith(".md"):
                continue
            path = os.path.join(d, f)
            post_id = f"{sub}/{f[:-3]}"
            head, body = read_md(path)
            has_img = "/img/" in head or "/img/" in body
            alts = re.findall(r"^!\[([^\]]*)\]\(\s*/img/", body, re.M)

            if sub == "toolkit":
                if has_img:
                    stripped_toolkit += 1
                    if args.write:
                        strip_post(path, post_id)
                continue

            tags = set(re.findall(r'^\s+-\s+"?([a-z0-9-]+)"?', head, re.M))
            direct, region = post_places(f[:-3], tags, albums)
            places = direct | region

            if has_img and direct and alt_matches_place(alts, direct, by_en):
                kept += 1
                continue

            ranked = sorted(((score(a, f[:-3], direct, region), i) for i, a in enumerate(albums)),
                            key=lambda x: (-x[0], x[1]))
            want = 4
            picks: list[dict] = []
            for allow_repeat in (False, True):
                for sc, ai in ranked:
                    if sc <= 0:
                        break
                    album = albums[ai]
                    if not allow_repeat and any(p["album"] == album["zh"] for p in picks):
                        continue
                    pool = album["files"][: album.get("landscapeCount") or len(album["files"])]
                    for fn in pool:
                        key = f"{album['dir']}/{fn}"
                        if key in used:
                            continue
                        used.add(key)
                        picks.append({"src": key, "album": album["zh"], "alt": album["en"]})
                        if not allow_repeat or len(picks) >= want:
                            break
                    if len(picks) >= want:
                        break
                if len(picks) >= want:
                    break

            if len(picks) >= 2:
                replaced += 1
                if len(samples["replaced"]) < 10:
                    samples["replaced"].append((post_id, picks[0]["album"]))
                if args.write:
                    replace_post(path, post_id, picks, args.cover_width, args.body_width, args.quality)
            elif has_img:
                stripped_nomatch += 1
                if len(samples["stripped"]) < 10:
                    samples["stripped"].append((post_id, alts[0] if alts else ""))
                if args.write:
                    strip_post(path, post_id)

    print(f"destinations 同省配图保留: {kept}")
    print(f"destinations 换成本省的图: {replaced}")
    print(f"destinations 无本省相册 → 去图: {stripped_nomatch}")
    print(f"toolkit 实用篇去图: {stripped_toolkit}")
    print("\n换图示例:")
    for a, b in samples["replaced"]:
        print(f"   {a.split('/')[-1][:46]:46} → {b}")
    print("\n去图示例:")
    for a, b in samples["stripped"]:
        print(f"   {a.split('/')[-1][:46]:46} (原: {b[:34]})")
    if not args.write:
        print("\n（--write 才会实际修改）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
