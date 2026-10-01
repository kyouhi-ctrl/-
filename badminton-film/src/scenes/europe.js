// 第三幕 · 欧洲：两支木拍把羽毛球打来打去——整幅画面以 18 世纪铜版蚀刻（排线明暗）风格呈现。
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { BaseScene } from '../engine/base.js';
import { NOISE, FS_VERT } from '../engine/glsl.js';
import { clamp, lerp, seg, ease, smooth, fbm1 } from '../engine/util.js';
import { createShuttle } from '../assets/shuttle.js';
import { revealText, text } from '../engine/overlay.js';

const LIT_VERT = /* glsl */ `varying vec3 vN, vP; varying vec2 vUv;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;

function litMaterial(albedo, { side = THREE.FrontSide, grain = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { albedo: { value: new THREE.Color(...albedo) }, grain: { value: grain } },
    vertexShader: LIT_VERT, side,
    fragmentShader: /* glsl */ `uniform vec3 albedo; uniform float grain; varying vec3 vN, vP; varying vec2 vUv;
      void main(){ vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP); if (dot(N, V) < 0.0) N = -N;
        vec3 L = normalize(vec3(-0.5, 0.8, 0.6));
        float d = max(0.0, dot(N, L)); float rim = pow(1.0 - max(0.0, dot(N, V)), 3.0);
        float wood = grain > 0.0 ? 0.85 + 0.15 * sin(vUv.y * 90.0 + sin(vUv.x * 20.0) * 2.0) : 1.0;
        vec3 c = albedo * wood * (0.30 + 0.85 * d) + rim * 0.10;
        gl_FragColor = vec4(c, 1.0); }`,
  });
}

// 木拍：椭圆框 + 羊皮纸拍面 + 木柄
function battledore() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.25, 64), litMaterial([1.0, 0.97, 0.88]));
  head.scale.set(4.2, 1, 5.4); head.rotation.x = Math.PI / 2; head.position.y = 5.6;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 12, 96), litMaterial([0.45, 0.28, 0.14], { grain: 1 }));
  rim.scale.set(4.25, 5.45, 4); rim.position.y = 5.6;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, 11, 24), litMaterial([0.42, 0.26, 0.12], { grain: 1 }));
  handle.position.y = -5.2;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 12), litMaterial([0.38, 0.23, 0.1]));
  knob.position.y = -10.9;
  g.add(head, rim, handle, knob);
  return g;
}

const ETCH = /* glsl */ `
${NOISE}
uniform sampler2D tScene; uniform vec2 res; uniform float time, reveal;
varying vec2 vUv;
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float hatch(vec2 p, float ang, float period, float cover){
  vec2 d = vec2(cos(ang), sin(ang));
  float w = dot(p, d) / period;
  w += gnoise(p * 0.02) * 0.35;                // 手工雕刻的微小抖动
  float f = abs(fract(w) - 0.5) * 2.0;
  return 1.0 - smoothstep(cover - 0.18, cover + 0.18, f);
}
void main(){
  vec2 fc = vUv * res;
  vec4 s = texture2D(tScene, vUv);
  // 纸张：做旧的羊皮纸 + 污渍 + 边缘烧痕
  vec2 q = vUv * vec2(res.x / res.y, 1.0);
  vec3 paper = vec3(0.80, 0.71, 0.55) * (0.92 + 0.10 * fbm(q * 4.0)) * (0.97 + 0.04 * vnoise(q * 300.0));
  float stain = smoothstep(0.35, 0.8, fbm(q * 1.5 + 3.0) * 0.5 + 0.5);
  paper *= 1.0 - stain * 0.10;
  paper *= 1.0 - 0.35 * smoothstep(0.45, 0.85, length((vUv - 0.5) * vec2(1.25, 1.0)));
  vec3 ink = vec3(0.07, 0.045, 0.025);
  // 边缘检测（轮廓线）
  vec2 px = 1.0 / res;
  float a = s.a;
  float gx = 0.0, gy = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    vec4 t = texture2D(tScene, vUv + vec2(float(i), float(j)) * px * 1.3);
    float v = lum(t.rgb) * 0.6 + t.a;
    gx += v * float(i) * (j == 0 ? 2.0 : 1.0);
    gy += v * float(j) * (i == 0 ? 2.0 : 1.0);
  }
  float edge = smoothstep(0.18, 0.55, length(vec2(gx, gy)));
  float l = lum(s.rgb);
  float dark = clamp((1.0 - clamp(l, 0.0, 1.0)) * 1.25, 0.0, 1.0) * a;
  float h = 0.0;
  h = max(h, hatch(fc, 0.785, 5.0, dark * 0.95));
  h = max(h, hatch(fc, -0.52, 5.5, (dark - 0.35) * 1.3));
  h = max(h, hatch(fc, 0.05, 4.0, (dark - 0.65) * 1.6));
  // 物体亮部保留纸色，暗部排线
  vec3 col = mix(paper, ink, clamp(h * a + edge * 0.9, 0.0, 1.0) * reveal);
  // 背景细密的环境排线（铜版画的底纹）
  float bg = hatch(fc + vec2(0.0, 3.0), 0.0, 7.0, 0.22 * smoothstep(0.25, 0.9, length((vUv - 0.5) * vec2(1.2, 1.0)))) * (1.0 - a);
  col = mix(col, ink, bg * 0.45 * reveal);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Europe extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.camera.fov = 28; this.camera.updateProjectionMatrix();
    this.rt3d = new THREE.WebGLRenderTarget(eng.W, eng.H, { type: THREE.HalfFloatType, samples: 4 });
    this.track(this.rt3d);
    // 羽毛球（复用写实模型，光照改为明亮的漫射光）
    this.L = {
      keyDir: { value: new THREE.Vector3(-0.5, 0.8, 0.6).normalize() }, keyColor: { value: new THREE.Color(1, 1, 1).multiplyScalar(1.1) },
      fillDir: { value: new THREE.Vector3(0.6, 0.2, 0.7).normalize() }, fillColor: { value: new THREE.Color(0.5, 0.5, 0.5) },
      ambient: { value: new THREE.Color(0.15, 0.15, 0.15) }, beamA: { value: new THREE.Vector3() }, beamD: { value: new THREE.Vector3(0, 1, 0) },
      beamR: { value: 1e6 }, beamOn: { value: 1 },
    };
    this.sh = createShuttle(this.L);
    this.shPivot = new THREE.Group(); this.shPivot.add(this.sh.group); this.sh.group.position.y = -4.5;
    this.shPivot.scale.setScalar(1.25);
    this.scene.add(this.shPivot);
    this.left = battledore(); this.right = battledore();
    this.scene.add(this.left, this.right);
    this.etch = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: ETCH, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: this.rt3d.texture }, res: { value: new THREE.Vector2(eng.W, eng.H) }, time: { value: 0 }, reveal: { value: 1 } },
    }));
    this.hitPeriod = 1.55;
  }

  // 第 n 次击球后的飞行：左右往返，抛物线
  shuttleState(t) {
    const P = this.hitPeriod, t0 = 0.6;
    const u = (t - t0) / P;
    const n = Math.floor(u), f = u - n;
    const dir = n % 2 === 0 ? 1 : -1;            // 偶数：左 → 右
    const xA = -14.5 * dir, xB = 14.5 * dir;
    const x = lerp(xA, xB, f);
    const y = 1.5 + 9.0 * 4 * f * (1 - f);
    const vx = (xB - xA) / P, vy = 9.0 * 4 * (1 - 2 * f) / P;
    return { x, y, vx, vy, n, f, dir };
  }

  swing(paddle, side, t) {
    // 找到该侧最近一次击球时刻 d（负：尚未击球）
    const P = this.hitPeriod, t0 = 0.6;
    let best = 1e9;
    for (let n = -1; n < 20; n++) {
      const dir = n % 2 === 0 ? 1 : -1;
      if (-dir !== side) continue;
      const d = t - (t0 + n * P);
      if (Math.abs(d) < Math.abs(best)) best = d;
    }
    const sw = Math.exp(-best * best * 10);
    paddle.position.set(side * 20.5, -4.0 + 1.5 * sw, 0);
    paddle.rotation.set(0, side * -0.25, side * (0.32 - 0.55 * sw) + (best > 0 ? side * 0.25 * Math.exp(-best * 5) * (1 - Math.exp(-best * 30)) : 0));
  }

  // 巴洛克角花：渐细的涡卷线条
  ornaments(ctx, k) {
    if (k <= 0) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(52,34,20,0.8)'; ctx.lineCap = 'round';
    const scroll = (cx, cy, sx, sy) => {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, sy);
      const turns = 2.2 * k;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        const N = 120;
        for (let i = 0; i <= N; i++) {
          const u = i / N; const a = u * turns * Math.PI * 2; const r = 46 * (1 - u * 0.85);
          const x = Math.cos(a) * r + u * 70, y = Math.sin(a) * r * 0.8 - u * 10;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.lineWidth = pass ? 0.8 : 2.0; ctx.globalAlpha = k * (pass ? 0.6 : 0.85);
        ctx.stroke();
        ctx.translate(6, 4);
      }
      // 叶片
      ctx.beginPath(); ctx.moveTo(-40, 30); ctx.quadraticCurveTo(10, 70, 90, 46); ctx.quadraticCurveTo(20, 44, -40, 30);
      ctx.globalAlpha = k * 0.5; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    };
    scroll(150, 160, 1, 1); scroll(1770, 160, -1, 1); scroll(150, 716, 1, -1); scroll(1770, 716, -1, -1);
    ctx.restore();
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const S = this.shuttleState(t);
    // 羽毛球总是“球托朝前”：朝速度方向
    const vel = new THREE.Vector3(S.vx, S.vy, 0).normalize();
    this.shPivot.position.set(S.x, S.y, 0);
    this.shPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), vel);
    this.shPivot.rotateY(t * 2.0);
    this.swing(this.left, -1, t);
    this.swing(this.right, 1, t);
    const cam = this.camera;
    cam.position.set(fbm1(t * 0.2, 3) * 1.0, 4.5 + fbm1(t * 0.2, 4) * 0.5, 56 - t * 0.5);
    cam.lookAt(0, 3.6, 0);
    // 3D → 离屏，再蚀刻成铜版画
    const r = this.r;
    r.setRenderTarget(this.rt3d); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, cam);
    this.etch.material.uniforms.time.value = t;
    this.etch.material.uniforms.reveal.value = 1;
    r.setRenderTarget(rt); this.etch.render(r);

    // ---- 叠加：椭圆画框、标题、计数 ----
    const k = seg(t, 0.5, 2.0, ease.outCubic);
    ctx.save();
    ctx.strokeStyle = 'rgba(52,34,20,0.85)'; ctx.globalAlpha = k;
    ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(960, 438, 800 * (0.96 + 0.04 * k), 300, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(960, 438, 786 * (0.96 + 0.04 * k), 288, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    this.ornaments(ctx, k);
    const v6a = info.cue('v06a'), v6b = info.cue('v06b');
    revealText(ctx, 'BATTLEDORE  &  SHUTTLECOCK', 960, 58, seg(t, 0.8, 2.6, ease.linear), { font: '500 34px CormorantGaramond', color: '#3a2716', tracking: 8, stagger: 0.03, blurMax: 4 });
    revealText(ctx, '欧洲 · 十七至十九世纪', 960, 104, seg(t, 1.4, 3.0, ease.linear), { font: '500 22px NotoSerifSC', color: '#4a3424', tracking: 8, stagger: 0.08, blurMax: 4 });
    // 击球计数（呼应“看谁能让它更久不落地”）
    const hits = Math.max(0, S.n + 1);
    const ck = smooth(v6b - 0.5, v6b + 0.3, t);
    if (ck > 0) {
      text(ctx, String(hits), 960, 662, { font: 'italic 500 64px CormorantGaramond', color: '#3a2716', alpha: ck });
      text(ctx, 'RALLY  ·  回合', 960, 706, { font: '500 16px Cinzel', color: '#5a4430', tracking: 6, alpha: ck * 0.8 });
    }
    return {
      overlay: true,
      grade: { exposure: 1.18, bloom: 0.05, bloomThreshold: 2.0, halation: 0.0, vignette: 0.25, grain: 0.04, saturation: 0.9, contrast: 1.08, chroma: 0.0005 },
    };
  }
}
