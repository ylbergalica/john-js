// The Gunner's sprites.
import { DEG, rgba } from '../paint.js';
import { outline } from './common.js';

// The Gunner's body: bubbly, a ring of `bumps` round lobes end to end, each `bulge` degrees
// of its own circle, meeting at radius `r`, one joint straight ahead so it is symmetrical.
// Three cannons side by side, `gauge` thick: one out of each front lobe, `spread` out to
// either side, its barrel from `barrel[0]` to `[1]` along +x, and one out of the notch
// between them, from `middle[0]` to `[1]`, a little shorter. Its muzzles
// (GunnerCascade.muzzles) are the barrels' ends, at its sprite's size.
const GUNNER = { r: 0.27, bumps: 6, bulge: 120, line: 0.045, barrel: [0.7, 0.9], middle: [0.67, 0.85], gauge: 0.12, spread: 0.19 };

const GUNNER_PALETTE = { stroke: ['#e0f7ff', '#7fd6ff', '#2f9fd8'], glow: rgba('#5cc8ff', 0.65) };

function gunnerBarrels() {
  const { barrel, middle, gauge, spread } = GUNNER, p = new Path2D();
  for (const [y, [x0, x1]] of [[0.5 - spread, barrel], [0.5, middle], [0.5 + spread, barrel]]) {
    p.roundRect(x0, y - gauge / 2, x1 - x0, gauge, gauge * 0.3);
  }
  return p;
}

// The lobes, clockwise from the joint straight ahead: each an arc whose centre sits inward
// along its middle, far enough that its ends land on the joints.
function gunnerBody(p = new Path2D()) {
  const { r, bumps, bulge } = GUNNER, half = Math.PI / bumps, a = (bulge * DEG) / 2;
  const radius = (r * Math.sin(half)) / Math.sin(a), centre = r * Math.cos(half) - radius * Math.cos(a);
  for (let i = 0; i < bumps; i++) {
    const mid = (2 * i + 1) * half;
    p.arc(0.5 + Math.cos(mid) * centre, 0.5 + Math.sin(mid) * centre, radius, mid - a, mid + a);
  }
  p.closePath();
  return p;
}

export function gunnerPath() {
  const p = gunnerBody();
  p.addPath(gunnerBarrels());
  return p;
}

// The bumps, broken where the barrels pass through them, and the barrels.
export function gunnerOutline(S = 256) {
  const barrels = gunnerBarrels();
  const outsideBarrels = new Path2D();
  outsideBarrels.rect(0, 0, 1, 1);
  outsideBarrels.addPath(barrels);
  return outline(S, GUNNER_PALETTE, (ctx) => {
    ctx.lineWidth = GUNNER.line;
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.clip(outsideBarrels, 'evenodd');
    ctx.stroke(gunnerBody());
    ctx.restore();
    ctx.stroke(barrels);
  });
}
