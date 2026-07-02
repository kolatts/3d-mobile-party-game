// viewer.js — turntable sculpture viewer used by the GUESS screen and the
// REVEAL gallery. Auto-rotates on a pedestal; user can orbit (auto-rotate
// pauses while interacting, resumes a moment later).

import * as THREE from 'three';
import { createSceneContext, createVoxelMesh, PALETTE } from './scene.js';
import { fetchSculpture } from './api.js';

export class Viewer {
  constructor(container) {
    this.container = container;
    this.ctx = createSceneContext(container, { pedestal: true, autoRotate: true });
    this.mesh = null;
    this._resumeTimer = null;

    const { controls } = this.ctx;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      if (this._resumeTimer) clearTimeout(this._resumeTimer);
    });
    controls.addEventListener('end', () => {
      this._resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 2500);
    });
  }

  start() { this.ctx.start(); }
  stop() { this.ctx.stop(); }

  clear() {
    if (this.mesh) {
      this.ctx.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }

  /** Load a sculpture JSON object ({ v, size, palette, voxels }). */
  load(sculpture) {
    this.clear();
    const palette = (sculpture && sculpture.palette) || PALETTE;
    const voxels = (sculpture && sculpture.voxels) || [];
    this.mesh = createVoxelMesh(voxels, palette, Math.max(voxels.length, 1));
    this.ctx.scene.add(this.mesh);
    this._frame(voxels);
  }

  /** Fetch sculpture JSON from a blob URL and display it. */
  async loadUrl(blobUrl) {
    const sculpture = await fetchSculpture(blobUrl);
    this.load(sculpture);
    return sculpture;
  }

  // Aim the orbit target at the sculpture's vertical center and reset a
  // pleasant camera distance based on its extent.
  _frame(voxels) {
    let maxY = 2;
    let extent = 4;
    if (voxels.length) {
      let minX = 16, maxX = 0, minZ = 16, maxZ = 0, top = 0;
      for (const [x, y, z] of voxels) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
        if (y > top) top = y;
      }
      maxY = top + 1;
      extent = Math.max(maxX - minX + 1, maxZ - minZ + 1, maxY);
    }
    const { camera, controls } = this.ctx;
    controls.target.set(0, Math.max(1.5, maxY / 2), 0);
    const dist = Math.max(14, extent * 2.1);
    const dir = new THREE.Vector3(0.8, 0.62, 1).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    controls.update();
  }

  dispose() {
    if (this._resumeTimer) clearTimeout(this._resumeTimer);
    this.clear();
    this.ctx.dispose();
  }
}
