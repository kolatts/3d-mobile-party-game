// sculptor.js — touch-first Three.js voxel editor for the SCULPT screen.
//
// Interaction model (mobile-friendly, explicit modes):
//   BUILD  — tap a voxel face or the ground grid to add a voxel there
//   ERASE  — tap a voxel to remove it
//   ROTATE — one-finger drag orbits the camera
// Pinch-zoom works in every mode. A tap is a pointer press that moves < 10px.
//
// app.js owns the toolbar DOM and calls setMode / setColor / undo / serialize.

import * as THREE from 'three';
import {
  createSceneContext, createVoxelMesh, updateVoxelMesh,
  voxelToWorld, worldToVoxel, inBounds, PALETTE, GRID_SIZE, MAX_VOXELS,
} from './scene.js';

const key = (x, y, z) => `${x},${y},${z}`;

export class Sculptor {
  /**
   * @param {HTMLElement} container full-viewport canvas host
   * @param {{ onChange?: (count:number)=>void }} opts
   */
  constructor(container, opts = {}) {
    this.onChange = opts.onChange || (() => {});
    this.ctx = createSceneContext(container, { grid: true });

    this.voxels = new Map();          // "x,y,z" -> paletteIndex
    this.undoStack = [];              // [{ op:'add'|'remove', x,y,z, color }]
    this.mode = 'build';
    this.colorIndex = 0;

    this.mesh = createVoxelMesh([], PALETTE, MAX_VOXELS);
    this.ctx.scene.add(this.mesh);
    this._instanceKeys = [];          // instanceId -> voxel key

    // Ghost cube preview under the cursor (desktop nicety, harmless on touch).
    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.ghost.visible = false;
    this.ctx.scene.add(this.ghost);

    this.raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._down = null;                // { id, x, y, t }
    this._multiTouch = false;
    this._activePointers = 0;

    this._bindInput();
    this.setMode('build');
    this.ctx.start();
  }

  // ------------------------------------------------------------------ input

  _bindInput() {
    const el = this.ctx.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      this._activePointers++;
      if (this._activePointers > 1) this._multiTouch = true;
      if (this._activePointers === 1) {
        this._down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
        this._multiTouch = false;
      }
    });

    el.addEventListener('pointerup', (e) => {
      this._activePointers = Math.max(0, this._activePointers - 1);
      const d = this._down;
      if (!d || d.id !== e.pointerId) return;
      this._down = null;
      if (this._multiTouch) return;
      const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const dt = performance.now() - d.t;
      if (dist < 10 && dt < 600 && this.mode !== 'rotate') {
        this._handleTap(e.clientX, e.clientY);
      }
    });

    el.addEventListener('pointercancel', () => {
      this._activePointers = 0;
      this._down = null;
    });

    // Hover ghost preview (mouse only).
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.mode !== 'build') {
        this.ghost.visible = false;
        return;
      }
      const target = this._pickPlacement(e.clientX, e.clientY);
      if (target) {
        const p = voxelToWorld(target.x, target.y, target.z);
        this.ghost.position.copy(p);
        this.ghost.visible = true;
      } else {
        this.ghost.visible = false;
      }
    });
    el.addEventListener('pointerleave', () => { this.ghost.visible = false; });
  }

  _setPointerFromClient(cx, cy) {
    const rect = this.ctx.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this._pointer, this.ctx.camera);
  }

  _raycast(cx, cy) {
    this._setPointerFromClient(cx, cy);
    const targets = this.voxels.size > 0 ? [this.mesh, this.ctx.ground] : [this.ctx.ground];
    const hits = this.raycaster.intersectObjects(targets, false);
    return hits.length ? hits[0] : null;
  }

  // Where would a BUILD tap place a voxel? Returns {x,y,z} or null.
  _pickPlacement(cx, cy) {
    const hit = this._raycast(cx, cy);
    if (!hit) return null;
    let cell = null;
    if (hit.object === this.mesh && hit.instanceId !== undefined) {
      const k = this._instanceKeys[hit.instanceId];
      if (!k) return null;
      const [x, y, z] = k.split(',').map(Number);
      const n = hit.face.normal; // unit cubes, translation-only instances: object normal == world normal
      cell = { x: x + Math.round(n.x), y: y + Math.round(n.y), z: z + Math.round(n.z) };
    } else if (hit.object === this.ctx.ground) {
      const p = hit.point;
      cell = worldToVoxel(new THREE.Vector3(p.x, 0.01, p.z));
    }
    if (!cell) return null;
    if (!inBounds(cell.x, cell.y, cell.z)) return null;
    if (this.voxels.has(key(cell.x, cell.y, cell.z))) return null;
    return cell;
  }

  _handleTap(cx, cy) {
    if (this.mode === 'build') {
      const cell = this._pickPlacement(cx, cy);
      if (!cell) return;
      if (this.voxels.size >= MAX_VOXELS) return;
      this._addVoxel(cell.x, cell.y, cell.z, this.colorIndex, true);
    } else if (this.mode === 'erase') {
      const hit = this._raycast(cx, cy);
      if (!hit || hit.object !== this.mesh || hit.instanceId === undefined) return;
      const k = this._instanceKeys[hit.instanceId];
      if (!k) return;
      const [x, y, z] = k.split(',').map(Number);
      this._removeVoxel(x, y, z, true);
    }
  }

  // ------------------------------------------------------------------ model

  _addVoxel(x, y, z, colorIndex, recordUndo) {
    const k = key(x, y, z);
    if (this.voxels.has(k)) return false;
    this.voxels.set(k, colorIndex);
    if (recordUndo) this.undoStack.push({ op: 'add', x, y, z, color: colorIndex });
    this._rebuild();
    return true;
  }

  _removeVoxel(x, y, z, recordUndo) {
    const k = key(x, y, z);
    if (!this.voxels.has(k)) return false;
    const color = this.voxels.get(k);
    this.voxels.delete(k);
    if (recordUndo) this.undoStack.push({ op: 'remove', x, y, z, color });
    this._rebuild();
    return true;
  }

  _rebuild() {
    const list = [];
    this._instanceKeys = [];
    for (const [k, ci] of this.voxels) {
      const [x, y, z] = k.split(',').map(Number);
      list.push([x, y, z, ci]);
      this._instanceKeys.push(k);
    }
    updateVoxelMesh(this.mesh, list, PALETTE);
    this.onChange(this.voxels.size);
  }

  // ------------------------------------------------------------------ API

  setMode(mode) {
    this.mode = mode; // 'build' | 'erase' | 'rotate'
    const c = this.ctx.controls;
    c.enableRotate = mode === 'rotate';
    c.enableZoom = true; // pinch/wheel zoom always available
    if (mode !== 'build') this.ghost.visible = false;
  }

  setColor(i) {
    this.colorIndex = Math.max(0, Math.min(PALETTE.length - 1, i));
  }

  undo() {
    const op = this.undoStack.pop();
    if (!op) return;
    if (op.op === 'add') this._removeVoxel(op.x, op.y, op.z, false);
    else this._addVoxel(op.x, op.y, op.z, op.color, false);
  }

  get count() { return this.voxels.size; }
  get canUndo() { return this.undoStack.length > 0; }

  reset() {
    this.voxels.clear();
    this.undoStack.length = 0;
    this._rebuild();
    // Reset camera framing for a new sculpt.
    const { camera, controls } = this.ctx;
    controls.target.set(0, 3.5, 0);
    camera.position.set(16, 15, 20);
    controls.update();
    this.setMode('build');
    this.setColor(0);
  }

  /** Serialize to the FROZEN sculpture JSON format from DESIGN.md. */
  serialize() {
    const voxels = [];
    for (const [k, ci] of this.voxels) {
      const [x, y, z] = k.split(',').map(Number);
      voxels.push([x, y, z, ci]);
    }
    return { v: 1, size: GRID_SIZE, palette: PALETTE.slice(), voxels };
  }

  /** Test hook: place a voxel programmatically (used by Playwright). */
  debugPlaceVoxel(x, y, z, colorIndex = 0) {
    if (!inBounds(x, y, z)) return false;
    return this._addVoxel(x, y, z, colorIndex, true);
  }

  start() { this.ctx.start(); }
  stop() { this.ctx.stop(); }

  dispose() {
    this.ctx.dispose();
  }
}
