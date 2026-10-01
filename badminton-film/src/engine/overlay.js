// 2D 叠加层排版工具：字距文字、逐字浮现、引线标注、3D→屏幕投影。
import * as THREE from 'three';
import { clamp, ease, invLerp } from './util.js';

export function project(v3, camera, W, H) {
  const p = v3.clone().project(camera);
  return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, behind: p.z > 1 };
}

// 带字距的文字（字距动画 + 模糊淡入）
export function text(ctx, str, x, y, { font = '400 32px Cinzel', color = '#fff', align = 'center', base = 'middle', tracking = 0, alpha = 1, blur = 0, glow = 0, glowColor = 'rgba(255,200,120,0.6)' } = {}) {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = base;
  ctx.letterSpacing = `${tracking}px`;
  if (blur > 0.05) ctx.filter = `blur(${blur.toFixed(2)}px)`;
  if (glow > 0) { ctx.shadowColor = glowColor; ctx.shadowBlur = glow; }
  ctx.fillStyle = color;
  // 居中时补偿最后一个字的字距
  const dx = align === 'center' ? tracking / 2 : 0;
  ctx.fillText(str, x + dx, y);
  ctx.restore();
}

// 逐字浮现：每个字依次从模糊/下移状态出现
export function revealText(ctx, str, x, y, prog, { font = '400 32px Cinzel', color = '#fff', tracking = 0, stagger = 0.08, rise = 10, blurMax = 8, align = 'center', alpha = 1 } = {}) {
  ctx.save();
  ctx.font = font; ctx.textBaseline = 'middle'; ctx.letterSpacing = '0px';
  const chars = [...str];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const n = chars.length;
  const span = 1 + stagger * (n - 1);
  for (let i = 0; i < n; i++) {
    const k = clamp((prog * span - i * stagger));
    const e = ease.outCubic(k);
    if (k > 0) {
      ctx.globalAlpha = e * alpha;
      const b = (1 - e) * blurMax;
      ctx.filter = b > 0.1 ? `blur(${b.toFixed(2)}px)` : 'none';
      ctx.fillStyle = color;
      ctx.fillText(chars[i], cx, y + (1 - e) * rise);
    }
    cx += widths[i] + tracking;
  }
  ctx.restore();
}

// 引线标注：从锚点画一条细线到标签
export function leader(ctx, ax, ay, bx, by, prog, { color = 'rgba(230,214,180,0.9)', width = 1.2, dot = 3 } = {}) {
  if (prog <= 0) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  const k = ease.outCubic(clamp(prog));
  ctx.globalAlpha = clamp(prog * 3);
  ctx.beginPath(); ctx.arc(ax, ay, dot, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ax, ay, dot * 2.6, 0, Math.PI * 2); ctx.globalAlpha *= 0.35; ctx.stroke();
  ctx.globalAlpha = clamp(prog * 3);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k); ctx.stroke();
  ctx.restore();
}

// 字幕卡片：年份 + 地点（纪录片风格的小标题）
export function caption(ctx, x, y, prog, lines, { align = 'left', color = '#efe6d2' } = {}) {
  let yy = y;
  for (const ln of lines) {
    const k = clamp(prog * 1.6 - (ln.delay || 0));
    revealText(ctx, ln.text, x, yy, k, { font: ln.font, color: ln.color || color, tracking: ln.tracking || 0, align, stagger: ln.stagger ?? 0.05, blurMax: 6, rise: 6, alpha: ln.alpha ?? 1 });
    yy += ln.gap || 40;
  }
}

export function fadeInOut(t, a, b, fi = 0.4, fo = 0.4) {
  return clamp(invLerp(a, a + fi, t)) * clamp(invLerp(b, b - fo, t));
}
