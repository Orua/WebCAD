// Photo / shaded-relief → height grid (照片浮雕).
// Pure: Float64 luminance (or RGBA via convert) in, normalized [0,1] height out.
// Shared contract with Services (relief.source-convert-1 settings.mode='photoRelief'):
//   version, columns, rows, crop, levels, gamma, blurPx, invert, mode, photo{...}
// Units: grid pixels for sigma; weights dimensionless; height in [0,1] (scaled by depthMm later).
// Algorithm (v1): large-blur illumination flatten (Retinex high-pass) + multi-scale body/mid/fine
// mix + percentile stretch + optional edge fade. Does not claim photometric SFS accuracy;
// goal is a vivid, plausible CNC-ready height field from side-lit stone / render photos.

export const PHOTO_RELIEF_VERSION = 1;
export const PHOTO_RELIEF_DEFAULTS = Object.freeze({
  // Fractions of max(grid side) when *SigmaPx omitted (absolute px overrides).
  lightingFrac: 0.14,
  bodyFrac: 0.07,
  midFrac: 0.022,
  fineFrac: 0.007,
  denoisePx: 1.2,
  bodyWeight: 0.5,
  midWeight: 0.28,
  fineWeight: 0.12,
  edgeFadeFrac: 0.05,
  percentileLow: 2,
  percentileHigh: 98,
  // Soft lift of raised mass from local contrast envelope (0 disables).
  massWeight: 0.45,
  massFrac: 0.1,
});

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
  const allowed = Object.keys(PHOTO_RELIEF_DEFAULTS);
  for (const k of Object.keys(p)) if (!allowed.includes(k)) fail('PARAM_SCHEMA_INVALID', '未知照片浮雕参数：' + k, path + '.' + k);
  const D = PHOTO_RELIEF_DEFAULTS;
  return {
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
export function photoReliefFromLuminance(luminance, columns, rows, photo = {}) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2) fail('PARAM_RANGE_INVALID', '网格尺寸无效');
  if (!luminance || luminance.length !== columns * rows) fail('PARAM_SCHEMA_INVALID', '亮度数据长度与尺寸不符');
  const p = normalizePhotoReliefParams(photo);
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
  if (!(span > 1e-12)) { out.fill(0); return { values: out, photo: p, version: PHOTO_RELIEF_VERSION }; }
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
