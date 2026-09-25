#!/usr/bin/env bash
# CrazyGames sürümü: index.html'e CrazyGames SDK betiği eklenir (ilerleme SDK veri modülüne
# kaydedilir), PWA dosyaları (manifest, sw.js) çıkarılır ve sayfa data-build="crazygames" ile
# işaretlenir (dışarıya götüren sosyal paylaşım düğmeleri bu sürümde gösterilmez). Çıktı: dist/aqua-hockey-crazygames.zip
set -euo pipefail
cd "$(dirname "$0")/.."

out=dist/crazygames
zipfile=dist/aqua-hockey-crazygames.zip
rm -rf "$out" "$zipfile"
mkdir -p "$out"
cp -R css js icons "$out"/

awk '
  /<link rel="manifest"/ { next }
  /<html lang="/ { sub(/<html /, "<html data-build=\"crazygames\" ") }
  /<script src="js\/game.js"><\/script>/ {
    print "  <script src=\"https://sdk.crazygames.com/crazygames-sdk-v3.js\"></script>"
  }
  { print }
' index.html > "$out/index.html"

grep -q 'crazygames-sdk-v3.js' "$out/index.html" || { echo "SDK betiği eklenemedi" >&2; exit 1; }
grep -q 'data-build="crazygames"' "$out/index.html" || { echo "Sürüm işareti eklenemedi" >&2; exit 1; }
(cd "$out" && zip -rq ../aqua-hockey-crazygames.zip .)
echo "Hazır: $zipfile"
