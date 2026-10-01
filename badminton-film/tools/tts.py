#!/usr/bin/env python3
"""用 MiniMax 语音合成（speech-2.8-hd）逐句生成解说，写入 audio/vo/<id>.wav 与 durations.json。
API Key 从环境变量 MINIMAX_API_KEY 或 --key-file 读取，绝不写入仓库。
用法：
  python3 tools/tts.py --list-voices            列出可用的系统音色
  python3 tools/tts.py --voice <voice_id> [--only v01,v02] [--speed 0.92]
"""
import argparse, json, os, re, subprocess, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.environ.get('MINIMAX_API_BASE', 'https://api.minimaxi.com')
MODEL = os.environ.get('MINIMAX_TTS_MODEL', 'speech-2.8-hd')

ap = argparse.ArgumentParser()
ap.add_argument('--key-file'); ap.add_argument('--voice', default='Chinese (Mandarin)_Male_Announcer')
ap.add_argument('--speed', type=float, default=0.92); ap.add_argument('--pitch', type=int, default=0)
ap.add_argument('--emotion', default=None); ap.add_argument('--only', default=None)
ap.add_argument('--list-voices', action='store_true'); ap.add_argument('--sample', default=None, help='试听：只合成这句文本到 audio/vo/sample_<voice>.wav')
args = ap.parse_args()
KEY = os.environ.get('MINIMAX_API_KEY') or (open(args.key_file).read().strip() if args.key_file else None)
if not KEY: sys.exit('缺少 MINIMAX_API_KEY')

def post(path, payload, timeout=120):
    req = urllib.request.Request(API + path, data=json.dumps(payload).encode(), headers={'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors='replace')[:500]
            if e.code in (429, 500, 502, 503) and attempt < 3: time.sleep(2 ** attempt * 2); continue
            sys.exit(f'HTTP {e.code}: {body}')
        except urllib.error.URLError as e:
            if attempt < 3: time.sleep(2 ** attempt * 2); continue
            sys.exit(f'网络错误: {e}')

if args.list_voices:
    r = post('/v1/get_voice', {'voice_type': 'system'})
    for v in r.get('system_voice', []):
        print(v.get('voice_id'), '|', v.get('voice_name'), '|', (v.get('description') or [''])[0] if isinstance(v.get('description'), list) else v.get('description'))
    sys.exit(0)

def tts_text(t):
    # 破折号 → 明确停顿；MiniMax 支持 <#秒#> 停顿标记
    t = t.replace('——', '<#0.45#>')
    return t

def synth(text, out_wav):
    payload = {
        'model': MODEL, 'text': tts_text(text), 'stream': False, 'language_boost': 'Chinese',
        'voice_setting': {'voice_id': args.voice, 'speed': args.speed, 'vol': 1.0, 'pitch': args.pitch},
        'audio_setting': {'sample_rate': 44100, 'bitrate': 256000, 'format': 'mp3', 'channel': 1},
    }
    if args.emotion: payload['voice_setting']['emotion'] = args.emotion
    r = post('/v1/t2a_v2', payload)
    base = r.get('base_resp', {})
    if base.get('status_code', 0) != 0: sys.exit(f"MiniMax 错误 {base.get('status_code')}: {base.get('status_msg')}")
    audio_hex = r['data']['audio']
    mp3 = out_wav[:-4] + '.mp3'
    open(mp3, 'wb').write(bytes.fromhex(audio_hex))
    # 转 48k WAV，并切掉首尾静音
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-af',
                    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse',
                    '-ar', '48000', '-ac', '1', out_wav], check=True)
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out_wav], capture_output=True, text=True).stdout)
    return d, r.get('extra_info', {})

os.makedirs(os.path.join(ROOT, 'audio', 'vo'), exist_ok=True)
if args.sample:
    safe = re.sub(r'[^A-Za-z0-9_]+', '_', args.voice)
    d, info = synth(args.sample, os.path.join(ROOT, 'audio', 'vo', f'sample_{safe}.wav'))
    print(f'sample {args.voice}: {d:.2f}s', info); sys.exit(0)

script = json.load(open(os.path.join(ROOT, 'script.json'), encoding='utf-8'))
dur_path = os.path.join(ROOT, 'audio', 'vo', 'durations.json')
durs = json.load(open(dur_path)) if os.path.exists(dur_path) else {}
only = set(args.only.split(',')) if args.only else None
for sc in script['scenes']:
    for ln in sc.get('lines', []):
        if only and ln['id'] not in only: continue
        out = os.path.join(ROOT, 'audio', 'vo', ln['id'] + '.wav')
        d, info = synth(ln['text'], out)
        durs[ln['id']] = round(d, 3)
        print(f"{ln['id']}: {d:5.2f}s  {ln['text']}", flush=True)
        json.dump(durs, open(dur_path, 'w'), indent=1)
meta = {'model': MODEL, 'voice': args.voice, 'speed': args.speed, 'pitch': args.pitch, 'emotion': args.emotion}
json.dump(meta, open(os.path.join(ROOT, 'audio', 'vo', 'voice.json'), 'w'), ensure_ascii=False, indent=1)
print('完成：', len(durs), '句')
