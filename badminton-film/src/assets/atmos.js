// 大气效果：体积光束、浮尘粒子（带景深虚化）、地面光斑。
import * as THREE from 'three';
import { NOISE } from '../engine/glsl.js';
import { mulberry32 } from '../engine/util.js';

// 体积光束：沿方向 dir 的开口圆锥，叠加发光 + 噪声光柱条纹
export function createBeam({ apex = new THREE.Vector3(0, 60, -24), dir = new THREE.Vector3(0, -1, 0.4), length = 110, r0 = 2.5, r1 = 15, color = new THREE.Color(1.0, 0.82, 0.6), intensity = 0.35 } = {}) {
  const geo = new THREE.CylinderGeometry(r0, r1, length, 96, 40, true);
  geo.translate(0, -length / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: color }, intensity: { value: intensity }, time: { value: 0 }, len: { value: length } },
    vertexShader: /* glsl */ `
      varying vec3 vN, vP, vL;
      void main(){ vL = position; vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform vec3 color; uniform float intensity, time, len;
      varying vec3 vN, vP, vL;
      void main(){
        vec3 V = normalize(cameraPosition - vP);
        float facing = abs(dot(normalize(vN), V));
        float soft = pow(facing, 2.2);
        float along = -vL.y / len;           // 0 顶端 → 1 底端
        float ang = atan(vL.z, vL.x);
        float rays = 0.65 + 0.35 * (fbm4(vec2(ang * 3.0, along * 2.0 - time * 0.03)) * 0.5 + 0.5);
        float drift = 0.85 + 0.15 * fbm4(vec2(along * 6.0 + time * 0.05, ang));
        float fall = smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.75, 1.0, along));
        gl_FragColor = vec4(color * intensity * soft * rays * drift * fall, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(apex);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  mesh.renderOrder = 5;
  return mesh;
}

// 浮尘：GPU 粒子，景深虚化（离焦越远越大越淡），光束内更亮
export function createDust(lighting, { count = 4000, box = [60, 50, 60], center = new THREE.Vector3(0, 5, -5), seed = 3, size = 0.06 } = {}) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3), sd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * box[0];
    pos[i * 3 + 1] = (rnd() - 0.5) * box[1];
    pos[i * 3 + 2] = (rnd() - 0.5) * box[2];
    sd[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...lighting, time: { value: 0 }, focus: { value: 30 }, aperture: { value: 0.9 }, pxScale: { value: 1890 },
      boxSize: { value: new THREE.Vector3(...box) }, boxCenter: { value: center.clone() }, sizeK: { value: size },
      burstP: { value: new THREE.Vector3() }, burst: { value: 0 }, suck: { value: 0 }, brightness: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 beamA, beamD, keyColor, boxSize, boxCenter, burstP; uniform float beamR, beamOn, time, focus, aperture, pxScale, sizeK, burst, suck, brightness;
      attribute float aSeed;
      varying float vA; varying vec3 vC;
      void main(){
        vec3 p = position;
        float s = aSeed * 6.2831;
        p += vec3(sin(time * 0.11 + s) * 1.6 + sin(time*0.37 + s*3.0)*0.3, -time * (0.25 + 0.35 * fract(aSeed * 7.3)) + sin(time * 0.2 + s * 2.0) * 0.8, cos(time * 0.13 + s * 1.7) * 1.6);
        p = mod(p + boxSize * 0.5, boxSize) - boxSize * 0.5;  // 在盒子内循环
        p += boxCenter;
        vec3 dv = p - burstP; float dl = length(dv) + 1e-3;
        p += dv / dl * burst * 14.0 / (1.0 + dl * 0.25);
        p -= dv / dl * suck * min(dl, 4.0) * 0.4;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float depth = max(0.5, -mv.z);
        float phys = sizeK * (0.6 + 0.8 * fract(aSeed * 13.7));
        float sharp = phys * pxScale / depth;
        float coc = aperture * abs(depth - focus) / depth * pxScale * 0.02;
        float sz = max(1.2, sqrt(sharp * sharp + coc * coc));
        gl_PointSize = min(sz, 90.0);
        vec3 pa = p - beamA; float d = length(pa - beamD * dot(pa, beamD));
        float beam = smoothstep(beamR * 1.25, beamR * 0.3, d) * beamOn;
        float tw = 0.6 + 0.4 * sin(time * (1.0 + aSeed * 2.0) + s * 5.0);
        vA = clamp((sharp * sharp) / (sz * sz) * 1.6, 0.0, 1.0) * (beam * 0.95 + 0.05) * tw * brightness;
        vC = keyColor * 0.35;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec3 vC;
      void main(){
        vec2 c = gl_PointCoord * 2.0 - 1.0; float r = dot(c, c);
        if (r > 1.0) discard;
        float disc = smoothstep(1.0, 0.75, r) * (0.75 + 0.25 * smoothstep(0.55, 0.95, r)); // 散景：边缘略亮
        gl_FragColor = vec4(vC * vA * disc, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}

// 地面光斑：光束打在远处地面上
export function createFloor(lighting, { y = -26, size = 400, color = new THREE.Color(1, 0.85, 0.66) } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...lighting, color: { value: color }, strength: { value: 1 } },
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform vec3 beamA, beamD, color, ambient; uniform float beamR, beamOn, strength;
      varying vec3 vP;
      void main(){
        // 光束与地面交点附近的椭圆光斑
        float s = (vP.y - beamA.y) / beamD.y;
        vec3 c = beamA + beamD * s;
        vec2 d = vP.xz - c.xz;
        float R = beamR * 1.6;
        float pool = exp(-dot(d, d) / (R * R));
        float tex = 0.75 + 0.25 * fbm4(vP.xz * 0.15);
        vec3 col = color * pool * 0.55 * tex * beamOn * strength + ambient * 0.3;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  return m;
}
