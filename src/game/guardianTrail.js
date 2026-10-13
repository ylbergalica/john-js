// The red trail to the guardian (GUARDIAN_TRAIL): once the adrenaline meter is full and the
// fighting has died down, the exit trail's mist, in red, shows the way from the player to
// the nearest guardian. Guardians walk, so it's laid afresh as they (or the player) stray
// from its ends, the old one fading out; it fades for good once it's no longer wanted.
import { GUARDIAN_TRAIL as T } from '../data/config.js';
import { dist } from '../engine/math.js';
import { AIState } from '../enemies/ai.js';
import { ExitTrail } from './exitTrail.js';

export class GuardianTrail {
  constructor(world) {
    this.world = world;
    this.trail = null;
    this.showing = false; // wanted, and laid since it became so
    this.laidAt = -Infinity;
    this.from = null; // where the player and the guardian were as it was laid
    this.to = null;
  }

  step() {
    const w = this.world, p = w.livePlayer;
    const g = p && this.wanted(p) ? this.nearestGuardian(p) : null;
    if (!g || dist(p.body.pos, g.body.pos) <= T.near) {
      this.showing = false;
      this.fade();
      return;
    }
    const pp = p.body.pos, gp = g.body.pos;
    if (this.showing) {
      if (w.time < this.laidAt + T.relayEvery) return;
      if (dist(gp, this.to) < T.relay && dist(pp, this.from) < T.relay) return;
    }
    this.fade();
    this.trail = ExitTrail.lay(w, pp, gp, T);
    this.showing = true;
    this.laidAt = w.time;
    this.from = { ...pp };
    this.to = { ...gp };
  }

  // A full meter, and no fight: no blows traded for `calm` seconds and no foe after the
  // player (a guardian always is, so it doesn't count).
  wanted(p) {
    const w = this.world;
    if (!w.adrenaline.canActivate || w.time - w.lastBlowAt < T.calm) return false;
    return !w.enemies.some((e) => !e.type.isChaser && e.ai.state !== AIState.Idle && e.ai.state !== AIState.Dead
      && dist(e.body.pos, p.body.pos) <= e.type.ai.aggroRange);
  }

  nearestGuardian(p) {
    let best = null, bestD = Infinity;
    for (const e of this.world.enemies) {
      if (!e.type.isChaser || e.dead || e.dying) continue;
      const d = dist(e.body.pos, p.body.pos);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  fade() {
    this.trail?.fadeAway();
    this.trail = null;
  }

  // A new floor: its entities (the trail among them) are already gone.
  reset() {
    this.trail = null;
    this.showing = false;
    this.laidAt = -Infinity;
  }
}
