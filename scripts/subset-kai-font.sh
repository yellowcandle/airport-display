#!/bin/sh
# Subset TW-Kai (教育部全字庫正楷體) down to just the characters the boards
# render: every CJK char in destinations.json + the static Chinese text in
# the two HTML pages + the bilingual status labels baked into the two data
# layers. Re-run after adding destinations.
# Source font: https://data.gov.tw/dataset/5961 (CNS11643 全字庫), via
# https://github.com/XiaoPanPanKevinPan/fontCollection — dual-licensed
# 政府資料開放授權條款 1.0 / SIL OFL 1.1. Covers the full BMP (~39,200 CJK
# chars), so no rare place-name glyphs need a system-font fallback.
set -e
cd "$(dirname "$0")/.."

CHARS=$(python3 - <<'PY'
import json, re
chars = set()
for path in ('public/index.html', 'public/arrivals.html', 'public/about.html',
             'public/data.js', 'public/arrivals-data.js'):
    chars.update(re.findall(r'[　-鿿豈-﫿]', open(path, encoding='utf-8').read()))
for v in json.load(open('public/destinations.json', encoding='utf-8')).values():
    chars.update(re.findall(r'[　-鿿豈-﫿]', v.get('zh', '')))
print(''.join(sorted(chars)))
PY
)

echo "Subsetting $(printf %s "$CHARS" | wc -m | tr -d ' ') CJK chars"
uvx --from 'fonttools[woff]' pyftsubset fonts-src/TW-Kai-98_1.ttf \
  --text="$CHARS" \
  --flavor=woff2 \
  --output-file=public/fonts/TWKai-subset.woff2
ls -lh public/fonts/TWKai-subset.woff2
