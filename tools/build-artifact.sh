#!/usr/bin/env bash
# Deneme sayfaları (claude.ai artifact): CSS ve JS'nin içine gömüldüğü tek HTML dosyası. PWA dosyaları
# (manifest, sw.js, simgeler) yoktur. İki çıktı:
#   dist/artifact/aqua-hockey.html           oyun
#   dist/artifact/aqua-hockey-showcase.html  tanıtım sürümü (data-build="showcase": her şey açık)
# Adresler docs/v2-plan.md içinde ("Deneme sayfaları"); güncellerken aynı adresler kullanılmalı.
set -euo pipefail
cd "$(dirname "$0")/.."

out=dist/artifact
mkdir -p "$out"

python3 - "$out" <<'EOF'
import re, sys
out = sys.argv[1]
html = open('index.html', encoding='utf-8').read()
css = open('css/style.css', encoding='utf-8').read()
js = open('js/game.js', encoding='utf-8').read()

# Gövde: <body> ile oyun betiği arasındaki her şey
body = html.split('<body>', 1)[1].split('  <script src="js/game.js"></script>', 1)[0]
# Service worker kaydı tek dosyalık sayfada gerekmez
js, n = re.subn(r"\n  // Çevrimdışı önbellek \(PWA\).*?\n  }\n", "\n", js, flags=re.S)
assert n == 1, 'service worker bloğu bulunamadı'
title = re.search(r'<title>(.*?)</title>', html).group(1)
theme = re.search(r'<meta name="theme-color" content="([^"]+)">', html).group(1)
fonts = re.search(r'<link href="(https://fonts\.googleapis\.com/[^"]+)" rel="stylesheet">', html).group(1)

def page(showcase):
    head = [f'<title>{title}{" — Tanıtım" if showcase else ""}</title>', f'<meta name="theme-color" content="{theme}">']
    if showcase:
        head.append("<script>document.documentElement.dataset.build = 'showcase';</script>")
    head += ['<link rel="preconnect" href="https://fonts.googleapis.com">',
             '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
             f'<link href="{fonts}" rel="stylesheet">']
    return '\n'.join(head) + '\n<style>\n' + css + '\n:root { color-scheme: dark; }\n</style>\n' + body + '  <script>\n' + js + '</script>\n'

for name, sc in (('aqua-hockey.html', False), ('aqua-hockey-showcase.html', True)):
    open(f'{out}/{name}', 'w', encoding='utf-8').write(page(sc))
EOF
echo "Hazır: $out/aqua-hockey.html, $out/aqua-hockey-showcase.html"
