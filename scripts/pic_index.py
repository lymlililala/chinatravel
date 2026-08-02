#!/usr/bin/env python3
"""Index the local pic/ photo library into scripts/pic-index.json.

pic/ layout: pic/<N. 省份>/<相册中文名(NN张)>/<image files>

For every album we record the province, the Chinese name, a pinyin form (used to
match against the English/pinyin post slugs) and a human-readable English label
(used for alt text). Nothing is written outside scripts/pic-index.json.
"""

import json
import os
import re
import sys

from PIL import Image
from pypinyin import lazy_pinyin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIC = os.path.join(ROOT, "pic")
OUT = os.path.join(ROOT, "scripts", "pic-index.json")

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".JPG", ".JPEG"}

# Province directory ("1. 北京") -> slug tokens used in post ids/titles.
PROVINCE_TOKENS = {
    "北京": ["beijing"],
    "上海": ["shanghai"],
    "天津": ["tianjin"],
    "重庆": ["chongqing"],
    "河北省": ["hebei", "chengde", "shijiazhuang", "baoding", "qinhuangdao"],
    "山西省": ["shanxi", "pingyao", "datong", "taiyuan", "wutai"],
    "辽宁省": ["liaoning", "shenyang", "dalian"],
    "吉林省": ["jilin", "changbai", "changchun"],
    "黑龙江省": ["heilongjiang", "harbin"],
    "江苏省": ["jiangsu", "nanjing", "suzhou", "yangzhou", "wuxi", "zhouzhuang"],
    "浙江省": ["zhejiang", "hangzhou", "ningbo", "wenzhou", "shaoxing", "wuzhen"],
    "安徽省": ["anhui", "huangshan", "hongcun", "xidi", "huizhou"],
    "福建省": ["fujian", "xiamen", "gulangyu", "fuzhou", "wuyishan", "quanzhou"],
    "江西省": ["jiangxi", "jingdezhen", "wuyuan", "lushan", "nanchang"],
    "山东省": ["shandong", "qingdao", "jinan", "taishan", "zibo", "qufu", "qingzhou"],
    "河南省": ["henan", "luoyang", "zhengzhou", "kaifeng", "dengfeng", "shaolin"],
    "湖北省": ["hubei", "wuhan", "yichang", "enshi", "wudang"],
    "湖南省": ["hunan", "changsha", "zhangjiajie", "fenghuang"],
    "广东省": ["guangdong", "guangzhou", "shenzhen", "chaoshan", "shantou", "zhuhai", "foshan"],
    "海南省": ["hainan", "sanya", "haikou"],
    "四川省": ["sichuan", "chengdu", "jiuzhaigou", "leshan", "emei", "daocheng"],
    "贵州省": ["guizhou", "guiyang", "anshun", "kaili", "zunyi", "huangguoshu"],
    "云南省": ["yunnan", "kunming", "dali", "lijiang", "shangri", "xishuangbanna", "yuanyang"],
    "陕西省": ["shaanxi", "xian", "xi-an", "hanzhong", "yanan", "baoji", "huashan"],
    "甘肃省": ["gansu", "lanzhou", "dunhuang", "zhangye", "jiayuguan"],
    "青海省": ["qinghai", "xining", "chaka", "qaidam"],
    "内蒙古自治区": ["inner-mongolia", "hohhot", "ordos", "hulunbuir"],
    "西藏自治区": ["tibet", "lhasa", "shigatse", "nyingchi", "everest"],
    "广西壮族自治区": ["guangxi", "guilin", "yangshuo", "nanning", "beihai", "detian"],
    "宁夏回族自治区": ["ningxia", "yinchuan", "zhongwei", "shapotou"],
    "新疆维吾尔自治区": ["xinjiang", "urumqi", "kashgar", "kanas", "turpan", "yili"],
    "香港": ["hong-kong", "hongkong"],
    "澳门": ["macau", "macao"],
    "台湾": ["taiwan", "taipei", "kaohsiung", "hualien"],
}

# Chinese scenic vocabulary -> English, longest match first. Used to build alt text
# and to give semantic matches for slugs that use English rather than pinyin.
TERMS = [
    ("兵马俑", "Terracotta Army"), ("紫禁城", "Forbidden City"), ("故宫", "Forbidden City"),
    ("长城", "Great Wall"), ("天安门", "Tiananmen"), ("颐和园", "Summer Palace"),
    ("圆明园", "Old Summer Palace"), ("天坛", "Temple of Heaven"), ("胡同", "Hutong"),
    ("四合院", "Courtyard House"), ("兵马", "Terracotta"),
    ("布达拉宫", "Potala Palace"), ("珠穆朗玛", "Mount Everest"), ("纳木错", "Namtso Lake"),
    ("西湖", "West Lake"), ("外滩", "The Bund"), ("陆家嘴", "Lujiazui"),
    ("洱海", "Erhai Lake"), ("泸沽湖", "Lugu Lake"), ("玉龙雪山", "Jade Dragon Snow Mountain"),
    ("梯田", "Rice Terraces"), ("土林", "Earth Forest"), ("红土地", "Red Soil"),
    ("喀纳斯", "Kanas Lake"), ("天池", "Heavenly Lake"), ("胡杨", "Populus Forest"),
    ("莫高窟", "Mogao Caves"), ("鸣沙山", "Singing Sand Dunes"), ("月牙泉", "Crescent Lake"),
    ("丹霞", "Danxia Landform"), ("雅丹", "Yardang"), ("戈壁", "Gobi"),
    ("黄果树", "Huangguoshu Waterfall"), ("梵净山", "Mount Fanjing"), ("千户苗寨", "Miao Village"),
    ("苗寨", "Miao Village"), ("侗寨", "Dong Village"), ("土楼", "Earthen Tulou"),
    ("古镇", "Old Town"), ("古城", "Ancient Town"), ("古村", "Ancient Village"),
    ("水乡", "Water Town"), ("园林", "Classical Garden"), ("石窟", "Grottoes"),
    ("佛像", "Buddha Statue"), ("大佛", "Giant Buddha"), ("寺院", "Monastery"),
    ("喇嘛庙", "Lamasery"), ("清真寺", "Mosque"), ("道观", "Taoist Temple"),
    ("博物馆", "Museum"), ("藏品", "Collection"), ("大剧院", "Grand Theatre"),
    ("国子监", "Imperial College"), ("书院", "Academy"), ("城墙", "City Wall"),
    ("牌坊", "Memorial Arch"), ("古塔", "Ancient Pagoda"), ("宝塔", "Pagoda"),
    ("石桥", "Stone Bridge"), ("廊桥", "Covered Bridge"), ("索桥", "Rope Bridge"),
    ("草原", "Grassland"), ("湿地", "Wetland"), ("沙漠", "Desert"), ("绿洲", "Oasis"),
    ("雪山", "Snow Mountain"), ("冰川", "Glacier"), ("温泉", "Hot Spring"),
    ("瀑布", "Waterfall"), ("峡谷", "Gorge"), ("溶洞", "Karst Cave"), ("石林", "Stone Forest"),
    ("湖泊", "Lake"), ("水库", "Reservoir"), ("海滩", "Beach"), ("海岸", "Coast"),
    ("海湾", "Bay"), ("海岛", "Island"), ("渔村", "Fishing Village"),
    ("茶园", "Tea Plantation"), ("油菜花", "Rapeseed Blossom"), ("桃花", "Peach Blossom"),
    ("樱花", "Cherry Blossom"), ("荷花", "Lotus"), ("杏花", "Apricot Blossom"),
    ("红叶", "Autumn Leaves"), ("银杏", "Ginkgo"), ("雾凇", "Rime Ice"),
    ("雪景", "Snow Scenery"), ("冰雕", "Ice Sculpture"), ("日出", "Sunrise"),
    ("日落", "Sunset"), ("夕阳", "Sunset"), ("晚霞", "Evening Glow"),
    ("夜景", "Night View"), ("云海", "Sea of Clouds"), ("梯级", "Terraces"),
    ("俯瞰", "Aerial View"), ("全景", "Panorama"), ("风光", "Landscape"),
    ("风景", "Scenery"), ("景区", "Scenic Area"), ("公园", "Park"),
    ("步行街", "Pedestrian Street"), ("夜市", "Night Market"), ("美食", "Local Food"),
    ("小吃", "Street Food"), ("地铁", "Metro"), ("高铁", "High-Speed Rail"),
    ("机场", "Airport"), ("码头", "Ferry Pier"), ("民宿", "Guesthouse"),
    ("皇家", "Imperial"), ("古代", "Ancient"), ("元代", "Yuan Dynasty"),
    ("明代", "Ming Dynasty"), ("清代", "Qing Dynasty"), ("唐代", "Tang Dynasty"),
    ("宋代", "Song Dynasty"), ("汉代", "Han Dynasty"), ("辽代", "Liao Dynasty"),
    ("古建筑", "Historic Architecture"), ("建筑", "Architecture"),
    ("大桥", "Bridge"), ("大坝", "Dam"), ("运河", "Canal"),
    ("山庄", "Mountain Resort"), ("行宫", "Summer Retreat"), ("陵园", "Mausoleum"),
    ("皇陵", "Imperial Tomb"), ("石刻", "Stone Carving"), ("壁画", "Mural"),
    ("古色古香", "Traditional"), ("湖边", "Lakeside"), ("村落", "Village"),
    ("大学", "University"), ("内景", "Interior"), ("全景", "Panorama"),
    ("壮观", "Spectacular"), ("美丽", "Beautiful"), ("醉美", "Scenic"),
    ("云雾缭绕", "Mist-Shrouded"), ("梦里", "Dreamlike"), ("冬季", "Winter"),
    ("春季", "Spring"), ("夏季", "Summer"), ("秋季", "Autumn"), ("四季", "Four Seasons"),
    ("日月潭", "Sun Moon Lake"), ("漓江", "Li River"), ("黄山", "Mount Huangshan"),
    ("秋色", "Autumn Colours"), ("自然", "Natural"), ("天然", "Natural"),
    ("地区", ""), ("郊区", "Outskirts"), ("沟", "Valley"), ("台", "Terrace"),
    ("寺", "Temple"), ("庙", "Temple"), ("宫", "Palace"), ("塔", "Pagoda"),
    ("山", "Mountain"), ("峰", "Peak"), ("湖", "Lake"), ("江", "River"),
    ("河", "River"), ("溪", "Stream"), ("泉", "Spring"), ("岛", "Island"),
    ("湾", "Bay"), ("滩", "Shoal"), ("园", "Garden"), ("村", "Village"),
    ("镇", "Town"), ("城", "City"), ("桥", "Bridge"), ("门", "Gate"),
]

CITY_PREFIXES = None  # filled from PROVINCE_TOKENS values at runtime

# Chinese place-name prefixes stripped off album names so the attraction reads on
# its own and the location can be appended separately in alt text.
LOCATIONS_ZH = [
    ("内蒙古自治区", "Inner Mongolia"), ("新疆维吾尔自治区", "Xinjiang"),
    ("广西壮族自治区", "Guangxi"), ("宁夏回族自治区", "Ningxia"),
    ("西藏自治区", "Tibet"), ("香格里拉", "Shangri-La"), ("西双版纳", "Xishuangbanna"),
    ("呼伦贝尔", "Hulunbuir"), ("锡林郭勒", "Xilingol"), ("鄂尔多斯", "Ordos"),
    ("秦皇岛", "Qinhuangdao"), ("张家界", "Zhangjiajie"), ("九寨沟", "Jiuzhaigou"),
    ("景德镇", "Jingdezhen"), ("石家庄", "Shijiazhuang"), ("哈尔滨", "Harbin"),
    ("乌鲁木齐", "Urumqi"), ("呼和浩特", "Hohhot"), ("嘉峪关", "Jiayuguan"),
    ("黑龙江", "Heilongjiang"), ("内蒙古", "Inner Mongolia"), ("黄果树", "Huangguoshu"),
    ("北京", "Beijing"), ("上海", "Shanghai"), ("天津", "Tianjin"), ("重庆", "Chongqing"),
    ("河北", "Hebei"), ("山西", "Shanxi"), ("辽宁", "Liaoning"), ("吉林", "Jilin"),
    ("江苏", "Jiangsu"), ("浙江", "Zhejiang"), ("安徽", "Anhui"), ("福建", "Fujian"),
    ("江西", "Jiangxi"), ("山东", "Shandong"), ("河南", "Henan"), ("湖北", "Hubei"),
    ("湖南", "Hunan"), ("广东", "Guangdong"), ("海南", "Hainan"), ("四川", "Sichuan"),
    ("贵州", "Guizhou"), ("云南", "Yunnan"), ("陕西", "Shaanxi"), ("甘肃", "Gansu"),
    ("青海", "Qinghai"), ("西藏", "Tibet"), ("广西", "Guangxi"), ("宁夏", "Ningxia"),
    ("新疆", "Xinjiang"), ("香港", "Hong Kong"), ("澳门", "Macau"), ("台湾", "Taiwan"),
    ("承德", "Chengde"), ("保定", "Baoding"), ("唐山", "Tangshan"), ("平遥", "Pingyao"),
    ("大同", "Datong"), ("太原", "Taiyuan"), ("沈阳", "Shenyang"), ("大连", "Dalian"),
    ("长春", "Changchun"), ("南京", "Nanjing"), ("苏州", "Suzhou"), ("扬州", "Yangzhou"),
    ("无锡", "Wuxi"), ("常州", "Changzhou"), ("南通", "Nantong"), ("徐州", "Xuzhou"),
    ("杭州", "Hangzhou"), ("宁波", "Ningbo"), ("温州", "Wenzhou"), ("绍兴", "Shaoxing"),
    ("嘉兴", "Jiaxing"), ("舟山", "Zhoushan"), ("黄山", "Huangshan"), ("合肥", "Hefei"),
    ("厦门", "Xiamen"), ("福州", "Fuzhou"), ("泉州", "Quanzhou"), ("南昌", "Nanchang"),
    ("上饶", "Shangrao"), ("青岛", "Qingdao"), ("济南", "Jinan"), ("烟台", "Yantai"),
    ("潍坊", "Weifang"), ("淄博", "Zibo"), ("曲阜", "Qufu"), ("青州", "Qingzhou"),
    ("洛阳", "Luoyang"), ("郑州", "Zhengzhou"), ("开封", "Kaifeng"), ("登封", "Dengfeng"),
    ("武汉", "Wuhan"), ("宜昌", "Yichang"), ("恩施", "Enshi"), ("长沙", "Changsha"),
    ("凤凰", "Fenghuang"), ("广州", "Guangzhou"), ("深圳", "Shenzhen"), ("珠海", "Zhuhai"),
    ("佛山", "Foshan"), ("汕头", "Shantou"), ("潮州", "Chaozhou"), ("三亚", "Sanya"),
    ("海口", "Haikou"), ("成都", "Chengdu"), ("乐山", "Leshan"), ("峨眉", "Emei"),
    ("稻城", "Daocheng"), ("贵阳", "Guiyang"), ("安顺", "Anshun"), ("凯里", "Kaili"),
    ("遵义", "Zunyi"), ("昆明", "Kunming"), ("大理", "Dali"), ("丽江", "Lijiang"),
    ("元阳", "Yuanyang"), ("西安", "Xi'an"), ("汉中", "Hanzhong"), ("延安", "Yan'an"),
    ("宝鸡", "Baoji"), ("榆林", "Yulin"), ("兰州", "Lanzhou"), ("敦煌", "Dunhuang"),
    ("张掖", "Zhangye"), ("西宁", "Xining"), ("拉萨", "Lhasa"), ("日喀则", "Shigatse"),
    ("林芝", "Nyingchi"), ("桂林", "Guilin"), ("阳朔", "Yangshuo"), ("南宁", "Nanning"),
    ("北海", "Beihai"), ("银川", "Yinchuan"), ("中卫", "Zhongwei"), ("喀什", "Kashgar"),
    ("吐鲁番", "Turpan"), ("伊犁", "Yili"), ("台北", "Taipei"), ("高雄", "Kaohsiung"),
    ("花莲", "Hualien"), ("九江", "Jiujiang"), ("婺源", "Wuyuan"), ("平潭", "Pingtan"),
]


PROVINCE_EN = {zh: en for zh, en in LOCATIONS_ZH}


def province_en(prov_zh: str) -> str:
    """English name for a pic/ province directory ("陕西省" -> "Shaanxi")."""
    base = prov_zh.replace("省", "").replace("市", "")
    return PROVINCE_EN.get(prov_zh) or PROVINCE_EN.get(base) or base


def clean_album_name(raw: str) -> str:
    """Drop the trailing "(NN张)" count and stray punctuation."""
    name = re.sub(r"[（(]\s*\d+\s*张?\s*[)）]?\s*$", "", raw).strip()
    name = re.sub(r"^[)）\]】]+|[（(\[【]+$", "", name)
    return name.strip(" 　-_()（）")


def english_label(name: str) -> str:
    """Best-effort English label for alt text.

    Multi-character scenic terms are translated; leftover Chinese runs become a
    single capitalised pinyin word (proper-noun style, e.g. 什刹海 -> "Shichahai")
    rather than syllable-by-syllable. Single-character terms (山/湖/寺…) are only
    translated when they end the name, so 中山公园 does not become
    "Zhong Mountain Park".
    """
    core = re.sub(r"[（(][^)）]*[)）]", " ", name)  # drop parenthetical notes
    core = re.sub(r"[的和与之及在从到]", "", core)  # particles romanise into noise
    core = re.sub(r"\s+", " ", core).strip()

    # Pull out place names wherever they appear ("古色古香武汉大学" -> Wuhan +
    # 大学), so the attraction reads on its own and the location is appended once.
    places: list[str] = []
    for zh, en in LOCATIONS_ZH:
        if zh in core and len(core) > len(zh):
            if en not in places:
                places.append(en)
            core = core.replace(zh, " ")
    core = re.sub(r"\s+", " ", core).strip()

    # Trailing generic descriptors are handled separately so they never block a
    # single-character term from being recognised as the head noun.
    suffix = ""
    for zh, en in (
        ("风景区", "Scenic Area"), ("风景", "Scenery"), ("风光", "Landscape"),
        ("景区", "Scenic Area"), ("景色", "Scenery"), ("图片", ""), ("美景", "Scenery"),
    ):
        if core.endswith(zh):
            core, suffix = core[: -len(zh)], en
            break

    parts: list[str] = []
    pending = ""

    def flush() -> None:
        """Emit the buffered Chinese run as one capitalised pinyin word.

        Runs longer than four characters romanise into unreadable blobs
        ("Guseguxiangdewuhandaxue"), so those are dropped rather than shipped
        into alt text.
        """
        nonlocal pending
        if pending:
            # Long runs romanise into unreadable blobs; keep the head noun only.
            head = pending if len(pending) <= 6 else pending[:4]
            parts.append("".join(lazy_pinyin(head)).capitalize())
            pending = ""

    i = 0
    while i < len(core):
        for zh, en in TERMS:
            if len(zh) < 2 and i != len(core) - 1:
                continue  # single-char term only counts as the head noun
            if core.startswith(zh, i):
                flush()
                parts.append(en)
                i += len(zh)
                break
        else:
            ch = core[i]
            if re.match(r"[一-鿿]", ch):
                pending += ch
            elif ch.strip():
                flush()
                parts.append(ch)
            i += 1
    flush()

    if suffix:
        parts.append(suffix)

    # Collapse repeats ("Huangguoshu Waterfall Waterfall" -> one Waterfall)
    out: list[str] = []
    for p in parts:
        if p and (not out or out[-1].lower() != p.lower()):
            out.append(p)
    label = " ".join(out)
    # Album folder names sometimes carry a malformed photo count ("(41张"), which
    # would otherwise surface as "( 4 1 Zhang" in alt text.
    label = re.sub(r"[（(\[]|[)）\]]", " ", label)
    label = re.sub(r"\b(?:\d+|Zhang|Gong|Tu Pian|Pian)\b", " ", label)
    label = re.sub(r"\s+", " ", label).strip(" ,-")
    if places:
        label = f"{label}, {', '.join(places)}" if label else ", ".join(places)
    return label


def main() -> int:
    if not os.path.isdir(PIC):
        print(f"pic/ not found at {PIC}", file=sys.stderr)
        return 1

    albums = []
    for prov_dir in sorted(os.listdir(PIC)):
        prov_path = os.path.join(PIC, prov_dir)
        if not os.path.isdir(prov_path):
            continue
        prov_name = re.sub(r"^\d+[.,]\s*", "", prov_dir).strip()
        tokens = PROVINCE_TOKENS.get(prov_name)
        if tokens is None:
            print(f"  ! unmapped province dir: {prov_dir}", file=sys.stderr)
            tokens = []

        for album_dir in sorted(os.listdir(prov_path)):
            album_path = os.path.join(prov_path, album_dir)
            if not os.path.isdir(album_path):
                continue
            names = sorted(
                f
                for f in os.listdir(album_path)
                if os.path.splitext(f)[1] in IMG_EXT and not f.startswith(".")
            )
            # Landscape frames first: portrait photos rendered at article width
            # become a screen-and-a-half tall, which reads badly inline.
            landscape, portrait = [], []
            for f in names:
                try:
                    with Image.open(os.path.join(album_path, f)) as im:
                        w, h = im.size
                except Exception:
                    continue
                (landscape if w >= h * 1.2 else portrait).append(f)
            files = landscape + portrait
            if not files:
                continue
            zh = clean_album_name(album_dir)
            label = english_label(zh)
            if not re.search(r"[A-Z][a-z]{2,}", label.split(",")[0]):
                head = label.split(",")[0].strip()
                label = f"{province_en(prov_name)} {head}".strip() if head else ""
            albums.append(
                {
                    "province": prov_name,
                    "provinceTokens": tokens,
                    "dir": os.path.relpath(album_path, ROOT),
                    "zh": zh,
                    "pinyin": "".join(lazy_pinyin(zh)),
                    "pinyinWords": lazy_pinyin(zh),
                    "en": label or f"{province_en(prov_name)} Scenery",
                    "files": files,
                    "landscapeCount": len(landscape),
                    "count": len(files),
                }
            )

    payload = {
        "albums": albums,
        "albumCount": len(albums),
        "imageCount": sum(a["count"] for a in albums),
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    print(f"albums={payload['albumCount']} images={payload['imageCount']} -> {OUT}")
    for a in albums[:6]:
        print(f"  {a['province']:6} {a['zh']:24} | {a['pinyin']:28} | {a['en']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
