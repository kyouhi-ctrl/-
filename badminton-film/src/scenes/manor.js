// 第五幕 · 1873 年 Badminton 庄园：月夜下的帕拉第奥式庄园，窗灯温暖，草坪薄雾，花园灯串；
// “BADMINTON”以熔金字样在夜空中显现。单位：米。
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { NOISE } from '../engine/glsl.js';
import { clamp, lerp, seg, ease, smooth, fbm1, mulberry32 } from '../engine/util.js';
import { glyphCanvas, goldGlyphMaterial } from './title.js';
import { revealText, text } from '../engine/overlay.js';

const FOG = 'vec3(0.022, 0.03, 0.045)';
const MOON = { dir: new THREE.Vector3(0.55, 0.62, 0.55).normalize(), color: new THREE.Color(0.55, 0.65, 0.85) };

function stoneMaterial({ winSp = 3.2, winOff = 0, floors = 3, litFrac = 0.6, seed = 1, base = 0.0, windows = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { moonDir: { value: MOON.dir }, moonColor: { value: MOON.color }, winSp: { value: winSp }, winOff: { value: winOff }, floors: { value: floors }, litFrac: { value: litFrac }, seed: { value: seed }, base: { value: base }, hasWin: { value: windows ? 1 : 0 }, time: { value: 0 } },
    vertexShader: `varying vec3 vP, vN; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `${NOISE}
      uniform vec3 moonDir, moonColor; uniform float winSp, winOff, floors, litFrac, seed, base, hasWin, time;
      varying vec3 vP, vN;
      void main(){
        vec3 N = normalize(vN);
        vec2 fc = abs(N.z) > 0.5 ? vec2(vP.x, vP.y) : (abs(N.x) > 0.5 ? vec2(vP.z, vP.y) : vP.xz);
        float wall = 1.0 - abs(N.y);
        vec3 stone = vec3(0.40, 0.38, 0.34) * (0.85 + 0.15 * fbm4(fc * 0.7));
        float courses = smoothstep(0.035, 0.0, abs(fract(fc.y / 0.55) - 0.5) - 0.465) * wall;
        stone *= 1.0 - courses * 0.25;
        float moon = max(0.0, dot(N, moonDir));
        vec3 c = stone * (moonColor * moon * 0.32 + vec3(0.02, 0.025, 0.035));
        // 暖色泛光灯从地面往上打
        c += vec3(1.0, 0.62, 0.32) * 0.30 * exp(-max(vP.y - base, 0.0) * 0.16) * wall * smoothstep(0.2, 0.9, N.z) * stone;
        // 窗户
        float fy = (fc.y - base - 1.4) / 4.4;
        float fl = floor(fy); fy = fract(fy);
        float cx = (fc.x + winOff) / winSp;
        float col = floor(cx); float fx = fract(cx);
        float win = step(0.34, fx) * step(fx, 0.66) * step(0.12, fy) * step(fy, 0.8) * step(0.0, fl) * step(fl, floors - 1.0) * wall * hasWin;
        float frameLine = win * (smoothstep(0.02, 0.0, abs(fx - 0.5) - 0.012) + smoothstep(0.02, 0.0, abs(fy - 0.46) - 0.015));
        float h = hash13(vec3(fl, col, seed));
        float lit = step(1.0 - litFrac, h);
        float flick = 0.85 + 0.15 * sin(time * (1.5 + h * 3.0) + h * 30.0);
        vec3 glow = vec3(2.4, 1.35, 0.55) * (0.55 + 0.9 * hash13(vec3(col, fl, seed + 9.0))) * flick * smoothstep(0.85, 0.2, fy);
        vec3 glass = vec3(0.02, 0.03, 0.05) + moonColor * 0.05;
        vec3 wc = mix(glass, glow, lit);
        wc *= 1.0 - clamp(frameLine, 0.0, 1.0) * 0.85;
        c = mix(c, wc, win);
        // 雾
        float dist = length(vP - cameraPosition);
        float hf = exp(-max(vP.y, 0.0) * 0.25);
        c = mix(c, ${FOG}, clamp(1.0 - exp(-dist * 0.003) + hf * 0.18, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function treeTexture(seed) {
  const W = 512, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'); const rnd = mulberry32(seed);
  c.fillStyle = '#000';
  c.fillRect(W / 2 - 10, H * 0.55, 20, H * 0.45);
  for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2, r = rnd() * 170; const x = W / 2 + Math.cos(a) * r * 1.1, y = H * 0.42 + Math.sin(a) * r * 0.75; c.beginPath(); c.arc(x, y, 35 + rnd() * 45, 0, Math.PI * 2); c.fill(); }
  const t = new THREE.CanvasTexture(cv); return t;
}

export class Manor extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.camera.fov = 26; this.camera.near = 0.5; this.camera.far = 3000; this.camera.updateProjectionMatrix();
    // 夜空
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: /* glsl */ `${NOISE} uniform float time; varying vec2 vUv;
        void main(){
          vec2 q = vec2(vUv.x * 2.388, vUv.y);
          vec3 c = mix(vec3(0.07, 0.09, 0.13), vec3(0.008, 0.012, 0.03), smoothstep(0.15, 1.0, vUv.y));
          // 星空
          vec2 g = floor(q * 260.0); vec2 f = fract(q * 260.0);
          float h = hash12(g); vec2 o = hash22(g) * 0.8 + 0.1;
          float st = step(0.985, h) * exp(-dot(f - o, f - o) * 300.0) * (0.5 + 0.5 * sin(time * 2.0 + h * 50.0));
          c += vec3(0.8, 0.85, 1.0) * st * 1.5 * smoothstep(0.25, 0.6, vUv.y);
          // 月亮
          vec2 mp = vec2(0.86 * 2.388, 0.84); float d = length(q - mp);
          c += vec3(0.9, 0.95, 1.1) * smoothstep(0.028, 0.025, d) * 3.0 + vec3(0.25, 0.32, 0.45) * exp(-d * d * 60.0) * 0.6;
          // 薄云
          float cl = fbm(q * vec2(1.5, 4.0) + vec2(time * 0.008, 0.0)) * 0.5 + 0.5;
          c = mix(c, vec3(0.10, 0.12, 0.17), smoothstep(0.55, 0.85, cl) * 0.5 * smoothstep(0.3, 0.7, vUv.y));
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // 草坪
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.ShaderMaterial({
      uniforms: { moonDir: { value: MOON.dir } },
      vertexShader: `varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `${NOISE} varying vec3 vP;
        void main(){ float n = fbm4(vP.xz * 0.08) * 0.5 + 0.5;
          vec3 c = mix(vec3(0.004, 0.009, 0.007), vec3(0.010, 0.02, 0.014), n);
          float path = smoothstep(4.2, 3.6, abs(vP.x)) * step(8.0, vP.z);
          c = mix(c, vec3(0.022, 0.022, 0.026), path);
          // 窗光投在草坪上的暖色
          c += vec3(0.5, 0.3, 0.12) * 0.12 * exp(-max(vP.z - 10.0, 0.0) * 0.05) * smoothstep(60.0, 0.0, abs(vP.x));
          float dist = length(vP - cameraPosition);
          c = mix(c, ${FOG}, 1.0 - exp(-dist * 0.006));
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    lawn.rotation.x = -Math.PI / 2;
    this.scene.add(lawn);

    // 庄园建筑
    const M = (o) => { const m = stoneMaterial(o); (this.stoneMats ||= []).push(m); return m; };
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); this.scene.add(m); return m; };
    add(new THREE.BoxGeometry(38, 17, 16), M({ winSp: 3.4, winOff: 1.7, floors: 3, litFrac: 0.7, seed: 1 }), 0, 8.5, 0);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(28, 12.5, 12), M({ winSp: 3.2, winOff: 1.6, floors: 2, litFrac: 0.55, seed: 2 + s }), s * 33, 6.25, -2);
      add(new THREE.BoxGeometry(9, 15.5, 15), M({ winSp: 3.0, winOff: 1.5, floors: 3, litFrac: 0.5, seed: 5 + s }), s * 51.5, 7.75, -1);
      // 双塔与穹顶
      add(new THREE.BoxGeometry(5, 7, 5), M({ windows: false }), s * 15, 20.5, -3);
      add(new THREE.CylinderGeometry(2.0, 2.2, 3, 24), M({ windows: false }), s * 15, 25.5, -3);
      add(new THREE.SphereGeometry(2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M({ windows: false }), s * 15, 27, -3);
      // 烟囱
      add(new THREE.BoxGeometry(1.4, 3.5, 1.4), M({ windows: false }), s * 27, 14, -3);
      add(new THREE.BoxGeometry(1.4, 3.5, 1.4), M({ windows: false }), s * 40, 14, -3);
    }
    // 檐口
    const darkMat = M({ windows: false });
    add(new THREE.BoxGeometry(39.5, 0.7, 17), darkMat, 0, 16.9, 0);
    for (const s2 of [-1, 1]) { add(new THREE.BoxGeometry(28.5, 0.6, 12.6), darkMat, s2 * 33, 12.4, -2); add(new THREE.BoxGeometry(9.6, 0.6, 15.6), darkMat, s2 * 51.5, 15.4, -1); add(new THREE.BoxGeometry(28.2, 1.2, 12.2), darkMat, s2 * 33, 0.6, -2); }
    // 屋顶栏杆
    add(new THREE.BoxGeometry(38.5, 1.0, 16.5), M({ windows: false }), 0, 17.5, 0);
    // 门廊：六根柱子 + 檐部 + 山花
    const colMat = M({ windows: false });
    for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.62, 0.7, 11.5, 24), colMat, -8 + i * 3.2, 5.75, 9.5);
    add(new THREE.BoxGeometry(19.5, 1.6, 4), colMat, 0, 12.3, 9.0);
    const tri = new THREE.Shape(); tri.moveTo(-10, 0); tri.lineTo(10, 0); tri.lineTo(0, 4.2); tri.lineTo(-10, 0);
    const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 3.6, bevelEnabled: false }), colMat);
    ped.position.set(0, 13.1, 7.2); this.scene.add(ped);
    add(new THREE.BoxGeometry(19, 0.6, 6), colMat, 0, 0.3, 9.5);

    // 两侧大树（剪影公告板）
    for (const [x, z, s, sd] of [[-78, 10, 34, 3], [80, 6, 38, 4], [-105, -20, 46, 5], [110, -25, 50, 6]]) {
      const tm = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.ShaderMaterial({
        uniforms: { map: { value: treeTexture(sd) } },
        vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec3 vP; void main(){ float a = texture2D(map, vUv).a; if (a < 0.4) discard;
          float dist = length(vP - cameraPosition); vec3 c = mix(vec3(0.004, 0.008, 0.008), ${FOG}, 1.0 - exp(-dist * 0.005)); gl_FragColor = vec4(c, 1.0); }`,
      }));
      tm.position.set(x, s * 0.5 - 2, z); this.scene.add(tm);
    }

    // 花园灯串（暖色光点，带景深散景）
    const rnd = mulberry32(31); const pts = [];
    for (let row = 0; row < 3; row++) {
      const z = 16 + row * 5, x0 = -30 + row * 4, x1 = 30 - row * 4;
      for (let i = 0; i <= 44; i++) { const u = i / 44; const x = lerp(x0, x1, u); const sag = 1.6 * 4 * (u - Math.floor(u * 4) / 4) * 4 * (0.25 - (u - Math.floor(u * 4) / 4)); pts.push(x, 3.2 - sag * 0.6 + row * 0.6, z + (rnd() - 0.5) * 0.4); }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.lights = new THREE.Points(lg, new THREE.ShaderMaterial({
      uniforms: { focus: { value: 120 }, time: { value: 0 }, pxScale: { value: 1700 } },
      vertexShader: `uniform float focus, time, pxScale; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); float d = -mv.z;
          float coc = abs(d - focus) / d * 22.0; gl_PointSize = clamp(0.14 * pxScale / d + coc, 1.5, 30.0);
          vA = (0.14 * pxScale / d) / gl_PointSize; vA = clamp(vA * 2.5, 0.08, 1.0) * (0.85 + 0.15 * sin(time * 3.0 + position.x));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord * 2.0 - 1.0; float r = dot(c,c); if (r > 1.0) discard;
        float k = smoothstep(1.0, 0.7, r) * 0.7 + exp(-r * 8.0) * 0.6; gl_FragColor = vec4(vec3(2.6, 1.5, 0.6) * k * vA, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.lights.frustumCulled = false;
    this.scene.add(this.lights);

    // 金色 BADMINTON
    this.goldTex = this.track(glyphCanvas('BADMINTON', 'Cinzel', 150, 1920, 804, 960, 175));
    this.goldH = this.track(glyphCanvas('BADMINTON', 'Cinzel', 150, 1920, 804, 960, 175, 4));
    this.gold = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), goldGlyphMaterial(this.goldTex, this.goldH));
    this.gold.frustumCulled = false; this.gold.renderOrder = 20;
    this.scene.add(this.gold);
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const v9 = info.cue('v09'), v10 = info.cue('v10'), v10e = info.cue('v10', 1);
    this.sky.material.uniforms.time.value = t;
    for (const m of this.stoneMats) m.uniforms.time.value = t;
    const cam = this.camera;
    const k = seg(t, 0, D, ease.inOutSine);
    cam.position.set(lerp(-14, 6, k) + fbm1(t * 0.2, 1) * 0.3, lerp(4.0, 6.5, k), lerp(150, 92, k));
    cam.lookAt(lerp(-4, 1, k), lerp(17, 18.5, k), 0);
    const lu = this.lights.material.uniforms;
    lu.time.value = t; lu.focus.value = cam.position.z - 5; lu.pxScale.value = (this.H / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const gu = this.gold.material.uniforms;
    gu.reveal.value = seg(t, v10 + 0.8, v10e + 0.4, ease.inOutSine);
    gu.glint.value = lerp(-0.4, 1.2, seg(t, v10e, D, ease.inOutSine));
    gu.time.value = t; gu.zoom.value = 1 + 0.03 * k;
    gu.bright.value = 1.0;
    this.renderTo(rt);

    const out = 1 - smooth(v10 - 0.6, v10 + 0.6, t);
    revealText(ctx, '1873', 150, 120, seg(t, v9 - 0.2, v9 + 1.2, ease.linear), { font: '400 92px Cinzel', color: '#f0dcae', align: 'left', tracking: 16, stagger: 0.15, blurMax: 10, alpha: out });
    revealText(ctx, '英格兰 · 格洛斯特郡 · 博福特公爵的庄园', 156, 200, seg(t, v9 + 0.6, v9 + 2.4, ease.linear), { font: '500 26px NotoSerifSC', color: '#e3d3b4', align: 'left', tracking: 6, stagger: 0.05, blurMax: 6, alpha: out });
    revealText(ctx, 'BADMINTON HOUSE  ·  GLOUCESTERSHIRE  ·  ENGLAND', 158, 244, seg(t, v9 + 1.2, v9 + 3.0, ease.linear), { font: '400 17px Cinzel', color: '#cdb98f', align: 'left', tracking: 6, stagger: 0.015, blurMax: 4, alpha: out * 0.9 });
    return {
      overlay: true,
      grade: { exposure: 1.15, bloom: 0.7, bloomThreshold: 0.8, halation: 0.3, vignette: 0.55, grain: 0.045, saturation: 1.0, contrast: 1.05, chroma: 0.0016, shadowTint: [-0.006, 0.0, 0.016], highTint: [0.02, 0.008, -0.014] },
    };
  }
}
