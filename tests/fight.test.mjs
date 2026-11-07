// Run: node --test tests/fight.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fight } from '../src/fight.js';
import { CAREER } from '../src/opponents.js';

const STEP = 1 / 30;
const neverBlock = () => 0.99; // rng that never triggers blocks/interrupt rolls below 0.99

function startedFight(entry = CAREER[0], rng = neverBlock) {
  const f = new Fight(entry, { rng });
  while (f.phase === 'intro') f.update(STEP);
  f.drainEvents();
  return f;
}
function runUntil(f, pred, maxSec = 20, input) {
  for (let t = 0; t < maxSec && !pred(f); t += STEP) f.update(STEP, input);
}

test('fight starts after the intro with a bell', () => {
  const f = new Fight(CAREER[0], { rng: neverBlock });
  runUntil(f, (x) => x.phase === 'fight');
  assert.equal(f.phase, 'fight');
  assert.ok(f.drainEvents().some((e) => e.type === 'bell'));
});

test('opponent winds up and hits an unguarded player', () => {
  const f = startedFight();
  runUntil(f, (x) => x.opp.state === 'attack');
  assert.equal(f.player.hp, 100 - f.opp.attack.damage);
});

test('guard stops most of a jab', () => {
  const entry = structuredClone(CAREER[0]);
  entry.opponent.ai.attacks = [{ type: 'jab', windup: 0.8, damage: 10, weight: 1 }];
  const f = startedFight(entry);
  f.setGuard(true);
  runUntil(f, (x) => x.opp.state === 'attack');
  assert.ok(f.player.hp >= 98);
});

test('open palm right before impact parries and stuns; punches then do 1.5x damage', () => {
  const f = startedFight();
  runUntil(f, (x) => x.opp.state === 'windup' && x.opp.stateDur - x.opp.stateTime <= 0.25);
  f.parry('L');
  assert.equal(f.opp.state, 'stunned');
  const hp = f.opp.hp;
  f.punch('straight', 'R');
  assert.equal(hp - f.opp.hp, 9);
});

test('open palm too early in the wind-up does not parry', () => {
  const f = startedFight();
  runUntil(f, (x) => x.opp.state === 'windup');
  f.parry('L');
  assert.equal(f.opp.state, 'windup');
});

test('open palm when the opponent is not attacking does nothing', () => {
  const f = startedFight();
  const hp = f.opp.hp;
  f.parry('R');
  assert.equal(f.opp.hp, hp);
  assert.equal(f.opp.state, 'idle');
});

test('spamming punches gets blocked and countered', () => {
  const f = startedFight();
  for (let i = 0; i < 10; i++) f.punch('straight', i % 2 ? 'L' : 'R');
  assert.ok(f.drainEvents().some((e) => e.type === 'spamPunished'));
  assert.equal(f.opp.state, 'block');
});

test('each opponent is finished on his own knockdown count (Rusty 2, El Toro and King 4)', () => {
  assert.deepEqual(CAREER.map((e) => e.opponent.ai.maxKnockdowns), [2, 3, 3, 4, 4]);
});

test('knocking Rusty down twice wins by KO', () => {
  const f = startedFight();
  for (let kd = 0; kd < 2; kd++) {
    while (f.phase === 'fight') {
      f.opp.state = 'idle';
      f.opp.dist = 1;
      f.spam.count = 0;
      f.punch('straight');
    }
    assert.equal(f.phase, 'down');
    runUntil(f, (x) => x.phase !== 'down', 15);
  }
  assert.equal(f.result?.win, true);
  assert.equal(f.result?.method, 'KO');
});

test('knocked-down player gets up by stopping the marker in the green zone', () => {
  const f = startedFight();
  f.player.hp = 1;
  runUntil(f, (x) => x.phase === 'down');
  assert.equal(f.down.who, 'player');
  // a miss: marker far from the zone
  runUntil(f, (x) => Math.abs(x.down.bar.pos - x.down.bar.center) > x.down.bar.zone, 3);
  f.getUpTry();
  assert.equal(f.down.hits, 0);
  for (let i = 0; i < f.down.needed; i++) {
    runUntil(f, (x) => x.time >= x.down.lockUntil && Math.abs(x.down.bar.pos - x.down.bar.center) < x.down.bar.zone / 4, 5);
    f.getUpTry();
  }
  runUntil(f, (x) => x.phase === 'fight', 3);
  assert.equal(f.phase, 'fight');
  assert.ok(f.player.hp >= 25);
});

test('knocked-down player who does nothing loses by KO', () => {
  const f = startedFight();
  f.player.hp = 1;
  runUntil(f, (x) => x.phase === 'over', 20);
  assert.deepEqual([f.result.win, f.result.method], [false, 'KO']);
});

test('after 3 rounds the fight goes to a decision', () => {
  const f = new Fight(CAREER[0], { rng: neverBlock, roundLength: 2 });
  f.setGuard(true);
  runUntil(f, (x) => x.phase === 'over', 60);
  assert.equal(f.result.method, 'DECISION');
  assert.equal(f.round, 3);
});

test('feints punish an eager parry', () => {
  const champ = structuredClone(CAREER[4]);
  champ.opponent.ai.attacks = [{ type: 'jab', windup: 0.6, damage: 0, weight: 1, feint: true }];
  const f = startedFight(champ);
  runUntil(f, (x) => x.opp.state === 'windup' && x.opp.progress > 0.5);
  f.parry('L');
  assert.ok(f.drainEvents().some((e) => e.type === 'parryWhiff'));
  assert.equal(f.opp.attack.feint, undefined);
});

test('punches from out of range miss', () => {
  const f = startedFight();
  f.opp.dist = 1.5;
  const hp = f.opp.hp;
  f.punch('straight', 'R');
  assert.equal(f.opp.hp, hp);
  assert.ok(f.drainEvents().some((e) => e.type === 'miss'));
});

test('an uppercut splits the guard for more chip damage than a jab', () => {
  const entry = structuredClone(CAREER[0]);
  entry.opponent.ai.attacks = [{ type: 'uppercut', windup: 0.6, damage: 20, weight: 1 }];
  const f = startedFight(entry);
  f.setGuard(true);
  runUntil(f, (x) => x.opp.state === 'attack');
  assert.equal(f.player.hp, 100 - 7);
});

test('one parry try per punch: an early palm wastes it', () => {
  const f = startedFight();
  runUntil(f, (x) => x.opp.state === 'windup');
  f.parry('L'); // too early
  runUntil(f, (x) => x.opp.stateDur - x.opp.stateTime <= 0.2);
  f.parry('L'); // perfect timing, but the try is used up
  assert.equal(f.opp.state, 'windup');
});

test('your punches do not stop him from attacking', () => {
  const f = startedFight();
  let attacks = 0;
  for (let t = 0; t < 8; t += STEP) {
    if (Math.round(t * 30) % 30 === 0 && f.player.stamina >= 10) f.punch('straight', 'R', 'body');
    f.update(STEP);
    attacks += f.drainEvents().filter((e) => e.type === 'windup').length;
  }
  assert.ok(attacks >= 3, `only ${attacks} attacks in 8s`);
});

test('a lean you were already holding does not dodge', () => {
  const f = startedFight(jabOnly());
  f.setLean(0, 0.9);
  runUntil(f, (x) => x.opp.state === 'attack' || x.opp.state === 'recover');
  assert.equal(f.player.hp, 90);
});

test('the opponent moves around the ring during a fight', () => {
  const f = startedFight(CAREER[3]);
  f.setGuard(true);
  const a0 = f.opp.angle;
  runUntil(f, () => false, 4);
  assert.notEqual(f.opp.angle, a0);
});

const jabOnly = (type = 'jab') => {
  const e = structuredClone(CAREER[0]);
  e.opponent.ai.attacks = [{ type, windup: 0.8, damage: 10, weight: 1 }];
  return e;
};

test('punching costs stamina; an empty tank throws weak punches; it refills when you rest', () => {
  const f = startedFight();
  for (let i = 0; i < 10; i++) {
    f.opp.state = 'idle';
    f.spam.count = 0;
    f.punch('straight', 'R');
  }
  assert.equal(f.player.stamina, 0);
  const hp = f.opp.hp;
  f.opp.state = 'idle';
  f.drainEvents();
  f.punch('straight', 'R');
  assert.equal(hp - f.opp.hp, 3);
  assert.ok(f.drainEvents().some((e) => e.type === 'tired'));
  f.setGuard(true); // stay safe while resting
  runUntil(f, () => false, 6);
  assert.ok(f.player.stamina > 60);
});

test('body shots go under a high block; head shots do not', () => {
  const f = startedFight();
  f.setOpp('block', 5);
  const hp = f.opp.hp;
  f.punch('straight', 'R', 'head');
  assert.equal(f.opp.hp, hp);
  f.setOpp('block', 5);
  f.punch('straight', 'R', 'body');
  assert.equal(hp - f.opp.hp, 4);
});

test('body damage slows his wind-ups', () => {
  const f = startedFight(jabOnly());
  f.opp.bodyDmg = f.opp.max;
  f.startAttack(f.ai.attacks[0]);
  assert.ok(f.opp.stateDur > 0.8 * 1.15);
});

test('leaning back sways out of a punch and leaves him open to a counter', () => {
  const f = startedFight(jabOnly());
  runUntil(f, (x) => x.opp.state === 'windup');
  f.setLean(-1, 0);
  runUntil(f, (x) => x.opp.state === 'recover');
  assert.equal(f.player.hp, 100);
  assert.ok(f.drainEvents().some((e) => e.type === 'dodge' && e.how === 'sway'));
  f.setLean(1, 0); // step in to counter
  const hp = f.opp.hp;
  f.punch('straight', 'R');
  assert.equal(hp - f.opp.hp, 7.5);
});

test('slipping sideways dodges a jab but a hook catches you', () => {
  const a = startedFight(jabOnly('jab'));
  runUntil(a, (x) => x.opp.state === 'windup');
  a.setLean(0, 0.8);
  runUntil(a, (x) => x.opp.state === 'recover');
  assert.equal(a.player.hp, 100);
  const b = startedFight(jabOnly('hook'));
  runUntil(b, (x) => x.opp.state === 'windup');
  b.setLean(0, 0.8);
  runUntil(b, (x) => x.opp.state === 'attack');
  assert.equal(b.player.hp, 90);
});

test('leaning in reaches an opponent who danced out, but walking into a punch hurts more', () => {
  const f = startedFight(jabOnly());
  f.opp.dist = 1.4;
  f.setLean(1, 0);
  const hp = f.opp.hp;
  f.punch('straight', 'R');
  assert.ok(f.opp.hp < hp);
  runUntil(f, (x) => x.opp.state === 'attack');
  assert.equal(f.player.hp, 100 - 13);
});

test('the player is never counted out automatically: 5th knockdown still gets the mini game, harder', () => {
  const f = startedFight();
  const bars = [];
  for (let k = 1; k <= 5; k++) {
    f.player.hp = 0;
    f.knockdown('player');
    assert.equal(f.phase, 'down');
    assert.ok(Number.isFinite(f.down.needed));
    bars.push({ needed: f.down.needed, speed: f.down.bar.speed, zone: f.down.bar.zone });
    for (let i = 0; i < f.down.needed; i++) {
      runUntil(f, (x) => x.time >= x.down.lockUntil && Math.abs(x.down.bar.pos - x.down.bar.center) < x.down.bar.zone / 4, 5);
      f.getUpTry();
    }
    runUntil(f, (x) => x.phase === 'fight', 3);
    assert.equal(f.phase, 'fight', `got up from knockdown ${k}`);
  }
  for (let k = 1; k < bars.length; k++) {
    assert.ok(bars[k].needed >= bars[k - 1].needed && bars[k].speed > bars[k - 1].speed && bars[k].zone < bars[k - 1].zone, `knockdown ${k + 1} is harder`);
  }
});

test('upgrades: power hits harder, health and stamina raise the max', () => {
  const base = startedFight();
  const up = new Fight(CAREER[0], { rng: neverBlock, upgrades: { power: 2, health: 1, stamina: 3 } });
  while (up.phase === 'intro') up.update(STEP);
  assert.equal(up.player.max, 105);
  assert.equal(up.player.hp, 105);
  assert.equal(up.player.maxStamina, 115);
  base.punch('straight', 'R', 'head');
  up.punch('straight', 'R', 'head');
  assert.ok(up.player.damageDealt > base.player.damageDealt * 1.08);
});

test('parry only works with the hand in front of the punch (his right → your left)', () => {
  const f = startedFight();
  runUntil(f, (x) => x.opp.state === 'windup' && x.opp.stateDur - x.opp.stateTime <= 0.25);
  assert.equal(f.opp.attack.hand, 'R');
  f.parry('R'); // same side as his punching hand: wrong
  assert.ok(f.drainEvents().some((e) => e.type === 'wrongHand' && e.needed === 'L'));
  assert.equal(f.opp.state, 'windup');
  f.parry('L'); // the try is used up
  assert.equal(f.opp.state, 'windup');

  const g = startedFight(CAREER[0], () => 0.4); // rng < 0.5 → he punches with his left
  runUntil(g, (x) => x.opp.state === 'windup' && x.opp.stateDur - x.opp.stateTime <= 0.25);
  assert.equal(g.opp.attack.hand, 'L');
  g.parry('R');
  assert.equal(g.opp.state, 'stunned');
});

test('combo punches alternate hands', () => {
  const f = startedFight(CAREER[1]);
  f.startAttack({ type: 'jab', windup: 0.3, damage: 5, combo: 1 });
  const first = f.opp.attack.hand;
  runUntil(f, (x) => x.opp.state === 'windup' && x.opp.comboLeft === 0, 3);
  assert.notEqual(f.opp.attack.hand, first);
});
