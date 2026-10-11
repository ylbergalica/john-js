// Breaking open a bought tier box: its gem, big and trembling in its tier's mist, takes the
// tier's number of hits (clicks, or Space) to break. Each hit cracks it from where it was
// struck, light bleeding through the cracks, with sparks, a jolt and a crunch that climbs
// in pitch; the last shatters it into shards, and `onDone` follows to show what was inside.
import { h } from './dom.js';
import { iconUrls } from '../render/assets.js';
import { sfx } from '../audio/sfx.js';
import { mistFx } from './common.js';

const SVG = 'http://www.w3.org/2000/svg';
const MIN_HIT_GAP = 0.08; // seconds; faster hits are ignored
const SHATTER_TIME = 0.55; // seconds from the shatter to onDone
const HINT_DELAY = 1.2; // seconds before the "click" hint shows, if no hit has landed
const GRAVITY = 900; // px/s², pulling sparks and shards down as they fly
// Where hits land, in the gem image's 0…100 space: a diamond inside every tier's cut.
const FACE = { x: 50, y: 50, rx: 25, ry: 35 };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class BoxBreak {
  // tier: an entry of TIERS (name, color, hits).
  constructor(root, tier, onDone) {
    this.total = tier.hits;
    this.hits = 0;
    this.lastHit = -Infinity;
    this.onDone = onDone;
    this.timers = [];
    const gemUrl = iconUrls[`gem_${tier.name.toLowerCase()}`];

    this.img = h('img', { class: 'breaker-img', src: gemUrl, alt: '' });
    this.cracks = document.createElementNS(SVG, 'svg');
    this.cracks.setAttribute('class', 'breaker-cracks');
    this.cracks.setAttribute('viewBox', '0 0 100 100');
    this.shine = h('div', { class: 'breaker-shine' });
    this.gem = h('div', { class: 'breaker-gem' }, this.img, this.cracks, this.shine);
    this.fx = h('div', { class: 'breaker-fx' });
    this.stage = h('div', { class: 'breaker-stage' },
      h('div', { class: 'breaker-halo' }),
      mistFx('breaker-mist', { puffs: 30, embers: 18, x: [0.1, 0.9], y: [0.45, 0.95], size: [70, 130], dur: [2.2, 3.6], emberSize: [2, 4], emberDur: [1.6, 2.8] }),
      this.gem, this.fx,
    );
    this.hint = h('div', { class: 'breaker-hint', text: 'Click to break' });
    this.body = h('div', { class: 'breaker-body' },
      h('div', { class: 'eyebrow breaker-kicker', text: tier.name }),
      this.stage, this.hint,
    );
    this.flash = h('div', { class: 'breaker-flash' });
    this.el = h('div', { class: 'breaker interactive' }, this.body, this.flash);
    this.el.style.setProperty('--tier', tier.color);
    this.el.style.setProperty('--gem', `url(${gemUrl})`);
    this.setProgress(0);
    root.append(this.el);

    this.listeners = new AbortController();
    const opts = { signal: this.listeners.signal };
    this.el.addEventListener('pointerdown', (e) => { if (e.button === 0) this.hit(e.clientX, e.clientY); }, opts);
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); this.hit(); } }, opts);
    this.later(HINT_DELAY, () => { if (!this.hits) this.hint.classList.add('show'); });
  }

  later(s, fn) { this.timers.push(setTimeout(fn, s * 1000)); }

  setProgress(p) { this.el.style.setProperty('--p', p.toFixed(3)); }

  // A hit at a screen point (or, from a key, somewhere random on the face).
  hit(clientX, clientY) {
    const now = performance.now() / 1000;
    if (this.hits >= this.total || now - this.lastHit < MIN_HIT_GAP) return;
    this.lastHit = now;
    this.hits++;
    this.hint.classList.remove('show');
    this.hint.classList.add('gone');
    const p = this.hits / this.total;
    const at = this.impactPoint(clientX, clientY);
    if (this.hits >= this.total) { this.shatter(at); return; }

    this.setProgress(p);
    this.addCracks(at, p);
    this.burst(at, p);
    this.sparks(at, Math.round(8 + p * 16), 1 + p);
    this.jolt(at, p);
    sfx.play('boxHit', { pitch: 0.82 + p * 0.5, volume: 0.8 + p * 0.4, jitter: 0.02 });
  }

  // Gem-space (0…100) point under the pointer, pulled onto the face if it's off it.
  impactPoint(clientX, clientY) {
    let dx, dy;
    const r = this.gem.getBoundingClientRect();
    if (clientX === undefined || !r.width) {
      dx = rand(-0.5, 0.5); dy = rand(-0.5, 0.5);
    } else {
      dx = (((clientX - r.left) / r.width) * 100 - FACE.x) / FACE.rx;
      dy = (((clientY - r.top) / r.height) * 100 - FACE.y) / FACE.ry;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > 0.9) { dx *= 0.9 / d; dy *= 0.9 / d; }
    }
    return { x: FACE.x + dx * FACE.rx, y: FACE.y + dy * FACE.ry };
  }

  // Jagged cracks racing out from the impact, longer and more of them the closer it is to
  // breaking, forking as they go.
  addCracks({ x, y }, p) {
    const lines = [];
    const n = 3 + Math.round(p * 3), reach = 16 + p * 40, a0 = rand(0, Math.PI * 2);
    for (let i = 0; i < n; i++) crackWalk(x, y, a0 + (i / n) * Math.PI * 2 + rand(-0.5, 0.5), reach * rand(0.55, 1), 0, 0, lines);
    const pit = document.createElementNS(SVG, 'circle');
    pit.setAttribute('class', 'pit');
    pit.setAttribute('cx', x.toFixed(1));
    pit.setAttribute('cy', y.toFixed(1));
    pit.setAttribute('r', (1.2 + p * 1.4).toFixed(2));
    this.cracks.append(pit);
    for (const { d, depth, delay } of lines) {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', d);
      path.setAttribute('pathLength', '1');
      path.setAttribute('class', `d${depth}`);
      path.style.animationDelay = `${delay.toFixed(3)}s`;
      this.cracks.append(path);
    }
  }

  // The flash where it was struck: a white pop and a ring in the tier's colour.
  burst({ x, y }, p) {
    const pos = `left:${x}%;top:${y}%`;
    const pop = h('span', { class: 'breaker-pop' }), ring = h('span', { class: 'breaker-ring' });
    pop.style.cssText = ring.style.cssText = pos;
    this.fx.append(pop, ring);
    pop.animate([{ transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 }, { transform: `translate(-50%, -50%) scale(${1.2 + p})`, opacity: 0 }], { duration: 260, easing: 'ease-out' }).onfinish = () => pop.remove();
    ring.animate([{ transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 }, { transform: `translate(-50%, -50%) scale(${2 + p * 1.5})`, opacity: 0 }], { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }).onfinish = () => ring.remove();
    // The whole stone lights up for a beat.
    this.shine.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' });
    this.img.animate([{ filter: 'brightness(2.4)' }, { filter: 'brightness(1)' }], { duration: 200, easing: 'ease-out', composite: 'add' });
  }

  // Hot streaks and chips of the stone flung out of a point, arcing down. `power` scales speed.
  sparks({ x, y }, count, power) {
    for (let i = 0; i < count; i++) {
      const chip = Math.random() < 0.4;
      const el = h('span', { class: chip ? 'breaker-chip' : 'breaker-spark' });
      el.style.cssText = `left:${x}%;top:${y}%`;
      if (chip) el.style.setProperty('--s', `${rand(4, 9).toFixed(1)}px`);
      // Out and away from the stone's centre, mostly, and a little upward.
      const out = Math.atan2(y - FACE.y, x - FACE.x);
      const a = Math.hypot(x - FACE.x, y - FACE.y) > 3 && Math.random() < 0.7 ? out + rand(-1.1, 1.1) : rand(0, Math.PI * 2);
      const speed = rand(180, 480) * power, life = rand(0.35, 0.75) * (chip ? 1.3 : 1);
      const vx = Math.cos(a) * speed, vy = Math.sin(a) * speed - rand(60, 160);
      const spin = chip ? rand(-720, 720) : 0, angle = (a * 180) / Math.PI;
      this.fx.append(el);
      el.animate(fling(vx, vy, life, (t) => (chip ? `rotate(${spin * t}deg)` : `rotate(${angle}deg) scaleX(${1 - t * 0.6})`)), { duration: life * 1000, easing: 'linear' }).onfinish = () => el.remove();
    }
  }

  // The gem knocked away from the impact and wobbling back, and the screen shaking.
  jolt({ x, y }, p) {
    let dx = FACE.x - x, dy = FACE.y - y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const k = 5 + p * 10, tilt = (x < FACE.x ? -1 : 1) * (2 + p * 5);
    const frames = [0, 1, -0.55, 0.3, -0.12, 0].map((f, i) => ({
      transform: `translate(${(dx * k * f).toFixed(2)}px, ${(dy * k * f).toFixed(2)}px) rotate(${(tilt * f).toFixed(2)}deg) scale(${i === 1 ? 0.95 : 1})`,
    }));
    this.gem.animate(frames, { duration: 340, easing: 'ease-out' });
    shake(this.body, 2 + p * 6, 260);
  }

  // The last hit: a white-out, the gem bursting into shards, a shockwave and a storm of sparks.
  shatter(at) {
    this.setProgress(1);
    this.el.classList.add('broken');
    sfx.play('boxShatter');
    const center = { x: FACE.x + (at.x - FACE.x) * 0.3, y: FACE.y + (at.y - FACE.y) * 0.3 };
    for (const shard of shardPolygons(center, 11)) {
      const el = h('div', { class: 'breaker-shard' }, this.gem.cloneNode(true));
      el.style.clipPath = shard.clip;
      el.style.transformOrigin = shard.origin; // spins about itself, not the stone's centre
      this.stage.append(el);
      const speed = rand(260, 560), life = rand(0.7, 1.1), spin = rand(-260, 260);
      const vx = Math.cos(shard.angle) * speed, vy = Math.sin(shard.angle) * speed - rand(80, 220);
      el.animate(fling(vx, vy, life, (t) => `rotate(${spin * t}deg) scale(${1 - t * 0.35})`), { duration: life * 1000, easing: 'linear', fill: 'forwards' });
    }
    this.gem.style.visibility = 'hidden';
    this.burst(center, 2.5);
    this.sparks(center, 46, 2.2);
    const wave = h('span', { class: 'breaker-wave' });
    wave.style.cssText = `left:${center.x}%;top:${center.y}%`;
    this.fx.append(wave);
    wave.animate([{ transform: 'translate(-50%, -50%) scale(0.1)', opacity: 1 }, { transform: 'translate(-50%, -50%) scale(5)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)', fill: 'forwards' });
    this.flash.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
    shake(this.body, 16, 450);
    this.later(SHATTER_TIME, () => this.onDone());
  }

  destroy() {
    this.listeners.abort();
    for (const t of this.timers) clearTimeout(t);
    this.el.remove();
  }
}

// One crack: a random walk from (x, y) heading `a`, `len` long, now and then forking into a
// thinner, shorter one that starts drawing when this one reaches the fork.
function crackWalk(x, y, a, len, depth, delay, out) {
  const pts = [[x, y]];
  let left = len, run = 0;
  const forks = [];
  while (left > 0.5) {
    const step = Math.min(left, rand(2.5, 6));
    a += Math.random() < 0.25 ? rand(-0.8, 0.8) : rand(-0.2, 0.2); // mostly straight, with the odd sharp turn
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
    left -= step;
    run += step;
    if (depth < 2 && left > 4 && Math.random() < 0.22) forks.push([x, y, a + pick([-1, 1]) * rand(0.45, 1.1), left * rand(0.35, 0.7), run]);
  }
  const speed = 260; // gem units a second the crack runs at
  out.push({ d: `M${pts.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join('L')}`, depth, delay });
  for (const [fx, fy, fa, fl, at] of forks) crackWalk(fx, fy, fa, fl, depth + 1, delay + at / speed, out);
}

// Wedges of the gem around `c` (0…100 space), `n` of them at uneven angles, as clip-paths
// and the angle each one flies out along.
function shardPolygons(c, n) {
  const cuts = Array.from({ length: n }, (_, i) => ((i + rand(-0.35, 0.35)) / n) * Math.PI * 2).sort((a, b) => a - b);
  const R = 90;
  const at = (a, r) => `${(c.x + Math.cos(a) * r).toFixed(1)}% ${(c.y + Math.sin(a) * r).toFixed(1)}%`;
  return cuts.map((a0, i) => {
    const a1 = i + 1 < n ? cuts[i + 1] : cuts[0] + Math.PI * 2, mid = (a0 + a1) / 2;
    // A jagged inner end, so the shards don't all meet at one clean point.
    const inner = rand(0, 6);
    return { clip: `polygon(${at(mid, inner)}, ${at(a0, R)}, ${at(mid, R * 1.1)}, ${at(a1, R)})`, angle: mid, origin: at(mid, 28) };
  });
}

// Keyframes for something thrown at (vx, vy) px/s under gravity, slowing in the air, over
// `life` seconds; `extra(t)` adds a transform at 0…1 through it. Fades out at the end.
function fling(vx, vy, life, extra) {
  const drag = 2.2, steps = 8;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * life, f = (1 - Math.exp(-drag * t)) / drag;
    const px = vx * f, py = vy * f + 0.5 * GRAVITY * t * t;
    const u = i / steps;
    return { transform: `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) ${extra(u)}`, opacity: u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4 };
  });
}

function shake(el, k, ms) {
  const frames = Array.from({ length: 7 }, (_, i) => {
    const f = i === 6 ? 0 : k * (1 - i / 6);
    return { transform: `translate(${rand(-f, f).toFixed(1)}px, ${rand(-f, f).toFixed(1)}px)` };
  });
  el.animate(frames, { duration: ms, easing: 'linear' });
}
