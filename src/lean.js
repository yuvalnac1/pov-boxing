// Head/body lean from MediaPipe pose (shoulders + head), pure logic so it can be unit-tested.
//
// body = { cx, cy, scale } in mirrored normalized screen space (see tracking.js):
//   cx/cy = head-and-shoulders center, scale = shoulder width blended with eye distance.
// Output: { fwd, side } each in -1..1.
//   fwd  > 0 = leaning toward the camera (stepping in), < 0 = leaning back
//   side > 0 = leaning to the player's right, < 0 = left
//
// The neutral position is learned automatically: call beginNeutral() when the player should be standing
// normally (start of each round) and it averages the next ~0.8s. Before any neutral exists, the first
// frames seed it.

export const LEAN_CONFIG = {
  neutralMs: 800,     // how long beginNeutral() samples
  fwdRange: 0.16,     // body 16% bigger than neutral = full lean in
  sideRange: 0.55,    // moving this many shoulder-widths sideways = full side lean
  deadzone: 0.18,     // small drift around neutral counts as standing still
  smoothing: 14,      // 1/s, exponential smoothing of the output
  lostDecay: 3,       // 1/s, output eases back to 0 when the body isn't seen
};

export class LeanTracker {
  constructor(config = {}) {
    this.cfg = { ...LEAN_CONFIG, ...config };
    this.neutral = null;
    this.sampling = null; // { until, sum, n }
    this.fwd = 0;
    this.side = 0;
    this.lastT = null;
    this.seen = false;
    this.raw = { fwd: 0, side: 0 };
  }

  beginNeutral(t) {
    this.sampling = { until: t + this.cfg.neutralMs, cx: 0, cy: 0, scale: 0, n: 0 };
  }

  update(t, body) {
    const dt = this.lastT == null ? 0 : Math.min(0.1, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    const c = this.cfg;
    if (!body || !(body.scale > 0)) {
      this.seen = false;
      const k = 1 - Math.exp(-c.lostDecay * dt);
      this.fwd -= this.fwd * k;
      this.side -= this.side * k;
      return this.value;
    }
    this.seen = true;

    if (this.sampling || !this.neutral) {
      const s = (this.sampling ??= { until: t + c.neutralMs, cx: 0, cy: 0, scale: 0, n: 0 });
      s.cx += body.cx;
      s.cy += body.cy;
      s.scale += body.scale;
      s.n++;
      if (t >= s.until && s.n > 0) {
        this.neutral = { cx: s.cx / s.n, cy: s.cy / s.n, scale: s.scale / s.n };
        this.sampling = null;
      }
      if (!this.neutral) return this.value;
    }

    const n = this.neutral;
    const rawFwd = (body.scale / n.scale - 1) / c.fwdRange;
    const rawSide = (body.cx - n.cx) / (n.scale * c.sideRange);
    this.raw = { fwd: rawFwd, side: rawSide };
    const tf = shape(rawFwd, c.deadzone);
    const ts = shape(rawSide, c.deadzone);
    const k = dt === 0 ? 1 : 1 - Math.exp(-c.smoothing * dt);
    this.fwd += (tf - this.fwd) * k;
    this.side += (ts - this.side) * k;
    return this.value;
  }

  get value() {
    return { fwd: this.fwd, side: this.side };
  }
}

// Dead zone around 0, then linear to ±1.
function shape(v, dz) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

// Pose landmarks (33, normalized, already mirrored) → body sample, or null if the shoulders aren't visible.
// 0 = nose, 2/5 = eyes, 11/12 = shoulders.
export function bodyFromPose(lm) {
  if (!lm || lm.length < 13) return null;
  const vis = (i) => lm[i].visibility ?? 1;
  if (vis(11) < 0.4 || vis(12) < 0.4) return null;
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const shoulders = d(11, 12);
  if (shoulders < 0.02) return null;
  // Eyes move more than shoulders when the head leans in; blend both (eye distance ≈ 0.28 × shoulders).
  const eyesOk = vis(2) > 0.5 && vis(5) > 0.5;
  const scale = eyesOk ? shoulders * 0.6 + (d(2, 5) / 0.28) * 0.4 : shoulders;
  const midX = (lm[11].x + lm[12].x) / 2;
  const midY = (lm[11].y + lm[12].y) / 2;
  const headOk = vis(0) > 0.5;
  return {
    cx: headOk ? midX * 0.5 + lm[0].x * 0.5 : midX,
    cy: headOk ? midY * 0.5 + lm[0].y * 0.5 : midY,
    scale,
  };
}
