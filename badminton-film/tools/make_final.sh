#!/usr/bin/env bash
# 一键出片：配音（可选）→ 时间轴 → 双进程分块渲染 → 配乐/音效 → 混音 → 编码。
# 用法：
#   bash tools/make_final.sh                          # 用现有配音（或无配音）出片
#   VOICE="<voice_id>" KEY_FILE=/path/key bash tools/make_final.sh --tts   # 先用 MiniMax 生成配音
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--tts" ]; then
  rm -f audio/vo/durations.json
  python3 tools/tts.py --key-file "${KEY_FILE:?需要 KEY_FILE}" --voice "${VOICE:?需要 VOICE}" --speed "${SPEED:-0.92}"
fi
python3 tools/timeline.py
FRAMES=$(python3 -c "import json;print(json.load(open('build/timeline.json'))['frames'])")
CHUNK=480; N=$(( (FRAMES + CHUNK - 1) / CHUNK )); HALF=$(( N / 2 ))
rm -rf out/chunks; mkdir -p out/chunks
node tools/render.mjs --chunks $CHUNK --first 0 --last $((HALF - 1)) > out/render_A.log 2>&1 &
PA=$!
node tools/render.mjs --chunks $CHUNK --first $HALF --last $((N - 1)) > out/render_B.log 2>&1 &
PB=$!
python3 tools/music.py && python3 tools/mix.py
wait $PA; wait $PB
COUNT=$(ls out/chunks/c*.mkv | grep -vc part || true)
[ "$COUNT" -eq "$N" ] || { echo "渲染块数量不对：$COUNT / $N"; exit 1; }
bash tools/encode.sh
