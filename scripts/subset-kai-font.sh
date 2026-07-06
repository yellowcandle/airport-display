#!/bin/sh
# Subset the Free HK Kai (自由香港楷書) TTF down to just the characters the
# boards render: every CJK char in destinations.json + the static Chinese
# text in the two HTML pages + the bilingual status labels baked into the two
# data layers. Re-run after adding destinations.
# Source font: https://freehkfonts.opensource.hk (SIL OFL; see their repo).
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
uvx --from 'fonttools[woff]' pyftsubset fonts-src/Free-HK-Kai_4700-v1.02.ttf \
  --text="$CHARS" \
  --flavor=woff2 \
  --output-file=public/fonts/FreeHKKai-subset.woff2
ls -lh public/fonts/FreeHKKai-subset.woff2
