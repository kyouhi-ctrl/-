#!/usr/bin/env python3
"""试听样本客观分析：基频中位数（声音高低）、基频起伏（语调变化）、有声占比、语速（字/秒）。
用法：python3 tools/voice_probe.py audio/vo/sample_*.wav --chars 24"""
import argparse, os
import numpy as np, soundfile as sf

ap = argparse.ArgumentParser(); ap.add_argument('files', nargs='+'); ap.add_argument('--chars', type=int, default=0)
args = ap.parse_args()

def f0_track(x, sr, fmin=60, fmax=400, hop=0.01, win=0.04):
    H, W = int(hop * sr), int(win * sr)
    lo, hi = int(sr / fmax), int(sr / fmin)
    out = []
    for i in range(0, len(x) - W, H):
        fr = x[i:i + W] * np.hanning(W)
        if np.sqrt((fr ** 2).mean()) < 0.01: out.append(np.nan); continue
        ac = np.correlate(fr, fr, 'full')[W - 1:]
        ac /= ac[0] + 1e-9
        seg = ac[lo:hi]
        k = int(np.argmax(seg)); v = seg[k]
        out.append(sr / (lo + k) if v > 0.45 else np.nan)
    return np.array(out)

for fn in args.files:
    x, sr = sf.read(fn)
    if x.ndim > 1: x = x.mean(1)
    f0 = f0_track(x, sr)
    v = f0[~np.isnan(f0)]
    dur = len(x) / sr
    semis = 12 * np.log2(v / np.median(v)) if len(v) else np.array([0])
    rate = f'{args.chars / dur:.2f} 字/秒' if args.chars else ''
    print(f'{os.path.basename(fn):48s} 时长 {dur:5.2f}s  F0中位 {np.median(v) if len(v) else 0:6.1f} Hz  起伏 {np.std(semis):4.2f} 半音  有声 {len(v) / max(1, len(f0)):.0%}  {rate}')
