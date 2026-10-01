#!/usr/bin/env python3
"""《羽毛球发展史》配乐生成：按 build/timeline.json 的时间点作曲（多轨 MIDI → FluidSynth + MuseScore 音色），
再用 numpy 合成预告片式音效（冲击、Braam、呼啸、上升音、心跳、击球声……），最后做混响与母带处理。
输出：audio/music.wav（配乐）、audio/sfx.wav（音效）。"""
import json, os, subprocess, sys
import numpy as np
import mido
import soundfile as sf
from scipy import signal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
SF2 = '/usr/share/sounds/sf2/MuseScore_General_Full.sf2'
TL = json.load(open(os.path.join(ROOT, 'build', 'timeline.json'), encoding='utf-8'))
DUR = TL['duration'] + 6.0
N = int(DUR * SR)
SC = {s['id']: s for s in TL['scenes']}
WORK = os.path.join(ROOT, 'audio', 'work'); os.makedirs(WORK, exist_ok=True)

def S(id): return SC[id]['start']
def E(id): return SC[id]['end']
def cue(scene, line, w=0):
    c = SC[scene]['cues'][line]; return SC[scene]['start'] + c[w]

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def n(s):
    """'D4' → 62, 'Bb3' → 58, 'F#5' → 78"""
    name = s[0]; i = 1; acc = 0
    while i < len(s) and s[i] in '#b':
        acc += 1 if s[i] == '#' else -1; i += 1
    return 12 * (int(s[i:]) + 1) + NOTE[name] + acc

# ---------------------------------------------------------------- MIDI 序列
class Seq:
    def __init__(self, name):
        self.name = name; self.ev = []   # (time_sec, order, msg)
    def prog(self, ch, p, t=0.0): self.ev.append((t, 0, mido.Message('program_change', channel=ch, program=p)))
    def cc(self, ch, c, v, t): self.ev.append((t, 1, mido.Message('control_change', channel=ch, control=c, value=int(max(0, min(127, v))))))
    def ramp(self, ch, t0, t1, v0, v1, c=11, steps=None):
        steps = steps or max(2, int((t1 - t0) * 20))
        for i in range(steps + 1):
            k = i / steps; self.cc(ch, c, v0 + (v1 - v0) * k, t0 + (t1 - t0) * k)
    def note(self, ch, p, t, d, v=80):
        if isinstance(p, str): p = n(p)
        if t < 0: return
        self.ev.append((t, 2, mido.Message('note_on', channel=ch, note=int(p), velocity=int(max(1, min(127, v))))))
        self.ev.append((t + max(0.02, d), -1, mido.Message('note_off', channel=ch, note=int(p), velocity=0)))
    def chord(self, ch, ps, t, d, v=80):
        for p in ps: self.note(ch, p, t, d, v)
    def save(self, path):
        mid = mido.MidiFile(ticks_per_beat=960)
        tr = mido.MidiTrack(); mid.tracks.append(tr)
        tr.append(mido.MetaMessage('set_tempo', tempo=1000000, time=0))  # 1 拍 = 1 秒
        ev = sorted(self.ev, key=lambda e: (e[0], e[1]))
        last = 0
        for t, _, m in ev:
            tick = int(round(t * 960)); m = m.copy(time=max(0, tick - last)); last = max(last, tick); tr.append(m)
        mid.save(path)

def render_midi(seq, gain=0.8):
    mp = os.path.join(WORK, seq.name + '.mid'); wp = os.path.join(WORK, seq.name + '.wav')
    seq.save(mp)
    subprocess.run(['fluidsynth', '-ni', '-q', '-R', '0', '-C', '0', '-g', str(gain), '-r', str(SR), '-F', wp, SF2, mp], check=True)
    d, sr = sf.read(wp, dtype='float32')
    if d.ndim == 1: d = np.stack([d, d], 1)
    out = np.zeros((N, 2), np.float32); L = min(N, len(d)); out[:L] = d[:L]
    return out

# ---------------------------------------------------------------- 混响
def make_ir(sec=3.2, seed=1, damp=4000.0, pre=0.02):
    rng = np.random.default_rng(seed)
    L = int(sec * SR); t = np.arange(L) / SR
    ir = rng.standard_normal((L, 2)).astype(np.float32) * np.exp(-t * 6.9 / sec)[:, None]
    # 随时间变暗：分块低通
    out = np.zeros_like(ir); blk = 2048
    zi = np.zeros((2, 2))
    for i in range(0, L, blk):
        fc = max(600.0, damp * np.exp(-(i / SR) * 1.1))
        b, a = signal.butter(2, fc / (SR / 2))
        for c in range(2):
            out[i:i + blk, c], zi[:, c] = signal.lfilter(b, a, ir[i:i + blk, c], zi=zi[:, c])
    out = np.concatenate([np.zeros((int(pre * SR), 2), np.float32), out])
    return out / np.sqrt((out ** 2).sum() / 2)

IR_HALL = make_ir(3.6, 1, 5000)
IR_ROOM = make_ir(1.4, 2, 7000, 0.008)

def reverb(x, ir, wet):
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1).astype(np.float32)
    return x * (1 - wet * 0.35) + y * wet * 0.5

def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high'); return signal.lfilter(b, a, x, axis=0).astype(np.float32)
def lp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2)); return signal.lfilter(b, a, x, axis=0).astype(np.float32)

# ================================================================= 作曲
strings, brass, keys, world, perc = Seq('strings'), Seq('brass'), Seq('keys'), Seq('world'), Seq('perc')
# 通道约定
ST_ENS, ST_SLOW, ST_TREM, ST_PIZZ, ST_CELLO, ST_BASS, ST_VLN = range(7)
BR_HORN, BR_SECT, BR_TPT, BR_TBN, BR_TUBA, BR_CHOIR, BR_OOH = range(7)
K_PNO, K_CEL, K_HARP, K_GLOCK, K_HPSI, K_BELL, K_SBASS, K_PAD = range(8)
W_KOTO, W_SHAKU, W_SITAR, W_SHANAI, W_PAN = range(5)
P_TIMP, P_TAIKO, P_DRUM = 0, 1, 9
for ch, p in [(ST_ENS, 48), (ST_SLOW, 49), (ST_TREM, 44), (ST_PIZZ, 45), (ST_CELLO, 42), (ST_BASS, 43), (ST_VLN, 40)]: strings.prog(ch, p); strings.cc(ch, 7, 110, 0); strings.cc(ch, 11, 90, 0)
for ch, p in [(BR_HORN, 60), (BR_SECT, 61), (BR_TPT, 56), (BR_TBN, 57), (BR_TUBA, 58), (BR_CHOIR, 52), (BR_OOH, 53)]: brass.prog(ch, p); brass.cc(ch, 7, 105, 0); brass.cc(ch, 11, 90, 0)
for ch, p in [(K_PNO, 0), (K_CEL, 8), (K_HARP, 46), (K_GLOCK, 9), (K_HPSI, 6), (K_BELL, 14), (K_SBASS, 38), (K_PAD, 89)]: keys.prog(ch, p); keys.cc(ch, 7, 105, 0); keys.cc(ch, 11, 100, 0)
for ch, p in [(W_KOTO, 107), (W_SHAKU, 77), (W_SITAR, 104), (W_SHANAI, 111), (W_PAN, 75)]: world.prog(ch, p); world.cc(ch, 7, 105, 0); world.cc(ch, 11, 100, 0)
perc.prog(P_TIMP, 47); perc.prog(P_TAIKO, 116); perc.cc(P_TIMP, 7, 115, 0); perc.cc(P_TAIKO, 7, 110, 0)

def sustain_chord(seq, ch, notes, t, d, v=70):
    seq.chord(ch, [n(x) if isinstance(x, str) else x for x in notes], t, d, v)

def timp_roll(t0, t1, note='D2', v0=30, v1=100, hit=True):
    k = 0; t = t0
    while t < t1:
        f = (t - t0) / max(1e-3, t1 - t0)
        perc.note(P_TIMP, note, t, 0.06, v0 + (v1 - v0) * f); t += 0.065 + 0.0 * k; k += 1
    if hit: perc.note(P_TIMP, note, t1, 2.5, 120)

MAIN_THEME = [('D4', 1), ('A4', 1), ('G4', .5), ('F4', .5), ('E4', 1), ('F4', .5), ('G4', .5), ('A4', 1.5), ('D4', .5),
              ('Bb4', 1), ('A4', 1), ('G4', 1), ('F4', 1), ('E4', 1.5), ('F4', .5), ('D4', 2)]
def play_line(seq, ch, line, t0, beat, v=85, transpose=0, legato=1.02):
    t = t0
    for p, b in line:
        seq.note(ch, n(p) + transpose, t, b * beat * legato, v); t += b * beat
    return t

# ---------------- 1. 冷开场 ----------------
strike = cue('coldopen', 'v04b', 1) + 0.12
v1, v2, v3, v4a, v4b = [cue('coldopen', x) for x in ['v01', 'v02', 'v03', 'v04a', 'v04b']]
# 高处的弦乐泛音
strings.chord(ST_SLOW, [n('A5'), n('E6')], 0.6, v3 - 0.6, 40); strings.ramp(ST_SLOW, 0.6, 4.0, 0, 55); strings.ramp(ST_SLOW, v3 - 2.0, v3, 55, 0)
# 钢琴动机 D–A–F–E（空灵、带延音）
keys.cc(K_PNO, 64, 127, v1 - 0.6)
motif = [['D5', 'A4', 'F5', 'E5'], ['D5', 'A4', 'F5', 'G5'], ['D5', 'A4', 'A5', 'G5'], ['F5', 'E5', 'D5', 'A4']]
t = v1 - 0.5
for bar in motif:
    for i, p in enumerate(bar):
        keys.note(K_PNO, p, t, 1.6, 52 if i == 0 else 42)
        if i % 2 == 0: keys.note(K_CEL, n(p) + 12, t, 0.8, 30)
        t += 0.92
    if t > v3 - 0.4: break
keys.cc(K_PNO, 64, 0, v3 + 1.0)
# v03：弦乐温暖地涌起（Dm – Bb – F – C）
prog_v3 = [['D3', 'F3', 'A3', 'D4'], ['Bb2', 'D3', 'F3', 'Bb3'], ['F2', 'A2', 'C3', 'F3'], ['C3', 'E3', 'G3', 'C4']]
seglen = (v4a - 0.2 - v3) / 4
for i, ch_ in enumerate(prog_v3):
    strings.chord(ST_ENS, [n(x) for x in ch_], v3 + i * seglen, seglen * 1.02, 72)
    strings.note(ST_BASS, n(ch_[0]) - 12, v3 + i * seglen, seglen * 1.02, 70)
strings.ramp(ST_ENS, v3, v4a - 0.6, 35, 105); strings.ramp(ST_ENS, v4a - 0.6, v4a, 105, 0)
strings.ramp(ST_BASS, v3, v4a - 0.6, 40, 100); strings.ramp(ST_BASS, v4a - 0.6, v4a, 100, 0)
for i, p in enumerate(['A4', 'Bb4', 'A4', 'G4']):
    brass.note(BR_HORN, p, v3 + (i + 0.5) * seglen, seglen * 0.95, 62)
brass.ramp(BR_HORN, v3, v4a - 0.5, 50, 95); brass.ramp(BR_HORN, v4a - 0.5, v4a, 95, 0)
# v04b：颤音弦乐的不协和音簇 + 定音鼓滚奏，蓄力直到击球
strings.chord(ST_TREM, [n('D3'), n('Eb3'), n('A3'), n('D4')], v4b - 0.3, strike - (v4b - 0.3) - 0.03, 90)
strings.ramp(ST_TREM, v4b - 0.3, strike - 0.05, 10, 127)
timp_roll(strike - 2.2, strike - 0.04, 'D2', 25, 115, hit=False)
for c in range(16): strings.cc(c, 11, 90, strike + 0.5)

# ---------------- 2. 片名 ----------------
t0 = S('title')
brass.chord(BR_CHOIR, [n('D3'), n('A3'), n('D4'), n('F4')], t0 + 0.9, 8.0, 70); brass.ramp(BR_CHOIR, t0 + 0.9, t0 + 4.0, 0, 95); brass.ramp(BR_CHOIR, t0 + 6.5, t0 + 9.0, 95, 0)
strings.chord(ST_BASS, [n('D2')], t0 + 0.5, 9.0, 80); strings.ramp(ST_BASS, t0 + 0.5, t0 + 3.0, 0, 95); strings.ramp(ST_BASS, t0 + 7.0, t0 + 9.3, 95, 0)
strings.chord(ST_SLOW, [n('A2'), n('D3')], t0 + 1.0, 8.5, 70); strings.ramp(ST_SLOW, t0 + 1.0, t0 + 3.5, 0, 90); strings.ramp(ST_SLOW, t0 + 6.8, t0 + 9.2, 90, 0)
brass.ramp(BR_HORN, t0, t0 + 0.1, 90, 90)
play_line(brass, BR_HORN, [('D4', 1), ('A4', 1.2), ('G4', .5), ('F4', .5), ('E4', 1.0), ('D4', 2.6)], t0 + 2.6, 0.9, 78)
timp_roll(t0 + 1.6, t0 + 3.0, 'D2', 20, 90, hit=True)
for i, p in enumerate(['D6', 'F6', 'A6', 'D7', 'A6', 'F6']): keys.note(K_GLOCK, p, t0 + 4.3 + i * 0.22, 1.2, 40 - i * 3)

# ---------------- 3. 起源（中国）----------------
t0 = S('origins'); e0 = E('origins')
pent = ['D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'F5', 'G5', 'A5']
strings.chord(ST_SLOW, [n('D3'), n('A3')], t0 + 0.3, e0 - t0 + 0.6, 60); strings.ramp(ST_SLOW, t0 + 0.3, t0 + 2.5, 0, 70); strings.ramp(ST_SLOW, e0 - 1.2, e0 + 0.6, 70, 0)
rng = np.random.default_rng(7)
t = t0 + 0.8; idx = 0
pattern = [0, 2, 3, 5, 3, 2, 4, 3, 1, 3, 5, 6, 5, 3, 2, 0]
while t < e0 - 0.8:
    p = pent[pattern[idx % len(pattern)]]
    world.note(W_KOTO, p, t, 1.4, 58 + int(rng.integers(-8, 8)))
    if idx % 4 == 0: world.note(W_KOTO, n(p) - 12, t, 1.6, 50)
    t += 0.36 if idx % 8 != 7 else 0.72; idx += 1
world.ramp(W_KOTO, e0 - 1.4, e0, 100, 0)
play_line(world, W_SHAKU, [('A4', 2.2), ('C5', 0.8), ('D5', 2.4), ('C5', 0.6), ('A4', 0.6), ('G4', 2.6), ('A4', 1.5)], t0 + 2.0, 1.0, 72)
world.ramp(W_SHAKU, t0 + 2.0, t0 + 3.0, 50, 100)
keys.note(K_BELL, 'D4', t0 + 0.6, 4.0, 45); keys.note(K_BELL, 'A3', t0 + 6.9, 4.0, 40)

# ---------------- 4. 欧洲（巴洛克）----------------
t0 = S('europe') + 0.9; e0 = E('europe')
fig = {'Dm': ['D4', 'F4', 'A4', 'F4', 'D5', 'A4', 'F4', 'A4'], 'Gm': ['D4', 'G4', 'Bb4', 'G4', 'D5', 'Bb4', 'G4', 'Bb4'],
       'A7': ['C#4', 'E4', 'G4', 'E4', 'A4', 'G4', 'E4', 'G4'], 'F': ['C4', 'F4', 'A4', 'F4', 'C5', 'A4', 'F4', 'A4'], 'C': ['C4', 'E4', 'G4', 'E4', 'C5', 'G4', 'E4', 'G4']}
basses = {'Dm': 'D3', 'Gm': 'G2', 'A7': 'A2', 'F': 'F2', 'C': 'C3'}
order = ['Dm', 'Gm', 'A7', 'Dm', 'F', 'C', 'Gm', 'A7', 'Dm', 'Dm']
step = 0.155; t = t0
for c_ in order:
    for i, p in enumerate(fig[c_]):
        if t > e0 - 0.4: break
        keys.note(K_HPSI, p, t, step * 0.95, 70 if i % 4 == 0 else 58); t += step
    strings.note(ST_PIZZ, basses[c_], t - step * 8, 0.3, 80); strings.note(ST_PIZZ, n(basses[c_]) + 12, t - step * 4, 0.3, 65)
keys.ramp(K_HPSI, e0 - 1.0, e0, 100, 0, c=11)
strings.chord(ST_ENS, [n('D4'), n('F4'), n('A4')], t0, e0 - t0, 45); strings.ramp(ST_ENS, t0, t0 + 1.5, 0, 55); strings.ramp(ST_ENS, e0 - 1.2, e0, 55, 0)
for c in [ST_ENS]: strings.cc(c, 11, 90, e0 + 0.3)

# ---------------- 5. 浦那（印度）----------------
t0 = S('poona'); e0 = E('poona'); v7 = cue('poona', 'v07'); v7e = cue('poona', 'v07', 1); v8 = cue('poona', 'v08')
strings.chord(ST_SLOW, [n('D2'), n('A2'), n('D3')], t0 + 0.2, e0 - t0 + 0.5, 70); strings.ramp(ST_SLOW, t0 + 0.2, t0 + 2.0, 0, 85); strings.ramp(ST_SLOW, e0 - 1.0, e0 + 0.5, 85, 0)
phr = [('A4', .5), ('Bb4', .5), ('A4', .5), ('G4', .5), ('F#4', 1), ('G4', .5), ('A4', 1.5), ('D5', .5), ('C5', .5), ('Bb4', .5), ('A4', 2)]
play_line(world, W_SITAR, phr, t0 + 1.2, 0.62, 80)
play_line(world, W_SHANAI, [('D5', 1.2), ('Eb5', .4), ('D5', .4), ('C5', .8), ('Bb4', .6), ('A4', 2.4)], v8 - 0.6, 0.8, 66)
world.ramp(W_SHANAI, v8 - 0.6, v8 + 0.6, 40, 95)
for i in range(22): keys.note(K_HARP, n(['D4', 'E4', 'F#4', 'G4', 'A4', 'Bb4', 'C5'][i % 7]) + 12 * (i // 7), v7 + 1.2 + i * ((v7e - v7 - 1.2) / 22), 1.4, 52)
strings.chord(ST_ENS, [n('D3'), n('F#3'), n('A3'), n('D4')], v8 - 0.4, e0 - v8 + 0.6, 70); strings.ramp(ST_ENS, v8 - 0.4, v8 + 1.5, 0, 90); strings.ramp(ST_ENS, e0 - 1.0, e0 + 0.2, 90, 0)
for c in [ST_ENS]: strings.cc(c, 11, 90, e0 + 0.5)

# ---------------- 6. 庄园（1873 夜）----------------
t0 = S('manor'); e0 = E('manor'); v9 = cue('manor', 'v09'); v10 = cue('manor', 'v10'); v10e = cue('manor', 'v10', 1)
wl = 0.62  # 华尔兹每拍
prog_w = [('F2', ['A3', 'C4', 'F4']), ('D2', ['A3', 'D4', 'F4']), ('Bb1', ['Bb3', 'D4', 'F4']), ('C2', ['G3', 'C4', 'E4'])]
t = t0 + 1.4; i = 0
while t < v10 - 0.3:
    b, up = prog_w[(i // 2) % 4]
    keys.note(K_HARP, b, t, wl * 2.8, 62)
    keys.chord(K_HARP, [n(x) for x in up], t + wl, wl * 0.9, 44); keys.chord(K_HARP, [n(x) for x in up], t + 2 * wl, wl * 0.9, 40)
    if i % 2 == 0: keys.note(K_CEL, n(up[-1]) + 12, t + wl, wl * 2, 34)
    t += 3 * wl; i += 1
strings.chord(ST_SLOW, [n('F3'), n('A3'), n('C4')], t0 + 1.4, v10 - t0 - 1.0, 50); strings.ramp(ST_SLOW, t0 + 1.4, t0 + 4.0, 0, 70)
strings.ramp(ST_SLOW, v10 - 1.2, v10 + 0.2, 70, 0)
# 揭晓 BADMINTON：全奏涌起（F 大调）
sw0 = v10 - 0.2
strings.chord(ST_ENS, [n('F2'), n('C3'), n('F3'), n('A3'), n('C4'), n('F4')], sw0, e0 - sw0 + 0.4, 85); strings.ramp(ST_ENS, sw0, v10e, 20, 118); strings.ramp(ST_ENS, e0 - 1.6, e0 + 0.3, 118, 0)
strings.note(ST_BASS, 'F1', sw0, e0 - sw0 + 0.3, 90); strings.ramp(ST_BASS, sw0, v10e, 30, 110); strings.ramp(ST_BASS, e0 - 1.6, e0, 110, 0)
brass.chord(BR_CHOIR, [n('F3'), n('A3'), n('C4'), n('F4')], sw0 + 0.6, e0 - sw0, 80); brass.ramp(BR_CHOIR, sw0 + 0.6, v10e + 0.3, 0, 105); brass.ramp(BR_CHOIR, e0 - 1.6, e0, 105, 0)
play_line(brass, BR_HORN, [('C4', 1), ('F4', 1.5), ('E4', .5), ('F4', 1), ('A4', 2)], sw0 + 1.0, 0.85, 80)
for i, p in enumerate(['F5', 'A5', 'C6', 'F6', 'A6', 'C7']): keys.note(K_GLOCK, p, v10e - 0.4 + i * 0.16, 1.5, 48)
for c in range(7): strings.cc(c, 11, 90, e0 + 0.6); brass.cc(c, 11, 90, e0 + 0.6)

# ---------------- 7. 规则（1877/1893/1899）+ 8. 走向世界 ----------------
t0 = S('rules'); r11a = cue('rules', 'v11a'); r11b = cue('rules', 'v11b'); r12a = cue('rules', 'v12a'); r12b = cue('rules', 'v12b')
tSwitch = r12a - 0.5
seal = r11b + 0.9
# 拨弦固定音型（书写）
pz = ['D3', 'A3', 'F3', 'A3', 'D4', 'A3', 'F3', 'A3']
t = t0 + 0.6; i = 0
while t < tSwitch - 0.1:
    strings.note(ST_PIZZ, pz[i % 8], t, 0.25, 70 if i % 4 == 0 else 55); t += 0.25; i += 1
strings.chord(ST_CELLO, [n('D3')], t0 + 0.6, tSwitch - t0 - 0.6, 60); strings.ramp(ST_CELLO, t0 + 0.6, seal, 40, 90)
brass.chord(BR_SECT, [n('D3'), n('A3'), n('D4')], seal, 1.2, 105); perc.note(P_TIMP, 'D2', seal, 2.0, 120)
# 1899：球场 —— 强拍 + 弦乐十六分音符驱动
perc.note(P_TIMP, 'D2', tSwitch, 2.5, 125); perc.note(P_TIMP, 'A1', tSwitch, 2.5, 110)
brass.chord(BR_SECT, [n('D2'), n('A2'), n('D3'), n('F3')], tSwitch, 1.6, 110)
w0 = S('world'); wE = E('world')
c13 = cue('world', 'v13'); c14a = cue('world', 'v14a'); c14b = cue('world', 'v14b'); c15 = cue('world', 'v15')
ost = {'Dm': ['D4', 'A3', 'F4', 'A3'], 'Bb': ['D4', 'Bb3', 'F4', 'Bb3'], 'F': ['C4', 'A3', 'F4', 'A3'], 'C': ['E4', 'C4', 'G4', 'C4'], 'Gm': ['D4', 'Bb3', 'G4', 'Bb3'], 'A': ['E4', 'C#4', 'A4', 'C#4']}
bass_of = {'Dm': 'D2', 'Bb': 'Bb1', 'F': 'F2', 'C': 'C2', 'Gm': 'G1', 'A': 'A1'}
plan = ['Dm', 'Dm', 'Bb', 'Bb', 'F', 'F', 'C', 'C'] * 3 + ['Gm', 'Gm', 'A', 'A'] + ['Bb', 'Bb', 'F', 'F', 'C', 'C', 'Dm', 'Dm'] * 3
step = 0.125; t = tSwitch + 0.25; bar = 0
end_ost = cue('china', 'v16a') - 0.6
while t < end_ost:
    c_ = plan[bar % len(plan)]
    for k in range(16):
        tt = t + k * step
        if tt >= end_ost: break
        strings.note(ST_VLN, ost[c_][k % 4], tt, step * 0.9, 74 if k % 4 == 0 else 58)
    strings.note(ST_CELLO, bass_of[c_], t, 2.0, 80); strings.note(ST_BASS, bass_of[c_], t, 2.0, 82)
    t += 16 * step; bar += 1
strings.ramp(ST_VLN, tSwitch + 0.25, c13, 50, 90); strings.ramp(ST_VLN, c13, c15 + 3.0, 90, 120); strings.ramp(ST_VLN, end_ost - 1.0, end_ost, 120, 60)
strings.ramp(ST_CELLO, tSwitch, c13, 50, 90); strings.ramp(ST_BASS, tSwitch, c13, 50, 100)
# 圆号主题（1934 → 世界）
play_line(brass, BR_HORN, MAIN_THEME, c13 + 0.4, 0.5, 92)
brass.ramp(BR_HORN, c13, c13 + 1.0, 60, 105)
play_line(brass, BR_TPT, MAIN_THEME[:8], c15 + 0.8, 0.5, 96, transpose=12)
brass.chord(BR_CHOIR, [n('D3'), n('F3'), n('A3'), n('D4')], c15 + 0.6, wE - c15 - 0.2, 85); brass.ramp(BR_CHOIR, c15 + 0.6, c15 + 3.5, 0, 110); brass.ramp(BR_CHOIR, wE - 1.2, wE, 110, 0)
for tt in [c14a + 0.6, c14b + 0.8]:
    brass.chord(BR_SECT, [n('D3'), n('A3'), n('D4'), n('F#4')], tt, 1.4, 112); perc.note(P_TIMP, 'D2', tt, 2.0, 122)
timp_roll(c15 - 1.2, c15 + 0.6, 'A1', 25, 110)

# ---------------- 9. 中国（凯旋）----------------
t0 = S('china'); e0 = E('china'); a16 = cue('china', 'v16a'); b16 = cue('china', 'v16b')
for tt, chd in [(a16 - 0.2, ['D3', 'A3', 'D4', 'F#4', 'A4']), (b16 - 0.2, ['G3', 'B3', 'D4', 'G4', 'B4'])]:
    brass.chord(BR_SECT, [n(x) for x in chd], tt, 3.4, 100); perc.note(P_TIMP, 'D2', tt, 2.5, 125)
play_line(brass, BR_TPT, [('D5', .33), ('D5', .33), ('D5', .34), ('A5', 1.5), ('F#5', .5), ('G5', .5), ('A5', 2.0)], a16 + 0.4, 0.75, 100)
play_line(brass, BR_TPT, [('B4', .5), ('D5', .5), ('G5', 1.5), ('F#5', .5), ('E5', .5), ('D5', 2.0)], b16 + 0.4, 0.7, 98)
strings.chord(ST_ENS, [n('D3'), n('F#3'), n('A3'), n('D4'), n('F#4')], t0 + 0.4, b16 - t0 - 0.4, 80); strings.ramp(ST_ENS, t0 + 0.4, a16 + 1.0, 30, 110)
strings.chord(ST_ENS, [n('G2'), n('D3'), n('G3'), n('B3'), n('D4')], b16 - 0.2, e0 - b16 + 0.4, 85); strings.ramp(ST_ENS, e0 - 1.0, e0 + 0.2, 110, 0)
brass.chord(BR_CHOIR, [n('D3'), n('F#3'), n('A3'), n('D4')], a16, e0 - a16, 80); brass.ramp(BR_CHOIR, a16, a16 + 2.0, 20, 100); brass.ramp(BR_CHOIR, e0 - 1.0, e0, 100, 0)
for c in range(7): strings.cc(c, 11, 90, e0 + 0.6); brass.cc(c, 11, 90, e0 + 0.6)

# ---------------- 10. 奥运 ----------------
t0 = S('olympics'); e0 = E('olympics')
o17 = cue('olympics', 'v17'); o18 = cue('olympics', 'v18'); o19a = cue('olympics', 'v19a'); o19b = cue('olympics', 'v19b')
s1, s2, s3 = o18 - 0.4, o19a - 0.4, o19b - 0.2
# 1992：太鼓与弦乐节奏
step = 0.25; t = t0 + 0.8; i = 0
while t < s1 - 0.2:
    if i % 4 == 0: perc.note(P_TAIKO, 'D2', t, 0.4, 110)
    elif i % 4 == 2: perc.note(P_TAIKO, 'A2', t, 0.3, 80)
    if i % 8 == 7: perc.note(P_TAIKO, 'D2', t + 0.125, 0.2, 90)
    strings.note(ST_VLN, ['D4', 'D4', 'A4', 'D4', 'F4', 'D4', 'E4', 'C4'][i % 8], t, 0.22, 70); t += step; i += 1
strings.chord(ST_ENS, [n('D3'), n('A3'), n('D4')], t0 + 0.8, s1 - t0 - 0.8, 75); strings.ramp(ST_ENS, t0 + 0.8, s1, 40, 100); strings.cc(ST_ENS, 11, 90, s1 + 0.1)
# 1996：深情的圆号独奏
keys.cc(K_PNO, 64, 127, s1)
for i, chd in enumerate([['D3', 'A3', 'F4'], ['Bb2', 'F3', 'D4'], ['F2', 'C3', 'A3'], ['C3', 'G3', 'E4']]):
    keys.chord(K_PNO, [n(x) for x in chd], s1 + 0.2 + i * (s2 - s1) / 4, (s2 - s1) / 4, 55)
keys.cc(K_PNO, 64, 0, s2 - 0.05)
play_line(brass, BR_HORN, [('A4', 1.5), ('G4', .5), ('F4', 1), ('E4', 1), ('F4', 1.5), ('D4', 2.5)], s1 + 0.6, 0.85, 86)
strings.chord(ST_SLOW, [n('D3'), n('F3'), n('A3')], s1, s2 - s1, 60); strings.ramp(ST_SLOW, s1, s1 + 2.0, 0, 85); strings.ramp(ST_SLOW, s2 - 0.6, s2, 85, 0)
# 2012：五枚金牌依次点亮（钟声）+ 全奏
for i in range(5): keys.note(K_BELL, ['D5', 'F#5', 'A5', 'D6', 'F#6'][i], s2 + 0.6 + i * 0.45, 3.0, 85)
strings.chord(ST_ENS, [n('D3'), n('F#3'), n('A3'), n('D4')], s2, s3 - s2 + 0.2, 85); strings.ramp(ST_ENS, s2, s3, 40, 115)
brass.chord(BR_SECT, [n('D3'), n('A3'), n('D4'), n('F#4')], s2 + 0.6 + 4 * 0.45, 1.6, 105)
# 林丹：主题以 D 大调凯旋再现
maj = [(p.replace('F4', 'F#4').replace('F5', 'F#5').replace('Bb4', 'B4'), b) for p, b in MAIN_THEME]
play_line(brass, BR_HORN, maj, s3 + 0.2, 0.42, 96)
play_line(brass, BR_TPT, maj[:9], s3 + 0.2, 0.42, 90, transpose=12)
brass.chord(BR_CHOIR, [n('D3'), n('F#3'), n('A3'), n('D4')], s3, e0 - s3, 90); brass.ramp(BR_CHOIR, s3, s3 + 2.0, 30, 115); brass.ramp(BR_CHOIR, e0 - 0.8, e0, 115, 0)
strings.chord(ST_ENS, [n('D2'), n('A2'), n('D3'), n('F#3'), n('A3'), n('D4')], s3, e0 - s3, 90); strings.ramp(ST_ENS, s3, s3 + 1.5, 60, 120); strings.ramp(ST_ENS, e0 - 0.8, e0, 120, 0)
timp_roll(s3 - 1.0, s3, 'D2', 30, 110)
for c in range(7): strings.cc(c, 11, 90, e0 + 0.6); brass.cc(c, 11, 90, e0 + 0.6)

# ---------------- 11. 速度 ----------------
t0 = S('speed'); e0 = E('speed'); c20 = cue('speed', 'v20'); c21a = cue('speed', 'v21a'); c21b = cue('speed', 'v21b')
tCut = c21a - 0.3; sstrike = c21b - 0.35
step = 0.25; t = t0 + 0.4; i = 0
while t < tCut - 0.1:
    keys.note(K_SBASS, ['D2', 'D2', 'D3', 'D2', 'F2', 'D2', 'C3', 'A2'][i % 8], t, 0.2, 90)
    t += step; i += 1
keys.chord(K_PAD, [n('D3'), n('A3'), n('F4')], t0 + 0.4, tCut - t0 - 0.4, 70); keys.ramp(K_PAD, t0 + 0.4, tCut - 0.3, 40, 100, c=11); keys.cc(K_PAD, 11, 0, tCut)
# 击球后的混合预告片节奏
step = 0.25; t = sstrike + 0.6; i = 0
while t < e0 - 1.0:
    if i % 8 in (0, 3, 6): perc.note(P_TAIKO, 'D2', t, 0.4, 118)
    if i % 2 == 1: perc.note(P_DRUM, 42, t, 0.1, 60)
    if i % 8 == 4: perc.note(P_DRUM, 38, t, 0.2, 100)
    keys.note(K_SBASS, 'D2', t, 0.22, 100 if i % 4 == 0 else 80)
    t += step; i += 1
strings.chord(ST_TREM, [n('D3'), n('A3'), n('D4'), n('F4')], sstrike + 0.4, e0 - sstrike - 1.0, 100); strings.ramp(ST_TREM, sstrike + 0.4, e0 - 1.2, 70, 120); strings.ramp(ST_TREM, e0 - 1.2, e0 - 0.6, 120, 0)
brass.chord(BR_SECT, [n('D2'), n('A2'), n('D3'), n('F3')], c21b + 1.6, 2.4, 110)
for c in range(16): strings.cc(c, 11, 90, e0 + 0.5)

# ---------------- 12. 尾声 + 13. 片尾 ----------------
t0 = S('finale'); e0 = E('finale'); f22 = cue('finale', 'v22'); f22e = cue('finale', 'v22', 1); f23 = cue('finale', 'v23'); f23e = cue('finale', 'v23', 1); f24 = cue('finale', 'v24'); f24e = cue('finale', 'v24', 1)
m0 = f22 - 0.25; mLen = max(0.45, (f22e + 0.25 - m0) / 8); mEnd = m0 + mLen * 8
# 蒙太奇：主题快速全奏，每个剪辑点一个重拍
play_line(brass, BR_HORN, MAIN_THEME[:10], m0, mLen / 1.0, 100)
play_line(brass, BR_TPT, MAIN_THEME[:10], m0, mLen / 1.0, 95, transpose=12)
for i in range(8):
    tt = m0 + i * mLen
    perc.note(P_TAIKO, 'D2', tt, 0.5, 120); perc.note(P_TIMP, 'D2', tt, 0.8, 100)
    chd = [['D3', 'A3', 'D4', 'F4'], ['Bb2', 'F3', 'Bb3', 'D4'], ['F2', 'C3', 'F3', 'A3'], ['C3', 'G3', 'C4', 'E4']][i % 4]
    strings.chord(ST_ENS, [n(x) for x in chd], tt, mLen * 1.02, 100)
    strings.note(ST_BASS, n(chd[0]) - 12, tt, mLen * 1.02, 100)
brass.chord(BR_CHOIR, [n('D3'), n('A3'), n('D4'), n('F4')], m0, mEnd - m0, 100)
for c in [ST_ENS, ST_BASS]: strings.ramp(c, mEnd - 0.3, mEnd + 0.1, 110, 0)
brass.ramp(BR_CHOIR, mEnd - 0.3, mEnd + 0.1, 110, 0)
for c in [ST_ENS, ST_BASS]: strings.cc(c, 11, 90, mEnd + 0.5)
brass.cc(BR_CHOIR, 11, 90, mEnd + 0.5)
# 回到光中：钢琴动机 + 柔和弦乐
keys.cc(K_PNO, 64, 127, mEnd)
t = mEnd + 0.4
for bar in [['D5', 'A4', 'F5', 'E5'], ['D5', 'A4', 'F5', 'G5'], ['Bb4', 'F4', 'D5', 'C5'], ['A4', 'E4', 'C5', 'Bb4']]:
    for i, p in enumerate(bar):
        if t > f24 - 0.4: break
        keys.note(K_PNO, p, t, 1.6, 55 if i == 0 else 44); t += 0.95
keys.cc(K_PNO, 64, 0, f24 - 0.2)
prog_f = [['D3', 'F3', 'A3'], ['Bb2', 'D3', 'F3'], ['F2', 'A2', 'C3', 'F3'], ['C3', 'E3', 'G3'], ['G2', 'Bb2', 'D3'], ['A2', 'C#3', 'E3']]
seglen = (f24 - 0.25 - mEnd) / len(prog_f)
for i, c_ in enumerate(prog_f): strings.chord(ST_SLOW, [n(x) for x in c_], mEnd + i * seglen, seglen * 1.02, 75)
strings.ramp(ST_SLOW, mEnd, f23 + 2.0, 20, 95); strings.ramp(ST_SLOW, f24 - 1.0, f24 - 0.2, 100, 0)
# “别让它落地。”——全部静止，只剩一个极高的泛音
strings.note(ST_VLN, 'A6', f24 - 0.15, (f24e + 0.3) - f24 + 0.15 + 2.5, 50); strings.ramp(ST_VLN, f24 - 0.15, f24 + 0.6, 0, 70); strings.ramp(ST_VLN, f24e + 0.3, f24e + 2.8, 70, 0)
# 片尾：动机落在 D 大三和弦（皮卡第三度）
ec = S('endcard')
keys.cc(K_PNO, 64, 127, ec + 0.6)
t = ec + 0.8
for i, p in enumerate(['D5', 'A4', 'F#5', 'E5', 'D5']): keys.note(K_PNO, p, t, 2.5, 50); t += 1.0
keys.chord(K_PNO, [n('D3'), n('A3'), n('D4'), n('F#4'), n('A4')], t + 0.2, 6.0, 52)
keys.cc(K_PNO, 64, 0, ec + 10.5)
strings.chord(ST_SLOW, [n('D3'), n('F#3'), n('A3'), n('D4')], ec + 0.6, 8.5, 70); strings.ramp(ST_SLOW, ec + 0.6, ec + 3.0, 0, 80); strings.ramp(ST_SLOW, ec + 6.0, ec + 9.3, 80, 0)

# ================================================================= 音效合成
sfx = np.zeros((N, 2), np.float32)
rng = np.random.default_rng(3)
def put(x, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i + len(x) <= 0: return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l * 1.414, x * r * 1.414], 1)
    a = max(0, i); b = min(N, i + len(x)); sfx[a:b] += x[a - i:b - i] * gain
def tt(sec): return np.arange(int(sec * SR)) / SR
def env_adsr(L, a, d, s=0.0, sustain=0.0):
    t = np.arange(L) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4))
    return e.astype(np.float32)
def noise(sec): return rng.standard_normal(int(sec * SR)).astype(np.float32)
def bandpass(x, f0, f1, order=2):
    b, a = signal.butter(order, [f0 / (SR / 2), min(0.99, f1 / (SR / 2))], 'band'); return signal.lfilter(b, a, x).astype(np.float32)

def tvf(y, fc_of, kind='low', blk=256, bw=(0.6, 1.6)):
    """时变滤波：分块更新系数，但滤波器状态在块之间延续，避免咔哒声。"""
    out = np.zeros_like(y); zi = None
    for i in range(0, len(y), blk):
        fc = float(fc_of(i))
        if kind == 'low':
            b, a = signal.butter(2, min(0.95, max(20.0, fc) / (SR / 2)))
        else:
            lo = max(30.0, fc * bw[0]); hi = min(SR / 2 * 0.95, max(lo * 1.2, fc * bw[1]))
            b, a = signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band')
        if zi is None or len(zi) != max(len(a), len(b)) - 1: zi = np.zeros(max(len(a), len(b)) - 1)
        out[i:i + blk], zi = signal.lfilter(b, a, y[i:i + blk], zi=zi)
    return out.astype(np.float32)

def impact(t, size=1.0):
    L = 3.5; x = tt(L)
    f = 58 * np.exp(-x * 1.6) + 26
    ph = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(ph) * np.exp(-x * 1.5) * 0.9
    crack = bandpass(noise(L), 1500, 9000) * np.exp(-x * 30) * 0.7
    body = lp(noise(L)[:, None], 400)[:, 0] * np.exp(-x * 6) * 1.6
    y = np.tanh((sub + crack + body) * 1.6) * size
    put(y.astype(np.float32), t, 0.9)
    tail = reverb(np.stack([y, y], 1).astype(np.float32), IR_HALL, 1.0) * 0.5
    put(tail, t, 0.6)

def braam(t, dur=3.5, root=36.71, gain=0.6):
    x = tt(dur); y = np.zeros_like(x)
    for mult, det in [(1, 0), (1, 0.12), (2, -0.08), (1.5, 0.05), (0.5, 0)]:
        ph = 2 * np.pi * np.cumsum(np.full_like(x, root * mult * (1 + det * 0.01))) / SR
        y += signal.sawtooth(ph) * (0.5 if mult == 0.5 else 0.3)
    cut = 200 + 2600 * np.exp(-x * 1.2) * np.minimum(1, x / 0.05)
    out = tvf(y.astype(np.float32), lambda i: cut[i], 'low')
    out = np.tanh(out * 2.2) * np.minimum(1, x / 0.03) * np.exp(-x * (1.6 / dur))
    st = np.stack([out, np.roll(out, 160)], 1).astype(np.float32)
    put(reverb(st, IR_HALL, 0.6), t, gain)

def whoosh(t, dur=0.9, up=True, gain=0.5, pan=0.0):
    x = tt(dur); y = noise(dur)
    f = np.linspace(400, 5000, len(x)) if up else np.linspace(5000, 300, len(x))
    out = tvf(y, lambda i: f[i], 'band')
    e = np.sin(np.pi * np.clip(x / dur, 0, 1)) ** 1.5
    put((out * e).astype(np.float32), t, gain, pan)

def riser(t0, t1, gain=0.5):
    d = t1 - t0; x = tt(d)
    y = bandpass(noise(d), 300, 9000) * (x / d) ** 2.2 * 0.6
    f = 150 * (2 ** (x / d * 3.5))
    y += signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * (x / d) ** 3 * 0.25
    y += np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * (x / d) ** 3 * 0.15
    put(np.stack([y, np.roll(y, 300)], 1).astype(np.float32), t0, gain)

def reverse_swell(t_end, dur=2.0, gain=0.5):
    x = tt(dur); y = bandpass(noise(dur), 2000, 12000) * np.exp(-x * 3)
    st = reverb(np.stack([y, y], 1).astype(np.float32), IR_HALL, 1.0)[::-1]
    put(st[-int(dur * SR):], t_end - dur, gain)

def heartbeat(t, gain=0.8):
    for k, a in [(0, 1.0), (0.24, 0.7)]:
        x = tt(0.35); y = np.sin(2 * np.pi * (52 + 30 * np.exp(-x * 30)) * x) * np.exp(-x * 14) * a
        put(y.astype(np.float32), t + k, gain)

def tick(t, gain=0.25, f=2600, pan=0.0):
    x = tt(0.05); y = bandpass(noise(0.05), f * 0.7, f * 1.4) * np.exp(-x * 160)
    put(y, t, gain, pan)

def thwack(t, gain=0.7):
    x = tt(0.4)
    y = bandpass(noise(0.4), 2500, 9000) * np.exp(-x * 120) * 0.8
    y += np.sin(2 * np.pi * 620 * x) * np.exp(-x * 45) * 0.6 + np.sin(2 * np.pi * 1350 * x) * np.exp(-x * 70) * 0.3
    put(y.astype(np.float32), t, gain)

def soft_thud(t, gain=0.4, f=90):
    x = tt(0.5); y = np.sin(2 * np.pi * f * x) * np.exp(-x * 18) + lp(noise(0.5)[:, None], 800)[:, 0] * np.exp(-x * 30) * 0.5
    put(y.astype(np.float32), t, gain)

def hum(t0, t1, gain=0.06, flicker=None):
    d = t1 - t0; x = tt(d)
    y = sum(np.sin(2 * np.pi * 100 * k * x) / k for k in [1, 2, 3, 5]) * 0.4
    y += bandpass(noise(d), 3000, 8000) * 0.05
    a = np.ones_like(x)
    if flicker is not None:
        a = np.array([flicker(t0 + xx) for xx in x[::480]]).repeat(480)[:len(x)]
    e = np.minimum(1, x / 0.3) * np.minimum(1, (d - x) / 0.3)
    put((y * a * e).astype(np.float32), t0, gain)

def drone(t0, t1, f=36.7, gain=0.35):
    d = t1 - t0; x = tt(d)
    y = np.sin(2 * np.pi * f * x + 0.3 * np.sin(2 * np.pi * 0.1 * x)) + 0.3 * np.sin(2 * np.pi * f * 2.001 * x)
    e = np.minimum(1, x / 2.5) * np.minimum(1, (d - x) / 2.0)
    put((y * e).astype(np.float32), t0, gain)

def wind(t0, t1, gain=0.12):
    d = t1 - t0; x = tt(d); y = noise(d)
    out = tvf(y, lambda i: 650 + 300 * np.sin(2 * np.pi * 0.13 * x[i]) + 150 * np.sin(2 * np.pi * 0.31 * x[i]), 'band', 1024, (0.5, 1.6))
    e = np.minimum(1, x / 1.5) * np.minimum(1, (d - x) / 1.5)
    put(np.stack([out * e, np.roll(out, 900) * e], 1).astype(np.float32), t0, gain)

def scratch(t0, t1, gain=0.12):
    d = t1 - t0; x = tt(d); y = bandpass(noise(d), 2500, 7000)
    gate = (np.sin(2 * np.pi * 7.3 * x) > 0.2) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.9 * x))
    gate = np.convolve(gate, np.ones(200) / 200, mode='same')
    put((y * gate).astype(np.float32), t0, gain, -0.2)

def shimmer(t0, t1, gain=0.12, dens=14):
    d = t1 - t0
    for k in range(int(d * dens)):
        tt0 = t0 + rng.random() * d; f = 3000 + rng.random() * 5000; x = tt(0.6)
        put((np.sin(2 * np.pi * f * x) * np.exp(-x * 9)).astype(np.float32), tt0, gain * (0.4 + rng.random() * 0.6), rng.random() * 2 - 1)

def whir(t0, t1, gain=0.18):
    d = t1 - t0; x = tt(d); f = 300 * (2 ** (np.clip(x / d, 0, 1) * 3))
    y = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.3 * (0.5 + 0.5 * np.sin(2 * np.pi * 40 * x))
    put(lp(y[:, None], 4000)[:, 0].astype(np.float32) * np.minimum(1, (d - x) / 0.1), t0, gain)

# ---- 冷开场
drone(0.2, strike, 36.7, 0.12)
hum(0.4, 2.9, 0.03, flicker=lambda tt_: 0.5 + 0.5 * np.sin(tt_ * 40) * (tt_ < 2.2))
for i in range(16):  # 羽毛就位的轻响
    tk = v2 - 0.2 + 0.55 + 1.05 + (i - 1) * 0.105 if i > 0 else v2 - 0.2 + 1.9
    tick(tk, 0.18, 1800 + 120 * i, pan=np.sin(i) * 0.5)
heartbeat(v4a + 0.2, 0.9); heartbeat(v4a + 1.25, 0.9)
hum(v4a - 0.2, strike, 0.035, flicker=lambda tt_: 0.3 + 0.7 * (np.sin(tt_ * 31) > 0.3))
riser(v4b + 0.6, strike - 0.02, 0.55)
reverse_swell(strike - 0.02, 2.4, 0.45)
impact(strike, 1.2); braam(strike, 4.5, 36.71, 0.75); thwack(strike - 0.005, 0.9); whoosh(strike + 0.02, 0.5, True, 0.6)
# ---- 片名
t0 = S('title')
whoosh(t0 + 1.0, 2.4, True, 0.18); shimmer(t0 + 1.0, t0 + 3.6, 0.08, 10); shimmer(t0 + 4.2, t0 + 6.2, 0.07, 8)
braam(t0 + 3.0, 5.0, 36.71, 0.35)
# ---- 起源
wind(S('origins'), E('origins') + 0.5, 0.10)
soft_thud(S('origins') + 0.0, 0.35, 120); soft_thud(S('origins') + 6.7, 0.35, 120)
# 水墨转场：墨水晕开的呼啸
whoosh(S('europe') - 0.1, 1.6, False, 0.25)
# ---- 欧洲：每次木拍击球
for k in range(10):
    th = S('europe') + 0.6 + k * 1.55
    if th < E('europe'): tick(th, 0.35, 1300, pan=-0.5 if k % 2 == 0 else 0.5); soft_thud(th, 0.18, 220)
# ---- 浦那：编网的细碎声 + 羽毛球被击出
shimmer(cue('poona', 'v07') + 1.2, cue('poona', 'v07', 1), 0.05, 12)
thwack(cue('poona', 'v08') - 1.2, 0.55); whoosh(cue('poona', 'v08') - 1.1, 3.5, True, 0.2)
# ---- 庄园：夜虫与远处的乐声（底噪）
wind(S('manor'), E('manor'), 0.05)
shimmer(cue('manor', 'v10') + 0.8, cue('manor', 'v10', 1) + 0.4, 0.06, 10)
# ---- 规则：时钟、羽毛笔、火漆
for k in range(int((tSwitch - S('rules')) / 0.5)): tick(S('rules') + 0.3 + k * 0.5, 0.16, 3200 if k % 2 else 2600, 0.3)
scratch(S('rules') + 0.4, r11b + 1.0, 0.11)
whoosh(seal - 0.6, 0.6, False, 0.3); soft_thud(seal, 0.8, 70); impact(seal, 0.35)
impact(tSwitch, 0.6); whoosh(tSwitch - 0.5, 0.6, True, 0.35)
for i in range(12): whoosh(tSwitch + 0.3 + i * 0.32, 0.6, True, 0.08, pan=np.sin(i) * 0.6)
# ---- 世界：光弧发射
for i in range(8): whoosh(cue('world', 'v13') + 0.9 + i * 0.32, 1.6, True, 0.12, pan=np.cos(i) * 0.7)
impact(cue('world', 'v14a') + 0.6, 0.45); impact(cue('world', 'v14b') + 0.8, 0.45)
whoosh(cue('world', 'v14a') - 0.6, 1.8, False, 0.2); whoosh(cue('world', 'v14b') - 0.4, 1.6, False, 0.2); whoosh(cue('world', 'v15') - 0.3, 2.0, False, 0.25)
reverse_swell(cue('world', 'v15') + 0.6, 2.0, 0.3)
# ---- 中国
reverse_swell(cue('china', 'v16a') - 0.2, 2.0, 0.4); impact(cue('china', 'v16a') - 0.2, 0.5); impact(cue('china', 'v16b') - 0.2, 0.45)
shimmer(S('china'), E('china'), 0.05, 10)
# ---- 奥运
whoosh(S('olympics') - 0.3, 0.9, True, 0.4); impact(S('olympics') + 0.4, 0.55)
for k in range(30):
    th = S('olympics') + 1.2 + (k + 0.55) * (1 / 0.32)
    if th < s1 - 0.2: thwack(th, 0.35)
impact(s1, 0.4); impact(s2, 0.45); impact(s3, 0.6)
for i in range(5): shimmer(s2 + 0.6 + i * 0.45, s2 + 0.9 + i * 0.45, 0.05, 20)
# ---- 速度
for k in range(13): tick(cue('speed', 'v20') + 0.6 + k * max(0.28, (c21a - 1.6 - cue('speed', 'v20') - 0.6) / 13), 0.35, 1800, 0.0)
drone(tCut, sstrike + 0.2, 30.0, 0.18)
riser(tCut + 0.3, sstrike - 0.02, 0.6); reverse_swell(sstrike - 0.02, 2.0, 0.5)
impact(sstrike, 1.3); braam(sstrike, 4.0, 36.71, 0.7); thwack(sstrike - 0.005, 1.0); whoosh(sstrike, 0.7, True, 0.7, 0.6)
whir(sstrike + 0.02, sstrike + 0.9, 0.2)
whoosh(c21b + 1.5, 1.6, True, 0.22, -0.3); impact(E('speed') - 0.9, 0.6)
# ---- 尾声
for i in range(8): whoosh(m0 + i * mLen - 0.25, 0.35, True, 0.25, pan=0.6 if i % 2 else -0.6); impact(m0 + i * mLen, 0.35)
impact(mEnd, 0.5); reverse_swell(mEnd, 1.2, 0.35)
drone(mEnd, f24 - 0.2, 36.7, 0.10)
heartbeat(f24 + 0.3, 0.7)
freeze = f24e + 0.15
soft_thud(freeze, 0.5, 48); reverse_swell(freeze, 1.5, 0.25)

# ================================================================= 渲染与混音
print('rendering MIDI stems with FluidSynth ...', flush=True)
stems = {}
for seq, g in [(strings, 0.75), (brass, 0.7), (keys, 0.8), (world, 0.8), (perc, 0.8)]:
    stems[seq.name] = render_midi(seq, g)
    print(' ', seq.name, 'peak', float(np.abs(stems[seq.name]).max()), flush=True)
wet = {'strings': 0.55, 'brass': 0.45, 'keys': 0.6, 'world': 0.55, 'perc': 0.35}
gain = {'strings': 1.0, 'brass': 0.9, 'keys': 0.85, 'world': 0.9, 'perc': 0.9}
music = np.zeros((N, 2), np.float32)
for k, x in stems.items():
    music += reverb(hp(x, 35), IR_HALL, wet[k]) * gain[k]
music = hp(music, 28)
sfxo = hp(sfx, 25)
os.makedirs(os.path.join(ROOT, 'audio'), exist_ok=True)
sf.write(os.path.join(ROOT, 'audio', 'music.wav'), music, SR, subtype='FLOAT')
sf.write(os.path.join(ROOT, 'audio', 'sfx.wav'), sfxo, SR, subtype='FLOAT')
print('music peak', float(np.abs(music).max()), 'sfx peak', float(np.abs(sfxo).max()))
