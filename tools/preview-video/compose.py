#!/usr/bin/env python3
"""Çekilen klipleri 0,25 sn geçişlerle birleştirir.
- dikey: portrait klasöründen 1080x1620
- yatay: landscape klasörü varsa doğrudan 1920x1080 (v2'de masa yatayda yan döner); yoksa dikey
  videonun iki yanı bulanık dolguyla 1920x1080
Kullanım: python3 compose.py <dist/preview-video> <ffmpeg yolu>"""
import os, subprocess, sys

root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '../../dist/preview-video')
F = sys.argv[2] if len(sys.argv) > 2 else 'ffmpeg'
T = 0.25
common = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an']


def join(base, w, h, out):
    clips = sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d)))
    inputs, durs = [], []
    for c in clips:
        n = len([f for f in os.listdir(os.path.join(base, c)) if f.endswith('.jpg')])
        durs.append(n / 30)
        inputs += ['-framerate', '30', '-i', os.path.join(base, c, '%04d.jpg')]
    parts = [f'[{i}:v]scale={w}:{h},setsar=1,fps=30,format=yuv420p[v{i}]' for i in range(len(clips))]
    prev, off = 'v0', 0.0
    for i in range(1, len(clips)):
        off += durs[i - 1] - T
        parts.append(f'[{prev}][v{i}]xfade=transition=fade:duration={T}:offset={off:.3f}[x{i}]')
        prev = f'x{i}'
    subprocess.run([F, '-y', *inputs, '-filter_complex', ';'.join(parts), '-map', f'[{prev}]', *common, out], check=True)
    print('Hazır:', out, 'süre', round(sum(durs) - T * (len(durs) - 1), 2), 'sn')


portrait = os.path.join(root, 'elemental-puck-arena-preview-1080x1620.mp4')
landscape = os.path.join(root, 'elemental-puck-arena-preview-1920x1080.mp4')
join(os.path.join(root, 'portrait'), 1080, 1620, portrait)
if os.path.isdir(os.path.join(root, 'landscape')):
    join(os.path.join(root, 'landscape'), 1920, 1080, landscape)
else:
    blur = ('[0:v]split[a][b];[a]scale=1920:-2,crop=1920:1080,boxblur=28:3,eq=brightness=-0.10:saturation=1.1[bg];'
            '[b]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p')
    subprocess.run([F, '-y', '-i', portrait, '-filter_complex', blur, *common, landscape], check=True)
    print('Hazır:', landscape, '(dikeyden, bulanık dolgu)')
