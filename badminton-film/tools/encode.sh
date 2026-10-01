#!/usr/bin/env bash
# 合成与编码：拼接渲染块 + 混音 → H.265 10-bit 高清版（hvc1，Mac/iPhone 原生播放）+ 手机预览版（H.264 720p）。
# 高清版超过 95MB 时切块，并生成 merge.sh（合并 + SHA-256 校验）。
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="${1:-羽毛球发展史}"
OUT=output; mkdir -p "$OUT" out
ls out/chunks/c*.mkv | sort | sed "s|^|file '$PWD/|; s|$|'|" > out/chunks.txt
DUR=$(python3 -c "import json;print(json.load(open('build/timeline.json'))['duration'])")

# 1) 高清版：1080p，2.39:1 画面在 16:9 画布内（字幕在下方黑边），H.265 Main10
ffmpeg -y -hide_banner -loglevel warning -stats -f concat -safe 0 -i out/chunks.txt -i audio/mix.wav \
  -map 0:v -map 1:a -t "$DUR" \
  -c:v libx265 -preset slow -crf "${CRF:-21}" -pix_fmt yuv420p10le -tag:v hvc1 \
  -x265-params "aq-mode=3:psy-rd=1.6:psy-rdoq=1.0:deblock=-1,-1:log-level=error" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart \
  -metadata title="$NAME" "$OUT/$NAME.mp4"

# 2) 手机预览版：720p H.264
ffmpeg -y -hide_banner -loglevel warning -stats -i "$OUT/$NAME.mp4" \
  -vf "scale=1280:720:flags=lanczos" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 160k -movflags +faststart "$OUT/${NAME}_手机预览版.mp4"

ls -la "$OUT"
# 3) 超过 95MB 则切块
SIZE=$(stat -c %s "$OUT/$NAME.mp4")
if [ "$SIZE" -gt $((95 * 1024 * 1024)) ]; then
  SUM=$(sha256sum "$OUT/$NAME.mp4" | cut -d' ' -f1)
  mkdir -p "$OUT/parts"
  split -b 90M -d -a 3 "$OUT/$NAME.mp4" "$OUT/parts/$NAME.mp4.part"
  cat > "$OUT/parts/merge.sh" <<EOF
#!/bin/bash
# 在 Mac 上合并分块并校验：打开“终端”，输入 bash 加空格，把本文件拖进来，回车。
cd "\$(dirname "\$0")" || exit 1
OUT="$NAME.mp4"
cat "\$OUT".part* > "\$OUT" || exit 1
ACTUAL=\$(shasum -a 256 "\$OUT" | awk '{print \$1}')
if [ "\$ACTUAL" = "$SUM" ]; then
  echo "✅ 合并完成，和原文件完全一致：\$OUT"
else
  echo "❌ 校验不一致：可能少了某一块或下载不完整"; exit 1
fi
EOF
  chmod +x "$OUT/parts/merge.sh"
  echo "已切块：$(ls "$OUT/parts" | wc -l) 个文件，SHA-256 $SUM"
fi
