#!/usr/bin/env python3
"""根据 script.json 和配音时长生成 build/timeline.json（场景起止、每句台词的时间点）。
没有配音时按字数估算时长；有 audio/vo/durations.json 时使用真实时长。"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
script = json.load(open(os.path.join(ROOT, "script.json"), encoding="utf-8"))
dur_path = os.path.join(ROOT, "audio", "vo", "durations.json")
real = json.load(open(dur_path)) if os.path.exists(dur_path) else {}
cps = script["chars_per_sec_estimate"]

def est(text):
    n = len(re.sub(r"[，。、——：；！？,.!?\s]", "", text))
    return n / cps + 0.35

scenes, lines = [], []
prev_end = 0.0
for i, sc in enumerate(script["scenes"]):
    tr = sc.get("trans", {"type": "cut", "dur": 0})
    start = prev_end - (tr["dur"] if i > 0 else 0)
    cues = {}
    if "fixed" in sc:
        end = start + sc["fixed"]
    else:
        cur = start + sc["pre"]
        for ln in sc["lines"]:
            d = real.get(ln["id"], est(ln["text"]))
            cues[ln["id"]] = [round(cur - start, 4), round(cur - start + d, 4)]
            lines.append({"id": ln["id"], "scene": sc["id"], "text": ln["text"],
                          "start": round(cur, 4), "end": round(cur + d, 4), "real": ln["id"] in real})
            cur += d + ln["gap"]
        end = cur + sc["post"]
    scenes.append({"id": sc["id"], "start": round(start, 4), "end": round(end, 4),
                   "dur": round(end - start, 4), "trans": tr, "cues": cues})
    prev_end = end

fps = script["fps"]
out = {"credits": script.get("credits", []), "fps": fps, "duration": round(prev_end, 4), "frames": int(round(prev_end * fps)),
       "scenes": scenes, "lines": lines, "voReal": bool(real)}
os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, "build", "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for s in scenes:
    print(f"{s['id']:10s} {s['start']:7.2f} → {s['end']:7.2f}  ({s['dur']:5.2f}s)  {s['trans']['type']}")
print(f"总时长 {prev_end:.1f}s = {int(prev_end//60)}分{prev_end%60:04.1f}秒, {out['frames']} 帧, 配音={'真实' if real else '估算'}")
