// 场景合成：把两个场景的 HDR 画面和各自的 2D 叠加层（文字/图形）按转场类型混合。
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FS_VERT, NOISE } from './glsl.js';

export const TRANS = { cut: 0, fade: 1, black: 2, white: 3, ink: 4, zoom: 5 };

const FRAG = /* glsl */ `
uniform sampler2D tA, tB, oA, oB;
uniform float useB, p, type, gainA, gainB, oAon, oBon, aspect;
varying vec2 vUv;
${NOISE}
vec3 layer(sampler2D t, sampler2D o, vec2 uv, float gain, float on){
  vec3 c = texture2D(t, uv).rgb;
  if (on > 0.5) { vec4 ov = texture2D(o, uv); c = mix(c, ov.rgb * gain, ov.a); }
  return c;
}
void main(){
  vec2 uv = vUv;
  if (useB < 0.5) { gl_FragColor = vec4(layer(tA, oA, uv, gainA, oAon), 1.0); return; }
  int ty = int(type + 0.5);
  vec3 col;
  if (ty == 5) {
    // 推镜转场：A 放大冲出，B 由大到正常
    vec2 c = uv - 0.5;
    vec3 a = layer(tA, oA, 0.5 + c / (1.0 + p * 0.6), gainA, oAon);
    vec3 b = layer(tB, oB, 0.5 + c / (1.0 + (1.0 - p) * 0.25), gainB, oBon);
    col = mix(a, b, smoothstep(0.25, 0.75, p));
  } else {
    vec3 a = layer(tA, oA, uv, gainA, oAon);
    vec3 b = layer(tB, oB, uv, gainB, oBon);
    if (ty == 1) col = mix(a, b, smoothstep(0.0, 1.0, p));
    else if (ty == 2) col = p < 0.5 ? a * pow(1.0 - p*2.0, 1.6) : b * pow(p*2.0 - 1.0, 1.6);
    else if (ty == 3) {
      float k1 = p * 2.0, k2 = p * 2.0 - 1.0;
      col = p < 0.5 ? mix(a, vec3(5.0), k1 * k1) : mix(vec3(5.0), b, 1.0 - (1.0 - k2) * (1.0 - k2));
    }
    else if (ty == 4) {
      // 水墨晕染转场：墨从一侧洇开，先把画面染成墨色，再从墨中显出新画面
      vec2 q = vec2(uv.x * aspect, uv.y);
      float n = fbm(q * 2.2) * 0.5 + 0.5;
      float n2 = fbm(q * 7.0 + 3.0) * 0.5 + 0.5;
      float field = (1.0 - uv.x) * 0.55 + n * 0.35 + n2 * 0.10;
      float inkFront = p * 1.6 - 0.2;            // 墨先到
      float revealFront = p * 1.6 - 0.55;        // 新画面随后显出
      float inked = smoothstep(inkFront - 0.10, inkFront + 0.02, field);
      float shown = smoothstep(revealFront - 0.10, revealFront + 0.02, field);
      vec3 inkCol = vec3(0.035, 0.03, 0.028);
      vec3 cA = mix(inkCol, a, inked);
      col = mix(b, cA, shown);
    }
    else col = p < 1.0 ? a : b;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Compositor {
  constructor(renderer, W, H) {
    this.r = renderer;
    this.rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tA: { value: null }, tB: { value: null }, oA: { value: null }, oB: { value: null },
        useB: { value: 0 }, p: { value: 0 }, type: { value: 0 }, gainA: { value: 1 }, gainB: { value: 1 },
        oAon: { value: 0 }, oBon: { value: 0 }, aspect: { value: W / H },
      },
    }));
  }
  render(A, B, p, type) {
    const u = this.quad.material.uniforms;
    u.tA.value = A.rt.texture; u.oA.value = A.ovTex; u.gainA.value = A.ovGain; u.oAon.value = A.ovOn ? 1 : 0;
    if (B) {
      u.useB.value = 1; u.tB.value = B.rt.texture; u.oB.value = B.ovTex; u.gainB.value = B.ovGain; u.oBon.value = B.ovOn ? 1 : 0;
      u.p.value = p; u.type.value = TRANS[type] ?? 1;
    } else { u.useB.value = 0; }
    this.r.setRenderTarget(this.rt); this.quad.render(this.r);
    return this.rt.texture;
  }
}
