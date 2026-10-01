// 工笔风格的毽子（2D 逐笔绘制）：每根羽毛由数十道细笔触构成，颜料用“正片叠底”叠在宣纸上。
import { mulberry32, lerp } from '../engine/util.js';

const PALETTES = [
  { base: [52, 30, 18], mid: [176, 78, 30], tip: [226, 160, 82] },   // 赭红
  { base: [20, 30, 24], mid: [40, 82, 60], tip: [120, 150, 110] },   // 石绿
  { base: [40, 28, 20], mid: [140, 104, 60], tip: [214, 186, 136] }, // 赭黄
  { base: [24, 22, 22], mid: [60, 56, 58], tip: [150, 144, 140] },   // 墨
  { base: [70, 20, 14], mid: [168, 40, 26], tip: [214, 100, 66] },   // 朱砂
];

export class GongbiJianzi {
  constructor(seed = 3) {
    const rnd = mulberry32(seed);
    this.feathers = [];
    const N = 26;
    for (let i = 0; i < N; i++) {
      const ang = lerp(-0.62, 0.62, (i + rnd() * 0.6) / N) + (rnd() - 0.5) * 0.12;
      this.feathers.push({
        ang, len: 205 + rnd() * 70 - Math.abs(ang) * 60, width: 15 + rnd() * 9,
        bend: (rnd() - 0.5) * 0.5 + ang * 0.6, pal: PALETTES[Math.floor(rnd() * PALETTES.length)],
        phase: rnd() * 6.28, depth: rnd(), barbs: 46 + Math.floor(rnd() * 20), seed: Math.floor(rnd() * 1e6),
      });
    }
    this.feathers.sort((a, b) => a.depth - b.depth);
  }

  // 在 (x,y) 处绘制，rot 为整体倾角，flare 为羽毛张开程度，t 为时间（羽毛颤动）
  draw(ctx, x, y, { scale = 1, rot = 0, flare = 0, t = 0, alpha = 1 } = {}) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    // 羽毛（先画后面的）
    for (const f of this.feathers) {
      const rnd = mulberry32(f.seed);
      const sway = Math.sin(t * 2.2 + f.phase) * 0.035 + Math.sin(t * 5.1 + f.phase * 2) * 0.012;
      const a = f.ang * (1 + flare) + sway;
      const L = f.len;
      // 羽轴：二次曲线
      const p0 = [0, -18];
      const p2 = [Math.sin(a) * L, -18 - Math.cos(a) * L];
      const p1 = [Math.sin(a + f.bend * 0.5) * L * 0.55, -18 - Math.cos(a + f.bend * 0.5) * L * 0.55];
      const at = (u) => [(1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]];
      const tan = (u) => { const dx = 2 * (1 - u) * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0]); const dy = 2 * (1 - u) * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1]); const l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
      const col = (u) => { const c = u < 0.45 ? f.pal.base.map((v, j) => lerp(v, f.pal.mid[j], u / 0.45)) : f.pal.mid.map((v, j) => lerp(v, f.pal.tip[j], (u - 0.45) / 0.55)); return c.map(Math.round); };
      ctx.globalCompositeOperation = 'multiply';
      // 淡彩底（晕染）
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) { const u = 0.08 + k / 20 * 0.92; const [px, py] = at(u); const [tx, ty] = tan(u); const w = f.width * Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.9; k ? ctx.lineTo(px - ty * w, py + tx * w) : ctx.moveTo(px - ty * w, py + tx * w); }
      for (let k = 20; k >= 0; k--) { const u = 0.08 + k / 20 * 0.92; const [px, py] = at(u); const [tx, ty] = tan(u); const w = f.width * Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.9; ctx.lineTo(px + ty * w, py - tx * w); }
      ctx.closePath();
      const [mr, mg, mb] = col(0.6);
      ctx.fillStyle = `rgba(${mr},${mg},${mb},0.28)`;
      ctx.fill();
      // 羽枝细笔
      for (let b = 0; b < f.barbs; b++) {
        const u = 0.1 + (b / f.barbs) * 0.88;
        const [px, py] = at(u); const [tx, ty] = tan(u);
        const w = f.width * Math.sin(Math.PI * Math.min(1, u * 1.05)) * (0.85 + rnd() * 0.35);
        const [r, g, bb] = col(u + (rnd() - 0.5) * 0.08);
        ctx.strokeStyle = `rgba(${r},${g},${bb},${0.35 + rnd() * 0.4})`;
        ctx.lineWidth = 0.7 + rnd() * 0.9;
        for (const side of [-1, 1]) {
          const ex = px + (-ty * side) * w + tx * w * 0.7, ey = py + (tx * side) * w + ty * w * 0.7;
          ctx.beginPath(); ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + (-ty * side) * w * 0.6, py + (tx * side) * w * 0.6, ex, ey);
          ctx.stroke();
        }
      }
      // 羽轴
      ctx.strokeStyle = 'rgba(60,44,30,0.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 羽管与红布
    ctx.fillStyle = 'rgba(230,220,196,1)'; ctx.strokeStyle = 'rgba(60,46,32,0.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(-7, -40, 14, 36); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9a2a1c';
    ctx.beginPath(); ctx.ellipse(0, -2, 26, 10, 0, Math.PI, 0); ctx.fill();
    // 三枚铜钱（侧视的椭圆叠层）
    for (let i = 2; i >= 0; i--) {
      const yy = 4 + i * 7;
      ctx.fillStyle = i === 0 ? '#8a6436' : '#6e4b28';
      ctx.beginPath(); ctx.ellipse(0, yy, 42, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(40,26,14,0.7)'; ctx.lineWidth = 1.3; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(214,170,106,0.85)';
    ctx.beginPath(); ctx.ellipse(0, 4, 42, 11, 0, 0, Math.PI * 2); ctx.globalAlpha = alpha * 0.35; ctx.fill(); ctx.globalAlpha = alpha;
    ctx.fillStyle = '#3a2614'; ctx.fillRect(-7, 1, 14, 5);
    ctx.restore();
  }
}
