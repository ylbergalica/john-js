// The Striker's sprites.
import { DEG, rgba, polar } from '../paint.js';
import { outline } from './common.js';

const STRIKER = { r: 0.3035, line: 0.057, tip: 0.49 };

// Ring with a straight-edged ear spike on each back corner.
export function strikerPath() {
  const { r, tip } = STRIKER;
  const p = new Path2D();
  const ear = (tipDeg, toDeg) => {
    p.lineTo(...polar(0.5, 0.5, tipDeg, tip));
    p.lineTo(...polar(0.5, 0.5, toDeg, r));
  };
  p.arc(0.5, 0.5, r, 254 * DEG, 466 * DEG);
  ear(131, 138);
  p.arc(0.5, 0.5, r, 138 * DEG, 222 * DEG);
  ear(229, 254);
  p.closePath();
  return p;
}

export function strikerOutline(S = 256) {
  const palette = { stroke: ['#ffe2a0', '#ffad3b', '#f07c12'], glow: rgba('#ff9a2e', 0.7) };
  return outline(S, palette, (ctx) => {
    ctx.lineWidth = STRIKER.line;
    ctx.stroke(strikerPath());
  });
}
