// The Bloodthirst aspect's sprites and icon.
import { seededRandom, lerp, clamp01, TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';

// ---------------------------------------------------------------- bloodthirst

// A beast's jaws, open: two rows of fangs set in dark gums, long curved canines among them,
// stained with blood welling up from the gums and dripping off the tips, turned on every axis
// so the mouth faces the top left of the box, under a red glow.
export function bloodthirstIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(2671);
  space(ctx, rand, {
    core: '#1c0306', edge: '#040001', stars: 12,
    nebulae: [[0.46, 0.5, 0.44, '#e0162a', 0.26], [0.22, 0.2, 0.26, '#ff5a5a', 0.08]],
  });
  ctx.fillStyle = radial(ctx, 0.46, 0.48, 0.36, [rgba('#ff6a6a', 0.22), rgba('#e0162a', 0.1), rgba('#e0162a', 0)]);
  ctx.fillRect(0, 0, 1, 1);

  // The jaws in their own space: x right, y down, z out of the box, the mouth opening toward +z.
  // Turned about x (its front tipped up), then y (to the left), then z, seen straight on.
  const [rx, ry, rz] = [22 * DEG, -25 * DEG, 10 * DEG], size = 0.92, cx = 0.53, cy = 0.53;
  const turn = ([x, y, z]) => {
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    return [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz), z];
  };
  const screen = (p) => { const [x, y, z] = turn(p); return [cx + x * size, cy + y * size, z]; };
  const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
  const path = (pts) => { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };

  // Each jaw is an arch, a little longer than it is wide, like a hound's, its front at `a` = 0.
  const RX = 0.32, RZ = 0.34, Z0 = -0.08;
  const arch = (a, y) => [Math.sin(a) * RX, y, Math.cos(a) * RZ + Z0];
  const along = (a) => { const t = [Math.cos(a) * RX, 0, -Math.sin(a) * RZ], l = Math.hypot(t[0], t[2]); return t.map((v) => v / l); };
  const out = (a) => { const n = [Math.sin(a) / RX, 0, Math.cos(a) / RZ], l = Math.hypot(n[0], n[2]); return n.map((v) => v / l); };
  const facing = (n) => turn(n)[2]; // toward the viewer: 1, away: -1
  // The jaws hinge at the back: each comes in from its `y` at the front to HINGE of that at the
  // back, its teeth and gum standing square to it, so they open at an angle.
  const HINGE = 0.4, FRONT = RZ + Z0, BACK = Math.cos(104 * DEG) * RZ + Z0;
  const jawY = (J, a) => J.y * lerp(1, HINGE, (FRONT - arch(a, 0)[2]) / (FRONT - BACK));
  const square = (J) => { const s = (J.y * (1 - HINGE)) / (FRONT - BACK), l = Math.hypot(1, s); return [0, J.dir / l, (-J.dir * s) / l]; };

  // Teeth, either side of the front: [angle°, width, length, curl]. The upper canines are the
  // longest, just behind the lower ones so they'd cross if it bit down.
  const JAWS = [
    { y: -0.17, dir: 1, teeth: [[6, 0.06, 0.09, 0.2], [18, 0.065, 0.1, 0.2], [32, 0.085, 0.27, 0.3], [49, 0.06, 0.1, 0.25], [63, 0.07, 0.12, 0.25], [79, 0.075, 0.09, 0.2], [95, 0.075, 0.07, 0.15]] },
    { y: 0.17, dir: -1, teeth: [[6, 0.055, 0.08, 0.2], [16, 0.06, 0.09, 0.2], [26, 0.08, 0.21, 0.3], [44, 0.055, 0.09, 0.25], [58, 0.065, 0.11, 0.25], [74, 0.07, 0.09, 0.2], [90, 0.07, 0.065, 0.15]] },
  ];
  const parts = []; // the teeth, { z, draw }, drawn back to front over the gums

  // The gums: a ridge along each arch above (or below) its teeth, in strips, solid for SOLID
  // out from them, then reaching on an uneven way (two slow waves laid over each other) as it
  // thins out into mist, and toward the back of the jaw: painted solid on one layer, faded by a mask of the
  // same strips (blurred, so no seams show) and set down softly over a wider haze of itself.
  const meat = surface(S), mask = surface(S), strips = [];
  const N = 48, SOLID = 0.045, GUM = 0.15, END = 102;
  for (const J of JAWS) {
    const ph = [rand() * TAU, rand() * TAU, rand() * TAU];
    const reach = (a) => SOLID + GUM * (0.6 + 0.3 * Math.sin(a * 3.1 + ph[0]) + 0.2 * Math.sin(a * 7.7 + ph[1]));
    const thin = (a) => clamp01((END - Math.abs(a / DEG)) / 35) * (0.9 + 0.1 * Math.sin(a * 11.3 + ph[2]));
    const up = square(J), lip = (a, h, bulge) => add(add(arch(a, jawY(J, a)), up, -h), out(a), bulge);
    for (let i = 0; i < N; i++) {
      const a0 = lerp(-END, END, i / N) * DEG, a1 = lerp(-END, END, (i + 1) / N) * DEG, am = (a0 + a1) / 2;
      const quad = [lip(a0, -0.015, 0), lip(a1, -0.015, 0), lip(a1, reach(a1), 0.035), lip(a0, reach(a0), 0.035)].map(screen);
      strips.push({ quad, z: quad.reduce((t, p) => t + p[2], 0) / 4, lit: (facing(out(am)) + 1) / 2, alpha: thin(am), solid: (SOLID + 0.015) / (reach(am) + 0.015) });
    }
  }
  strips.sort((p, q) => p.z - q.z);
  const trace = (g, quad) => { g.beginPath(); quad.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  for (const { quad, lit, alpha, solid } of strips) {
    const [ax, ay] = [(quad[0][0] + quad[1][0]) / 2, (quad[0][1] + quad[1][1]) / 2], [bx, by] = [(quad[2][0] + quad[3][0]) / 2, (quad[2][1] + quad[3][1]) / 2];
    const m = meat.ctx;
    trace(m, quad);
    m.fillStyle = m.strokeStyle = linear(m, ax, ay, bx, by, [lerpHex('#6a0a16', '#c81c34', lit), lerpHex('#4a0610', '#9a1426', lit), lerpHex('#2a0308', '#7a0e1e', lit)]);
    m.lineWidth = 0.004;
    m.fill();
    m.stroke();
    const k = mask.ctx;
    trace(k, quad);
    const fade = k.createLinearGradient(ax, ay, bx, by);
    [[0, 1], [solid, 1], [lerp(solid, 1, 0.35), 0.45], [1, 0]].forEach(([at, v]) => fade.addColorStop(at, rgba('#ffffff', v * alpha)));
    k.fillStyle = fade;
    k.fill();
  }
  meat.ctx.save();
  meat.ctx.globalCompositeOperation = 'destination-in';
  meat.ctx.filter = `blur(${px * 0.008}px)`;
  meat.ctx.drawImage(mask.c, 0, 0, 1, 1);
  meat.ctx.restore();
  for (const [blur, alpha] of [[0.04, 0.5], [0.004, 1]]) {
    ctx.save();
    ctx.filter = `blur(${px * blur}px)`;
    ctx.globalAlpha = alpha;
    ctx.drawImage(meat.c, 0, 0, 1, 1);
    ctx.restore();
  }

  for (const J of JAWS) {
    // The teeth: each a fang standing out of the gum and curling in toward the middle of the
    // mouth as it goes, with a little thickness behind it, ivory going white toward its tip over
    // blood welling up from the gum, its tip dipped in blood.
    for (const [deg, w, L, curl] of J.teeth) {
      for (const side of [-1, 1]) {
        const a = side * deg * DEG, base = arch(a, jawY(J, a)), t = along(a), n = out(a), up = square(J);
        const at = (u, h, depth = 0) => {
          const k = h / L;
          return screen(add(add(add(base, t, u), up, h), n, -curl * L * k * k - depth));
        };
        const outline = (depth) => {
          const pts = [];
          for (let i = 0; i <= 10; i++) { const k = i / 10; pts.push(at((-w / 2) * (1 - k) ** 1.15, L * k ** 0.85, depth)); }
          for (let i = 9; i >= 0; i--) { const k = i / 10; pts.push(at((w / 2) * (1 - k) ** 1.15, L * k ** 0.85, depth)); }
          return pts;
        };
        const lit = (facing(n) + 1) / 2, front = outline(0), [bx, by, bz] = at(0, 0), [tx, ty] = at(0, L);
        const backs = [0.03, 0.02, 0.01].map((d) => outline(d * (w / 0.08)));
        const fang = L > 0.15;
        parts.push({
          z: bz + 0.03,
          draw: () => {
            for (const pts of backs) { path(pts); ctx.fillStyle = lerpHex('#3a2a1c', '#8a7458', lit); ctx.fill(); }
            path(front);
            glow(ctx, rgba('#ff2030', 0.5), px * 0.02, () => {
              ctx.fillStyle = linear(ctx, bx, by, tx, ty, [lerpHex('#8a6a4a', '#d9c49c', lit), lerpHex('#c8b48e', '#f6eedc', lit), lerpHex('#e0d6c0', '#fffaf0', lit)]);
              ctx.fill();
            });
            ctx.save();
            ctx.clip();
            ctx.fillStyle = linear(ctx, bx, by, tx, ty, [rgba('#7a0610', 0.95), rgba('#a00a18', 0.55), rgba('#c0101e', 0), rgba('#c0101e', 0)]);
            ctx.fill();
            const dip = fang ? 0.55 : 0.4;
            ctx.fillStyle = linear(ctx, tx, ty, lerp(tx, bx, dip), lerp(ty, by, dip), [rgba('#8a0612', 1), rgba('#c0101e', 0.8), rgba('#d0142a', 0)]);
            ctx.fill();
            // A streak of shine down its face.
            ctx.strokeStyle = rgba('#ffffff', 0.45 * lit);
            ctx.lineWidth = w * size * 0.14;
            ctx.beginPath();
            for (let i = 1; i <= 7; i++) { const [x, y] = at(-w * 0.18 * (1 - i / 9), L * (i / 9), -0.002); if (i === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
            ctx.restore();
            // Off an upper fang's tip hangs a drop of blood.
            if (fang && J.dir > 0) {
              const r = 0.018 + rand() * 0.006, dy = 0.03 + rand() * 0.02;
              glow(ctx, rgba('#ff2030', 0.8), px * 0.015, () => {
                ctx.fillStyle = radial(ctx, tx, ty + dy, r * 1.6, ['#ff6a6a', '#c0101e', '#5a0008'], tx - r * 0.3, ty + dy - r * 0.3);
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.quadraticCurveTo(tx + r, ty + dy - r * 0.6, tx + r, ty + dy);
                ctx.arc(tx, ty + dy, r, 0, Math.PI);
                ctx.quadraticCurveTo(tx - r, ty + dy - r * 0.6, tx, ty);
                ctx.fill();
              });
            }
          },
        });
      }
    }
  }
  parts.sort((p, q) => p.z - q.z);
  for (const p of parts) p.draw();

  sparkle(ctx, 0.2, 0.18, 0.04, '#ffd0d0', 0.7, 0.3);
  sparkle(ctx, 0.84, 0.8, 0.028, '#ffc0c0', 0.6, 0.1);
  return c;
}

// The colour `t` of the way from hex `a` to hex `b`.
function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), k = clamp01(t);
  const ch = (s) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
