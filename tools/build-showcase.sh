#!/usr/bin/env bash
# Tanıtım (showcase) sürümü: tanıtım videosu çekmek için. Tüm temalar açık, 9.999 altın ve 99'ar
# yetenek hakkıyla başlar, reklam düğmeleri gizlidir, görüntü kalitesi otomatik düşürülmez.
# Kayıtları gerçek oyundan ayrı tutulur. Yayına ya da CrazyGames'e yüklenmek için değildir.
# Çıktı: dist/aqua-hockey-showcase.zip
set -euo pipefail
cd "$(dirname "$0")/.."

out=dist/showcase
zipfile=dist/aqua-hockey-showcase.zip
rm -rf "$out" "$zipfile"
mkdir -p "$out"
cp -R css js icons "$out"/

awk '
  /<link rel="manifest"/ { next }
  /<html lang="/ { sub(/<html /, "<html data-build=\"showcase\" ") }
  { print }
' index.html > "$out/index.html"

grep -q 'data-build="showcase"' "$out/index.html" || { echo "Sürüm işareti eklenemedi" >&2; exit 1; }
(cd "$out" && zip -rq ../aqua-hockey-showcase.zip .)
echo "Hazır: $zipfile"
