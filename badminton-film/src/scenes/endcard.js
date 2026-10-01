// 片尾：黑场余烬，标题与致谢。
import * as THREE from 'three';
import { BaseScene } from '../engine/base.js';
import { seg, ease, smooth } from '../engine/util.js';
import { revealText, text } from '../engine/overlay.js';
import { createEmbers } from './title.js';

export class Endcard extends BaseScene {
  constructor(eng, sc) {
    super(eng, sc);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.embers = createEmbers({ count: 160, area: [2300, 1000], seed: 9 });
    this.scene.add(this.embers);
    this.credits = (eng.TL.credits || []).filter((c) => !c.requiresVO || eng.TL.voReal);
  }
  render(info, rt, ctx) {
    const t = info.t, D = info.dur;
    const out = 1 - smooth(D - 2.2, D - 0.3, t);
    this.embers.material.uniforms.time.value = t + 40;
    this.embers.material.uniforms.amount.value = 0.6 * out;
    this.renderTo(rt, this.scene, this.ortho);
    revealText(ctx, '羽毛球发展史', 960, 250, seg(t, 0.6, 2.2, ease.linear), { font: '600 56px NotoSerifSC', color: '#efe0bd', tracking: 28, stagger: 0.12, blurMax: 6, alpha: out });
    revealText(ctx, 'THE  HISTORY  OF  BADMINTON', 960, 322, seg(t, 1.2, 2.6, ease.linear), { font: '400 20px Cinzel', color: '#cdb98f', tracking: 12, stagger: 0.02, alpha: out * 0.9 });
    let y = 440;
    this.credits.forEach((c, i) => {
      const k = seg(t, 2.6 + i * 0.5, 3.8 + i * 0.5, ease.linear);
      text(ctx, c.role, 930, y, { font: '400 20px NotoSerifSC', color: '#a99878', align: 'right', alpha: k * out, tracking: 4 });
      text(ctx, c.name, 970, y, { font: '400 20px NotoSerifSC', color: '#e6d8bd', align: 'left', alpha: k * out, tracking: 2 });
      y += 44;
    });
    return { overlay: true, grade: { bloom: 0.5, bloomThreshold: 0.8, halation: 0.3, vignette: 0.5, grain: 0.04 } };
  }
}
