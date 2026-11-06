// The Binary's sprites.
import { surface, rgba, glow, radial } from '../paint.js';

export const BINARY_ART = {
  rays: 8, long: 0.44, short: 0.37, inner: 0.3, line: 0.035,
  rims: [
    { stops: ['#ffffff', '#bcdcff', '#6aa2ff', '#3a5cff'], glow: '#6aa8ff' },
    { stops: ['#ffffff', '#ffe6b0', '#ffb440', '#ff7a18'], glow: '#ffaa38' },
  ],
};

export function binaryPath() {
  const { rays, long, short, inner } = BINARY_ART, p = new Path2D();
  for (let i = 0; i < rays * 2; i++) {
    const r = i % 2 ? inner : i % 4 ? short : long, a = (i * Math.PI) / rays;
    const x = 0.5 + Math.cos(a) * r, y = 0.5 + Math.sin(a) * r;
    if (i) p.lineTo(x, y);
    else p.moveTo(x, y);
  }
  p.closePath();
  return p;
}

export function binaryOutline({ stops, glow: halo }, S = 256) {
  const { c, ctx, px } = surface(S);
  ctx.strokeStyle = radial(ctx, 0.5, 0.5, BINARY_ART.long, stops);
  glow(ctx, rgba(halo, 0.8), px * 0.05, () => {
    ctx.lineWidth = BINARY_ART.line;
    ctx.stroke(binaryPath());
  });
  return c;
}
