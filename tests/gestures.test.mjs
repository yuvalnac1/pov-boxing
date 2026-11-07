// Run: node --test Game2-POV-Boxing/tests/gestures.test.mjs
// Feeds synthetic 30fps hand data into the detector and checks the emitted events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureDetector, extendedFingers } from '../src/gestures.js';
import { Calibration } from '../src/calibration.js';

const DT = 1000 / 30;
const GUARD = { L: { cx: 0.42, cy: 0.4, size: 0.2 }, R: { cx: 0.58, cy: 0.4, size: 0.2 } };

function run(detector, frames) {
  const events = [];
  frames.forEach((f, i) => events.push(...detector.update({ t: i * DT, ...f })));
  return events;
}
const hold = (n, left, right) => Array.from({ length: n }, () => ({ left, right }));
const types = (events) => events.map((e) => e.type + (e.hand ? `_${e.hand}` : ''));

test('holding fists up turns guard on, dropping them turns it off', () => {
  const d = new GestureDetector();
  const ev = run(d, [...hold(10, GUARD.L, GUARD.R), ...hold(10, { cx: 0.3, cy: 0.85, size: 0.2 }, { cx: 0.7, cy: 0.85, size: 0.2 })]);
  assert.deepEqual(types(ev), ['GUARD_ON', 'GUARD_OFF']);
});

test('a hand growing fast is a straight punch, once', () => {
  const d = new GestureDetector();
  const sizes = [0.2, 0.2, 0.2, 0.23, 0.27, 0.31, 0.33, 0.33, 0.3, 0.25, 0.2, 0.2];
  const frames = sizes.map((s) => ({ left: null, right: { cx: 0.6, cy: 0.45, size: s } }));
  assert.deepEqual(types(run(d, frames)), ['STRAIGHT_R']);
});

test('a slow approach toward the camera is not a punch', () => {
  const d = new GestureDetector();
  const frames = Array.from({ length: 60 }, (_, i) => ({ left: { cx: 0.4, cy: 0.5, size: 0.2 + i * 0.002 }, right: null }));
  assert.deepEqual(types(run(d, frames)), []);
});

test('hand vanishing while accelerating forward counts as a punch', () => {
  const d = new GestureDetector();
  const frames = [0.2, 0.2, 0.2, 0.22, 0.25].map((s) => ({ left: { cx: 0.4, cy: 0.45, size: s }, right: null }));
  frames.push({ left: null, right: null });
  const ev = run(d, frames);
  assert.deepEqual(types(ev), ['STRAIGHT_L']);
  assert.equal(ev[0].lost, true);
});

test('hand leaving the frame at the edge is not a punch', () => {
  const d = new GestureDetector();
  const frames = [0.2, 0.2, 0.22, 0.25].map((s) => ({ left: { cx: 0.02, cy: 0.45, size: s }, right: null }));
  frames.push({ left: null, right: null });
  assert.deepEqual(types(run(d, frames)), []);
});

// Synthetic 21-point hand: wrist at (0.5, 0.6); fingers point up. Open = tips past the middle joints.
function handLandmarks(open) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6, z: 0 }));
  [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach(([mcp, pip, dip, tip], f) => {
    const x = 0.47 + f * 0.02;
    lm[mcp] = { x, y: 0.52, z: 0 };
    lm[pip] = { x, y: 0.48, z: 0 };
    lm[dip] = { x, y: open ? 0.44 : 0.5, z: 0 };
    lm[tip] = { x, y: open ? 0.4 : 0.53, z: 0 };
  });
  return lm;
}
const fist = (extra = {}) => ({ cx: 0.6, cy: 0.45, size: 0.2, landmarks: handLandmarks(false), ...extra });
const palm = (extra = {}) => ({ cx: 0.6, cy: 0.45, size: 0.2, landmarks: handLandmarks(true), ...extra });

test('extendedFingers tells an open palm from a fist', () => {
  assert.equal(extendedFingers(handLandmarks(true)), 4);
  assert.equal(extendedFingers(handLandmarks(false)), 0);
});

test('opening the hand into a palm is a parry, once', () => {
  const d = new GestureDetector();
  const frames = [...hold(4, null, fist()), ...hold(8, null, palm())];
  assert.deepEqual(types(run(d, frames)), ['PALM_R']);
});

test('an open palm pushed toward the camera is not a punch', () => {
  const d = new GestureDetector();
  const sizes = [0.2, 0.2, 0.2, 0.23, 0.27, 0.31, 0.33];
  const frames = [...hold(4, null, palm()), ...sizes.map((size) => ({ left: null, right: palm({ size }) }))];
  assert.deepEqual(types(run(d, frames)), ['PALM_R']);
});

test('a fist punch is never a parry', () => {
  const d = new GestureDetector();
  const sizes = [0.2, 0.2, 0.2, 0.23, 0.27, 0.31, 0.33, 0.3, 0.25, 0.2];
  const frames = sizes.map((size) => ({ left: null, right: fist({ size, cx: 0.6 - (size - 0.2) }) }));
  assert.deepEqual(types(run(d, frames)), ['STRAIGHT_R']);
});

test('calibrated detector uses the learned punch threshold and guard position', () => {
  const calib = { handSize: 0.1, guardL: { x: 0.45, y: 0.35 }, guardR: { x: 0.55, y: 0.35 }, punchGrowth: 1.2 };
  const d = new GestureDetector({}, calib);
  // Guard at the calibrated spot (smaller hands = player further away).
  const L = { cx: 0.45, cy: 0.35, size: 0.1 };
  const R = { cx: 0.55, cy: 0.35, size: 0.1 };
  const ev = run(d, [...hold(8, L, R), { left: L, right: R }, { left: L, right: { ...R, size: 0.11 } }, { left: L, right: { ...R, size: 0.125 } }]);
  assert.deepEqual(types(ev), ['GUARD_ON', 'STRAIGHT_R']);
});

test('calibration learns guard data and a punch threshold from two punches', () => {
  const d = new GestureDetector();
  const c = new Calibration();
  let t = 0;
  const step = (left, right) => {
    d.update({ t, left, right });
    const s = c.update(t, d.hands);
    t += DT;
    return s;
  };
  let s;
  for (let i = 0; i < 70; i++) s = step(GUARD.L, GUARD.R);
  assert.equal(s.phase, 'punch');
  const punch = [0.2, 0.24, 0.28, 0.3, 0.3, 0.25, 0.2, 0.2, 0.2, 0.2];
  for (const sz of punch) s = step({ ...GUARD.L, size: sz }, GUARD.R);
  for (const sz of punch) s = step(GUARD.L, { ...GUARD.R, size: sz });
  assert.equal(s.phase, 'done');
  assert.ok(Math.abs(s.result.handSize - 0.2) < 0.01);
  assert.ok(s.result.punchGrowth > 1.18 && s.result.punchGrowth < 1.4, `punchGrowth ${s.result.punchGrowth}`);
});

test('a punch at guard height is a head shot, a low punch is a body shot', () => {
  const sizes = [0.2, 0.2, 0.2, 0.23, 0.27, 0.31, 0.33, 0.33, 0.3, 0.25, 0.2, 0.2];
  const head = run(new GestureDetector(), sizes.map((s) => ({ left: null, right: { cx: 0.6, cy: 0.45, size: s } })));
  assert.equal(head.find((e) => e.type === 'STRAIGHT').target, 'head');
  const body = run(new GestureDetector(), sizes.map((s, i) => ({ left: null, right: { cx: 0.6, cy: 0.45 + Math.min(i, 5) * 0.06, size: s } })));
  assert.equal(body.find((e) => e.type === 'STRAIGHT').target, 'body');
});
