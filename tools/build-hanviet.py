#!/usr/bin/env python3
"""Builds data/hanviet.json — kanji -> Hán-Việt (Sino-Vietnamese) reading.

Inputs (all fetched into a scratch dir, none vendored):
  * hanviet-pinyin-words (npm, MIT) — Hán-Việt readings keyed by character and
    numbered pinyin.
  * Unihan (unicode.org)  — kMandarin picks WHICH reading is the primary one,
    and the variant fields bridge Chinese simplifications.
  * kyujitai (npm, MIT)   — shinjitai -> kyūjitai, which Unihan does not carry
    for Japan-only simplifications (読/讀, 売/賣, 県/縣, 駅/驛 …).

Note: Unihan's own kVietnamese field is NOT usable here — it records chữ Nôm
readings, not Hán-Việt (it gives 東 as "đang", where the Hán-Việt is "đông").

Usage:  python3 tools/build-hanviet.py <scratch-dir>
where <scratch-dir> holds unihan/Unihan_*.txt and hv/node_modules/.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

scratch = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
mods = scratch / "hv" / "node_modules"

raw = (mods / "hanviet-pinyin-words/src/hanvietData.js").read_text(encoding="utf-8")
HV = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
KYUJI = {s: k for s, k, *_ in json.loads(
    (mods / "kyujitai/data/kyujitai.json").read_text(encoding="utf-8"))["kyuji"]}


def charset(path):
    return set(re.findall(r"[㐀-鿿]", (mods / path).read_text(encoding="utf-8")))


JOYO = charset("joyo-kanji/index.js")
JINMEI = charset("jinmeiyo-kanji/index.js")

kMandarin, japanese = {}, set()
for line in (scratch / "unihan/Unihan_Readings.txt").open(encoding="utf-8"):
    if line.startswith("#") or "\t" not in line:
        continue
    cp, field, val = line.rstrip("\n").split("\t", 2)
    ch = chr(int(cp[2:], 16))
    if field == "kMandarin":
        kMandarin[ch] = val.split()[0]
    elif field in ("kJapaneseKun", "kJapaneseOn"):
        japanese.add(ch)

variants = {}
for line in (scratch / "unihan/Unihan_Variants.txt").open(encoding="utf-8"):
    if line.startswith("#") or "\t" not in line:
        continue
    cp, field, val = line.rstrip("\n").split("\t", 2)
    variants.setdefault(chr(int(cp[2:], 16)), {})[field] = [
        chr(int(t.split("<")[0][2:], 16)) for t in val.split() if t.startswith("U+")
    ]

TONES = {"̄": 1, "́": 2, "̌": 3, "̀": 4}


def numbered(pinyin):
    """shàng -> shang4, the key shape hanvietData uses."""
    decomposed = unicodedata.normalize("NFD", pinyin)
    tone = 5
    for mark, n in TONES.items():
        if mark in decomposed:
            tone = n
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return stripped.replace("ü", "v").lower() + str(tone)


def reading_of(ch):
    """The primary Hán-Việt reading of one character, or None."""
    entry = HV.get(ch)
    if not entry:
        return None
    pinyin = kMandarin.get(ch)
    if pinyin:
        primary = entry.get(numbered(pinyin))
        if primary:
            return primary[0]
    for readings in entry.values():   # no kMandarin: first listed reading
        if readings:
            return readings[0]
    return None


VARIANT_FIELDS = ["kTraditionalVariant", "kZVariant", "kSemanticVariant",
                  "kSpecializedSemanticVariant"]

# The source lists several readings per pinyin and sometimes puts the chữ Nôm
# one first. These are the jōyō characters where the automatic pick was the
# Nôm reading rather than the Hán-Việt; every entry here is a choice between
# candidates the source already offers, not an invention.
# Reviewed for jōyō only — rarer characters keep the automatic pick.
OVERRIDES = {
    "刷": "loát",   # 印刷 ấn loát
    "句": "cú",     # 語句 ngữ cú
    "啓": "khải",   # 啓発 khải phát
    "奥": "áo",     # 奥義 áo nghĩa
    "尺": "xích",   # thước is Nôm
    "幕": "mạc",    # 幕府 mạc phủ
    "扶": "phù",    # phò is Nôm
    "更": "cánh",   # càng is Nôm
    "梗": "ngạnh",  # cành is Nôm
    "泡": "bào",    # 気泡 khí bào
    "潮": "triều",  # 潮流 triều lưu
    "監": "giám",   # 監督 giám đốc
    "縄": "thằng",  # 沖縄 Xung Thằng
    "縛": "phược",  # buộc is Nôm
    "膜": "mạc",    # màng is Nôm
    "芋": "vu",
    "裸": "khoả",   # 裸体 khoả thân
    "譜": "phổ",    # 楽譜 nhạc phổ
    "読": "độc",    # 読書 độc thư — the source lists "đọc" (Nôm) first
}


def resolve(ch):
    if ch in OVERRIDES:
        return OVERRIDES[ch]
    # Kyūjitai first: Hán-Việt belongs to the traditional form, and a shinjitai
    # that doubles as a Chinese character often carries a chữ Nôm reading
    # instead (読 is listed as "đọc"; via 讀 it is correctly "độc").
    old = KYUJI.get(ch)
    if old:
        r = reading_of(old)
        if r:
            return r
    r = reading_of(ch)
    if r:
        return r
    for field in VARIANT_FIELDS:
        for target in variants.get(ch, {}).get(field, []):
            if target != ch:
                r = reading_of(target)
                if r:
                    return r
    return None


table, missing = {}, []
for ch in sorted(JOYO | JINMEI | (japanese & set(HV))):
    r = resolve(ch)
    if r:
        table[ch] = r
    elif ch in JOYO or ch in JINMEI:
        missing.append(ch)

out = Path(__file__).resolve().parent.parent / "data" / "hanviet.json"
out.write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

print(f"wrote {out} — {len(table)} characters, {out.stat().st_size / 1024:.0f} KB")
print(f"  jōyō      {len([c for c in JOYO if c in table])}/{len(JOYO)}")
print(f"  jinmeiyō  {len([c for c in JINMEI if c in table])}/{len(JINMEI)}")
print(f"  no reading ({len(missing)}, almost all kokuji): {''.join(missing)}")
