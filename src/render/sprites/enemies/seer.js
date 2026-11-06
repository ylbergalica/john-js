// The Seer's sprites.
import { TAU } from '../../../engine/math.js';
import { rgba } from '../paint.js';
import { outline } from './common.js';

// The Seer's body: a circle with a half-circle gulf of radius `gulf` cut into its front
// (centred on the rim), and behind it to either side a round hole of radius `hole` through
// the body, centred at `holes` (the other mirrored), the three set in a V.
const SEER = { r: 0.33, line: 0.045, gulf: 0.13, hole: 0.072, holes: [0.565, 0.34] };

const SEER_PALETTE = { stroke: ['#9fb4ff', '#3c5ee0', '#1b2f8f'], glow: rgba('#2f55ff', 0.7) };

// The holes need the even-odd rule to fill.
export function seerPath() {
  const { r, gulf, hole, holes: [hx, hy] } = SEER;
  // Where the gulf meets the rim: the angle round the body, and round the gulf's centre.
  const body = Math.acos(1 - (gulf * gulf) / (2 * r * r));
  const cut = Math.atan2(-Math.sin(body), Math.cos(body) - 1);
  const p = new Path2D();
  p.arc(0.5, 0.5, r, body, TAU - body);
  p.arc(0.5 + r, 0.5, gulf, cut, -cut, true);
  p.closePath();
  for (const y of [hy, 1 - hy]) {
    p.moveTo(hx + hole, y);
    p.arc(hx, y, hole, 0, TAU);
    p.closePath();
  }
  return p;
}

export function seerOutline(S = 256) {
  return outline(S, SEER_PALETTE, (ctx) => {
    ctx.lineWidth = SEER.line;
    ctx.stroke(seerPath());
  });
}
