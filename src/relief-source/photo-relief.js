// Photo / shaded-relief → height grid (照片浮雕).
// Pure: Float64 luminance (or RGBA via convert) in, normalized [0,1] height out.
// Shared contract with Services (relief.source-convert-1 settings.mode='photoRelief'):
//   version, columns, rows, crop, levels, gamma, blurPx, invert, mode, photo{...}
// Units: grid pixels for sigma; weights dimensionless; height in [0,1] (scaled by depthMm later).
// Algorithm (v1): large-blur illumination flatten (Retinex high-pass) + multi-scale body/mid/fine
// mix + percentile stretch + optional edge fade. Does not claim photometric SFS accuracy;
// goal is a vivid, plausible CNC-ready height field from side-lit stone / render photos.

export const PHOTO_RELIEF_VERSION = 2;
// algorithm 2 (立体 v4) knobs. Only emitted in normalized settings when photo.algorithm === 2, so v1
// records (no `algorithm` key) keep their exact normalized shape and settingsHash.
export const PHOTO_RELIEF_V2_DEFAULTS = Object.freeze({
  algorithm: 2,
  volume: 0.8,          // 立体度 0..1: weight of the smooth body envelope (ballooned subject mass)
  volumeFrac: 0.25,     // dome radius: distance (fraction of grid side) at which the envelope reaches full height
  maskFrac: 0.025,      // subject-mask detail energy radius
  backgroundLevel: 0.06,// height of flat background (0..0.3)
  detailWeight: 0.45,   // carved detail on envelope (lower = fit-friendlier; volume keeps 立体)
  smoothness: 0.7,      // 丝滑度 0..1: feathering of subject edge + soft-knee clipping
});
export const PHOTO_RELIEF_DEFAULTS = Object.freeze({
  // Fractions of max(grid side) when *SigmaPx omitted (absolute px overrides).
  lightingFrac: 0.14,
  bodyFrac: 0.07,
  midFrac: 0.022,
  fineFrac: 0.007,
  denoisePx: 1.2,
  bodyWeight: 0.5,
  midWeight: 0.28,
  fineWeight: 0.08,
  edgeFadeFrac: 0.05,
  percentileLow: 2,
  percentileHigh: 98,
  // Soft lift of raised mass from local contrast envelope (0 disables).
  massWeight: 0.45,
  massFrac: 0.1,
});
const V1_KEYS = Object.keys(PHOTO_RELIEF_DEFAULTS);

const fail = (code, message, path) => { throw Object.assign(new Error(message), { code, ...(path ? { path } : {}) }); };
const num = (v, d, min, max, path) => {
  const x = v ?? d;
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) fail('PARAM_RANGE_INVALID', `${path} 需要 ${min}–${max}`, path);
  return x;
};

/** Normalize / clamp photo-relief tuning knobs (optional block under settings.photo). */
export function normalizePhotoReliefParams(p = {}, path = 'settings.photo') {
  if (p == null) return { ...PHOTO_RELIEF_DEFAULTS };
  if (typeof p !== 'object' || Array.isArray(p)) fail('PARAM_SCHEMA_INVALID', 'photo 需要对象', path);
  const v2 = p.algorithm !== undefined;
  if (v2 && p.algorithm !== 1 && p.algorithm !== 2) fail('PARAM_SCHEMA_INVALID', 'photo.algorithm 仅支持 1 或 2', path + '.algorithm');
  const allowed = p.algorithm === 2 ? [...V1_KEYS, ...Object.keys(PHOTO_RELIEF_V2_DEFAULTS)] : [...V1_KEYS, 'algorithm'];
  for (const k of Object.keys(p)) if (!allowed.includes(k)) fail('PARAM_SCHEMA_INVALID', '未知照片浮雕参数：' + k, path + '.' + k);
  const D = PHOTO_RELIEF_DEFAULTS;
  const base = {
    lightingFrac: num(p.lightingFrac, D.lightingFrac, 0.02, 0.5, path + '.lightingFrac'),
    bodyFrac: num(p.bodyFrac, D.bodyFrac, 0.01, 0.4, path + '.bodyFrac'),
    midFrac: num(p.midFrac, D.midFrac, 0.002, 0.2, path + '.midFrac'),
    fineFrac: num(p.fineFrac, D.fineFrac, 0.0005, 0.1, path + '.fineFrac'),
    denoisePx: num(p.denoisePx, D.denoisePx, 0, 8, path + '.denoisePx'),
    bodyWeight: num(p.bodyWeight, D.bodyWeight, 0, 2, path + '.bodyWeight'),
    midWeight: num(p.midWeight, D.midWeight, 0, 2, path + '.midWeight'),
    fineWeight: num(p.fineWeight, D.fineWeight, 0, 2, path + '.fineWeight'),
    edgeFadeFrac: num(p.edgeFadeFrac, D.edgeFadeFrac, 0, 0.25, path + '.edgeFadeFrac'),
    percentileLow: num(p.percentileLow, D.percentileLow, 0, 20, path + '.percentileLow'),
    percentileHigh: num(p.percentileHigh, D.percentileHigh, 80, 100, path + '.percentileHigh'),
    massWeight: num(p.massWeight, D.massWeight, 0, 2, path + '.massWeight'),
    massFrac: num(p.massFrac, D.massFrac, 0.01, 0.4, path + '.massFrac'),
  };
  if (p.algorithm !== 2) return base;
  const E = PHOTO_RELIEF_V2_DEFAULTS;
  return {
    ...base,
    algorithm: 2,
    volume: num(p.volume, E.volume, 0, 1, path + '.volume'),
    volumeFrac: num(p.volumeFrac, E.volumeFrac, 0.01, 0.3, path + '.volumeFrac'),
    maskFrac: num(p.maskFrac, E.maskFrac, 0.005, 0.15, path + '.maskFrac'),
    backgroundLevel: num(p.backgroundLevel, E.backgroundLevel, 0, 0.3, path + '.backgroundLevel'),
    detailWeight: num(p.detailWeight, E.detailWeight, 0, 1.5, path + '.detailWeight'),
    smoothness: num(p.smoothness, E.smoothness, 0, 1, path + '.smoothness'),
  };
}

/** Recommended photo block for new imports (algorithm 2, 立体度 default). */
export function defaultPhotoReliefParams(overrides = {}) {
  return normalizePhotoReliefParams({ algorithm: 2, ...overrides });
}

// ---- O(N) deterministic Gaussian approximation (3 box passes, clamp-to-edge) ----
function boxSizes(sigma) {
  // Kovesi/Ivan Kutskir: 3 boxes whose combined variance ≈ sigma².
  const n = 3, wIdeal = Math.sqrt((12 * sigma * sigma / n) + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const out = [];
  for (let i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
  return out;
}
function boxH(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let t = -r; t <= r; t++) acc += src[row + Math.min(w - 1, Math.max(0, t))];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * inv;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
}
function boxV(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let t = -r; t <= r; t++) acc += src[Math.min(h - 1, Math.max(0, t)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      acc += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
    }
  }
}
/** Fast blur: exact Gaussian for sigma < 2, 3×box approximation above (O(N) per pass). */
export function blurFast(src, w, h, sigma) {
  if (!(sigma > 0)) return Float64Array.from(src);
  if (sigma < 2) return blurFloat64(src, w, h, sigma);
  let a = Float64Array.from(src), b = new Float64Array(a.length);
  for (const r of boxSizes(sigma)) {
    if (r < 1) continue;
    boxH(a, b, w, h, r); boxV(b, a, w, h, r);
  }
  return a;
}
// Otsu threshold over 256 bins (deterministic).
function otsuThreshold(a) {
  let mn = Infinity, mx = -Infinity;
  for (const v of a) { if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!(mx > mn)) return mn;
  const bins = new Float64Array(256), sc = 255 / (mx - mn);
  for (const v of a) bins[Math.min(255, Math.floor((v - mn) * sc))]++;
  let total = a.length, sumAll = 0; for (let i = 0; i < 256; i++) sumAll += i * bins[i];
  let wB = 0, sumB = 0, best = -1, bi = 0;
  for (let i = 0; i < 256; i++) {
    wB += bins[i]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sumB += i * bins[i]; const mB = sumB / wB, mF = (sumAll - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; bi = i; }
  }
  return mn + (bi + 0.5) / sc;
}
// Exact squared-EDT (Felzenszwalb & Huttenlocher), returns Euclidean distance (px) to nearest 0 cell.
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let r = v[k], sx = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
    while (sx <= z[k]) { k--; r = v[k]; sx = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); }
    k++; v[k] = q; z[k] = sx; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
}
export function distanceTransform(inside, w, h) {
  const INF = 1e20, g = new Float64Array(w * h), m = Math.max(w, h);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = inside[y * w + x] ? INF : 0; edt1d(f, h, d, v, z); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; edt1d(f, w, d, v, z); for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]); }
  return g;
}
const smoothstep = (e0, e1, x) => { let t = (x - e0) / (e1 - e0 || 1e-12); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
// C1 soft clamp to [0,1] with quadratic knees of width k (identity in the middle).
function softClamp01(x, k) {
  if (k <= 0) return x < 0 ? 0 : x > 1 ? 1 : x;
  if (x <= -k) return 0;
  if (x < k) return (x + k) * (x + k) / (4 * k);
  if (x <= 1 - k) return x;
  if (x < 1 + k) { const u = 1 + k - x; return 1 - u * u / (4 * k); }
  return 1;
}

function gaussianKernel(sigma) {
  if (!(sigma > 0)) return null;
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return { k, r };
}

/** Separable Gaussian blur; src/out are Float64Array length w*h, row-major. */
export function blurFloat64(src, w, h, sigma) {
  const ker = gaussianKernel(sigma);
  if (!ker) return src.slice ? src.slice() : Float64Array.from(src);
  const { k, r } = ker;
  const tmp = new Float64Array(src.length);
  const out = new Float64Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let t = -r; t <= r; t++) acc += k[t + r] * src[y * w + Math.min(w - 1, Math.max(0, x + t))];
    tmp[y * w + x] = acc;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let t = -r; t <= r; t++) acc += k[t + r] * tmp[Math.min(h - 1, Math.max(0, y + t)) * w + x];
    out[y * w + x] = acc;
  }
  return out;
}

function percentile(values, p) {
  const a = Float64Array.from(values);
  a.sort();
  if (!a.length) return 0;
  const i = Math.min(a.length - 1, Math.max(0, (p / 100) * (a.length - 1)));
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] * (hi - i) + a[hi] * (i - lo);
}

/**
 * Core: luminance grid (row 0 = top) → height [0,1].
 * @param {Float64Array|number[]} luminance length columns*rows, values typically 0..1
 */
export function photoReliefFromLuminance(luminance, columns, rows, photo = {}, opts = {}) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2) fail('PARAM_RANGE_INVALID', '网格尺寸无效');
  if (!luminance || luminance.length !== columns * rows) fail('PARAM_SCHEMA_INVALID', '亮度数据长度与尺寸不符');
  const p = normalizePhotoReliefParams(photo);
  if (p.algorithm === 2) return photoReliefV2(luminance, columns, rows, p, opts);
  if (p.percentileHigh <= p.percentileLow) fail('PARAM_RANGE_INVALID', 'percentileHigh 须高于 percentileLow', 'settings.photo');
  const side = Math.max(columns, rows);
  const L = Float64Array.from(luminance);
  const lighting = blurFloat64(L, columns, rows, p.lightingFrac * side);
  let flat = new Float64Array(L.length);
  for (let i = 0; i < L.length; i++) flat[i] = L[i] - lighting[i];
  if (p.denoisePx > 0) flat = blurFloat64(flat, columns, rows, p.denoisePx);
  const body = blurFloat64(flat, columns, rows, p.bodyFrac * side);
  const midBlur = blurFloat64(flat, columns, rows, p.midFrac * side);
  const fineBlur = blurFloat64(flat, columns, rows, p.fineFrac * side);
  const h = new Float64Array(L.length);
  for (let i = 0; i < L.length; i++) {
    const mid = midBlur[i] - body[i];
    const fine = fineBlur[i] - midBlur[i];
    h[i] = p.bodyWeight * body[i] + p.midWeight * mid + p.fineWeight * fine;
  }
  if (p.massWeight > 0) {
    // Local contrast envelope: |L - blur(L)| soft-lifts raised mass independent of light side.
    const massBlur = blurFloat64(L, columns, rows, p.massFrac * side);
    for (let i = 0; i < L.length; i++) h[i] += p.massWeight * Math.abs(L[i] - massBlur[i]);
  }
  const lo = percentile(h, p.percentileLow), hi = percentile(h, p.percentileHigh);
  const out = new Float32Array(h.length);
  const span = hi - lo;
  if (!(span > 1e-12)) { out.fill(0); return { values: out, photo: p, version: 1 }; }
  for (let i = 0; i < h.length; i++) {
    let v = (h[i] - lo) / span;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  if (p.edgeFadeFrac > 0) {
    const f = p.edgeFadeFrac;
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const u = i / Math.max(1, columns - 1), v = j / Math.max(1, rows - 1);
      let m = Math.min(u, 1 - u, v, 1 - v) / f;
      if (m < 0) m = 0; else if (m > 1) m = 1;
      m = m * m * (3 - 2 * m);
      out[j * columns + i] *= m;
    }
  }
  return { values: out, photo: p, version: 1 };
}

/**
 * Algorithm 2 (立体 v4): v1 detail bands ride on a smooth ballooned subject envelope.
 *  1. Retinex flatten → body/mid/fine bands (v1) = carved detail D (zero-median).
 *  2. Subject mask M: local detail energy, smoothstep between energy percentiles, feathered (C1).
 *  3. Envelope B: wide blur of M (≈ smoothed distance transform → dome / balloon), normalized,
 *     shaped with smoothstep so it starts with zero slope at the subject edge (no cliff).
 *  4. h = bg + volume·B + detail·D·(0.25+0.75·M)  → subject > mid layers > flat low background.
 *  5. Percentile stretch with C1 soft knee (no flat-topped terraces), smooth edge fade.
 * opts.onProgress(fraction, stage) is called between stages (for worker progress UI).
 */
function photoReliefV2(luminance, columns, rows, p, opts = {}) {
  if (p.percentileHigh <= p.percentileLow) fail('PARAM_RANGE_INVALID', 'percentileHigh 须高于 percentileLow', 'settings.photo');
  const prog = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const n = columns * rows, side = Math.max(columns, rows);
  const L = new Float64Array(n);
  for (let i = 0; i < n; i++) { const v = +luminance[i]; L[i] = Number.isFinite(v) ? v : 0; }
  prog(0.05, 'lighting');
  const lighting = blurFast(L, columns, rows, p.lightingFrac * side);
  let flat = new Float64Array(n);
  for (let i = 0; i < n; i++) flat[i] = L[i] - lighting[i];
  // Denoise scales with grid size and 丝滑度 so 1025² grids are as clean as 320² previews.
  const den = Math.max(p.denoisePx, 0.0035 * side * p.smoothness);
  if (den > 0) flat = blurFast(flat, columns, rows, den);
  const Ld = den > 0 ? blurFast(L, columns, rows, den) : L;
  prog(0.2, 'bands');
  const body = blurFast(flat, columns, rows, p.bodyFrac * side);
  const midBlur = blurFast(flat, columns, rows, p.midFrac * side);
  const fineBlur = blurFast(flat, columns, rows, Math.max(0.6, p.fineFrac * side) * (1 + 0.6 * p.smoothness));
  const massBlur = p.massWeight > 0 ? blurFast(Ld, columns, rows, p.massFrac * side) : null;
  const D = new Float64Array(n), energy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const mid = midBlur[i] - body[i], fine = fineBlur[i] - midBlur[i];
    D[i] = 0.3 * p.bodyWeight * body[i] + p.midWeight * mid + 0.7 * p.fineWeight * fine + (massBlur ? 0.3 * p.massWeight * Math.abs(Ld[i] - massBlur[i]) : 0);
    energy[i] = Math.abs(mid) + 0.5 * Math.abs(fine) + Math.abs(Ld[i] - lighting[i]) * 0.5;
  }
  prog(0.45, 'mask');
  const E = blurFast(energy, columns, rows, p.maskFrac * side);
  // Second cue: tonal distance from the border (background) tone, so smooth subjects (a polished
  // horse body) are still foreground even with little texture.
  const Ls = blurFast(L, columns, rows, p.maskFrac * side);
  const border = [];
  const bw = Math.max(1, Math.round(0.03 * side));
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) if (i < bw || j < bw || i >= columns - bw || j >= rows - bw) border.push(Ls[j * columns + i]);
  const bgTone = percentile(border, 50);
  const tdist = new Float64Array(n);
  for (let i = 0; i < n; i++) tdist[i] = Math.abs(Ls[i] - bgTone);
  const T = otsuThreshold(tdist), eT = otsuThreshold(E);
  let M = new Float64Array(n);
  for (let i = 0; i < n; i++) M[i] = Math.max(smoothstep(0.6 * eT, 1.4 * eT, E[i]) * 0.8, smoothstep(0.6 * T, 1.4 * T, tdist[i]));
  // Close small holes (morphological closing approximation: blur → re-threshold, C1).
  { const Mc = blurFast(M, columns, rows, p.maskFrac * side * 1.5); for (let i = 0; i < n; i++) M[i] = Math.max(M[i], smoothstep(0.35, 0.75, Mc[i])); }
  const feather = (0.004 + 0.02 * p.smoothness) * side;
  M = blurFast(M, columns, rows, feather);
  prog(0.6, 'envelope');
  // Ballooning: exact Euclidean distance to background (mask < 0.5 or image border), capped at
  // volumeFrac·side, mapped through a circular dome profile and smoothed → C1 rounded volume.
  let maxD = 0;
  const cap0 = p.volumeFrac * side;
  const inside = new Uint8Array(n);
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const k = j * columns + i;
    inside[k] = M[k] >= 0.5 && i > 0 && j > 0 && i < columns - 1 && j < rows - 1 ? 1 : 0;
  }
  const dist = distanceTransform(inside, columns, rows);
  for (let i = 0; i < n; i++) if (dist[i] > maxD) maxD = dist[i];
  // Dome reaches its crown at the medial axis of the subject (bounded by volumeFrac·side).
  const cap = Math.max(2, Math.min(cap0, 0.9 * maxD));
  let B = new Float64Array(n);
  for (let i = 0; i < n; i++) { const d = Math.min(1, dist[i] / cap); B[i] = Math.sqrt(Math.max(0, 1 - (1 - d) * (1 - d))); }
  B = blurFast(B, columns, rows, Math.max(1, cap * (0.15 + 0.25 * p.smoothness)));
  // Soft mask contribution so partially-foreground (clouds / mid layer) sits between subject and bg.
  for (let i = 0; i < n; i++) B[i] = 0.85 * B[i] + 0.15 * M[i];
  prog(0.75, 'compose');
  // Detail normalized to a robust unit scale around its median.
  const dLo = percentile(D, p.percentileLow), dHi = percentile(D, p.percentileHigh), dMed = percentile(D, 50);
  const dSpan = Math.max(1e-12, dHi - dLo);
  const H = new Float64Array(n);
  let Dt = new Float64Array(n);
  // Smooth (C∞) compression of detail outliers: keeps crisp edges, kills isolated spikes.
  for (let i = 0; i < n; i++) Dt[i] = Math.tanh(2 * (D[i] - dMed) / dSpan) / 2;
  // 丝滑: along large-scale tonal edges / the silhouette (high |∇Ls|) blend detail toward a feather-wide blur so the
  // subject → background transition has no cliff; interior detail stays crisp.
  if (p.smoothness > 0) {
    const Db = blurFast(Dt, columns, rows, Math.max(1, 1.5 * feather)), G = new Float64Array(n);
    let gMax = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const k = j * columns + i, gx = Ls[j * columns + Math.min(columns - 1, i + 1)] - Ls[j * columns + Math.max(0, i - 1)], gy = Ls[Math.min(rows - 1, j + 1) * columns + i] - Ls[Math.max(0, j - 1) * columns + i];
      G[k] = Math.hypot(gx, gy); if (G[k] > gMax) gMax = G[k];
    }
    const Gs = blurFast(G, columns, rows, Math.max(1, feather));
    let gsMax = 0; for (let i = 0; i < n; i++) if (Gs[i] > gsMax) gsMax = Gs[i];
    if (gsMax > 1e-12) for (let i = 0; i < n; i++) { const w = Math.min(1, 1.6 * p.smoothness) * smoothstep(0, 0.5 * gsMax, Gs[i]); Dt[i] = Dt[i] + w * (Db[i] - Dt[i]); }
  }
  for (let i = 0; i < n; i++) H[i] = p.volume * B[i] + p.detailWeight * Dt[i] * (0.25 + 0.75 * M[i]);
  // Background sits at backgroundLevel; detail can only dip a little below it.
  const lo = percentile(H, Math.max(0.5, p.percentileLow / 2)), hi = percentile(H, Math.min(99.8, (p.percentileHigh + 100) / 2));
  const span = hi - lo, out = new Float32Array(n);
  if (!(span > 1e-12)) { out.fill(0); prog(1, 'done'); return { values: out, photo: p, version: PHOTO_RELIEF_VERSION }; }
  const knee = 0.02 + 0.1 * p.smoothness, bg = p.backgroundLevel;
  for (let i = 0; i < n; i++) {
    const t = softClamp01((H[i] - lo) / span, knee);
    out[i] = bg + (1 - bg) * t;
  }
  if (p.edgeFadeFrac > 0) {
    const f = p.edgeFadeFrac;
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const u = i / Math.max(1, columns - 1), v = j / Math.max(1, rows - 1);
      const m = smoothstep(0, 1, Math.min(u, 1 - u, v, 1 - v) / f);
      out[j * columns + i] *= m;
    }
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(out[i])) out[i] = 0;
  prog(1, 'done');
  if (opts.debug) opts.debug({ mask: M, envelope: B, detail: D });
  return { values: out, photo: p, version: PHOTO_RELIEF_VERSION };
}

/**
 * Heuristic: photo-like / shaded relief vs authored height map / flat artwork.
 * Returns {photoLike:boolean, score:number, reasons:string[]}.
 * Conservative: strong side-lighting anisotropy or natural texture → photoLike.
 */
export function detectPhotoLikeImage(rgba, width, height) {
  if (!rgba || width < 8 || height < 8 || rgba.length !== width * height * 4) return { photoLike: false, score: 0, reasons: ['too-small'] };
  // Sample a coarse grid for speed.
  const stepX = Math.max(1, Math.floor(width / 64)), stepY = Math.max(1, Math.floor(height / 64));
  let n = 0, sumL = 0, sumL2 = 0, sumSat = 0, gxPos = 0, gxNeg = 0, gyPos = 0, gyNeg = 0, edge = 0;
  const lumAt = (x, y) => {
    const k = (y * width + x) * 4;
    return (0.2126 * rgba[k] + 0.7152 * rgba[k + 1] + 0.0722 * rgba[k + 2]) / 255;
  };
  for (let y = stepY; y < height - stepY; y += stepY) for (let x = stepX; x < width - stepX; x += stepX) {
    const k = (y * width + x) * 4;
    const r = rgba[k] / 255, g = rgba[k + 1] / 255, b = rgba[k + 2] / 255;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx > 1e-6 ? (mx - mn) / mx : 0;
    sumL += L; sumL2 += L * L; sumSat += sat; n++;
    const dx = lumAt(x + stepX, y) - lumAt(x - stepX, y);
    const dy = lumAt(x, y + stepY) - lumAt(x, y - stepY);
    if (dx > 0) gxPos += dx; else gxNeg += -dx;
    if (dy > 0) gyPos += dy; else gyNeg += -dy;
    edge += Math.abs(dx) + Math.abs(dy);
  }
  if (!n) return { photoLike: false, score: 0, reasons: ['empty'] };
  const mean = sumL / n, variance = Math.max(0, sumL2 / n - mean * mean);
  const sat = sumSat / n;
  const ax = Math.abs(gxPos - gxNeg) / (gxPos + gxNeg + 1e-9);
  const ay = Math.abs(gyPos - gyNeg) / (gyPos + gyNeg + 1e-9);
  const anisotropy = Math.max(ax, ay);
  const edgeMean = edge / n;
  const reasons = [];
  let score = 0;
  // Authored height maps: smooth grayscale ramps, low chroma, low lighting anisotropy.
  // Stone / shaded relief photos: side-light anisotropy OR warm/low-chroma + rich micro-edges.
  if (sat < 0.08) { score += 0.12; reasons.push('low-chroma'); } else { score += 0.32; reasons.push('chroma'); }
  if (anisotropy > 0.15) { score += 0.4; reasons.push('lighting-anisotropy'); }
  else if (anisotropy > 0.08) { score += 0.18; reasons.push('mild-anisotropy'); }
  if (variance > 0.008 && variance < 0.14) { score += 0.15; reasons.push('natural-contrast'); }
  if (edgeMean > 0.04) { score += 0.2; reasons.push('texture-edges'); }
  // Low-chroma but textured (typical stone relief photo / shaded render) — lean photo.
  if (sat < 0.15 && edgeMean > 0.035 && variance > 0.0005) { score += 0.12; reasons.push('shaded-relief-texture'); }
  // Very binary / poster artwork → not photo
  if (variance > 0.15 && sat < 0.05 && anisotropy < 0.1) { score -= 0.45; reasons.push('poster-like'); }
  // Pure 1-D grayscale ramp (authored height map) has near-perfect gradient anisotropy and zero chroma.
  if (sat < 0.05 && anisotropy > 0.75) { score -= 0.7; reasons.push('authored-ramp'); }
  const photoLike = score >= 0.48;
  return { photoLike, score, reasons, metrics: { mean, variance, sat, anisotropy, edgeMean } };
}
