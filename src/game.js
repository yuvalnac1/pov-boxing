// POV Boxing — game flow: title → calibration → career ladder → intro → fight → result → … → champion.
import { Stage } from './stage.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Fight, ROUND_LENGTH, REACH, UPGRADE } from './fight.js';
import { CAREER } from './opponents.js';
import { Calibration, saveCalibration } from './calibration.js';
import { HAND_CONNECTIONS } from './tracking.js';
import { Tutorial, TRAINER, STEPS } from './tutorial.js';
import { buildCreatorUI, defaultPlayer, randomPlayer, loadPlayer, savePlayer, toLook, fullName as playerName } from './creator.js';

const $ = (id) => document.getElementById(id);
const DEV = new URLSearchParams(location.search).has('dev');
const STEP = 1 / 30;            // fixed 30fps game logic
const PAUSE_AFTER_MS = 2000;    // hands hidden this long → pause
const DWELL_MS = 1000;
const THROW_TIME = 0.13;        // s before impact when the opponent's arm snaps out          // hand-cursor hover time to press a button
const CAREER_KEY = 'povboxing.career.v1';
const TUTORIAL_KEY = 'povboxing.tutorial.v1';
const THUMBS = ['reference/fight1-basement.jpg', 'reference/fight2-club.jpg', 'reference/fight3-regional.jpg', 'reference/fight4-national.jpg', null];
// Opponent headshots: used when the file exists in public/portraits/, otherwise the old thumbnails above.
const HEADSHOTS = ['portraits/rusty.png', 'portraits/twostep.png', 'portraits/wall.png', 'portraits/toro.png', 'portraits/king.png'];
const headshotOk = HEADSHOTS.map(() => false);
HEADSHOTS.forEach((src, i) => {
  const img = new Image();
  img.onload = () => {
    headshotOk[i] = true;
    if (screen === 'ladder') showLadder();
  };
  img.src = src;
});
const CROWD_LEVEL = { basement: 0.15, club: 0.35, regional: 0.55, national: 0.8, title: 1 };

const stage = new Stage($('scene'));
const input = new Input($('video'), { dev: DEV });
const sound = new Sound();

let screen = 'title';
let fight = null;
let calibration = null;
let career = loadCareer();
// Dev only: ?dev&level=3 jumps the career to that fight for testing.
if (DEV && new URLSearchParams(location.search).has('level')) career.level = Math.min(4, Number(new URLSearchParams(location.search).get('level')) || 0);
// Dev only: ?dev&pending=1 gives an unpicked upgrade; ?dev&php=5 starts fights with that much health.
if (DEV && new URLSearchParams(location.search).has('pending')) career.pendingUpgrades = Number(new URLSearchParams(location.search).get('pending')) || 1;
const DEV_PHP = DEV ? Number(new URLSearchParams(location.search).get('php')) || 0 : 0;
let player = loadPlayer();
let hitstop = 0;
let acc = 0;
let lastT = performance.now();
let paused = false;
let guardHold = 0;
let overTimer = null;
let lastStunned = false;
let lastHitZone = 'head';
let lastPhase = null;
let tiredPopAt = 0;

// Background scene for the menus
stage.setVenue(CAREER[Math.min(career.level, 4)].venue);
stage.setOpponent(CAREER[Math.min(career.level, 4)].opponent.look);
stage.setPlayer(toLook(player || defaultPlayer()));
stage.setCameraMode('intro');
if (DEV) $('dev-help').hidden = false;

// Dev only: ?dev&photo=0..4 shows a clean, UI-free close-up of that career opponent (for making art).
const PHOTO = DEV ? new URLSearchParams(location.search).get('photo') : null;
if (PHOTO != null) {
  const entry = CAREER[Math.min(4, Number(PHOTO) || 0)];
  for (const el of document.querySelectorAll('.screen, #hud, #cursor')) el.hidden = true;
  stage.setVenue(entry.venue);
  stage.setOpponent(entry.opponent.look);
  stage.setCameraMode('photo');
  stage.opponent.setPose('idle', 50);
  stage.opponent.setExpression(new URLSearchParams(location.search).get('face') || 'serious');
}

// ================================================================ Screens

function show(name) {
  if (name !== 'intro' && introToken) stopIntro();
  screen = name;
  if (name !== 'fight' && name !== 'pause') {
    sound.setMusic(0.4);
    if (name === 'result' || name === 'upgrade' || name === 'ladder' || name === 'champion') sound.setCrowd(0.05);
    if (stage.venue) stage.venue.baseline = 0.12;
  }
  for (const s of ['title', 'msg', 'creator', 'ladder', 'intro', 'result', 'upgrade', 'champion', 'pause']) $(`screen-${s}`).hidden = s !== name;
  $('hud').hidden = name !== 'fight' && name !== 'pause';
}

function message({ icon, title, text, button = null, onButton = null, progress = null, hands = null }) {
  show('msg');
  $('msg-icon').textContent = icon;
  $('msg-title').textContent = title;
  $('msg-text').textContent = text;
  $('msg-btn').hidden = !button;
  if (button) {
    $('msg-btn').textContent = button;
    $('msg-btn').onclick = onButton;
  }
  $('msg-progress').hidden = progress == null;
  if (progress != null) $('msg-progress').firstElementChild.style.width = `${progress * 100}%`;
  $('msg-hands').hidden = !hands;
  if (hands) {
    $('msg-L').classList.toggle('done', hands.left);
    $('msg-R').classList.toggle('done', hands.right);
  }
}

$('btn-start').addEventListener('click', async () => {
  sound.unlock();
  sound.setMusic(0.4);
  try {
    message({ icon: '📷', title: 'GETTING READY', text: 'Allow camera access when your browser asks.' });
    await input.start((msg) => message({ icon: '⏳', title: 'GETTING READY', text: msg }));
    stage.gloves.setCalibration(input.detector.calib);
    if (input.calibrated) afterSetup();
    else startCalibration();
  } catch (err) {
    console.error(err);
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    message({
      icon: '🚫',
      title: denied ? 'NO CAMERA ACCESS' : 'SOMETHING WENT WRONG',
      text: denied
        ? window.self !== window.top
          ? 'The camera is blocked inside this embedded preview. Open the published game in its own browser tab (HTTPS) and allow camera access.'
          : 'POV Boxing needs your webcam to see your hands. Allow camera access in the address bar, then try again.'
        : `Could not start hand tracking (${err?.message || err}). Check that a webcam is connected and try again.`,
      button: 'Try again',
      onButton: () => location.reload(),
    });
  }
});

function startCalibration() {
  calibration = new Calibration();
  message({ icon: '🛡', title: 'HOLD YOUR GUARD', text: 'Put both fists up in front of your face and keep them still.', progress: 0 });
}

function updateCalibration(t) {
  const s = calibration.update(t, input.detector.hands);
  if (s.phase === 'guard') {
    message({ icon: '🛡', title: 'HOLD YOUR GUARD', text: 'Put both fists up in front of your face and keep them still.', progress: s.progress });
  } else if (s.phase === 'punch') {
    message({ icon: '🥊', title: 'THROW A PUNCH', text: 'Punch straight at the camera once with each hand.', hands: { left: s.left, right: s.right } });
  } else {
    input.detector.setCalibration(s.result);
    stage.gloves.setCalibration(s.result);
    saveCalibration(s.result);
    calibration = null;
    sound.bell();
    afterSetup();
  }
}

function afterSetup() {
  if (player) showLadder();
  else showCreator();
}

// ---------------- Creator
function showCreator() {
  const draft = { ...(player || defaultPlayer()) };
  show('creator');
  stage.setVenue('basement');
  sound.setCrowd(0.1);
  renderCreator(draft);
  $('btn-random').onclick = () => renderCreator(Object.assign(draft, randomPlayer()));
  $('btn-create').onclick = () => {
    player = { ...draft };
    savePlayer(player);
    stage.setPlayer(toLook(player));
    sound.bell();
    if (tutorialDone()) showLadder();
    else startTutorial();
  };
}

function renderCreator(draft) {
  buildCreatorUI({ left: $('creator-left'), right: $('creator-right'), player: draft, onChange: (p, key) => previewBoxer(draft, key) });
  previewBoxer(draft, null);
}

function previewBoxer(draft, key) {
  stage.setPlayer(toLook(draft));
  stage.setCameraMode('creator');
  stage.player.setRobe(key === 'robe'); // show the robe only while picking its color
  $('creator-name').textContent = playerName(draft);
}

$('btn-edit').addEventListener('click', showCreator);

// ---------------- Ladder
function showLadder() {
  // An upgrade earned but not picked yet (e.g. the page was closed) comes first.
  if (career.pendingUpgrades > 0) return showUpgrade();
  show('ladder');
  const level = Math.min(career.level, 4);
  stage.setVenue(CAREER[level].venue);
  stage.setOpponent(CAREER[level].opponent.look);
  stage.setCameraMode('intro');
  sound.setCrowd(0.05);

  $('ladder-boxer').textContent = `${playerName(player)} · ${career.stats.wins} W – ${career.stats.fights - career.stats.wins} L`;
  $('ladder-attrs').innerHTML = UPGRADES.map((u) => `<span>${u.icon} ${u.name} ${pips(career.upgrades[u.key])}</span>`).join('');
  const ladder = $('ladder');
  ladder.innerHTML = '';
  CAREER.forEach((entry, i) => {
    const won = i < career.level;
    const current = i === career.level;
    const rung = document.createElement('div');
    rung.className = `rung ${won ? 'won' : current ? 'current' : 'locked'}`;
    const thumb = headshotOk[i]
      ? `<div class="thumb headshot" style="background-image:url('${HEADSHOTS[i]}')"></div>`
      : THUMBS[i]
        ? `<div class="thumb" style="background-image:url('${THUMBS[i]}')"></div>`
        : `<div class="thumb vegas">LAS VEGAS</div>`;
    rung.innerHTML = `${thumb}
      <div><div class="num">FIGHT ${i + 1}</div><h3>${fullName(entry.opponent)}</h3>
      <div class="venue">${entry.venueName}</div></div>
      <div>${current ? '<button class="big" data-hand>FIGHT!</button>' : won ? '' : '🔒'}</div>
      ${won ? '<div class="stamp">W</div>' : ''}`;
    if (current) rung.querySelector('button').addEventListener('click', () => showIntro(i));
    ladder.appendChild(rung);
  });
}

$('btn-recal').addEventListener('click', () => {
  if (input.cameraOk) startCalibration();
});
$('btn-reset').addEventListener('click', () => {
  career = newCareer();
  saveCareer();
  showLadder();
});

// ---------------- Intro: ring announcer, red corner, blue corner, then the face-off
let introToken = null;
const later = (i) => i >= 2; // announcer from the Regional Championship on

// Ring announcer. Plays a recorded clip from public/audio/announcer/<key>.mp3 when it exists (see
// public/audio/announcer/LINES.md); otherwise falls back to the browser voice, tuned to sound like a ring announcer:
// the best available English male voice, phrase by phrase, with the name drawn out at the end.
const ANNOUNCER_DIR = 'audio/announcer/';
const clipCache = new Map(); // key → Promise<HTMLAudioElement | null>
let announceAudio = null;
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function loadClip(key) {
  if (!clipCache.has(key)) {
    clipCache.set(key, new Promise((resolve) => {
      const a = new Audio();
      a.preload = 'auto';
      a.oncanplaythrough = () => resolve(a);
      a.onerror = () => resolve(null);
      a.src = `${ANNOUNCER_DIR}${key}.mp3`;
    }));
  }
  return clipCache.get(key);
}

const VOICE_PREFS = [/Guy.*Natural|Davis.*Natural|Andrew.*Natural|Christopher.*Natural/i, /Google UK English Male/i, /Daniel \(Enhanced\)|Daniel \(Premium\)|Evan \(Enhanced\)|Tom \(Enhanced\)/i, /^Daniel|^Arthur|^Aaron|^Tom\b|^Evan/i, /Google US English/i, /male/i];
let announcerVoice = null;
function pickVoice() {
  const en = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  for (const re of VOICE_PREFS) {
    const v = en.find((x) => re.test(x.name));
    if (v) return (announcerVoice = v);
  }
  return (announcerVoice = en[0] || null);
}
if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', pickVoice);

function speakFallback(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  if (!announcerVoice) pickVoice();
  const parts = text.split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean);
  parts.forEach((part, k) => {
    const last = k === parts.length - 1 && parts.length > 1;
    const u = new SpeechSynthesisUtterance(part);
    u.voice = announcerVoice;
    u.rate = last ? 0.78 : 0.95;   // the name gets stretched out
    u.pitch = last ? 0.8 : 0.9;
    u.volume = 1;
    if (k === parts.length - 1) u.onend = () => screen === 'intro' && sound.setMusic(0.4);
    speechSynthesis.speak(u);
  });
}

// key: recorded clip name, text: what the fallback voice says
async function announce(key, text) {
  const token = introToken;
  sound.setMusic(0.2);
  const clip = await loadClip(key);
  if (token !== introToken) return; // intro skipped while loading
  if (clip) {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    announceAudio?.pause();
    announceAudio = clip;
    clip.currentTime = 0;
    clip.volume = 1;
    clip.onended = () => screen === 'intro' && sound.setMusic(0.4);
    clip.play().catch(() => speakFallback(text));
  } else {
    speakFallback(text);
  }
}

function stopIntro() {
  introToken = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  announceAudio?.pause();
  for (const id of ['intro-title', 'intro-red', 'intro-blue']) $(id).classList.remove('on');
}

function introFinal() {
  stopIntro();
  stage.setCameraMode('walkout');
  $('intro-skip').hidden = true;
  $('vs-card').classList.add('on');
}

function runIntro(i) {
  const entry = CAREER[i];
  const token = (introToken = {});
  const big = later(i);
  const at = (ms, fn) => setTimeout(() => introToken === token && fn(), ms);
  const pName = `${player.first} "${player.nick}" ${player.last}`;
  const W = career.stats.wins;
  const L = career.stats.fights - career.stats.wins;
  $('vs-card').classList.remove('on');
  $('intro-skip').hidden = false;
  $('intro-title').innerHTML = `${i === 4 ? 'WORLD TITLE FIGHT' : `FIGHT ${i + 1} OF 5`}<small>${entry.venueName}</small>`;
  $('intro-red-name').textContent = pName;
  $('intro-red-sub').textContent = `${W}-${L} · ${player.nick}`;
  $('intro-blue-name').textContent = fullName(entry.opponent);
  $('intro-blue-sub').textContent = entry.opponent.tagline;

  const beat = big ? 3600 : 2300;
  stage.setCameraMode('walkout');
  at(200, () => {
    $('intro-title').classList.add('on');
    sound.cheer(0.6);
    if (big) announce(`welcome-${entry.venue}`, i === 4 ? 'Ladies and gentlemen!... This is the main event... for the championship of the world!' : `Ladies and gentlemen!... Welcome... to the ${entry.venueName}!`);
  });
  at(beat, () => {
    $('intro-title').classList.remove('on');
    stage.setCameraMode('introRed');
    $('intro-red').classList.add('on');
    sound.cheer(0.7);
    stage.venue.cheer(0.8);
    if (big) announce(`red-${slug(player.nick)}`, `In the red corner... with a record of ${W} wins and ${L} losses... ${pName.replaceAll('"', '')}!`);
  });
  at(beat * 2, () => {
    $('intro-red').classList.remove('on');
    stage.setCameraMode('introBlue');
    $('intro-blue').classList.add('on');
    sound.cheer(1);
    stage.venue.cheer(1.2);
    if (big) announce(`blue-${entry.id}`, `And in the blue corner... ${fullName(entry.opponent).replaceAll('"', '')}!`);
  });
  at(beat * 3, introFinal);
}

$('intro-skip').addEventListener('click', introFinal);

function showIntro(i) {
  const entry = CAREER[i];
  show('intro');
  stage.setVenue(entry.venue);
  stage.setOpponent(entry.opponent.look);
  runIntro(i);
  $('intro-pname').textContent = player.nick.toUpperCase();
  $('intro-precord').textContent = `${player.first} ${player.last} · ${career.stats.wins}-${career.stats.fights - career.stats.wins}`;
  sound.setCrowd(CROWD_LEVEL[entry.venue]);
  sound.cheer(0.6);
  $('intro-fight').textContent = i === 4 ? 'WORLD TITLE FIGHT' : `FIGHT ${i + 1} OF 5`;
  $('intro-name').textContent = fullName(entry.opponent);
  $('intro-tagline').textContent = entry.opponent.tagline;
  $('intro-venue').textContent = entry.venueName;
  guardHold = 0;
  $('btn-fight').onclick = () => startFight(i);
}

// ---------------- Tutorial (drills with the coach; reuses the fight HUD, input and effects)
function startTutorial() {
  fight = new Tutorial();
  fight.index = -1;
  fight.isTutorial = true;
  show('fight');
  $('hud').classList.add('tutorial');
  $('tut').hidden = false;
  stage.setVenue('basement');
  stage.setOpponent(TRAINER.look);
  sound.setCrowd(0.1);
  sound.setMusic(0.5);
  stage.setFightLayout(null, true);
  stage.setCameraMode('fight');
  $('getup').hidden = true;
  $('corner').hidden = true;
  $('vignette').className = 'vignette';
  hitstop = 0;
  acc = 0;
  renderTutorial();
  banner(STEPS[0].title, '#ffd34a');
}

function renderTutorial() {
  const s = fight.info();
  $('tut-step').textContent = `TRAINING ${Math.min(s.index + 1, s.total)} / ${s.total}`;
  $('tut-title').textContent = s.title;
  $('tut-text').textContent = s.text;
  $('tut-dots').innerHTML = Array.from({ length: s.need }, (_, i) => `<i class="${i < s.count ? 'on' : ''}"></i>`).join('');
}

function finishTutorial() {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* storage unavailable */
  }
  fight = null;
  $('hud').classList.remove('tutorial');
  $('tut').hidden = true;
}

function tutorialDone() {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

$('tut-skip').addEventListener('click', () => {
  finishTutorial();
  showLadder();
});
$('btn-tutorial').addEventListener('click', startTutorial);

// ---------------- Fight
function startFight(i) {
  stopIntro();
  const entry = CAREER[i];
  fight = new Fight(entry, { upgrades: career.upgrades });
  if (DEV_PHP) fight.player.hp = DEV_PHP;
  fight.index = i;
  show('fight');
  $('hud').classList.remove('tutorial');
  $('tut').hidden = true;
  stage.setVenue(entry.venue);
  if (stage.opponent?.look !== entry.opponent.look) stage.setOpponent(entry.opponent.look);
  sound.setCrowd(CROWD_LEVEL[entry.venue]);
  sound.setMusic(1);
  stage.venue.baseline = 0.2 + CROWD_LEVEL[entry.venue] * 0.3;
  stage.setFightLayout(fight.opp, true);
  input.beginNeutral(); // learn the player's normal stance during the intro
  stage.setCameraMode('fight');
  stage.opponent.setPose('idle');
  stage.opponent.setExpression('normal');
  $('hud-oname').textContent = entry.opponent.nickname.toUpperCase();
  $('hud-pname').textContent = player.nick.toUpperCase();
  $('getup').hidden = true;
  $('corner').hidden = true;
  $('vignette').className = 'vignette';
  clearTimeout(overTimer);
  hitstop = 0;
  acc = 0;
  renderHud();
  banner(`ROUND 1`, '#fff');
}

function onInput(events) {
  if (!fight || screen !== 'fight') return;
  const canAct = fight.phase === 'fight';
  const downed = fight.phase === 'down' && fight.down?.who === 'player' && !fight.down.risen;
  for (const e of events) {
    // Knocked down: any punch at the camera stops the get-up marker
    if (downed && (e.type === 'STRAIGHT' || e.type === 'GETUP')) {
      fight.getUpTry?.();
      continue;
    }
    if (e.type === 'STRAIGHT') {
      const body = e.target === 'body';
      moveLabel(`${e.hand === 'L' ? 'LEFT' : 'RIGHT'} ${body ? 'BODY SHOT' : 'TO THE HEAD'}`);
      flashControl('punch');
      if (!canAct) continue;
      const tired = fight.player.stamina != null && fight.player.stamina < 10;
      stage.gloves.punch(e.hand, { body, tired });
      sound.whoosh();
      fight.punch('straight', e.hand, body ? 'body' : 'head');
    } else if (e.type === 'PALM') {
      moveLabel('✋ PARRY');
      flashControl('parry');
      if (!canAct) continue;
      stage.gloves.parry(e.hand);
      sound.whoosh();
      fight.parry(e.hand);
    }
  }
  fight.setGuard(input.guard);
  stage.gloves.guard = input.guard && fight.phase !== 'down';
  $('ctl-block').classList.toggle('held', input.guard);
}

function onFightEvent(e) {
  const opp = stage.opponent;
  const venue = stage.venue;
  switch (e.type) {
    case 'hint':
      pop(e.text, innerWidth / 2, innerHeight * 0.66, '#ffd34a', 'small');
      break;
    case 'stepDone':
      pop('NICE!', innerWidth / 2, innerHeight * 0.45, '#6dff9e', 'big');
      sound.bell();
      break;
    case 'step':
      banner(fight.current.title, '#ffd34a');
      break;
    case 'tutorialDone':
      finishTutorial();
      sound.fanfare();
      message({
        icon: '🥊',
        title: "YOU'RE READY!",
        text: 'Punch, guard, parry, counter. Time to start your career in the basement gym.',
        button: 'To the ladder',
        onButton: showLadder,
      });
      break;
    case 'roundStart':
      banner('FIGHT!', '#ffd34a');
      sound.cheer(0.8);
      sound.setMusic(1);
      venue.cheer(0.8);
      venue.startWave();
      break;
    case 'bell':
      sound.bell(fight.phase === 'over' || fight.phase === 'break' ? 3 : fight.round === 1 ? 3 : 2);
      break;
    case 'windup':
      sound.windup();
      // mirror = he throws with his left hand (Boxer arms are his own sides)
      opp.setPose(`windup${cap(e.attack.type)}`, e.attack.windup < 0.5 ? 14 : 7, e.attack.hand === 'L');
      opp.setExpression('angry');
      break;
    case 'hit':
      if (e.target === 'opp') {
        const big = e.crit || e.counter;
        lastHitZone = e.zone || 'head';
        sound.punch(big);
        hitstop = big ? 0.12 : e.weak ? 0.03 : 0.07;
        stage.shake(big ? 0.03 : e.weak ? 0.006 : 0.012);
        if (lastHitZone === 'head') stage.burstSweat();
        const pos = stage.headScreenPos();
        const y = lastHitZone === 'body' ? pos.y + innerHeight * 0.22 : pos.y;
        const text = e.crit ? 'CRITICAL!' : e.counter ? 'COUNTER!' : e.weak ? 'weak…' : lastHitZone === 'body' ? pick(['BODY!', 'OOF!', 'THUD!']) : pick(['POW!', 'BAM!', 'WHAM!', 'SMACK!']);
        pop(text, pos.x + rnd(60), y + rnd(30), big ? '#ffd34a' : e.weak ? '#c8ccd4' : lastHitZone === 'body' ? '#ffb020' : '#fff', big ? 'big' : e.weak ? 'small' : '');
        venue.cheer(e.crit ? 0.7 : 0.3);
        sound.cheer(e.crit ? 0.6 : 0.2);
      } else if (e.blocked) {
        sound.block();
        stage.shake(e.guardBroken ? 0.025 : 0.012);
        stage.gloves.blocked(e.guardBroken ? 1.4 : 1);
        flashHp();
        if (e.guardBroken) {
          stage.hitPlayer(0.5);
          pop(`GUARD SPLIT! -${e.damage}`, innerWidth / 2, innerHeight * 0.62, '#ffb020', 'small');
        } else {
          pop(e.damage > 0 ? `BLOCKED -${e.damage}` : 'BLOCKED', innerWidth / 2, innerHeight * 0.62, '#9fe3ff', 'small');
        }
      } else {
        const heavy = e.damage >= 14;
        sound.hurt(heavy);
        stage.hitPlayer(Math.min(2.2, 0.8 + e.damage / 10), e.kind, stage.opponent?.mirror ? 1 : -1);
        hitstop = heavy ? 0.14 : 0.1;
        hurtEffect(heavy);
        pop(`-${e.damage}`, innerWidth * 0.18, 120, '#ff3b52', 'big');
        pop(pick(heavy ? ['CRACK!', 'KABOOM!', 'WHUMP!'] : ['OOF!', 'BAP!', 'THWACK!']), innerWidth / 2 + rnd(80), innerHeight * 0.45, '#ff3b52', heavy ? 'big' : '');
        if (heavy) {
          sound.ooh();
          venue.cheer(0.5);
        }
      }
      break;
    case 'oppBlocked': {
      sound.block();
      const pos = stage.headScreenPos();
      pop('BLOCKED', pos.x, pos.y + 60, '#c8ccd4', 'small');
      break;
    }
    case 'parry':
      sound.parry();
      hitstop = 0.09;
      pop('PARRY!', innerWidth / 2, innerHeight * 0.45, '#ffb020', 'big');
      venue.cheer(0.7);
      sound.cheer(0.4);
      break;
    case 'dodge':
      sound.whoosh();
      pop(e.how === 'sway' ? 'SWAY!' : 'SLIP!', innerWidth / 2 - e.side * innerWidth * 0.15, innerHeight * 0.42, '#6dff9e', 'big');
      pop('COUNTER NOW!', innerWidth / 2, innerHeight * 0.55, '#ffd34a', 'small');
      venue.cheer(0.6);
      sound.cheer(0.45);
      break;
    case 'tired':
      if (performance.now() - tiredPopAt > 1200) {
        tiredPopAt = performance.now();
        pop('TIRED — STOP PUNCHING TO RECOVER', innerWidth * 0.25, innerHeight * 0.2, '#ffb020', 'small');
      }
      $('hud-psta').parentElement.classList.remove('flash');
      void $('hud-psta').offsetWidth;
      $('hud-psta').parentElement.classList.add('flash');
      break;
    case 'miss':
      pop((fight.player.lean?.fwd ?? 0) < -0.2 ? 'MISS — LEAN BACK IN TO REACH' : 'MISS — LEAN IN TO REACH HIM', innerWidth / 2, innerHeight * 0.5, '#c8ccd4', 'small');
      break;
    case 'wrongHand':
      pop(`OTHER HAND — PARRY WITH YOUR ${e.needed === 'L' ? 'LEFT' : 'RIGHT'}`, innerWidth / 2, innerHeight * 0.55, '#ff6a5a', 'small');
      break;
    case 'tooEarly':
      pop('TOO EARLY', innerWidth / 2, innerHeight * 0.55, '#c8ccd4', 'small');
      break;
    case 'parryWhiff':
      pop('FAKE!', innerWidth / 2, innerHeight * 0.5, '#ff6a5a');
      break;
    case 'spamPunished':
      pop('HE READ YOU!', innerWidth / 2, innerHeight * 0.55, '#ff6a5a', 'small');
      break;
    case 'knockdown':
      if (e.who === 'opp') {
        banner('KNOCKDOWN!', '#ffd34a', true);
        stage.setCameraMode('watch');
        venue.cheer(1.5);
        venue.startWave();
        sound.ooh();
        sound.cheer(1);
        sound.setMusic(0.45);
      } else {
        banner("YOU'RE DOWN!", '#ff5a50', true);
        stage.setCameraMode('down');
        $('getup').hidden = false;
        $('getup-kd').textContent = e.count > 1 ? `KNOCKDOWN #${e.count} — IT GETS HARDER. DIG DEEP!` : 'KNOCKDOWN #1';
        sound.ooh();
        sound.setMusic(0.45);
        venue.cheer(1);
      }
      break;
    case 'getUpHit':
      sound.parry();
      pop(e.hits >= e.needed ? 'GET UP!' : 'NICE!', innerWidth / 2, innerHeight * 0.62, '#6dff9e', 'big');
      venue.cheer(0.5);
      flashGetup('hit');
      break;
    case 'getUpMiss':
      sound.block();
      pop('MISSED', innerWidth / 2, innerHeight * 0.62, '#ff5a50', 'small');
      flashGetup('miss');
      break;
    case 'count':
      banner(String(e.n), '#fff', true);
      sound.count();
      break;
    case 'getUp':
      clearBanner();
      sound.setMusic(1);
      venue.cheer(0.8);
      sound.cheer(0.6);
      $('getup').hidden = true;
      if (e.who === 'player') {
        stage.setCameraMode('fight');
        banner('BACK UP!', '#6dff9e');
      } else {
        stage.setCameraMode('fight');
        banner('HE\'S UP!', '#fff');
      }
      break;
    case 'roundEnd':
      sound.setMusic(0.5);
      venue.cheer(0.6);
      sound.cheer(0.5);
      $('corner').hidden = false;
      $('corner-tip').textContent = e.tip;
      banner(`END OF ROUND ${e.round}`, '#fff');
      break;
    case 'over':
      clearBanner();
      $('getup').hidden = true;
      if (e.win) {
        banner(e.method === 'KO' ? 'K.O.!' : 'YOU WIN!', '#ffd34a', true);
        venue.cheer(1.5);
        sound.cheer(1);
      } else {
        banner(e.method === 'KO' ? 'K.O.' : 'DECISION LOST', '#ff5a50', true);
        stage.setCameraMode('fight');
      }
      overTimer = setTimeout(() => showResult(e), 2600);
      break;
  }
}

// Drive the opponent's pose/expression from the fight state.
function animateOpponent() {
  const opp = stage.opponent;
  const o = fight.opp;
  if (fight.phase === 'down' && fight.down.who === 'opp' && !fight.down.risen) {
    opp.setPose('down', 4);
    opp.setExpression('dizzy');
    opp.setGlow(0);
    opp.setLunge(0);
    return;
  }
  if (fight.phase === 'over') {
    if (fight.result.win) {
      opp.setPose('down', 4);
      opp.setExpression('dizzy');
    } else {
      opp.setPose('victory', 5);
      opp.setExpression('happy');
    }
    opp.setGlow(0);
    opp.setLunge(0);
    return;
  }
  const atk = o.attack;
  switch (o.state) {
    case 'idle':
    case 'recover':
      opp.setPose('idle', fight.opp.stateTime < 0.4 ? 14 : 7, opp.mirror); // snap back after a punch
      opp.setExpression('normal');
      break;
    case 'windup':
      // The wind-up pose is set on the windup event. Just before impact he throws: the arm snaps out and
      // reaches the camera exactly when the damage lands (feints pull back instead).
      if (!atk.feint && o.stateDur - o.stateTime <= THROW_TIME) {
        opp.setPose(atk.type, 38, opp.mirror);
        opp.setLunge(1);
      } else opp.setLunge(0);
      break;
    case 'attack':
      opp.setPose(atk.type, 38, opp.mirror);
      opp.setLunge(o.stateTime < 0.12 ? 1 : 0);
      break;
    case 'block':
      opp.setPose('block', 14);
      break;
    case 'stunned':
      opp.setPose('stunned', 5);
      opp.setExpression('dizzy');
      break;
    case 'hit':
      opp.setPose(lastHitZone === 'body' ? 'hitBody' : 'hit', 26, opp.mirror);
      opp.setExpression('hurt');
      break;
  }
  if (o.state !== 'windup' && o.state !== 'attack') opp.setLunge(0);
  // A short, faint glint on the glove in the second half of the wind-up (brighter for signature punches)
  const late = o.state === 'windup' ? Math.max(0, (o.progress - 0.5) / 0.5) : 0;
  opp.setGlow(late ** 2 * (atk?.signature ? 1.6 : 0.7));
}

// ---------------- Upgrades: after each new win, train power, health or stamina
const UPGRADES = [
  { key: 'power', icon: '🥊', name: 'Power', text: 'Every punch hits harder.', gain: `+${Math.round(UPGRADE.power * 100)}% punch damage`,
    now: (l) => `Now: +${Math.round(UPGRADE.power * 100 * l)}% damage` },
  { key: 'health', icon: '❤️', name: 'Health', text: 'Take more punishment before you go down.', gain: `+${UPGRADE.health}% max health`,
    now: (l) => `Now: ${100 + UPGRADE.health * l} health` },
  { key: 'stamina', icon: '⚡', name: 'Stamina', text: 'Throw more punches before you tire, and recover faster.', gain: `+${UPGRADE.stamina}% stamina & recovery`,
    now: (l) => `Now: ${100 + UPGRADE.stamina * l} stamina` },
];
const MAX_LEVEL = UPGRADE.maxLevel; // each attribute can be trained this many times
const pips = (l) => `<span class="lvl">${Array.from({ length: MAX_LEVEL }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('')}</span>`;

function showUpgrade() {
  show('upgrade');
  const box = $('upgrades');
  box.innerHTML = '';
  for (const u of UPGRADES) {
    const l = career.upgrades[u.key];
    const b = document.createElement('button');
    b.dataset.hand = '';
    const maxed = l >= MAX_LEVEL;
    b.disabled = maxed;
    if (maxed) delete b.dataset.hand;
    b.innerHTML = `<span class="ico">${u.icon}</span><h3>${u.name}</h3>${pips(l)}<span>${u.text}</span><span class="gain">${maxed ? 'MAXED OUT' : u.gain}</span><span class="now">${u.now(l)}</span>`;
    b.addEventListener('click', () => {
      if (career.pendingUpgrades <= 0 || career.upgrades[u.key] >= MAX_LEVEL) return;
      career.upgrades[u.key]++;
      career.pendingUpgrades--;
      saveCareer();
      sound.parry();
      box.innerHTML = `<div class="upgrade-done" style="grid-column: 1 / -1">${u.icon} ${u.name.toUpperCase()} UP! ${pips(career.upgrades[u.key])}</div>`;
      setTimeout(() => (screen === 'upgrade' ? showLadder() : null), 1300);
    });
    box.appendChild(b);
  }
}

// ---------------- Result
function showResult(e) {
  const i = fight.index;
  const entry = CAREER[i];
  const p = fight.player;
  career.stats.fights++;
  career.stats.punches += p.punches;
  career.stats.landed += p.landed;
  career.stats.parries += p.parries;
  career.stats.knockdowns += fight.opp.knockdowns;
  if (e.win) {
    career.stats.wins++;
    if (career.level === i) {
      career.level = i + 1;
      if (i < 4) career.pendingUpgrades++; // first win over this opponent: earn an upgrade
    }
  }
  saveCareer();

  if (e.win && i === 4) return showChampion();

  show('result');
  $('res-paper').hidden = !e.win;
  $('res-headline').textContent = entry.headline.replaceAll('{nick}', `"${player.nick}"`);
  $('res-title').textContent = e.win ? (e.method === 'KO' ? 'WIN BY KNOCKOUT!' : 'WIN ON POINTS!') : e.method === 'KO' ? 'KNOCKED OUT' : 'LOST ON POINTS';
  $('res-sub').textContent = e.win ? `Next up: ${CAREER[i + 1].venueName}` : `${entry.opponent.nickname} wins this time. Get back in there.`;
  $('res-stats').innerHTML = stat('Punches', p.punches) + stat('Landed', p.landed) + stat('Parries', p.parries) + stat('Knockdowns', fight.opp.knockdowns);
  $('res-tip').hidden = e.win;
  $('res-tip').textContent = `🧢 Coach: ${entry.opponent.tip}`;
  $('res-primary').textContent = e.win ? 'Continue' : 'Rematch';
  $('res-primary').textContent = e.win && career.pendingUpgrades > 0 ? 'Choose upgrade' : $('res-primary').textContent;
  $('res-primary').onclick = () => (e.win ? showLadder() : showIntro(i));
  $('res-secondary').textContent = e.win ? 'Fight again' : 'Back to ladder';
  $('res-secondary').onclick = () => (e.win ? (career.pendingUpgrades > 0 ? showLadder() : showIntro(i)) : showLadder());
  $('res-secondary').hidden = e.win && career.pendingUpgrades > 0; // pick the upgrade before a rematch
  if (e.win) sound.fanfare();
  fight = null;
}

function showChampion() {
  show('champion');
  stage.setVenue('title');
  stage.setCameraMode('champion');
  stage.venue.cheer(1.5);
  $('champ-name').textContent = `${playerName(player)} — from the basement gym to the top of the world.`;
  sound.fanfare();
  setTimeout(() => sound.fanfare(), 700);
  sound.cheer(1.5);
  const s = career.stats;
  $('champ-stats').innerHTML = stat('Fights', s.fights) + stat('Wins', s.wins) + stat('Punches', s.punches) + stat('Parries', s.parries) + stat('Knockdowns', s.knockdowns);
  const conf = $('confetti');
  conf.innerHTML = '';
  const colors = ['#f2c14a', '#e8312a', '#2f6fe0', '#ffffff', '#3ad07a'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${2.5 + Math.random() * 3}s`;
    c.style.animationDelay = `${-Math.random() * 5}s`;
    conf.appendChild(c);
  }
  fight = null;
}

$('btn-again').addEventListener('click', () => {
  career = newCareer();
  saveCareer();
  showLadder();
});
$('btn-quit').addEventListener('click', () => {
  paused = false;
  if (fight?.isTutorial) finishTutorial();
  fight = null;
  showLadder();
});

// ================================================================ Main loop

function loop(now) {
  requestAnimationFrame(loop);
  frame(now);
}

function frame(now) {
  // Clamp: a stale timestamp must never produce a negative step (it would blow up the smoothing).
  const dt = clamp((now - lastT) / 1000, 0, 0.1);
  lastT = Math.max(lastT, now);
  const events = input.poll();

  if (calibration) updateCalibration(now);
  updateHandCursor(dt);

  if (screen === 'intro') {
    guardHold = input.guard ? guardHold + dt : 0;
    if (guardHold > 0.6) $('btn-fight').click();
  }

  if (fight && (screen === 'fight' || screen === 'pause')) {
    // Pause when the player's hands leave the camera (not while knocked down / between rounds).
    const missing = input.handsMissingMs() > PAUSE_AFTER_MS;
    if (missing && !paused && fight.phase === 'fight') {
      paused = true;
      show('pause');
    } else if (!missing && paused) {
      paused = false;
      show('fight');
    }

    if (!paused) {
      const lean = input.lean(dt);
      stage.setPlayerLean(lean.fwd, lean.side);
      fight.setLean?.(lean.fwd, lean.side);
      if (fight.phase === 'intro' && lastPhase !== 'intro' && lastPhase !== null) input.beginNeutral();
      lastPhase = fight.phase;
      onInput(events);
      if (hitstop > 0) {
        hitstop -= dt;
      } else {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          fight.update(STEP);
          for (const e of fight.drainEvents()) onFightEvent(e);
          if (!fight) break;
        }
      }
      if (fight) {
        stage.setFightLayout(fight.opp);
        animateOpponent();
        renderHud();
        if (fight.isTutorial) renderTutorial();
      }
    }
  }

  const frozen = hitstop > 0 || paused;
  const stunned = fight?.opp.state === 'stunned' && fight.phase === 'fight';
  if (stage.opponent) stage.opponent.update(frozen ? 0 : dt, { stunned });
  stage.update(dt, now / 1000, { frozen });
  if (!$('hud').hidden) drawCamPreview();
  lastStunned = stunned;
}
requestAnimationFrame(loop);

// ================================================================ HUD

function renderHud() {
  const p = fight.player;
  const o = fight.opp;
  const pPct = (p.hp / p.max) * 100;
  const oPct = (o.hp / o.max) * 100;
  $('hud-php').style.width = `${pPct}%`;
  $('hud-php-lag').style.width = `${pPct}%`;
  const sPct = p.stamina != null ? (p.stamina / p.maxStamina) * 100 : 100;
  $('hud-psta').style.width = `${sPct}%`;
  $('hud-psta').classList.toggle('low', sPct < 25);
  renderLean();
  $('hud-ohp').style.width = `${oPct}%`;
  $('hud-ohp-lag').style.width = `${oPct}%`;
  $('hud-php').classList.toggle('low', pPct < 25);
  $('hud-round').textContent = fight.index === 4 ? `TITLE FIGHT — ROUND ${fight.round}` : `ROUND ${fight.round}`;
  const secs = Math.max(0, Math.ceil(fight.phase === 'intro' || fight.phase === 'break' ? (fight.phase === 'break' ? ROUND_LENGTH : fight.roundTime) : fight.roundTime));
  $('hud-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('hud-time').classList.toggle('hurry', secs <= 10 && fight.phase === 'fight');
  $('hud-pkd').innerHTML = '<i></i>'.repeat(p.knockdowns);
  $('hud-okd').innerHTML = '<i></i>'.repeat(o.knockdowns);
  if (fight.phase === 'down' && fight.down.who === 'player') {
    const d = fight.down;
    if (d.bar) {
      $('getup-zone').style.left = `${(d.bar.center - d.bar.zone / 2) * 100}%`;
      $('getup-zone').style.width = `${d.bar.zone * 100}%`;
      $('getup-marker').style.left = `${d.bar.pos * 100}%`;
    }
    $('getup-pips').innerHTML = Number.isFinite(d.needed) ? Array.from({ length: d.needed }, (_, i) => `<i class="${i < d.hits ? 'on' : ''}"></i>`).join('') : '';
  }
  if (fight.phase !== 'break') $('corner').hidden = true;
  $('range').classList.toggle('on', fight.phase === 'fight' && (o.dist ?? 1) > REACH && o.state !== 'stunned');
  const v = $('vignette');
  if (!v.classList.contains('on')) v.classList.toggle('danger', pPct < 25 && fight.phase === 'fight');
}

function banner(text, color, hold = false) {
  const b = $('banner');
  b.textContent = text;
  b.style.color = color;
  b.className = 'banner';
  void b.offsetWidth;
  b.className = hold ? 'banner hold' : 'banner show';
}
function clearBanner() {
  $('banner').className = 'banner';
}

function pop(text, x, y, color, size = '') {
  const el = document.createElement('div');
  el.className = `pop ${size}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = color;
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 750);
}

let moveTimer = null;
function moveLabel(text) {
  const m = $('move');
  m.textContent = text;
  m.classList.add('on');
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => m.classList.remove('on'), 350);
}

// Lean pad in the controls legend: where the webcam thinks your body is.
function renderLean() {
  const l = fight?.player?.lean || { fwd: 0, side: 0 };
  $('lean-dot').style.transform = `translate(${l.side * 15}px, ${-l.fwd * 15}px)`;
  const tracked = input.bodyTracked || DEV;
  const seen = input.bodySeen || (DEV && !input.cameraOk);
  $('ctl-lean').classList.toggle('lost', !tracked || !seen);
  $('ctl-lean').classList.toggle('held', Math.abs(l.side) > 0.5 || l.fwd < -0.6 || l.fwd > 0.6);
}

function flashHp() {
  const hp = $('hud-php').parentElement;
  hp.classList.remove('chip');
  void hp.offsetWidth;
  hp.classList.add('chip');
}

function flashGetup(kind) {
  const g = $('getup');
  g.classList.remove('hit', 'miss');
  void g.offsetWidth;
  g.classList.add(kind);
}

const ctlTimers = {};
function flashControl(id) {
  const el = $(`ctl-${id}`);
  el.classList.add('on');
  clearTimeout(ctlTimers[id]);
  ctlTimers[id] = setTimeout(() => el.classList.remove('on'), 250);
}

// Being punched: white flash → red blur on the whole view, health bar shakes.
function hurtEffect(heavy) {
  const b = document.body;
  b.classList.remove('hurt', 'hurt-heavy');
  void b.offsetWidth;
  b.classList.add(heavy ? 'hurt-heavy' : 'hurt');
  clearTimeout(hurtEffect.t);
  hurtEffect.t = setTimeout(() => b.classList.remove('hurt', 'hurt-heavy'), heavy ? 700 : 450);
  const v = $('vignette');
  v.classList.remove('danger');
  v.classList.add('on');
  setTimeout(() => v.classList.remove('on'), heavy ? 380 : 220);
}

function flashVignette() {
  const v = $('vignette');
  v.classList.remove('danger');
  v.classList.add('on');
  setTimeout(() => v.classList.remove('on'), 60);
}

const camCtx = $('cam').getContext('2d');
function drawCamPreview() {
  const c = camCtx.canvas;
  if (!input.cameraOk) {
    camCtx.fillStyle = '#111';
    camCtx.fillRect(0, 0, c.width, c.height);
    camCtx.fillStyle = '#666';
    camCtx.font = '12px Inter';
    camCtx.fillText('no camera (dev mode)', 50, 88);
    return;
  }
  camCtx.save();
  camCtx.translate(c.width, 0);
  camCtx.scale(-1, 1);
  camCtx.drawImage($('video'), 0, 0, c.width, c.height);
  camCtx.restore();
  const f = input.lastFrame;
  for (const hand of [f?.left, f?.right]) {
    if (!hand) continue;
    camCtx.strokeStyle = '#3aff7a';
    camCtx.lineWidth = 1.5;
    camCtx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      camCtx.moveTo(hand.landmarks[a].x * c.width, hand.landmarks[a].y * c.height);
      camCtx.lineTo(hand.landmarks[b].x * c.width, hand.landmarks[b].y * c.height);
    }
    camCtx.stroke();
    camCtx.fillStyle = '#3aff7a';
    for (const p of hand.landmarks) camCtx.fillRect(p.x * c.width - 1.5, p.y * c.height - 1.5, 3, 3);
  }
}

// ================================================================ Hand cursor (menus without a mouse)

let dwellEl = null;
let dwell = 0;
function updateHandCursor(dt) {
  const cursor = $('cursor');
  const menu = screen !== 'fight' && screen !== 'title' && !calibration;
  if (screen === 'champion') stage.venue.cheer(0.02);
  const tip = menu && input.cameraOk ? input.fingertip() : null;
  if (!tip) {
    cursor.hidden = true;
    setDwell(null);
    return;
  }
  // Expand the middle of the camera view to the whole screen, so you don't need to reach the edges.
  const x = clamp((tip.x - 0.15) / 0.7, 0, 1) * innerWidth;
  const y = clamp((tip.y - 0.1) / 0.65, 0, 1) * innerHeight;
  cursor.hidden = false;
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
  const el = document.elementFromPoint(x, y)?.closest('[data-hand]');
  if (el !== dwellEl) {
    setDwell(el);
    dwell = 0;
  }
  if (el && !el.hidden) {
    dwell += dt * 1000;
    const p = Math.min(1, dwell / DWELL_MS);
    el.style.setProperty('--dwell', p);
    cursor.style.setProperty('--p', p);
    if (p >= 1) {
      dwell = -600; // short cooldown before the next press
      el.click();
    }
  } else {
    cursor.style.setProperty('--p', 0);
  }
}
function setDwell(el) {
  if (dwellEl) dwellEl.style.setProperty('--dwell', 0);
  dwellEl = el;
}

// ================================================================ Career storage

function newCareer() {
  return { level: 0, upgrades: { power: 0, health: 0, stamina: 0 }, pendingUpgrades: 0, stats: { fights: 0, wins: 0, punches: 0, landed: 0, parries: 0, knockdowns: 0 } };
}
function loadCareer() {
  try {
    const c = JSON.parse(localStorage.getItem(CAREER_KEY));
    if (c && typeof c.level === 'number') return { ...newCareer(), ...c, upgrades: Object.fromEntries(Object.entries({ ...newCareer().upgrades, ...c.upgrades }).map(([k, v]) => [k, Math.min(UPGRADE.maxLevel, v)])), stats: { ...newCareer().stats, ...c.stats } };
  } catch {
    /* ignore */
  }
  return newCareer();
}
function saveCareer() {
  try {
    localStorage.setItem(CAREER_KEY, JSON.stringify(career));
  } catch {
    /* storage unavailable */
  }
}

// ================================================================ Utils
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (n) => (Math.random() - 0.5) * 2 * n;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// "Rusty" Vega, Danny "Two-Step" Okafor
const fullName = ({ name, nickname }) => {
  const [first, ...rest] = name.split(' ');
  return first === nickname ? `"${nickname}" ${rest.join(' ')}` : `${first} "${nickname}" ${rest.join(' ')}`;
};
const stat = (label, v) => `<div><b>${v}</b>${label}</div>`;

// Console access for debugging
// step(seconds): advance the game manually (for testing while the tab is hidden and rAF is paused)
const step = (seconds) => {
  for (let i = 0; i < seconds * 30; i++) frame(lastT + 1000 / 30);
};
window.pov = { stage, input, sound, step, startFight, showIntro, showLadder, get fight() { return fight; }, career: () => career, CAREER };
