// 占位场景：尚未制作的场景显示场景名与时间（用于动态分镜预览）。
import { BaseScene } from '../engine/base.js';

export class Placeholder extends BaseScene {
  render(info, rt, ctx) {
    this.renderTo(rt, this.scene, this.camera, 0x0b0d10);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 64px Cinzel'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(info.id.toUpperCase(), 960, 360);
    ctx.font = '300 32px NotoSerifSC';
    ctx.fillText(`${info.t.toFixed(2)}s / ${info.dur.toFixed(2)}s`, 960, 450);
    return { overlay: true, grade: { grain: 0.02, vignette: 0.3 } };
  }
}
