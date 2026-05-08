/** Helpers for layer display and metadata. */

export function centroidToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** True if the color is perceptually light (useful for choosing label contrast). */
export function isLight([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/** Count how many pixels belong to each centroid index. */
export function pixelCounts(assignment, k) {
  const counts = new Array(k).fill(0);
  for (const a of assignment) if (a >= 0) counts[a]++;
  return counts;
}

/**
 * Render a layer mask onto a canvas element.
 * Active pixels → centroid color; inactive pixels → transparent.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Int32Array} assignment
 * @param {number} colorIndex
 * @param {[r,g,b]} centroid
 * @param {number} width
 * @param {number} height
 */
export function renderLayerCanvas(canvas, assignment, colorIndex, centroid, width, height) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  const [r, g, b] = centroid;

  for (let i = 0; i < width * height; i++) {
    if (assignment[i] === colorIndex) {
      img.data[i * 4]     = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
