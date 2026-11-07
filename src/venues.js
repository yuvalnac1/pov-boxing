// The 5 venues, built procedurally in low-poly 3D (see reference/ for the target look).
// Every venue shares the ring; what changes is the room, lights, crowd and props.
// The ring floor is at y = 0, centered on the origin; the camera looks toward -z.
import * as THREE from 'three';
import { toonify, smallMeshes } from './toon.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
const RING = 3; // half-size of the ring

export function buildVenue(id) {
  const v = new Venue();
  ({ basement, club, regional, national, title })[id](v);
  toonify(v.group, { outline: smallMeshes(), thickness: 0.0034 });
  return v;
}

class Venue {
  constructor() {
    this.group = new THREE.Group();
    this.animators = [];
    this.crowds = [];
    this.excitement = 0;
    this.baseline = 0.12; // resting crowd energy (the game raises it during fights)
    this.waveT = null;
  }
  add(o) {
    this.group.add(o);
    return o;
  }
  onUpdate(fn) {
    this.animators.push(fn);
  }
  update(dt, t) {
    this.excitement = Math.max(0, this.excitement - dt * 0.5);
    if (this.waveT != null) {
      this.waveT += dt * 2.4;
      if (this.waveT > Math.PI * 2.3) this.waveT = null;
    } else if (this.excitement > 0.9 && Math.random() < dt * 0.25) {
      this.startWave();
    }
    for (const c of this.crowds) c.update(t, this.excitement);
    for (const fn of this.animators) fn(dt, t);
  }
  cheer(amount = 1) {
    this.excitement = Math.min(1.5, this.excitement + amount);
  }
  startWave() {
    if (this.waveT == null) this.waveT = -0.3;
  }
  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); });
    });
  }
}

// ---------------------------------------------------------------- Venues

function basement(v) {
  v.background = 0x14110e;
  v.fog = [0x14110e, 6, 16];
  v.ambient = [0xffe2b8, 0.35];
  ring(v, { canvas: '#8d8578', apron: '#3b3630', post: '#2b2b2b', pad: '#7a2020', ropes: ['#8f2a2a', '#d8d8d8', '#2b3d7a'] });
  room(v, { w: 13, d: 13, h: 3.8, wall: brickTexture('#8a4a32', '#5e3324'), floor: '#3a3632', ceiling: '#221e1a' });

  // Hanging bulb — the only real light
  const bulb = v.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), basic(0xfff1c4)));
  bulb.position.set(0, 2.25, -0.6);
  const cord = v.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6), basic(0x111111)));
  cord.position.set(0, 2.55, -0.6);
  const light = v.add(new THREE.PointLight(0xffd59a, 2, 14, 1.2));
  light.position.copy(bulb.position);
  // A wide spot from the bulb casts the shadows (point-light shadows cost 6 renders).
  v.shadowLight = spot(v, [0, 2.4, 0.2], [0, 0, -1], 0xffd59a, 3, 1.1);
  v.envIntensity = 0.15;
  v.onUpdate((dt, t) => (light.intensity = 2 + Math.sin(t * 23) * 0.1 + (Math.sin(t * 3.1) > 0.995 ? -1 : 0)));

  // Pipes along the ceiling, punching bags, posters, chairs
  for (const x of [-2.5, 1.5]) {
    const pipe = v.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 13, 6), mat('#5b4a3a')));
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 2.6, 0);
  }
  for (const [x, z] of [[-1.8, -5.6], [0.6, -5.8], [2.8, -5.4]]) {
    const bag = v.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 8), mat('#6b2a20')));
    bag.position.set(x, 1.4, z);
  }
  posters(v, [[-6.4, 1.2, -2.5, Math.PI / 2], [-6.4, 1.2, 0.5, Math.PI / 2], [-2.5, 1.3, -6.4, 0], [-1.2, 1.4, -6.4, 0]], ['FIGHT NIGHT', 'BOXING', 'CHAMP?', 'TONIGHT']);
  chair(v, 2.5, -4.2, 0.3);
  chair(v, -3.6, -3.8, -0.4);

  // A handful of spectators standing at the back
  crowd(v, [[1.6, -4.6], [2.2, -4.9], [2.9, -4.5], [3.5, -4.8], [2.3, -4.2]].map(([x, z]) => ({ x, y: -1, z, scale: 1.05 })), { palette: CASUAL });
}

function club(v) {
  v.background = 0x2a241d;
  v.fog = [0x2a241d, 10, 24];
  v.ambient = [0xfff0d8, 0.75];
  ring(v, { canvas: '#4f86c9', apron: '#2d4f7c', post: '#d9d9d9', pad: '#c23030', ropes: ['#c23030', '#f2f2f2', '#2f55b0'] });
  room(v, { w: 18, d: 18, h: 6, wall: blockTexture('#cbb89a', '#a8977c'), floor: '#6e5a44', ceiling: '#3a3229' });

  // Lighting truss with lamps above the ring
  const truss = v.add(new THREE.Mesh(new THREE.BoxGeometry(7, 0.15, 0.15), mat('#555')));
  truss.position.set(0, 3.6, -0.5);
  for (let i = 0; i < 6; i++) {
    const lamp = v.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.25, 8), mat('#222')));
    lamp.position.set(-3 + i * 1.2, 3.45, -0.5);
    const lens = v.add(new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), basic(0xfff6dc)));
    lens.position.set(-3 + i * 1.2, 3.32, -0.5);
    lens.rotation.x = Math.PI / 2;
  }
  v.shadowLight = spot(v, [0, 3.5, 0.5], [0, 0, -1], 0xfff2d8, 25, 0.7);
  spot(v, [0, 3.5, -2], [0, 0, 0], 0xfff2d8, 15, 0.7);

  // Bleachers behind the ring
  const seats = [];
  for (let r = 0; r < 5; r++) {
    const step = v.add(new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 0.7), mat('#8e8e8e')));
    step.position.set(1, -1 + r * 0.45, -5.2 - r * 0.7);
    for (let i = 0; i < 12; i++) if (Math.random() < 0.75) seats.push({ x: -4.4 + i * 0.9 + Math.random() * 0.2, y: -0.78 + r * 0.45, z: -5.2 - r * 0.7, seated: true });
  }
  crowd(v, seats, { palette: CASUAL });
  posters(v, [[-8.9, 1.5, -3, Math.PI / 2], [-8.9, 1.5, 0, Math.PI / 2], [-3, 2.2, -8.9, 0], [3.5, 2.6, -8.9, 0]], ['FIGHT 2', 'SUBURBAN CHAMPIONSHIP', 'LOCAL BOUTS', 'SUBURBAN TOURNAMENT']);
}

function regional(v) {
  // An old community sports hall: wooden court, fold-out wooden bleachers, warm sodium lamps, a red ring.
  v.background = 0x2a1c12;
  v.fog = [0x2a1c12, 12, 30];
  v.ambient = [0xffd9a0, 0.65];
  ring(v, { canvas: '#b8382e', apron: '#f0e2c4', post: '#2b2b2b', pad: '#1f4fa0', ropes: ['#f4f4f4', '#1f4fa0', '#f4f4f4'], apronText: 'REGIONAL CHAMPIONSHIP' });
  room(v, { w: 26, d: 26, h: 9, wall: blockTexture('#e6d6b4', '#b9a684'), floor: '#a8743f', ceiling: '#3a2a1c' });
  // Maroon wainscot band around the walls and court lines on the wooden floor
  for (let i = 0; i < 4; i++) {
    const band = v.add(new THREE.Mesh(new THREE.PlaneGeometry(26, 1.6), mat('#7a1f22')));
    const a = (i * Math.PI) / 2;
    band.position.set(Math.sin(a) * 12.95, -0.2, Math.cos(a) * 12.95);
    band.rotation.y = a + Math.PI;
  }
  const court = v.add(new THREE.Mesh(new THREE.RingGeometry(5.6, 5.75, 48), basic(0xf3e6c8)));
  court.rotation.x = -Math.PI / 2;
  court.position.y = -0.985;
  // Exposed roof beams with hanging gym lamps
  for (let i = -2; i <= 2; i++) {
    const beamMesh = v.add(new THREE.Mesh(new THREE.BoxGeometry(26, 0.35, 0.35), mat('#4a3626')));
    beamMesh.position.set(0, 7.6, i * 4.5);
    for (let j = -2; j <= 2; j++) {
      const shade = v.add(new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.45, 10, 1, true), mat('#2e2e2e', { side: THREE.DoubleSide })));
      shade.position.set(j * 4.5, 6.4, i * 4.5);
      const bulb = v.add(new THREE.Mesh(new THREE.CircleGeometry(0.36, 10), basic(0xffd27a)));
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(j * 4.5, 6.18, i * 4.5);
    }
  }
  v.shadowLight = spot(v, [0, 7, 1.5], [0, 0, -1], 0xffd8a0, 40, 0.55);
  spot(v, [-3, 6.5, -3], [0, 0, 0], 0xffc878, 20, 0.6);
  spot(v, [3, 6.5, -3], [0, 0, 0], 0xffc878, 20, 0.6);
  // Fold-out wooden bleachers on three sides
  const seats = [];
  const wood = mat('#8a5a2e');
  for (const [cx, cz, ry] of [[0, -8.5, 0], [-8.5, -1, Math.PI / 2], [8.5, -1, -Math.PI / 2]]) {
    for (let r = 0; r < 6; r++) {
      const step = v.add(new THREE.Mesh(new THREE.BoxGeometry(13, 0.28, 0.75), wood));
      const off = r * 0.75;
      step.position.set(cx + Math.sin(ry) * -off, -0.95 + r * 0.5, cz + Math.cos(ry) * -off);
      step.rotation.y = ry;
      for (let k = 0; k < 13; k++) {
        if (Math.random() > 0.72) continue;
        const along = -6 + k + Math.random() * 0.3;
        seats.push({
          x: step.position.x + Math.cos(ry) * along,
          y: -0.75 + r * 0.5,
          z: step.position.z - Math.sin(ry) * along,
          seated: true,
        });
      }
    }
  }
  crowd(v, seats, { palette: CASUAL });
  // Hand-made banners hanging from the beams
  banners(v, 11.5, 4.6, [
    ['REGIONAL CHAMPIONSHIP', '#7a1f22', '#ffe9a8'],
    ['COUNTY BOXING CLUB', '#1f4fa0', '#ffffff'],
    ['GO TIGERS!', '#e0a020', '#3a1a00'],
    ['REGIONAL CHAMPIONSHIP', '#7a1f22', '#ffe9a8'],
    ['FRIDAY FIGHT NIGHT', '#2b6a3a', '#ffffff'],
  ]);
}

function national(v) {
  v.background = 0x070a14;
  v.fog = [0x070a14, 14, 46];
  v.ambient = [0xbfd0ff, 0.25];
  ring(v, { canvas: '#2f66b8', apron: '#121a33', post: '#e8e8e8', pad: '#c42020', ropes: ['#c42020', '#f4f4f4', '#2050c0'], apronText: 'NATIONAL CHAMPIONSHIP' });
  arena(v, { radius: 7.5, rows: 14, density: 0.95, palette: BRIGHT, standColor: '#1c2236', height: 14, dim: 0.32, flashes: 250 });
  v.shadowLight = spot(v, [0, 9, 1.5], [0, 0, -1], 0xffffff, 28, 0.42);
  v.envIntensity = 0.2;
  spot(v, [3, 9, -2], [0, 0, -1], 0xffffff, 25, 0.5);
  spot(v, [-3, 9, -2], [0, 0, -1], 0xffffff, 25, 0.5);
  for (const x of [-4, -1.4, 1.4, 4]) beam(v, [x, 10, -2], [x * 0.2, 0, -1], 0xbfd4ff, 0.022);
  ceilingLights(v, 6, 10, 0xffffff);
  banners(v, 12, 4.8, Array(5).fill(['NATIONAL CHAMPIONSHIP', '#14203f', '#e8c070']));
  tvCrane(v, -3.4, -1.5);
  // Glowing LED band around the ring apron and press photographers' flashes
  const led = basic(0x58a8ff);
  for (let i = 0; i < 4; i++) {
    const strip = v.add(new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 0.62, 0.06, 0.02), led));
    const a = (i * Math.PI) / 2;
    strip.position.set(Math.sin(a) * (RING + 0.32), -0.12, Math.cos(a) * (RING + 0.32));
    strip.rotation.y = a;
  }
  v.onUpdate((dt, t) => led.color.setHSL(0.6 + Math.sin(t * 0.8) * 0.04, 1, 0.55 + Math.sin(t * 3) * 0.08));
}

function title(v) {
  // Las Vegas grand arena: huge, dark, gold and purple, thousands of camera flashes.
  v.background = 0x05030a;
  v.fog = [0x05030a, 18, 70];
  v.ambient = [0xffe0b0, 0.3];
  ring(v, { canvas: '#1b1f3a', apron: '#120c06', post: '#d4a72c', pad: '#d4a72c', ropes: ['#d4a72c', '#f4f4f4', '#b01c2e'], apronText: 'WORLD TITLE  •  LAS VEGAS', logo: true });
  arena(v, { radius: 8, rows: 22, density: 1, palette: SILHOUETTE, standColor: '#0d0a12', height: 22, flashes: 900, tiers: 2 });

  // Red carpet walkway toward the ring
  const carpet = v.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 9), mat('#8e0f1f')));
  carpet.position.set(-5.5, -0.99, -6);
  carpet.rotation.y = 0.6;

  // Gold trim ring around the arena + luxury banners
  const trim = v.add(new THREE.Mesh(new THREE.TorusGeometry(15, 0.12, 4, 48), mat('#d4a72c', { emissive: 0x6a4a00, emissiveIntensity: 0.6 })));
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 6;
  banners(v, 15, 6, Array(6).fill(['WORLD TITLE', '#4a0f18', '#f0c860']), true);

  // Jumbotron above the ring
  const tron = new THREE.Group();
  tron.position.set(0, 7.5, -0.5);
  v.add(tron);
  tron.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 3.2), mat('#111')));
  const screenTex = textTexture('WORLD TITLE', '#0b0b1a', '#f0c860', 512, 288, 'Bungee', 70, 'CHAMPIONSHIP FIGHT');
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6), basic(0xffffff, { map: screenTex }));
    const a = (i * Math.PI) / 2;
    s.position.set(Math.sin(a) * 1.61, 0, Math.cos(a) * 1.61);
    s.rotation.y = a;
    tron.add(s);
  }

  // Chandeliers
  for (const [x, z] of [[-9, -10], [9, -10], [0, -16]]) chandelier(v, x, 11, z);

  // Key light + sweeping purple/gold beams
  v.shadowLight = spot(v, [0, 10, 1.5], [0, 0, -1], 0xfff4e0, 70, 0.4);
  v.envIntensity = 0.2;
  spot(v, [0, 10, -3], [0, 0, 0], 0xffe8c0, 35, 0.45);
  const sweepers = [];
  [0x9b4dff, 0xffc640, 0x9b4dff, 0xffc640, 0xff4dd2, 0xffc640].forEach((color, i) => {
    const b = beam(v, [-7 + i * 2.8, 12, -9], [0, 0, 0], color, 0.13);
    sweepers.push({ b, phase: i * 1.3 });
  });
  v.onUpdate((dt, t) => {
    for (const s of sweepers) {
      s.b.rotation.z = Math.sin(t * 0.6 + s.phase) * 0.5;
      s.b.rotation.x = Math.cos(t * 0.45 + s.phase) * 0.25;
    }
  });

  // Spark fountains on the ring posts
  sparks(v, [[RING, RING], [-RING, RING], [RING, -RING], [-RING, -RING]]);
}

// ---------------------------------------------------------------- Shared pieces

function ring(v, o) {
  v.background ??= 0x000000;
  const platform = v.add(new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 0.6, 1, RING * 2 + 0.6), mat(o.apron)));
  platform.receiveShadow = true;
  platform.position.y = -0.5;
  const canvasMat = new THREE.MeshStandardMaterial({ map: o.logo ? logoTexture(o.canvas) : canvasTexture(o.canvas), roughness: 0.92 });
  const floor = v.add(new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 0.4, 0.04, RING * 2 + 0.4), canvasMat));
  floor.receiveShadow = true;
  floor.position.y = 0.0;
  if (o.apronText) {
    const tex = textTexture(o.apronText, o.apron, '#ffffff', 1024, 96, 'Bungee', 54);
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(RING * 2, 0.55), basic(0xffffff, { map: tex }));
      const a = (i * Math.PI) / 2;
      p.position.set(Math.sin(a) * (RING + 0.31), -0.45, Math.cos(a) * (RING + 0.31));
      p.rotation.y = a;
      v.add(p);
    }
  }
  const postMat = mat(o.post);
  const padMat = mat(o.pad);
  for (const [x, z] of [[RING, RING], [-RING, RING], [RING, -RING], [-RING, -RING]]) {
    const post = v.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.45, 16), postMat));
    post.position.set(x, 0.72, z);
    const pad = v.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.95, 0.22), padMat));
    pad.position.set(x * 0.985, 0.78, z * 0.985);
  }
  o.ropes.forEach((color, i) => {
    const m = mat(color, { roughness: 0.5 });
    const y = 0.45 + i * 0.35;
    for (let s = 0; s < 4; s++) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, RING * 2, 10), m);
      rope.rotation.z = Math.PI / 2;
      const a = (s * Math.PI) / 2;
      rope.rotation.y = a;
      rope.position.set(Math.sin(a) * RING, y, Math.cos(a) * RING);
      v.add(rope);
    }
  });
}

function room(v, { w, d, h, wall, floor, ceiling }) {
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    [
      ...Array(2).fill(new THREE.MeshStandardMaterial({ map: wall, side: THREE.BackSide, roughness: 0.95 })),
      new THREE.MeshStandardMaterial({ color: ceiling, side: THREE.BackSide }),
      new THREE.MeshStandardMaterial({ color: floor, side: THREE.BackSide }),
      ...Array(2).fill(new THREE.MeshStandardMaterial({ map: wall, side: THREE.BackSide, roughness: 0.95 })),
    ]
  );
  walls.position.y = -1 + h / 2;
  v.add(walls);
}

// Tiered stands around three sides of the ring, filled with an instanced crowd.
function arena(v, { radius, rows, density, palette, standColor, height, dim = 1, flashes = 0, tiers = 1 }) {
  const floor = v.add(new THREE.Mesh(new THREE.CircleGeometry(radius + rows * 0.9 + 10, 48), mat('#151515')));
  floor.receiveShadow = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  const shell = v.add(new THREE.Mesh(new THREE.CylinderGeometry(radius + rows * 0.9 + 8, radius + rows * 0.9 + 8, height + 4, 24, 1, true), mat(standColor, { side: THREE.BackSide })));
  shell.position.y = height / 2 - 2;

  const seats = [];
  const standMat = mat(standColor);
  for (let r = 0; r < rows; r++) {
    const tierGap = tiers > 1 && r >= rows / 2 ? 1.6 : 0;
    const dist = radius + r * 0.85 + tierGap;
    const y = -0.6 + r * 0.5 + tierGap;
    const step = v.add(new THREE.Mesh(new THREE.CylinderGeometry(dist + 0.42, dist + 0.42, 0.5, 40, 1, true, Math.PI * 0.12, Math.PI * 1.76), standMat));
    step.position.y = y - 0.25;
    const count = Math.floor(dist * 5.5);
    for (let i = 0; i < count; i++) {
      // Skip the area behind the camera (+z), leave it as the front row wall.
      const a = Math.PI * 0.12 + ((i + Math.random() * 0.4) / count) * Math.PI * 1.76;
      if (Math.random() > density) continue;
      seats.push({ x: Math.sin(a) * dist, y, z: Math.cos(a) * dist, seated: true });
    }
  }
  crowd(v, seats, { palette, dim });
  if (flashes) cameraFlashes(v, seats, flashes);
}

const CASUAL = ['#6d6d6d', '#4b5a6e', '#7a5a3c', '#3d5a40', '#8a3a30', '#c8b090', '#2e2e3a'];
const BRIGHT = ['#d24a3a', '#3a78d2', '#e8c040', '#3aa860', '#e8e8e8', '#8a4ad0', '#e07a30', '#2e2e3a'];
const SILHOUETTE = ['#1c1824', '#221c2c', '#18141f', '#2a2234'];
const SKINS = ['#f1c7a5', '#e0a77e', '#c68a5e', '#8d5a3b', '#5c3a24'];

// Instanced crowd with arms. Everyone bobs to the music; excitement makes people stand, raise their
// arms and pump their fists; v.startWave() sends a stadium wave around the arena.
const BEAT_HZ = 104 / 60; // matches the synthesized fight music
function crowd(v, seats, { palette, dim = 1 }) {
  if (!seats.length) return;
  const n = seats.length;
  const silhouette = palette === SILHOUETTE;
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.35, 2, 8), mat('#ffffff'), n);
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 1), mat('#ffffff'), n);
  const armGeo = new THREE.CapsuleGeometry(0.05, 0.26, 2, 6);
  armGeo.translate(0, -0.18, 0); // pivot at the shoulder
  const armsL = new THREE.InstancedMesh(armGeo, mat('#ffffff'), n);
  const armsR = new THREE.InstancedMesh(armGeo, mat('#ffffff'), n);
  const c = new THREE.Color();
  seats.forEach((s, i) => {
    c.set(palette[i % palette.length]).multiplyScalar(dim * (0.85 + Math.random() * 0.3));
    bodies.setColorAt(i, c);
    armsL.setColorAt(i, c);
    armsR.setColorAt(i, c);
    c.set(silhouette ? palette[(i + 1) % palette.length] : SKINS[i % SKINS.length]).multiplyScalar(dim);
    heads.setColorAt(i, c);
    s.phase = Math.random() * Math.PI * 2;
    s.sync = Math.random() < 0.7; // most of the crowd bounces on the beat
    s.speed = 2.5 + Math.random() * 3;
    s.thresh = 0.15 + Math.random() * 0.85; // how easily they get on their feet
    s.style = Math.floor(Math.random() * 3); // 0 = both arms up, 1 = one-arm fist pump, 2 = clap overhead
    s.stand = 0;
    s.rot = Math.atan2(-s.x, -s.z); // face the ring
    s.ang = (Math.atan2(s.x, s.z) + Math.PI * 2) % (Math.PI * 2);
    s.qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
    s.right = new THREE.Vector3(Math.cos(s.rot), 0, -Math.sin(s.rot));
    s.scale ??= 1;
  });
  for (const m of [bodies, heads, armsL, armsR]) v.add(m);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qz = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let lastT = 0;
  const update = (t, excitement) => {
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    const k = 1 - Math.exp(-5 * dt);
    const wave = v.waveT != null ? v.waveT : null;
    for (let i = 0; i < n; i++) {
      const s = seats[i];
      // Stadium wave: a band of standing fans travelling around the arena
      let w = 0;
      if (wave != null) {
        const d = Math.abs(s.ang - wave);
        w = Math.exp(-((d / 0.32) ** 2));
      }
      const ex = Math.min(1.5, excitement + v.baseline + w * 1.4);
      s.stand += ((ex > s.thresh ? 1 : 0) - s.stand) * k;
      const beat = s.sync ? t * BEAT_HZ * Math.PI * 2 + s.phase * 0.25 : t * s.speed + s.phase;
      const hop = Math.max(0, Math.sin(beat)) * (0.015 + ex * 0.09);
      const base = s.y + (s.seated ? 0.32 : 0.55) * s.scale + s.stand * 0.2 * s.scale;
      scl.setScalar(s.scale);
      m.compose(pos.set(s.x, base + hop, s.z), s.qYaw, scl);
      bodies.setMatrixAt(i, m);
      m.compose(pos.set(s.x, base + hop + 0.4 * s.scale, s.z), s.qYaw, scl);
      heads.setMatrixAt(i, m);

      // Arms: hang at the sides when calm, go up with excitement, pump on the beat
      const raise = Math.min(1, Math.max(0, (ex - s.thresh * 0.6) * 1.4)) * Math.max(s.stand, w);
      const pump = Math.sin(beat * (s.style === 2 ? 2 : 1)) * 0.35 * raise;
      for (const side of [-1, 1]) {
        let a = 0.18 + raise * 2.35;
        if (s.style === 1 && side === -1) a = 0.18 + raise * 0.4; // one-arm fist pumper
        if (s.style === 2) a = 0.18 + raise * 2.75;               // hands meet overhead (clapping)
        a += pump * (s.style === 2 ? side : 1);
        qz.setFromAxisAngle(zAxis, side * a);
        q.multiplyQuaternions(s.qYaw, qz);
        pos.set(s.x, base + hop + 0.2 * s.scale, s.z).addScaledVector(s.right, side * 0.19 * s.scale);
        m.compose(pos, q, scl);
        (side === -1 ? armsL : armsR).setMatrixAt(i, m);
      }
    }
    for (const mesh of [bodies, heads, armsL, armsR]) mesh.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);
  v.crowds.push({ update });
}

function cameraFlashes(v, seats, count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const s = seats[Math.floor(Math.random() * seats.length)];
    positions.set([s.x + (Math.random() - 0.5) * 0.3, s.y + 0.9, s.z], i * 3);
    sizes.push(Math.random());
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const colors = new Float32Array(count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  v.add(pts);
  const life = new Float32Array(count);
  v.onUpdate((dt) => {
    const rate = 0.012 + v.excitement * 0.04;
    for (let i = 0; i < count; i++) {
      if (life[i] <= 0 && Math.random() < rate) life[i] = 1;
      life[i] = Math.max(0, life[i] - dt * 6);
      const b = life[i] > 0 ? life[i] : 0.14 * (0.5 + sizes[i] * 0.5); // dim phone screens between flashes
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = b;
    }
    geo.attributes.color.needsUpdate = true;
  });
}

function sparks(v, spots) {
  const per = 60;
  const count = per * spots.length;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const age = new Float32Array(count).map(() => Math.random() * 1.2);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc860, size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  v.add(pts);
  const reset = (i) => {
    const [x, z] = spots[Math.floor(i / per)];
    pos.set([x, 1.5, z], i * 3);
    vel.set([(Math.random() - 0.5) * 0.8, 3 + Math.random() * 2.5, (Math.random() - 0.5) * 0.8], i * 3);
    age[i] = 0;
  };
  for (let i = 0; i < count; i++) reset(i);
  v.onUpdate((dt) => {
    for (let i = 0; i < count; i++) {
      age[i] += dt;
      if (age[i] > 1.2) reset(i);
      vel[i * 3 + 1] -= 6 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    geo.attributes.position.needsUpdate = true;
  });
}

function spot(v, p, target, color, intensity, angle) {
  const s = new THREE.SpotLight(color, intensity, 30, angle, 0.5, 1.2);
  s.position.set(...p);
  s.target.position.set(...target);
  v.add(s);
  v.add(s.target);
  return s;
}

// Visible light cone (fake volumetric beam)
function beam(v, p, target, color, opacity) {
  const len = 14;
  const geo = new THREE.ConeGeometry(1.4, len, 16, 1, true);
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(...p);
  const dir = new THREE.Vector3(...target).sub(m.position).normalize();
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const holder = new THREE.Group();
  holder.position.copy(m.position);
  m.position.set(0, 0, 0);
  holder.quaternion.copy(m.quaternion);
  m.quaternion.identity();
  holder.add(m);
  v.add(holder);
  return holder;
}

function ceilingLights(v, n, y, color) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const disc = v.add(new THREE.Mesh(new THREE.CircleGeometry(0.35, 10), basic(color)));
    disc.position.set(Math.sin(a) * 4, y, Math.cos(a) * 4 - 1);
    disc.rotation.x = Math.PI / 2;
  }
}

function banners(v, dist, y, list, gold = false) {
  list.forEach(([text, bg, fg], i) => {
    const a = Math.PI + (i - (list.length - 1) / 2) * 0.42;
    const tex = textTexture(text, bg, fg, 1024, 256, 'Bungee', text.length > 16 ? 82 : 120);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), basic(0xffffff, { map: tex }));
    m.position.set(Math.sin(a) * dist, y, Math.cos(a) * dist);
    m.lookAt(0, y, 0);
    v.add(m);
    if (gold) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.45, 0.05), mat('#d4a72c', { emissive: 0x5a3a00, emissiveIntensity: 0.5 }));
      frame.position.copy(m.position).multiplyScalar(1.002);
      frame.lookAt(0, y, 0);
      frame.translateZ(-0.04);
      v.add(frame);
    }
  });
}

function posters(v, spots, titles) {
  spots.forEach(([x, y, z, ry], i) => {
    const tex = posterTexture(titles[i % titles.length], i);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    p.position.set(x, y, z);
    p.rotation.y = ry;
    v.add(p);
  });
}

function chair(v, x, z, ry) {
  const g = new THREE.Group();
  const m = mat('#7a7f88');
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.42), m);
  seat.position.y = 0.45;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.04), m);
  back.position.set(0, 0.7, -0.2);
  g.add(seat, back);
  for (const [dx, dz] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45), m);
    leg.position.set(dx, 0.22, dz);
    g.add(leg);
  }
  g.position.set(x, -1, z);
  g.rotation.y = ry;
  v.add(g);
}

function tvCrane(v, x, z) {
  const g = new THREE.Group();
  const m = mat('#2a2a2e');
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8), m);
  base.position.y = -0.4;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3), m);
  arm.position.set(0, 0.6, 1);
  arm.rotation.x = -0.35;
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.55), mat('#3a3a40'));
  cam.position.set(0, 1.15, 2.35);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 10), mat('#111'));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.15, 2.7);
  const tally = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), basic(0xff2020));
  tally.position.set(0.12, 1.32, 2.4);
  g.add(base, arm, cam, lens, tally);
  g.position.set(x - 1.2, -0.2, z - 2.5);
  g.rotation.y = 0.9;
  v.add(g);
}

function chandelier(v, x, y, z) {
  const g = new THREE.Group();
  const gold = mat('#d4a72c', { emissive: 0x7a5200, emissiveIntensity: 0.6 });
  g.add(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.06, 4, 16), gold));
  g.children[0].rotation.x = Math.PI / 2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), basic(0xfff2cc));
    crystal.position.set(Math.cos(a) * 1.2, -0.2, Math.sin(a) * 1.2);
    g.add(crystal);
  }
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), basic(0xfff6dd));
  core.position.y = -0.4;
  g.add(core);
  g.position.set(x, y, z);
  v.add(g);
}

// ---------------------------------------------------------------- Canvas textures

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function brickTexture(brick, mortar) {
  const t = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = mortar;
    c.fillRect(0, 0, w, h);
    const bw = 64, bh = 28;
    for (let y = 0; y < h; y += bh) {
      for (let x = -bw; x < w; x += bw) {
        const off = (y / bh) % 2 ? bw / 2 : 0;
        const l = 0.85 + Math.random() * 0.25;
        c.fillStyle = new THREE.Color(brick).multiplyScalar(l).getStyle();
        c.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 3);
  return t;
}

function blockTexture(block, mortar) {
  const t = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = mortar;
    c.fillRect(0, 0, w, h);
    const bw = 128, bh = 64;
    for (let y = 0; y < h; y += bh) {
      for (let x = -bw; x < w; x += bw) {
        const off = (y / bh) % 2 ? bw / 2 : 0;
        c.fillStyle = new THREE.Color(block).multiplyScalar(0.92 + Math.random() * 0.12).getStyle();
        c.fillRect(x + off + 3, y + 3, bw - 6, bh - 6);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 3);
  return t;
}

export function textTexture(text, bg, fg, w, h, font, size, sub = null) {
  return canvasTex(w, h, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let s = size;
    c.font = `${s}px ${font}, Impact, sans-serif`;
    while (c.measureText(text).width > w * 0.92 && s > 10) c.font = `${(s -= 4)}px ${font}, Impact, sans-serif`;
    c.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) {
      c.font = `${size * 0.4}px ${font}, Impact, sans-serif`;
      c.fillText(sub, w / 2, h * 0.72);
    }
  });
}

function posterTexture(titleText, seed) {
  const bgs = ['#e8dcc0', '#f0c24a', '#c43a2e', '#2a2a2a'];
  const bg = bgs[seed % bgs.length];
  const fg = bg === '#2a2a2a' || bg === '#c43a2e' ? '#f4ead0' : '#1a1a1a';
  return canvasTex(256, 352, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.font = '30px Bungee, Impact, sans-serif';
    const words = titleText.split(' ');
    words.forEach((wd, i) => c.fillText(wd, w / 2, 46 + i * 34));
    // two boxer silhouettes facing off
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(w / 2 + s * 50, 210, 24, 0, Math.PI * 2);
      c.fill();
      c.fillRect(w / 2 + s * 50 - 28, 236, 56, 80);
      c.beginPath();
      c.arc(w / 2 + s * 18, 250, 16, 0, Math.PI * 2);
      c.fill();
    }
  });
}

// Ring canvas: slightly mottled fabric with scuffs, so the floor doesn't look like flat plastic.
function canvasTexture(color) {
  const t = canvasTex(1024, 1024, (c, w, h) => {
    c.fillStyle = color;
    c.fillRect(0, 0, w, h);
    const base = new THREE.Color(color);
    for (let i = 0; i < 2500; i++) {
      c.fillStyle = base.clone().multiplyScalar(0.9 + Math.random() * 0.2).getStyle();
      c.globalAlpha = 0.25;
      const r = 4 + Math.random() * 18;
      c.beginPath();
      c.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 0.08;
    c.strokeStyle = '#000';
    for (let i = 0; i < 40; i++) {
      c.lineWidth = 2 + Math.random() * 4;
      c.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      c.moveTo(x, y);
      c.quadraticCurveTo(x + rnd(80), y + rnd(80), x + rnd(160), y + rnd(160));
      c.stroke();
    }
    c.globalAlpha = 1;
  });
  return t;
}
const rnd = (n) => (Math.random() - 0.5) * 2 * n;

function logoTexture(color) {
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = color;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d4a72c';
    c.lineWidth = 10;
    c.beginPath();
    c.arc(w / 2, h / 2, 150, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#d4a72c';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '64px Bungee, Impact, sans-serif';
    c.fillText('WORLD', w / 2, h / 2 - 34);
    c.fillText('TITLE', w / 2, h / 2 + 40);
  });
}
