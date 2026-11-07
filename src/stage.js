// Three.js stage: renderer, first-person camera, current venue, opponent and the player's gloves.
import * as THREE from 'three';
import { buildVenue } from './venues.js';
import { Boxer } from './boxer.js';
import { Gloves } from './gloves.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const CAM_POS = new THREE.Vector3(0, 1.55, 1.15);
const CAM_LOOK = new THREE.Vector3(0, 1.2, -1);
export const OPP_POS = new THREE.Vector3(0, 0, -1.0);
const SEPARATION = CAM_POS.z - OPP_POS.z; // eye-to-opponent distance at fighting range (dist = 1)
const MID_Z = (CAM_POS.z + OPP_POS.z) / 2;

// Quality tiers, best first. The stage starts at tier 1 and adapts to the measured frame time,
// so the game stays smooth on weak laptops (the webcam hand tracking shares the GPU).
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const TIERS = [
  { name: 'ultra', pixelRatio: DPR, bloom: true, shadows: true, shadowSize: 2048 },
  { name: 'high', pixelRatio: Math.min(DPR, 1.5), bloom: true, shadows: true, shadowSize: 1024 },
  { name: 'medium', pixelRatio: Math.min(DPR, 1.25), bloom: false, shadows: true, shadowSize: 1024 },
  { name: 'low', pixelRatio: 1, bloom: false, shadows: false, shadowSize: 512 },
];
const SLOW_FRAME = 1000 / 45; // ms — below ~45fps for a while → step down
const FAST_FRAME = 1000 / 57; // ms — a steady 60fps → allowed to step up (only before any step down)

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // keeps the comic palette saturated
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    // Soft studio reflections on skin, gloves and satin trunks.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 200);
    this.camera.position.copy(CAM_POS);
    this.camera.lookAt(CAM_LOOK);
    this.baseQuat = this.camera.quaternion.clone();
    this.scene.add(this.camera);
    // Soft light that travels with the camera, so the gloves are always readable.
    const camLight = new THREE.PointLight(0xffffff, 0.06, 1.5, 1);
    camLight.position.set(0, 0.2, 0.1);
    this.camera.add(camLight);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.5);
    this.scene.add(this.hemi);
    // Front fill from behind the player, so the opponent's face reads clearly in every venue.
    this.fill = new THREE.DirectionalLight(0xffffff, 0.8);
    this.fill.position.set(0.6, 2.4, 3);
    this.fill.target.position.copy(OPP_POS).setY(1.3);
    this.scene.add(this.fill, this.fill.target);
    // Corner rim lights: red and blue kickers from behind the opponent give the comic-book edge glow.
    this.rimRed = new THREE.DirectionalLight(0xff3b52, 1.8);
    this.rimBlue = new THREE.DirectionalLight(0x3b8cff, 1.8);
    for (const l of [this.rimRed, this.rimBlue]) this.scene.add(l, l.target);
    // Corner spotlight for the ring-walk introductions (red / blue)
    this.cornerLight = new THREE.SpotLight(0xff3b52, 0, 8, 0.45, 0.5, 1);
    this.scene.add(this.cornerLight, this.cornerLight.target);

    // Ring movement (driven by the fight's footwork; see setFightLayout)
    this.layout = { midX: 0, midZ: 0, angle: 0, dist: 1 };
    this.layoutTarget = { ...this.layout };
    this.oppPos = OPP_POS.clone();
    this.camBase = CAM_POS.clone();
    this.lookAt = new THREE.Vector3();
    this.roll = 0;
    this.lean = { fwd: 0, side: 0 };
    this.leanTarget = { fwd: 0, side: 0 };

    this.gloves = new Gloves(this.camera);
    this.venue = null;
    this.opponent = null;
    this.player = null; // the player's own boxer: only seen in the creator, walkout and champion scenes
    this.shakeAmt = 0;
    this.jolt = new THREE.Vector3();
    this.camMode = 'fight';
    this.orbit = 0;
    this.watchTilt = 0;
    this.sweat = this.makeSweat();

    // Post-processing: multisampled HDR render target → bloom → tone mapping/sRGB output.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.4, 0.98);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.tier = 1;
    this.frameMs = 16.7;
    this.slowFor = 0;
    this.fastFor = 0;
    this.steppedDown = false;
    this.lastFrameAt = performance.now();
    this.applyTier();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2); // bloom at half resolution is plenty
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.4 ? 70 : 62;
    this.camera.updateProjectionMatrix();
  }

  setVenue(id) {
    if (this.venueId === id) return;
    this.venueId = id;
    if (this.venue) {
      this.scene.remove(this.venue.group);
      this.venue.dispose();
    }
    this.venue = buildVenue(id);
    this.scene.add(this.venue.group);
    this.scene.background = new THREE.Color(this.venue.background);
    this.scene.fog = new THREE.Fog(...this.venue.fog);
    this.hemi.color.set(this.venue.ambient[0]);
    this.hemi.intensity = this.venue.ambient[1];
    this.scene.environmentIntensity = this.venue.envIntensity ?? 0.3;
    this.applyShadows();
  }

  // ---------- Quality ----------
  applyTier() {
    const q = TIERS[this.tier];
    this.renderer.setPixelRatio(q.pixelRatio);
    this.composer?.setPixelRatio(q.pixelRatio);
    this.applyShadows();
    this.resize?.();
  }

  applyShadows() {
    const q = TIERS[this.tier];
    const light = this.venue?.shadowLight;
    if (!light) return;
    light.castShadow = q.shadows;
    if (light.shadow.mapSize.x !== q.shadowSize) {
      light.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 20;
  }

  // Called every rendered frame with the real time since the last one.
  adaptQuality(ms) {
    if (ms > 200) return; // tab was hidden or a hitch — ignore
    this.frameMs += (ms - this.frameMs) * 0.05;
    const s = ms / 1000;
    this.slowFor = this.frameMs > SLOW_FRAME ? this.slowFor + s : 0;
    this.fastFor = this.frameMs < FAST_FRAME ? this.fastFor + s : 0;
    if (this.slowFor > 2 && this.tier < TIERS.length - 1) {
      this.tier++;
      this.steppedDown = true;
      this.slowFor = 0;
      this.frameMs = 16.7;
      this.applyTier();
    } else if (this.fastFor > 4 && this.tier > 0 && !this.steppedDown) {
      this.tier--;
      this.fastFor = 0;
      this.applyTier();
    }
  }

  get quality() {
    return TIERS[this.tier].name;
  }

  setOpponent(look) {
    if (this.opponent) {
      this.scene.remove(this.opponent.root);
      this.opponent.dispose();
    }
    this.opponent = new Boxer(look);
    this.opponent.root.position.copy(OPP_POS);
    this.scene.add(this.opponent.root);
    this.placeFighters();
  }

  // Where the fighters stand: { midX, midZ, angle, dist } from Fight.opp. The view follows the opponent.
  setFightLayout(o, snap = false) {
    const t = this.layoutTarget;
    t.midX = o?.midX ?? 0;
    t.midZ = o?.midZ ?? 0;
    t.angle = o?.angle ?? 0;
    t.dist = o?.dist ?? 1;
    if (snap) Object.assign(this.layout, t);
  }

  // The player's own body lean (webcam): moves the first-person camera in/out and side to side.
  setPlayerLean(fwd = 0, side = 0) {
    this.leanTarget.fwd = fwd;
    this.leanTarget.side = side;
  }

  placeFighters() {
    const fightView = this.camMode === 'fight' || this.camMode === 'watch' || this.camMode === 'down';
    const l = fightView ? this.layout : { midX: 0, midZ: 0, angle: 0, dist: 1 };
    const fx = -Math.sin(l.angle);
    const fz = -Math.cos(l.angle);
    const half = (SEPARATION * l.dist) / 2;
    const mx = l.midX;
    const mz = MID_Z + l.midZ;
    this.oppPos.set(mx + fx * half, 0, mz + fz * half);
    this.camBase.set(mx - fx * half, CAM_POS.y, mz - fz * half);
    if (fightView) {
      // Lean in (toward him) / back, and slip sideways; dip a little when slipping.
      const f = this.lean.fwd;
      const step = f * (f > 0 ? 0.3 : 0.42);
      const side = this.lean.side * 0.32;
      this.camBase.x += fx * step + Math.cos(l.angle) * side;
      this.camBase.z += fz * step - Math.sin(l.angle) * side;
      this.camBase.y -= Math.abs(this.lean.side) * 0.08 + Math.max(0, f) * 0.04;
    }
    if (this.opponent) {
      this.opponent.root.position.copy(this.oppPos);
      this.opponent.root.rotation.y = l.angle;
    }
    // Lights follow the action
    const rx = Math.cos(l.angle);
    const rz = -Math.sin(l.angle);
    this.fill.position.set(this.camBase.x + rx * 0.6, 2.4, this.camBase.z - fz * 2);
    const showcase = this.camMode === 'creator' || this.camMode === 'champion';
    if (showcase) this.fill.target.position.set(0, 1.3, 0);
    else this.fill.target.position.set(this.oppPos.x, 1.3, this.oppPos.z);
    this.rimRed.position.set(this.oppPos.x + fx * 2 - rx * 2.4, 2.6, this.oppPos.z + fz * 2 - rz * 2.4);
    this.rimBlue.position.set(this.oppPos.x + fx * 2 + rx * 2.4, 2.6, this.oppPos.z + fz * 2 + rz * 2.4);
    for (const r of [this.rimRed, this.rimBlue]) r.target.position.set(this.oppPos.x, 1.2, this.oppPos.z);
  }

  setPlayer(look) {
    if (this.player) {
      this.scene.remove(this.player.root);
      this.player.dispose();
    }
    this.player = new Boxer(look);
    this.player.root.visible = false;
    this.scene.add(this.player.root);
    this.gloves.setLook(look.gloves, look.skin);
    this.setCameraMode(this.camMode); // re-place the new boxer for the current scene
  }

  // 'fight' = first person; 'watch' = first person looking down at a fallen opponent;
  // 'down' = player on the canvas looking up; 'intro' = slow orbit around the opponent (menus);
  // 'creator' = your boxer on a turntable; 'walkout' = both boxers before the bell; 'champion' = belt ceremony
  setCameraMode(mode) {
    if (mode !== this.camMode && (mode === 'introRed' || mode === 'introBlue')) this.orbit = 0;
    this.camMode = mode;
    this.gloves.group.visible = mode === 'fight' || mode === 'watch';
    const p = this.player;
    const showcase = mode === 'creator' || mode === 'champion';
    if (this.opponent) this.opponent.root.visible = !showcase;
    // Front fill follows whoever is the star of the shot.
    this.fill.intensity = showcase ? 1.4 : 0.8;
    this.placeFighters();
    if (!p) return;
    const intro = mode === 'walkout' || mode === 'introRed' || mode === 'introBlue';
    p.root.visible = mode === 'creator' || intro || mode === 'champion';
    p.setRobe(intro);
    // Corner spotlight on whoever is being introduced
    const cl = this.cornerLight;
    cl.intensity = mode === 'introRed' || mode === 'introBlue' ? 9 : 0;
    cl.color.set(mode === 'introRed' ? 0xff3b52 : 0x3b8cff);
    const who = mode === 'introRed' ? [0, 1.1] : [OPP_POS.x, OPP_POS.z];
    cl.position.set(who[0] + 0.4, 4, who[1] + (mode === 'introRed' ? -1.2 : 1.2));
    cl.target.position.set(who[0], 1.2, who[1]);
    p.setBelt(mode === 'champion');
    p.setPose(mode === 'champion' ? 'victory' : 'idle', 5);
    p.setExpression(mode === 'champion' ? 'happy' : 'normal');
    if (intro) {
      p.root.position.set(0, 0, 1.1);
      p.root.rotation.y = Math.PI;
    } else {
      p.root.position.set(0, 0, 0);
      p.root.rotation.y = 0;
    }
  }

  shake(amount) {
    this.shakeAmt = Math.min(0.08, this.shakeAmt + amount);
  }

  // Your head snaps with the punch: hooks knock it sideways, uppercuts up, jabs straight back.
  hitPlayer(strength, kind = 'jab', side = 0) {
    const s = side || (Math.random() < 0.5 ? -1 : 1);
    if (kind === 'hook') this.jolt.set(s * 0.16, 0.0, 0.08);
    else if (kind === 'uppercut') this.jolt.set(0, 0.1, 0.1);
    else this.jolt.set((Math.random() - 0.5) * 0.05, 0.02, 0.2);
    this.jolt.multiplyScalar(strength);
    this.hitRoll = (kind === 'hook' ? s * 0.22 : (Math.random() - 0.5) * 0.08) * strength;
    this.shake(0.04 * strength);
  }

  // Screen position (px) of the opponent's head, for pop-up text.
  headScreenPos() {
    if (!this.opponent) return { x: innerWidth / 2, y: innerHeight * 0.35 };
    const p = new THREE.Vector3();
    this.opponent.head.getWorldPosition(p);
    p.project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
  }

  burstSweat() {
    const p = new THREE.Vector3();
    this.opponent.head.getWorldPosition(p);
    const s = this.sweat;
    s.origin.copy(p);
    s.age = 0;
    for (let i = 0; i < s.count; i++) {
      s.pos.set([p.x, p.y, p.z], i * 3);
      s.vel.set([(Math.random() - 0.5) * 2.2, Math.random() * 1.8, (Math.random() - 0.3) * 1.5], i * 3);
    }
    s.points.visible = true;
  }

  makeSweat() {
    const count = 24;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.035, transparent: true, opacity: 0.9 }));
    points.visible = false;
    this.scene.add(points);
    return { count, pos, vel: new Float32Array(count * 3), points, geo, age: 0, origin: new THREE.Vector3() };
  }

  update(dt, t, { frozen = false } = {}) {
    const adt = frozen ? 0 : dt;
    this.venue?.update(dt, t);
    this.gloves.update(dt);
    if (this.player?.root.visible) this.player.update(dt);

    // Sweat particles
    const s = this.sweat;
    if (s.points.visible) {
      s.age += adt;
      for (let i = 0; i < s.count; i++) {
        s.vel[i * 3 + 1] -= 7 * adt;
        for (let k = 0; k < 3; k++) s.pos[i * 3 + k] += s.vel[i * 3 + k] * adt;
      }
      s.geo.attributes.position.needsUpdate = true;
      if (s.age > 0.8) s.points.visible = false;
    }

    // Ring movement: ease toward the fight's layout (frozen during hit-stop)
    const L = this.layout;
    const T = this.layoutTarget;
    const k = 1 - Math.exp(-7 * adt);
    const prevAngle = L.angle;
    for (const key of ['midX', 'midZ', 'angle', 'dist']) L[key] += (T[key] - L[key]) * k;
    const kl = 1 - Math.exp(-14 * dt);
    this.lean.fwd += (this.leanTarget.fwd - this.lean.fwd) * kl;
    this.lean.side += (this.leanTarget.side - this.lean.side) * kl;
    this.placeFighters();
    // Lean into the turn a little as you circle
    const angVel = adt > 0 ? (L.angle - prevAngle) / adt : 0;
    this.roll += (-angVel * 0.06 - this.roll) * (1 - Math.exp(-5 * dt));

    // Camera
    if (this.camMode === 'fight' || this.camMode === 'watch') {
      this.jolt.multiplyScalar(Math.exp(-6 * dt));
      this.hitRoll = (this.hitRoll || 0) * Math.exp(-6 * dt);
      this.shakeAmt *= Math.exp(-9 * dt);
      const bob = Math.sin(t * 2.2) * 0.008;
      // Footwork bounce: a small step rhythm while the fighters move
      const step = Math.abs(Math.sin(t * 4.4)) * 0.012;
      this.camera.position.set(this.camBase.x, this.camBase.y + bob + step, this.camBase.z);
      this.camera.lookAt(this.oppPos.x, 1.2, this.oppPos.z);
      // Shake and jolt in camera space
      this.camera.translateX((Math.random() - 0.5) * this.shakeAmt + this.jolt.x);
      this.camera.translateY((Math.random() - 0.5) * this.shakeAmt + this.jolt.y);
      this.camera.translateZ(this.jolt.z);
      this.camera.rotateZ(this.roll - this.lean.side * 0.12 + (this.hitRoll || 0));
      this.camera.rotateX(this.jolt.y * 2 + this.jolt.z * 0.8);
      // 'watch' = look down at the opponent lying on the canvas
      this.watchTilt += ((this.camMode === 'watch' ? 1 : 0) - this.watchTilt) * (1 - Math.exp(-4 * dt));
      this.camera.rotateX(-0.42 * this.watchTilt);
    } else if (this.camMode === 'intro') {
      this.orbit += dt * 0.25;
      const r = 2.6;
      this.camera.position.set(Math.sin(this.orbit) * r, 1.5, OPP_POS.z + Math.cos(this.orbit) * r);
      this.camera.lookAt(OPP_POS.x, 1.25, OPP_POS.z);
    } else if (this.camMode === 'creator') {
      this.player.root.rotation.y = Math.sin(t * 0.6) * 0.7;
      this.camera.position.set(0.25, 1.25, 2.2);
      this.camera.lookAt(0, 1.05, 0);
    } else if (this.camMode === 'walkout' || this.camMode === 'champion') {
      this.orbit += dt * 0.22;
      const r = this.camMode === 'walkout' ? 3.6 : 1.9;
      this.camera.position.set(Math.sin(this.orbit) * r, 1.6, Math.cos(this.orbit) * r);
      this.camera.lookAt(0, this.camMode === 'walkout' ? 1.15 : 1.35, 0);
    } else if (this.camMode === 'introRed' || this.camMode === 'introBlue') {
      // Slow push-in on the fighter being announced
      this.orbit += dt;
      const red = this.camMode === 'introRed';
      const push = Math.min(1, this.orbit * 0.25);
      const z = red ? 1.1 - (1.6 - push * 0.35) : OPP_POS.z + (1.6 - push * 0.35);
      this.camera.position.set(red ? 0.35 : -0.35, 1.45, z);
      this.camera.lookAt(0, 1.35, red ? 1.1 : OPP_POS.z);
    } else if (this.camMode === 'photo') {
      // Dev photo mode: clean front close-up of the opponent (head to waist)
      this.camera.position.set(OPP_POS.x + 0.25, 1.5, OPP_POS.z + 1.45);
      this.camera.lookAt(OPP_POS.x, 1.3, OPP_POS.z);
    } else if (this.camMode === 'down') {
      this.camera.position.set(this.camBase.x + 0.1, 0.35, this.camBase.z + 0.25);
      this.camera.lookAt(this.oppPos.x + 0.3, 3, this.oppPos.z + 0.5);
      this.camera.rotateZ(Math.sin(t * 1.3) * 0.1);
    }

    const now = performance.now();
    this.adaptQuality(now - this.lastFrameAt);
    this.lastFrameAt = now;
    if (TIERS[this.tier].bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
