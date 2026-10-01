// 第八幕 · 中国：聚光灯下的红丝绒，金色奖杯缓缓旋转、金粉飘落（1982 汤姆斯杯）；镜头横移出第二座奖杯（1984 尤伯杯）。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BaseScene } from '../engine/base.js';
import { NOISE } from '../engine/glsl.js';
import { clamp, lerp, seg, ease, smooth, fbm1, mulberry32 } from '../engine/util.js';
import { revealText, text } from '../engine/overlay.js';

function lathe(points, segs = 128) { return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs); }

export function trophy(kind, mat) {
  const g = new THREE.Group();
  if (kind === 'thomas') {
    g.add(new THREE.Mesh(lathe([[0, 0], [2.6, 0], [2.6, 0.5], [2.2, 0.6], [2.2, 1.1], [1.6, 1.25], [0.55, 1.6], [0.42, 2.6], [0.6, 3.0], [0.35, 3.3], [0.5, 3.5], [1.6, 4.0], [2.5, 5.0], [2.9, 6.3], [3.0, 7.4], [3.15, 7.6], [2.95, 7.7], [0.01, 7.7]]), mat));
    g.add(new THREE.Mesh(lathe([[0, 7.7], [2.9, 7.7], [2.7, 8.2], [1.6, 8.7], [0.5, 9.0], [0.35, 9.4], [0.6, 9.8], [0.3, 10.3], [0.01, 10.5]]), mat));
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.16, 16, 48, Math.PI * 1.25), mat);
      h.position.set(s * 3.1, 6.0, 0); h.rotation.z = s > 0 ? -Math.PI * 0.62 : Math.PI * 0.38 + Math.PI; g.add(h);
    }
    const fig = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), mat); fig.position.y = 10.7; g.add(fig);
  } else {
    g.add(new THREE.Mesh(lathe([[0, 0], [2.0, 0], [2.0, 0.4], [1.6, 0.5], [1.6, 0.9], [0.5, 1.3], [0.3, 3.2], [0.55, 3.5], [0.42, 3.8], [1.7, 4.3], [2.35, 5.4], [2.5, 6.5], [2.62, 6.7], [2.45, 6.8], [0.3, 6.85], [0.25, 7.2], [0.01, 7.2]]), mat));
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1.25, 48, 32), mat); globe.position.y = 8.35; g.add(globe);
    for (const rx of [Math.PI / 2, 1.1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.05, 12, 96), mat); ring.position.y = 8.35; ring.rotation.x = rx; g.add(ring); }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 24), mat); tip.position.y = 10.0; g.add(tip);
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 12, 40, Math.PI * 1.2), mat); h.position.set(s * 2.55, 5.4, 0); h.rotation.z = s > 0 ? -Math.PI * 0.6 : Math.PI * 0.4 + Math.PI; g.add(h); }
  }
  return g;
}

export class China extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.camera.fov = 28; this.camera.updateProjectionMatrix();
    const pm = new THREE.PMREMGenerator(this.r);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.track(env);
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.55;
    const gold = new THREE.MeshStandardMaterial({ color: new THREE.Color(1.0, 0.72, 0.32), metalness: 1, roughness: 0.22 });
    const silver = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.78, 0.78, 0.8), metalness: 1, roughness: 0.24 });
    this.t1 = trophy('thomas', gold); this.t1.position.set(0, 1.2, 0); this.scene.add(this.t1);
    this.t2 = trophy('uber', silver); this.t2.position.set(20, 1.2, -2); this.scene.add(this.t2);
    // 底座
    for (const [x, z] of [[0, 0], [20, -2]]) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 1.2, 64), new THREE.MeshStandardMaterial({ color: 0x0b0606, metalness: 0.2, roughness: 0.35 }));
      ped.position.set(x, 0.6, z); this.scene.add(ped);
    }
    // 聚光灯
    for (const [x, z] of [[0, 0], [20, -2]]) {
      const sp = new THREE.SpotLight(new THREE.Color(1.0, 0.86, 0.66), 1500, 60, 0.3, 0.6, 2);
      sp.position.set(x - 3, 30, z + 6); sp.target.position.set(x, 5, z);
      this.scene.add(sp, sp.target);
    }
    const rim = new THREE.DirectionalLight(new THREE.Color(1.0, 0.35, 0.2), 1.2); rim.position.set(-10, 8, -14); this.scene.add(rim);
    // 红丝绒背景（弧形幕布 + 褶皱）
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 60, 160, 1, true, Math.PI * 0.6, Math.PI * 0.8), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vP; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; float a = atan(p.z, p.x); p.xz *= 1.0 + 0.012 * sin(a * 90.0); vec4 wp = modelMatrix * vec4(p,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `${NOISE} varying vec3 vP; varying vec2 vUv;
        void main(){ float a = atan(vP.z, vP.x); float fold = 0.5 + 0.5 * sin(a * 90.0 + fbm4(vec2(a * 6.0, vP.y * 0.05)) * 2.0);
          float pool = exp(-pow((vP.x - 9.0) / 26.0, 2.0)) * exp(-pow((vP.y - 8.0) / 16.0, 2.0));
          vec3 c = vec3(0.30, 0.02, 0.025) * (0.25 + 0.75 * fold) * (0.08 + pool * 0.9);
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide,
    }));
    drape.position.set(9, 18, -8); this.scene.add(drape);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x080303, metalness: 0.3, roughness: 0.4 }));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    // 飘落的金粉
    const rnd = mulberry32(12); const N = 900; const pos = new Float32Array(N * 3), sd = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = -14 + rnd() * 40; pos[i * 3 + 1] = rnd() * 30; pos[i * 3 + 2] = -10 + rnd() * 18; sd[i] = rnd(); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    this.glitter = new THREE.Points(gg, new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, pxScale: { value: 1600 }, focus: { value: 40 }, amt: { value: 1 } },
      vertexShader: `uniform float time, pxScale, focus, amt; attribute float aSeed; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y - time * (1.2 + aSeed * 1.5), 30.0); p.x += sin(time * 0.8 + aSeed * 40.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z; float sharp = 0.07 * pxScale / d; float coc = abs(d - focus) / d * 30.0;
          float sz = clamp(sqrt(sharp * sharp + coc * coc), 1.2, 40.0); gl_PointSize = sz;
          float tw = pow(0.5 + 0.5 * sin(time * (6.0 + aSeed * 10.0) + aSeed * 90.0), 6.0);
          vA = amt * (sharp * sharp) / (sz * sz) * (0.3 + 2.5 * tw); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord * 2.0 - 1.0; float r = dot(c, c); if (r > 1.0) discard; gl_FragColor = vec4(vec3(2.4, 1.6, 0.7) * vA * smoothstep(1.0, 0.5, r), 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.glitter.frustumCulled = false; this.scene.add(this.glitter);
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const a = info.cue('v16a'), b = info.cue('v16b');
    this.t1.rotation.y = t * 0.35; this.t2.rotation.y = -t * 0.3 + 1;
    const truck = seg(t, b - 0.8, b + 1.2, ease.inOutCubic);
    const cam = this.camera;
    const push = seg(t, 0, D, ease.inOutSine);
    cam.position.set(lerp(-2, 18, truck) + fbm1(t * 0.3, 2) * 0.15, lerp(4.2, 5.2, push), lerp(30, 25, push) - truck * 1.5);
    cam.lookAt(lerp(-3.8, 16.2, truck), 6.4, lerp(0, -2, truck));
    const gu = this.glitter.material.uniforms;
    gu.time.value = t; gu.focus.value = cam.position.distanceTo(new THREE.Vector3(lerp(0, 20, truck), 6, 0));
    gu.pxScale.value = (this.H / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    this.renderTo(rt);
    const lg = ctx.createLinearGradient(0, 0, 900, 0); lg.addColorStop(0, 'rgba(0,0,0,0.55)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, 900, 420);
    const o1 = 1 - smooth(b - 0.6, b, t);
    revealText(ctx, '1982', 150, 130, seg(t, a - 0.3, a + 1.0, ease.linear) * o1, { font: '400 92px Cinzel', color: '#f6dba8', align: 'left', tracking: 14, stagger: 0.15, blurMax: 10 });
    revealText(ctx, '汤姆斯杯 · 中国男队首次出征即夺冠', 156, 210, seg(t, a + 0.4, a + 1.8, ease.linear) * o1, { font: '500 28px NotoSerifSC', color: '#f0d9b0', align: 'left', tracking: 6, stagger: 0.04 });
    revealText(ctx, 'THOMAS CUP  ·  CHINA', 158, 252, seg(t, a + 0.8, a + 2.2, ease.linear) * o1, { font: '400 16px Cinzel', color: '#dcbf8e', align: 'left', tracking: 6, stagger: 0.02 });
    revealText(ctx, '1984', 150, 130, seg(t, b, b + 1.2, ease.linear), { font: '400 92px Cinzel', color: '#f6dba8', align: 'left', tracking: 14, stagger: 0.15, blurMax: 10 });
    revealText(ctx, '尤伯杯 · 中国女队首次夺冠', 156, 210, seg(t, b + 0.4, b + 1.8, ease.linear), { font: '500 28px NotoSerifSC', color: '#f0d9b0', align: 'left', tracking: 6, stagger: 0.05 });
    revealText(ctx, 'UBER CUP  ·  CHINA', 158, 252, seg(t, b + 0.8, b + 2.2, ease.linear), { font: '400 16px Cinzel', color: '#dcbf8e', align: 'left', tracking: 6, stagger: 0.02 });
    return {
      overlay: true,
      grade: { exposure: 1.05, bloom: 0.75, bloomThreshold: 0.85, halation: 0.35, vignette: 0.6, grain: 0.045, saturation: 1.08, contrast: 1.08, chroma: 0.0016, highTint: [0.02, 0.006, -0.02] },
    };
  }
}
