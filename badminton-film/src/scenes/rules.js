// 第六幕 · 规则：烛光书桌上，羊皮纸自动写出“规则”（1877）；红色火漆印章压下（1893）；
// 切到黑色赛场，金色光线一笔一笔画出球场（1899 全英锦标赛）。
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { NOISE } from '../engine/glsl.js';
import { clamp, lerp, seg, ease, smooth, fbm1, mulberry32, invLerp } from '../engine/util.js';
import { revealText, text } from '../engine/overlay.js';

const VERT = `varying vec2 vUv; varying vec3 vP, vN; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const LAMP = new THREE.Vector3(-14, 22, 6);

function pseudoWords(rnd, n) {
  const L = 'etaoinshrdlucmfwypvbgk';
  const out = [];
  for (let i = 0; i < n; i++) { let w = ''; const len = 2 + Math.floor(rnd() * 7); for (let j = 0; j < len; j++) w += L[Math.floor(Math.pow(rnd(), 1.6) * L.length)]; out.push(w); }
  return out.join(' ');
}

export class Rules extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    // ===== Part A：书桌与羊皮纸 =====
    this.camera.fov = 30; this.camera.updateProjectionMatrix();
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(200, 140), new THREE.ShaderMaterial({
      uniforms: { lamp: { value: LAMP } }, vertexShader: VERT,
      fragmentShader: /* glsl */ `${NOISE} uniform vec3 lamp; varying vec3 vP; varying vec2 vUv;
        void main(){ float grain = fbm(vec2(vP.x * 0.35, vP.z * 4.0)) * 0.5 + 0.5; float rings = sin(vP.z * 2.2 + fbm4(vP.xz * 0.3) * 6.0) * 0.5 + 0.5;
          vec3 wood = mix(vec3(0.10, 0.045, 0.02), vec3(0.22, 0.11, 0.05), grain * 0.7 + rings * 0.3);
          float d = length(vP - lamp); float pool = 900.0 / (d * d) * exp(-length(vP.xz - lamp.xz * vec2(0.4, 0.5)) * 0.045);
          gl_FragColor = vec4(wood * (pool * 1.6 + 0.02) * vec3(1.0, 0.8, 0.6), 1.0); }`,
    }));
    desk.rotation.x = -Math.PI / 2;
    this.sceneA = this.scene; this.sceneA.add(desk);
    // 纸张画布
    this.pW = 1600; this.pH = 1120;
    this.paperCv = document.createElement('canvas'); this.paperCv.width = this.pW; this.paperCv.height = this.pH;
    this.paperBase = this.makePaperBase();
    this.paperTex = this.track(new THREE.CanvasTexture(this.paperCv)); this.paperTex.colorSpace = THREE.SRGBColorSpace; this.paperTex.anisotropy = 8;
    const pg = new THREE.PlaneGeometry(32, 22.4, 40, 30);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i); pp.setZ(i, 0.25 * Math.pow(Math.abs(x) / 16, 3) + 0.15 * Math.pow(Math.abs(y) / 11.2, 3)); }
    pg.computeVertexNormals();
    this.paper = new THREE.Mesh(pg, new THREE.ShaderMaterial({
      uniforms: { map: { value: this.paperTex }, lamp: { value: LAMP } }, vertexShader: VERT,
      fragmentShader: `uniform sampler2D map; uniform vec3 lamp; varying vec2 vUv; varying vec3 vP, vN;
        void main(){ vec3 L = normalize(lamp - vP); float d = length(lamp - vP); float k = 1100.0 / (d * d);
          vec3 c = texture2D(map, vUv).rgb * (max(0.0, dot(normalize(vN), L)) * k * vec3(1.0, 0.82, 0.62) + 0.03);
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    this.paper.rotation.x = -Math.PI / 2; this.paper.rotation.z = 0.06; this.paper.position.y = 0.05;
    this.sceneA.add(this.paper);
    // 火漆印章
    this.seal = this.makeSeal();
    this.seal.position.set(10.5, 0.2, 6.5);
    this.seal.rotation.y = Math.PI / 2;
    this.sceneA.add(this.seal);

    // ===== Part B：金色光线勾画的球场 =====
    this.sceneB = new THREE.Scene();
    this.camB = new THREE.PerspectiveCamera(30, eng.W / eng.H, 0.1, 500);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */ `${NOISE} varying vec3 vP; void main(){ float n = fbm4(vP.xz * 0.4) * 0.5 + 0.5;
        float v = exp(-dot(vP.xz, vP.xz) * 0.004);
        vec3 c = mix(vec3(0.006, 0.012, 0.012), vec3(0.02, 0.045, 0.04), n) * (0.3 + 1.4 * v);
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    floor.rotation.x = -Math.PI / 2; this.sceneB.add(floor);
    // 场地线（羽毛球场：13.40 × 6.10 米）
    const HL = 6.7, HW = 3.05, sw = 2.59, ss = 1.98, ls = 5.94;
    this.lines = [
      [[-HL, -HW], [HL, -HW]], [[HL, -HW], [HL, HW]], [[HL, HW], [-HL, HW]], [[-HL, HW], [-HL, -HW]],
      [[-HL, -sw], [HL, -sw]], [[-HL, sw], [HL, sw]],
      [[-ss, -HW], [-ss, HW]], [[ss, -HW], [ss, HW]],
      [[-ls, -HW], [-ls, HW]], [[ls, -HW], [ls, HW]],
      [[-HL, 0], [-ss, 0]], [[ss, 0], [HL, 0]],
    ].map((seg2, i) => {
      const [a, b] = seg2.map((p) => new THREE.Vector3(p[0], 0.01, p[1]));
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.85), transparent: true }));
      m.rotation.x = -Math.PI / 2;
      const dir = b.clone().sub(a).normalize();
      m.rotation.z = -Math.atan2(dir.z, dir.x);
      this.sceneB.add(m);
      const head = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.ShaderMaterial({
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float a; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(vec3(4.0, 2.6, 1.2) * exp(-r * r * 9.0) * a, 1.0); }`,
        uniforms: { a: { value: 0 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      head.rotation.x = -Math.PI / 2; this.sceneB.add(head);
      return { a, b, len, m, head, dir };
    });
    // 球网
    this.netB = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 0.76), new THREE.ShaderMaterial({
      uniforms: { a: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float a; varying vec2 vUv; void main(){ vec2 g = abs(fract(vUv * vec2(160.0, 20.0)) - 0.5); float l = step(0.4, max(g.x, g.y)); float tape = step(0.9, vUv.y);
        float al = max(l * 0.5, tape) * a; if (al < 0.01) discard; gl_FragColor = vec4(vec3(2.0, 1.7, 1.3) * max(l, tape), al); }`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.netB.position.set(0, 1.55 - 0.38, 0); this.netB.rotation.y = Math.PI / 2; this.sceneB.add(this.netB);
  }

  makePaperBase() {
    const cv = document.createElement('canvas'); cv.width = this.pW; cv.height = this.pH;
    const c = cv.getContext('2d'); const rnd = mulberry32(77);
    c.fillStyle = '#d8c7a0'; c.fillRect(0, 0, this.pW, this.pH);
    for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${120 + rnd() * 60},${90 + rnd() * 40},${50 + rnd() * 30},${rnd() * 0.05})`; c.beginPath(); c.arc(rnd() * this.pW, rnd() * this.pH, 4 + rnd() * 60, 0, Math.PI * 2); c.fill(); }
    const g = c.createRadialGradient(this.pW / 2, this.pH / 2, this.pH * 0.3, this.pW / 2, this.pH / 2, this.pW * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,50,20,0.45)');
    c.fillStyle = g; c.fillRect(0, 0, this.pW, this.pH);
    c.strokeStyle = 'rgba(70,40,20,0.6)'; c.lineWidth = 3; c.strokeRect(70, 70, this.pW - 140, this.pH - 140);
    c.lineWidth = 1; c.strokeRect(82, 82, this.pW - 164, this.pH - 164);
    return cv;
  }

  drawPaper(prog) {
    const c = this.paperCv.getContext('2d');
    c.drawImage(this.paperBase, 0, 0);
    const ink = 'rgba(40,24,12,0.92)';
    const rnd = mulberry32(5);
    const items = [
      { t: 'THE  LAWS  OF  BADMINTON', font: '700 64px CormorantGaramond', x: 800, y: 190, align: 'center' },
      { t: 'M D C C C L X X V I I', font: 'italic 500 30px CormorantGaramond', x: 800, y: 250, align: 'center' },
    ];
    const heads = ['I.  The Court', 'II.  The Net', 'III.  The Shuttlecock', 'IV.  The Service', 'V.  The Game'];
    let y = 330;
    for (const h of heads) {
      items.push({ t: h, font: '700 30px CormorantGaramond', x: 170, y, align: 'left' }); y += 40;
      for (let k = 0; k < 2; k++) { items.push({ t: pseudoWords(rnd, 13), font: 'italic 300 24px CormorantGaramond', x: 200, y, align: 'left' }); y += 32; }
      y += 22;
    }
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const k = clamp(prog * n - i);
      if (k <= 0) break;
      const it = items[i];
      c.save(); c.font = it.font; c.fillStyle = ink; c.textAlign = it.align; c.textBaseline = 'middle';
      const w = c.measureText(it.t).width;
      const x0 = it.align === 'center' ? it.x - w / 2 : it.x;
      c.beginPath(); c.rect(x0 - 4, it.y - 40, (w + 8) * ease.inOutSine(k), 80); c.clip();
      c.fillText(it.t, it.x, it.y);
      c.restore();
    }
    this.paperTex.needsUpdate = true;
  }

  makeSeal() {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(2.6, 2.75, 0.55, 72, 1);
    const p = geo.attributes.position; const rnd = mulberry32(9);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const a = Math.atan2(z, x); const r = Math.hypot(x, z); if (r > 2.0) { const k = 1 + 0.06 * Math.sin(a * 7 + 1) + 0.04 * Math.sin(a * 13); p.setX(i, x * k); p.setZ(i, z * k); } }
    geo.computeVertexNormals();
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 10; c.strokeStyle = '#fff'; c.beginPath(); c.arc(256, 256, 200, 0, Math.PI * 2); c.stroke();
    c.font = '700 150px CormorantGaramond'; c.fillText('B·A', 256, 236);
    c.font = '700 64px Cinzel'; c.fillText('1893', 256, 350);
    c.filter = 'blur(3px)'; c.drawImage(cv, 0, 0);
    const hm = new THREE.CanvasTexture(cv);
    const mat = new THREE.ShaderMaterial({
      uniforms: { hmap: { value: hm }, lamp: { value: LAMP } }, vertexShader: VERT,
      fragmentShader: `uniform sampler2D hmap; uniform vec3 lamp; varying vec2 vUv; varying vec3 vP, vN;
        void main(){ vec3 N = normalize(vN);
          if (N.y > 0.9) { vec2 uv = (vP.xz - vec2(0.0)) ; }
          vec2 tuv = vUv; float h = texture2D(hmap, tuv).r;
          float hx = texture2D(hmap, tuv + vec2(0.004, 0.0)).r - texture2D(hmap, tuv - vec2(0.004, 0.0)).r;
          float hy = texture2D(hmap, tuv + vec2(0.0, 0.004)).r - texture2D(hmap, tuv - vec2(0.0, 0.004)).r;
          if (N.y > 0.9) N = normalize(vec3(-hx * 3.0, 1.0, hy * 3.0));
          vec3 L = normalize(lamp - vP); vec3 V = normalize(cameraPosition - vP); vec3 H = normalize(L + V);
          float d = length(lamp - vP); float k = 1100.0 / (d * d);
          vec3 alb = vec3(0.45, 0.03, 0.025) * (N.y > 0.9 ? (0.8 + 0.4 * h) : 1.0);
          vec3 c = alb * (max(0.0, dot(N, L)) * k + 0.04) + pow(max(0.0, dot(N, H)), 60.0) * k * 0.6;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    return g;
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const c11a = info.cue('v11a'), c11b = info.cue('v11b'), c12a = info.cue('v12a'), c12b = info.cue('v12b');
    const tSwitch = c12a - 0.5;
    let flash = 0;
    if (t < tSwitch) {
      // ---- Part A ----
      this.drawPaper(seg(t, 0.3, c11b + 1.5, ease.linear));
      const sk = seg(t, c11b + 0.3, c11b + 0.9, ease.inCubic);
      const settle = seg(t, c11b + 0.9, c11b + 1.4, ease.outCubic);
      this.seal.position.y = lerp(14, 0.28, sk);
      const squash = sk >= 1 ? 1 - 0.25 * Math.exp(-(t - c11b - 0.9) * 10) * Math.cos((t - c11b - 0.9) * 30) : 1;
      this.seal.scale.set(1 + (1 - squash) * 0.3, squash * (0.6 + 0.4 * settle), 1 + (1 - squash) * 0.3);
      this.seal.visible = t > c11b;
      const cam = this.camera;
      const k = seg(t, 0, tSwitch, ease.inOutSine);
      cam.position.set(lerp(-6, 4, k), lerp(30, 25, k), lerp(20, 17, k));
      cam.lookAt(lerp(-2, 3, k), 0, lerp(-1, 1.5, k));
      this.renderTo(rt, this.sceneA, cam);
      const shake = t > c11b + 0.9 ? Math.exp(-(t - c11b - 0.9) * 12) : 0;
      if (shake > 0.01) { /* 印章落下时的轻微震动 */ cam.position.y += shake * 0.3; }
      const out = 1 - smooth(tSwitch - 0.4, tSwitch, t);
      revealText(ctx, '1877', 1770, 120, seg(t, c11a - 0.2, c11a + 1.0, ease.linear), { font: '400 92px Cinzel', color: '#f2dcb0', align: 'right', tracking: 14, stagger: 0.15, blurMax: 10, alpha: out * (1 - smooth(c11b - 0.3, c11b + 0.3, t)) });
      revealText(ctx, '第一部成文规则', 1764, 196, seg(t, c11a + 0.5, c11a + 1.8, ease.linear), { font: '500 26px NotoSerifSC', color: '#ead6b4', align: 'right', tracking: 8, stagger: 0.08, alpha: out * (1 - smooth(c11b - 0.3, c11b + 0.3, t)) });
      revealText(ctx, '1893', 1770, 120, seg(t, c11b + 0.8, c11b + 1.8, ease.linear), { font: '400 92px Cinzel', color: '#f2dcb0', align: 'right', tracking: 14, stagger: 0.15, blurMax: 10, alpha: out });
      revealText(ctx, '英格兰羽毛球协会成立', 1764, 196, seg(t, c11b + 1.2, c11b + 2.4, ease.linear), { font: '500 26px NotoSerifSC', color: '#ead6b4', align: 'right', tracking: 8, stagger: 0.06, alpha: out });
      revealText(ctx, 'THE BADMINTON ASSOCIATION', 1766, 238, seg(t, c11b + 1.6, c11b + 2.8, ease.linear), { font: '400 17px Cinzel', color: '#d6bd90', align: 'right', tracking: 6, stagger: 0.02, alpha: out * 0.9 });
      flash = 0;
    } else {
      // ---- Part B ----
      const tb = t - tSwitch;
      const n = this.lines.length;
      for (let i = 0; i < n; i++) {
        const L = this.lines[i];
        const t0 = 0.3 + i * 0.32, t1 = t0 + 0.6;
        const k = seg(tb, t0, t1, ease.inOutCubic);
        const pos = L.a.clone().lerp(L.b, k * 0.5);
        L.m.scale.x = Math.max(1e-3, L.len * k);
        L.m.position.copy(pos);
        L.m.material.opacity = k > 0 ? 1 : 0;
        const tip = L.a.clone().lerp(L.b, k);
        L.head.position.set(tip.x, 0.03, tip.z);
        L.head.material.uniforms.a.value = (k > 0 && k < 1) ? 1 : Math.max(0, 1 - (tb - t1) * 3) * (k >= 1 ? 1 : 0);
      }
      this.netB.material.uniforms.a.value = seg(tb, 0.3 + n * 0.32, 0.3 + n * 0.32 + 0.8, ease.outCubic);
      const cam = this.camB;
      const ang = -0.9 + tb * 0.07;
      const R = lerp(17, 14.5, seg(tb, 0, D - tSwitch, ease.inOutSine));
      cam.position.set(Math.cos(ang) * R, lerp(11, 8, seg(tb, 0, 8, ease.inOutSine)), Math.sin(ang) * R + 3);
      cam.lookAt(0, 0, 0);
      this.renderTo(rt, this.sceneB, cam);
      flash = Math.exp(-tb * 5) * 0.7;
      revealText(ctx, '1899', 150, 120, seg(t, c12a - 0.2, c12a + 1.0, ease.linear), { font: '400 92px Cinzel', color: '#f2dcb0', align: 'left', tracking: 14, stagger: 0.15, blurMax: 10 });
      revealText(ctx, '首届全英锦标赛 · 伦敦', 156, 196, seg(t, c12a + 0.4, c12a + 1.8, ease.linear), { font: '500 26px NotoSerifSC', color: '#ead6b4', align: 'left', tracking: 8, stagger: 0.06 });
      revealText(ctx, 'ALL ENGLAND CHAMPIONSHIPS  ·  LONDON', 158, 238, seg(t, c12a + 0.8, c12a + 2.2, ease.linear), { font: '400 17px Cinzel', color: '#d6bd90', align: 'left', tracking: 6, stagger: 0.015 });
      revealText(ctx, '世界上最古老的羽毛球赛事', 960, 700, seg(t, c12b + 0.3, c12b + 1.8, ease.linear), { font: '500 30px NotoSerifSC', color: '#f0dcb0', tracking: 12, stagger: 0.06 });
      revealText(ctx, "THE WORLD'S OLDEST BADMINTON TOURNAMENT", 960, 744, seg(t, c12b + 0.8, c12b + 2.4, ease.linear), { font: '400 16px Cinzel', color: '#cdb38a', tracking: 7, stagger: 0.01 });
    }
    return {
      overlay: true,
      grade: { exposure: 1.1, bloom: 0.65, bloomThreshold: 0.9, halation: 0.3, vignette: 0.6, grain: 0.045, saturation: 1.0, contrast: 1.06, chroma: 0.0016, flash, highTint: [0.02, 0.008, -0.016] },
    };
  }
}
