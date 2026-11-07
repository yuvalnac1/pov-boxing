// Procedural stylized boxer built from smooth primitives (no model files).
// One rig for every boxer; `look` (see opponents.js) sets colors, proportions, hair and beard.
// Animation = tweening joint angles toward a target pose.
import * as THREE from 'three';
import { toonify } from './toon.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
// Skin with a light sweaty sheen; satin for trunks/robe; glossy leather for gloves; soft hair.
const skinMat = (color, extra = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color(color).offsetHSL(0, 0, 0.15), ...extra });
const satin = (color, roughness = 0.32, extra = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(color).offsetHSL(0, 0, 0.25), ...extra });
const leather = (color) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25, emissive: new THREE.Color(0xff6a00), emissiveIntensity: 0 });
const hairMat = (color, lightness = 0) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0, 0, lightness * 0.2), roughness: 0.95 });
// Smooth body part from a [radius, height] profile. Points must go bottom → top for outward-facing
// surfaces; sort them so the profile can be listed in either order (a reversed torso rendered inside-out).
const lathe = (pts, segments) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)).sort((a, b) => a.y - b.y), segments);

// Joint angle poses. Arms: sx = shoulder pitch (negative = forward), sy = shoulder yaw (positive = inward),
// ex = elbow bend (negative = bend up). Body: lean (back +), twist, bob, head pitch/yaw.
const GUARD_ARM = { sx: -0.55, sy: 0.35, ex: -2.05 };
export const POSES = {
  idle: { L: GUARD_ARM, R: GUARD_ARM, lean: -0.05, twist: 0, headX: 0, headY: 0, drop: 0, fall: 0 },
  block: { L: { sx: -0.85, sy: 0.55, ex: -2.35 }, R: { sx: -0.85, sy: 0.55, ex: -2.35 }, lean: -0.12, twist: 0, headX: 0.25, headY: 0, drop: 0.05, fall: 0 },
  windupJab: { L: GUARD_ARM, R: { sx: -0.15, sy: -0.1, ex: -2.2 }, lean: 0.12, twist: -0.35, headX: 0, headY: 0, drop: 0, fall: 0 },
  jab: { L: GUARD_ARM, R: { sx: -1.5, sy: 0.25, ex: -0.1 }, lean: -0.22, twist: 0.35, headX: 0, headY: 0, drop: 0, fall: 0 },
  windupHook: { L: GUARD_ARM, R: { sx: -1.2, sy: -0.9, ex: -1.4 }, lean: 0.05, twist: -0.6, headX: 0, headY: 0, drop: 0, fall: 0 },
  hook: { L: GUARD_ARM, R: { sx: -1.45, sy: 0.75, ex: -1.0 }, lean: -0.15, twist: 0.6, headX: 0, headY: 0, drop: 0, fall: 0 },
  windupUppercut: { L: GUARD_ARM, R: { sx: 0.25, sy: 0.1, ex: -1.5 }, lean: 0.1, twist: -0.3, headX: 0, headY: 0, drop: 0.18, fall: 0 },
  uppercut: { L: GUARD_ARM, R: { sx: -1.25, sy: 0.3, ex: -1.9 }, lean: -0.2, twist: 0.3, headX: -0.1, headY: 0, drop: -0.05, fall: 0 },
  hit: { L: { sx: -0.4, sy: 0.1, ex: -1.6 }, R: { sx: -0.4, sy: 0.1, ex: -1.6 }, lean: 0.3, twist: 0, headX: -0.5, headY: 0, drop: 0, fall: 0 },
  hitBody: { L: { sx: -0.3, sy: 0.45, ex: -2.3 }, R: { sx: -0.3, sy: 0.45, ex: -2.3 }, lean: -0.32, twist: 0, headX: 0.35, headY: 0, drop: 0.1, fall: 0 },
  stunned: { L: { sx: -0.1, sy: 0, ex: -0.6 }, R: { sx: -0.1, sy: 0, ex: -0.6 }, lean: 0.12, twist: 0, headX: -0.2, headY: 0, drop: 0.08, fall: 0 },
  down: { L: { sx: -2.6, sy: 0, ex: -0.3 }, R: { sx: -2.6, sy: 0, ex: -0.3 }, lean: 0, twist: 0, headX: -0.3, headY: 0, drop: 0, fall: 1 },
  victory: { L: { sx: -2.9, sy: 0.1, ex: -0.4 }, R: { sx: -2.9, sy: 0.1, ex: -0.4 }, lean: 0.05, twist: 0, headX: -0.25, headY: 0, drop: 0, fall: 0 },
};

// How far a thrown punch carries toward the camera (m) and how much the punching arm stretches.
const LUNGE = { body: 0.42, shoulder: 0.38, stretch: 0.25 };

// Head proportions for the creator's face shapes (x/z width, y height).
const FACE_SCALE = { round: [1, 1], oval: [0.92, 1.1], wide: [1.1, 0.95], long: [0.88, 1.2] };

export class Boxer {
  constructor(look) {
    this.look = look;
    this.root = new THREE.Group();
    this.pose = structuredClone(POSES.idle);
    this.target = POSES.idle;
    this.speed = 10;
    this.mirror = false; // swap which arm the R pose applies to (alternate jabs)
    this.expression = null;
    this.glow = 0;
    this.lunge = 0;       // 0..1: punch thrown at the camera (body steps in, punching shoulder drives forward)
    this.lungeTarget = 0;
    this.wobble = 0;
    this.t = Math.random() * 10;
    this.build();
    // Cel-shaded comic look with inked outlines; re-point the materials we animate.
    const swapped = toonify(this.root, { thickness: 0.0065 });
    this.skinMat = swapped.get(this.skinMat) ?? this.skinMat;
    for (const id of ['L', 'R']) this.arms[id].gloveMat = swapped.get(this.arms[id].gloveMat) ?? this.arms[id].gloveMat;
    this.setExpression('normal');
  }

  build() {
    const L = this.look;
    const H = L.height;
    const W = L.width;
    const B = L.belly;
    const skin = skinMat(L.skin);
    this.skinMat = skin;

    // Soft contact shadow (complements the real shadow map, and stands in when shadows are off)
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45 * W, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    this.root.add(shadow);

    // `body` falls over on knockdown (pivot at feet)
    this.body = new THREE.Group();
    this.root.add(this.body);

    // Legs: thigh + calf, boxing boots with a white sole
    const bootMat = satin(L.shoes, 0.45);
    const soleMat = mat('#f2f2f2', { roughness: 0.6 });
    for (const s of [-1, 1]) {
      const x = s * 0.115 * W;
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085 * W, 0.26 * H, 6, 16), skin);
      thigh.position.set(x, 0.6 * H, 0);
      const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.068 * W, 0.24 * H, 6, 16), skin);
      calf.position.set(x, 0.3 * H, -0.01);
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.068 * W, 0.075 * W, 0.17, 18), bootMat);
      boot.position.set(x, 0.12, 0);
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 * W, 0.12, 6, 14), bootMat);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(x, 0.055, 0.05);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.13 * W, 0.022, 0.27), soleMat);
      sole.position.set(x, 0.011, 0.05);
      this.body.add(thigh, calf, boot, foot, sole);
    }

    // `torso` leans/twists (pivot at hips)
    this.torso = new THREE.Group();
    this.torso.position.y = 0.8 * H;
    this.body.add(this.torso);

    // Satin trunks with a waistband and side stripes
    const trunksMat = satin(L.trunks);
    const trimMat = satin(L.trim, 0.4);
    const trunks = new THREE.Mesh(lathe([[0.2 * W * B, 0.16 * H], [0.215 * W * B, 0.08 * H], [0.22 * W, -0.04 * H], [0.215 * W, -0.15 * H]], 28), trunksMat);
    trunks.scale.z = 0.82;
    this.torso.add(trunks);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205 * W * B, 0.205 * W * B, 0.065, 28, 1, true), trimMat);
    band.scale.z = 0.82;
    band.position.y = 0.13 * H;
    this.torso.add(band);
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.27 * H, 0.06), trimMat);
      stripe.position.set(s * 0.218 * W, 0.0, 0);
      this.torso.add(stripe);
    }

    // Sculpted torso: a lathe profile (waist → ribs → chest → shoulders), flattened front-to-back
    const torsoMesh = new THREE.Mesh(
      lathe([
        [0.19 * W * B, 0.12 * H], [0.2 * W * B, 0.22 * H], [0.215 * W * Math.max(1, B * 0.95), 0.32 * H],
        [0.26 * W, 0.44 * H], [0.285 * W, 0.53 * H], [0.25 * W, 0.58 * H], [0.12 * W, 0.62 * H], [0.06 * W, 0.63 * H],
      ], 32),
      skin
    );
    torsoMesh.scale.z = 0.7;
    this.torso.add(torsoMesh);
    // Pecs, belly, deltoids for some shape
    for (const s of [-1, 1]) {
      const pec = new THREE.Mesh(new THREE.SphereGeometry(0.095 * W, 20, 14), skin);
      pec.scale.set(1.1, 0.55, 0.32);
      pec.position.set(s * 0.085 * W, 0.49 * H, 0.15 * W);
      this.torso.add(pec);
    }
    if (B > 1.1) {
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.17 * W * B, 24, 18), skin);
      belly.scale.set(1, 0.85, 0.7);
      belly.position.set(0, 0.25 * H, 0.05);
      this.torso.add(belly);
    }
    const shoulderY = 0.55 * H;

    // Head (with a canvas face texture) on a neck
    this.neck = new THREE.Group();
    this.neck.position.y = 0.6 * H;
    this.torso.add(this.neck);
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * W, 0.085 * W, 0.14, 18), skin);
    neckMesh.position.y = 0.04;
    this.neck.add(neckMesh);
    const headR = 0.165;
    this.headR = headR;
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 1024;
    this.faceCanvas.height = 512;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;
    // White base color so the face texture shows as drawn; sheen tinted from the skin like the body.
    this.head = new THREE.Mesh(
      comicHead(headR),
      skinMat('#ffffff', { map: this.faceTex, sheenColor: new THREE.Color(L.skin).offsetHSL(0, 0, 0.15) })
    );
    const [fw, fh] = FACE_SCALE[L.faceShape] || [0.95, 1.05];
    this.head.scale.set(fw, fh, fw);
    this.head.position.y = 0.11 + headR * fh;
    this.neck.add(this.head);
    // 3D nose and ears give the face depth
    const nose = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.16, 16, 12), skin);
    nose.scale.set(0.85, 1.15, 1);
    nose.position.set(0, -headR * 0.2, headR * 1.0);
    this.head.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.24, 14, 10), skin);
      ear.scale.set(0.4, 1, 0.75);
      ear.position.set(s * headR * 0.98, -headR * 0.12, 0);
      this.head.add(ear);
    }
    this.addHair(headR);

    // Ring-walk robe (creator / walkout) and championship belt (ending); hidden by default.
    this.robe = new THREE.Group();
    const robeMat = satin(L.robe || L.trunks, 0.3, { side: THREE.DoubleSide });
    const robeH = shoulderY + 0.42 * H;
    const robeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.29 * W, 0.37 * W * B, robeH, 32, 1, true, 0.35, Math.PI * 2 - 0.7), robeMat);
    robeBody.scale.z = 0.8;
    robeBody.position.y = shoulderY - robeH / 2 + 0.06;
    this.robe.add(robeBody);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19 * W, 0.045, 10, 28), satin(L.trim, 0.4));
    collar.rotation.x = Math.PI / 2;
    collar.scale.y = 0.8;
    collar.position.y = shoulderY + 0.05;
    this.robe.add(collar);
    for (const s of [-1, 1]) {
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * W, 0.1 * W, 0.26, 18), robeMat);
      sleeve.position.set(s * 0.3 * W, shoulderY - 0.1, 0);
      this.robe.add(sleeve);
    }
    this.robe.visible = false;
    this.torso.add(this.robe);

    this.belt = new THREE.Group();
    const gold = new THREE.MeshPhysicalMaterial({ color: '#e2b33c', metalness: 1, roughness: 0.25, emissive: 0x3a2800, emissiveIntensity: 0.4 });
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.212 * W * B, 0.212 * W * B, 0.09, 32, 1, true), mat('#141414', { roughness: 0.4, side: THREE.DoubleSide }));
    strap.scale.z = 0.84;
    strap.position.y = 0.11 * H;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 32), gold);
    plate.rotation.x = Math.PI / 2;
    plate.position.set(0, 0.11 * H, 0.178 * W * B + 0.012);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 1), new THREE.MeshPhysicalMaterial({ color: '#c41f3a', roughness: 0.1, clearcoat: 1, emissive: 0x400010 }));
    gem.position.set(0, 0.11 * H, 0.178 * W * B + 0.035);
    this.belt.add(strap, plate, gem);
    this.belt.visible = false;
    this.torso.add(this.belt);

    // Arms: shoulder → upper arm → elbow → forearm → wraps → glove
    this.arms = {};
    for (const id of ['L', 'R']) {
      // Boxer faces +z (toward the camera); their right arm is on the viewer's left (-x).
      const side = id === 'R' ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.rotation.order = 'YXZ';
      shoulder.position.set(side * 0.285 * W, shoulderY, 0);
      this.torso.add(shoulder);
      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.085 * W, 20, 14), skin);
      shoulder.add(delt);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.066 * W, 0.2, 6, 16), skin);
      upper.position.y = -0.14;
      shoulder.add(upper);
      const bicep = new THREE.Mesh(new THREE.SphereGeometry(0.06 * W, 16, 12), skin);
      bicep.scale.set(1, 1.5, 1);
      bicep.position.set(0, -0.13, 0.03);
      shoulder.add(bicep);
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.056 * W, 0.18, 6, 16), skin);
      fore.position.y = -0.11;
      elbow.add(fore);
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.066, 0.07, 18), mat('#f2f2f2', { roughness: 0.9 }));
      wrap.position.y = -0.2;
      elbow.add(wrap);
      const gloveMat = leather(L.gloves);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.105, 28, 20), gloveMat);
      glove.scale.set(1, 1.15, 1.05);
      glove.position.y = -0.3;
      elbow.add(glove);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.05, 4, 10), gloveMat);
      thumb.position.set(-side * 0.075, -0.27, 0.04);
      thumb.rotation.z = -side * 0.5;
      elbow.add(thumb);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.072, 0.07, 20), satin(L.trim, 0.4));
      cuff.position.y = -0.215;
      elbow.add(cuff);
      this.arms[id] = { shoulder, elbow, glove, gloveMat, side };
    }

    // Dizzy stars
    this.stars = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14a });
    for (let i = 0; i < 4; i++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), starMat);
      star.userData.a = (i / 4) * Math.PI * 2;
      this.stars.add(star);
    }
    this.stars.position.y = 0.11 + headR * 2.4;
    this.stars.visible = false;
    this.neck.add(this.stars);

    this.root.traverse((o) => {
      if (o.isMesh && o !== shadow && o.parent !== this.stars) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  addHair(r) {
    const L = this.look;
    const hm = hairMat(L.hairColor);
    const bm = hairMat(L.beardColor);
    const add = (mesh, m) => {
      mesh.material = m;
      this.head.add(mesh);
      return mesh;
    };
    const cap = (radius, theta, tilt) => {
      const c = add(new THREE.Mesh(new THREE.SphereGeometry(radius, 36, 16, 0, Math.PI * 2, 0, Math.PI * theta)), hm);
      c.rotation.x = tilt;
      return c;
    };
    if (L.hair === 'buzz') {
      cap(r * 1.012, 0.47, -0.3);
    } else if (L.hair === 'short') {
      cap(r * 1.04, 0.43, -0.25);
    } else if (L.hair === 'afro') {
      const fro = add(new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.3, 3)), hm);
      fro.position.set(0, r * 0.45, -r * 0.2);
    } else if (L.hair === 'curly') {
      cap(r * 1.04, 0.42, -0.25);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const ring = i % 2 ? 0.45 : 0.72;
        const curl = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.24, 12, 10)), hm);
        curl.position.set(Math.cos(a) * r * ring, r * (0.97 - ring * 0.25), Math.sin(a) * r * ring - r * 0.1);
      }
    } else if (L.hair === 'mohawk') {
      cap(r * 1.008, 0.47, -0.3).material = hairMat(L.hairColor, 0.55); // shaved sides
      for (let i = 0; i < 7; i++) {
        const spike = add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.15, r * 0.5, 10)), hm);
        const a = -0.9 + i * 0.3;
        spike.position.set(0, Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
        spike.rotation.x = a;
      }
    } else if (L.hair === 'twists') {
      cap(r * 1.05, 0.4, -0.2);
      for (let i = 0; i < 14; i++) {
        const tw = add(new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.08, r * 0.35, 4, 8)), hm);
        const a = (i / 14) * Math.PI * 2;
        const ring = i % 2 ? 0.35 : 0.62;
        tw.position.set(Math.cos(a) * r * ring, r * 1.0, Math.sin(a) * r * ring - r * 0.1);
        tw.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      }
    }
    // Beards are a shell over the lower jaw, below the mouth line (the mouth is on the face texture).
    if (L.beard === 'full' || L.beard === 'short') {
      const start = L.beard === 'full' ? 0.64 : 0.69;
      const b = add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.045, 36, 12, 0, Math.PI * 2, Math.PI * start, Math.PI * (1 - start))), bm);
      b.scale.set(1.02, 1.05, 1.06);
      if (L.beard === 'full') {
        const stache = add(new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.07, r * 0.32, 4, 10)), bm);
        stache.rotation.z = Math.PI / 2;
        stache.position.set(0, -r * 0.3, r * 0.96);
      }
    } else if (L.beard === 'goatee') {
      const g = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 14, 10)), bm);
      g.scale.set(1, 1.2, 0.7);
      g.position.set(0, -r * 0.7, r * 0.72);
    }
  }

  setExpression(expr) {
    if (expr === this.expression) return;
    this.expression = expr;
    drawFace(this.faceCanvas, this.look, expr);
    this.faceTex.needsUpdate = true;
  }

  setPose(name, speed = 10, mirror = false) {
    this.target = POSES[name];
    this.speed = speed;
    this.mirror = mirror;
  }

  setLunge(v) {
    this.lungeTarget = v;
  }

  setGlow(v) {
    this.glow = v;
  }

  setRobe(on) {
    this.robe.visible = on;
  }

  setBelt(on) {
    this.belt.visible = on;
  }

  update(dt, { stunned = false } = {}) {
    this.t += dt;
    const k = 1 - Math.exp(-this.speed * dt);
    const p = this.pose;
    const tgt = this.target;
    const armTarget = (id) => (this.mirror ? tgt[id === 'L' ? 'R' : 'L'] : tgt[id]);
    for (const id of ['L', 'R']) {
      const a = armTarget(id);
      for (const j of ['sx', 'sy', 'ex']) p[id][j] += (a[j] - p[id][j]) * k;
    }
    for (const j of ['lean', 'twist', 'headX', 'headY', 'drop', 'fall']) p[j] += (tgt[j] - p[j]) * k;

    // Idle bounce + stun wobble
    const bounce = p.fall > 0.1 ? 0 : Math.abs(Math.sin(this.t * 4.2)) * 0.03;
    this.wobble += ((stunned ? 1 : 0) - this.wobble) * k;
    const wob = Math.sin(this.t * 6) * 0.12 * this.wobble;

    this.body.position.y = bounce - p.drop * 0.5;
    // Positive x-rotation tips the top away from the camera (-z): falls/leans backward.
    this.body.rotation.x = p.fall * 1.45;
    // Throwing out fast, pulling back slower
    this.lunge += (this.lungeTarget - this.lunge) * (1 - Math.exp(-(this.lungeTarget > this.lunge ? 34 : 16) * dt));
    this.body.position.z = -p.fall * 0.25 + this.lunge * LUNGE.body;
    this.torso.rotation.set(p.lean, p.twist * (this.mirror ? -1 : 1), wob);
    this.head.rotation.set(p.headX, p.headY + wob * 0.8, 0);

    for (const id of ['L', 'R']) {
      const arm = this.arms[id];
      arm.shoulder.rotation.x = p[id].sx;
      arm.shoulder.rotation.y = -arm.side * p[id].sy; // positive sy swings the arm toward the center
      arm.elbow.rotation.x = p[id].ex;
      // The punching arm's shoulder drives forward and the arm stretches, so the glove really arrives at the camera
      const punching = id === (this.mirror ? 'L' : 'R');
      const l = punching ? this.lunge : 0;
      arm.shoulder.position.z = l * LUNGE.shoulder;
      arm.shoulder.scale.setScalar(1 + l * LUNGE.stretch);
    }

    // Wind-up glow on the punching glove (whole body tint for signature moves)
    const glowArm = this.mirror ? 'L' : 'R';
    for (const id of ['L', 'R']) {
      const g = this.arms[id].gloveMat;
      g.emissiveIntensity = id === glowArm ? this.glow * (0.8 + Math.sin(this.t * 30) * 0.2) : 0;
    }

    this.stars.visible = stunned;
    if (stunned) {
      this.stars.rotation.y += dt * 4;
      this.stars.children.forEach((s) => {
        s.position.set(Math.cos(s.userData.a) * 0.2, Math.sin(this.t * 5 + s.userData.a) * 0.03, Math.sin(s.userData.a) * 0.2);
        s.rotation.y += dt * 6;
      });
    }
  }

  dispose() {
    this.root.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });
    this.faceTex.dispose();
  }
}

// Comic-book head: a sphere (same UVs, so the face texture still maps) reshaped with a broad square
// jaw, a squared-off chin and a heavy brow, instead of a round ball.
function comicHead(r) {
  const g = new THREE.SphereGeometry(r, 40, 28);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).divideScalar(r);
    const front = Math.max(0, v.z);
    if (v.y < 0) {
      const t = Math.min(1, -v.y / 0.75);
      const jawBand = Math.sin(Math.min(1, t * 1.3) * Math.PI) * 0.5 + 0.5 * Math.min(1, t * 1.3);
      v.x *= 1 + 0.07 * jawBand;    // squarer jaw below the cheeks (subtle, no pear shape)
    } else {
      v.x *= 1 - 0.06 * v.y;        // narrower crown
    }
    const brow = Math.exp(-(((v.y - 0.3) / 0.12) ** 2)) * front;
    v.z += 0.07 * brow;             // brow ridge over the eyes
    const chin = Math.exp(-(((v.y + 0.72) / 0.14) ** 2)) * front * Math.exp(-((v.x / 0.35) ** 2));
    v.z += 0.035 * chin;            // slightly jutting chin
    p.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  g.computeVertexNormals();
  return g;
}

// Face drawn on the head texture (1024×512). The front of the head (+z) is at u = 0.25.
// Comic-book inking: flat skin, bold black lines, hard shapes (the halftone shader does the shading).
export function drawFace(canvas, look, expr) {
  const c = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W * 0.25;
  const eyeY = H * 0.47;
  const mouthY = H * 0.62;
  const ex = 78;
  const INKC = '#120d1c';
  const fierce = expr === 'angry' || expr === 'serious';
  c.lineCap = 'round';
  c.lineJoin = 'round';

  c.fillStyle = look.skin;
  c.fillRect(0, 0, W, H);
  // Stubble as comic stipple
  if (look.beard === 'stubble') {
    c.fillStyle = INKC;
    for (let i = 0; i < 1400; i++) {
      const a = Math.random() * Math.PI;
      const r = Math.sqrt(Math.random());
      c.globalAlpha = 0.35;
      c.beginPath();
      c.arc(cx + Math.cos(a) * 140 * r, mouthY - 14 + Math.sin(a) * 100 * r, 1.6, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  const stroke = (w, fn) => {
    c.strokeStyle = INKC;
    c.lineWidth = w;
    c.beginPath();
    fn();
    c.stroke();
  };

  // Eyes
  for (const s of [-1, 1]) {
    const x = cx + s * ex;
    const y = eyeY;
    if (expr === 'dizzy') {
      stroke(6, () => { for (let a = 0; a < Math.PI * 5; a += 0.25) c.lineTo(x + Math.cos(a) * a * 2.4, y + Math.sin(a) * a * 2.4); });
      continue;
    }
    if (expr === 'hurt') {
      stroke(8, () => { c.moveTo(x - 24, y - 8); c.lineTo(x + s * 2, y + 2); c.lineTo(x + 24, y - 8); });
      continue;
    }
    const inner = x - s * 25;
    const outer = x + s * 27;
    const lid = fierce ? 13 : 16;  // how open
    const shape = () => {
      c.moveTo(inner, y + (fierce ? 0 : 2));
      c.lineTo(x - s * 6, y - lid);
      c.lineTo(outer, y - lid + 6);
      c.quadraticCurveTo(x + s * 6, y + 12, inner, y + (fierce ? 0 : 2));
    };
    c.save();
    c.beginPath();
    shape();
    c.clip();
    c.fillStyle = '#ffffff';
    c.fillRect(x - 34, y - 26, 68, 52);
    c.fillStyle = INKC;
    c.beginPath();
    c.arc(x - s * 2, y - 2, 8.5, 0, Math.PI * 2); // small hard pupil
    c.fill();
    c.restore();
    // heavy upper lid, thin lower lid
    stroke(8, () => { c.moveTo(inner, y + (fierce ? 0 : 2)); c.lineTo(x - s * 6, y - lid); c.lineTo(outer + s * 3, y - lid + 7); });
    stroke(3, () => { c.moveTo(inner + s * 4, y + 3); c.quadraticCurveTo(x + s * 6, y + 13, outer, y - lid + 8); });
    // Brow: a solid angular wedge, angled down toward the nose
    const browColor = look.hair === 'bald' ? INKC : look.hairColor;
    const tilt = expr === 'happy' ? 4 : expr === 'hurt' ? -10 : fierce ? 22 : 14;
    const thick = { thin: 10, thick: 20 }[look.brows] || 15;
    const top = y - 36;
    c.fillStyle = browColor;
    c.strokeStyle = INKC;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x - s * 36, top + tilt);
    c.lineTo(x + s * 36, top - 8);
    c.lineTo(x + s * 34, top - 8 + thick * 0.55);
    c.lineTo(x - s * 32, top + tilt + thick);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // Frown crease between the brows
  if (fierce || expr === 'normal') {
    stroke(4, () => { c.moveTo(cx - 6, eyeY - 30); c.lineTo(cx - 3, eyeY - 14); c.moveTo(cx + 7, eyeY - 32); c.lineTo(cx + 4, eyeY - 16); });
  }
  // Inked nose: side line and nostril flicks (the 3D nose gives the shape)
  stroke(4, () => {
    c.moveTo(cx - 14, H * 0.5);
    c.quadraticCurveTo(cx - 22, H * 0.545, cx - 12, H * 0.57);
    c.moveTo(cx + 8, H * 0.575);
    c.lineTo(cx + 18, H * 0.568);
  });
  // Cheekbone strokes
  for (const s of [-1, 1]) stroke(3.5, () => { c.moveTo(cx + s * 70, H * 0.56); c.lineTo(cx + s * 92, H * 0.6); });

  // Mouth
  if (fierce) {
    c.fillStyle = INKC;
    c.beginPath();
    c.moveTo(cx - 44, mouthY - 6);
    c.lineTo(cx + 44, mouthY - 10);
    c.lineTo(cx + 38, mouthY + 14);
    c.lineTo(cx - 40, mouthY + 12);
    c.closePath();
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(cx - 36, mouthY - 3);
    c.lineTo(cx + 36, mouthY - 6);
    c.lineTo(cx + 32, mouthY + 9);
    c.lineTo(cx - 33, mouthY + 8);
    c.closePath();
    c.fill();
    stroke(2.5, () => {
      c.moveTo(cx - 34, mouthY + 2.5);
      c.lineTo(cx + 34, mouthY + 1);
      for (let i = -2; i <= 2; i++) { c.moveTo(cx + i * 13, mouthY - 5); c.lineTo(cx + i * 13, mouthY + 9); }
    });
  } else if (expr === 'hurt' || expr === 'dizzy') {
    c.fillStyle = INKC;
    c.beginPath();
    c.ellipse(cx + 4, mouthY + 4, 26, 15, -0.15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillRect(cx - 14, mouthY - 6, 30, 5);
  } else if (expr === 'happy') {
    c.fillStyle = INKC;
    c.beginPath();
    c.moveTo(cx - 40, mouthY - 6);
    c.quadraticCurveTo(cx, mouthY + 30, cx + 44, mouthY - 12);
    c.closePath();
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(cx - 30, mouthY - 3);
    c.quadraticCurveTo(cx, mouthY + 10, cx + 34, mouthY - 8);
    c.closePath();
    c.fill();
  } else {
    // Hard-set mouth: one heavy line, corners pulled down, short lower-lip stroke
    stroke(7, () => { c.moveTo(cx - 36, mouthY + 6); c.lineTo(cx - 24, mouthY); c.lineTo(cx + 24, mouthY - 1); c.lineTo(cx + 36, mouthY + 5); });
    stroke(3.5, () => { c.moveTo(cx - 12, mouthY + 14); c.lineTo(cx + 12, mouthY + 14); });
  }
  // Chin cleft
  stroke(3, () => { c.moveTo(cx, mouthY + 44); c.lineTo(cx, mouthY + 54); });
}

function blob(c, x, y, r, color) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function isDark(hex) {
  const hsl = {};
  new THREE.Color(hex).getHSL(hsl);
  return hsl.l < 0.32;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}
