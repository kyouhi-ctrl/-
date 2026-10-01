#!/usr/bin/env python3
"""混音与母带：配音按时间轴摆放 → 人声处理 → 配乐/音效对人声自动闪避（ducking）→ 限幅 → 响度标准化（-16 LUFS）。
输出 audio/mix.wav（48 kHz / 24-bit）。没有配音时只混配乐与音效。"""
import json, os, sys
import numpy as np, soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d
import pyloudnorm as pyln

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
TL = json.load(open(os.path.join(ROOT, 'build/timeline.json'), encoding='utf-8'))
music, _ = sf.read(os.path.join(ROOT, 'audio/music.wav'), dtype='float32')
sfx, _ = sf.read(os.path.join(ROOT, 'audio/sfx.wav'), dtype='float32')
N = int((TL['duration'] + 0.5) * SR)
def fit(x):
    out = np.zeros((N, 2), np.float32); L = min(N, len(x)); out[:L] = x[:L]; return out
music, sfx = fit(music), fit(sfx)

# ---------- 配音 ----------
vo = np.zeros((N, 2), np.float32); has_vo = False
for ln in TL['lines']:
    p = os.path.join(ROOT, 'audio/vo', ln['id'] + '.wav')
    if not os.path.exists(p): continue
    x, sr = sf.read(p, dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    assert sr == SR, (p, sr)
    i = int(ln['start'] * SR); j = min(N, i + len(x))
    vo[i:j] += np.stack([x[:j - i], x[:j - i]], 1); has_vo = True

def biquad_peak(f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return np.array(b) / a[0], np.array(a) / a[0]

def env_follow(x, att=0.02, rel=0.4, blk=48):
    m = np.abs(x).max(1)
    m = m[: len(m) // blk * blk].reshape(-1, blk).max(1)
    out = np.zeros_like(m); e = 0.0
    ka, kr = np.exp(-blk / (att * SR)), np.exp(-blk / (rel * SR))
    for i, v in enumerate(m):
        e = ka * e + (1 - ka) * v if v > e else kr * e + (1 - kr) * v
        out[i] = e
    return np.interp(np.arange(len(x)), np.arange(len(out)) * blk, out).astype(np.float32)

if has_vo:
    b, a = signal.butter(2, 75 / (SR / 2), 'high'); vo = signal.lfilter(b, a, vo, axis=0).astype(np.float32)
    b, a = biquad_peak(3200, 2.0, 0.9); vo = signal.lfilter(b, a, vo, axis=0).astype(np.float32)
    b, a = biquad_peak(220, -1.5, 1.0); vo = signal.lfilter(b, a, vo, axis=0).astype(np.float32)
    # 轻压缩：把句子内部的动态收紧一点
    e = env_follow(vo, 0.005, 0.15)
    thr = 0.18; g = np.where(e > thr, (thr / np.maximum(e, 1e-6)) ** 0.45, 1.0)[:, None]
    vo = vo * g
    vo = vo / (np.abs(vo).max() + 1e-9) * 0.5
    # 人声闪避
    ve = env_follow(vo, 0.03, 0.55)
    duck = 1.0 - 0.62 * np.clip(ve / 0.08, 0, 1)
    duck_sfx = 1.0 - 0.35 * np.clip(ve / 0.08, 0, 1)
else:
    duck = duck_sfx = np.ones(N, np.float32)

mix = music * 0.95 * duck[:, None] + sfx * 0.30 * duck_sfx[:, None] + vo * 1.0

# ---------- 母带：响度标准化 + 前瞻限幅 ----------
meter = pyln.Meter(SR)
loud = meter.integrated_loudness(mix.astype(np.float64))
target = -16.0
mix *= 10 ** ((target - loud) / 20)

def limiter(x, ceil=10 ** (-1.2 / 20), look=0.005, rel=0.12):
    peak = np.abs(x).max(1)
    g = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))
    g = minimum_filter1d(g, int(look * SR) * 2 + 1)
    blk = 32; gb = g[: len(g) // blk * blk].reshape(-1, blk).min(1)
    out = np.empty_like(gb); s = 1.0; kr = np.exp(-blk / (rel * SR))
    for i, v in enumerate(gb):
        s = v if v < s else kr * s + (1 - kr) * v
        out[i] = s
    gg = np.interp(np.arange(len(x)), np.arange(len(out)) * blk + blk / 2, out)
    d = int(look * SR); y = np.zeros_like(x); y[:-d or None] = x[d:] if d else x
    return (x * gg[:, None]).astype(np.float32)

mix = limiter(mix)
loud2 = meter.integrated_loudness(mix.astype(np.float64))
fade = int(0.4 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
sf.write(os.path.join(ROOT, 'audio/mix.wav'), mix, SR, subtype='PCM_24')
print(f'VO={has_vo}  loudness before {loud:.1f} → after {loud2:.1f} LUFS, peak {20*np.log10(np.abs(mix).max()):.2f} dBFS')
