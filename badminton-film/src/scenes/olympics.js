// 第九幕 · 奥运：几何小人跳杀（1992 巴塞罗那成为正式项目）→ 单枚金牌（1996 葛菲/顾俊）→
// 五枚金牌依次点亮（2012 伦敦包揽）→ 两枚金牌（林丹 2008 / 2012 卫冕）。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BaseScene } from '../engine/base.js';
import { NOISE } from '../engine/glsl.js';
import { clamp, lerp, seg, ease, smooth, fbm1, mulberry32, invLerp } from '../engine/util.js';
import { revealText, text } from '../engine/overlay.js';

// ---------- 几何小人（2D 骨架）----------
const POSES = [
  // torso, head, rUpper, rFore, lUpper, lFore, lThigh, lShin, rThigh, rShin, racket, hipY
  [184, 186, -95, 178, 150, 162, 16, 4, -16, -6, 12, 0],        // 引拍：肘在肩后，拍头垂在背后，左手指球
  [196, 192, -105, 192, 140, 152, 72, -8, -22, -62, -14, -72],   // 起跳：身体后仰成弓，前腿提膝
  [174, 176, 168, 162, 48, 24, 32, 6, -38, -78, 156, -96],       // 击球：手臂伸直，在头前上方击球
  [150, 154, 72, 24, -58, -82, 36, 0, -26, -32, -24, -12],       // 随挥：拍子收向身体另一侧，落地
];
function poseAt(u) {
  // u ∈ [0,1) 循环：0 准备 → 0.35 起跳蓄力 → 0.55 击球 → 0.8 随挥 → 1 回到准备
  const keys = [0, 0.35, 0.55, 0.8, 1.0];
  const ps = [POSES[0], POSES[1], POSES[2], POSES[3], POSES[0]];
  let i = 0; while (i < keys.length - 2 && u > keys[i + 1]) i++;
  const k = ease.inOutCubic(clamp((u - keys[i]) / (keys[i + 1] - keys[i])));
  return ps[i].map((v, j) => {
    let a = ps[i][j], b = ps[i + 1][j];
    if (j < 11) { let d = ((b - a + 540) % 360) - 180; return a + d * k; }
    return lerp(a, b, k);
  });
}
const dir = (deg) => { const r = deg * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; };
function drawAthlete(ctx, x, y, s, P, { color = '#fff', alpha = 1, onlyArm = false } = {}) {
  ctx.save(); ctx.translate(x, y + P[11] * s); ctx.scale(s, s);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = alpha;
  const seg2 = (p, ang, len, w) => { const d = dir(ang); const q = [p[0] + d[0] * len, p[1] + d[1] * len]; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); return q; };
  const hip = [0, 0];
  const td = dir(P[0]);
  const neck = [hip[0] + td[0] * 112, hip[1] + td[1] * 112];
  const sh = [hip[0] + td[0] * 98, hip[1] + td[1] * 98];        // 肩略低于颈
  if (!onlyArm) {
    const lk = seg2(hip, P[8], 84, 26); seg2(lk, P[9], 84, 23);  // 后腿
    const le = seg2(sh, P[4], 64, 21); seg2(le, P[5], 58, 18);   // 左臂
    seg2(hip, P[0], 112, 36);                                     // 躯干
    const fk = seg2(hip, P[6], 84, 26); seg2(fk, P[7], 84, 23);  // 前腿
    const hd = dir(P[1]);
    const head = [neck[0] + hd[0] * 40, neck[1] + hd[1] * 40];
    ctx.beginPath(); ctx.arc(head[0], head[1], 27, 0, Math.PI * 2); ctx.fill();
  }
  const re = seg2(sh, P[2], 64, 21); const rh = seg2(re, P[3], 58, 18);
  const rd = dir(P[10]);
  const tip = [rh[0] + rd[0] * 64, rh[1] + rd[1] * 64];
  ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(rh[0], rh[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
  ctx.save(); ctx.translate(tip[0] + rd[0] * 30, tip[1] + rd[1] * 30); ctx.rotate(-P[10] * Math.PI / 180);
  ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, 0, 21, 31, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha *= 0.35; ctx.lineWidth = 1.2; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 5.5, -28); ctx.lineTo(i * 5.5, 28); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-19, i * 7.5); ctx.lineTo(19, i * 7.5); ctx.stroke(); }
  ctx.restore();
  ctx.restore();
  return { racket: [x + (tip[0] + rd[0] * 30) * s, y + (P[11] + tip[1] + rd[1] * 30) * s] };
}

// ---------- 金牌 ----------
function medalHeight(label) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
  c.fillStyle = '#5a5a5a'; c.fillRect(0, 0, S, S);
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  c.lineWidth = 34; c.beginPath(); c.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 6; c.beginPath(); c.arc(S / 2, S / 2, S * 0.40, 0, Math.PI * 2); c.stroke();
  // 月桂花环
  for (const side of [-1, 1]) for (let i = 0; i < 13; i++) {
    const a = Math.PI / 2 + side * (0.25 + i * 0.19); const r = S * 0.335;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    c.save(); c.translate(x, y); c.rotate(a + side * 0.6); c.beginPath(); c.ellipse(0, 0, 17, 40, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
  // 中央羽毛球
  c.save(); c.translate(S / 2, S / 2 + 20);
  c.beginPath(); c.moveTo(-95, -150); c.lineTo(95, -150); c.lineTo(42, 40); c.lineTo(-42, 40); c.closePath(); c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1;
  c.lineWidth = 7; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 28, -150); c.lineTo(i * 12, 40); c.stroke(); }
  c.beginPath(); c.arc(0, 75, 52, 0, Math.PI * 2); c.fill();
  c.restore();
  c.font = '700 62px Cinzel'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, S / 2, S * 0.83);
  c.filter = 'blur(2px)'; c.drawImage(cv, 0, 0);
  const tex = new THREE.CanvasTexture(cv); return tex;
}

function medal(mat, ribbonColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.36, 128, 1), mat);
  body.rotation.x = Math.PI / 2; g.add(body);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 12, 32), mat); loop.position.y = 3.25; g.add(loop);
  const rib = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 9, 1, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(ribbonColor).multiplyScalar(0.45), roughness: 0.6, side: THREE.DoubleSide }));
  rib.position.set(0, 7.9, -0.15); g.add(rib);
  return g;
}

export class Olympics extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.camera.fov = 26; this.camera.updateProjectionMatrix();
    const pm = new THREE.PMREMGenerator(this.r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); this.track(this.env);
    this.scene.environment = this.env; this.scene.environmentIntensity = 0.7;
    // 背景
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(0.02, 0.04, 0.09) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: /* glsl */ `${NOISE} uniform float time; uniform vec3 tint; varying vec2 vUv;
        void main(){ vec2 q = vUv * vec2(2.388, 1.0); float v = exp(-dot((vUv - vec2(0.6, 0.55)) * vec2(1.6, 1.0), (vUv - vec2(0.6, 0.55)) * vec2(1.6, 1.0)) * 3.0);
          float rays = pow(max(0.0, sin(atan(vUv.y - 1.3, vUv.x - 0.6) * 18.0 + time * 0.1)), 6.0) * smoothstep(1.2, 0.2, length(vUv - vec2(0.6, 1.2)));
          vec3 c = tint * (0.4 + 1.6 * v) + vec3(1.0, 0.8, 0.5) * rays * 0.02 + tint * fbm4(q * 2.0 + time * 0.03) * 0.3;
          gl_FragColor = vec4(c, 1.0); }`,
      depthTest: false, depthWrite: false,
    }));
    this.bg.frustumCulled = false; this.bg.renderOrder = -10; this.scene.add(this.bg);
    const gold = (label) => { const h = medalHeight(label); this.track(h); return new THREE.MeshStandardMaterial({ color: new THREE.Color(1.0, 0.74, 0.34), metalness: 1, roughness: 0.28, bumpMap: h, bumpScale: 6 }); };
    this.single = medal(gold('1996'), 0x9a1b1b); this.scene.add(this.single);
    this.five = [];
    const labels = ['男单', '女单', '男双', '女双', '混双'];
    for (let i = 0; i < 5; i++) { const m = medal(gold('2012'), 0xa01818); m.position.set((i - 2) * 7.2, 0, 0); m.userData.label = labels[i]; this.scene.add(m); this.five.push(m); }
    this.lin = [medal(gold('2008'), 0xa61b1b), medal(gold('2012'), 0xa61b1b)];
    this.lin[0].position.set(3.6, 0, 0); this.lin[1].position.set(11.6, 0, 0);
    this.lin.forEach((m) => this.scene.add(m));
    this.key = new THREE.SpotLight(new THREE.Color(1, 0.9, 0.75), 900, 120, 0.5, 0.7, 2); this.key.position.set(-8, 18, 22); this.scene.add(this.key, this.key.target);
    this.rimL = new THREE.PointLight(new THREE.Color(1.0, 0.55, 0.25), 220, 60, 2); this.rimL.position.set(10, 6, -8); this.scene.add(this.rimL);
    this.trail = [];
  }

  shots(info) {
    const c17 = info.cue('v17'), c18 = info.cue('v18'), c19a = info.cue('v19a'), c19b = info.cue('v19b');
    return [c18 - 0.4, c19a - 0.4, c19b - 0.2];   // 切镜时刻
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const c17 = info.cue('v17'), c18 = info.cue('v18'), c19a = info.cue('v19a'), c19b = info.cue('v19b');
    const [s1, s2, s3] = this.shots(info);
    const shot = t < s1 ? 0 : t < s2 ? 1 : t < s3 ? 2 : 3;
    const sinceCut = t - [0, s1, s2, s3][shot];
    this.bg.material.uniforms.time.value = t;
    const cam = this.camera;
    this.single.visible = shot === 1; this.five.forEach((m) => (m.visible = shot === 2)); this.lin.forEach((m) => (m.visible = shot === 3));
    this.bg.material.uniforms.tint.value.set(...(shot === 0 ? [0.015, 0.035, 0.09] : [0.05, 0.025, 0.015]));
    if (shot === 0) {
      cam.position.set(0, 0, 40); cam.lookAt(0, 0, 0);
    } else if (shot === 1) {
      this.single.rotation.y = Math.sin(sinceCut * 0.6) * 0.7 - 0.2; this.single.position.set(5, -0.8, 0);
      cam.position.set(lerp(2, 4, sinceCut / 6), 0.6, lerp(30, 24, seg(sinceCut, 0, 6.5, ease.outCubic))); cam.lookAt(0.6, 0.2, 0);
    } else if (shot === 2) {
      this.five.forEach((m, i) => { const on = smooth(0.4 + i * 0.45, 0.8 + i * 0.45, sinceCut); m.rotation.y = (1 - on) * 1.6 + Math.sin(t * 0.8 + i) * 0.12; m.position.y = -1.5 + (1 - ease.outCubic(on)) * -6; });
      cam.position.set(0, 1.5, lerp(56, 50, seg(sinceCut, 0, 4, ease.inOutSine))); cam.lookAt(0, 0.8, 0);
    } else {
      this.lin.forEach((m, i) => { m.rotation.y = Math.sin(t * 0.7 + i * 1.5) * 0.35; m.position.y = -1.2; });
      cam.position.set(lerp(1, 6, seg(sinceCut, 0, 6, ease.inOutSine)), 0.8, 36); cam.lookAt(4.0, 0.6, 0);
    }
    this.renderTo(rt);
    let flash = Math.max(0, 1 - sinceCut * 4) * (shot > 0 ? 0.45 : 0);

    // ---------------- 叠加 ----------------
    if (shot === 0) {
      const u = (t * 0.32) % 1;
      // 残影
      for (let k = 6; k >= 1; k--) { const uu = (((t - k * 0.035) * 0.32) % 1 + 1) % 1; drawAthlete(ctx, 1240, 610, 1.12, poseAt(uu), { color: '#ffd7a0', alpha: 0.07 * (7 - k), onlyArm: true }); }
      const r = drawAthlete(ctx, 1240, 610, 1.12, poseAt(u), { color: '#f7f2ea' });
      // 击球瞬间的羽毛球
      const hit = u - 0.55;
      if (hit > 0 && hit < 0.4) { const k = hit / 0.4; const sx = r.racket[0] + 60 + k * 900, sy = r.racket[1] + k * 420;
        ctx.save(); ctx.strokeStyle = 'rgba(255,220,170,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - 180 * (1 - k * 0.5), sy - 84); ctx.lineTo(sx, sy); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      revealText(ctx, '1992', 150, 140, seg(t, c17 - 0.3, c17 + 1.0, ease.linear), { font: '400 120px BebasNeue', color: '#ffffff', align: 'left', tracking: 10, stagger: 0.12, blurMax: 10 });
      revealText(ctx, 'BARCELONA', 156, 228, seg(t, c17 + 0.3, c17 + 1.6, ease.linear), { font: '400 30px Cinzel', color: '#f2c58a', align: 'left', tracking: 16, stagger: 0.05 });
      revealText(ctx, '羽毛球正式成为奥运会比赛项目', 156, 286, seg(t, c17 + 1.6, c17 + 3.2, ease.linear), { font: '500 28px NotoSerifSC', color: '#eadfcf', align: 'left', tracking: 6, stagger: 0.04 });
      revealText(ctx, 'AN OFFICIAL OLYMPIC SPORT', 158, 328, seg(t, c17 + 2.2, c17 + 3.6, ease.linear), { font: '400 16px Cinzel', color: '#c8b08c', align: 'left', tracking: 6, stagger: 0.015 });
    } else if (shot === 1) {
      revealText(ctx, '1996', 150, 140, seg(sinceCut, 0.2, 1.4, ease.linear), { font: '400 120px BebasNeue', color: '#ffe2ae', align: 'left', tracking: 10, stagger: 0.12, blurMax: 10 });
      revealText(ctx, 'ATLANTA', 156, 228, seg(sinceCut, 0.5, 1.8, ease.linear), { font: '400 30px Cinzel', color: '#f2c58a', align: 'left', tracking: 16, stagger: 0.05 });
      revealText(ctx, '葛菲 / 顾俊 · 女子双打', 156, 290, seg(t, c18 + 0.6, c18 + 2.0, ease.linear), { font: '600 32px NotoSerifSC', color: '#fff1d6', align: 'left', tracking: 6, stagger: 0.06 });
      revealText(ctx, '中国第一枚奥运羽毛球金牌', 156, 340, seg(t, c18 + 1.6, c18 + 3.2, ease.linear), { font: '500 26px NotoSerifSC', color: '#ead6b4', align: 'left', tracking: 6, stagger: 0.05 });
      revealText(ctx, "GE FEI / GU JUN  ·  CHINA'S FIRST OLYMPIC BADMINTON GOLD", 158, 382, seg(t, c18 + 2.2, c18 + 3.8, ease.linear), { font: '400 15px Cinzel', color: '#c8b08c', align: 'left', tracking: 4, stagger: 0.008 });
    } else if (shot === 2) {
      revealText(ctx, '2012  ·  LONDON', 960, 96, seg(sinceCut, 0.1, 1.2, ease.linear), { font: '400 40px Cinzel', color: '#ffe2ae', tracking: 14, stagger: 0.04 });
      revealText(ctx, '中国队包揽全部五枚金牌', 960, 156, seg(sinceCut, 0.6, 2.0, ease.linear), { font: '600 32px NotoSerifSC', color: '#fff1d6', tracking: 10, stagger: 0.06 });
      this.scene.updateMatrixWorld(true);
      this.five.forEach((m, i) => {
        const on = smooth(0.6 + i * 0.45, 1.0 + i * 0.45, sinceCut);
        const p = m.position.clone().add(new THREE.Vector3(0, -4.0, 0)).project(cam);
        text(ctx, m.userData.label, (p.x + 1) / 2 * this.W, (1 - p.y) / 2 * this.H, { font: '500 26px NotoSerifSC', color: '#f0dcb5', alpha: on, tracking: 6 });
      });
      const n = Math.min(5, Math.floor(clamp((sinceCut - 0.6) / 0.45 + 1, 0, 5)));
      text(ctx, `${n} / 5`, 960, 712, { font: '400 54px BebasNeue', color: '#ffd38a', alpha: smooth(0.5, 1.0, sinceCut), tracking: 8 });
    } else {
      revealText(ctx, '林丹', 150, 150, seg(sinceCut, 0.2, 1.2, ease.linear), { font: '700 76px NotoSerifSC', color: '#fff1d6', align: 'left', tracking: 20, stagger: 0.2, blurMax: 10 });
      revealText(ctx, 'LIN DAN', 156, 226, seg(sinceCut, 0.5, 1.6, ease.linear), { font: '400 26px Cinzel', color: '#f2c58a', align: 'left', tracking: 16, stagger: 0.05 });
      revealText(ctx, '2008 北京  ·  2012 伦敦', 156, 290, seg(sinceCut, 0.9, 2.2, ease.linear), { font: '500 28px NotoSerifSC', color: '#ead6b4', align: 'left', tracking: 6, stagger: 0.05 });
      revealText(ctx, '奥运史上第一位卫冕男单冠军', 156, 342, seg(sinceCut, 1.6, 3.2, ease.linear), { font: '500 28px NotoSerifSC', color: '#ffd38a', align: 'left', tracking: 6, stagger: 0.05 });
      revealText(ctx, 'FIRST MAN TO DEFEND THE OLYMPIC SINGLES TITLE', 158, 384, seg(sinceCut, 2.2, 3.8, ease.linear), { font: '400 15px Cinzel', color: '#c8b08c', align: 'left', tracking: 4, stagger: 0.01 });
    }
    const out = 1 - smooth(D - 0.9, D, t);
    return {
      overlay: true,
      grade: { exposure: 1.05 * out + 0.0001, bloom: 0.7, bloomThreshold: 0.85, halation: 0.3, vignette: 0.6, grain: 0.04, saturation: 1.05, contrast: 1.08, chroma: 0.0016, flash, highTint: [0.02, 0.006, -0.018] },
    };
  }
}
