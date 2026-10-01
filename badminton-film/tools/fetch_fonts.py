#!/usr/bin/env python3
"""从 Google Fonts 下载影片用到的字体（SIL OFL 开源字体）到 assets/fonts/。"""
import os, re, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'fonts'); os.makedirs(OUT, exist_ok=True)
FAMS = {
    'Cinzel': 'Cinzel:wght@400;700;900', 'CormorantGaramond': 'Cormorant+Garamond:ital,wght@0,300;0,500;0,700;1,300;1,500',
    'MaShanZheng': 'Ma+Shan+Zheng', 'ZhiMangXing': 'Zhi+Mang+Xing', 'LiuJianMaoCao': 'Liu+Jian+Mao+Cao', 'LongCang': 'Long+Cang',
    'NotoSerifSC': 'Noto+Serif+SC:wght@200;300;500;700;900', 'ZCOOLXiaoWei': 'ZCOOL+XiaoWei', 'BebasNeue': 'Bebas+Neue',
    'Oswald': 'Oswald:wght@200;400;600', 'Inter': 'Inter:wght@200;400;600',
}
for name, q in FAMS.items():
    css = subprocess.run(['curl', '-s', '-A', 'curl/8.5', f'https://fonts.googleapis.com/css2?family={q}'], capture_output=True, text=True).stdout
    for style, w, url in re.findall(r'font-style:\s*(\w+);\s*font-weight:\s*(\d+);.*?src:\s*url\(([^)]+)\)', css, re.S):
        fn = os.path.join(OUT, f"{name}-{w}{'i' if style == 'italic' else ''}.ttf")
        if not os.path.exists(fn): subprocess.run(['curl', '-s', '-o', fn, url], check=True)
        print(os.path.basename(fn))
