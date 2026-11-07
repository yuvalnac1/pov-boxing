import { HandTracker, HAND_CONNECTIONS } from './tracking.js';
import { GestureDetector } from './gestures.js';
import { Calibration, loadCalibration, saveCalibration } from './calibration.js';
import { LeanTracker } from './lean.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('cam');
const ctx = canvas.getContext('2d');

const COLORS = { L: '#ff3b3b', R: '#3b8bff' };
const HANDS_LOST_MS = 2000;
const MARK = 0.66; // where the threshold mark sits on the meters

const tracker = new HandTracker(video);
const detector = new GestureDetector({}, loadCalibration());
let calibration = null;
let showDebug = false;
let lastFrame = null;
const counts = { STRAIGHT_L: 0, STRAIGHT_R: 0, BODY: 0, PALM_L: 0, PALM_R: 0, GUARD: 0, DODGE: 0 };
const lean = new LeanTracker();
let leanZone = 'center';
const fps = { frames: 0, since: performance.now(), value: 0 };

// ---------- Overlay helpers ----------
function overlay({ icon, title, text, button = null, progress = null, hands = null }) {
  $('overlay').hidden = false;
  $('ov-icon').textContent = icon;
  $('ov-title').textContent = title;
  $('ov-text').textContent = text;
  $('btn-start').hidden = !button;
  if (button) $('btn-start').textContent = button;
  $('ov-progress').hidden = progress == null;
  if (progress != null) $('ov-progress').firstElementChild.style.width = `${progress * 100}%`;
  $('ov-hands').hidden = !hands;
  if (hands) {
    $('ov-L').classList.toggle('done', hands.left);
    $('ov-R').classList.toggle('done', hands.right);
  }
}
const hideOverlay = () => ($('overlay').hidden = true);

// ---------- Start ----------
$('btn-start').addEventListener('click', async () => {
  if ($('btn-start').dataset.action === 'retry') return location.reload();
  try {
    overlay({ icon: '📷', title: 'GETTING READY', text: 'Allow camera access when your browser asks.' });
    await tracker.init((msg) => overlay({ icon: '⏳', title: 'GETTING READY', text: msg }));
    $('btn-recal').hidden = false;
    $('btn-debug').hidden = false;
    $('counters').hidden = false;
    if (detector.calib) hideOverlay();
    else startCalibration();
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    $('btn-start').dataset.action = 'retry';
    overlay({
      icon: '🚫',
      title: denied ? 'NO CAMERA ACCESS' : 'SOMETHING WENT WRONG',
      text: denied
        ? 'POV Boxing needs your webcam to see your hands. Allow camera access in the address bar, then try again.'
        : `Could not start hand tracking (${err?.message || err}). Check that a webcam is connected and try again.`,
      button: 'Try again',
    });
  }
});

function startCalibration() {
  calibration = new Calibration();
}

$('btn-recal').addEventListener('click', startCalibration);
$('btn-debug').addEventListener('click', toggleDebug);
$('btn-reset').addEventListener('click', () => {
  for (const k in counts) counts[k] = 0;
  renderCounts();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') toggleDebug();
});
function toggleDebug() {
  showDebug = !showDebug;
  $('debug').hidden = !showDebug;
}

// ---------- Main loop ----------
function loop() {
  requestAnimationFrame(loop);
  const frame = tracker.detect();
  if (!frame) return;
  lastFrame = frame;
  fps.frames++;
  if (frame.t - fps.since >= 1000) {
    fps.value = Math.round((fps.frames * 1000) / (frame.t - fps.since));
    fps.frames = 0;
    fps.since = frame.t;
  }

  const events = detector.update(frame);
  lean.update(frame.t, frame.body);
  updateLean();

  if (calibration) {
    runCalibration(frame.t);
  } else {
    for (const e of events) onEvent(e);
  }

  draw(frame);
  renderPanels();
  $('guard-badge').classList.toggle('on', detector.guard && !calibration);
  $('hands-lost').hidden = !!calibration || detector.msSinceHandsSeen(frame.t) < HANDS_LOST_MS;
  if (showDebug) renderDebug();
}

function runCalibration(t) {
  const s = calibration.update(t, detector.hands);
  if (s.phase === 'guard') {
    overlay({
      icon: '🛡',
      title: 'HOLD YOUR GUARD',
      text: 'Put both fists up in front of your face and keep them still.',
      progress: s.progress,
    });
  } else if (s.phase === 'punch') {
    overlay({
      icon: '🥊',
      title: 'THROW A PUNCH',
      text: 'Punch straight at the camera once with each hand.',
      hands: { left: s.left, right: s.right },
    });
  } else {
    detector.setCalibration(s.result);
    saveCalibration(s.result);
    calibration = null;
    hideOverlay();
    flash('READY!', '#36d07a');
  }
}

// ---------- Events ----------
function onEvent(e) {
  if (e.type === 'STRAIGHT') {
    counts[`STRAIGHT_${e.hand}`]++;
    if (e.target === 'body') counts.BODY++;
    flash(`${e.hand === 'L' ? 'LEFT' : 'RIGHT'} ${e.target === 'body' ? 'BODY' : 'HEAD'}`, COLORS[e.hand]);
  } else if (e.type === 'PALM') {
    counts[`PALM_${e.hand}`]++;
    flash(`✋ PARRY ${e.hand}`, '#ffc531');
  } else if (e.type === 'GUARD_ON') {
    counts.GUARD++;
  }
  renderCounts();
}

function flash(text, color) {
  const el = $('flash');
  el.textContent = text;
  el.style.color = color;
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
}

function renderCounts() {
  for (const k in counts) $(`c-${k}`).textContent = counts[k];
}

// ---------- Lean ----------
$('btn-neutral').addEventListener('click', () => lean.beginNeutral(performance.now()));
function updateLean() {
  const { fwd, side } = lean.value;
  $('lean-dot').style.transform = `translate(${side * 40}px, ${-fwd * 40}px)`;
  const zone = fwd < -0.6 ? 'back' : fwd > 0.6 ? 'in' : side < -0.5 ? 'left' : side > 0.5 ? 'right' : 'center';
  if (zone !== leanZone) {
    if (zone !== 'center') {
      counts.DODGE++;
      flash({ back: 'SWAY BACK', in: 'LEAN IN', left: 'SLIP LEFT', right: 'SLIP RIGHT' }[zone], '#6dff9e');
      renderCounts();
    }
    leanZone = zone;
  }
  $('lean-text').textContent = !tracker.pose
    ? 'body tracking unavailable'
    : !lean.seen
      ? 'no body — show your shoulders'
      : `in/back ${fwd.toFixed(2)}   side ${side.toFixed(2)}`;
}

// ---------- Drawing ----------
function draw(frame) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1); // mirror the camera image
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
  ctx.fillStyle = 'rgba(10, 12, 18, 0.35)';
  ctx.fillRect(0, 0, w, h);

  if (showDebug && detector.calib) drawGuardZones(w, h);
  const pl = tracker.poseLandmarks;
  if (pl) {
    ctx.strokeStyle = '#6dff9e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pl[11].x * w, pl[11].y * h);
    ctx.lineTo(pl[12].x * w, pl[12].y * h);
    ctx.moveTo((pl[11].x + pl[12].x) * w / 2, (pl[11].y + pl[12].y) * h / 2);
    ctx.lineTo(pl[0].x * w, pl[0].y * h);
    ctx.stroke();
  }

  for (const [id, hand] of [['L', frame.left], ['R', frame.right]]) {
    if (!hand) continue;
    const pts = hand.landmarks.map((p) => [p.x * w, p.y * h]);
    ctx.strokeStyle = COLORS[id];
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(...pts[a]);
      ctx.lineTo(...pts[b]);
    }
    ctx.stroke();
    ctx.fillStyle = 'white';
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawGuardZones(w, h) {
  const c = detector.calib;
  const r = c.handSize * detector.cfg.guardTolerance;
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  for (const [g, color] of [[c.guardL, COLORS.L], [c.guardR, COLORS.R]]) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.ellipse(g.x * w, g.y * h, r * w, r * h, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function renderPanels() {
  for (const id of ['L', 'R']) {
    const d = detector.hands[id].debug;
    const panel = $(`panel-${id}`);
    const [punchBar, palmBar] = panel.querySelectorAll('.fill');
    const presence = panel.querySelector('.presence');
    presence.textContent = d.present ? 'tracking' : 'no hand';
    presence.classList.toggle('on', !!d.present);
    const punch = d.present ? ((d.ratio - 1) / (detector.cfg.punchGrowth - 1)) * MARK : 0;
    const palm = d.present ? (d.fingers / 3) * MARK : 0; // 3 straight fingers = open palm
    punchBar.style.width = `${Math.min(1, Math.max(0, punch)) * 100}%`;
    palmBar.style.width = `${Math.min(1, Math.max(0, palm)) * 100}%`;
  }
}

function renderDebug() {
  const f = (n, d = 2) => (n == null || Number.isNaN(n) ? '—' : n.toFixed(d));
  const c = detector.calib;
  const lines = [
    `tracking fps   ${fps.value}`,
    `calibrated     ${c ? 'yes' : 'no'}${c ? `  handSize ${f(c.handSize, 3)}` : ''}`,
    `punch trigger  ×${f(detector.cfg.punchGrowth)} (fist only)   palm = 3+ straight fingers`,
    `guard          ${detector.guard ? 'ON' : 'off'}  (pose ${detector.isGuardPose() ? 'ok' : 'no'})`,
    '',
  ];
  for (const id of ['L', 'R']) {
    const d = detector.hands[id].debug;
    lines.push(
      d.present
        ? `${id}  size ${f(d.size, 3)}  growth ×${f(d.ratio)}  fingers ${d.fingers}${d.open ? ' OPEN' : ''}  vx ${f(d.vx, 1)}`
        : `${id}  —`
    );
  }
  $('debug').textContent = lines.join('\n');
}

// Expose for console debugging.
window.pov = { tracker, detector, get lastFrame() { return lastFrame; } };
