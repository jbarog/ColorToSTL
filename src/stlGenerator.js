import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import {
  HANDLE_W, HANDLE_H, HANDLE_D,
  MIN_FRAME_HEIGHT, FRAME_CLEARANCE, FRAME_WALL_THICK,
} from './config.js';

const exporter = new STLExporter();

// ── Handle (asa) ──────────────────────────────────────────────────────────────
// Rectangular block attached to the back face (Z=0) of the plate, centred in
// X and Y, protruding in the −Z direction.  When the user flips the plate to
// print, the handle ends up on top as a natural grip.
function handleGeo(width, height) {
  const hw = Math.min(HANDLE_W, width  * 0.6);
  const hh = Math.min(HANDLE_H, height * 0.4);
  const g = new THREE.BoxGeometry(hw, hh, HANDLE_D);
  g.translate(width / 2, height / 2, -HANDLE_D / 2);
  return g;
}

// ── Mask downsampling ─────────────────────────────────────────────────────────
// maxRes = 0 (or falsy) keeps source resolution.
function downsampleMask(assignment, colorIndex, srcW, srcH, maxRes) {
  if (!maxRes || Math.max(srcW, srcH) <= maxRes) {
    const mask = new Uint8Array(srcW * srcH);
    for (let i = 0; i < mask.length; i++) {
      if (assignment[i] === colorIndex) mask[i] = 1;
    }
    return { mask, w: srcW, h: srcH };
  }

  const scale = maxRes / Math.max(srcW, srcH);
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

// ── Greedy 2D rectangle decomposition ─────────────────────────────────────────
// Returns an array of {x, y, w, h} covering every "on" pixel exactly once.
// Equivalent topology to the per-pixel mesh, but with far fewer rectangles
// for solid color regions — keeps triangle count manageable at high res.
function greedyRects(mask, w, h) {
  const visited = new Uint8Array(w * h);
  const rects = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || visited[idx]) continue;

      let x1 = x;
      while (x1 < w && mask[y * w + x1] && !visited[y * w + x1]) x1++;
      const rw = x1 - x;

      let y1 = y + 1;
      while (y1 < h) {
        let ok = true;
        const rowStart = y1 * w;
        for (let xi = x; xi < x1; xi++) {
          if (!mask[rowStart + xi] || visited[rowStart + xi]) { ok = false; break; }
        }
        if (!ok) break;
        y1++;
      }
      const rh = y1 - y;

      for (let yi = y; yi < y1; yi++) {
        const rowStart = yi * w;
        for (let xi = x; xi < x1; xi++) visited[rowStart + xi] = 1;
      }
      rects.push({ x, y, w: rw, h: rh });
    }
  }
  return rects;
}

function toSTL(geos) {
  const scene = new THREE.Scene();
  let merged = mergeGeometries(geos, false);
  merged = mergeVertices(merged);
  merged.computeVertexNormals();
  scene.add(new THREE.Mesh(merged));
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
  { width, height, plateHeight, reliefHeight, maxRes = 600, invert = false }) {

  const { mask, w, h } = downsampleMask(assignment, colorIndex, srcW, srcH, maxRes);

  // Uniform scale (contain): keep image aspect ratio, centre inside the plate.
  const pxSize = Math.min(width / w, height / h);
  const offX   = (width  - w * pxSize) / 2;
  const offY   = (height - h * pxSize) / 2;

  const geos = [];

  // Base plate
  const plate = new THREE.BoxGeometry(width, height, plateHeight);
  plate.translate(width / 2, height / 2, plateHeight / 2);
  geos.push(plate);

  // Raised prisms — one box per greedy rectangle.
  const rects = greedyRects(mask, w, h);
  for (const r of rects) {
    const rw = r.w * pxSize;
    const rh = r.h * pxSize;
    const geo = new THREE.BoxGeometry(rw, rh, reliefHeight);
    const rx = invert
      ? offX + (w - r.x - r.w) * pxSize + rw / 2
      : offX + r.x * pxSize + rw / 2;
    geo.translate(
      rx,
      offY + (h - r.y - r.h) * pxSize + rh / 2,
      plateHeight + reliefHeight / 2,
    );
    geos.push(geo);
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
  const totalH     = Math.max(MIN_FRAME_HEIGHT, 2 * plateHeight + reliefHeight);

  // Outer dimensions
  const ow = width  + 2 * FRAME_CLEARANCE + 2 * FRAME_WALL_THICK;
  const oh = height + 2 * FRAME_CLEARANCE + 2 * FRAME_WALL_THICK;
  const tw = FRAME_WALL_THICK;

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
