import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const exporter = new STLExporter();

// ── Handle (asa) ──────────────────────────────────────────────────────────────
// Rectangular block attached to the back face (Z=0) of the plate, centred in
// X and Y, protruding in the −Z direction.  When the user flips the plate to
// print, the handle ends up on top as a natural grip.
const HANDLE_W = 30;   // mm wide (X)
const HANDLE_H = 20;   // mm deep (Y)
const HANDLE_D = 15;   // mm protrusion out the back (Z)

function handleGeo(width, height) {
  const hw = Math.min(HANDLE_W, width  * 0.6);
  const hh = Math.min(HANDLE_H, height * 0.4);
  const g = new THREE.BoxGeometry(hw, hh, HANDLE_D);
  g.translate(width / 2, height / 2, -HANDLE_D / 2);
  return g;
}

// ── Mask downsampling ─────────────────────────────────────────────────────────
function downsampleMask(assignment, colorIndex, srcW, srcH, maxRes = 300) {
  const scale = Math.min(1, maxRes / Math.max(srcW, srcH));
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  const mask = new Uint8Array(dstW * dstH);
  const scaleX = srcW / dstW, scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor(dx * scaleX), x1 = Math.ceil((dx + 1) * scaleX);
      const y0 = Math.floor(dy * scaleY), y1 = Math.ceil((dy + 1) * scaleY);
      let active = 0, total = 0;
      for (let sy = y0; sy < y1; sy++)
        for (let sx = x0; sx < x1; sx++) {
          if (assignment[sy * srcW + sx] === colorIndex) active++;
          total++;
        }
      mask[dy * dstW + dx] = active > total / 2 ? 1 : 0;
    }
  }
  return { mask, w: dstW, h: dstH };
}

function toSTL(geos) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(mergeGeometries(geos, false)));
  return exporter.parse(scene, { binary: true });
}

// ── Layer STL ─────────────────────────────────────────────────────────────────
/**
 * Base plate + extruded color layer + back handle.
 *
 * Coordinate system (as printed):
 *   Z < 0               → handle (flipped = grip on top when using)
 *   0 … plateHeight     → base plate
 *   plateHeight … total → relief (printing surface, faces down when using)
 */
export function generateLayerSTL(assignment, colorIndex, srcW, srcH,
  { width, height, plateHeight, reliefHeight }) {

  const { mask, w, h } = downsampleMask(assignment, colorIndex, srcW, srcH);

  // Uniform scale (contain): keep image aspect ratio, centre inside the plate.
  const pxSize = Math.min(width / w, height / h);
  const offX   = (width  - w * pxSize) / 2;
  const offY   = (height - h * pxSize) / 2;

  const geos = [];

  // Base plate
  const plate = new THREE.BoxGeometry(width, height, plateHeight);
  plate.translate(width / 2, height / 2, plateHeight / 2);
  geos.push(plate);

  // Raised prisms (run-length per row)
  for (let row = 0; row < h; row++) {
    let start = -1;
    for (let col = 0; col <= w; col++) {
      const on = col < w && mask[row * w + col] === 1;
      if (on && start === -1) { start = col; }
      else if (!on && start !== -1) {
        const runW = (col - start) * pxSize;
        const geo = new THREE.BoxGeometry(runW, pxSize, reliefHeight);
        geo.translate(
          offX + start * pxSize + runW / 2,
          offY + (h - 1 - row) * pxSize + pxSize / 2,
          plateHeight + reliefHeight / 2,
        );
        geos.push(geo);
        start = -1;
      }
    }
  }

  // Back handle
  geos.push(handleGeo(width, height));

  return toSTL(geos);
}

// ── Frame STL ─────────────────────────────────────────────────────────────────
/**
 * Hollow rectangular frame for screen-printing registration.
 *
 * Inner hole  = plate dims + 0.25 mm clearance on every side (0.5 mm total).
 * Wall thickness = 2 mm.
 * Height = plateHeight + reliefHeight  (matches the full layer height).
 *
 * Place this frame on the screen/table, slide each layer plate inside it and
 * all layers will be perfectly centred.
 */
export function generateFrameSTL({ width, height, plateHeight, reliefHeight }) {
  const clearance  = 0.25;   // mm each side → 0.5 mm total per axis
  const wallThick  = 2;      // mm
  const totalH     = plateHeight + reliefHeight;

  // Outer dimensions
  const ow = width  + 2 * clearance + 2 * wallThick;
  const oh = height + 2 * clearance + 2 * wallThick;
  const tw = wallThick;

  const geos = [];

  // Left wall  (full height of frame)
  const left = new THREE.BoxGeometry(tw, oh, totalH);
  left.translate(tw / 2, oh / 2, totalH / 2);
  geos.push(left);

  // Right wall
  const right = new THREE.BoxGeometry(tw, oh, totalH);
  right.translate(ow - tw / 2, oh / 2, totalH / 2);
  geos.push(right);

  // Bottom wall  (between the two vertical walls, no overlap)
  const innerSpan = ow - 2 * tw;
  const bottom = new THREE.BoxGeometry(innerSpan, tw, totalH);
  bottom.translate(ow / 2, tw / 2, totalH / 2);
  geos.push(bottom);

  // Top wall
  const top = new THREE.BoxGeometry(innerSpan, tw, totalH);
  top.translate(ow / 2, oh - tw / 2, totalH / 2);
  geos.push(top);

  return toSTL(geos);
}
