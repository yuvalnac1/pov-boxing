// Gesture detector: turns per-frame hand data into game events.
// Pure logic (no DOM) so it can be unit-tested with synthetic frames.
//
// Events emitted by update():
//   { type: 'STRAIGHT', hand: 'L'|'R', target: 'head'|'body' } // a closed fist driven toward the camera;
//                                         // 'body' when the fist travels clearly lower than the guard
//   { type: 'PALM',     hand: 'L'|'R' }   // the hand opens into a flat palm (✋) — the parry
//   { type: 'GUARD_ON' } / { type: 'GUARD_OFF' }
//
// Punch vs parry is decided by hand shape (fist vs open palm), not by motion, so the two can't be confused.
// All speeds/distances are measured in "hand sizes" so they work at any distance from the camera.

export const DEFAULT_CONFIG = {
  punchWindowMs: 180,     // a punch is size growth within this window…
  punchGrowth: 1.35,      // …of at least this ratio (calibration tunes it)
  lostPunchGrowth: 1.15,  // growth needed if the hand vanished mid-punch (motion blur)
  motionWindowMs: 120,    // window for hand speed (guard stillness, get-up fist pumps)
  palmFrames: 2,          // frames a hand must look open before it counts as a palm
  cooldownMs: 300,        // per hand, after any punch/palm
  guardOnMs: 150,
  guardOffMs: 200,
  guardMaxSpeed: 6,       // hands must be fairly still to count as guard
  guardTolerance: 2.3,    // hand sizes from the calibrated guard position
  historyMs: 500,
  bodyDrop: 0.9,          // hand sizes below the guard height that make a punch a body shot
};

export class GestureDetector {
  constructor(config = {}, calibration = null) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    this.calib = calibration; // { handSize, guardL:{x,y}, guardR:{x,y}, punchGrowth }
    if (calibration?.punchGrowth) this.cfg.punchGrowth = calibration.punchGrowth;
    this.hands = { L: newHandState(), R: newHandState() };
    this.guard = false;
    this.guardCandidateSince = null;
    this.guardLostSince = null;
    this.lastSeenAny = 0;
  }

  setCalibration(calib) {
    this.calib = calib;
    if (calib?.punchGrowth) this.cfg.punchGrowth = calib.punchGrowth;
  }

  // frame = { t, left, right } from HandTracker.detect()
  update(frame) {
    const events = [];
    const { t } = frame;
    this.updateHand('L', frame.left, t, events);
    this.updateHand('R', frame.right, t, events);
    if (frame.left || frame.right) this.lastSeenAny = t;
    this.updateGuard(t, events);
    return events;
  }

  updateHand(id, hand, t, events) {
    const s = this.hands[id];
    const cfg = this.cfg;

    if (!hand) {
      // Hand just vanished: if a fist was clearly accelerating toward the camera, count it as a punch.
      if (s.present && !s.open && t - s.lastEventT > cfg.cooldownMs) {
        const last = s.history[s.history.length - 1];
        const prev = s.history[s.history.length - 2];
        const ratio = growthRatio(s.history, last.t, cfg.punchWindowMs);
        const rising = prev && last.size > prev.size;
        const awayFromEdge = last.cx > 0.05 && last.cx < 0.95 && last.cy > 0.05 && last.cy < 0.95;
        if (ratio >= cfg.lostPunchGrowth && rising && awayFromEdge) {
          events.push({ type: 'STRAIGHT', hand: id, lost: true, ...this.punchHeight(s.history, last.t) });
          s.lastEventT = t;
        }
      }
      s.present = false;
      s.open = false;
      s.openFrames = 0;
      s.history.length = 0;
      s.debug = { ...s.debug, present: false };
      return;
    }

    s.present = true;
    s.history.push({ t, cx: hand.cx, cy: hand.cy, size: hand.size });
    while (s.history.length && t - s.history[0].t > cfg.historyMs) s.history.shift();

    // Hand shape, with hysteresis: open needs ≥3 straight fingers for a couple of frames, closed ≤1.
    const fingers = extendedFingers(hand.landmarks);
    const wasOpen = s.open;
    if (fingers >= 3) s.openFrames++;
    else if (fingers <= 1) s.openFrames = 0;
    s.open = s.openFrames >= cfg.palmFrames ? true : fingers <= 1 ? false : s.open;

    const ref = this.refSize(hand.size);
    const ratio = growthRatio(s.history, t, cfg.punchWindowMs);
    const v = velocity(s.history, t, cfg.motionWindowMs);
    s.debug = { present: true, ratio, vx: v.vx / ref, vy: v.vy / ref, size: hand.size, cx: hand.cx, cy: hand.cy, fingers, open: s.open };

    if (t - s.lastEventT < cfg.cooldownMs) return;

    if (s.open && !wasOpen) {
      events.push({ type: 'PALM', hand: id });
      s.lastEventT = t;
      return;
    }

    // Only a (mostly) closed hand can punch — opening the fingers also grows the hand, so it must not count.
    if (!s.open && fingers <= 1 && ratio >= cfg.punchGrowth) {
      events.push({ type: 'STRAIGHT', hand: id, ...this.punchHeight(s.history, t) });
      s.lastEventT = t;
    }
  }

  updateGuard(t, events) {
    const ok = this.isGuardPose();
    const cfg = this.cfg;
    if (!this.guard) {
      if (ok) {
        this.guardCandidateSince ??= t;
        if (t - this.guardCandidateSince >= cfg.guardOnMs) {
          this.guard = true;
          this.guardLostSince = null;
          events.push({ type: 'GUARD_ON' });
        }
      } else {
        this.guardCandidateSince = null;
      }
    } else {
      if (!ok) {
        this.guardLostSince ??= t;
        if (t - this.guardLostSince >= cfg.guardOffMs) {
          this.guard = false;
          this.guardCandidateSince = null;
          events.push({ type: 'GUARD_OFF' });
        }
      } else {
        this.guardLostSince = null;
      }
    }
  }

  isGuardPose() {
    const L = this.hands.L.debug;
    const R = this.hands.R.debug;
    if (!L?.present || !R?.present) return false;
    const speedOk = (h) => Math.hypot(h.vx, h.vy) < this.cfg.guardMaxSpeed;
    if (!speedOk(L) || !speedOk(R)) return false;

    if (this.calib) {
      const ref = this.calib.handSize;
      const near = (h, g) => Math.hypot(h.cx - g.x, h.cy - g.y) / ref < this.cfg.guardTolerance;
      const sizeOk = (h) => h.size / ref > 0.65 && h.size / ref < 1.5;
      if (near(L, this.calib.guardL) && near(R, this.calib.guardR) && sizeOk(L) && sizeOk(R)) return true;
      // Also accept both fists raised high and close together, even if not exactly where calibrated.
      const raised = (h) => h.cy < Math.min(0.6, Math.max(this.calib.guardL.y, this.calib.guardR.y) + 0.12);
      return raised(L) && raised(R) && Math.abs(R.cx - L.cx) / ref < 3.2 && !L.open && !R.open && sizeOk(L) && sizeOk(R);
    }
    // Uncalibrated fallback: both hands in the upper-middle of the frame, close together.
    return L.cy < 0.65 && R.cy < 0.65 && Math.abs(R.cx - L.cx) < 0.45 && L.cx > 0.15 && R.cx < 0.85;
  }

  // Lowest point (largest y) the fist reached during the punch, compared with the guard height.
  punchHeight(history, t) {
    let cy = 0;
    for (let i = history.length - 1; i >= 0 && t - history[i].t <= this.cfg.punchWindowMs + 60; i--) cy = Math.max(cy, history[i].cy);
    const guardY = this.calib ? (this.calib.guardL.y + this.calib.guardR.y) / 2 : 0.45;
    const ref = this.calib?.handSize || 0.2;
    const drop = (cy - guardY) / ref; // in hand sizes
    return { target: drop >= this.cfg.bodyDrop ? 'body' : 'head', drop };
  }

  refSize(current) {
    return this.calib?.handSize || current || 0.2;
  }

  msSinceHandsSeen(t) {
    return t - this.lastSeenAny;
  }
}

function newHandState() {
  return { present: false, open: false, openFrames: 0, history: [], lastEventT: -Infinity, debug: { present: false } };
}

// How many of the four fingers are straight: fingertip clearly farther from the wrist than the middle joint.
// (3D distance, so a palm tilted toward the camera still reads correctly.) No landmarks → treated as a fist.
const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]];
export function extendedFingers(lm) {
  if (!lm) return 0;
  const w = lm[0];
  const d = (p) => Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z);
  return FINGERS.filter(([tip, pip]) => d(lm[tip]) > d(lm[pip]) * 1.15).length;
}

// Current size divided by the smallest size seen within the window.
export function growthRatio(history, t, windowMs) {
  if (history.length < 2) return 1;
  const cur = history[history.length - 1].size;
  let min = cur;
  for (let i = history.length - 1; i >= 0 && t - history[i].t <= windowMs; i--) {
    if (history[i].size < min) min = history[i].size;
  }
  return cur / min;
}

// Velocity (normalized screen units/sec) from the oldest sample inside the window to now.
function velocity(history, t, windowMs) {
  const cur = history[history.length - 1];
  let old = cur;
  for (let i = history.length - 1; i >= 0 && t - history[i].t <= windowMs; i--) old = history[i];
  const dt = (cur.t - old.t) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return { vx: (cur.cx - old.cx) / dt, vy: (cur.cy - old.cy) / dt };
}
