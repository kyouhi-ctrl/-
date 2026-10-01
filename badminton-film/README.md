# 《羽毛球发展史》· 程序化电影

整部片子的画面、配乐、音效全部由代码生成：

- **画面**：three.js + 自定义着色器，在无头 Chromium（SwiftShader）中逐帧确定性渲染，再交给 ffmpeg 编码。
  电影后期（泛光、红色光晕、ACES 色调映射、调色、色差、暗角、胶片颗粒）、2.39:1 宽银幕、黑边字幕。
- **配乐**：`tools/music.py` 按时间轴作曲 → 多轨 MIDI → FluidSynth + MuseScore General 音色；
  预告片式音效（冲击、Braam、呼啸、上升音、心跳、击球声……）用 numpy 合成。
- **配音**：`tools/tts.py` 调用 MiniMax 语音合成（speech-2.8-hd），API Key 只从环境变量读取，不入库。

## 流程

```bash
npm install                       # three.js、地图数据
python3 tools/fetch_fonts.py      # 下载字体（OFL）
node tools/build_geo.mjs          # 预处理世界地图
MINIMAX_API_KEY=... python3 tools/tts.py --voice <voice_id>   # 生成配音（可选）
python3 tools/timeline.py         # 由配音时长生成时间轴
node tools/render.mjs --stills 12.5,30     # 渲染静帧预览
node tools/render.mjs --chunks 480         # 全片分块渲染（可断点续渲）
python3 tools/music.py && python3 tools/mix.py   # 配乐、音效、混音
bash tools/encode.sh              # 合成、编码、切块
```

## 史实来源
世界羽联 BWF、吉尼斯世界纪录（最快杀球 565 km/h，2023）、Olympics.com、全英锦标赛（1899）等。
