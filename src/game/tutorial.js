// Runs teach the game until one has shown every screen below (Tutorial): the first floor keeps
// its foes clear of the player's start, its guardian intro runs slower under a caption, play
// opens on another, a tip by the player's top right names the controls once it has gone and,
// once the first foes notice them, another names essence (after the controls, cutting them
// short once they've had tipMinShown; one tip at a time). Once both have come and gone, the
// first time an attack is about to reach the player (not mid-dash) the game holds, dimmed but
// for the player and their attacker, on a tip about parrying until the player parries, and
// then the hit is parried whenever it connects. Once the adrenaline meter has been full a
// moment the game holds on a card about Exalted, and the first time the player strikes a
// guardian while Exalted it holds on a tip about staying so. A hold lets go only once it has
// stood a while. After death, the run summary ends on a word about coins (epilogue).
import { TUTORIAL as T } from '../data/config.js';
import { AIState } from '../enemies/ai.js';
import { h } from '../ui/dom.js';
import { keycap } from '../ui/common.js';
import { sfx } from '../audio/sfx.js';
import { profile } from '../meta/profile.js';

const CAPTIONS = {
  guardian: "The Guardian of the floor hunts you down",
  run: 'Run from the Guardian',
};
// Every screen the player must have seen for the tutorial to be done.
const SCREENS = ['guardian', 'run', 'controls', 'essence', 'parry', 'card', 'exalted'];
const TIP_GAP = 14; // px between the player's top right and the tips

// A mouse, its left or right button lit.
function mouse(side) {
  const el = h('span', { class: 'tut-mouse' });
  const button = side === 'left' ? 'M8 1A7 7 0 0 0 1 8V9H8Z' : 'M8 1A7 7 0 0 1 15 8V9H8Z';
  el.innerHTML = `<svg viewBox="0 0 16 22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="${button}" fill="currentColor" stroke="none"/><rect x="1" y="1" width="14" height="20" rx="7"/><path d="M1 9H15M8 1V9"/></svg>`;
  return el;
}

const row = (icon, text) => h('div', { class: 'tut-tip-row' }, h('span', { class: 'tut-tip-icon' }, icon), h('span', { text }));
const continueHint = () => h('div', { class: 'tut-continue', text: 'Press anything to continue' });

const TIPS = {
  controls: () => [row(mouse('left'), 'Attack'), row(mouse('right'), 'Parry'), row(keycap('Shift'), 'Dash')],
  essence: () => [h('div', { class: 'tut-tip-row' }, h('span', { class: 'tut-tip-icon' }, h('span', { class: 'tut-orb' })),
    h('span', {}, 'Collect essence from fallen foes', h('br'), 'to find a way out of the floor'))],
};

export class Tutorial {
  constructor(scene) {
    this.scene = scene;
    this.world = scene.world;
    this.world.introPace = T.introPace;
    this.world.guardianType = T.guardian;
    this.world.farEnds = true;
    this.world.startClearance = T.startClearance;
    this.epilogue = 'Collect coins to request aspects from above or below.';
    this.seen = new Set(); // SCREENS shown this run
    this.caption = { key: null, el: null };
    this.captionRoot = h('div', { class: 'tut-caption' });
    this.tipRoot = h('div', { class: 'tut-tips' });
    scene.hud.el.append(this.captionRoot, this.tipRoot);
    this.tip = null; // the tip by the player: { key, el, at, until } (world time)
    this.tipFreeAt = 0; // world time the next tip may come, a moment after the last went
    this.essenceDue = false; // foes have noticed the player; the essence tip comes next
    this.fullSince = null; // world time the adrenaline meter filled, while it stays full
    this.hold = null; // the card or tip holding the game: { key, el, t, ready, close }
    this.spot = null; // the parry lesson's light on the player and their attacker: { el, attacker, point }
    this.listeners = new AbortController();
    const { events } = scene.session;
    this.offs = [
      events.enemyDamaged.on((e) => this.onEnemyHit(e)),
      events.playerThreatened.on((p, hit) => this.onThreat(p, hit)),
    ];
  }

  // The game holds still while a card or tip holds it.
  get holding() { return !!this.hold; }

  // Every frame; dt is real time (a hold counts on while the game holds).
  update(dt) {
    const { world, scene } = this;
    const firstFloor = scene.session.floor === 1;
    if (firstFloor && !world.intro) { // only the first floor's intro is slow, its guardian set, its ends far apart
      world.introPace = 1;
      world.guardianType = null;
      world.farEnds = false;
      world.startClearance = 0;
    }
    this.updateCaption(firstFloor);
    const hold = this.hold;
    if (hold) {
      if (!scene.paused) hold.t += dt;
      if (hold.t >= hold.ready && !hold.el.classList.contains('ready')) hold.el.classList.add('ready');
      return;
    }
    if (scene.frozen) return;
    if (!this.seen.has('parry')) this.watchForDanger();
    if (this.hold) return; // it opened the parry lesson
    if (!this.seen.has('essence')) this.watchForFoes();
    this.updateTip(firstFloor);
    if (!this.seen.has('card')) this.watchAdrenaline();
  }

  // After the world is drawn: the tips sit off the player's top right, wherever the camera puts them.
  follow(alpha) {
    const p = this.world.livePlayer;
    this.tipRoot.classList.toggle('hidden', !p);
    if (!p) return;
    const cam = this.world.camera, r = p.body.radius * Math.SQRT1_2;
    const pos = p.body.lerpPos(alpha), s = cam.worldToScreen(pos.x + r, pos.y - r);
    this.tipRoot.style.transform = `translate(${(s.x + TIP_GAP).toFixed(1)}px, ${(s.y - TIP_GAP).toFixed(1)}px) translateY(-100%)`;
    if (this.spot) this.placeSpot(pos);
  }

  saw(key) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size === SCREENS.length) profile.completeTutorial();
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
    const el = h('div', { class: `tut-cap ${key}` }, h('div', { class: 'tut-cap-band' }, h('div', { class: 'tut-cap-text', text: CAPTIONS[key] })));
    el.style.setProperty('--dur', `${dur}s`);
    this.captionRoot.replaceChildren(el);
    this.saw(key);
  }

  // ── tips ─────────────────────────────────────────────────────────
  // One at a time, each lingering its tipLinger: the controls tip first, once the run caption
  // has gone; then the essence tip once foes notice the player, cutting the controls tip short
  // if it's still up (but never before it has had tipMinShown).
  updateTip(firstFloor) {
    const { world } = this, tip = this.tip;
    const cut = tip?.key === 'controls' && this.essenceDue && world.time >= tip.at + T.tipMinShown;
    if (tip && (world.time >= tip.until || cut)) this.endTip();
    if (this.tip || world.time < this.tipFreeAt || !world.livePlayer) return;
    if (this.essenceDue && (this.seen.has('controls') || !firstFloor)) this.showTip('essence');
    else if (firstFloor && !this.seen.has('controls') && !world.intro && world.time >= world.floorStartedAt + T.runCaption + T.controlsAfter) this.showTip('controls');
  }

  showTip(key) {
    const el = h('div', { class: 'tut-tip' }, TIPS[key]());
    this.tipRoot.append(el);
    this.tip = { key, el, at: this.world.time, until: this.world.time + T.tipLinger[key] };
    if (key === 'essence') this.essenceDue = false;
    this.saw(key);
  }

  endTip() {
    this.dismiss(this.tip.el);
    this.tip = null;
    this.tipFreeAt = this.world.time + T.tipGap;
  }


  dismiss(el, then) {
    el.classList.add('out');
    el.addEventListener('animationend', () => { el.remove(); then?.(); }, { once: true });
  }

  // When the first foes (not a guardian) notice the player.
  watchForFoes() {
    if (!this.world.livePlayer) return;
    const foe = this.world.enemies.find((e) => !e.dead && !e.type.isChaser && !e.summoned && e.ai.state !== AIState.Idle);
    if (foe) this.essenceDue = true;
  }

  // ── holds ────────────────────────────────────────────────────────
  // Holds the game on `el` (already shown); once it has stood `ready` seconds it takes on
  // the ready class (its "press anything") and any key or click lets the game go on, or only
  // those `accepts` takes (the rest are swallowed, but Escape still pauses).
  holdOn(key, el, ready, close, accepts = null) {
    const { scene } = this;
    this.hold = { key, el, t: 0, ready, close };
    scene.input.reset();
    scene.music.setPaused(true);
    sfx.play('pause');
    // Caught on the way down, so the key or click that lets go doesn't reach the game too.
    const opts = { signal: this.listeners.signal, capture: true };
    const take = (e) => {
      if (scene.paused) return; // the pause menu's
      if (accepts && !accepts(e)) {
        if (e.code !== 'Escape') e.stopPropagation();
        return;
      }
      e.stopPropagation();
      if (!e.repeat) this.letGo();
    };
    window.addEventListener('keydown', take, opts);
    window.addEventListener('mousedown', take, opts);
  }

  letGo() {
    const { hold, scene } = this;
    if (!hold || hold.t < hold.ready) return;
    hold.close();
    this.hold = null;
    this.listeners.abort();
    this.listeners = new AbortController();
    scene.input.reset();
    scene.music.setPaused(false);
    this.saw(hold.key);
  }

  // ── parrying ─────────────────────────────────────────────────────
  // The first hit about to land holds the game (unless the player is dashing out of the way),
  // the world dimmed but for a band of light around the player and their attacker, until the
  // player parries; the parry always takes the hit.
  // Every frame until it's been taught: an attack due to reach the player within parryLead
  // seconds, as things stand, opens the lesson.
  // The parry lesson waits until the controls and essence tips have both come and gone.
  get tipsDone() { return this.seen.has('controls') && this.seen.has('essence') && !this.tip && this.world.time >= this.tipFreeAt; }

  watchForDanger() {
    const p = this.world.livePlayer;
    if (!p || this.world.intro || p.dashing || p.teleporting) return;
    const threat = this.incoming(p);
    if (threat) this.teachParry(p, threat.enemy, threat.point, threat.at);
  }

  // The first attack about to reach the player (standing where they are) within parryLead:
  // an enemy winding up a blow with the player in its range, a projectile on course for them,
  // or a lobbed shell landing on them. → { enemy, point, at } (at: world time it can hurt) or null.
  incoming(p) {
    const { world } = this, now = world.time, pos = p.body.pos, r = p.body.radius;
    const soon = (at) => at > now && at - now <= T.parryLead;
    for (const e of world.enemies) {
      if (e.dead || e.stunned) continue;
      for (const a of e.abilities.values()) {
        if (!a.hitbox || a.phase !== 'windup') continue;
        const at = a.phaseEndsAt + a.armDelay;
        if (soon(at) && Math.hypot(e.body.pos.x - pos.x, e.body.pos.y - pos.y) <= a.data.range + r) return { enemy: e, point: e.body.pos, at };
      }
    }
    for (const attack of world.hostileAttacks) {
      const enemy = attack.sourceAbility?.enemy ?? null;
      if (attack.landAt !== undefined) { // a lobbed shell
        if (!attack.landed && soon(attack.landAt) && Math.hypot(attack.to.x - pos.x, attack.to.y - pos.y) <= attack.radius + r) return { enemy, point: attack.to, at: attack.landAt };
      } else if (attack.dir && attack.speed > 0) { // a projectile: where it passes closest to the player, and when
        const b = attack.body.pos, t = ((pos.x - b.x) * attack.dir.x + (pos.y - b.y) * attack.dir.y) / attack.speed;
        const cx = b.x + attack.dir.x * attack.speed * t, cy = b.y + attack.dir.y * attack.speed * t;
        if (t > 0 && soon(now + t) && Math.hypot(cx - pos.x, cy - pos.y) <= attack.body.radius + r) return { enemy, point: { ...b }, at: now + t };
      }
    }
    return null;
  }

  // Missed by the look-ahead (an attack it doesn't foresee): the hit that has just connected.
  onThreat(player, hit) {
    if (player.dashing || player.teleporting || hit.attack === player.hurtBy) return;
    this.teachParry(player, hit.attack.enemy ?? hit.attack.sourceAbility?.enemy ?? null, hit.source, this.world.time);
  }

  // Holds the game, dimmed but for the player and `attacker` (or `point`), until the player
  // parries; then any hit connecting until parryGuard after `at` is parried, perfectly.
  teachParry(player, attacker, point, at) {
    if (this.seen.has('parry') || this.hold || this.scene.summary || !this.tipsDone) return;
    const spot = h('div', { class: 'tut-spot' });
    this.scene.hud.el.insertBefore(spot, this.tipRoot);
    this.spot = { el: spot, attacker, point: { ...point } };
    this.placeSpot(player.body.pos); // before it's first drawn, so its shadow never covers the lot
    const parry = mouse('right');
    const el = h('div', { class: 'tut-tip hold parry' },
      h('div', { class: 'tut-tip-lead', text: 'Stand your ground.' }),
      h('div', { class: 'tut-tip-row' }, h('span', { text: 'Any and all danger can be parried.' })),
      h('div', { class: 'tut-tip-row' }, h('span', { text: 'Aim at the incoming attack and parry' }), parry),
    );
    this.tipRoot.append(el);
    const close = () => {
      this.dismiss(el);
      this.dismiss(spot, () => { if (this.spot?.el === spot) this.spot = null; });
      player.parryGuardUntil = Math.max(at, this.world.time) + T.parryGuard;
    };
    this.holdOn('parry', el, T.holdGuard + T.tipHoldLead, close, (e) => e.type === 'mousedown' && e.button === 2);
  }

  // The light: a capsule spotRadius wide around the line from the player (at `from`) to
  // their attacker, everything else dimmed by its shadow.
  placeSpot(from) {
    const { attacker, point, el } = this.spot, cam = this.world.camera;
    const to = attacker && !attacker.dead ? attacker.body.lerpPos(this.scene.alpha) : point;
    const a = cam.worldToScreen(from.x, from.y), b = cam.worldToScreen(to.x, to.y);
    const r = T.spotRadius * cam.ppu, len = Math.hypot(b.x - a.x, b.y - a.y);
    el.style.width = `${(len + 2 * r).toFixed(1)}px`;
    el.style.height = `${(2 * r).toFixed(1)}px`;
    el.style.transform = `translate(${((a.x + b.x) / 2).toFixed(1)}px, ${((a.y + b.y) / 2).toFixed(1)}px) translate(-50%, -50%) rotate(${Math.atan2(b.y - a.y, b.x - a.x).toFixed(4)}rad)`;
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

  // A dark veil over the whole held game, its lines rising in one after another.
  openCard() {
    const s = T.cardStagger, at = (i) => T.cardLead + i * s;
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
      continueHint(),
    );
    this.scene.uiRoot.append(el);
    this.holdOn('card', el, at(2) + T.holdGuard, () => el.remove());
  }

  // ── staying Exalted ──────────────────────────────────────────────
  // The first blow on a guardian while Exalted holds the game, without a veil, on a tip.
  onEnemyHit(enemy) {
    const { world } = this;
    if (this.seen.has('exalted') || this.hold || this.scene.summary || !enemy.type.isChaser || !world.adrenaline.isExalted || !world.livePlayer) return;
    const el = h('div', { class: 'tut-tip hold' },
      h('div', { class: 'tut-tip-row' }, h('span', {}, 'Keep fighting in order to retain your ', h('b', { text: 'Exalted' }), ' state')),
      continueHint(),
    );
    this.tipRoot.append(el);
    this.holdOn('exalted', el, T.holdGuard + T.tipHoldLead, () => this.dismiss(el));
  }

  destroy() {
    for (const off of this.offs) off();
    this.listeners.abort();
    if (this.hold?.key === 'card') this.hold.el.remove();
    this.spot?.el.remove();
    this.captionRoot.remove();
    this.tipRoot.remove();
  }
}
