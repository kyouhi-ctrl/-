#!/usr/bin/env python3
"""从视频中每隔 N 秒抽一帧，拼成带时间标记的总览图（检查节奏、转场与构图）。
用法：python3 tools/contact_sheet.py <video> <every_sec> <out_prefix> [cols] [rows]"""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

video, every, prefix = sys.argv[1], float(sys.argv[2]), sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
rows = int(sys.argv[5]) if len(sys.argv) > 5 else 6
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], capture_output=True, text=True).stdout)
tmp = tempfile.mkdtemp()
subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'fps=1/{every},crop=1920:804:0:138,scale=480:201', os.path.join(tmp, 'f%05d.png')], check=True)
frames = sorted(os.listdir(tmp))
font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 18)
per = cols * rows
for page in range((len(frames) + per - 1) // per):
    W = Image.new('RGB', (cols * 480, rows * 201), 'black'); d = ImageDraw.Draw(W)
    for k, fn in enumerate(frames[page * per:(page + 1) * per]):
        im = Image.open(os.path.join(tmp, fn)); x, y = (k % cols) * 480, (k // cols) * 201
        W.paste(im, (x, y)); t = (page * per + k) * every
        d.rectangle([x, y, x + 74, y + 22], fill='black'); d.text((x + 4, y + 1), f'{int(t // 60)}:{t % 60:04.1f}', fill='yellow', font=font)
    out = f'{prefix}_{page + 1}.png'; W.save(out); print(out)
