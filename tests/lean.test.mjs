// Run: node --test tests/lean.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LeanTracker, bodyFromPose } from '../src/lean.js';

const DT = 1000 / 30;
function feed(tr, n, body, t0 = 0) {
  let t = t0;
  for (let i = 0; i < n; i++) tr.update((t += DT), body);
  return t;
}
const NEUTRAL = { cx: 0.5, cy: 0.5, scale: 0.3 };

test('standing still reads as no lean', () => {
  const tr = new LeanTracker();
  feed(tr, 60, NEUTRAL);
  assert.deepEqual(tr.value, { fwd: 0, side: 0 });
});

test('getting bigger is leaning in, smaller is leaning back', () => {
  const tr = new LeanTracker();
  const t = feed(tr, 40, NEUTRAL);
  feed(tr, 30, { ...NEUTRAL, scale: 0.3 * 1.2 }, t);
  assert.ok(tr.value.fwd > 0.8);
  feed(tr, 30, { ...NEUTRAL, scale: 0.3 * 0.82 }, t + 2000);
  assert.ok(tr.value.fwd < -0.8);
});

test('moving sideways is a side lean, small drift is ignored', () => {
  const tr = new LeanTracker();
  const t = feed(tr, 40, NEUTRAL);
  feed(tr, 30, { ...NEUTRAL, cx: 0.51 }, t);
  assert.equal(tr.value.side, 0);
  feed(tr, 30, { ...NEUTRAL, cx: 0.5 - 0.3 * 0.6 }, t + 2000);
  assert.ok(tr.value.side < -0.8);
});

test('re-learning neutral absorbs where the player now stands', () => {
  const tr = new LeanTracker();
  let t = feed(tr, 40, NEUTRAL);
  const moved = { ...NEUTRAL, cx: 0.65, scale: 0.34 };
  tr.beginNeutral(t);
  t = feed(tr, 40, moved, t);
  t = feed(tr, 20, moved, t);
  assert.ok(Math.abs(tr.value.fwd) < 0.01 && Math.abs(tr.value.side) < 0.01);
});

test('losing the body eases the lean back to zero', () => {
  const tr = new LeanTracker();
  const t = feed(tr, 40, NEUTRAL);
  feed(tr, 30, { ...NEUTRAL, scale: 0.4 }, t);
  feed(tr, 90, null, t + 1000);
  assert.ok(Math.abs(tr.value.fwd) < 0.05);
});

test('bodyFromPose needs visible shoulders', () => {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  lm[11] = { x: 0.65, y: 0.7, visibility: 0.9 };
  lm[12] = { x: 0.35, y: 0.7, visibility: 0.9 };
  lm[2] = { x: 0.46, y: 0.4, visibility: 0.9 };
  lm[5] = { x: 0.54, y: 0.4, visibility: 0.9 };
  assert.ok(bodyFromPose(lm).scale > 0.2);
  lm[11].visibility = 0.1;
  assert.equal(bodyFromPose(lm), null);
});
