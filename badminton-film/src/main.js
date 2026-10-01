// 渲染主程序：按时间轴调度场景 → 合成转场 → 电影后期 → 输出到画布。
// 由 tools/render.mjs 在无头 Chromium 中逐帧调用 window.FILM.renderFrame(i)。
import * as THREE from 'three';
import { Post, DEFAULT_GRADE, mixGrade } from './engine/post.js';
import { Compositor } from './engine/composite.js';
import { drawSubtitle } from './engine/subtitle.js';
import { smooth } from './engine/util.js';
import { SCENES } from './scenes/index.js';

const W = 1920, H = 804;
const TL = await (await fetch('/build/timeline.json?' + Date.now())).json();
const FPS = TL.fps;

const FONT_SPECS = [
  '400 40px Cinzel', '700 40px Cinzel', '900 40px Cinzel',
  '300 40px CormorantGaramond', '500 40px CormorantGaramond', '700 40px CormorantGaramond',
  'italic 300 40px CormorantGaramond', 'italic 500 40px CormorantGaramond',
  '400 40px MaShanZheng', '400 40px ZhiMangXing', '400 40px LiuJianMaoCao', '400 40px LongCang',
  '200 40px NotoSerifSC', '300 40px NotoSerifSC', '500 40px NotoSerifSC', '700 40px NotoSerifSC', '900 40px NotoSerifSC',
  '400 40px ZCOOLXiaoWei', '400 40px BebasNeue', '200 40px Oswald', '400 40px Oswald', '600 40px Oswald',
  '200 40px Inter', '400 40px Inter', '600 40px Inter',
];
await Promise.all(FONT_SPECS.map((f) => document.fonts.load(f, '羽毛球发展史ABCabc0123')));

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('gl'), antialias: false, preserveDrawingBuffer: true,
  powerPreference: 'high-performance', stencil: false,
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NoToneMapping;

const post = new Post(renderer, W, H);
const comp = new Compositor(renderer, W, H);
const subCtx = document.getElementById('sub').getContext('2d');

function makeSlot() {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  return { rt, cv, ctx, ovTex: tex, ovGain: 1, ovOn: false };
}
const slots = [makeSlot(), makeSlot()];

const eng = { THREE, renderer, W, H, aspect: W / H, fps: FPS, TL, SCENES };
const instances = new Map();

function getScene(sc) {
  let inst = instances.get(sc.id);
  if (!inst) {
    const Cls = SCENES[sc.id] || SCENES.placeholder;
    inst = new Cls(eng, sc);
    instances.set(sc.id, inst);
  }
  return inst;
}

function sceneInfo(sc, t) {
  const lt = t - sc.start;
  return {
    t: lt, dur: sc.dur, p: lt / sc.dur, id: sc.id, global: t, cues: sc.cues,
    cue(id, which = 0, fallback = 0) { const c = sc.cues[id]; return c ? c[which] : fallback; },
  };
}

function renderSceneInto(sc, t, slot) {
  const inst = getScene(sc);
  const info = sceneInfo(sc, t);
  const ctx = slot.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.letterSpacing = '0px';
  ctx.clearRect(0, 0, W, H);
  renderer.setRenderTarget(slot.rt);
  const res = inst.render(info, slot.rt, ctx) || {};
  slot.ovOn = !!res.overlay;
  slot.ovGain = res.overlayGain ?? 1;
  if (slot.ovOn) slot.ovTex.needsUpdate = true;
  return mixGrade(DEFAULT_GRADE, res.grade || {}, 1);
}

function cleanup(t) {
  for (const sc of TL.scenes) {
    const inst = instances.get(sc.id);
    if (inst && (t > sc.end + 0.5 || t < sc.start - 0.5)) {
      inst.dispose?.();
      instances.delete(sc.id);
    }
  }
}

window.FILM = {
  frames: TL.frames, fps: FPS, duration: TL.duration, timeline: TL,
  async renderFrame(i) {
    const t = i / FPS;
    cleanup(t);
    const act = TL.scenes.filter((s) => t >= s.start && t < s.end);
    if (!act.length) act.push(TL.scenes[TL.scenes.length - 1]);
    const A = act[0], B = act[1];
    let g = renderSceneInto(A, t, slots[0]);
    let p = 0;
    if (B) {
      const gb = renderSceneInto(B, t, slots[1]);
      p = Math.min(1, (t - B.start) / Math.max(1e-3, B.trans.dur));
      const hard = B.trans.type === 'black' || B.trans.type === 'white' || B.trans.type === 'cut';
      g = mixGrade(g, gb, hard ? (p < 0.5 ? 0 : 1) : smooth(0, 1, p));
    }
    const tex = comp.render(slots[0], B ? slots[1] : null, p, B ? B.trans.type : 'cut');
    post.render(tex, g, t, null);
    drawSubtitle(subCtx, TL.lines, t);
    await new Promise((r) => requestAnimationFrame(() => r()));
    return true;
  },
};
window.READY = true;
