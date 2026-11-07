// Two-step calibration: hold your guard (learns hand size + guard position),
// then throw a punch with each hand (learns how much your hand grows when you punch).

const STORAGE_KEY = 'povboxing.calibration.v2'; // v2: palm-based hand size
const GUARD_HOLD_MS = 2000;
const PUNCH_TIMEOUT_MS = 15000;
const PEAK_START = 1.12; // ratio at which we start tracking a punch peak
const PEAK_END = 1.05;   // ratio at which the punch is considered finished

export function loadCalibration() {
  try {
    const c = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return c && c.handSize && c.guardL && c.guardR ? c : null;
  } catch {
    return null;
  }
}

export function saveCalibration(c) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable: calibration just lasts for this session */
  }
}

export class Calibration {
  constructor() {
    this.phase = 'guard';
    this.held = 0;
    this.samples = [];
    this.lastT = null;
    this.peaks = { L: null, R: null };
    this.tracking = { L: null, R: null };
    this.punchStart = null;
    this.result = null;
  }

  // hands = detector.hands (uses each hand's debug: present, cx, cy, size, vx, vy, ratio)
  update(t, hands) {
    const dt = this.lastT == null ? 0 : t - this.lastT;
    this.lastT = t;
    if (this.phase === 'guard') this.updateGuard(t, dt, hands);
    else if (this.phase === 'punch') this.updatePunch(t, hands);
    return this.status();
  }

  updateGuard(t, dt, hands) {
    const L = hands.L.debug;
    const R = hands.R.debug;
    const still = (h) => h.present && Math.hypot(h.vx, h.vy) < 3;
    if (still(L) && still(R)) {
      this.held += dt;
      this.samples.push({ L: { ...L }, R: { ...R } });
    } else {
      this.held = Math.max(0, this.held - dt * 2);
      if (this.held === 0) this.samples.length = 0;
    }
    if (this.held >= GUARD_HOLD_MS && this.samples.length > 5) {
      const avg = (f) => this.samples.reduce((a, s) => a + f(s), 0) / this.samples.length;
      this.guardData = {
        handSize: avg((s) => (s.L.size + s.R.size) / 2),
        guardL: { x: avg((s) => s.L.cx), y: avg((s) => s.L.cy) },
        guardR: { x: avg((s) => s.R.cx), y: avg((s) => s.R.cy) },
      };
      this.phase = 'punch';
      this.punchStart = t;
    }
  }

  updatePunch(t, hands) {
    for (const id of ['L', 'R']) {
      const h = hands[id].debug;
      const tr = this.tracking[id];
      if (!h.present) {
        // Lost tracking mid-punch counts as a big punch.
        if (tr) this.recordPeak(id, Math.max(tr.peak, 1.3));
        this.tracking[id] = null;
        continue;
      }
      if (!tr && h.ratio >= PEAK_START) this.tracking[id] = { peak: h.ratio, since: t };
      else if (tr) {
        tr.peak = Math.max(tr.peak, h.ratio);
        if (h.ratio < PEAK_END || t - tr.since > 500) {
          this.recordPeak(id, tr.peak);
          this.tracking[id] = null;
        }
      }
    }
    const both = this.peaks.L && this.peaks.R;
    if (both || t - this.punchStart > PUNCH_TIMEOUT_MS) this.finish();
  }

  recordPeak(id, peak) {
    this.peaks[id] = Math.max(this.peaks[id] || 0, peak);
  }

  finish() {
    const found = [this.peaks.L, this.peaks.R].filter(Boolean);
    let punchGrowth = 1.35;
    if (found.length) {
      // Trigger at 60% of the weaker hand's measured growth, so real punches clear it comfortably.
      const weakest = Math.min(...found);
      punchGrowth = clamp(1 + 0.6 * (weakest - 1), 1.18, 1.6);
    }
    this.result = { ...this.guardData, punchGrowth, at: Date.now() };
    this.phase = 'done';
  }

  status() {
    if (this.phase === 'guard') {
      return { phase: 'guard', progress: Math.min(1, this.held / GUARD_HOLD_MS) };
    }
    if (this.phase === 'punch') {
      return { phase: 'punch', left: !!this.peaks.L, right: !!this.peaks.R };
    }
    return { phase: 'done', result: this.result };
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
