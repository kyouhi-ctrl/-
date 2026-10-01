// 场景基类：管理 three.js 场景/相机，提供渲染到目标与资源释放。
import * as THREE from 'three';

export class BaseScene {
  constructor(eng, sc) {
    this.eng = eng; this.sc = sc; this.r = eng.renderer;
    this.W = eng.W; this.H = eng.H;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, eng.W / eng.H, 0.05, 2000);
    this._disposables = [];
  }
  track(...objs) { this._disposables.push(...objs); return objs[0]; }
  renderTo(rt, scene = this.scene, camera = this.camera, clear = 0x000000) {
    const r = this.r;
    r.setRenderTarget(rt);
    r.setClearColor(clear, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
  }
  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
        if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      });
    });
    for (const d of this._disposables) d?.dispose?.();
  }
}
