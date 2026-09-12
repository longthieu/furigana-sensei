#!/usr/bin/env python3
"""Builds data/strokes/*.json — stroke paths and component structure, from KanjiVG.

Why images at all: a page without a Japanese font falls back to a Chinese one,
and the glyphs genuinely differ (骨, 直, 次). A vector drawing always shows the
Japanese form, and it carries stroke order for free.

KanjiVG is © Ulrich Apel, CC BY-SA 3.0 — https://kanjivg.tagaini.net
Attribution is a licence condition; the panel credits it on screen.

Each entry carries the strokes and the components the character is built from,
taken from KanjiVG's nested <g kvg:element="…"> groups. That structure is a
real decomposition — 漢 is 氵 + 艹 + 口 + 夫 — unlike KRADFILE, which is a
visual index (it calls the same character ｜一口…). Because every group owns a
run of consecutive strokes, a component can be highlighted inside the
character by drawing just its strokes.

Sharded by the first two hex digits of the codepoint so the panel fetches
~70 KB for the kanji on screen rather than the whole 5 MB.

Usage:  python3 tools/build-strokes.py <scratch-dir>
where <scratch-dir> holds kanjivg.xml.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

KVG = "{http://kanjivg.tagaini.net}"

scratch = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
root = Path(__file__).resolve().parent.parent
out_dir = root / "data" / "strokes"

# One decimal is plenty for a 109-unit viewBox drawn at 120 px, and saves a
# fifth of the size against KanjiVG's two.
PLACES = 1

known = set(json.loads((root / "data" / "kanji.json").read_text(encoding="utf-8")))
xml = (scratch / "kanjivg.xml").read_text(encoding="utf-8")
number = re.compile(r"-?\d+\.?\d*")


def shrink(path):
    return number.sub(lambda m: f"{round(float(m.group()), PLACES):g}", path)


def components_of(group, strokes):
    """Top-level named parts, descending through groups that name nothing.

    A group like 漢's right half carries only a phonetic hint, so its children
    (艹, 口, 夫) are the parts worth showing.
    """
    parts = []
    for child in group:
        if child.tag != "g":
            continue
        element = child.get(KVG + "element")
        if not element:
            parts.extend(components_of(child, strokes))
            continue
        indices = [strokes[path.get("id")] for path in child.iter("path") if path.get("id") in strokes]
        if not indices:
            continue
        parts.append([
            element,
            child.get(KVG + "original"),      # 氵 is a variant of 水
            child.get(KVG + "position"),      # left / top / bottom / …
            min(indices),
            max(indices)
        ])
    return parts


buckets = {}
total = 0
structured = 0
for code, body in re.findall(r'<kanji id="kvg:kanji_([0-9a-f]+)">(.*?)</kanji>', xml, re.S):
    base = code.split("-")[0]          # variants like 04e00-itaiji are skipped
    if code != base:
        continue
    try:
        ch = chr(int(base, 16))
    except ValueError:
        continue
    if ch not in known:
        continue
    try:
        root_group = ET.fromstring(f'<kanji xmlns:kvg="http://kanjivg.tagaini.net">{body}</kanji>')
    except ET.ParseError:
        continue

    order = {}
    paths = []
    for path in root_group.iter("path"):
        d = path.get("d")
        if not d:
            continue
        order[path.get("id")] = len(paths) + 1      # 1-based, matches the labels
        paths.append(shrink(d))
    if not paths:
        continue

    entry = {"p": paths}
    top = root_group.find("g")
    parts = components_of(top, order) if top is not None else []
    # A single part spanning the whole character says nothing.
    if len(parts) > 1:
        entry["c"] = parts
        structured += 1

    buckets.setdefault(f"{ord(ch):x}"[:2], {})[ch] = entry
    total += 1

if out_dir.exists():
    for stale in out_dir.glob("*.json"):
        stale.unlink()
out_dir.mkdir(parents=True, exist_ok=True)

size = 0
for name, payload in buckets.items():
    path = out_dir / f"{name}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size += path.stat().st_size

print(f"wrote {len(buckets)} shards into {out_dir}")
print(f"  {total} kanji, {size / 1024 / 1024:.1f} MB total, "
      f"{size / len(buckets) / 1024:.0f} KB per shard")
print(f"  with a component breakdown: {structured}")
