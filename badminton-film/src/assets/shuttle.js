// 程序化羽毛球：羽毛纹理（羽轴 + 数百根羽枝）、16 根羽毛、软木球托、两圈扎线。
// 单位：厘米。球托底部在 y=0，羽毛沿 +y 展开。
import * as THREE from 'three';
import { mulberry32 } from '../engine/util.js';

// ---------- 共享光照（光束 + 主光 + 补光），所有自定义材质共用同一份 uniform ----------
export function makeLighting() {
  return {
    keyDir: { value: new THREE.Vector3(-0.38, 1, -0.5).normalize() },
    keyColor: { value: new THREE.Color(1.0, 0.84, 0.64).multiplyScalar(1.7) },
    fillDir: { value: new THREE.Vector3(-0.7, 0.15, 0.7).normalize() },
    fillColor: { value: new THREE.Color(0.32, 0.42, 0.6).multiplyScalar(0.22) },
    ambient: { value: new THREE.Color(0.012, 0.015, 0.022) },
    beamA: { value: new THREE.Vector3(0, 0, 0) },
    beamD: { value: new THREE.Vector3(-0.38, 1, -0.5).normalize() },
    beamR: { value: 9.0 },
    beamOn: { value: 1.0 },
  };
}

const LIT_COMMON = /* glsl */ `
uniform vec3 keyDir, keyColor, fillDir, fillColor, ambient, beamA, beamD;
uniform float beamR, beamOn;
float beamMask(vec3 p){ vec3 pa = p - beamA; float d = length(pa - beamD * dot(pa, beamD)); return smoothstep(beamR, beamR * 0.45, d) * beamOn; }
`;

const VERT = /* glsl */ `
varying vec3 vN, vP; varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// ---------- 羽毛纹理 ----------
let _featherTex = null;
export function featherTexture() {
  if (_featherTex) return _featherTex;
  const Wc = 512, Hc = 1280;
  const cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc;
  const ctx = cv.getContext('2d');
  const rnd = mulberry32(7);
  const X = (u) => u * Wc, Y = (v) => (1 - v) * Hc;
  const V0 = 0.37; // 羽片起点（以下为裸羽轴）
  const halfW = (v, side) => {
    if (v < V0) return 0;
    const maxW = side < 0 ? 0.42 : 0.47;
    let w = maxW * Math.min(1, Math.pow((v - V0) / 0.2, 0.8));
    if (v > 0.8) w *= Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.8) / 0.2, 2)));
    return w;
  };
  // 羽片轮廓
  const outline = new Path2D();
  outline.moveTo(X(0.5), Y(V0));
  for (let v = V0; v <= 1.0001; v += 0.005) outline.lineTo(X(0.5 + halfW(v, 1)), Y(v));
  for (let v = 1; v >= V0 - 0.0001; v -= 0.005) outline.lineTo(X(0.5 - halfW(v, -1)), Y(v));
  outline.closePath();

  // 底色：极淡的羽片薄膜
  ctx.save(); ctx.clip(outline);
  const g = ctx.createLinearGradient(0, Y(1), 0, Y(V0));
  g.addColorStop(0, 'rgba(250,247,240,0.26)'); g.addColorStop(1, 'rgba(240,236,228,0.18)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, Wc, Hc);
  // 羽枝：从羽轴斜向外、向上生长，带弯曲，偶有分叉缝隙
  for (const side of [-1, 1]) {
    let v = V0 - 0.02;
    let gapRun = 0;
    while (v < 1.0) {
      v += 0.0016 + rnd() * 0.0012;
      if (gapRun > 0) { gapRun--; continue; }
      if (rnd() < 0.012) { gapRun = 2 + Math.floor(rnd() * 5); continue; }
      const ang = (38 + rnd() * 10) * Math.PI / 180;
      const len = 0.62 + rnd() * 0.1;
      const x0 = X(0.5 + side * 0.006), y0 = Y(v);
      const dx = Math.cos(ang) * len * Wc * side, dy = -Math.sin(ang) * len * Wc;
      const bend = (0.1 + rnd() * 0.08) * len * Wc;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + dx * 0.55, y0 + dy * 0.45, x0 + dx, y0 + dy - bend);
      const a = 0.3 + rnd() * 0.6;
      const c = 236 + Math.floor(rnd() * 19);
      ctx.strokeStyle = `rgba(${c},${c - 3},${c - 9},${a})`;
      ctx.lineWidth = 1.0 + rnd() * 0.9;
      ctx.stroke();
    }
  }
  // 靠近羽轴更亮、边缘更透
  const eg = ctx.createLinearGradient(X(0), 0, X(1), 0);
  eg.addColorStop(0, 'rgba(0,0,0,0.0)'); eg.addColorStop(0.5, 'rgba(255,255,255,0.10)'); eg.addColorStop(1, 'rgba(0,0,0,0.0)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = eg; ctx.fillRect(0, 0, Wc, Hc);
  ctx.restore();

  // 羽轴（由粗到细，根部半透明的羽根）
  for (let i = 0; i < 400; i++) {
    const v = i / 400;
    const w = (0.036 * (1 - v) + 0.008 * v) * Wc;
    const a = v < 0.12 ? 0.75 : 0.95;
    ctx.fillStyle = v < 0.12 ? `rgba(232,226,210,${a})` : `rgba(250,248,242,${a})`;
    ctx.fillRect(X(0.5) - w / 2, Y(v + 1 / 400), w, Hc / 400 + 1);
  }
  // 羽轴高光
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 400; i++) { const v = i / 400; const w = (0.01 * (1 - v) + 0.002 * v) * Wc; ctx.fillRect(X(0.5) - w * 0.2, Y(v + 1 / 400), w * 0.4, Hc / 400 + 1); }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  _featherTex = tex;
  return tex;
}

// ---------- 羽毛几何：带弧度的平面，根部在原点 ----------
export const FEATHER_W = 2.7, FEATHER_H = 6.9;
export function featherGeometry() {
  const g = new THREE.PlaneGeometry(FEATHER_W, FEATHER_H, 14, 36);
  g.translate(0, FEATHER_H / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const v = y / FEATHER_H;
    const cup = -0.30 * Math.pow(x / (FEATHER_W / 2), 2) * Math.min(1, v * 1.6);
    const bow = 0.12 * v * v;
    p.setZ(i, cup + bow);
  }
  g.computeVertexNormals();
  return g;
}

export function featherMaterial(lighting, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...lighting, map: { value: featherTexture() }, emissive: { value: 0 }, opacity: { value: 1 }, tint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${LIT_COMMON}
      uniform sampler2D map; uniform float emissive, opacity; uniform vec3 tint;
      varying vec3 vN, vP; varying vec2 vUv;
      void main(){
        vec4 tx = texture2D(map, vUv);
        float a = tx.a * opacity;
        if (a < 0.02) discard;
        vec3 V = normalize(cameraPosition - vP);
        vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;
        float beam = beamMask(vP);
        vec3 alb = tx.rgb * tint;
        float ndl = dot(N, keyDir);
        float wrap = max(0.0, (ndl + 0.4) / 1.4);
        float trans = pow(max(0.0, dot(-V, keyDir)), 2.5) * 0.85 + 0.22 * max(0.0, -ndl);
        vec3 col = alb * (keyColor * beam * (wrap * 0.55 + trans) + fillColor * max(0.0, dot(N, fillDir) * 0.6 + 0.4) + ambient);
        float rim = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
        col += keyColor * beam * rim * 0.12 * alb;
        col += alb * emissive;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, ...opts,
  });
}

// ---------- 软木球托 ----------
export function corkGeometry() {
  const pts = [];
  const R = 1.3;
  for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * R + 1e-4, R + Math.sin(a) * R)); }
  pts.push(new THREE.Vector2(R, 2.3));
  pts.push(new THREE.Vector2(R - 0.04, 2.5));
  pts.push(new THREE.Vector2(R - 0.12, 2.55));
  pts.push(new THREE.Vector2(0.0, 2.55));
  return new THREE.LatheGeometry(pts, 64);
}

export function corkMaterial(lighting) {
  return new THREE.ShaderMaterial({
    uniforms: { ...lighting, emissive: { value: 0 }, stripe: { value: new THREE.Color(0.025, 0.035, 0.08) } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${LIT_COMMON}
      uniform float emissive; uniform vec3 stripe;
      varying vec3 vN, vP; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 V = normalize(cameraPosition - vP);
        vec3 N = normalize(vN);
        float y = vUv.y;
        // 皮革细微颗粒
        float gr = h(floor(vUv * vec2(260.0, 90.0))) * 0.06;
        vec3 alb = vec3(0.78, 0.76, 0.72) - gr;
        float gold = smoothstep(0.855, 0.86, y) * (1.0 - smoothstep(0.868, 0.873, y));
        float band = smoothstep(0.62, 0.64, y) * (1.0 - smoothstep(0.86, 0.88, y));
        alb = mix(alb, stripe, band); alb = mix(alb, vec3(0.75, 0.55, 0.22), gold);
        float beam = beamMask(vP);
        float ndl = max(0.0, dot(N, keyDir));
        vec3 H = normalize(keyDir + V);
        float spec = pow(max(0.0, dot(N, H)), 40.0) * 0.35;
        vec3 col = alb * (keyColor * beam * (ndl * 0.85 + 0.08) + fillColor * max(0.0, dot(N, fillDir) * 0.6 + 0.4) + ambient) + keyColor * beam * spec * 0.25;
        float rim = pow(1.0 - max(0.0, dot(N, V)), 4.0);
        col += keyColor * beam * rim * 0.18;
        col += alb * emissive;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function threadMaterial(lighting) {
  return new THREE.ShaderMaterial({
    uniforms: { ...lighting, opacity: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${LIT_COMMON}
      uniform float opacity;
      varying vec3 vN, vP; varying vec2 vUv;
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP);
        float beam = beamMask(vP);
        float twist = 0.85 + 0.15 * sin(vUv.x * 900.0);
        vec3 alb = vec3(0.92, 0.88, 0.78) * twist;
        vec3 col = alb * (keyColor * beam * (max(0.0, dot(N, keyDir)) * 0.7 + 0.25) + fillColor * 0.6 + ambient);
        gl_FragColor = vec4(col, opacity);
      }`,
    transparent: true,
  });
}

// ---------- 组装：返回羽毛球 group 及各部件 ----------
export const SHUTTLE = { ringR: 1.02, tilt: 19 * Math.PI / 180, baseY: 2.5, count: 16, twist: 14 * Math.PI / 180 };

// 第 i 根羽毛在球体局部坐标中的最终位姿
export function featherSlot(i) {
  const phi = (i / SHUTTLE.count) * Math.PI * 2;
  const pos = new THREE.Vector3(Math.cos(phi) * SHUTTLE.ringR, SHUTTLE.baseY, Math.sin(phi) * SHUTTLE.ringR);
  // 先绕自身轴扭转，再向外倾斜，最后绕球轴旋转到位置
  const q = new THREE.Quaternion();
  const qTwist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SHUTTLE.twist);
  const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), SHUTTLE.tilt);
  // 平面法线 +z 指向外侧：先让 +z 朝外，再倾斜
  const qFace = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -phi + Math.PI / 2);
  q.copy(qFace).multiply(qTilt).multiply(qTwist);
  return { pos, quat: q };
}

export function createShuttle(lighting, opts = {}) {
  const group = new THREE.Group();
  const fGeo = featherGeometry();
  const feathers = [];
  for (let i = 0; i < SHUTTLE.count; i++) {
    const m = new THREE.Mesh(fGeo, featherMaterial(lighting));
    const s = featherSlot(i);
    m.position.copy(s.pos); m.quaternion.copy(s.quat);
    m.renderOrder = 2;
    group.add(m); feathers.push(m);
  }
  const cork = new THREE.Mesh(corkGeometry(), corkMaterial(lighting));
  group.add(cork);
  const rings = [];
  const tMat = threadMaterial(lighting);
  for (const h of [1.55, 2.45]) {
    const r = SHUTTLE.ringR + Math.sin(SHUTTLE.tilt) * h + 0.05;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 96), tMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = SHUTTLE.baseY + h * Math.cos(SHUTTLE.tilt);
    ring.renderOrder = 1;
    group.add(ring); rings.push(ring);
  }
  return { group, feathers, cork, rings, threadMat: tMat };
}
