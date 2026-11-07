// Comic-book look: swaps PBR materials for banded toon shading and adds inked outlines
// (inverted hull, extruded in view space so the line keeps a constant on-screen width).
import * as THREE from 'three';

export const INK = new THREE.Color('#120d1c');

let gradient = null;
function gradientMap() {
  if (gradient) return gradient;
  // 3 hard comic bands: shadow, half-tone, lit (the halftone dots do the in-between shading)
  const tones = [92, 168, 245];
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const outlineMats = new Map();
function outlineMaterial(thickness) {
  if (outlineMats.has(thickness)) return outlineMats.get(thickness);
  const m = new THREE.ShaderMaterial({
    uniforms: { thickness: { value: thickness }, color: { value: INK } },
    vertexShader: /* glsl */ `
      uniform float thickness;
      void main() {
        vec3 pos = position;
        vec3 nrm = normal;
        #ifdef USE_INSTANCING
          pos = (instanceMatrix * vec4(pos, 1.0)).xyz;
          nrm = mat3(instanceMatrix) * nrm;
        #endif
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vec3 n = normalize(mat3(modelViewMatrix) * nrm);
        mv.xyz += n * thickness * max(-mv.z, 0.25);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() { gl_FragColor = vec4(color, 1.0); }`,
    side: THREE.BackSide,
  });
  outlineMats.set(thickness, m);
  return m;
}

// Comic halftone: printed dots in the shaded areas, sized by how dark the surface is.
const HALFTONE = { dot: { value: 5.5 * Math.min(window.devicePixelRatio || 1, 2) } };
function addHalftone(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDot = HALFTONE.dot;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uDot;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `{
          float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
          float base = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.05);
          float shade = lum / base;
          vec2 q = gl_FragCoord.xy / uDot;
          q = vec2(q.x - q.y, q.x + q.y) * 0.7071;
          float d = length(fract(q) - 0.5);
          float r = clamp((0.82 - shade) * 0.85, 0.0, 0.5);
          outgoingLight *= mix(1.0, 0.6, 1.0 - smoothstep(r - 0.06, r, d));
        }
        #include <opaque_fragment>`
      );
  };
  material.customProgramCacheKey = () => 'halftone';
}

export function toonMaterial(m, saturate = 0.06) {
  if (!m?.isMeshStandardMaterial) return m;
  const t = new THREE.MeshToonMaterial({
    color: m.color.clone().offsetHSL(0, saturate, 0),
    map: m.map,
    emissive: m.emissive.clone(),
    emissiveIntensity: m.emissiveIntensity,
    emissiveMap: m.emissiveMap,
    transparent: m.transparent,
    opacity: m.opacity,
    side: m.side,
    depthWrite: m.depthWrite,
    vertexColors: m.vertexColors,
    alphaTest: m.alphaTest,
    gradientMap: gradientMap(),
  });
  t.name = m.name;
  if (!m.transparent) addHalftone(t);
  return t;
}

// Convert every PBR material under `root` to toon and ink the outlines.
// outline: true | false | (mesh) => boolean. Returns a Map(oldMaterial → newMaterial) so callers
// can re-point any material references they kept.
export function toonify(root, { outline = true, thickness = 0.004 } = {}) {
  const swapped = new Map();
  const swap = (m) => {
    if (!m?.isMeshStandardMaterial) return m;
    if (!swapped.has(m)) {
      swapped.set(m, toonMaterial(m));
      m.dispose();
    }
    return swapped.get(m);
  };
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline) meshes.push(o);
  });
  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const wants = typeof outline === 'function' ? outline(mesh) : outline;
    if (!wants || !m?.isMeshToonMaterial || m.transparent || m.side === THREE.BackSide || mesh.userData.noOutline) continue;
    let ink;
    if (mesh.isInstancedMesh) {
      ink = new THREE.InstancedMesh(mesh.geometry, outlineMaterial(thickness), mesh.count);
      ink.instanceMatrix = mesh.instanceMatrix; // shared: moves with the crowd
      ink.frustumCulled = false;
    } else {
      ink = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
    }
    ink.userData.isOutline = true;
    ink.renderOrder = -1;
    mesh.add(ink);
  }
  return swapped;
}

// Small meshes only (props, ring posts, ropes, crowd) — big walls/floors/stands stay unlined.
export function smallMeshes(maxRadius = 3.2) {
  return (mesh) => {
    if (mesh.isInstancedMesh) return true;
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const s = mesh.scale;
    return g.boundingSphere.radius * Math.max(s.x, s.y, s.z) < maxRadius;
  };
}
