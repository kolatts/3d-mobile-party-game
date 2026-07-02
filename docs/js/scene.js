// scene.js — shared Three.js scene setup used by both sculptor.js and viewer.js.
// Owns: renderer, camera, damped orbit controls, studio lighting (hemisphere +
// shadowed key light), soft contact-shadow ground, optional grid / pedestal,
// resize handling and the render loop.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const GRID_SIZE = 16;
export const MAX_VOXELS = 512;

// Palette from DESIGN.md sculpture JSON format (FROZEN order).
export const PALETTE = [
  '#e63946', '#f4a261', '#e9c46a', '#2a9d8f',
  '#264653', '#a8dadc', '#ffffff', '#6d597a',
];

const HALF = GRID_SIZE / 2;

// Voxel grid coords (0..15 ints) -> world position of the cube center.
// The grid is centered on the origin; cubes sit on the y=0 ground plane.
export function voxelToWorld(x, y, z) {
  return new THREE.Vector3(x - HALF + 0.5, y + 0.5, z - HALF + 0.5);
}

// World point (on/near ground) -> integer grid cell, or null if out of bounds.
export function worldToVoxel(p) {
  const x = Math.floor(p.x + HALF);
  const y = Math.floor(p.y);
  const z = Math.floor(p.z + HALF);
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return null;
  return { x, y, z };
}

export function inBounds(x, y, z) {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && z >= 0 && z < GRID_SIZE;
}

/**
 * Create a full scene context inside `container`.
 * opts: { grid: bool, pedestal: bool, autoRotate: bool }
 * Returns { renderer, scene, camera, controls, ground, dispose, setTick, start, stop }
 */
export function createSceneContext(container, opts = {}) {
  const { grid = false, pedestal = false, autoRotate = false } = opts;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
  camera.position.set(16, 15, 20);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 3.5, 0);
  controls.minDistance = 8;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.enablePan = false;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 1.6;

  // Studio lighting: soft sky/ground hemisphere + warm shadowed key light.
  const hemi = new THREE.HemisphereLight(0xbfc8ff, 0x3a2d52, 0.95);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff3e0, 1.5);
  key.position.set(14, 24, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -16;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8ea0ff, 0.35);
  fill.position.set(-12, 8, -10);
  scene.add(fill);

  // Ground: invisible-but-shadowed plane. Also the raycast target for building.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.ShadowMaterial({ opacity: 0.35 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  if (grid) {
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x8b7fd4, 0x4a4070);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.35;
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Faint workspace floor tint so the buildable area reads on the gradient bg.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
      new THREE.MeshBasicMaterial({ color: 0x241d3e, transparent: true, opacity: 0.5 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.005;
    scene.add(floor);
  }

  if (pedestal) {
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(HALF + 3, HALF + 4, 1.4, 48),
      new THREE.MeshStandardMaterial({ color: 0x2b2347, roughness: 0.9, metalness: 0.05 }),
    );
    ped.position.y = -0.7;
    ped.receiveShadow = true;
    scene.add(ped);
  }

  // --- sizing ---
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // --- render loop ---
  let running = false;
  let tick = null;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    controls.update();
    if (tick) tick();
    renderer.render(scene, camera);
  }
  function start() {
    if (running) return;
    running = true;
    frame();
  }
  function stop() { running = false; }

  function dispose() {
    stop();
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return {
    renderer, scene, camera, controls, ground,
    start, stop, dispose, resize,
    setTick(fn) { tick = fn; },
  };
}

/**
 * Build an InstancedMesh for a voxel list. `voxels` is an array of
 * [x, y, z, paletteIndex] tuples; `palette` is an array of hex colors.
 * `capacity` reserves instance slots for editors that grow the mesh.
 */
export function createVoxelMesh(voxels, palette, capacity) {
  const cap = Math.max(capacity || voxels.length, 1);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  updateVoxelMesh(mesh, voxels, palette);
  return mesh;
}

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** Refresh instance matrices + colors from a voxel tuple list. */
export function updateVoxelMesh(mesh, voxels, palette) {
  const n = Math.min(voxels.length, mesh.instanceMatrix.count);
  for (let i = 0; i < n; i++) {
    const [x, y, z, ci] = voxels[i];
    const p = voxelToWorld(x, y, z);
    _m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, _m);
    _c.set(palette[ci % palette.length] || '#ffffff');
    mesh.setColorAt(i, _c);
  }
  if (n === 0) {
    // Keep buffers allocated so instanceColor exists even when empty.
    mesh.setColorAt(0, _c.set('#ffffff'));
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}
