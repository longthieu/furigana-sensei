#!/usr/bin/env python3
"""Builds data/strokes/*.json — SVG stroke paths per kanji, from KanjiVG.

Why images at all: a page without a Japanese font falls back to a Chinese one,
and the glyphs genuinely differ (骨, 直, 次). A vector drawing always shows the
Japanese form, and it carries stroke order for free.

KanjiVG is © Ulrich Apel, CC BY-SA 3.0 — https://kanjivg.tagaini.net
Attribution is a licence condition; the panel credits it on screen.

Sharded by the first two hex digits of the codepoint so the panel fetches
~70 KB for the kanji on screen rather than the whole 5 MB.

Usage:  python3 tools/build-strokes.py <scratch-dir>
where <scratch-dir> holds kanjivg.xml.
"""
import json
import re
import sys
from pathlib import Path

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


buckets = {}
total = 0
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
    paths = re.findall(r'\bd="([^"]+)"', body)
    if not paths:
        continue
    buckets.setdefault(f"{ord(ch):x}"[:2], {})[ch] = [shrink(p) for p in paths]
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
