// 宽银幕下方黑边内的字幕（不受胶片后期影响，保持干净）。
import { clamp } from './util.js';

export function drawSubtitle(ctx, lines, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  for (const ln of lines) {
    if (t < ln.start - 0.15 || t > ln.end + 0.35) continue;
    const a = clamp((t - (ln.start - 0.15)) / 0.2) * clamp((ln.end + 0.35 - t) / 0.25);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '300 34px "NotoSerifSC"';
    ctx.letterSpacing = '3px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(226,220,206,1)';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    const text = ln.text.replace(/——$/, '……');
    ctx.fillText(text, W / 2, H * 0.46);
    ctx.restore();
  }
}
