// 共享 GLSL 片段：哈希、噪声、fbm。

export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy + p3.yxx)*p3.zyx); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.-2.*f);
  float a = hash13(i), b = hash13(i+vec3(1,0,0)), c = hash13(i+vec3(0,1,0)), d = hash13(i+vec3(1,1,0));
  float e = hash13(i+vec3(0,0,1)), f1 = hash13(i+vec3(1,0,1)), g = hash13(i+vec3(0,1,1)), h = hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,f1,u.x), mix(g,h,u.x), u.y), u.z);
}
// 梯度噪声（更自然的有机纹理），返回 [-1,1]
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  vec2 ga = hash22(i)*2.-1., gb = hash22(i+vec2(1,0))*2.-1., gc = hash22(i+vec2(0,1))*2.-1., gd = hash22(i+vec2(1,1))*2.-1.;
  float va = dot(ga, f), vb = dot(gb, f-vec2(1,0)), vc = dot(gc, f-vec2(0,1)), vd = dot(gd, f-vec2(1,1));
  return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y) * 1.4142;
}
float fbm(vec2 p){ float s=0., a=.5; mat2 m = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ s += a*gnoise(p); p = m*p; a *= .5; } return s; }
float fbm4(vec2 p){ float s=0., a=.5; mat2 m = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<4;i++){ s += a*gnoise(p); p = m*p; a *= .5; } return s; }
float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s += a*(vnoise3(p)*2.-1.); p = p*2.03 + vec3(17.1,3.7,9.2); a *= .5; } return s; }
`;

// 全屏三角形顶点着色器
export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
