// 程序化毽子：三枚“五铢”铜钱叠成底座 + 红布 + 羽管 + 一簇公鸡羽毛（铜橙 / 墨绿闪彩 / 米白）。单位：厘米。
import * as THREE from 'three';
import { mulberry32 } from '../engine/util.js';

const VERT = /* glsl */ `
varying vec3 vN, vP; varying vec2 vUv;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;

export function makeDaylight() {
  return {
    keyDir: { value: new THREE.Vector3(-0.55, 0.75, 0.45).normalize() },
    keyColor: { value: new THREE.Color(1.0, 0.95, 0.86).multiplyScalar(1.15) },
    ambient: { value: new THREE.Color(0.80, 0.755, 0.66).multiplyScalar(0.32) },
  };
}

function coinTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'); const rnd = mulberry32(21);
  const g = c.createRadialGradient(S * 0.4, S * 0.35, S * 0.05, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#b0814a'); g.addColorStop(0.6, '#8a5f33'); g.addColorStop(1, '#5c3d20');
  c.fillStyle = g; c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.fill();
  // 铜绿斑驳
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 26;
    c.fillStyle = `rgba(${60 + rnd() * 40},${110 + rnd() * 40},${90 + rnd() * 30},${0.06 + rnd() * 0.14})`;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  // 外郭与内郭（凸起的边）
  c.strokeStyle = 'rgba(214,170,110,0.75)'; c.lineWidth = 16; c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 12, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(40,25,10,0.5)'; c.lineWidth = 4; c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 22, 0, Math.PI * 2); c.stroke();
  const h = S * 0.17;
  c.strokeStyle = 'rgba(214,170,110,0.8)'; c.lineWidth = 14; c.strokeRect(S / 2 - h - 6, S / 2 - h - 6, 2 * h + 12, 2 * h + 12);
  // 钱文“五铢”
  c.fillStyle = 'rgba(222,180,120,0.9)'; c.font = '120px MaShanZheng'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('五', S * 0.24, S / 2 + 4); c.fillText('铢', S * 0.76, S / 2 + 4);
  // 方孔（透明）
  c.globalCompositeOperation = 'destination-out'; c.fillRect(S / 2 - h, S / 2 - h, 2 * h, 2 * h);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function plumeTexture(kind, seed) {
  const Wc = 128, Hc = 1024, cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc;
  const c = cv.getContext('2d'); const rnd = mulberry32(seed);
  const X = (u) => u * Wc, Y = (v) => (1 - v) * Hc;
  const hw = (v) => (v < 0.04 ? 0 : 0.48 * Math.pow(Math.sin(Math.PI * Math.min(1, (v - 0.04) / 0.96) * 0.9), 0.55) * (1 - 0.35 * v));
  const path = new Path2D(); path.moveTo(X(0.5), Y(0.05));
  for (let v = 0.05; v <= 1; v += 0.01) path.lineTo(X(0.5 + hw(v)), Y(v));
  for (let v = 1; v >= 0.05; v -= 0.01) path.lineTo(X(0.5 - hw(v)), Y(v));
  path.closePath();
  c.save(); c.clip(path);
  const palBase = { copper: 'rgba(170,82,24,0.55)', dark: 'rgba(16,26,20,0.6)', cream: 'rgba(222,206,180,0.55)' };
  c.fillStyle = 'rgba(0,0,0,0)';
  const pal = {
    copper: [[120, 52, 14], [205, 112, 34], [238, 170, 70]],
    dark: [[10, 14, 12], [22, 40, 30], [40, 70, 55]],
    cream: [[150, 120, 90], [225, 210, 185], [248, 240, 222]],
  }[kind];
  c.fillStyle = palBase[kind]; c.fillRect(0, 0, Wc, Hc);
  for (let i = 0; i < 900; i++) {
    const v = 0.05 + rnd() * 0.95, side = rnd() < 0.5 ? -1 : 1;
    const k = Math.min(1, v * 1.3 + (rnd() - 0.5) * 0.2);
    const col = k < 0.5 ? pal[0].map((a, j) => a + (pal[1][j] - a) * k * 2) : pal[1].map((a, j) => a + (pal[2][j] - a) * (k - 0.5) * 2);
    c.strokeStyle = `rgba(${col.map(Math.round).join(',')},${0.55 + rnd() * 0.45})`;
    c.lineWidth = 1 + rnd() * 1.5;
    c.beginPath(); c.moveTo(X(0.5), Y(v));
    c.quadraticCurveTo(X(0.5 + side * 0.25), Y(v + 0.01), X(0.5 + side * 0.6), Y(v + 0.05 + rnd() * 0.03)); c.stroke();
  }
  if (kind === 'copper') { // 中央黑色条纹（公鸡蓑羽特征）
    c.globalAlpha = 0.6; c.fillStyle = '#140c06'; c.fillRect(X(0.42), 0, X(0.16), Hc); c.globalAlpha = 1;
  }
  c.restore();
  c.fillStyle = 'rgba(235,220,190,0.9)';
  for (let i = 0; i < 200; i++) { const v = i / 200; const w = (0.05 * (1 - v) + 0.01) * Wc; c.fillRect(X(0.5) - w / 2, Y(v + 0.005), w, Hc / 200 + 1); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

export function createJianzi(light) {
  const group = new THREE.Group();
  const U = (extra) => ({ ...light, ...extra });
  // 铜钱
  const cTex = coinTexture();
  const faceMat = new THREE.ShaderMaterial({
    uniforms: U({ map: { value: cTex } }), vertexShader: VERT, side: THREE.DoubleSide,
    fragmentShader: /* glsl */ `uniform sampler2D map; uniform vec3 keyDir, keyColor, ambient; varying vec3 vN, vP; varying vec2 vUv;
      void main(){ vec4 tx = texture2D(map, vUv); if (tx.a < 0.5) discard; vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP); if (dot(N,V) < 0.0) N = -N;
        vec3 H = normalize(keyDir + V); float spec = pow(max(0.0, dot(N, H)), 30.0);
        vec3 c = tx.rgb * (keyColor * max(0.0, dot(N, keyDir)) + ambient) + keyColor * spec * 0.35 * vec3(1.0, 0.8, 0.55);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sideMat = new THREE.ShaderMaterial({
    uniforms: U({}), vertexShader: VERT,
    fragmentShader: /* glsl */ `uniform vec3 keyDir, keyColor, ambient; varying vec3 vN, vP;
      void main(){ vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP); vec3 H = normalize(keyDir + V);
        vec3 alb = vec3(0.42, 0.26, 0.12); float spec = pow(max(0.0, dot(N, H)), 24.0);
        gl_FragColor = vec4(alb * (keyColor * max(0.0, dot(N, keyDir)) + ambient) + keyColor * spec * 0.4 * vec3(1.0, 0.75, 0.5), 1.0); }`,
  });
  const coinGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.13, 64, 1, false);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(coinGeo, [sideMat, faceMat, faceMat]);
    m.position.set((i - 1) * 0.04, i * 0.135, (i % 2) * 0.05);
    m.rotation.y = i * 0.7;
    group.add(m);
  }
  // 红布与羽管
  const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: U({}), vertexShader: VERT,
    fragmentShader: /* glsl */ `uniform vec3 keyDir, keyColor, ambient; varying vec3 vN, vP; varying vec2 vUv;
      void main(){ vec3 N = normalize(vN); float weave = 0.9 + 0.1 * sin(vUv.x * 400.0) * sin(vUv.y * 200.0);
        vec3 alb = vec3(0.46, 0.05, 0.04) * weave; gl_FragColor = vec4(alb * (keyColor * max(0.0, dot(N, keyDir) * 0.8 + 0.2) + ambient), 1.0); }`,
  }));
  cloth.scale.y = 0.55; cloth.position.y = 0.38; group.add(cloth);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.5, 24), new THREE.ShaderMaterial({
    uniforms: U({}), vertexShader: VERT,
    fragmentShader: /* glsl */ `uniform vec3 keyDir, keyColor, ambient; varying vec3 vN, vP;
      void main(){ vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP); float rim = pow(1.0 - abs(dot(N, V)), 2.0);
        vec3 alb = vec3(0.85, 0.80, 0.68); gl_FragColor = vec4(alb * (keyColor * max(0.0, dot(N, keyDir) * 0.7 + 0.3) + ambient) * (0.8 + 0.4 * rim), 1.0); }`,
  }));
  tube.position.y = 1.05; group.add(tube);
  // 羽毛
  const rnd = mulberry32(8);
  const texs = { copper: plumeTexture('copper', 1), dark: plumeTexture('dark', 2), cream: plumeTexture('cream', 3) };
  const plumes = [];
  const N = 30;
  for (let i = 0; i < N; i++) {
    const kind = i % 5 === 0 ? 'cream' : i % 3 === 0 ? 'dark' : 'copper';
    const len = 8.0 + rnd() * 3.0, wid = 1.9 + rnd() * 0.9;
    const g = new THREE.PlaneGeometry(wid, len, 4, 20); g.translate(0, len / 2, 0);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) { const y = p.getY(j) / len; p.setZ(j, 0.9 * y * y + 0.12 * Math.pow(p.getX(j) / (wid / 2), 2)); }
    g.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      uniforms: U({ map: { value: texs[kind] }, iri: { value: kind === 'dark' ? 1 : 0.25 } }), vertexShader: VERT,
      fragmentShader: /* glsl */ `uniform sampler2D map; uniform vec3 keyDir, keyColor, ambient; uniform float iri; varying vec3 vN, vP; varying vec2 vUv;
        void main(){ vec4 tx = texture2D(map, vUv); if (tx.a < 0.12) discard;
          vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP); if (dot(N, V) < 0.0) N = -N;
          float ndl = dot(N, keyDir); float trans = pow(max(0.0, dot(-V, keyDir)), 3.0) * 0.6;
          float fres = 1.0 - abs(dot(N, V));
          vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (fres * 1.3 + vec3(0.0, 0.33, 0.67) + 0.2));
          vec3 c = tx.rgb * (keyColor * (max(0.0, ndl) * 0.8 + 0.25 + trans) + ambient);
          c += rainbow * iri * pow(fres, 1.5) * 0.35 * keyColor * (1.0 - tx.r);
          gl_FragColor = vec4(c, tx.a); }`,
      side: THREE.DoubleSide, transparent: true, depthWrite: true, alphaTest: 0.12,
    });
    const m = new THREE.Mesh(g, mat);
    const ring = i < 12 ? 0 : 1;
    const phi = (i / N) * Math.PI * 2 * 3.7 + rnd() * 0.4;
    const tilt = ring === 0 ? 0.05 + rnd() * 0.12 : 0.2 + rnd() * 0.22;
    m.position.set(Math.cos(phi) * 0.1, 1.7, Math.sin(phi) * 0.1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -phi + Math.PI / 2)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.6));
    m.quaternion.copy(q);
    m.userData = { phi, tilt, q0: q.clone(), seed: rnd() * 10 };
    group.add(m); plumes.push(m);
  }
  return { group, plumes };
}
