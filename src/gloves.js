// The player's own gloves, attached to the camera (first person).
// They follow the real hands from the webcam, and play a clean punch/parry animation on detected moves.
import * as THREE from 'three';
import { toonify } from './toon.js';

const REST = { L: new THREE.Vector3(-0.19, -0.19, -0.45), R: new THREE.Vector3(0.19, -0.19, -0.45) };
const GUARD = { L: new THREE.Vector3(-0.075, -0.1, -0.3), R: new THREE.Vector3(0.075, -0.1, -0.3) };
const PUNCH = { L: new THREE.Vector3(-0.05, -0.04, -0.9), R: new THREE.Vector3(0.05, -0.04, -0.9) };
const PUNCH_BODY = { L: new THREE.Vector3(-0.08, -0.3, -0.8), R: new THREE.Vector3(0.08, -0.3, -0.8) };
const GLOVE_DIM = 0.5;
const DEFAULT_GUARD_POS = { L: { x: 0.42, y: 0.45 }, R: { x: 0.58, y: 0.45 } };

export class Gloves {
  constructor(camera, { color = '#d8352a', skin = '#e0a77e' } = {}) {
    this.group = new THREE.Group();
    camera.add(this.group);
    this.gloves = {};
    for (const id of ['L', 'R']) {
      const g = this.makeGlove(id, color, skin);
      g.position.copy(REST[id]);
      this.group.add(g);
      this.gloves[id] = { mesh: g, target: REST[id].clone(), anim: null, track: null };
    }
    this.guard = false;
    this.calib = null;
    toonify(this.group, { thickness: 0.008 });
    // The gloves sit right under the venue's spotlights; pre-darken them so toon shading doesn't clip to pink/white.
    this.group.traverse((o) => {
      if (o.material?.isMeshToonMaterial) o.material.color.multiplyScalar(GLOVE_DIM);
    });
  }

  makeGlove(id, color, skin) {
    const s = id === 'L' ? -1 : 1;
    const g = new THREE.Group();
    // Glossy leather; children order [fist, thumb, cuff, arm] is relied on by setLook().
    const gloveMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.36, clearcoat: 0.85, clearcoatRoughness: 0.22 });
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.075, 40, 28), gloveMat);
    fist.scale.set(1, 0.92, 1.25);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.05, 6, 14), gloveMat);
    thumb.position.set(-s * 0.064, -0.012, -0.02);
    thumb.rotation.set(Math.PI / 2 - 0.2, 0, s * 0.35);
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.058, 0.07, 32),
      new THREE.MeshPhysicalMaterial({ color: '#ececec', roughness: 0.4, clearcoat: 0.5 })
    );
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.09;
    // Forearm angles down and out of frame (kept short so it never reaches the camera's near plane).
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.042, 0.22, 6, 18),
      new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.5, clearcoat: 0.2, sheen: 0.4 })
    );
    arm.rotation.x = Math.PI / 2 - 0.95;
    arm.position.set(s * 0.015, -0.1, 0.17);
    // Padded knuckle ridge, a stitched seam and the brand stripe on the cuff
    const knuckles = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.07, 6, 16), gloveMat);
    knuckles.rotation.z = Math.PI / 2;
    knuckles.position.set(0, 0.03, -0.055);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.0025, 6, 48), new THREE.MeshStandardMaterial({ color: '#000', transparent: true, opacity: 0.35 }));
    seam.rotation.y = Math.PI / 2;
    seam.scale.set(1, 0.92, 1.25);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0585, 0.0585, 0.014, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#d4a72c', roughness: 0.3, metalness: 0.6 }));
    stripe.rotation.x = Math.PI / 2;
    stripe.position.z = 0.075;
    g.add(fist, thumb, cuff, arm, knuckles, seam, stripe);
    g.rotation.set(0.15, -s * 0.15, 0);
    return g;
  }

  // Glove + forearm colors from the player's boxer.
  setLook(color, skin) {
    for (const id of ['L', 'R']) {
      const [fist, thumb, , arm] = this.gloves[id].mesh.children;
      fist.material.color.set(color).multiplyScalar(GLOVE_DIM);
      thumb.material.color.set(color).multiplyScalar(GLOVE_DIM);
      arm.material.color.set(skin).multiplyScalar(GLOVE_DIM);
    }
  }

  setCalibration(calib) {
    this.calib = calib;
  }

  // hand = detector hand debug { present, cx, cy, size }
  track(id, hand) {
    this.gloves[id].track = hand?.present ? hand : null;
  }

  punch(id, { body = false, tired = false } = {}) {
    this.gloves[id].anim = { type: 'punch', t: 0, dur: tired ? 0.42 : 0.26, body };
  }

  // A punch lands on your raised gloves: both get knocked back toward your face.
  blocked(strength = 1) {
    for (const id of ['L', 'R']) this.gloves[id].anim = { type: 'blocked', t: 0, dur: 0.24, k: strength };
  }

  // Parry: the glove slaps outward and forward, knocking the incoming punch aside.
  parry(id) {
    this.gloves[id].anim = { type: 'parry', t: 0, dur: 0.3, dir: id === 'L' ? 1 : -1 };
  }

  update(dt) {
    for (const id of ['L', 'R']) {
      const g = this.gloves[id];
      const target = g.target;

      if (this.guard) {
        target.copy(GUARD[id]);
      } else if (g.track) {
        const gp = this.calib ? (id === 'L' ? this.calib.guardL : this.calib.guardR) : DEFAULT_GUARD_POS[id];
        const size = this.calib?.handSize || 0.2;
        target.copy(REST[id]);
        target.x += clamp((g.track.cx - gp.x) * 0.8, -0.25, 0.25);
        target.y -= clamp((g.track.cy - gp.y) * 0.6, -0.15, 0.2);
        target.z -= clamp((g.track.size / size - 1) * 0.35, -0.1, 0.3);
      } else {
        target.copy(REST[id]);
      }

      let pos = target;
      if (g.anim) {
        g.anim.t += dt;
        const p = Math.min(1, g.anim.t / g.anim.dur);
        if (g.anim.type === 'punch') {
          // fast out (35%), slower back
          const k = p < 0.35 ? easeOut(p / 0.35) : 1 - easeInOut((p - 0.35) / 0.65);
          pos = target.clone().lerp((g.anim.body ? PUNCH_BODY : PUNCH)[id], k);
        } else if (g.anim.type === 'blocked') {
          const k = Math.sin(p * Math.PI) * g.anim.k;
          pos = target.clone();
          pos.z += 0.09 * k;
          pos.y -= 0.03 * k;
        } else {
          const k = Math.sin(p * Math.PI);
          pos = target.clone();
          pos.x += g.anim.dir * 0.28 * k;
          pos.z -= 0.12 * k;
        }
        if (p >= 1) g.anim = null;
      }
      const follow = g.anim ? 1 : 1 - Math.exp(-18 * dt);
      g.mesh.position.lerp(pos, follow);
    }
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
