import { MAX_IMAGE_DIM } from "./config";

/**
 * K-means++ color quantization.
 * All computation runs synchronously in the browser on ImageData.
 */

function distSq([r1, g1, b1], [r2, g2, b2]) {
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

/** Sample opaque pixels, capped at maxSamples for performance. */
function samplePixels({ data, width, height }, maxSamples = 8000) {
  const total = width * height;
  const step = Math.max(1, Math.floor(total / maxSamples));
  const out = [];
  for (let i = 0; i < total; i += step) {
    if (data[i * 4 + 3] < 128) continue;
    out.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  }
  return out;
}

/** K-means++ seeding for better initial centroids. */
function initCentroids(pixels, k) {
  const centroids = [[...pixels[Math.floor(Math.random() * pixels.length)]]];
  while (centroids.length < k) {
    const dists = pixels.map(p => Math.min(...centroids.map(c => distSq(p, c))));
    const sum = dists.reduce((s, d) => s + d, 0);
    let r = Math.random() * sum;
    let idx = 0;
    while (r > 0 && idx < pixels.length - 1) r -= dists[idx++];
    centroids.push([...pixels[idx]]);
  }
  return centroids;
}

function kMeans(pixels, k, maxIter = 30) {
  if (!pixels.length) return Array.from({ length: k }, () => [128, 128, 128]);
  k = Math.min(k, pixels.length);
  let centroids = initCentroids(pixels, k);

  for (let iter = 0; iter < maxIter; iter++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);

    for (const p of pixels) {
      let minD = Infinity, best = 0;
      for (let c = 0; c < k; c++) {
        const d = distSq(p, centroids[c]);
        if (d < minD) { minD = d; best = c; }
      }
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2];
      counts[best]++;
    }

    let moved = false;
    for (let c = 0; c < k; c++) {
      if (!counts[c]) continue;
      const n = [
        Math.round(sums[c][0] / counts[c]),
        Math.round(sums[c][1] / counts[c]),
        Math.round(sums[c][2] / counts[c]),
      ];
      if (distSq(centroids[c], n) > 1) moved = true;
      centroids[c] = n;
    }
    if (!moved) break;
  }

  // Sort brightest-first so layer order is predictable
  return centroids.sort((a, b) =>
    (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]) -
    (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2])
  );
}

/**
 * Quantize imageData to k colors.
 *
 * @param {ImageData} imageData
 * @param {number} k
 * @returns {{ centroids: [r,g,b][], assignment: Int32Array }}
 *   assignment[i] = centroid index for pixel i, or -1 if transparent.
 */
export function quantize(imageData, k) {
  const pixels = samplePixels(imageData);
  const centroids = kMeans(pixels, k);
  const { data, width, height } = imageData;
  const n = width * height;
  const assignment = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    const base = i * 4;
    if (data[base + 3] < 128) { assignment[i] = -1; continue; }
    let minD = Infinity, best = 0;
    for (let c = 0; c < centroids.length; c++) {
      const d = distSq([data[base], data[base + 1], data[base + 2]], centroids[c]);
      if (d < minD) { minD = d; best = c; }
    }
    assignment[i] = best;
  }

  return { centroids, assignment };
}

/**
 * Load a File into a downscaled ImageData (max 1200px on longest side).
 * Returns { imageData, width, height, objectURL }.
 */
export async function loadImageData(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });

  let w = img.naturalWidth, h = img.naturalHeight;
  if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
    const s = MAX_IMAGE_DIM / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }

  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return { imageData: canvas.getContext('2d').getImageData(0, 0, w, h), width: w, height: h, objectURL: url };
}
