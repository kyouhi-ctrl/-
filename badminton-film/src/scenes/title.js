// 片名：黑场中余烬升起，金色书法“羽”字以熔金笔触显现，随后主副标题浮现。
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { NOISE, FS_VERT } from '../engine/glsl.js';
import { clamp, smooth, seg, ease, mulberry32, lerp } from '../engine/util.js';
import { revealText, text } from '../engine/overlay.js';

// 余烬粒子（暖色、上升、湍流、景深）
export function createEmbers({ count = 900, seed = 5, area = [2400, 1200], color = new THREE.Color(1.0, 0.55, 0.18) } = {}) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3), sd = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * area[0]; pos[i * 3 + 1] = (rnd() - 0.5) * area[1]; pos[i * 3 + 2] = rnd();
    sd[i * 2] = rnd(); sd[i * 2 + 1] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 2));
  const m = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, amount: { value: 1 }, color: { value: color }, area: { value: new THREE.Vector2(...area) }, res: { value: new THREE.Vector2(1920, 804) }, speed: { value: 1 } },
    vertexShader: /* glsl */ `
      ${NOISE}
      uniform float time, amount, speed; uniform vec2 area, res; attribute vec2 aSeed; varying float vA; varying float vHot;
      void main(){
        vec3 p = position;
        float depth = p.z;                    // 0 近 → 1 远
        float sp = mix(95.0, 30.0, depth) * (0.55 + aSeed.x * 0.9) * speed;
        float life = fract(time * sp / area.y + aSeed.y);   // 0 底部出生 → 1 消散
        p.y = -area.y * 0.5 + life * area.y * 0.95;
        p.x += sin(time * 0.7 + aSeed.y * 30.0) * 30.0 + gnoise(vec2(p.y * 0.003, aSeed.x * 20.0)) * 140.0;
        vec2 ndc = p.xy / (res * 0.5);
        float big = step(0.86, aSeed.x);
        float focus = abs(depth - 0.4);
        float sz = mix(7.0, 1.6, depth) * (0.5 + aSeed.y) + big * (18.0 + focus * 40.0);
        gl_PointSize = sz;
        float flick = 0.5 + 0.5 * sin(time * (4.0 + aSeed.x * 9.0) + aSeed.y * 40.0);
        float fadeH = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.35, 0.95, life));
        vA = amount * mix(0.6, 1.0, flick) * mix(1.0, 0.3, depth) * fadeH * (big > 0.5 ? 0.12 : 1.0);
        vHot = aSeed.y;
        gl_Position = vec4(ndc, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; varying float vA; varying float vHot;
      void main(){ vec2 c = gl_PointCoord * 2.0 - 1.0; float r = dot(c, c); if (r > 1.0) discard;
        float k = exp(-r * 3.5);
        vec3 col = mix(color, vec3(1.0, 0.85, 0.55), vHot * 0.6) * (1.0 + 2.0 * exp(-r * 18.0));
        gl_FragColor = vec4(col * k * vA * 2.2, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

// 熔金书法：字形纹理 → 斜向笔触显现 + 浮雕金属光照 + 扫光
export function glyphCanvas(str, font, size, W = 1920, H = 804, x = W / 2, y = H / 2, blur = 0) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  if (blur > 0) c.filter = `blur(${blur}px)`;
  c.fillStyle = '#fff'; c.font = `${size}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(str, x, y);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  return tex;
}

export function goldGlyphMaterial(tex, height) {
  return new THREE.ShaderMaterial({
    uniforms: { glyph: { value: tex }, hmap: { value: height }, reveal: { value: 0 }, glint: { value: -1 }, time: { value: 0 }, bright: { value: 1 }, zoom: { value: 1 }, res: { value: new THREE.Vector2(1920, 804) } },
    vertexShader: `varying vec2 vUv0; void main(){ vUv0 = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform sampler2D glyph, hmap; uniform float reveal, glint, time, bright, zoom; uniform vec2 res;
      varying vec2 vUv0;
      void main(){
        vec2 vUv = 0.5 + (vUv0 - 0.5) / zoom;
        vec2 px = 3.0 / res;
        float a = texture2D(glyph, vUv).a;
        if (a < 0.003) discard;                      // 无字处直接跳过，省去昂贵的噪声计算
        float ax = texture2D(hmap, vUv + vec2(px.x, 0.0)).a - texture2D(hmap, vUv - vec2(px.x, 0.0)).a;
        float ay = texture2D(hmap, vUv + vec2(0.0, px.y)).a - texture2D(hmap, vUv - vec2(0.0, px.y)).a;
        vec2 q = vUv * vec2(res.x / res.y, 1.0);
        float rough = fbm(q * 14.0) * 0.5 + 0.5;           // 金属表面的细微起伏
        vec3 n = normalize(vec3(-ax * 2.2 + (rough - 0.5) * 0.12, -ay * 2.2 + fbm(q * 14.0 + 7.0) * 0.06, 0.30));
        // 笔触显现：沿左上 → 右下推进，噪声边缘
        float d = (vUv.x * 0.55 + (1.0 - vUv.y) * 0.45);
        float nz = fbm(q * 5.0) * 0.12;
        float front = reveal * 1.25 - 0.1;
        float m = smoothstep(front + 0.02, front - 0.02, d + nz);
        float edge = exp(-pow((d + nz - front) / 0.018, 2.0));
        vec3 L = normalize(vec3(-0.45, 0.55, 0.7));
        float diff = max(0.0, dot(n, L));
        // 金属：用反射方向查找“影棚”环境（顶部柔光箱 + 侧逆光 + 暗环境），再乘金色
        vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
        float box = smoothstep(0.15, 0.55, r.y) * (1.0 - smoothstep(0.75, 0.98, r.y));
        float kick = smoothstep(-0.35, -0.75, r.x) * 0.6;
        float env = 0.06 + box * 1.25 + kick + pow(max(0.0, dot(r, L)), 30.0) * 2.0;
        float fres = pow(1.0 - n.z, 2.0);
        vec3 goldC = vec3(1.0, 0.58, 0.19) * 0.62;
        vec3 col = goldC * env * (0.85 + 0.15 * rough) + vec3(1.0, 0.85, 0.6) * fres * 0.25;
        vec3 hi = vec3(1.0, 0.88, 0.6);
        float gl = exp(-pow((vUv.x * 0.8 - vUv.y * 0.35 - glint) / 0.035, 2.0));
        col += hi * gl * 1.4 * (0.3 + diff);
        col *= bright;
        col += vec3(1.0, 0.55, 0.2) * edge * 3.0 * a;      // 熔融的显现边缘
        gl_FragColor = vec4(col * a * m, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  });
}

export class Title extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // 背景：极暗的暖色烟雾
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, amt: { value: 0 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `${NOISE} uniform float time, amt; varying vec2 vUv;
        void main(){ vec2 q = vUv * vec2(2.39, 1.0);
          float s = fbm(q * 1.6 + vec2(time * 0.03, -time * 0.05)) * 0.5 + 0.5;
          float s2 = fbm(q * 3.2 - vec2(time * 0.02, time * 0.04)) * 0.5 + 0.5;
          float v = 1.0 - smoothstep(0.0, 0.85, length((vUv - vec2(0.5, 0.42)) * vec2(1.6, 1.0)));
          vec3 c = vec3(0.12, 0.06, 0.025) * s * s2 * v * amt;
          gl_FragColor = vec4(c, 1.0); }`,
      depthTest: false, depthWrite: false,
    }));
    this.scene.add(this.bg);
    this.glyphTex = this.track(glyphCanvas('羽', 'ZhiMangXing', 560, 1920, 804, 960, 300));
    this.glyphH = this.track(glyphCanvas('羽', 'ZhiMangXing', 560, 1920, 804, 960, 300, 9));
    this.glyph = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), goldGlyphMaterial(this.glyphTex, this.glyphH));
    this.scene.add(this.glyph);
    this.embers = createEmbers({ count: 260, area: [2300, 1000] });
    this.scene.add(this.embers);
  }

  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const out = 1 - smooth(D - 2.0, D - 0.6, t);
    this.bg.material.uniforms.time.value = t;
    this.bg.material.uniforms.amt.value = smooth(0.6, 3.0, t) * out;
    const gu = this.glyph.material.uniforms;
    gu.reveal.value = seg(t, 1.0, 3.4, ease.inOutSine);
    gu.glint.value = lerp(-0.4, 1.0, seg(t, 4.2, 6.2, ease.inOutSine));
    gu.time.value = t;
    gu.bright.value = out * (0.9 + 0.1 * Math.sin(t * 2.0));
    gu.zoom.value = 1 + 0.04 * seg(t, 0, D, ease.linear);
    const eu = this.embers.material.uniforms;
    eu.time.value = t + 20; eu.amount.value = smooth(0.2, 2.0, t) * (1 - smooth(D - 1.2, D, t) * 0.6);
    this.renderTo(rt, this.scene, this.ortho);

    // 主副标题
    const k1 = seg(t, 3.0, 4.6, ease.linear), k2 = seg(t, 3.8, 5.4, ease.linear);
    const fo = out;
    revealText(ctx, '羽毛球发展史', 960, 606, k1, { font: '600 60px NotoSerifSC', color: '#efe0bd', tracking: 30, stagger: 0.12, blurMax: 5, rise: 10, alpha: fo });
    revealText(ctx, 'THE  HISTORY  OF  BADMINTON', 960, 700, k2, { font: '400 22px Cinzel', color: '#cdb98f', tracking: 12, stagger: 0.025, blurMax: 6, rise: 4, alpha: fo * 0.9 });
    // 细金线
    if (k2 > 0) {
      const w = 260 * ease.outCubic(k2);
      ctx.save(); ctx.globalAlpha = fo * 0.7; ctx.strokeStyle = '#cdb98f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(960 - w, 658); ctx.lineTo(960 - 18, 658); ctx.moveTo(960 + 18, 658); ctx.lineTo(960 + w, 658); ctx.stroke();
      ctx.beginPath(); ctx.arc(960, 658, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#cdb98f'; ctx.fill();
      ctx.restore();
    }
    return {
      overlay: true, overlayGain: 1.15,
      grade: { bloom: 0.55, bloomThreshold: 0.85, halation: 0.3, vignette: 0.55, grain: 0.04, saturation: 1.0, contrast: 1.05, chroma: 0.0015 },
    };
  }
}
