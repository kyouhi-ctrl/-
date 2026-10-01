// 第七幕 · 走向世界：暗色地球仪，国界金线；1934 年光弧从英格兰射向九个创始成员；
// 1949 马来亚夺得首届汤姆斯杯；1957 美国女队夺得首届尤伯杯；镜头转向亚洲，亚洲诸国亮起。
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { NOISE } from '../engine/glsl.js';
import { clamp, lerp, seg, ease, smooth, fbm1, keyframes, invLerp } from '../engine/util.js';
import { project, revealText, text } from '../engine/overlay.js';

const R = 10;
export function ll(lat, lon, r = R) {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, -Math.cos(la) * Math.sin(lo) * r);
}

const PLACES = {
  england: { ll: [52.5, -1.5], zh: '英格兰', en: 'ENGLAND' },
  scotland: { ll: [56.6, -4.2], zh: '苏格兰', en: 'SCOTLAND' },
  wales: { ll: [52.3, -3.7], zh: '威尔士', en: 'WALES' },
  ireland: { ll: [53.2, -8.0], zh: '爱尔兰', en: 'IRELAND' },
  france: { ll: [46.6, 2.4], zh: '法国', en: 'FRANCE' },
  netherlands: { ll: [52.2, 5.3], zh: '荷兰', en: 'NETHERLANDS' },
  denmark: { ll: [56.0, 9.5], zh: '丹麦', en: 'DENMARK' },
  canada: { ll: [52.0, -100.0], zh: '加拿大', en: 'CANADA' },
  newzealand: { ll: [-41.5, 172.5], zh: '新西兰', en: 'NEW ZEALAND' },
  malaya: { ll: [4.2, 102.0], zh: '马来亚', en: 'MALAYA' },
  usa: { ll: [39.5, -98.4], zh: '美国', en: 'USA' },
};
const FOUNDERS = ['scotland', 'wales', 'ireland', 'france', 'netherlands', 'denmark', 'canada', 'newzealand'];
const HL = { // 高亮国家 → id
  'United Kingdom': 1, Ireland: 2, France: 3, Netherlands: 4, Denmark: 5, Canada: 6, 'New Zealand': 7,
  Malaysia: 8, 'United States of America': 9,
  China: 10, Indonesia: 11, Japan: 12, 'South Korea': 13, India: 14, Thailand: 15,
};

export class World extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.camera.fov = 30; this.camera.near = 0.5; this.camera.far = 500; this.camera.updateProjectionMatrix();
    this.ready = false;
    this.hlA = new Float32Array(16); this.hlB = new Float32Array(16);
    // 星空背景
    this.stars = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: /* glsl */ `${NOISE} uniform float time; varying vec2 vUv;
        void main(){ vec2 q = vUv * vec2(2.388, 1.0);
          vec3 c = vec3(0.004, 0.006, 0.012) + vec3(0.02, 0.03, 0.06) * (fbm4(q * 1.5) * 0.5 + 0.5) * 0.5;
          vec2 g = floor(q * 300.0), f = fract(q * 300.0); float h = hash12(g); vec2 o = hash22(g) * 0.8 + 0.1;
          c += vec3(0.8, 0.85, 1.0) * step(0.988, h) * exp(-dot(f - o, f - o) * 260.0) * (0.6 + 0.4 * sin(time + h * 40.0));
          gl_FragColor = vec4(c, 1.0); }`,
      depthTest: false, depthWrite: false,
    }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -10;
    this.scene.add(this.stars);
    this.globeGroup = new THREE.Group(); this.scene.add(this.globeGroup);
    this.buildTextures();
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), new THREE.ShaderMaterial({
      uniforms: { land: { value: this.landTex }, ids: { value: this.idTex }, hlA: { value: this.hlA }, hlB: { value: this.hlB }, time: { value: 0 }, sunDir: { value: new THREE.Vector3(-0.4, 0.5, 0.8).normalize() } },
      vertexShader: `varying vec3 vN, vWN, vP; void main(){ vN = normalize(position); vWN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `${NOISE}
        uniform sampler2D land, ids; uniform float hlA[16], hlB[16]; uniform float time; uniform vec3 sunDir;
        varying vec3 vN, vWN, vP;
        void main(){
          float lat = asin(clamp(vN.y, -1.0, 1.0)), lon = atan(-vN.z, vN.x);
          vec2 uv = vec2((lon + 3.14159265) / 6.2831853, (lat + 1.5707963) / 3.14159265);
          vec4 L = texture2D(land, uv);
          float id = floor(texture2D(ids, uv).r * 255.0 + 0.5);
          float a = 0.0, b = 0.0;
          for (int i = 0; i < 16; i++) { if (abs(id - float(i)) < 0.5) { a = hlA[i]; b = hlB[i]; } }
          vec3 V = normalize(cameraPosition - vP);
          float fres = pow(1.0 - max(0.0, dot(normalize(vWN), V)), 3.0);
          float lit = 0.25 + 0.75 * max(0.0, dot(normalize(vWN), sunDir));
          vec3 ocean = vec3(0.002, 0.006, 0.016) * (0.8 + 0.4 * fbm4(uv * 40.0));
          vec3 landC = vec3(0.022, 0.028, 0.036) * (0.8 + 0.4 * fbm4(uv * 90.0));
          vec3 c = mix(ocean, landC, L.r) * lit;
          c += vec3(0.85, 0.65, 0.35) * L.g * 0.22;                     // 国界金线
          c += vec3(1.1, 0.72, 0.32) * a * L.r * (0.45 + 0.55 * L.g * 3.0); // 创始成员 / 冠军：金色
          c += vec3(1.0, 0.32, 0.12) * b * L.r * (0.45 + 0.55 * L.g * 3.0); // 亚洲：朱红
          // 经纬网
          float gl = smoothstep(0.012, 0.0, abs(fract(lat * 57.3 / 15.0) - 0.5) - 0.49) + smoothstep(0.012, 0.0, abs(fract(lon * 57.3 / 15.0) - 0.5) - 0.49);
          c += vec3(0.2, 0.35, 0.6) * gl * 0.05;
          c += vec3(0.25, 0.45, 0.9) * pow(fres, 1.6) * 0.55;                // 大气边缘
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    this.globeGroup.add(this.globe);
    // 大气光晕
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 96, 64), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vWN, vP; void main(){ vWN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `varying vec3 vWN, vP; void main(){ vec3 V = normalize(cameraPosition - vP); float d = dot(normalize(vWN), V);
        float k = pow(clamp(1.0 + d, 0.0, 1.0), 6.0) * smoothstep(-0.02, -0.35, d); gl_FragColor = vec4(vec3(0.25, 0.5, 1.0) * k * 1.1, 1.0); }`,
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(atmo);
    // 光弧：英格兰 → 各创始成员
    const from = PLACES.england.ll;
    this.arcs = FOUNDERS.map((k, i) => this.makeArc(from, PLACES[k].ll, i));
    this.arcsGroup = new THREE.Group(); this.arcs.forEach((a) => this.arcsGroup.add(a.mesh)); this.globeGroup.add(this.arcsGroup);
    // 地点光柱
    this.pins = {};
    for (const k of Object.keys(PLACES)) {
      const p = ll(...PLACES[k].ll);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.06, 1.0, 8, 1, true), new THREE.ShaderMaterial({
        uniforms: { a: { value: 0 }, col: { value: new THREE.Color(2.4, 1.6, 0.7) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float a; uniform vec3 col; varying vec2 vUv; void main(){ gl_FragColor = vec4(col * a * (1.0 - vUv.y) * 1.5, 1.0); }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.position.copy(p.clone().multiplyScalar(1 + 0.05));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
      this.globeGroup.add(m);
      this.pins[k] = m;
    }
  }

  buildTextures() {
    const W = 4096, H = 2048;
    const land = document.createElement('canvas'); land.width = W; land.height = H;
    const idc = document.createElement('canvas'); idc.width = W; idc.height = H;
    const lc = land.getContext('2d'), ic = idc.getContext('2d');
    ic.fillStyle = '#000'; ic.fillRect(0, 0, W, H);
    lc.fillStyle = '#000'; lc.fillRect(0, 0, W, H);
    const X = (lon) => (lon + 180) / 360 * W, Y = (lat) => (90 - lat) / 180 * H;
    const xhr = new XMLHttpRequest(); xhr.open('GET', '/build/geo.json', false); xhr.send();
    const geo = JSON.parse(xhr.responseText);
    const pathOf = (c) => { const p = new Path2D(); for (const poly of c.polys) for (const ring of poly) { ring.forEach(([lo, la], i) => (i ? p.lineTo(X(lo), Y(la)) : p.moveTo(X(lo), Y(la)))); p.closePath(); } return p; };
    for (const c of geo.countries) {
      const p = pathOf(c);
      lc.fillStyle = 'rgb(255,0,0)'; lc.fill(p, 'evenodd');
      const id = HL[c.name];
      if (id) { ic.fillStyle = `rgb(${id},${id},${id})`; ic.fill(p, 'evenodd'); }
    }
    lc.globalCompositeOperation = 'lighter';
    lc.strokeStyle = 'rgb(0,255,0)'; lc.lineWidth = 1.6;
    for (const c of geo.countries) lc.stroke(pathOf(c));
    this.landTex = this.track(new THREE.CanvasTexture(land)); this.landTex.anisotropy = 8;
    this.idTex = this.track(new THREE.CanvasTexture(idc));
    this.idTex.magFilter = THREE.NearestFilter; this.idTex.minFilter = THREE.NearestFilter; this.idTex.generateMipmaps = false;
  }

  makeArc(a, b, i) {
    const A = ll(...a), B = ll(...b);
    const ang = A.angleTo(B);
    const pts = [];
    for (let k = 0; k <= 64; k++) {
      const u = k / 64;
      const v = new THREE.Vector3().copy(A).normalize().multiplyScalar(Math.sin((1 - u) * ang)).add(B.clone().normalize().multiplyScalar(Math.sin(u * ang))).divideScalar(Math.sin(ang)).normalize();
      v.multiplyScalar(R * (1 + 0.015 + Math.sin(Math.PI * u) * (0.04 + Math.min(ang, 1.0) * 0.14)));
      pts.push(v);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 128, 0.035, 8, false), new THREE.ShaderMaterial({
      uniforms: { prog: { value: 0 }, fade: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float prog, fade; varying vec2 vUv;
        void main(){ float u = vUv.x; if (u > prog) discard; float head = exp(-pow((u - prog) / 0.03, 2.0));
          vec3 c = vec3(1.6, 1.05, 0.5) * (0.35 + 0.65 * smoothstep(prog - 0.5, prog, u)) + vec3(4.0, 3.0, 1.8) * head;
          gl_FragColor = vec4(c * fade, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    return { mesh, B, i };
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const c13 = info.cue('v13'), c14a = info.cue('v14a'), c14b = info.cue('v14b'), c15 = info.cue('v15'), c15e = info.cue('v15', 1);
    this.stars.material.uniforms.time.value = t;
    // 镜头：经纬度关键帧（欧洲 → 马来亚 → 太平洋 → 美国 → 回到亚洲）
    const lat = keyframes(t, [[0, 42], [c13 + 2.5, 30], [c14a - 0.6, 30], [c14a + 1.2, 12], [c14b - 0.4, 12], [c14b + 1.2, 30], [c15 - 0.3, 30], [c15 + 1.6, 22], [D, 20]], ease.inOutCubic);
    const lon = keyframes(t, [[0, 2], [c13 + 3.5, -25], [c14a - 0.6, -25], [c14a + 1.2, 100], [c14b - 0.4, 108], [c14b + 1.2, 262], [c15 - 0.3, 262], [c15 + 1.8, 108], [D, 102]], ease.inOutCubic);
    const dist = keyframes(t, [[0, 40], [c13 + 3.0, 60], [c14a - 0.6, 62], [c14a + 1.0, 50], [c14b + 1.2, 54], [c15, 56], [c15 + 1.8, 50], [D, 48]], ease.inOutCubic);
    const cam = this.camera;
    cam.position.copy(ll(lat, lon, dist));
    const right = new THREE.Vector3().crossVectors(cam.position.clone().normalize(), new THREE.Vector3(0, 1, 0)).normalize();
    cam.up.set(0, 1, 0);
    cam.lookAt(right.clone().multiplyScalar(dist * 0.16));
    // 高亮
    const founders = [1, 2, 3, 4, 5, 6, 7];
    this.hlA.fill(0); this.hlB.fill(0);
    const fK = smooth(c13 + 0.6, c13 + 1.6, t) * (1 - 0.6 * smooth(c14a - 0.5, c14a + 0.5, t));
    this.hlA[1] = fK;
    this.arcs.forEach((arc, i) => {
      const t0 = c13 + 0.9 + i * 0.32, t1 = t0 + 1.6;
      arc.mesh.material.uniforms.prog.value = seg(t, t0, t1, ease.inOutCubic);
      arc.mesh.material.uniforms.fade.value = 1 - smooth(c14a - 0.6, c14a + 0.4, t);
    });
    const arrive = (k) => { const i = FOUNDERS.indexOf(k); return i < 0 ? 0 : smooth(c13 + 0.9 + i * 0.32 + 1.4, c13 + 0.9 + i * 0.32 + 1.8, t); };
    const map = { ireland: 2, france: 3, netherlands: 4, denmark: 5, canada: 6, newzealand: 7 };
    for (const [k, id] of Object.entries(map)) this.hlA[id] = arrive(k) * (1 - 0.6 * smooth(c14a - 0.5, c14a + 0.5, t));
    this.hlA[8] = smooth(c14a + 0.6, c14a + 1.4, t) * (1 - 0.5 * smooth(c15 - 0.3, c15 + 0.5, t));
    this.hlA[9] = smooth(c14b + 0.8, c14b + 1.6, t) * (1 - 0.7 * smooth(c15 - 0.3, c15 + 0.5, t));
    const asia = [10, 11, 8, 12, 13, 14, 15];
    asia.forEach((id, i) => { this.hlB[id] = smooth(c15 + 1.2 + i * 0.18, c15 + 1.8 + i * 0.18, t); });
    for (const [k, m] of Object.entries(this.pins)) {
      let a = 0;
      if (k === 'england') a = smooth(c13 + 0.3, c13 + 1.0, t) * (1 - smooth(c14a - 0.5, c14a + 0.5, t));
      else if (FOUNDERS.includes(k)) a = arrive(k) * (1 - smooth(c14a - 0.5, c14a + 0.5, t));
      else if (k === 'malaya') a = smooth(c14a + 0.6, c14a + 1.4, t) * (1 - smooth(c14b - 0.3, c14b + 0.3, t));
      else if (k === 'usa') a = smooth(c14b + 0.8, c14b + 1.6, t) * (1 - smooth(c15 - 0.3, c15 + 0.3, t));
      m.material.uniforms.a.value = a;
      m.visible = a > 0.001;
    }
    this.renderTo(rt);

    // ---- 文字 ----
    this.scene.updateMatrixWorld(true);
    const labelAt = (k, a, dx = 14, dy = -10) => {
      if (a <= 0.01) return;
      const P = ll(...PLACES[k].ll, R * 1.02);
      const n = P.clone().normalize();
      if (n.dot(cam.position.clone().normalize()) < 0.15) return;  // 背面不显示
      const s = project(P, cam, this.W, this.H);
      text(ctx, PLACES[k].zh, s.x + dx, s.y + dy, { font: '500 20px NotoSerifSC', color: '#f4e2bf', align: 'left', alpha: a, tracking: 2 });
      text(ctx, PLACES[k].en, s.x + dx, s.y + dy + 22, { font: '400 12px Cinzel', color: '#cdb48a', align: 'left', alpha: a * 0.85, tracking: 3 });
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#ffd99a'; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    const out13 = 1 - smooth(c14a - 0.6, c14a, t);
    labelAt('england', smooth(c13 + 0.3, c13 + 1.0, t) * out13, -14, -10);
    for (const k of FOUNDERS) if (!['scotland', 'wales'].includes(k)) labelAt(k, arrive(k) * out13);
    labelAt('malaya', smooth(c14a + 0.8, c14a + 1.6, t) * (1 - smooth(c14b - 0.4, c14b, t)));
    labelAt('usa', smooth(c14b + 1.0, c14b + 1.8, t) * (1 - smooth(c15 - 0.4, c15, t)));
    const block = (y0, a, lines) => lines.forEach((l, i) => revealText(ctx, l.t, 150, y0 + i * (l.gap || 0), a, { font: l.f, color: l.c, align: 'left', tracking: l.tr || 0, stagger: l.st ?? 0.06, blurMax: 8, alpha: l.al ?? 1 }));
    const k13 = seg(t, c13 - 0.2, c13 + 1.4, ease.linear) * out13;
    revealText(ctx, '1934', 150, 130, k13, { font: '400 92px Cinzel', color: '#f2dcb0', align: 'left', tracking: 14, stagger: 0.15, blurMax: 10 });
    revealText(ctx, '国际羽毛球联合会成立', 156, 210, seg(t, c13 + 0.4, c13 + 1.8, ease.linear) * out13, { font: '500 28px NotoSerifSC', color: '#ead6b4', align: 'left', tracking: 8, stagger: 0.06 });
    revealText(ctx, 'INTERNATIONAL BADMINTON FEDERATION', 158, 252, seg(t, c13 + 0.8, c13 + 2.2, ease.linear) * out13, { font: '400 16px Cinzel', color: '#d6bd90', align: 'left', tracking: 5, stagger: 0.012 });
    const nF = Math.round(clamp(invLerp(c13 + 1.0, c13 + 0.9 + 7 * 0.32 + 1.8, t)) * 9);
    if (k13 > 0.5) {
      text(ctx, String(Math.max(1, nF)), 150, 360, { font: '400 120px BebasNeue', color: '#f6d58e', align: 'left', alpha: out13 * smooth(c13 + 0.9, c13 + 1.5, t) });
      text(ctx, '创始成员  FOUNDING MEMBERS', 238, 372, { font: '500 20px NotoSerifSC', color: '#e8d4ae', align: 'left', alpha: out13 * smooth(c13 + 1.0, c13 + 1.8, t), tracking: 4 });
    }
    const o14a = 1 - smooth(c14b - 0.5, c14b, t);
    revealText(ctx, '1949', 150, 130, seg(t, c14a, c14a + 1.2, ease.linear) * o14a, { font: '400 92px Cinzel', color: '#f2dcb0', align: 'left', tracking: 14, stagger: 0.15, blurMax: 10 });
    revealText(ctx, '首届汤姆斯杯 · 马来亚夺冠', 156, 210, seg(t, c14a + 0.4, c14a + 1.8, ease.linear) * o14a, { font: '500 28px NotoSerifSC', color: '#ead6b4', align: 'left', tracking: 8, stagger: 0.06 });
    revealText(ctx, 'THOMAS CUP  ·  MALAYA', 158, 252, seg(t, c14a + 0.8, c14a + 2.2, ease.linear) * o14a, { font: '400 16px Cinzel', color: '#d6bd90', align: 'left', tracking: 5, stagger: 0.02 });
    const o14b = 1 - smooth(c15 - 0.5, c15, t);
    revealText(ctx, '1957', 150, 130, seg(t, c14b, c14b + 1.2, ease.linear) * o14b, { font: '400 92px Cinzel', color: '#f2dcb0', align: 'left', tracking: 14, stagger: 0.15, blurMax: 10 });
    revealText(ctx, '首届尤伯杯 · 美国女队登顶', 156, 210, seg(t, c14b + 0.4, c14b + 1.8, ease.linear) * o14b, { font: '500 28px NotoSerifSC', color: '#ead6b4', align: 'left', tracking: 8, stagger: 0.06 });
    revealText(ctx, 'UBER CUP  ·  UNITED STATES', 158, 252, seg(t, c14b + 0.8, c14b + 2.2, ease.linear) * o14b, { font: '400 16px Cinzel', color: '#d6bd90', align: 'left', tracking: 5, stagger: 0.02 });
    const k15 = seg(t, c15 + 1.0, c15 + 2.6, ease.linear) * (1 - smooth(D - 0.8, D, t));
    revealText(ctx, '亚 洲', 150, 140, k15, { font: '600 64px NotoSerifSC', color: '#ffb48a', align: 'left', tracking: 20, stagger: 0.2, blurMax: 10 });
    revealText(ctx, 'THE CENTRE OF THE GAME SHIFTS EAST', 158, 214, seg(t, c15 + 1.6, c15 + 3.0, ease.linear) * (1 - smooth(D - 0.8, D, t)), { font: '400 16px Cinzel', color: '#e6b48e', align: 'left', tracking: 5, stagger: 0.012 });
    return {
      overlay: true,
      grade: { exposure: 1.1, bloom: 0.7, bloomThreshold: 0.8, halation: 0.25, vignette: 0.55, grain: 0.04, saturation: 1.05, contrast: 1.06, chroma: 0.0018, shadowTint: [-0.006, 0.0, 0.014] },
    };
  }
}
