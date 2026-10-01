// 尾声：快速蒙太奇回顾前面各幕（毽子、蚀刻、球网、庄园、球场、地球、金牌、565）；
// 回到黑暗中的那束光——羽毛球缓缓坠落，在离地一厘米处定格：“别让它落地。”
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { clamp, lerp, seg, ease, smooth, fbm1, noise1, invLerp } from '../engine/util.js';
import { makeLighting, createShuttle } from '../assets/shuttle.js';
import { createBeam, createDust } from '../assets/atmos.js';
import { NOISE } from '../engine/glsl.js';

const MONTAGE = [
  ['origins', 3.4], ['europe', 5.0], ['poona', 11.6], ['manor', 17.6],
  ['rules', 16.0], ['world', 22.8], ['olympics', 16.6], ['speed', 16.2],
];

export class Finale extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.subs = {};
    // ---- 光束中的羽毛球 ----
    this.camera.fov = 24; this.camera.near = 0.3; this.camera.far = 600; this.camera.updateProjectionMatrix();
    this.L = makeLighting();
    this.L.keyDir.value.set(-0.12, 1, -0.18).normalize();
    this.L.beamA.value.set(0, 4.6, 0); this.L.beamD.value.copy(this.L.keyDir.value);
    this.L.keyColor.value.multiplyScalar(1.05);
    this.sh = createShuttle(this.L);
    this.pivot = new THREE.Group(); this.pivot.add(this.sh.group); this.sh.group.position.y = -4.6;
    this.scene.add(this.pivot);
    const kd = this.L.keyDir.value;
    const apex = new THREE.Vector3(0, 4.6, 0).addScaledVector(kd, 75);
    this.beam = createBeam({ apex, dir: kd.clone().negate(), length: 140, r0: 1.2, r1: 14, intensity: 0.075 });
    this.scene.add(this.beam);
    this.dust = createDust(this.L, { count: 4000, box: [70, 70, 70], center: new THREE.Vector3(0, 0, -6) });
    this.scene.add(this.dust);
    // 地板：深色木地板上的一条白色边线，被光束照亮
    this.floorY = -40;
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({
      uniforms: { ...this.L, shadowP: { value: new THREE.Vector3() }, shadowA: { value: 0 } },
      vertexShader: `varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `${NOISE}
        uniform vec3 beamA, beamD, keyColor, shadowP; uniform float beamR, beamOn, shadowA; varying vec3 vP;
        void main(){
          float s = (vP.y - beamA.y) / beamD.y; vec3 c0 = beamA + beamD * s; vec2 d = vP.xz - c0.xz;
          float pool = exp(-dot(d, d) / (beamR * beamR * 2.2));
          float plank = 0.85 + 0.15 * sin(vP.x * 0.9 + fbm4(vP.xz * vec2(0.05, 0.6)) * 3.0);
          vec3 wood = vec3(0.30, 0.17, 0.08) * plank * (0.8 + 0.4 * fbm4(vP.xz * vec2(0.08, 1.2)));
          float line = smoothstep(2.6, 2.2, abs(vP.z - 2.0));                      // 场地白线（4 厘米宽）
          vec3 base = mix(wood, vec3(0.9, 0.88, 0.84), line);
          float sh = 1.0 - shadowA * exp(-dot(vP.xz - shadowP.xz, vP.xz - shadowP.xz) / 6.0);
          vec3 c = base * keyColor * pool * beamOn * 0.55 * sh + base * 0.004;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = this.floorY;
    this.scene.add(this.floor);
  }

  sub(id) {
    if (!this.subs[id]) {
      const def = this.eng.TL.scenes.find((s) => s.id === id);
      const Cls = this.eng.SCENES[id];
      this.subs[id] = { inst: new Cls(this.eng, def), def };
    }
    return this.subs[id];
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const c22 = info.cue('v22'), c22e = info.cue('v22', 1), c23 = info.cue('v23'), c23e = info.cue('v23', 1), c24 = info.cue('v24'), c24e = info.cue('v24', 1);
    const m0 = c22 - 0.25, mLen = Math.max(0.45, (c22e + 0.25 - m0) / MONTAGE.length);
    const mEnd = m0 + mLen * MONTAGE.length;
    // ---------- 蒙太奇 ----------
    if (t >= m0 && t < mEnd) {
      const i = Math.floor((t - m0) / mLen);
      const [id, at] = MONTAGE[i];
      const S = this.sub(id);
      const lt = at + (t - m0 - i * mLen) * 1.0;
      const fake = { t: lt, dur: S.def.dur, p: lt / S.def.dur, id, global: t, cues: S.def.cues, cue: (cid, w = 0, f = 0) => (S.def.cues[cid] ? S.def.cues[cid][w] : f) };
      const res = S.inst.render(fake, rt, ctx) || {};
      const since = t - m0 - i * mLen;
      const g = { ...(res.grade || {}) };
      g.flash = Math.max(g.flash || 0, Math.exp(-since * 14) * 0.35);
      g.fade = 0;
      return { overlay: res.overlay, overlayGain: res.overlayGain, grade: g };
    }
    // 蒙太奇结束后释放子场景
    if (t >= mEnd) for (const k of Object.keys(this.subs)) { this.subs[k].inst.dispose?.(); delete this.subs[k]; }

    // ---------- 光束中的羽毛球 ----------
    const L = this.L;
    const fallT0 = c23e - 0.4, freezeT = c24e + 0.15;
    const fallDur = freezeT - fallT0;
    let y = 4.6 + 0.3 * Math.sin(t * 0.9);
    let tumble = 0;
    const restY = this.floorY + 1.0;   // 球托离地约 1 厘米
    if (t > fallT0) {
      const k = clamp((t - fallT0) / fallDur);
      // 缓慢下坠，最后几帧急剧减速直至静止
      const e = 1 - Math.pow(1 - k, 2.6);
      y = lerp(4.6, restY + 4.6, e);
      tumble = e;
    }
    const frozen = t > freezeT;
    this.pivot.position.set(0, y, 0);
    // 下落时转成“球托朝下”的稳定姿态
    this.pivot.rotation.set(lerp(-0.25, 0, tumble), (frozen ? freezeT : t) * 0.5, 0.15 * Math.sin((frozen ? freezeT : t) * 0.7) * (1 - tumble));
    L.beamA.value.set(0, y, 0);
    const dim = 1 - smooth(freezeT + 0.6, D - 0.2, t);
    const beamOn = smooth(mEnd, mEnd + 1.2, t) * dim;
    L.beamOn.value = beamOn;
    this.beam.material.uniforms.intensity.value = 0.075 * beamOn;
    this.beam.material.uniforms.time.value = frozen ? freezeT : t;
    // 镜头：环绕 → 跟随下落 → 贴地平视定格
    const cam = this.camera;
    const follow = seg(t, fallT0 - 0.5, freezeT, ease.inOutSine);
    const orbit = 0.4 + 0.08 * (t - mEnd);
    const R = lerp(30, 36, follow);
    cam.position.set(Math.sin(orbit) * R, y + lerp(1.0, 3.0, follow), Math.cos(orbit) * R);
    cam.lookAt(0, y - lerp(0, 2.0, follow), 0);
    const du = this.dust.material.uniforms;
    du.time.value = frozen ? freezeT : t;
    du.focus.value = R; du.pxScale.value = (this.H / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    du.boxCenter.value.set(0, y, -6);
    const fu = this.floor.material.uniforms;
    fu.shadowP.value.set(0, this.floorY, 0); fu.shadowA.value = smooth(fallT0 + fallDur * 0.6, freezeT, t) * 0.75;
    this.renderTo(rt);
    return {
      overlay: false,
      grade: { exposure: 1.0, bloom: 0.55, bloomThreshold: 1.0, halation: 0.25, vignette: 0.6, grain: 0.04, saturation: 0.92, contrast: 1.06, chroma: 0.0012,
        flash: t < mEnd + 0.6 ? Math.exp(-(t - mEnd) * 5) * 0.5 : 0, fade: smooth(D - 1.0, D, t) * 0.0 },
    };
  }

  dispose() { for (const k of Object.keys(this.subs)) this.subs[k].inst.dispose?.(); super.dispose(); }
}
