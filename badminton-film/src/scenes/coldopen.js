// 第一幕 · 冷开场：黑暗中一束光，一根羽毛飘落；十六根羽毛飞来组装成羽毛球；
// 光线颤动、蓄力——以 565 km/h 冲向镜头，白闪，黑场。
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { clamp, lerp, seg, ease, smooth, mulberry32, noise1, fbm1, invLerp } from '../engine/util.js';
import { makeLighting, createShuttle, featherSlot, SHUTTLE } from '../assets/shuttle.js';
import { createBeam, createDust } from '../assets/atmos.js';
import { project, leader, text, revealText } from '../engine/overlay.js';

const CENTER_Y = 4.6;

export class ColdOpen extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.camera.fov = 24; this.camera.near = 0.3; this.camera.far = 600; this.camera.updateProjectionMatrix();
    this.L = makeLighting();
    this.L.beamA.value.set(0, CENTER_Y, 0);
    const keyDir = this.L.keyDir.value;
    this.L.beamD.value.copy(keyDir);

    this.pivot = new THREE.Group(); this.pivot.position.set(0, CENTER_Y, 0);
    this.scene.add(this.pivot);
    this.sh = createShuttle(this.L);
    this.sh.group.position.y = -CENTER_Y;
    this.pivot.add(this.sh.group);

    const apex = new THREE.Vector3(0, CENTER_Y, 0).addScaledVector(keyDir, 75);
    this.beam = createBeam({ apex, dir: keyDir.clone().negate(), length: 130, r0: 1.2, r1: 13, intensity: 0.075 });
    this.beam2 = createBeam({ apex, dir: keyDir.clone().negate(), length: 130, r0: 0.5, r1: 6.0, intensity: 0.05 });
    this.scene.add(this.beam, this.beam2);
    this.dust = createDust(this.L, { count: 4500, box: [70, 60, 70], center: new THREE.Vector3(0, 4, -6) });
    this.scene.add(this.dust);

    // 冲击波光环
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { prog: { value: 0 }, strength: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float prog, strength; varying vec2 vUv;
        void main(){ float r = length(vUv - 0.5) * 2.0; float R = prog; float w = 0.012 + 0.05 * prog;
          float ring = exp(-pow((r - R) / w, 2.0)); float core = exp(-r * r * 180.0) * (1.0 - prog);
          vec3 c = vec3(1.0, 0.86, 0.7) * (ring * 2.2 + core * 3.0) * strength; gl_FragColor = vec4(c, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.ring.scale.setScalar(34); this.ring.visible = false; this.ring.renderOrder = 10;
    this.scene.add(this.ring);

    // 每根羽毛的飞入起点（确定性随机）
    const rnd = mulberry32(42);
    this.starts = [];
    for (let i = 0; i < SHUTTLE.count; i++) {
      const s = featherSlot(i);
      const out = new THREE.Vector3(s.pos.x, 0, s.pos.z).normalize();
      const dist = 16 + rnd() * 10;
      const p = s.pos.clone().addScaledVector(out, dist).add(new THREE.Vector3(0, (rnd() - 0.35) * 14, (rnd() - 0.5) * 6));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28));
      this.starts.push({ pos: p, quat: q });
    }
    this.tmpQ = new THREE.Quaternion(); this.tmpV = new THREE.Vector3();
  }

  times(info) {
    const c = (id, w = 0) => info.cue(id, w);
    const T = {
      v1s: c('v01'), v2s: c('v02'), v2e: c('v02', 1), v3s: c('v03'), v3e: c('v03', 1),
      v4as: c('v04a'), v4bs: c('v04b'), v4be: c('v04b', 1),
    };
    T.asm = T.v2s - 0.2;            // 组装开始
    T.strike = T.v4be + 0.12;       // 击球瞬间
    return T;
  }

  // 主角羽毛（第 0 根）在飘落阶段的位姿（球体局部坐标）
  heroPose(t, T) {
    const fall = clamp(t / (T.asm + 0.3));
    const y = lerp(19, 7.0, ease.outSine(fall)) - CENTER_Y + 0.0;
    const x = 1.8 * Math.sin(0.75 * t + 0.6) * (1 - fall * 0.6);
    const z = 1.0 * Math.sin(0.55 * t + 1.3);
    const rock = 0.55 * Math.sin(1.9 * t) + 0.15 * Math.sin(3.1 * t + 1.0);
    const spin = 0.45 * t + 0.4;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9 + rock * 0.6, spin, rock, 'YXZ'));
    return { pos: new THREE.Vector3(x, y + CENTER_Y, z), quat: q };
  }

  // v03 “在孩童的脚尖跳跃，在贵族的花园里飞舞”时，闪回两个未来的画面
  flashback(info, T, rt, ctx) {
    const t = info.t;
    const span = T.v3e - T.v3s;
    const shots = [
      { id: 'origins', t0: T.v3s + span * 0.30, d: 0.95, at: 1.15 },
      { id: 'europe', t0: T.v3s + span * 0.68, d: 0.95, at: 0.05 },
    ];
    for (const sh of shots) {
      if (t < sh.t0 || t >= sh.t0 + sh.d) continue;
      this.subs ||= {};
      if (!this.subs[sh.id]) {
        const def = this.eng.TL.scenes.find((s) => s.id === sh.id);
        this.subs[sh.id] = { inst: new this.eng.SCENES[sh.id](this.eng, def), def };
      }
      const S = this.subs[sh.id];
      const lt = sh.at + (t - sh.t0);
      const fake = { t: lt, dur: S.def.dur, p: lt / S.def.dur, id: sh.id, global: info.global, cues: S.def.cues, cue: (c, w = 0, f = 0) => (S.def.cues[c] ? S.def.cues[c][w] : f) };
      const res = S.inst.render(fake, rt, ctx) || {};
      const k = (t - sh.t0) / sh.d;
      const g = { ...(res.grade || {}) };
      g.flash = Math.max(g.flash || 0, Math.exp(-k * 18) * 0.7, Math.max(0, (k - 0.82) / 0.18) * 0.6);
      g.vignette = 0.7;
      return { overlay: res.overlay, overlayGain: res.overlayGain, grade: g };
    }
    if (this.subs && t > T.v3e + 0.5) { for (const k of Object.keys(this.subs)) this.subs[k].inst.dispose?.(); this.subs = null; }
    return null;
  }

  dispose() { if (this.subs) for (const k of Object.keys(this.subs)) this.subs[k].inst.dispose?.(); super.dispose(); }

  render(info, rt, ctx) {
    const t = info.t, T = this.times(info), cam = this.camera;
    const fb = this.flashback(info, T, rt, ctx);
    if (fb) return fb;
    const L = this.L;
    // ---------------- 光线 ----------------
    let beamOn = smooth(0.4, 2.8, t) * (0.92 + 0.08 * Math.sin(t * 0.7));
    if (t < 2.2) beamOn *= 0.75 + 0.25 * Math.max(0, noise1(t * 14, 3)); // 灯丝预热的轻微闪烁
    // “直到有一天——”：光线呼吸般颤动
    const tension = smooth(T.v4as - 0.2, T.v4as + 0.4, t) * (1 - smooth(T.strike, T.strike + 0.05, t));
    if (tension > 0) {
      const fl = Math.max(0, noise1(t * 9, 11)) * 0.35 + (Math.sin(t * 31) > 0.86 ? 0.25 : 0);
      beamOn *= 1 - tension * fl;
    }
    const preStrike = smooth(T.strike - 0.5, T.strike, t) * (1 - smooth(T.strike, T.strike + 0.3, t));
    beamOn *= 1 + preStrike * 0.8;
    L.beamOn.value = beamOn;
    this.beam.material.uniforms.time.value = t; this.beam2.material.uniforms.time.value = t;
    this.beam.material.uniforms.intensity.value = 0.075 * beamOn; this.beam2.material.uniforms.intensity.value = 0.05 * beamOn;

    // ---------------- 球体整体 ----------------
    const asmK = seg(t, T.asm, T.asm + 3.2);
    // 软木托升起
    const corkK = seg(t, T.asm - 0.2, T.asm + 1.5, ease.outCubic);
    this.sh.cork.position.y = lerp(-16, 0, corkK);
    this.sh.cork.visible = corkK > 0.001;
    // 扎线出现
    const ringK = seg(t, T.asm + 2.6, T.asm + 3.4, ease.outCubic);
    this.sh.rings.forEach((r, i) => { r.visible = ringK > 0.01; const k = clamp(ringK * 1.4 - i * 0.4); r.scale.setScalar(lerp(1.6, 1, ease.outCubic(k))); });
    this.sh.threadMat.uniforms.opacity.value = ringK;

    // 羽毛
    for (let i = 0; i < SHUTTLE.count; i++) {
      const f = this.sh.feathers[i];
      const slot = featherSlot(i);
      const mat = f.material;
      if (i === 0) {
        const hp = this.heroPose(t, T);
        // 从世界坐标转到球体局部（球体在组装前保持单位姿态）
        const k = seg(t, T.asm, T.asm + 1.9, ease.inOutCubic);
        f.position.lerpVectors(hp.pos, slot.pos, k);
        f.position.y += Math.sin(k * Math.PI) * 1.2;
        f.quaternion.slerpQuaternions(hp.quat, slot.quat, k);
        mat.uniforms.emissive.value = 0.02;
        f.visible = true;
      } else {
        const t0 = T.asm + 0.55 + (i - 1) * 0.105, t1 = t0 + 1.05;
        const k = seg(t, t0, t1, ease.outCubic);
        f.visible = t > t0;
        const st = this.starts[i];
        f.position.lerpVectors(st.pos, slot.pos, k);
        f.quaternion.slerpQuaternions(st.quat, slot.quat, ease.outQuart(invLerp(t0, t1, t)));
        const land = Math.exp(-Math.max(0, t - t1) * 9) * (t > t1 ? 1 : 0);
        mat.uniforms.emissive.value = land * 0.9;
        mat.uniforms.opacity.value = smooth(t0, t0 + 0.25, t);
      }
    }

    // 悬浮、旋转、蓄力朝向镜头
    const hover = smooth(T.v3s - 1.0, T.v3s + 1.5, t);
    const spinY = 0.18 * Math.max(0, t - T.asm) + 0.35 * hover * Math.max(0, t - T.v3s);
    const bob = hover * 0.35 * Math.sin((t - T.v3s) * 1.1);
    const aim = seg(t, T.v4bs - 0.2, T.strike - 0.25, ease.inOutCubic);
    this.pivot.rotation.set(-Math.PI / 2 * aim * 0.92, spinY * (1 - aim * 0.7), 0.06 * Math.sin(t * 0.5) * (1 - aim));
    this.pivot.position.set(0, CENTER_Y + bob, 0);

    // 击球：冲向镜头
    const ts = T.strike;
    let shake = 0;
    if (t >= ts) {
      const k = clamp((t - ts) / 0.2);
      const zTarget = cam.position.z + 8;
      this.pivot.position.z = lerp(0, zTarget, ease.inExpo(k) * 0.98 + k * 0.02);
      this.pivot.rotation.z += (t - ts) * 25;
      shake = Math.exp(-(t - ts) * 4) * 1.2;
      this.ring.visible = true;
      const rp = clamp((t - ts) / 0.7);
      this.ring.material.uniforms.prog.value = ease.outCubic(rp);
      this.ring.material.uniforms.strength.value = (1 - rp) * 1.0;
      this.ring.position.set(0, CENTER_Y, -1.5);
    } else this.ring.visible = false;

    // ---------------- 镜头 ----------------
    const hp = this.heroPose(Math.min(t, T.asm), T);
    const hpC = hp.pos.clone().add(new THREE.Vector3(0, 3.2, 0).applyQuaternion(hp.quat));
    const camA = { pos: hpC.clone().add(new THREE.Vector3(-1.2, 0.5, 14.5)), tgt: hpC };
    const k1 = seg(t, T.asm - 0.3, T.asm + 2.6, ease.inOutCubic);
    const orbit = 1.25 * ease.inOutSine(invLerp(T.v3s - 1.0, T.v4bs + 1.5, t));
    const push = seg(t, T.v4as, ts, ease.inOutSine);
    const R = lerp(lerp(33, 31, hover), 23, push);
    const camH = lerp(lerp(2.0, 3.0 + 3.5 * Math.sin(Math.PI * invLerp(T.v3s, T.v4as + 0.5, t)), hover), CENTER_Y + 0.2, push);
    const camB = { pos: new THREE.Vector3(Math.sin(orbit) * R, camH, Math.cos(orbit) * R), tgt: new THREE.Vector3(0, CENTER_Y + 0.1, 0) };
    const pos = camA.pos.clone().lerp(camB.pos, k1);
    const tgt = camA.tgt.clone().lerp(camB.tgt, k1);
    // 手持感 + 冲击震动
    const hand = 0.06 + shake;
    pos.x += fbm1(t * 0.5, 1) * hand * 1.5; pos.y += fbm1(t * 0.5, 2) * hand;
    tgt.x += fbm1(t * 0.4, 3) * hand * 0.6; tgt.y += fbm1(t * 0.4, 4) * hand * 0.6;
    if (shake > 0) { pos.x += noise1(t * 60, 5) * shake * 0.6; pos.y += noise1(t * 60, 6) * shake * 0.6; }
    cam.position.copy(pos); cam.lookAt(tgt);
    cam.fov = lerp(24, 21, push) + (t > ts ? 6 * ease.outCubic(clamp((t - ts) / 0.3)) : 0);
    cam.updateProjectionMatrix();

    // ---------------- 浮尘 ----------------
    const du = this.dust.material.uniforms;
    du.time.value = t;
    du.focus.value = pos.distanceTo(tgt);
    du.pxScale.value = (this.H / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    du.suck.value = preStrike * 1.5;
    du.burst.value = t > ts ? ease.outCubic(clamp((t - ts) / 0.8)) * 1.0 : 0;
    du.burstP.value.set(0, CENTER_Y, 0);

    this.renderTo(rt);
    const overlay = this.drawOverlay(ctx, t, T);

    // ---------------- 后期 ----------------
    const flash = t < ts ? 0 : clamp((t - ts - 0.08) / 0.1) * (1 - smooth(ts + 0.35, ts + 1.1, t));
    const fade = smooth(ts + 0.5, ts + 1.15, t);
    return {
      overlay,
      grade: {
        exposure: 1.0 + preStrike * 0.25, bloom: 0.5, bloomThreshold: 1.0, halation: 0.25,
        vignette: 0.6, grain: 0.04, chroma: 0.0018 + preStrike * 0.004 + (t > ts ? 0.02 * Math.exp(-(t - ts) * 5) : 0),
        saturation: 0.92, contrast: 1.06, flash, fade,
        lift: [0.004, 0.006, 0.012], gain: [1.02, 1.0, 0.96],
      },
    };
  }

  // 信息标注：“16 根羽毛 / 软木球托”，以及击球瞬间的径向速度线
  drawOverlay(ctx, t, T) {
    let drew = false;
    const a0 = T.asm + 2.0, a1 = T.v3s + 0.4;
    if (t > a0 && t < a1 + 0.6) {
      this.scene.updateMatrixWorld(true);
      const fade = 1 - Math.min(1, Math.max(0, (t - a1) / 0.6));
      const slot = featherSlot(1);
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(slot.quat);
      const pF = this.sh.group.localToWorld(slot.pos.clone().addScaledVector(axis, 5.2));
      const pC = this.sh.group.localToWorld(new THREE.Vector3(-1.32, 1.05, 0.35));
      const A = project(pF, this.camera, this.W, this.H), B = project(pC, this.camera, this.W, this.H);
      const k1 = Math.min(1, Math.max(0, (t - a0) / 0.9)) * fade;
      const k2 = Math.min(1, Math.max(0, (t - a0 - 0.5) / 0.9)) * fade;
      const gold = 'rgba(232,208,160,0.95)';
      const fx = A.x + 210, fy = A.y - 70;
      leader(ctx, A.x, A.y, fx, fy, k1, { color: gold });
      revealText(ctx, '16', fx + 16, fy - 14, k1, { font: '400 64px Cinzel', color: '#ecd9ae', align: 'left', stagger: 0.25, blurMax: 10 });
      revealText(ctx, 'FEATHERS  ·  羽毛', fx + 18, fy + 34, k1 * 0.9, { font: '400 19px Cinzel', color: '#d9ccb0', align: 'left', tracking: 5, stagger: 0.04 });
      const cx = B.x - 230, cy = B.y + 40;
      leader(ctx, B.x, B.y, cx, cy, k2, { color: gold });
      revealText(ctx, 'CORK BASE', cx - 16, cy - 16, k2, { font: '400 26px Cinzel', color: '#ecd9ae', align: 'right', tracking: 6, stagger: 0.05 });
      revealText(ctx, '软木球托', cx - 18, cy + 22, k2 * 0.9, { font: '300 22px NotoSerifSC', color: '#d9ccb0', align: 'right', tracking: 6, stagger: 0.08 });
      drew = true;
    }
    // 击球速度线
    const ts = T.strike;
    if (t >= ts && t < ts + 0.35) {
      const k = (t - ts) / 0.35;
      const rnd = mulberry32(99);
      ctx.save();
      ctx.translate(this.W / 2, this.H / 2);
      ctx.lineCap = 'round';
      for (let i = 0; i < 160; i++) {
        const ang = rnd() * Math.PI * 2;
        const r0 = (60 + rnd() * 500) * (1 + k * 3.5);
        const len = (80 + rnd() * 260) * (0.3 + k * 2.2);
        const a = (1 - k) * (0.25 + rnd() * 0.6);
        ctx.strokeStyle = `rgba(255,236,205,${a.toFixed(3)})`;
        ctx.lineWidth = 0.8 + rnd() * 2.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * (r0 + len), Math.sin(ang) * (r0 + len));
        ctx.stroke();
      }
      ctx.restore();
      drew = true;
    }
    return drew;
  }
}
