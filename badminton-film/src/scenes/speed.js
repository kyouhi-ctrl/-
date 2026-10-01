// 第十幕 · 速度：机械翻牌记分板（2006 年起 21 分每球得分制）；
// 2023 年最快杀球：羽毛球拖着光尾横穿画面，读数冲到 565 km/h，与 F1 极速 372.6 km/h 对比。
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { NOISE } from '../engine/glsl.js';
import { clamp, lerp, seg, ease, smooth, fbm1, noise1, mulberry32, invLerp } from '../engine/util.js';
import { makeLighting, createShuttle } from '../assets/shuttle.js';
import { createDust } from '../assets/atmos.js';
import { revealText, text } from '../engine/overlay.js';

// 翻牌数字：from → to 的翻转进度 k
function flapDigit(ctx, x, y, w, h, from, to, k) {
  const r = 10;
  const card = (yy, hh) => { ctx.beginPath(); ctx.roundRect(x - w / 2, yy, w, hh, r); };
  const half = (str, top) => {
    ctx.save(); card(top ? y - h / 2 : y, h / 2); ctx.clip();
    const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2); g.addColorStop(0, '#1d1f24'); g.addColorStop(0.5, '#121418'); g.addColorStop(1, '#1a1c21');
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = '#f4efe6'; ctx.font = `400 ${h * 0.92}px BebasNeue`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y + h * 0.04);
    ctx.restore();
  };
  half(to, true); half(from, false);
  if (k < 0.5) {         // 上半片（旧数字）向下翻
    const s = Math.cos(k * Math.PI);
    ctx.save(); ctx.translate(0, y); ctx.scale(1, s); ctx.translate(0, -y); half(from, true);
    ctx.fillStyle = `rgba(0,0,0,${(1 - s) * 0.6})`; ctx.fillRect(x - w / 2, y - h / 2, w, h / 2); ctx.restore();
  } else {               // 下半片（新数字）落下
    const s = -Math.cos(k * Math.PI);
    ctx.save(); ctx.translate(0, y); ctx.scale(1, s); ctx.translate(0, -y); half(to, false);
    ctx.fillStyle = `rgba(0,0,0,${(1 - s) * 0.5})`; ctx.fillRect(x - w / 2, y, w, h / 2); ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x - w / 2, y - 1.5, w, 3);
}

export class Speed extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.camera.fov = 26; this.camera.near = 0.3; this.camera.far = 2000; this.camera.updateProjectionMatrix();
    this.L = makeLighting();
    this.L.keyDir.value.set(0.2, 1, 0.3).normalize(); this.L.beamD.value.copy(this.L.keyDir.value); this.L.beamR.value = 1e6;
    this.L.keyColor.value.setRGB(1.0, 0.92, 0.82).multiplyScalar(1.6);
    // 场馆背景：远处的灯阵散景 + 暗色地面
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, mode: { value: 0 }, shift: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: /* glsl */ `${NOISE} uniform float time, mode, shift; varying vec2 vUv;
        void main(){ vec2 q = vUv * vec2(2.388, 1.0);
          vec3 c = mix(vec3(0.012, 0.016, 0.026), vec3(0.03, 0.035, 0.05), vUv.y);
          // 场馆灯的散景：随机间距、大小、亮度、色温
          for (int row = 0; row < 3; row++) {
            float fr = float(row);
            float fy = 0.50 - fr * 0.07; float sp = 0.09 + fr * 0.03;
            float x = q.x + shift * (1.0 - fr * 0.25) + fr * 0.37;
            float cell = floor(x / sp);
            float h = hash12(vec2(cell, fr + 7.0));
            if (h < 0.35) continue;
            vec2 ctr = vec2((cell + 0.45 + 0.1 * hash12(vec2(cell, fr))) * sp, fy + (hash12(vec2(cell, fr + 2.0)) - 0.5) * 0.06);
            float rad = min((0.012 + 0.03 * hash12(vec2(cell, fr + 4.0))) * (1.0 + fr * 0.3), sp * 0.4);
            float d = length(vec2(x, q.y) - ctr);
            float b = smoothstep(rad, rad * 0.75, d) * (0.85 + 0.15 * smoothstep(rad * 0.6, rad * 0.95, d));
            vec3 col = mix(vec3(1.0, 0.86, 0.68), vec3(0.75, 0.85, 1.0), hash12(vec2(cell, fr + 9.0)));
            c += col * b * (0.10 + 0.35 * h) / (1.0 + fr * 0.8);
          }
          c += vec3(0.25, 0.3, 0.45) * exp(-pow((vUv.y - 0.48) * 5.0, 2.0)) * 0.10;
          gl_FragColor = vec4(c, 1.0); }`,
      depthTest: false, depthWrite: false,
    }));
    this.bg.frustumCulled = false; this.bg.renderOrder = -10; this.scene.add(this.bg);
    this.sh = createShuttle(this.L);
    this.pivot = new THREE.Group(); this.pivot.add(this.sh.group); this.sh.group.position.y = -4.6;
    this.scene.add(this.pivot);
    // 光尾
    this.trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { a: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float a; varying vec2 vUv; void main(){ float x = vUv.x; float y = abs(vUv.y - 0.5) * 2.0;
        float core = exp(-y * y * 30.0) * pow(x, 2.2); float halo = exp(-y * y * 4.0) * pow(x, 3.0) * 0.4;
        gl_FragColor = vec4(vec3(1.6, 1.3, 1.0) * (core * 2.5 + halo) * a, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.scene.add(this.trail);
    this.dust = createDust(this.L, { count: 2500, box: [140, 60, 80], center: new THREE.Vector3(0, 4, -10), size: 0.05 });
    this.scene.add(this.dust);
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const c20 = info.cue('v20'), c21a = info.cue('v21a'), c21b = info.cue('v21b'), c21be = info.cue('v21b', 1);
    const tCut = c21a - 0.3;
    const bu = this.bg.material.uniforms; bu.time.value = t;
    let grade = { exposure: 1.05, bloom: 0.7, bloomThreshold: 0.85, halation: 0.25, vignette: 0.6, grain: 0.045, saturation: 1.0, contrast: 1.08, chroma: 0.0012 };
    if (t < tCut) {
      // ---------- Part 1：翻牌记分板 ----------
      bu.shift.value = t * 0.02;
      this.pivot.visible = false; this.trail.visible = false; this.dust.visible = false;
      this.camera.position.set(0, 0, 50); this.camera.lookAt(0, 0, 0);
      this.renderTo(rt);
      // 比分：15:13 → 21:19，每一分都翻牌（每球得分）
      const seq = [[15, 13], [16, 13], [16, 14], [17, 14], [17, 15], [18, 15], [18, 16], [19, 16], [19, 17], [20, 17], [20, 18], [20, 19], [21, 19]];
      const start = c20 + 0.6, step = Math.max(0.28, (c21a - 1.6 - start) / seq.length);
      const idx = clamp(Math.floor((t - start) / step), -1, seq.length - 1);
      const kk = idx < 0 ? 1 : clamp(((t - start) - idx * step) / 0.32);
      const cur = seq[Math.max(0, idx)], prev = seq[Math.max(0, idx - 1)];
      const fade = smooth(c20 - 0.4, c20 + 0.4, t) * (1 - smooth(tCut - 0.5, tCut, t));
      ctx.save(); ctx.globalAlpha = fade;
      const W = 150, H = 220, cy = 392;
      for (const [side, cx] of [[0, 960 - 250], [1, 960 + 250]]) {
        const a = String(prev[side]).padStart(2, '0'), b = String(cur[side]).padStart(2, '0');
        for (let d = 0; d < 2; d++) {
          const changed = a[d] !== b[d];
          flapDigit(ctx, cx + (d - 0.5) * (W + 14), cy, W, H, changed ? a[d] : b[d], b[d], changed ? kk : 1);
        }
      }
      ctx.fillStyle = '#e9e2d4'; ctx.beginPath(); ctx.arc(960, cy - 34, 9, 0, Math.PI * 2); ctx.arc(960, cy + 34, 9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      revealText(ctx, '2006', 960, 120, seg(t, c20 - 0.2, c20 + 1.0, ease.linear) * fade, { font: '400 64px Cinzel', color: '#f2dcb0', tracking: 14, stagger: 0.15, blurMax: 8 });
      revealText(ctx, '每球得分 · 21 分制', 960, 650, seg(t, c20 + 0.8, c20 + 2.2, ease.linear) * fade, { font: '500 32px NotoSerifSC', color: '#efe4cf', tracking: 10, stagger: 0.06 });
      revealText(ctx, 'RALLY POINT SCORING  ·  21 POINTS × 3 GAMES', 960, 700, seg(t, c20 + 1.4, c20 + 2.8, ease.linear) * fade, { font: '400 16px Cinzel', color: '#c9b08a', tracking: 6, stagger: 0.012 });
    } else {
      // ---------- Part 2：565 km/h ----------
      const tb = t - tCut;
      const strike = c21b - tCut - 0.35;
      bu.shift.value = 0.3 + Math.max(0, tb - strike) * 0.05;
      this.pivot.visible = true; this.dust.visible = true;
      // 击球前：悬停、蓄力；击球：向右飞出；之后慢动作重放（子弹时间）
      let x, rotZ = 0, trailA = 0, trailLen = 0;
      const dirV = new THREE.Vector3(1, 0.06, 0).normalize();
      if (tb < strike) {
        x = -14 + Math.sin(tb * 1.2) * 0.3; rotZ = 0;
      } else if (tb < strike + 0.5) {
        const k = (tb - strike) / 0.5;
        x = lerp(-14, 160, ease.inExpo(k) * 0.9 + k * 0.1); trailA = 1; trailLen = Math.min(120, 6 + k * 200);
      } else {
        // 子弹时间：从左到右缓慢掠过
        const k = clamp((tb - strike - 0.5) / (D - tCut - strike - 0.5));
        x = lerp(-34, 30, ease.inOutSine(k)); trailA = 0.85; trailLen = 26;
      }
      this.pivot.position.set(x, 4.6 + x * 0.06, 0);
      this.pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirV);
      this.pivot.rotateY(tb * 6);
      this.trail.visible = trailA > 0;
      this.trail.scale.set(trailLen, 3.4, 1);
      this.trail.position.set(x - trailLen / 2 - 1.5, 4.6 + (x - trailLen / 2) * 0.06, 0);
      this.trail.rotation.z = Math.atan2(dirV.y, dirV.x);
      this.trail.material.uniforms.a.value = trailA;
      const cam = this.camera;
      const shake = tb > strike ? Math.exp(-(tb - strike) * 5) * 0.6 : 0;
      cam.position.set(noise1(t * 40, 1) * shake, 4.2 + noise1(t * 40, 2) * shake, 44);
      cam.lookAt(0, 4.4, 0);
      const du = this.dust.material.uniforms; du.time.value = t; du.focus.value = 44; du.pxScale.value = (this.H / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      du.burst.value = tb > strike ? ease.outCubic(clamp((tb - strike) / 0.8)) * 0.5 : 0; du.burstP.value.set(-14, 4.6, 0);
      this.renderTo(rt);
      // HUD：测速读数
      const kv = seg(tb, strike, strike + 0.9, ease.outCubic);
      const v = Math.round(565 * kv);
      const hudA = smooth(strike - 0.1, strike + 0.1, tb);
      if (hudA > 0) {
        const jit = (1 - kv) * 6;
        text(ctx, String(v), 960 + noise1(t * 50, 3) * jit, 300, { font: '400 230px BebasNeue', color: '#ffffff', alpha: hudA, glow: 24, glowColor: 'rgba(255,190,110,0.7)' });
        text(ctx, 'KM / H', 960, 432, { font: '400 34px BebasNeue', color: '#ffcf8a', alpha: hudA, tracking: 16 });
      }
      revealText(ctx, '2023', 150, 120, seg(tb, 0.2, 1.2, ease.linear) * (1 - hudA * 0.0), { font: '400 64px Cinzel', color: '#f2dcb0', align: 'left', tracking: 12, stagger: 0.15, blurMax: 8 });
      revealText(ctx, '最快杀球 · 吉尼斯世界纪录', 156, 182, seg(tb, 0.6, 1.8, ease.linear), { font: '500 26px NotoSerifSC', color: '#efe4cf', align: 'left', tracking: 6, stagger: 0.05 });
      revealText(ctx, 'SATWIKSAIRAJ RANKIREDDY  ·  INDIA', 158, 222, seg(tb, 1.0, 2.2, ease.linear), { font: '400 15px Cinzel', color: '#c9b08a', align: 'left', tracking: 5, stagger: 0.012 });
      // 对比条
      const bk = seg(t, c21b + 1.6, c21b + 3.4, ease.outCubic);
      if (bk > 0) {
        const x0 = 560, wMax = 800, y1 = 560, y2 = 628;
        ctx.save(); ctx.globalAlpha = smooth(c21b + 1.4, c21b + 1.9, t);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x0, y1 - 14, wMax, 28); ctx.fillRect(x0, y2 - 14, wMax, 28);
        ctx.fillStyle = '#8f9bb0'; ctx.fillRect(x0, y1 - 14, wMax * (372.6 / 565) * bk, 28);
        const g = ctx.createLinearGradient(x0, 0, x0 + wMax, 0); g.addColorStop(0, '#d98a3a'); g.addColorStop(1, '#ffe2a8');
        ctx.fillStyle = g; ctx.fillRect(x0, y2 - 14, wMax * bk, 28);
        ctx.restore();
        text(ctx, 'F1 赛车极速', x0 - 24, y1, { font: '500 24px NotoSerifSC', color: '#c9d0dc', align: 'right', alpha: smooth(c21b + 1.4, c21b + 1.9, t) });
        text(ctx, '羽毛球杀球', x0 - 24, y2, { font: '500 24px NotoSerifSC', color: '#ffd7a0', align: 'right', alpha: smooth(c21b + 1.4, c21b + 1.9, t) });
        text(ctx, `${(372.6 * bk).toFixed(1)} km/h`, x0 + wMax * (372.6 / 565) * bk + 16, y1, { font: '400 30px BebasNeue', color: '#c9d0dc', align: 'left', alpha: bk });
        text(ctx, `${Math.round(565 * bk)} km/h`, x0 + wMax * bk + 16, y2, { font: '400 30px BebasNeue', color: '#ffd7a0', align: 'left', alpha: bk });
      }
      grade = { ...grade, flash: tb > strike ? Math.exp(-(tb - strike) * 7) * 0.8 : 0, chroma: 0.0012 + (tb > strike ? 0.012 * Math.exp(-(tb - strike) * 4) : 0) };
    }
    const out = smooth(D - 0.8, D, t);
    grade.fade = out;
    return { overlay: true, grade };
  }
}
