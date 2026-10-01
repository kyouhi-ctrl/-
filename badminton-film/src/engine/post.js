// 电影后期：泛光（多级 mip）、红色光晕（halation）、ACES 色调映射、
// 调色（lift/gamma/gain、分离色调、饱和度、对比度）、色差、暗角、胶片颗粒、闪白/淡出。
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FS_VERT, NOISE } from './glsl.js';

export const DEFAULT_GRADE = {
  exposure: 1.0, bloom: 0.55, bloomThreshold: 0.9, bloomKnee: 0.6, halation: 0.18,
  lift: [0.0, 0.0, 0.0], gamma: [1.0, 1.0, 1.0], gain: [1.0, 1.0, 1.0],
  shadowTint: [-0.012, 0.004, 0.018], highTint: [0.02, 0.008, -0.016],
  saturation: 1.0, contrast: 1.04, vignette: 0.45, grain: 0.035, chroma: 0.0016,
  flash: 0.0, fade: 0.0, flashColor: [1, 1, 1],
};

export function mixGrade(a, b, k) {
  const o = {};
  for (const key of Object.keys(DEFAULT_GRADE)) {
    const va = a[key] ?? DEFAULT_GRADE[key], vb = b[key] ?? DEFAULT_GRADE[key];
    o[key] = Array.isArray(va) ? va.map((v, i) => v + (vb[i] - v) * k) : va + (vb - va) * k;
  }
  return o;
}

const DOWN13 = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold, knee; uniform bool prefilter;
varying vec2 vUv;
vec3 q(vec2 o){ return texture2D(tSrc, vUv + o*texel).rgb; }
void main(){
  vec3 a=q(vec2(-2,-2)), b=q(vec2(0,-2)), c=q(vec2(2,-2));
  vec3 d=q(vec2(-1,-1)), e=q(vec2(1,-1));
  vec3 f=q(vec2(-2,0)), g=q(vec2(0,0)), h=q(vec2(2,0));
  vec3 i=q(vec2(-1,1)), j=q(vec2(1,1));
  vec3 k=q(vec2(-2,2)), l=q(vec2(0,2)), m=q(vec2(2,2));
  vec3 col = (d+e+i+j)*0.125 + (a+b+f+g)*0.03125 + (b+c+g+h)*0.03125 + (f+g+k+l)*0.03125 + (g+h+l+m)*0.03125;
  if (prefilter) {
    col = min(col, vec3(60.0));
    float br = max(col.r, max(col.g, col.b));
    float rq = clamp(br - threshold + knee, 0.0, 2.0*knee);
    rq = rq*rq / (4.0*knee + 1e-4);
    col *= max(rq, br - threshold) / max(br, 1e-4);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const UPTENT = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel; uniform float scatter; varying vec2 vUv;
void main(){
  vec4 d = texel.xyxy * vec4(1.,1.,-1.,0.);
  vec3 s = texture2D(tSrc, vUv - d.xy).rgb + texture2D(tSrc, vUv - d.wy).rgb*2. + texture2D(tSrc, vUv - d.zy).rgb
         + texture2D(tSrc, vUv + d.zw).rgb*2. + texture2D(tSrc, vUv).rgb*4. + texture2D(tSrc, vUv + d.xw).rgb*2.
         + texture2D(tSrc, vUv + d.zy).rgb + texture2D(tSrc, vUv + d.wy).rgb*2. + texture2D(tSrc, vUv + d.xy).rgb;
  gl_FragColor = vec4(s * (1.0/16.0) * scatter, 1.0);
}`;

const FINAL = /* glsl */ `
uniform sampler2D tHDR, tBloom, tGrain;
uniform float exposure, bloomStr, halation, saturation, contrast, vignette, grain, chroma, flash, fade, time;
uniform vec3 lift, gammaV, gain, shadowTint, highTint, flashColor;
uniform vec2 res;
varying vec2 vUv;
${NOISE}
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = vUv;
  vec2 d = uv - 0.5; d.x *= res.x/res.y;
  float r2 = dot(d, d);
  vec2 off = (uv - 0.5) * chroma * (0.4 + r2*2.0);
  vec3 col;
  col.r = texture2D(tHDR, uv - off).r;
  col.g = texture2D(tHDR, uv).g;
  col.b = texture2D(tHDR, uv + off).b;
  vec3 bl = texture2D(tBloom, uv).rgb;
  col += bl * bloomStr;
  col += bl * halation * vec3(1.0, 0.32, 0.10);
  col *= exposure;
  col = aces(col);
  col = toSRGB(col);
  // lift / gamma / gain（显示空间）
  col = gain * (col + lift * (1.0 - col));
  col = pow(max(col, 0.0), 1.0 / gammaV);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += shadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + highTint * smoothstep(0.35, 1.0, l);
  l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col = (col - 0.5) * contrast + 0.5;
  col *= mix(1.0, smoothstep(1.25, 0.15, sqrt(r2) * 1.05), vignette);
  col = mix(col, flashColor, clamp(flash, 0.0, 1.0));
  col *= (1.0 - fade);
  // 胶片颗粒：预生成的柔和颗粒纹理，每帧随机偏移；暗部颗粒更明显
  vec2 go = vec2(hash12(vec2(floor(time*24.0), 1.7)), hash12(vec2(floor(time*24.0), 9.3)));
  float g = texture2D(tGrain, uv * res / 512.0 + go).r - 0.5;
  float lum = dot(col, vec3(0.333));
  col += g * grain * (1.15 - 0.75 * lum);
  col += (hash12(uv*res + time) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Post {
  constructor(renderer, W, H) {
    this.r = renderer; this.W = W; this.H = H;
    this.quad = new FullScreenQuad(null);
    this.mips = [];
    let w = W >> 1, h = H >> 1;
    for (let i = 0; i < 6; i++) {
      this.mips.push(new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
      w = Math.max(2, w >> 1); h = Math.max(2, h >> 1);
    }
    this.down = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: DOWN13, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: 0.5 }, prefilter: { value: false } },
    });
    this.up = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: UPTENT, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, transparent: true,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, scatter: { value: 0.85 } },
    });
    // 柔和颗粒纹理（高斯模糊过的白噪声，避免逐像素噪点难以压缩）
    const N = 512, data = new Uint8Array(N * N * 4);
    const raw = new Float32Array(N * N);
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < N * N; i++) { const u = rnd() || 1e-6, v = rnd(); raw[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); }
    const blur = new Float32Array(N * N);
    const k = [0.25, 0.5, 0.25];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += raw[((y + j + N) % N) * N + ((x + i + N) % N)] * k[i + 1] * k[j + 1];
      blur[y * N + x] = s;
    }
    for (let i = 0; i < N * N; i++) { const v = Math.max(0, Math.min(255, 128 + blur[i] * 120)); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
    this.grainTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    this.grainTex.wrapS = this.grainTex.wrapT = THREE.RepeatWrapping;
    this.grainTex.magFilter = THREE.LinearFilter; this.grainTex.minFilter = THREE.LinearFilter;
    this.grainTex.needsUpdate = true;
    const U = (v) => ({ value: v });
    this.final = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: FINAL, depthTest: false, depthWrite: false,
      uniforms: {
        tHDR: U(null), tBloom: U(null), tGrain: U(this.grainTex), res: U(new THREE.Vector2(W, H)),
        exposure: U(1), bloomStr: U(0.5), halation: U(0.2), saturation: U(1), contrast: U(1), vignette: U(0.4),
        grain: U(0.03), chroma: U(0.002), flash: U(0), fade: U(0), time: U(0),
        lift: U(new THREE.Vector3()), gammaV: U(new THREE.Vector3(1, 1, 1)), gain: U(new THREE.Vector3(1, 1, 1)),
        shadowTint: U(new THREE.Vector3()), highTint: U(new THREE.Vector3()), flashColor: U(new THREE.Vector3(1, 1, 1)),
      },
    });
  }

  render(srcTex, g, time, target = null) {
    const r = this.r;
    // 泛光：预过滤 + 逐级下采样
    let src = srcTex, sw = this.W, sh = this.H;
    for (let i = 0; i < this.mips.length; i++) {
      const m = this.mips[i];
      this.down.uniforms.tSrc.value = src;
      this.down.uniforms.texel.value.set(1 / sw, 1 / sh);
      this.down.uniforms.prefilter.value = i === 0;
      this.down.uniforms.threshold.value = g.bloomThreshold;
      this.down.uniforms.knee.value = g.bloomKnee;
      this.quad.material = this.down;
      r.setRenderTarget(m); r.autoClear = true; this.quad.render(r);
      src = m.texture; sw = m.width; sh = m.height;
    }
    // 逐级上采样叠加
    r.autoClear = false;
    for (let i = this.mips.length - 2; i >= 0; i--) {
      const s = this.mips[i + 1];
      this.up.uniforms.tSrc.value = s.texture;
      this.up.uniforms.texel.value.set(1 / s.width, 1 / s.height);
      this.quad.material = this.up;
      r.setRenderTarget(this.mips[i]); this.quad.render(r);
    }
    r.autoClear = true;
    const u = this.final.uniforms;
    u.tHDR.value = srcTex; u.tBloom.value = this.mips[0].texture;
    u.exposure.value = g.exposure; u.bloomStr.value = g.bloom; u.halation.value = g.halation;
    u.saturation.value = g.saturation; u.contrast.value = g.contrast; u.vignette.value = g.vignette;
    u.grain.value = g.grain; u.chroma.value = g.chroma; u.flash.value = g.flash; u.fade.value = g.fade; u.time.value = time;
    u.lift.value.fromArray(g.lift); u.gammaV.value.fromArray(g.gamma); u.gain.value.fromArray(g.gain);
    u.shadowTint.value.fromArray(g.shadowTint); u.highTint.value.fromArray(g.highTint); u.flashColor.value.fromArray(g.flashColor);
    this.quad.material = this.final;
    r.setRenderTarget(target); this.quad.render(r);
  }
}
