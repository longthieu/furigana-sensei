#!/usr/bin/env python3
"""Builds data/kanji.json, data/components.json and data/words.json.

Inputs, downloaded into a scratch dir (see the README):
  * kanjidic2.xml  — meanings, on/kun readings, stroke count, grade, and the
                     classical (Kangxi) radical number.
  * kradfile       — the visual decomposition each kanji is built from.
  * radkfile       — the same radicals with the stroke count of the shape they
                     stand for, which is how the stand-ins below are found.
  * JMdict_e       — word glosses, trimmed to entries flagged common.

Both are from the Electronic Dictionary Research and Development Group and are
licensed CC BY-SA; the panel credits them on screen.

Note on what the components mean: KRADFILE is a *visual* decomposition meant
for radical-based lookup, not an etymological one. 亜 is listed as ｜一口
because that is what the glyph looks like, not because it is built from those
meanings. The classical radical is carried separately, from kanjidic2.

Usage:  python3 tools/build-kanji.py <scratch-dir>
"""
import json
import re
import sys
from collections import Counter
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

scratch = Path(sys.argv[1] if len(sys.argv) > 1 else ".") / "kanji"
out_dir = Path(__file__).resolve().parent.parent / "data"

MAX_MEANINGS = 4
MAX_READINGS = 4

# KRADFILE uses a handful of katakana as shape mnemonics; they are strokes, not
# meaningful radicals, so label them as shapes rather than inventing a meaning.
# KRADFILE writes some radical forms as an ordinary kanji that contains them:
# 漢 is listed with 汁, meaning 氵, not "soup". radkfile gives each radical the
# stroke count of the shape it stands for, so a mismatch against the
# character's own stroke count identifies every one of these mechanically.
# What the stand-in actually means is then taken from the classical radical
# that its kanji overwhelmingly share — and where they do not share one (the
# stand-in marks a shape that can sit anywhere in the glyph, like 灬), no
# meaning is claimed at all.
AGREEMENT = 0.45

SHAPES = {
    "｜": "vertical stroke",
    "ノ": "sweeping stroke (丿)",
    "ハ": "split strokes (八)",
    "マ": "“ma” shape (as in 予)",
    "ユ": "“yu” shape (as in 急)",
    "ヨ": "snout shape (彐, as in 雪)",
}


def kangxi(number):
    """Radical number -> (kanji form, English name), straight from Unicode."""
    if not number:
        return None, None
    ch = chr(0x2EFF + int(number))          # Kangxi Radicals block is in order
    try:
        name = unicodedata.name(ch).replace("KANGXI RADICAL ", "").lower()
    except ValueError:
        return None, None
    return unicodedata.normalize("NFKC", ch), name


def parse_kanjidic(path):
    entries = {}
    for ch in ET.parse(path).getroot().findall("character"):
        literal = ch.findtext("literal")
        rm = ch.find("reading_meaning")
        group = rm.find("rmgroup") if rm is not None else None
        if group is None:
            continue
        meanings = [m.text for m in group.findall("meaning") if m.get("m_lang") is None]
        if not meanings:
            continue
        misc = ch.find("misc")
        rad = ch.find("radical")
        classical = None
        if rad is not None:
            for value in rad.findall("rad_value"):
                if value.get("rad_type") == "classical":
                    classical = value.text
        entries[literal] = {
            "m": meanings[:MAX_MEANINGS],
            "on": [r.text for r in group.findall("reading") if r.get("r_type") == "ja_on"][:MAX_READINGS],
            "kun": [r.text for r in group.findall("reading") if r.get("r_type") == "ja_kun"][:MAX_READINGS],
            "s": int(misc.findtext("stroke_count")) if misc is not None and misc.findtext("stroke_count") else None,
            "g": int(misc.findtext("grade")) if misc is not None and misc.findtext("grade") else None,
            "r": int(classical) if classical else None
        }
    return entries


def parse_radkfile(path):
    """radical -> (stroke count of the shape it stands for, kanji using it)."""
    groups, current = {}, None
    with open(path, encoding="euc-jp") as fh:
        for line in fh:
            if line.startswith("$"):
                parts = line.split()
                current = parts[1]
                groups[current] = {"strokes": int(parts[2]), "kanji": []}
            elif current and not line.startswith("#"):
                groups[current]["kanji"].extend(line.strip())
    return groups


def tidy(meaning):
    """KANJIDIC labels radicals "legs radical (no. 10)"; the number is noise
    in a chip that is already showing the glyph."""
    return re.sub(r"\s*radical\s*\(no\.\s*\d+\)", "", meaning).strip(" ,") or meaning


def pick_examples(kanji, kanjidic, count=3):
    """Illustrate a shape with kanji a learner has actually met: school grades
    first, then everything else."""
    graded = [k for k in kanji if kanjidic.get(k, {}).get("g")]
    graded.sort(key=lambda k: (kanjidic[k]["g"], kanjidic[k]["s"] or 99))
    return (graded or kanji)[:count]


def resolve_standins(radk, kanjidic):
    """{stand-in: (display form, label)} for radicals written as another kanji."""
    resolved = {}
    for char, group in radk.items():
        entry = kanjidic.get(char)
        if not entry or not entry["s"] or entry["s"] == group["strokes"]:
            continue  # written as itself

        counts = Counter(
            kanjidic[k]["r"] for k in group["kanji"] if k in kanjidic and kanjidic[k]["r"]
        )
        if counts:
            radical, hits = counts.most_common(1)[0]
            if hits / sum(counts.values()) >= AGREEMENT:
                form, name = kangxi(radical)
                if form:
                    resolved[char] = (form, name)
                    continue

        # No shared radical: it marks a shape, so say that and show where else
        # it turns up instead of inventing a meaning for it.
        examples = "".join(pick_examples(group["kanji"], kanjidic))
        resolved[char] = (char, f"shape — also in {examples}" if examples else "shape")
    return resolved


def parse_kradfile(path):
    table = {}
    with open(path, encoding="euc-jp") as fh:
        for line in fh:
            if line.startswith("#") or ":" not in line:
                continue
            kanji, parts = line.split(":", 1)
            table[kanji.strip()] = parts.split()
    return table


def parse_jmdict(path):
    """Common entries only: 18k words instead of 219k, for a tenth of the size."""
    COMMON = {"news1", "ichi1", "spec1", "spec2", "gai1"}
    table = {}
    for entry in ET.parse(path).getroot().findall("entry"):
        written, common = None, False
        for k in entry.findall("k_ele"):
            if written is None:
                written = k.findtext("keb")
            if {p.text for p in k.findall("ke_pri")} & COMMON:
                written, common = k.findtext("keb"), True
                break
        if written is None or written in table:
            continue
        if not common:
            for r in entry.findall("r_ele"):
                if {p.text for p in r.findall("re_pri")} & COMMON:
                    common = True
                    break
        if not common:
            continue
        sense = entry.find("sense")
        if sense is None:
            continue
        glosses = [g.text for g in sense.findall("gloss") if g.text][:3]
        if glosses:
            table[written] = [entry.findtext("r_ele/reb"), "; ".join(glosses)]
    return table


kanjidic = parse_kanjidic(scratch / "kanjidic2.xml")
krad = parse_kradfile(scratch / "kradfile")
standins = resolve_standins(parse_radkfile(scratch / "radkfile"), kanjidic)

# Only ship kanji we can actually say something about.
kanji_out = {}
for ch, entry in kanjidic.items():
    parts = krad.get(ch)
    record = {"m": entry["m"], "on": entry["on"], "kun": entry["kun"]}
    if entry["s"]:
        record["s"] = entry["s"]
    if entry["g"]:
        record["g"] = entry["g"]
    radical_char, radical_name = kangxi(entry["r"])
    if radical_char:
        record["r"] = [radical_char, radical_name]
    # Drop the kanji itself from its own decomposition — 口 is not a part of 口.
    if parts:
        trimmed = [p for p in parts if p != ch]
        if trimmed:
            record["c"] = trimmed
    kanji_out[ch] = record

# Short label for every component that appears in a decomposition.
components = {}
for parts in krad.values():
    for part in parts:
        if part in components:
            continue
        if part in standins:
            form, label = standins[part]
            components[part] = label if form == part else [form, label]
        elif part in SHAPES:
            components[part] = SHAPES[part]
        elif part in kanjidic:
            components[part] = tidy(kanjidic[part]["m"][0])
        else:
            components[part] = None

unlabelled = [c for c, v in components.items() if not v]
for c in unlabelled:
    components.pop(c)

words = parse_jmdict(scratch / "JMdict_e")

out_dir.mkdir(exist_ok=True)
for name, payload in (("kanji.json", kanji_out), ("components.json", components),
                      ("words.json", words)):
    path = out_dir / name
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path} — {len(payload)} entries, {path.stat().st_size / 1024:.0f} KB")

with_parts = sum(1 for v in kanji_out.values() if "c" in v)
print(f"  kanji with a decomposition: {with_parts}")
print(f"  components left unlabelled: {len(unlabelled)} {''.join(unlabelled)}")
named = [c for c, v in components.items() if isinstance(v, list)]
print(f"  stand-ins mapped to their real radical: {len(named)} " +
      " ".join(f"{c}->{components[c][0]}" for c in named))
