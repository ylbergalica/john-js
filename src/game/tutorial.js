// Runs teach the game until one ends in death (quitting doesn't count), and say no more
// than this: the first guardian intro runs slower under a caption, play opens on another,
// the controls are carved into the floor by the player's start, a carving about essence is
// cut where the first foes notice them, and once the adrenaline meter has been full a
// moment the game holds on a card about Exalted. After death, the run summary ends on a
// word about coins (epilogue).
import { TUTORIAL as T } from '../data/config.js';
import { TAU } from '../engine/math.js';
import { AIState } from '../enemies/ai.js';
import { Carving } from '../render/carving.js';
import { h } from '../ui/dom.js';
import { keycap } from '../ui/common.js';
import { sfx } from '../audio/sfx.js';

const CAPTIONS = {
  guardian: "The floor's Guardian hunts you down",
  run: 'Run from the Guardian',
};
const CONTROLS = [
  { icon: 'lmb', text: 'Attack' },
  { icon: 'rmb', text: 'Deflect' },
  { icon: 'shift', text: 'Dash' },
];
const ESSENCE = [{ text: 'Collect essence' }, { text: 'from fallen foes' }];
const GROUP_RADIUS = 7; // enemies this close to the first to notice the player count as its group
const EDGE = 0.4; // open floor a carving keeps around it, world units

export class Tutorial {
  constructor(scene) {
    this.scene = scene;
    this.world = scene.world;
    this.world.introPace = T.introPace;
    this.world.guardianType = T.guardian;
    this.world.farEnds = true;
    this.epilogue = 'Collect coins to request aspects from above or below.';
    this.caption = { key: null, el: null };
    this.captionRoot = h('div', { class: 'tut-caption' });
    scene.hud.el.append(this.captionRoot);
    this.controlsCarved = false;
    this.carved = []; // the ground taken by carvings (with their margin), as rects
    this.essence = null; // the essence carving, built when the first foes notice the player
    this.essencePlaced = false; // once there was room to cut it
    this.fullSince = null; // world time the adrenaline meter filled, while it stays full
    this.card = null; // the Exalted card, while it holds the game: { el, t, ready }
    this.cardShown = false;
    this.listeners = new AbortController();
  }

  // The game holds still while the card is up.
  get holding() { return !!this.card; }

  // Every frame; dt is real time (the card counts on while the game holds).
  update(dt) {
    const { world, scene } = this;
    const firstFloor = scene.session.floor === 1;
    if (firstFloor && !this.controlsCarved && world.level) this.carveControls();
    if (firstFloor && !world.intro) { // only the first floor's intro is slow, its guardian set, its ends far apart
      world.introPace = 1;
      world.guardianType = null;
      world.farEnds = false;
    }
    this.updateCaption(firstFloor);
    if (this.card) {
      if (!scene.paused) this.card.t += dt;
      return;
    }
    if (scene.frozen) return;
    if (this.essencePlaced) this.essence.update(dt);
    else this.watchForFoes();
    if (!this.cardShown) this.watchAdrenaline();
  }

  // ── captions ─────────────────────────────────────────────────────
  // Over the first guardian intro, from a moment in until the camera reaches the player;
  // then as play starts, for runCaption seconds. Each is built fresh so its entrance plays.
  updateCaption(firstFloor) {
    const { world } = this, it = world.intro;
    let key = null, dur = 0;
    if (firstFloor && it && it.t >= T.guardianCaptionAt) {
      key = 'guardian';
      dur = it.hold + it.panTime - T.guardianCaptionAt;
    } else if (firstFloor && !it && world.time < world.floorStartedAt + T.runCaption) {
      key = 'run';
      dur = T.runCaption;
    }
    if (key === this.caption.key) return;
    this.caption.key = key;
    if (!key) { this.captionRoot.replaceChildren(); return; }
    const el = h('div', { class: `tut-cap ${key}` }, h('div', { class: 'tut-cap-text', text: CAPTIONS[key] }));
    el.style.setProperty('--dur', `${dur}s`);
    this.captionRoot.replaceChildren(el);
  }

  // ── carvings ─────────────────────────────────────────────────────
  // The controls go near the player's start, below them if there's room, never under them.
  carveControls() {
    this.controlsCarved = true;
    const { world } = this, start = world.level.start, [near, far] = T.carving.controlsDistance;
    const carving = new Carving(CONTROLS);
    const spot = this.spotFor(carving, start, near, far, start);
    if (spot) this.place(carving, spot);
    else carving.destroy();
  }

  // When the first foes (not a guardian) notice the player, the essence carving is cut
  // a little way toward them.
  watchForFoes() {
    const { world } = this, p = world.livePlayer;
    if (!p) return;
    const foe = world.enemies.find((e) => !e.dead && !e.type.isChaser && !e.summoned && e.ai.state !== AIState.Idle);
    if (!foe) return;
    let x = 0, y = 0, n = 0;
    for (const e of world.enemies) {
      if (e.dead || e.type.isChaser || Math.hypot(e.body.pos.x - foe.body.pos.x, e.body.pos.y - foe.body.pos.y) > GROUP_RADIUS) continue;
      x += e.body.pos.x; y += e.body.pos.y; n++;
    }
    const pp = p.body.pos, dx = x / n - pp.x, dy = y / n - pp.y, d = Math.hypot(dx, dy) || 1;
    const ahead = Math.min(T.carving.essenceAhead, d / 2);
    const near = { x: pp.x + (dx / d) * ahead, y: pp.y + (dy / d) * ahead };
    this.essence ??= new Carving(ESSENCE, T.carving.cutTime);
    const spot = this.spotFor(this.essence, near, 0, 10, pp);
    if (!spot) return; // no room here: tried again next frame, wherever the fight goes
    this.place(this.essence, spot);
    this.essencePlaced = true;
  }

  // Lays a carving on the ground at `spot` and keeps later ones off it.
  place(carving, spot) {
    carving.place(this.world.layers.ground, spot);
    const hw = carving.width / 2 + EDGE, hh = carving.height / 2 + EDGE;
    this.carved.push({ x0: spot.x - hw, x1: spot.x + hw, y0: spot.y - hh, y1: spot.y + hh });
  }

  // The nearest centre, between `from` and `to` away from `near` (searched from below it,
  // alternating sides), where the carving lies wholly on open floor, clear of props, of
  // the carvings already cut and of `keepOff`. → { x, y } or null.
  spotFor(carving, near, from, to, keepOff) {
    const { world } = this, grid = world.level.grid;
    const hw = carving.width / 2 + EDGE, hh = carving.height / 2 + EDGE;
    const fits = (c) => {
      const x0 = c.x - hw, x1 = c.x + hw, y0 = c.y - hh, y1 = c.y + hh;
      for (let ty = Math.floor(y0); ty < y1; ty++) {
        for (let tx = Math.floor(x0); tx < x1; tx++) if (!grid.isFloor(tx, ty)) return false;
      }
      const inside = (p, r) => p.x + r > x0 && p.x - r < x1 && p.y + r > y0 && p.y - r < y1;
      if (keepOff && inside(keepOff, 0.6)) return false;
      if (this.carved.some((r) => r.x0 < x1 && r.x1 > x0 && r.y0 < y1 && r.y1 > y0)) return false;
      return !world.props.some((pr) => !pr.dead && inside(pr.body.pos, pr.body.radius));
    };
    for (let r = from; r <= to; r += 0.5) {
      const steps = r === 0 ? 1 : Math.max(8, Math.ceil(r * 4));
      for (let i = 0; i < steps; i++) {
        const a = TAU / 4 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (TAU / steps);
        const c = { x: near.x + Math.cos(a) * r, y: near.y + Math.sin(a) * r };
        if (fits(c)) return c;
      }
    }
    return null;
  }

  // ── the Exalted card ─────────────────────────────────────────────
  watchAdrenaline() {
    const { world } = this;
    if (!world.adrenaline.canActivate || !world.livePlayer || world.intro || world.warp || world.warpIn) {
      this.fullSince = null;
      return;
    }
    this.fullSince ??= world.time;
    if (world.time - this.fullSince >= T.cardDelay) this.openCard();
  }

  // A dark veil over the whole held game, its lines rising in one after another; once they're
  // all in, any key or click lets the game go on.
  openCard() {
    const { scene } = this, s = T.cardStagger, at = (i) => T.cardLead + i * s;
    const step = (i, ...children) => {
      const el = h('div', { class: 'tut-step' }, ...children);
      el.style.setProperty('--d', `${at(i)}s`);
      return el;
    };
    const key = keycap('X');
    key.classList.add('tut-key');
    const exalted = h('span', { class: 'tut-exalted', text: 'Exalted' });
    exalted.style.setProperty('--d', `${at(2)}s`);
    const el = h('div', { class: 'tut-card' },
      h('div', { class: 'tut-band' },
        step(0, h('p', { class: 'tut-line', text: 'Go to the Guardian.' })),
        step(1, key),
        step(2, h('p', { class: 'tut-line' }, 'Become ', exalted, ' briefly', h('br'), 'in order to challenge them.')),
      ),
    );
    this.scene.uiRoot.append(el);
    this.card = { el, t: 0, ready: at(2) + T.cardGuard };
    this.cardShown = true;
    scene.input.reset();
    scene.music.setPaused(true);
    sfx.play('pause');
    // Caught on the way down, so the key or click that closes it doesn't reach the game too.
    const opts = { signal: this.listeners.signal, capture: true };
    const take = (e) => {
      if (scene.paused) return; // the pause menu's
      e.stopPropagation();
      if (!e.repeat) this.closeCard();
    };
    window.addEventListener('keydown', take, opts);
    window.addEventListener('mousedown', take, opts);
  }

  closeCard() {
    const { card, scene } = this;
    if (!card || card.t < card.ready) return;
    card.el.remove();
    this.card = null;
    this.listeners.abort();
    this.listeners = new AbortController();
    scene.music.setPaused(false);
  }

  destroy() {
    this.listeners.abort();
    if (!this.essencePlaced) this.essence?.destroy(); // placed, it goes with the floor
    this.card?.el.remove();
    this.captionRoot.remove();
  }
}
