// 30-second tutorial: three drills with the coach — punch, guard, parry (+ counter).
// Same shape as Fight (opp state, events, punch/parry/setGuard/update), so the game reuses its
// input handling, opponent animation and hit effects. Nobody takes damage here.

export const TRAINER = {
  name: 'Coach Mo',
  nickname: 'Coach',
  look: {
    skin: '#c68a5e', trunks: '#4a4f5c', trim: '#f2c14a', gloves: '#f2c14a', shoes: '#2a2a30',
    hair: 'buzz', hairColor: '#9a9a9a', beard: 'short', beardColor: '#9a9a9a', brows: 'thick',
    height: 1.0, width: 1.1, belly: 1.1,
  },
};

export const STEPS = [
  { id: 'punch', title: 'PUNCH!', text: 'Punch straight at the camera. Hit the coach 3 times!', need: 3 },
  { id: 'guard', title: 'GUARD!', text: 'When his fist glows, put both fists up in front of your face.', need: 2 },
  { id: 'parry', title: 'PARRY!', text: 'When he throws, open the hand on the side his punch comes from ✋ (his right → your left) to knock it away.', need: 1 },
  { id: 'counter', title: 'COUNTER!', text: "He's dizzy — punch him now for double damage! 2 punches.", need: 2 },
];

const WINDUP = 1.7;
const WAIT = 1.3;
const PARRY_FROM = 0.35;
const JAB = { type: 'jab', windup: WINDUP, damage: 0, hand: 'R' }; // his right hand → parry with your left

export class Tutorial {
  constructor() {
    this.events = [];
    this.step = 0;
    this.count = 0;
    this.done = false;
    this.phase = 'fight';
    this.time = 0;
    this.advanceIn = null;
    // Fields the HUD/animation code reads from a Fight
    this.round = 1;
    this.roundTime = 60;
    this.down = null;
    this.result = null;
    this.player = { hp: 100, max: 100, knockdowns: 0, guard: false, punches: 0, landed: 0, parries: 0 };
    this.opp = { hp: 100, max: 100, knockdowns: 0, state: 'idle', stateTime: 0, stateDur: WAIT, attack: null, progress: 0 };
  }

  get current() {
    return STEPS[this.step];
  }

  info() {
    return { index: this.step, total: STEPS.length, ...this.current, count: this.count };
  }

  setGuard(on) {
    this.player.guard = on;
  }

  punch(kind = 'straight', hand = 'R') {
    if (this.advanceIn != null || this.done) return; // between drills
    const id = this.current?.id;
    const o = this.opp;
    if (id === 'punch' || (id === 'counter' && o.state === 'stunned')) {
      this.emit({ type: 'hit', target: 'opp', kind, hand, damage: 0, crit: id === 'counter' });
      if (id === 'punch') this.setOpp('hit', 0.3);
      this.progress();
    } else if (id === 'guard' || id === 'parry') {
      this.emit({ type: 'hint', text: id === 'guard' ? 'Guard up — no punching yet!' : 'Open palm ✋, don\'t punch!' });
    }
  }

  parry(hand = 'R') {
    if (this.advanceIn != null || this.done) return;
    const id = this.current?.id;
    const o = this.opp;
    if (id === 'parry') {
      if (o.state !== 'windup') return this.emit({ type: 'hint', text: 'Wait for the glow…' });
      if (o.progress < PARRY_FROM) return this.emit({ type: 'tooEarly', hand });
      if (hand !== 'L') return this.emit({ type: 'wrongHand', hand, needed: 'L' });
      this.player.parries++;
      this.setOpp('stunned', Infinity);
      this.emit({ type: 'parry', hand, attack: 'jab' });
      this.progress();
    }
  }

  update(dt) {
    this.time += dt;
    if (this.advanceIn != null) {
      this.advanceIn -= dt;
      if (this.advanceIn <= 0) this.nextStep();
      return;
    }
    const o = this.opp;
    o.stateTime += dt;
    if (o.state === 'windup') o.progress = Math.min(1, o.stateTime / o.stateDur);
    if (o.stateTime < o.stateDur) return;

    const attacking = ['guard', 'parry'].includes(this.current?.id);
    if (o.state === 'windup') return this.strike();
    if (o.state === 'idle' && attacking) {
      o.attack = JAB;
      this.setOpp('windup', WINDUP);
      this.emit({ type: 'windup', attack: JAB });
      return;
    }
    if (o.state !== 'stunned') this.setOpp('idle', WAIT);
  }

  strike() {
    const blocked = this.player.guard;
    this.setOpp('attack', 0.3);
    this.emit({ type: 'hit', target: 'player', kind: 'jab', damage: 0, blocked });
    if (this.current.id === 'guard') {
      if (blocked) this.progress();
      else this.emit({ type: 'hint', text: 'Fists up in front of your face!' });
    } else {
      this.emit({ type: 'hint', text: 'Show your open palm ✋ while his fist glows!' });
    }
  }

  progress() {
    this.count++;
    if (this.count >= this.current.need) {
      this.emit({ type: 'stepDone', step: this.current.id });
      this.advanceIn = 1.1;
    }
  }

  nextStep() {
    this.advanceIn = null;
    this.count = 0;
    // The counter drill follows the parry directly, so the coach stays dizzy.
    if (this.current.id !== 'parry') this.setOpp('idle', WAIT);
    this.step++;
    if (this.step >= STEPS.length) {
      this.done = true;
      this.setOpp('idle', Infinity);
      this.emit({ type: 'tutorialDone' });
    } else {
      this.emit({ type: 'step', step: this.current.id });
    }
  }

  setOpp(state, dur) {
    const o = this.opp;
    o.state = state;
    o.stateTime = 0;
    o.stateDur = dur;
    if (state !== 'windup') o.progress = 0;
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
