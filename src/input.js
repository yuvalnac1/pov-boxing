// Player input: webcam hand gestures (and, in ?dev mode only, a keyboard stand-in for testing).
import { HandTracker } from './tracking.js';
import { GestureDetector } from './gestures.js';
import { loadCalibration } from './calibration.js';
import { LeanTracker } from './lean.js';

const PUMP_SCALE = 1 / 25; // hand-sizes/sec of vertical fist movement → get-up meter units

export class Input {
  constructor(video, { dev = false } = {}) {
    this.dev = dev;
    this.tracker = new HandTracker(video);
    this.detector = new GestureDetector({}, loadCalibration());
    this.cameraOk = false;
    this.lastFrame = null;
    this.queue = [];
    this.devGuard = false;
    this.devPump = 0;
    this.leanTracker = new LeanTracker();
    this.devKeys = new Set();
    this.devLean = { fwd: 0, side: 0 };
    if (dev) this.bindKeys();
  }

  async start(onStatus) {
    try {
      await this.tracker.init(onStatus);
      this.cameraOk = true;
    } catch (err) {
      if (!this.dev) throw err;
      console.warn('Camera unavailable — dev keyboard mode only', err);
    }
  }

  get calibrated() {
    return !!this.detector.calib || (this.dev && !this.cameraOk);
  }

  // Call once per animation frame. Returns gesture events since the last call.
  poll() {
    if (this.cameraOk) {
      const frame = this.tracker.detect();
      if (frame) {
        this.lastFrame = frame;
        this.queue.push(...this.detector.update(frame));
        this.leanTracker.update(frame.t, frame.body);
      }
    }
    const events = this.queue;
    this.queue = [];
    return events;
  }

  // Body lean from the webcam (or arrow keys in ?dev): { fwd, side } in -1..1.
  lean(dt = 0) {
    if (this.dev) {
      const k = this.devKeys;
      const tf = (k.has('arrowup') ? 1 : 0) - (k.has('arrowdown') ? 1 : 0);
      const ts = (k.has('arrowright') ? 1 : 0) - (k.has('arrowleft') ? 1 : 0);
      const a = 1 - Math.exp(-12 * dt);
      this.devLean.fwd += (tf - this.devLean.fwd) * a;
      this.devLean.side += (ts - this.devLean.side) * a;
      if (tf || ts || !this.cameraOk) return { ...this.devLean };
    }
    return this.leanTracker.value;
  }

  get bodyTracked() {
    return this.cameraOk && !!this.tracker.pose;
  }

  get bodySeen() {
    return this.leanTracker.seen;
  }

  // Re-learn the player's neutral stance (called at the start of each round).
  beginNeutral() {
    this.leanTracker.beginNeutral(performance.now());
  }

  get guard() {
    return this.detector.guard || this.devGuard;
  }

  hand(id) {
    return this.detector.hands[id].debug;
  }

  // Fist-pump energy for getting up off the canvas.
  pump(dt) {
    let e = this.devPump;
    this.devPump = 0;
    for (const id of ['L', 'R']) {
      const h = this.hand(id);
      if (h.present) e += Math.abs(h.vy) * dt * PUMP_SCALE;
    }
    return e;
  }

  // Index fingertip of the most visible hand, in mirrored normalized coords, for the menu cursor.
  fingertip() {
    const f = this.lastFrame;
    const hand = f?.right || f?.left;
    if (!hand) return null;
    const tip = hand.landmarks[8];
    return { x: tip.x, y: tip.y };
  }

  handsMissingMs() {
    if (!this.cameraOk) return 0;
    return this.detector.msSinceHandsSeen(performance.now());
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k.startsWith('arrow')) {
        this.devKeys.add(k);
        e.preventDefault();
      }
      // Shift + F / J = body shot
      const target = e.shiftKey ? 'body' : 'head';
      if (k === 'f') this.queue.push({ type: 'STRAIGHT', hand: 'L', target });
      if (k === 'j') this.queue.push({ type: 'STRAIGHT', hand: 'R', target });
      if (k === 'v') this.queue.push({ type: 'STRAIGHT', hand: 'L', target: 'body' });
      if (k === 'n') this.queue.push({ type: 'STRAIGHT', hand: 'R', target: 'body' });
      if (k === 's') this.queue.push({ type: 'PALM', hand: 'L' });
      if (k === 'k') this.queue.push({ type: 'PALM', hand: 'R' });
      if (k === ' ') {
        this.devGuard = true;
        this.queue.push({ type: 'GETUP' }); // dev stand-in for the get-up punch
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.devKeys.delete(e.key.toLowerCase());
      if (e.key === ' ') this.devGuard = false;
    });
  }
}
