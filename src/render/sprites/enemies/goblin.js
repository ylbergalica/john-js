// The Goblin's sprites.
import { TAU } from '../../../engine/math.js';
import { rgba } from '../paint.js';
import { outline } from './common.js';

// ---------------------------------------------------------------- enemies

// Outlines are drawn at the original art's proportions so they fill the same size.
const GOBLIN = { r: 0.3255, line: 0.047, nub: [0.7345, 0.4235, 0.18, 0.153] };

export function goblinPath() {
  const p = new Path2D();
  p.arc(0.5, 0.5, GOBLIN.r, 0, TAU);
  p.rect(...GOBLIN.nub);
  return p;
}

export function goblinOutline(S = 256) {
  const ring = new Path2D();
  ring.arc(0.5, 0.5, GOBLIN.r, 0, TAU);
  const nub = new Path2D();
  nub.rect(...GOBLIN.nub);
  const outsideNub = new Path2D();
  outsideNub.rect(0, 0, 1, 1);
  outsideNub.rect(...GOBLIN.nub);
  const palette = { stroke: ['#b4ffd0', '#3ddc84', '#169a4c'], glow: rgba('#2bff88', 0.7) };
  return outline(S, palette, (ctx) => {
    ctx.lineWidth = GOBLIN.line;
    ctx.save();
    ctx.clip(outsideNub, 'evenodd');
    ctx.stroke(ring);
    ctx.restore();
    ctx.stroke(nub);
  });
}
