// All sound is synthesized with WebAudio — no files to load.
// Call unlock() from a click/gesture before playing (browser autoplay rules).

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.crowdLevel = 0.2;
    this.music = null;
    this.musicLevel = 0;
  }

  unlock() {
    if (this.ctx) return this.ctx.resume();
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.noise = this.makeNoise(2);
    this.startCrowd();
    this.startMusic();
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noiseBurst({ dur = 0.1, freq = 1000, q = 1, type = 'lowpass', gain = 0.8, attack = 0.002, sweepTo = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 100, to = null, dur = 0.15, type = 'sine', gain = 0.6, delay = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- Game sounds ----------
  punch(heavy = false) {
    if (!this.ctx) return;
    this.noiseBurst({ dur: heavy ? 0.16 : 0.1, freq: heavy ? 1400 : 1100, gain: 0.9 });
    this.tone({ freq: heavy ? 120 : 150, to: 40, dur: heavy ? 0.22 : 0.14, gain: heavy ? 0.9 : 0.7 });
    if (heavy) this.noiseBurst({ dur: 0.05, freq: 4000, type: 'highpass', gain: 0.4 });
  }

  // Getting hit: a heavy thump, a crunch and (for big shots) a ringing in your ears.
  hurt(heavy = false) {
    if (!this.ctx) return;
    this.tone({ freq: 90, to: 32, dur: 0.35, gain: 1 });
    this.noiseBurst({ dur: 0.18, freq: 900, gain: 0.9 });
    this.noiseBurst({ dur: 0.06, freq: 3500, type: 'highpass', gain: 0.5 });
    if (heavy) this.tone({ freq: 3100, dur: 1.4, type: 'sine', gain: 0.05, delay: 0.05 });
  }

  block() {
    if (!this.ctx) return;
    this.noiseBurst({ dur: 0.09, freq: 500, type: 'bandpass', q: 1.5, gain: 0.7 });
    this.tone({ freq: 90, to: 60, dur: 0.1, gain: 0.4 });
  }

  parry() {
    if (!this.ctx) return;
    this.tone({ freq: 1250, dur: 0.35, type: 'triangle', gain: 0.35 });
    this.tone({ freq: 1870, dur: 0.25, type: 'triangle', gain: 0.25 });
    this.noiseBurst({ dur: 0.08, freq: 3000, type: 'bandpass', q: 2, gain: 0.5 });
  }

  whoosh() {
    if (!this.ctx) return;
    this.noiseBurst({ dur: 0.14, freq: 400, sweepTo: 1800, type: 'bandpass', q: 0.8, gain: 0.35, attack: 0.03 });
  }

  windup() {
    if (!this.ctx) return;
    this.tone({ freq: 220, to: 440, dur: 0.25, type: 'sawtooth', gain: 0.06 });
  }

  // Boxing bell: a hammer click plus inharmonic metal partials ringing out ("DING… DING… DING")
  bell(times = 1) {
    if (!this.ctx) return;
    for (let i = 0; i < times; i++) {
      const d = i * 0.42;
      setTimeout(() => this.noiseBurst({ dur: 0.03, freq: 5000, type: 'highpass', gain: 0.5 }), d * 1000);
      for (const [ratio, g, dur] of [[1, 0.42, 2.2], [2.01, 0.2, 1.6], [2.76, 0.16, 1.3], [4.07, 0.08, 0.9], [5.42, 0.05, 0.6]]) {
        this.tone({ freq: 1046 * ratio, dur, gain: g, delay: d });
      }
    }
  }

  count() {
    if (!this.ctx) return;
    this.noiseBurst({ dur: 0.05, freq: 2500, type: 'bandpass', q: 3, gain: 0.5 });
    this.tone({ freq: 600, dur: 0.08, type: 'square', gain: 0.06 });
  }

  fanfare() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.25, delay: i * 0.14 }));
  }

  // Looping crowd murmur (two vowel-ish bands with a slow swell); level depends on the venue, cheer() swells it.
  startCrowd() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoise(4);
    src.loop = true;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    for (const [freq, q, g] of [[520, 0.9, 0.9], [1150, 1.4, 0.55], [2600, 2, 0.15]]) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const band = ctx.createGain();
      band.gain.value = g;
      // Each band breathes at its own slow rate, so the murmur doesn't sound like static.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13 + Math.random() * 0.2;
      const depth = ctx.createGain();
      depth.gain.value = g * 0.35;
      lfo.connect(depth).connect(band.gain);
      lfo.start();
      src.connect(f).connect(band).connect(this.crowdGain);
    }
    this.crowdGain.connect(this.master);
    src.start();
  }

  // A crowd of voices: detuned saws gliding up ("wooo!") through a vowel filter, plus scattered claps/whistles.
  voices({ count = 10, dur = 1.6, up = true, gain = 0.05, vowel = 900 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = vowel;
    f.Q.value = 1.2;
    const out = ctx.createGain();
    out.gain.value = 1;
    f.connect(out).connect(this.master);
    for (let i = 0; i < count; i++) {
      const t = t0 + Math.random() * 0.15;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = 160 + Math.random() * 260;
      o.frequency.setValueAtTime(base * (up ? 0.85 : 1.25), t);
      o.frequency.exponentialRampToValueAtTime(base * (up ? 1.3 : 0.75), t + dur * 0.45);
      o.frequency.exponentialRampToValueAtTime(base * (up ? 1.05 : 0.6), t + dur);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5 + Math.random() * 3;
      const vg = ctx.createGain();
      vg.gain.value = base * 0.02;
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.12);
      g.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.25);
      o.connect(g).connect(f);
      o.start(t);
      vib.start(t);
      o.stop(t + dur + 0.6);
      vib.stop(t + dur + 0.6);
    }
  }

  claps(amount = 1, dur = 1.5) {
    const n = Math.round(6 + amount * 14);
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.noiseBurst({ dur: 0.04, freq: 1400 + Math.random() * 900, type: 'bandpass', q: 1.2, gain: 0.12 + Math.random() * 0.1 }), Math.random() * dur * 1000);
    }
  }

  whistle() {
    const f = 1700 + Math.random() * 500;
    this.tone({ freq: f, to: f * 1.35, dur: 0.18, type: 'sine', gain: 0.07 });
    this.tone({ freq: f * 1.3, to: f * 0.9, dur: 0.35, type: 'sine', gain: 0.06, delay: 0.2 });
  }

  // Crowd gasp for a heavy shot or a knockdown
  ooh() {
    if (!this.ctx) return;
    this.voices({ count: 12, dur: 1.4, up: false, gain: 0.045, vowel: 520 });
  }

  // ---------- Music: a synthesized fight theme (step sequencer, 104 BPM, E minor) ----------
  startMusic() {
    const ctx = this.ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.drumGain = ctx.createGain();
    this.drumGain.gain.value = 0;
    this.drumGain.connect(this.musicGain);
    this.music = { step: 0, next: ctx.currentTime + 0.1, bpm: 104 };
    this.musicTimer = setInterval(() => this.scheduleMusic(), 25);
  }

  // level 0 = silent, ~0.4 = menus (no drums), 1 = fight
  setMusic(level) {
    this.musicLevel = level;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(level * 0.6, t, 0.6);
    // Drums always play (they make it sound like music); softer in the menus
    this.drumGain.gain.setTargetAtTime(level > 0.6 ? 1 : 0.55, t, 0.4);
  }

  scheduleMusic() {
    const m = this.music;
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    if (m.next < ctx.currentTime - 0.2) m.next = ctx.currentTime + 0.05; // tab was asleep
    const sixteenth = 60 / m.bpm / 4;
    while (m.next < ctx.currentTime + 0.12) {
      this.playStep(m.step, m.next, sixteenth);
      m.step = (m.step + 1) % 128; // 8 bars
      m.next += sixteenth;
    }
  }

  // Fight theme: E minor, i–VI–VII–V (Em C D B). Every bar: bass + chord pad + drums.
  // Second half of the 8-bar loop adds the lead melody (a brassy hook) and stabs.
  playStep(step, t, len) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const ci = bar % 4;
    const midi = (n) => 440 * 2 ** ((n - 69) / 12);
    const ROOT = [40, 36, 38, 35];                          // E2 C2 D2 B1
    const CHORD = [[64, 67, 71], [60, 64, 67], [62, 66, 69], [59, 63, 66]]; // Em C D B
    const drums = this.drumGain;
    const out = this.musicGain;
    const fill = ci === 3 && s >= 12;

    // Drums: kick on 1 and the "and" of 3, snare backbeat, offbeat hats, a fill into every 4th bar
    if (s === 0 || s === 6 || s === 10) this.kick(t, drums);
    if (s === 4 || s === 12) this.snare(t, drums, 1);
    if (fill && (s === 13 || s === 14 || s === 15)) this.snare(t, drums, 0.55);
    if (s % 2 === 0) this.hat(t, drums, s % 4 === 2 ? 0.11 : 0.05);

    // Bass: root octaves on the eighth notes, walking up into the next chord at the end of the bar
    if (s % 2 === 0) {
      const walk = s === 14 ? 2 : 0;
      const oct = s === 4 || s === 12 ? 12 : 0;
      this.synth(t, { freq: midi(ROOT[ci] + oct + walk), dur: len * 1.8, type: 'sawtooth', gain: 0.2, cutoff: 600, out });
    }
    // Chord pad: soft detuned saws held across the bar
    if (s === 0) {
      for (const n of CHORD[ci]) {
        for (const d of [-7, 7]) this.synth(t, { freq: midi(n - 12), detune: d, dur: len * 16, type: 'sawtooth', gain: 0.022, cutoff: 1100, attack: 0.12, out });
      }
    }
    // Lead hook (bars 4–7): brassy square/saw melody
    if (bar >= 4) {
      const MELODY = [
        [[0, 76, 3], [3, 79, 1], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 76, 4]],
        [[0, 79, 3], [3, 76, 1], [4, 72, 4], [8, 76, 2], [10, 79, 2], [12, 76, 4]],
        [[0, 78, 3], [3, 81, 1], [4, 86, 4], [8, 84, 2], [10, 81, 2], [12, 78, 4]],
        [[0, 83, 6], [6, 78, 2], [8, 75, 4], [12, 78, 2], [14, 83, 2]],
      ][ci];
      for (const [at, n, l] of MELODY) {
        if (at === s) {
          this.synth(t, { freq: midi(n - 12), dur: len * l * 0.95, type: 'square', gain: 0.045, cutoff: 2200, attack: 0.01, out });
          this.synth(t, { freq: midi(n - 12), detune: 9, dur: len * l * 0.95, type: 'sawtooth', gain: 0.03, cutoff: 1800, attack: 0.02, out });
        }
      }
      // Brass stabs on the chord at the top of each bar
      if (s === 0) for (const n of CHORD[ci]) this.synth(t, { freq: midi(n), dur: len * 1.6, type: 'sawtooth', gain: 0.03, cutoff: 2000, attack: 0.008, out });
    } else if (s % 4 === 2) {
      // First half: a light plucked arpeggio instead of the lead
      const n = CHORD[ci][(s / 2) % 3];
      this.synth(t, { freq: midi(n), dur: len * 1.2, type: 'triangle', gain: 0.05, cutoff: 3000, out });
    }
  }

  synth(t, { freq, dur, type = 'sawtooth', gain = 0.1, cutoff = 1000, detune = 0, attack = 0.005, out }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 1.6, t);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kick(t, out) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.75, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.35);
  }

  snare(t, out, level = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.42 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.2);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.25 * level, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }

  hat(t, out, level) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.05);
  }

  setCrowd(level) {
    this.crowdLevel = level;
    if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(level * 0.1, this.ctx.currentTime, 0.5);
  }

  cheer(amount = 1) {
    if (!this.crowdGain) return;
    // Voices, claps and the odd whistle on top of the swell
    if (amount >= 0.3) {
      this.voices({ count: Math.round(5 + amount * 10), dur: 1.2 + amount * 0.8, gain: 0.03 + Math.min(amount, 1) * 0.025 });
      this.claps(amount);
      if (Math.random() < amount * 0.7) setTimeout(() => this.whistle(), 200 + Math.random() * 500);
    }
    const t = this.ctx.currentTime;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(Math.min(0.3, (this.crowdLevel + amount * 0.6) * 0.12 + 0.03), t + 0.15);
    g.setTargetAtTime(this.crowdLevel * 0.1, t + 0.5, 0.8);
  }
}
