// 第二幕 · 起源：水墨山水间，一枚毽子被踢起、在空中慢速翻飞；书法“毽”字与朱红印章。
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { clamp, lerp, seg, ease, smooth, noise1, fbm1, mulberry32 } from '../engine/util.js';
import { inkLandscapeMaterial, inkGlyphMaterial } from '../assets/ink.js';
import { GongbiJianzi } from '../assets/gongbi.js';
import { glyphCanvas } from './title.js';
import { revealText } from '../engine/overlay.js';

export class Origins extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.camera.fov = 30; this.camera.near = 0.5; this.camera.far = 500; this.camera.updateProjectionMatrix();
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), inkLandscapeMaterial());
    this.bg.frustumCulled = false; this.bg.renderOrder = -10;
    this.scene.add(this.bg);
    this.jz = new GongbiJianzi(3);
    this.glyphTex = this.track(glyphCanvas('毽', 'ZhiMangXing', 400, 1920, 804, 420, 330));
    this.glyph = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), inkGlyphMaterial(this.glyphTex));
    this.glyph.frustumCulled = false; this.glyph.renderOrder = 5;
    this.scene.add(this.glyph);
  }

  // 毽子的抛物线轨迹（屏幕像素，慢动作）：两次被踢起
  path(t) {
    const arcs = [
      { t0: -0.3, apexT: 3.3, apex: [1190, 330], x0: 1330, g: 52 },
      { t0: 6.7, apexT: 10.9, apex: [1060, 290], x0: 1150, g: 40 },
    ];
    const a = t >= arcs[1].t0 ? arcs[1] : arcs[0];
    const dt = t - a.apexT;
    const y = a.apex[1] + a.g * dt * dt;
    const k = (t - a.t0) / ((a.apexT - a.t0) * 2);
    const x = lerp(a.x0, a.apex[0] * 2 - a.x0, k);
    return { x, y, vy: 2 * a.g * dt, local: t - a.t0 };
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const bu = this.bg.material.uniforms;
    bu.time.value = t; bu.pan.value = t * 0.06; bu.zoom.value = 1 + 0.04 * (t / D);
    const P = this.path(t);

    const gu = this.glyph.material.uniforms;
    const v5a = info.cue('v05a');
    gu.reveal.value = seg(t, v5a - 0.6, v5a + 1.6, ease.inOutSine);
    gu.opacity.value = 0.92;
    this.renderTo(rt);

    // ---- 叠加层：印章、标题、飞鸟 ----
    const k = seg(t, v5a + 0.6, v5a + 1.6, ease.linear);
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha = ease.outCubic(k) * 0.92;
      const sx = 556, sy = 520, S = 62;
      ctx.translate(sx, sy); ctx.rotate(-0.03);
      ctx.fillStyle = '#a3241b';
      ctx.fillRect(-S / 2, -S / 2, S, S);
      ctx.fillStyle = '#f1e6d3'; ctx.font = '46px MaShanZheng'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('漢', 0, 3);
      const rnd = mulberry32(5);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 90; i++) { ctx.beginPath(); ctx.arc((rnd() - 0.5) * S * 1.05, (rnd() - 0.5) * S * 1.05, rnd() * 2.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    revealText(ctx, '中国 · 汉代', 172, 640, seg(t, v5a + 0.3, v5a + 1.8, ease.linear), { font: '500 34px NotoSerifSC', color: '#2a231c', align: 'left', tracking: 10, stagger: 0.12, blurMax: 6 });
    revealText(ctx, 'CHINA  ·  HAN DYNASTY  ·  206 BC – AD 220', 174, 690, seg(t, v5a + 0.8, v5a + 2.3, ease.linear), { font: '400 18px Cinzel', color: '#3e3328', align: 'left', tracking: 5, stagger: 0.02, blurMax: 4 });
    // 工笔毽子：上升时羽毛收拢，下落时张开
    const flare = clamp(P.vy / 900, -0.12, 0.28);
    this.jz.draw(ctx, P.x, P.y, { scale: 1.32, rot: 0.12 * Math.sin(t * 1.1) + P.vy / 4000, flare, t });
    // 远处飞鸟
    ctx.save(); ctx.strokeStyle = 'rgba(30,28,26,0.75)'; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const bx = 1180 + i * 46 + t * (18 + i * 3) + Math.sin(i * 7) * 30, by = 190 + i * 14 + Math.sin(t * 0.7 + i) * 6;
      const flap = Math.sin(t * 7 + i * 1.7) * 5, s = 7 + (i % 2) * 2;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(bx - s, by - flap); ctx.quadraticCurveTo(bx - s * 0.4, by - 2, bx, by + 1); ctx.quadraticCurveTo(bx + s * 0.4, by - 2, bx + s, by - flap); ctx.stroke();
    }
    ctx.restore();
    return {
      overlay: true,
      grade: { exposure: 1.28, bloom: 0.12, bloomThreshold: 1.4, halation: 0.04, vignette: 0.35, grain: 0.035, saturation: 0.95, contrast: 1.12, chroma: 0.0008, shadowTint: [0.004, 0.0, -0.01], highTint: [0.012, 0.006, -0.01] },
    };
  }
}
