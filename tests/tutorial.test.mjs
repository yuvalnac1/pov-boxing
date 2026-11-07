// Run: node --test tests/tutorial.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tutorial } from '../src/tutorial.js';

const STEP = 1 / 30;
function runUntil(t, pred, maxSec = 20) {
  for (let s = 0; s < maxSec && !pred(t); s += STEP) t.update(STEP);
}
const types = (t) => t.drainEvents().map((e) => e.type);

test('the full tutorial: punch ×3, block ×2, parry, counter ×2', () => {
  const t = new Tutorial();
  for (let i = 0; i < 3; i++) t.punch();
  runUntil(t, (x) => x.current?.id === 'guard');
  assert.equal(t.current.id, 'guard');

  t.setGuard(true);
  runUntil(t, (x) => x.current?.id === 'parry');
  assert.equal(t.current.id, 'parry');
  t.setGuard(false);

  runUntil(t, (x) => x.opp.state === 'windup' && x.opp.progress > 0.5);
  t.parry('L');
  assert.equal(t.opp.state, 'stunned');
  runUntil(t, (x) => x.current?.id === 'counter');
  assert.equal(t.opp.state, 'stunned', 'coach stays dizzy into the counter drill');

  t.punch();
  t.punch();
  runUntil(t, (x) => x.done);
  assert.equal(t.done, true);
  assert.ok(types(t).includes('tutorialDone'));
});

test('getting hit in the guard drill does not count and gives a hint', () => {
  const t = new Tutorial();
  for (let i = 0; i < 3; i++) t.punch();
  runUntil(t, (x) => x.current?.id === 'guard');
  t.drainEvents();
  runUntil(t, (x) => x.opp.state === 'attack');
  assert.equal(t.count, 0);
  assert.ok(types(t).includes('hint'));
});

test('an open palm too early in the parry drill does not parry', () => {
  const t = new Tutorial();
  t.step = 2;
  runUntil(t, (x) => x.opp.state === 'windup');
  t.parry('R');
  assert.equal(t.opp.state, 'windup');
});

test('extra punches between drills are ignored', () => {
  const t = new Tutorial();
  for (let i = 0; i < 6; i++) t.punch();
  assert.equal(t.count, 3);
  runUntil(t, (x) => x.current?.id === 'guard');
  assert.equal(t.count, 0);
});
