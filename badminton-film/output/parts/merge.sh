#!/bin/bash
# 在 Mac 上合并分块并校验：打开“终端”，输入 bash 加空格，把本文件拖进来，回车。
cd "$(dirname "$0")" || exit 1
OUT="羽毛球发展史.mp4"
cat "$OUT".part* > "$OUT" || exit 1
ACTUAL=$(shasum -a 256 "$OUT" | awk '{print $1}')
if [ "$ACTUAL" = "ad3a46eb306bdfedf7ce767b1642b9d50c794b5ec96b98560646ee834798b512" ]; then
  echo "✅ 合并完成，和原文件完全一致：$OUT"
else
  echo "❌ 校验不一致：可能少了某一块或下载不完整"; exit 1
fi
