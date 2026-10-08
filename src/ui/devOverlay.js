// Dev-only combat readout, switched on from the dev menu: health over every enemy,
// floating numbers for damage dealt/taken and adrenaline gained/spent, and a panel
// with the player's exact health, adrenaline and run totals plus a recent-event log.
import { h, DomWriter } from './dom.js';
import { devFlags } from '../game/devFlags.js';

const FLOAT_LIFE = 0.9; // seconds a floating number lives
const FLOAT_RISE = 1.4; // world units it drifts up over its life
const LOG_LINES = 10;

const fmt = (n) => String(Math.round(n * 100) / 100);

export class DevOverlay {
  constructor(root, scene) {
    this.scene = scene;
    this.dom = new DomWriter();
    this.labelLayer = h('div', { class: 'dev-labels' });
    this.floatLayer = h('div', { class: 'dev-floats' });
    this.stats = h('div', { class: 'dev-stats' });
    this.log = h('div', { class: 'dev-log' });
    this.panel = h('div', { class: 'dev-panel' }, this.stats, this.log);
    this.el = h('div', { class: 'dev-overlay' }, this.labelLayer, this.floatLayer, this.panel);
    root.append(this.el);

    this.labels = new Map(); // enemy → label element
    this.floats = [];
    this.totals = { dealt: 0, taken: 0, takenRaw: 0, adrenaline: 0, adrenalineWasted: 0, spent: 0 };
    this.lastUses = scene.world.adrenaline.uses;

    const ev = scene.session.events;
    this.offs = [
      ev.enemyDamaged.on((e, dmg) => this.onEnemyDamaged(e, dmg)),
      ev.playerDamaged.on((p, dmg, raw) => this.onPlayerDamaged(p, dmg, raw)),
      ev.adrenalineGained.on((got, offered) => this.onAdrenaline(got, offered)),
    ];
  }

  // ── events ───────────────────────────────────────────────────────
  onEnemyDamaged(enemy, dmg) {
    this.totals.dealt += dmg;
    const left = Math.max(0, enemy.health);
    this.spawnFloat(enemy.body.pos, enemy.body.radius, `${fmt(dmg)}`, 'dealt');
    this.addLog(`${enemy.type.name} -${fmt(dmg)} → ${fmt(left)}/${enemy.type.maxHealth}${enemy.health <= 0 ? ' ✝' : ''}`, 'dealt');
  }

  onPlayerDamaged(player, dmg, raw) {
    this.totals.taken += dmg;
    this.totals.takenRaw += raw;
    const resisted = raw !== dmg ? ` (raw ${fmt(raw)})` : '';
    this.spawnFloat(player.body.pos, player.body.radius, `-${fmt(dmg)}`, 'taken');
    this.addLog(`Player -${fmt(dmg)}${resisted} → ${fmt(Math.max(0, player.health))}/${player.maxHealth}`, 'taken');
  }

  onAdrenaline(got, offered) {
    const a = this.scene.world.adrenaline, p = this.scene.world.livePlayer;
    this.totals.adrenaline += got;
    this.totals.adrenalineWasted += offered - got;
    const capped = got < offered ? ` (capped, ${fmt(offered - got)} lost)` : '';
    if (p) this.spawnFloat(p.body.pos, p.body.radius, `+${fmt(got)}`, 'adrenaline', 0.6);
    this.addLog(`Adrenaline +${fmt(got)}${capped} → ${fmt(a.current)}/${fmt(a.max)}`, 'adrenaline');
  }

  // Activating Exalted spends the full meter; noticed by polling the use count.
  checkActivation() {
    const a = this.scene.world.adrenaline, p = this.scene.world.livePlayer;
    if (a.uses === this.lastUses) return;
    this.lastUses = a.uses;
    this.totals.spent += a.max;
    if (p) this.spawnFloat(p.body.pos, p.body.radius, `-${fmt(a.max)} ADR`, 'spent');
    this.addLog(`EXALTED: spent ${fmt(a.max)} adrenaline (${fmt(a.exaltedDuration)}s)`, 'spent');
  }

  spawnFloat(pos, radius, text, kind, side = 0) {
    const el = h('div', { class: `dev-float ${kind}`, text });
    this.floatLayer.append(el);
    this.floats.push({ el, x: pos.x + side + (Math.random() - 0.5) * 0.6, y: pos.y - radius, age: 0 });
  }

  addLog(text, kind) {
    const t = this.scene.world.time.toFixed(1).padStart(6);
    this.log.prepend(h('div', { class: kind, text: `${t}  ${text}` }));
    while (this.log.childElementCount > LOG_LINES) this.log.lastChild.remove();
  }

  // ── per frame ────────────────────────────────────────────────────
  update(dt, alpha) {
    this.checkActivation();
    const on = devFlags.combatReadout;
    this.dom.set(this.el, 'hidden', !on);
    if (!on) {
      for (const f of this.floats) f.el.remove();
      this.floats.length = 0;
      return;
    }
    const { world } = this.scene, cam = world.camera;
    this.updateLabels(world, cam, alpha);
    this.updateFloats(dt, cam);
    this.updatePanel(world);
  }

  updateLabels(world, cam, alpha) {
    const seen = new Set();
    for (const e of world.enemies) {
      if (e.dead) continue;
      seen.add(e);
      let el = this.labels.get(e);
      if (!el) {
        el = h('div', { class: 'dev-hp' });
        this.labelLayer.append(el);
        this.labels.set(e, el);
      }
      const p = e.body.lerpPos(alpha);
      const s = cam.worldToScreen(p.x, p.y - e.body.radius);
      const onScreen = s.x > -60 && s.x < cam.viewW + 60 && s.y > -30 && s.y < cam.viewH + 30;
      this.dom.set(el, 'hidden', !onScreen);
      if (!onScreen) continue;
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -130%)`;
      const frac = Math.max(0, e.health) / e.type.maxHealth;
      this.dom.set(el, 'text', `${fmt(Math.max(0, e.health))}/${e.type.maxHealth}`);
      this.dom.set(el, 'color', frac > 0.5 ? '#9dff9d' : frac > 0.25 ? '#ffd76a' : '#ff7a7a');
    }
    for (const [e, el] of this.labels) {
      if (!seen.has(e)) { el.remove(); this.labels.delete(e); }
    }
  }

  updateFloats(dt, cam) {
    let w = 0;
    for (const f of this.floats) {
      f.age += dt;
      if (f.age >= FLOAT_LIFE) { f.el.remove(); continue; }
      const k = f.age / FLOAT_LIFE;
      const s = cam.worldToScreen(f.x, f.y - k * FLOAT_RISE);
      f.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
      f.el.style.opacity = String(Math.min(1, (1 - k) * 2));
      this.floats[w++] = f;
    }
    this.floats.length = w;
  }

  updatePanel(world) {
    const p = world.livePlayer, a = world.adrenaline, t = this.totals;
    const iframes = p ? Math.max(0, p.invincibleUntil - world.time) : 0;
    const lines = [
      p ? `HP   ${fmt(p.health)} / ${p.maxHealth}${iframes > 0 ? `   i-frames ${iframes.toFixed(2)}s` : ''}` : 'HP   dead',
      `ADR  ${fmt(a.current)} / ${fmt(a.max)}   uses ${a.uses}`,
      a.isExalted ? `EXALTED  ${a.exaltedRemaining.toFixed(2)} / ${fmt(a.exaltedDuration)}s` : `ready: ${a.canActivate ? 'yes' : 'no'}`,
      `dmg ×${fmt(a.damageMultiplier)}   taken ×${fmt(a.damageTakenMultiplier)}`,
      `enemies ${world.enemies.length}`,
      '',
      `dealt  ${fmt(t.dealt)}`,
      `taken  ${fmt(t.taken)}  (raw ${fmt(t.takenRaw)})`,
      `adr +${fmt(t.adrenaline)}  lost ${fmt(t.adrenalineWasted)}  spent ${fmt(t.spent)}`,
    ];
    this.dom.set(this.stats, 'text', lines.join('\n'));
  }

  destroy() {
    for (const off of this.offs) off();
    this.el.remove();
  }
}
