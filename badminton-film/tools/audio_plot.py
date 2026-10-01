#!/usr/bin/env python3
"""把配乐/音效/配音画成频谱 + 响度曲线，对照时间轴检查结构与电平（无法直接试听时用图检查）。"""
import json, os, sys
import numpy as np, soundfile as sf
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from scipy import signal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(ROOT, 'build/timeline.json')))
files = sys.argv[1:] or ['audio/music.wav', 'audio/sfx.wav']

def rms_db(mono, sr, hop=0.1, win=0.5):
    c = np.concatenate([[0], np.cumsum(mono.astype(np.float64) ** 2)])
    W = int(win * sr); H = int(hop * sr); idx = np.arange(0, len(mono) - W, H)
    return idx / sr, 10 * np.log10((c[idx + W] - c[idx]) / W + 1e-12)

fig, ax = plt.subplots(len(files) + 1, 1, figsize=(24, 3 * (len(files) + 1)), sharex=True)
for a, fn in zip(ax, files):
    x, sr = sf.read(os.path.join(ROOT, fn)); mono = x.mean(1) if x.ndim > 1 else x
    d = mono[::8]
    f, t, Sx = signal.spectrogram(d, sr / 8, nperseg=1024, noverlap=512)
    a.imshow(10 * np.log10(Sx + 1e-14), origin='lower', aspect='auto', extent=[t[0], t[-1], f[0], f[-1]], vmin=-130, vmax=-50, cmap='magma')
    a.set_ylim(0, 3000); a.set_ylabel(os.path.basename(fn))
    tt, db = rms_db(mono, sr); ax[-1].plot(tt, db, label=os.path.basename(fn))
for sc in TL['scenes']:
    for a in ax: a.axvline(sc['start'], color='c', lw=0.7, alpha=0.7)
    ax[-1].text(sc['start'] + 0.3, -6, sc['id'], fontsize=9, rotation=90, va='top')
for ln in TL['lines']: ax[-1].axvspan(ln['start'], ln['end'], color='green', alpha=0.08)
ax[-1].set_ylim(-75, 0); ax[-1].legend(loc='lower left'); ax[-1].grid(alpha=0.3)
plt.tight_layout()
out = os.path.join(ROOT, 'out/stills/audio_overview.png'); plt.savefig(out, dpi=60); print(out)
