// 水墨山水背景（全屏着色器）：宣纸纤维、层叠远山（尖峰 + 皴法纹理 + 墨色晕染）、山间云雾、朱砂红日。
import * as THREE from 'three';
import { NOISE } from '../engine/glsl.js';

export function inkLandscapeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pan: { value: 0 }, zoom: { value: 1 }, reveal: { value: 1 }, sunY: { value: 0.64 }, aspect: { value: 1920 / 804 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float time, pan, zoom, reveal, sunY, aspect;
      varying vec2 vUv;
      // 一层山：少量主峰（喀斯特式陡壁圆顶）+ 次峰 + 细节噪声
      float ridge(float x, float seed, float base, float amp){
        float h = 0.0;
        for (int k = 0; k < 5; k++){
          float fk = float(k);
          float c = hash12(vec2(seed, fk)) * 3.0 - 0.3;
          float w = 0.13 + hash12(vec2(fk, seed + 3.1)) * 0.20;
          float hk = (0.25 + hash12(vec2(seed + 7.7, fk)) * 0.75);
          float xx = x + gnoise(vec2(x * 3.0, seed + fk)) * 0.04;   // 不对称
          float d = (xx - c) / w;
          float shape = pow(max(0.0, 1.0 - d * d), 0.55 + hash12(vec2(fk, seed)) * 0.5);
          h = max(h, hk * shape);
        }
        h += fbm4(vec2(x * 6.0, seed)) * 0.06 + gnoise(vec2(x * 38.0, seed)) * 0.007;
        return base + amp * h;
      }
      void main(){
        vec2 uv = (vUv - 0.5) / zoom + 0.5;
        vec2 q = vec2(uv.x * aspect, uv.y);
        // 宣纸
        float fib = vnoise(q * vec2(900.0, 90.0)) * 0.5 + vnoise(q * vec2(120.0, 700.0)) * 0.5;
        vec3 paper = vec3(0.90, 0.85, 0.74) * (0.965 + 0.06 * fbm4(q * 6.0)) * (0.985 + 0.03 * fib);
        paper *= 1.0 - 0.10 * smoothstep(0.35, 0.9, length((vUv - 0.5) * vec2(1.3, 1.0)));
        vec3 col = paper;
        // 朱砂红日
        vec2 sp = vec2(aspect * 0.70 - pan * 0.015, sunY);
        float sd = length(q - sp) + fbm4(q * 30.0) * 0.004;
        float sun = smoothstep(0.072, 0.066, sd);
        col = mix(col, vec3(0.50, 0.055, 0.03), sun * 0.95 * reveal);
        // 山（远 → 近）
        vec3 inkC = vec3(0.025, 0.026, 0.03);
        for (int i = 0; i < 4; i++){
          float fi = float(i);
          float par = 0.04 + fi * 0.07;
          float x = q.x + pan * par;
          float base = 0.36 - fi * 0.09;
          float amp = 0.50 - fi * 0.06;
          float r = ridge(x * (0.8 + fi * 0.22), 11.0 + fi * 5.3, base, amp);
          float dy = r - q.y;
          float edge = smoothstep(-0.0015, 0.003, dy + fbm4(q * 70.0 + fi) * 0.003);
          if (edge <= 0.0) continue;
          float dens = mix(0.30, 1.0, pow(fi / 3.0, 0.8));
          float top = exp(-max(dy, 0.0) * mix(9.0, 4.5, fi / 3.0));          // 山脊处墨最浓
          float cun = fbm(vec2(x * 16.0 + q.y * 4.0, q.y * 7.0 + fi * 3.0)) * 0.5 + 0.5;  // 皴法纹理
          float streak = fbm4(vec2(x * 5.0 - q.y * 2.0, q.y * 26.0)) * 0.5 + 0.5;
          float ink = dens * (0.42 + 0.85 * top) * (0.5 + 0.75 * cun * cun) * (0.8 + 0.35 * streak);
          float mist = smoothstep(base - 0.08, base + 0.14 - fi * 0.03, q.y + fbm4(vec2(x * 2.0, fi)) * 0.06);
          ink *= mist;
          ink = clamp(ink, 0.0, 0.97) * reveal;
          col = mix(col, mix(inkC, paper * 0.55, 0.30 - fi * 0.1), ink * edge);
        }
        // 底部留白的雾
        col = mix(col, paper, smoothstep(0.2, 0.0, q.y) * 0.85);
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
}

// 墨色书法：笔触显现 + 飞白 + 湿边
export function inkGlyphMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { glyph: { value: tex }, reveal: { value: 0 }, res: { value: new THREE.Vector2(1920, 804) }, color: { value: new THREE.Color(0.02, 0.02, 0.025) }, opacity: { value: 1 }, dir: { value: new THREE.Vector2(0.55, 0.45) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform sampler2D glyph; uniform float reveal, opacity; uniform vec2 res, dir; uniform vec3 color;
      varying vec2 vUv;
      void main(){
        vec2 q = vUv * vec2(res.x / res.y, 1.0);
        vec2 wob = vec2(fbm4(q * 18.0), fbm4(q * 18.0 + 5.0)) * 0.0016;
        float a = texture2D(glyph, vUv + wob).a;
        if (a < 0.01) discard;
        float d = vUv.x * dir.x + (1.0 - vUv.y) * dir.y;
        float front = reveal * 1.3 - 0.15;
        float n = fbm4(q * 6.0) * 0.1;
        float m = smoothstep(front + 0.015, front - 0.015, d + n);
        float dry = smoothstep(0.62, 0.9, fbm(vec2(q.x * 2.0 + q.y * 6.0, q.y * 55.0)) * 0.5 + 0.5) * smoothstep(0.55, 0.85, fbm4(q * 3.0) * 0.5 + 0.5); // 飞白（只在局部）
        float alpha = a * m * (1.0 - dry * 0.8) * opacity;
        float wet = exp(-pow((d + n - front) / 0.02, 2.0));
        vec3 c = color * (1.0 - wet * 0.5);
        gl_FragColor = vec4(c, alpha);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  });
}
