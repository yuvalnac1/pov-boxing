// Fight logic — pure, no rendering, so it can be unit-tested.
// The game layer feeds it player actions and reads back state + an event queue (for visuals/sound).

export const ROUND_LENGTH = 60;
export const ROUNDS = 3;
const INTRO_TIME = 2.2;
const BREAK_TIME = 5;
const STUN_TIME = 0.9;
// Parry: the open palm has to come in the last moment before impact, once per punch.
const PARRY_WINDOW = 0.3;  // s before impact when an open palm parries…
const PARRY_FROM = 0.5;    // …and not before this fraction of the wind-up
const PARRY_COOLDOWN = 1.0; // after a successful parry, no parrying for this long
const STUN_MULT = 1.5;     // punches on a stunned opponent
const COMBO_WINDUP = 0.25;
const DAMAGE = { head: 6, body: 4 };
// Stamina: every punch costs some; it comes back once you stop punching. Empty = weak, half-damage punches.
export const STAMINA = { max: 100, head: 10, body: 8, parry: 12, regen: 24, guardRegen: 14, delay: 0.45, hitDrain: 4 };
const TIRED_MULT = 0.5;
const COUNTER_MULT = 1.25; // punching an opponent who just whiffed on your dodge
const BODY_SLOW = 0.2;     // max extra wind-up time (fraction) from accumulated body damage
const PRESSURE = 0.15;     // each of your hits brings his next attack this much sooner (he fights back)
// Leaning: fwd/side in -1..1 from the webcam (see lean.js)
// Dodges only count if you move during his wind-up; a lean you were already holding doesn't dodge.
export const LEAN = { reach: 0.32, back: 0.5, slip: 0.7, held: 0.45, leanInRisk: 1.3, leanInFrom: 0.5 };
// Fraction of damage that gets through a raised guard: jabs are stopped, hooks and uppercuts split it.
const GUARD_CHIP = { jab: 0.1, hook: 0.2, uppercut: 0.35 };
const SIGNATURE_CHIP = 0.3;
const SPAM_RESET = 2.5;    // seconds without punching that resets the spam counter

// Ring movement. `dist` is the gap to the opponent relative to normal fighting distance (1).
export const REACH = 1.2;
// Getting up (WWE-style timing bar): a marker sweeps a bar; punch to stop it inside the green zone.
export const GETUP = { countBeat: 1.3, speed: 0.9, speedUp: 1.25, zone: 0.24, shrink: 0.8, missLock: 0.6 };
// The player can always get up, but every knockdown makes it harder: more stops needed, a faster marker, a smaller zone.
export const GETUP_HARDER = { maxNeeded: 5, speedPerKd: 0.15, zonePerKd: 0.88, maxSpeed: 1.9, minZone: 0.11 };
// Upgrades picked after each new win: each level adds this much.
export const UPGRADE = { power: 0.05, health: 5, stamina: 5, staminaRegen: 0.05, maxLevel: 3 };
const DIST = { windup: 0.86, attack: 0.82, hit: 1.16, stunned: 1.0, block: 1.04, recover: 1.1 };
const RING_X = 0.9;        // how far the pair's midpoint may travel across the ring (m)
const RING_Z = 0.7;
const MAX_ANGLE = 0.95;    // how far the pair may circle around (rad)

export class Fight {
  constructor(entry, { rng = Math.random, roundLength = ROUND_LENGTH, rounds = ROUNDS, upgrades = {} } = {}) {
    this.entry = entry;
    this.ai = entry.opponent.ai;
    this.rng = rng;
    this.roundLength = roundLength;
    this.rounds = rounds;
    this.events = [];

    this.round = 1;
    this.roundTime = roundLength;
    this.phase = 'intro';
    this.phaseTime = 0;
    this.time = 0;
    this.result = null;
    this.down = null;

    const up = { power: 0, health: 0, stamina: 0, ...upgrades };
    this.upgrades = up;
    const maxHp = 100 + UPGRADE.health * up.health;
    const maxSta = STAMINA.max + UPGRADE.stamina * up.stamina;
    this.player = {
      hp: maxHp, max: maxHp, power: 1 + UPGRADE.power * up.power, regenMult: 1 + UPGRADE.staminaRegen * up.stamina, guard: false, knockdowns: 0, damageDealt: 0, punches: 0, landed: 0, parries: 0,
      stamina: maxSta, maxStamina: maxSta, lastSpend: -Infinity, dodges: 0, bodyShots: 0,
      lean: { fwd: 0, side: 0 },
    };
    this.opp = {
      hp: this.ai.hp, max: this.ai.hp, knockdowns: 0, damageDealt: 0,
      state: 'idle', stateTime: 0, stateDur: 1.5, attack: null, comboLeft: 0, counterPending: false,
      // movement
      bodyDmg: 0, exposed: false, attackIn: 1.2, parryTried: false, leanAtWindup: { fwd: 0, side: 0 },
      dist: 1, idleDist: 1, angle: 0, circleDir: 1, circleTimer: 2, midX: 0, midZ: 0, midTX: 0, midTZ: 0, midTimer: 3,
    };
    this.spam = { count: 0, lastPunch: -Infinity };
    this.parryLockUntil = -Infinity;
  }

  // ---------- Player actions ----------
  // Webcam lean: fwd > 0 = stepping in, side = slipping left/right.
  setLean(fwd = 0, side = 0) {
    this.player.lean.fwd = fwd;
    this.player.lean.side = side;
  }

  // Gap to the opponent after your own lean (leaning in closes it, leaning back opens it).
  get gap() {
    const f = this.player.lean.fwd;
    return this.opp.dist - f * (f > 0 ? LEAN.reach : LEAN.back);
  }

  spend(amount) {
    const p = this.player;
    const enough = p.stamina >= amount;
    p.stamina = Math.max(0, p.stamina - amount);
    p.lastSpend = this.time;
    return enough;
  }

  setGuard(on) {
    if (on && !this.player.guard) this.spam.count = 0;
    this.player.guard = on;
  }

  punch(kind = 'straight', hand = 'R', target = 'head') {
    if (this.phase !== 'fight') return;
    const p = this.player;
    const o = this.opp;
    p.punches++;
    const fresh = this.spend(STAMINA[target] ?? STAMINA.head);
    if (!fresh) this.emit({ type: 'tired' });

    if (this.time - this.spam.lastPunch > SPAM_RESET) this.spam.count = 0;
    this.spam.lastPunch = this.time;
    this.spam.count++;

    if (this.spam.count > this.ai.spamLimit && o.state !== 'stunned' && o.state !== 'block') {
      this.spam.count = 0;
      this.setOpp('block', 0.9);
      o.counterPending = true;
      this.emit({ type: 'spamPunished' });
    }

    if (this.gap > REACH && o.state !== 'stunned') {
      this.emit({ type: 'miss', hand, target });
      return;
    }

    // His guard is high: body shots go under it.
    if (o.state === 'block' && target === 'head') {
      this.emit({ type: 'oppBlocked', kind, hand, target });
      return;
    }

    const blockChance = target === 'body' ? this.ai.blockChance * 0.35 : this.ai.blockChance;
    if (['idle', 'recover', 'hit'].includes(o.state) && !o.exposed && this.rng() < blockChance) {
      this.setOpp('block', 0.55 + this.rng() * 0.4);
      // Some opponents fire straight back off the block.
      if (this.rng() < (this.ai.counterChance || 0)) o.counterPending = true;
      this.emit({ type: 'oppBlocked', kind, hand, target });
      return;
    }

    const stunned = o.state === 'stunned';
    const counter = o.exposed && !stunned;
    let dmg = (DAMAGE[target] ?? DAMAGE.head) * (stunned ? STUN_MULT : counter ? COUNTER_MULT : 1) * (fresh ? 1 : TIRED_MULT) * p.power;
    dmg = Math.round(dmg * 10) / 10;
    o.hp = Math.max(0, o.hp - dmg);
    p.damageDealt += dmg;
    p.landed++;
    if (target === 'body') {
      p.bodyShots++;
      o.bodyDmg += dmg;
    }
    this.emit({ type: 'hit', target: 'opp', kind, hand, damage: dmg, crit: stunned, counter, zone: target, weak: !fresh });
    this.pushBack(stunned ? 0.12 : 0.06);
    if (!stunned) o.attackIn -= PRESSURE;

    if (o.hp <= 0) return this.knockdown('opp');

    if (o.state === 'windup') {
      // Only a head shot can knock him out of a punch, and only sometimes.
      if (target === 'head' && this.rng() < this.ai.interruptChance * 0.5) this.setOpp('hit', 0.3);
    } else if (!stunned && o.state !== 'attack') {
      this.setOpp('hit', 0.3);
    }
  }

  // Open palm (✋). Only does something while the opponent is winding up a punch.
  parry(hand = 'R') {
    if (this.phase !== 'fight') return;
    const o = this.opp;
    if (o.state !== 'windup') return;
    if (this.time < this.parryLockUntil || o.parryTried) return;
    o.parryTried = true; // one try per punch
    const progress = o.stateTime / o.stateDur;
    const remaining = o.stateDur - o.stateTime;
    // Only the hand on the side the punch comes from can parry it: his right hand → your left, and vice versa.
    const needed = parryHand(o.attack);
    if (hand !== needed && !o.attack.feint) {
      this.emit({ type: 'wrongHand', hand, needed });
      return;
    }
    if (o.attack.feint) {
      this.emit({ type: 'parryWhiff', hand });
      this.startAttack({ type: 'jab', windup: COMBO_WINDUP + 0.1, damage: 9 }); // punished
      return;
    }
    if (progress >= PARRY_FROM && remaining <= PARRY_WINDOW) {
      this.parryLockUntil = this.time + PARRY_COOLDOWN;
      this.spend(STAMINA.parry);
      this.player.parries++;
      o.comboLeft = 0;
      this.setOpp('stunned', STUN_TIME);
      this.pushBack(0.15);
      this.emit({ type: 'parry', hand, attack: o.attack.type });
      return;
    }
    this.emit({ type: 'tooEarly', hand });
  }

  // ---------- Simulation ----------
  update(dt) {
    this.time += dt;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'intro':
        if (this.phaseTime >= INTRO_TIME) {
          this.setPhase('fight');
          this.emit({ type: 'bell' });
          this.emit({ type: 'roundStart', round: this.round });
        }
        break;
      case 'fight':
        this.roundTime -= dt;
        this.regen(dt);
        this.updateOpp(dt);
        if (this.phase === 'fight' && this.roundTime <= 0) this.endRound();
        break;
      case 'down':
        this.updateDown(dt);
        break;
      case 'break':
        if (this.phaseTime >= BREAK_TIME) {
          this.round++;
          this.roundTime = this.roundLength;
          this.opp.attackIn = 1.2;
          this.setOpp('idle', 1.5);
          this.setPhase('intro');
        }
        break;
    }
  }

  // Footwork: the opponent circles, travels across the ring and steps in/out of range.
  // The player's view follows him (see stage.setFightLayout).
  updateMovement(dt) {
    const o = this.opp;
    const fw = this.ai.footwork ?? 0.6;
    const target = o.state === 'idle' ? o.idleDist : DIST[o.state] ?? 1;
    const rate = o.state === 'windup' ? 6 : o.state === 'hit' ? 9 : 3.5;
    o.dist += (target - o.dist) * (1 - Math.exp(-rate * dt));

    const mobile = o.state === 'idle' || o.state === 'recover' || o.state === 'block';
    o.circleTimer -= dt;
    if (o.circleTimer <= 0 || Math.abs(o.angle) > MAX_ANGLE) {
      o.circleDir = Math.abs(o.angle) > MAX_ANGLE ? -Math.sign(o.angle) : this.rng() < 0.5 ? -1 : 1;
      o.circleTimer = 1.2 + this.rng() * 2.2;
    }
    if (mobile) o.angle += o.circleDir * fw * 0.55 * dt;

    o.midTimer -= dt;
    if (o.midTimer <= 0) {
      o.midTX = (this.rng() * 2 - 1) * RING_X;
      o.midTZ = (this.rng() * 2 - 1) * RING_Z;
      o.midTimer = 2.5 + this.rng() * 3;
    }
    const k = 1 - Math.exp(-fw * 0.6 * dt);
    o.midX += (o.midTX - o.midX) * k;
    o.midZ += (o.midTZ - o.midZ) * k;
  }

  // Shove the opponent back along the line between the fighters (he gets driven toward the ropes).
  pushBack(amount) {
    const o = this.opp;
    o.midX = clamp(o.midX - Math.sin(o.angle) * amount, -RING_X, RING_X);
    o.midZ = clamp(o.midZ - Math.cos(o.angle) * amount, -RING_Z, RING_Z);
  }

  regen(dt) {
    const p = this.player;
    if (this.time - p.lastSpend < STAMINA.delay) return;
    p.stamina = Math.min(p.maxStamina, p.stamina + (p.guard ? STAMINA.guardRegen : STAMINA.regen) * p.regenMult * dt);
  }

  updateOpp(dt) {
    const o = this.opp;
    this.updateMovement(dt);
    if (o.state !== 'recover') o.exposed = false;
    o.stateTime += dt;
    if (o.state === 'windup') o.progress = Math.min(1, o.stateTime / o.stateDur);

    // His own attack clock: your punches don't reset it, so he always gets to throw.
    const canStart = o.state === 'idle' || o.state === 'recover' || (o.state === 'hit' && o.stateTime > 0.15);
    if (canStart) {
      o.attackIn -= dt;
      if (o.attackIn <= 0) {
        o.idleDist = 1; // steps in to punch
        o.attackIn = this.idleTime();
        this.startAttack(this.pickAttack());
        return;
      }
    }
    if (o.stateTime < o.stateDur) return;

    switch (o.state) {
      case 'idle':
        this.setOpp('idle', 0.8 + this.rng() * 0.8); // keep moving, maybe dance out
        break;
      case 'windup':
        if (o.attack.feint) {
          this.emit({ type: 'feint' });
          this.setOpp('idle', 0.5);
        } else {
          this.strike();
        }
        break;
      case 'attack':
        if (o.comboLeft > 0) {
          o.comboLeft--;
          this.startAttack({ ...o.attack, windup: COMBO_WINDUP, combo: 0 }, true);
        } else {
          this.setOpp('recover', 0.5);
        }
        break;
      case 'block':
        if (o.counterPending) {
          o.counterPending = false;
          this.startAttack({ type: 'jab', windup: 0.36, damage: 10 });
        } else {
          this.setOpp('idle', 1);
        }
        break;
      case 'stunned':
        this.emit({ type: 'stunEnd' });
        o.attackIn = Math.max(o.attackIn, 0.5);
        this.setOpp('idle', 1);
        break;
      case 'hit':
      case 'recover':
        this.setOpp('idle', 1);
        break;
    }
  }

  startAttack(attack, isComboHit = false) {
    const o = this.opp;
    // Which of his hands throws it ('L'/'R', his own sides). Combo punches alternate hands.
    const hand = isComboHit && o.attack ? (o.attack.hand === 'R' ? 'L' : 'R') : this.rng() < 0.5 ? 'L' : 'R';
    attack = { ...attack, hand };
    o.attack = attack;
    if (!isComboHit) o.comboLeft = attack.combo || 0;
    o.progress = 0;
    o.parryTried = false;
    o.leanAtWindup = { ...this.player.lean };
    // Body work wears him down: his punches get slower to come.
    const slow = 1 + Math.min(BODY_SLOW, (o.bodyDmg / o.max) * 1.2);
    this.setOpp('windup', attack.windup * slow);
    this.emit({ type: 'windup', attack });
  }

  strike() {
    const o = this.opp;
    const p = this.player;
    // Dodges: lean back out of range (sway), or lean sideways (slip) — hooks curl around a slip.
    const was = o.leanAtWindup;
    const sway = this.gap > REACH + 0.05 && was.fwd > -LEAN.held;
    const slip = Math.abs(p.lean.side) >= LEAN.slip && Math.abs(was.side) < LEAN.held && o.attack.type !== 'hook';
    if (sway || slip) {
      p.dodges++;
      o.comboLeft = 0;
      this.setOpp('recover', 0.8);
      o.exposed = true;
      this.emit({ type: 'dodge', how: sway ? 'sway' : 'slip', side: Math.sign(p.lean.side), attack: o.attack.type });
      return;
    }
    const blocked = p.guard;
    const chip = o.attack.signature ? SIGNATURE_CHIP : GUARD_CHIP[o.attack.type] ?? 0.3;
    const leaningIn = !blocked && p.lean.fwd >= LEAN.leanInFrom; // walking into a punch hurts more
    const dmg = Math.round(o.attack.damage * (blocked ? chip : 1) * (leaningIn ? LEAN.leanInRisk : 1));
    p.hp = Math.max(0, p.hp - dmg);
    if (!blocked) p.stamina = Math.max(0, p.stamina - STAMINA.hitDrain);
    o.damageDealt += dmg;
    this.setOpp('attack', 0.3);
    this.emit({ type: 'hit', target: 'player', kind: o.attack.type, damage: dmg, blocked, guardBroken: blocked && chip >= 0.35 });
    if (p.hp <= 0) this.knockdown('player');
  }

  pickAttack() {
    const list = this.ai.attacks;
    const total = list.reduce((a, x) => a + x.weight, 0);
    let r = this.rng() * total;
    for (const a of list) {
      r -= a.weight;
      if (r <= 0) return a;
    }
    return list[list.length - 1];
  }

  idleTime(scale = 1) {
    const [lo, hi] = this.ai.idle;
    return (lo + this.rng() * (hi - lo)) * scale;
  }

  // ---------- Knockdowns ----------
  knockdown(who) {
    const boxer = who === 'opp' ? this.opp : this.player;
    boxer.knockdowns++;
    // Each opponent is finished on his own knockdown count (ai.maxKnockdowns).
    // The player is never counted out automatically: he always gets the get-up mini game, just harder each time.
    const final = who === 'opp' && boxer.knockdowns >= (this.ai.maxKnockdowns ?? 3);
    const kd = boxer.knockdowns;
    const H = GETUP_HARDER;
    this.down = {
      who,
      count: 0,
      tick: 0,
      // Player's timing bar (only used when the player is down)
      bar: who === 'player'
        ? this.newBar(Math.min(H.maxSpeed, GETUP.speed * (1 + H.speedPerKd * (kd - 1))), Math.max(H.minZone, GETUP.zone * H.zonePerKd ** (kd - 1)))
        : null,
      hits: 0,
      // 2 stops after the 1st knockdown, 3 after the 2nd … up to 5
      needed: who === 'player' ? Math.min(H.maxNeeded, 1 + kd) : Infinity,
      lockUntil: 0,
      getUpAt: who === 'opp' && !final ? 4 + Math.floor(this.rng() * 4) : Infinity,
      risen: false,
    };
    this.opp.comboLeft = 0;
    this.setPhase('down');
    this.emit({ type: 'knockdown', who, count: boxer.knockdowns });
  }

  newBar(speed, zone) {
    // Keep the green zone away from where the marker starts so the first stop needs real timing
    const center = 0.35 + this.rng() * 0.5;
    return { pos: 0, dir: 1, speed, zone, center };
  }

  // Player punches while knocked down: did the marker stop inside the green?
  getUpTry() {
    const d = this.down;
    if (this.phase !== 'down' || !d || d.who !== 'player' || d.risen || !d.bar) return;
    if (this.time < d.lockUntil || d.needed === Infinity) return;
    const b = d.bar;
    if (Math.abs(b.pos - b.center) <= b.zone / 2) {
      d.hits++;
      this.emit({ type: 'getUpHit', hits: d.hits, needed: d.needed });
      d.bar = this.newBar(Math.min(GETUP_HARDER.maxSpeed * GETUP.speedUp, b.speed * GETUP.speedUp), Math.max(GETUP_HARDER.minZone * GETUP.shrink, b.zone * GETUP.shrink));
      d.lockUntil = this.time + 0.35;
    } else {
      d.lockUntil = this.time + GETUP.missLock;
      this.emit({ type: 'getUpMiss' });
    }
  }

  updateDown(dt) {
    const d = this.down;
    if (d.risen) {
      if (this.phaseTime >= 1.2) {
        this.opp.attackIn = Math.max(this.opp.attackIn, 1.2);
        this.setOpp('idle', 1.2);
        this.setPhase('fight');
      }
      return;
    }
    if (d.bar && this.time >= d.lockUntil) {
      const b = d.bar;
      b.pos += b.dir * b.speed * dt;
      if (b.pos >= 1) { b.pos = 2 - b.pos; b.dir = -1; }
      if (b.pos <= 0) { b.pos = -b.pos; b.dir = 1; }
    }
    d.tick += dt;
    const beat = d.who === 'player' ? GETUP.countBeat : 1; // the ref counts slower over you: time to get up
    if (d.tick >= beat) {
      d.tick -= beat;
      d.count++;
      this.emit({ type: 'count', n: d.count });
      if (d.count >= 10) return this.finish(d.who === 'opp', 'KO');
    }
    const getsUp = d.who === 'player' ? d.hits >= d.needed : d.count >= d.getUpAt;
    if (getsUp) {
      const kd = d.who === 'player' ? this.player.knockdowns : this.opp.knockdowns;
      if (d.who === 'player') this.player.hp = Math.round((this.player.max * Math.max(25, 60 - 12 * (kd - 1))) / 100);
      else this.opp.hp = Math.round(this.opp.max * (0.55 - 0.1 * kd));
      d.risen = true;
      this.phaseTime = 0;
      this.emit({ type: 'getUp', who: d.who });
    }
  }

  // ---------- Rounds & result ----------
  endRound() {
    this.emit({ type: 'bell' });
    if (this.round >= this.rounds) {
      const win = this.player.damageDealt >= this.opp.damageDealt;
      return this.finish(win, 'DECISION');
    }
    this.player.hp = Math.min(this.player.max, this.player.hp + Math.round(this.player.max * 0.1));
    this.player.stamina = this.player.maxStamina;
    this.opp.bodyDmg *= 0.5; // he recovers some between rounds
    this.opp.hp = Math.min(this.opp.max, this.opp.hp + Math.round(this.opp.max * 0.1));
    this.setPhase('break');
    this.emit({ type: 'roundEnd', round: this.round, tip: this.entry.opponent.tip });
  }

  finish(win, method) {
    this.result = { win, method, round: this.round };
    this.setPhase('over');
    this.emit({ type: 'over', ...this.result });
  }

  // ---------- Helpers ----------
  setOpp(state, dur) {
    const o = this.opp;
    o.state = state;
    o.stateTime = 0;
    o.stateDur = dur;
    if (state !== 'windup') o.progress = 0;
    if (state === 'idle' && this.phase === 'fight') {
      // Light-footed opponents sometimes bounce out of punching range for a moment.
      const dance = this.rng() < (this.ai.footwork ?? 0.6) * 0.3 && dur > 0.5;
      o.idleDist = dance ? 1.45 : 1 + this.rng() * 0.08;
    }
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
  }

  emit(e) {
    this.events.push(e);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

// The player's hand that can parry this punch: the opposite of his punching hand (it comes in on that side).
export const parryHand = (attack) => (attack?.hand === 'L' ? 'R' : 'L');

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
