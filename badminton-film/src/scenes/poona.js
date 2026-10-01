// 第四幕 · 浦那：印度黄昏，殖民时期建筑剪影；一张网从左到右“织”出来；羽毛球慢动作越网。单位：米。
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { NOISE } from '../engine/glsl.js';
import { clamp, lerp, seg, ease, smooth, fbm1, mulberry32 } from '../engine/util.js';
import { createShuttle } from '../assets/shuttle.js';
import { revealText } from '../engine/overlay.js';

function skylineTexture() {
  const W = 2048, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'); const rnd = mulberry32(17);
  c.fillStyle = '#000';
  // 地平线上的建筑：拱廊、穹顶小亭（chhatri）、塔楼、棕榈
  const base = H * 0.86;
  c.fillRect(0, base, W, H - base);
  let x = 0;
  while (x < W) {
    const kind = rnd();
    if (kind < 0.35) { // 拱廊
      const w = 260 + rnd() * 220, h = 70 + rnd() * 40;
      c.fillRect(x, base - h, w, h);
      c.globalCompositeOperation = 'destination-out';
      const n = Math.floor(w / 46);
      for (let i = 0; i < n; i++) { const ax = x + 14 + i * (w - 28) / n, aw = (w - 28) / n * 0.62; c.beginPath(); c.moveTo(ax, base - 6); c.lineTo(ax, base - h * 0.55); c.quadraticCurveTo(ax + aw / 2, base - h * 0.95, ax + aw, base - h * 0.55); c.lineTo(ax + aw, base - 6); c.fill(); }
      c.globalCompositeOperation = 'source-over';
      // 屋顶小亭
      for (let i = 0; i < 2; i++) { const cx = x + w * (0.2 + i * 0.6), r = 16 + rnd() * 8; c.fillRect(cx - r, base - h - r * 0.8, r * 2, r * 0.8); c.beginPath(); c.arc(cx, base - h - r * 0.8, r, Math.PI, 0); c.fill(); c.fillRect(cx - 1.5, base - h - r * 1.8 - 14, 3, 14); }
      x += w;
    } else if (kind < 0.55) { // 大穹顶
      const w = 160 + rnd() * 80, h = 90 + rnd() * 40;
      c.fillRect(x, base - h, w, h);
      c.beginPath(); c.moveTo(x + w * 0.15, base - h); c.bezierCurveTo(x + w * 0.1, base - h - w * 0.55, x + w * 0.9, base - h - w * 0.55, x + w * 0.85, base - h); c.fill();
      c.fillRect(x + w / 2 - 2, base - h - w * 0.5 - 22, 4, 26);
      x += w;
    } else if (kind < 0.7) { // 宣礼塔式塔楼
      const w = 34, h = 200 + rnd() * 90;
      c.fillRect(x, base - h, w, h); c.beginPath(); c.arc(x + w / 2, base - h, w * 0.7, Math.PI, 0); c.fill();
      c.fillRect(x - 6, base - h * 0.6, w + 12, 8); c.fillRect(x - 6, base - h * 0.3, w + 12, 8);
      x += w + 30;
    } else if (kind < 0.88) { // 棕榈
      const h = 170 + rnd() * 120, lean = (rnd() - 0.5) * 60, tx = x + 20 + lean, ty = base - h;
      c.strokeStyle = '#000'; c.lineWidth = 7; c.beginPath(); c.moveTo(x + 20, base); c.quadraticCurveTo(x + 20 + lean * 0.3, base - h * 0.5, tx, ty); c.stroke();
      for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2 + rnd() * 0.3; const L = 70 + rnd() * 40; const ex = tx + Math.cos(a) * L, ey = ty + 20 + Math.abs(Math.sin(a)) * 22 + L * 0.35; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.55, ty - 26, ex, ey); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.5, ty - 10, tx, ty + 6); c.fill(); }
      x += 60;
    } else { x += 40 + rnd() * 80; c.fillRect(x - 40, base - 30, 40, 30); }
  }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export class Poona extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.camera.fov = 32; this.camera.near = 0.02; this.camera.far = 400; this.camera.updateProjectionMatrix();
    // 天空 + 远景剪影（全屏背景）
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, sky: { value: this.track(skylineTexture()) }, pan: { value: 0 }, sunPos: { value: new THREE.Vector2(0.62, 0.30) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: /* glsl */ `${NOISE}
        uniform float time, pan; uniform sampler2D sky; uniform vec2 sunPos; varying vec2 vUv;
        void main(){
          vec2 q = vec2(vUv.x * 2.388, vUv.y);
          vec3 top = vec3(0.10, 0.07, 0.16), mid = vec3(0.95, 0.42, 0.16), low = vec3(1.4, 0.82, 0.38);
          float h = vUv.y;
          vec3 c = mix(low, mid, smoothstep(0.08, 0.38, h));
          c = mix(c, top, smoothstep(0.35, 1.0, h));
          vec2 sp = vec2(sunPos.x * 2.388, sunPos.y);
          float d = length(q - sp);
          c += vec3(2.2, 1.3, 0.6) * exp(-d * d * 28.0) * 0.7 + vec3(6.0, 4.2, 2.4) * smoothstep(0.052, 0.045, d);
          // 薄云带
          float cl = fbm(vec2(q.x * 1.6 + time * 0.01, q.y * 9.0)) * 0.5 + 0.5;
          c = mix(c, c * vec3(0.75, 0.5, 0.55), smoothstep(0.55, 0.8, cl) * smoothstep(0.25, 0.5, h) * 0.6);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    const skyTex = this.track(skylineTexture());
    for (const [z, x, sc, tint] of [[-150, 20, 1.0, 0.32], [-95, -30, 0.7, 0.12]]) {
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(420 * sc, 105 * sc), new THREE.ShaderMaterial({
        uniforms: { map: { value: skyTex }, time: { value: 0 }, fogK: { value: tint } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `${NOISE} uniform sampler2D map; uniform float time, fogK; varying vec2 vUv;
          void main(){ vec2 u = vUv; u.x += gnoise(vec2(u.y * 80.0, time * 1.4)) * 0.0008;
            float a = texture2D(map, u).a; if (a < 0.02) discard;
            vec3 sil = vec3(0.10, 0.035, 0.03); vec3 fog = vec3(1.0, 0.5, 0.22) * 0.75;
            gl_FragColor = vec4(mix(sil, fog, fogK + (1.0 - u.y) * 0.15), a); }`,
        transparent: true, depthWrite: false,
      }));
      bb.position.set(x, 105 * sc * 0.5 - 18 * sc, z);
      bb.renderOrder = -5;
      this.scene.add(bb);
      (this.billboards ||= []).push(bb);
    }

    // 地面（夯土 + 草）
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: new THREE.Vector3(0.25, 0.22, -1).normalize() } },
      vertexShader: `varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `${NOISE} varying vec3 vP;
        void main(){ float n = fbm(vP.xz * 1.3) * 0.5 + 0.5; float g = fbm(vP.xz * 9.0) * 0.5 + 0.5;
          vec3 c = mix(vec3(0.10, 0.06, 0.03), vec3(0.20, 0.12, 0.05), n) * (0.8 + 0.4 * g);
          float chalk = 0.0;
          chalk = max(chalk, smoothstep(0.03, 0.015, abs(abs(vP.z) - 3.05)) * step(abs(vP.x), 6.7));
          chalk = max(chalk, smoothstep(0.03, 0.015, abs(abs(vP.x) - 6.7)) * step(abs(vP.z), 3.05));
          chalk = max(chalk, smoothstep(0.03, 0.015, abs(abs(vP.x) - 1.98)) * step(abs(vP.z), 3.05));
          c = mix(c, vec3(0.75, 0.62, 0.48), chalk * (0.55 + 0.3 * g));
          float dist = length(vP.xz - cameraPosition.xz);
          vec3 fog = vec3(1.0, 0.55, 0.25) * 0.65;
          c = mix(c, fog, 1.0 - exp(-dist * 0.03));
          // 球场白线
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // 球网：程序化网格 + 顶部白带，按 reveal 从左到右编织出现
    this.net = new THREE.Mesh(new THREE.PlaneGeometry(6.7, 0.76, 1, 1), new THREE.ShaderMaterial({
      uniforms: { reveal: { value: 0 }, time: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `uniform float reveal, time; varying vec2 vUv; varying vec3 vP;
        float grid(vec2 p, float w){ vec2 f = abs(fract(p) - 0.5); vec2 aa = fwidth(p) * 1.2; vec2 l = smoothstep(0.5 - w - aa, 0.5 - w + aa, f); return max(l.x, l.y); }
        void main(){
          vec2 cells = vec2(6.7, 0.76) / 0.019;
          float g = grid(vUv * cells, 0.07);
          float tape = step(1.0 - 0.075 / 0.76, vUv.y);
          float x = vUv.x;
          float front = reveal * 1.15 - 0.05;
          float shown = smoothstep(front, front - 0.04, x);
          float glow = exp(-pow((x - front) / 0.012, 2.0));
          vec3 cord = vec3(0.95, 0.78, 0.55) * 1.4;
          vec3 c = mix(cord * g, vec3(1.5, 1.35, 1.15), tape);
          float a = max(g * 0.85, tape) * shown;
          c += vec3(4.0, 2.4, 1.0) * glow * max(g, tape);
          a = max(a, glow * max(g, tape));
          if (a < 0.01) discard;
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.net.position.set(0, 1.55 - 0.38, 0);
    this.net.rotation.y = Math.PI / 2;    // 网沿 z 方向延伸
    this.scene.add(this.net);
    const postMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.05, 0.03) });
    for (const z of [-3.35, 3.35]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.55, 12), postMat); p.position.set(0, 0.775, z); this.scene.add(p); }

    // 羽毛球（暖色逆光）
    this.L = {
      keyDir: { value: new THREE.Vector3(0.25, 0.25, -1).normalize() }, keyColor: { value: new THREE.Color(1.0, 0.62, 0.3).multiplyScalar(2.2) },
      fillDir: { value: new THREE.Vector3(-0.3, 0.6, 0.8).normalize() }, fillColor: { value: new THREE.Color(0.35, 0.3, 0.45).multiplyScalar(0.5) },
      ambient: { value: new THREE.Color(0.06, 0.04, 0.04) }, beamA: { value: new THREE.Vector3() }, beamD: { value: new THREE.Vector3(0, 1, 0) }, beamR: { value: 1e6 }, beamOn: { value: 1 },
    };
    this.sh = createShuttle(this.L);
    this.shPivot = new THREE.Group(); this.shPivot.add(this.sh.group); this.sh.group.position.y = -4.5;
    this.shPivot.scale.setScalar(0.01 * 1.6);
    this.scene.add(this.shPivot);
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const v7 = info.cue('v07'), v7e = info.cue('v07', 1), v8 = info.cue('v08');
    this.sky.material.uniforms.time.value = t;
    this.sky.material.uniforms.pan.value = t * 0.004;
    for (const b of this.billboards) b.material.uniforms.time.value = t;
    const nu = this.net.material.uniforms;
    nu.reveal.value = seg(t, v7 + 1.2, v7e + 0.2, ease.inOutSine);
    nu.time.value = t;
    // 羽毛球：v08 时从左侧场地高高越网（慢动作）
    const ts = v8 - 1.2, te = D + 0.5;
    const k = clamp((t - ts) / (te - ts));
    const x = lerp(-2.6, 2.7, k), y = 1.22 + 0.45 * 4 * k * (1 - k), z = lerp(1.3, 0.3, k);
    const vx = 5.3, vy = 0.45 * 4 * (1 - 2 * k);
    this.shPivot.position.set(x, y, z);
    this.shPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(vx, vy, -1.5).normalize());
    this.shPivot.rotateY(t * 3);
    this.shPivot.visible = t > ts;
    // 镜头：贴地沿网推进，最后升起越过网顶
    const cam = this.camera;
    const dolly = seg(t, 0, D, ease.inOutSine);
    const rise = seg(t, v8 - 1.0, D, ease.inOutCubic);
    cam.position.set(lerp(-1.6, -1.1, dolly) + fbm1(t * 0.3, 1) * 0.03, lerp(0.55, 1.75, rise) + fbm1(t * 0.3, 2) * 0.02, lerp(5.6, 3.9, dolly));
    cam.lookAt(lerp(0.6, 0.9, dolly), lerp(1.05, 1.35, rise), lerp(-2.0, -1.4, dolly));
    this.renderTo(rt);

    // 字幕卡
    const c1 = seg(t, v7 + 0.3, v7 + 2.0, ease.linear);
    const out = 1 - smooth(D - 1.6, D - 0.6, t);
    revealText(ctx, 'POONA', 150, 600, c1, { font: '400 76px Cinzel', color: '#ffe6c2', align: 'left', tracking: 22, stagger: 0.12, blurMax: 10, alpha: out });
    revealText(ctx, '浦那 · 英属印度', 156, 668, seg(t, v7 + 0.8, v7 + 2.4, ease.linear), { font: '500 28px NotoSerifSC', color: '#f3d6b0', align: 'left', tracking: 10, stagger: 0.1, blurMax: 6, alpha: out });
    revealText(ctx, 'BRITISH INDIA  ·  19TH CENTURY', 158, 712, seg(t, v7 + 1.3, v7 + 2.8, ease.linear), { font: '400 17px Cinzel', color: '#e2bf96', align: 'left', tracking: 6, stagger: 0.02, blurMax: 4, alpha: out * 0.9 });
    return {
      overlay: true, overlayGain: 1.0,
      grade: { exposure: 1.0, bloom: 0.6, bloomThreshold: 1.0, halation: 0.35, vignette: 0.5, grain: 0.04, saturation: 1.05, contrast: 1.06, chroma: 0.0016, highTint: [0.02, 0.006, -0.02], shadowTint: [0.0, -0.004, 0.012] },
    };
  }
}
