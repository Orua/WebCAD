/** Authored planar design domain in mm. No geometry, image inference, or export. */
import { validateGridShape, copyFiniteArray, copyBounds } from './field-solver.mjs';

function fail(code, message, details = {}) {
  const e = new Error(message); e.code = code; e.details = details; throw e;
}
const countOn = mask => mask.reduce((sum, value) => sum + value, 0);

function shape(input, label) {
  if (!input || !['circle', 'rect'].includes(input.kind))
    fail('DOMAIN_SHAPE_UNSUPPORTED', `${label}: only explicit circle/rect regions are implemented.`);
  if (!Array.isArray(input.centerMm) || input.centerMm.length !== 2 || !input.centerMm.every(Number.isFinite))
    fail('DOMAIN_INVALID', `${label}.centerMm must contain two finite millimetre coordinates.`);
  const centerMm = [...input.centerMm];
  if (input.kind === 'circle') {
    if (!Number.isFinite(input.radiusMm) || input.radiusMm <= 0)
      fail('DOMAIN_INVALID', `${label}.radiusMm must be positive.`);
    return { kind: 'circle', centerMm, radiusMm: input.radiusMm };
  }
  if (![input.widthMm, input.heightMm].every(x => Number.isFinite(x) && x > 0))
    fail('DOMAIN_INVALID', `${label} needs positive widthMm and heightMm.`);
  return { kind: 'rect', centerMm, widthMm: input.widthMm, heightMm: input.heightMm };
}

function signedInsideDistance(s, x, y) {
  const dx = Math.abs(x - s.centerMm[0]), dy = Math.abs(y - s.centerMm[1]);
  return s.kind === 'circle' ? s.radiusMm - Math.hypot(dx, dy)
    : Math.min(s.widthMm / 2 - dx, s.heightMm / 2 - dy);
}

/** Conservative closed-cell intersection, including tangency. */
function touchesCell(s, left, bottom, right, top) {
  const [cx, cy] = s.centerMm;
  if (s.kind === 'rect') return left <= cx + s.widthMm / 2 && right >= cx - s.widthMm / 2
    && bottom <= cy + s.heightMm / 2 && top >= cy - s.heightMm / 2;
  const dx = Math.max(left - cx, 0, cx - right), dy = Math.max(bottom - cy, 0, cy - top);
  return Math.hypot(dx, dy) <= s.radiusMm;
}

function markTouchedCells(grid, regions) {
  const mask = new Uint8Array(grid.count);
  for (let j = 0; j + 1 < grid.rows; j++) for (let i = 0; i + 1 < grid.columns; i++) {
    const left = -grid.widthMm / 2 + i * grid.dxMm, bottom = -grid.heightMm / 2 + j * grid.dyMm;
    if (!regions.some(s => touchesCell(s, left, bottom, left + grid.dxMm, bottom + grid.dyMm))) continue;
    const a = j * grid.columns + i;
    for (const k of [a, a + 1, a + grid.columns, a + grid.columns + 1]) mask[k] = 1;
  }
  return mask;
}

/**
 * Turns explicit support/hole/protection intent into a conservative DISCRETE domain.
 * All vertices of a cell touched by a hole are inactive; no grid edge can bridge a
 * sub-cell hole. All vertices of a cell touched by a protected zone are frozen.
 * The latter preserves the existing bilinear design interpolant over that zone.
 * It does not preserve a subsequently fitted B-spline or construct a through-hole.
 */
export function buildDesignProblem(input) {
  if (!input || typeof input !== 'object') fail('DOMAIN_INVALID', 'A domain specification is required.');
  const grid = validateGridShape(input.grid), n = grid.count;
  const support = shape(input.support, 'support');
  const rawHoles = input.throughHoles ?? [], rawProtection = input.protectedZones ?? [];
  if (!Array.isArray(rawHoles) || !Array.isArray(rawProtection) || rawHoles.length + rawProtection.length > 64)
    fail('DOMAIN_CAPACITY', 'At most 64 explicit hole/protection regions are supported.');
  const throughHoles = rawHoles.map((s, i) => shape(s, `throughHoles[${i}]`));
  const protectedZones = rawProtection.map((s, i) => shape(s, `protectedZones[${i}]`));
  const band = input.boundaryBandMm ?? 0;
  if (!Number.isFinite(band) || band < 0) fail('DOMAIN_INVALID', 'boundaryBandMm must be finite and nonnegative.');
  const initialMm = input.initialMm === undefined ? new Float64Array(n)
    : copyFiniteArray(input.initialMm, n, 'initialMm');
  const lowerMm = copyBounds(input.lowerMm, n, 'lowerMm'), upperMm = copyBounds(input.upperMm, n, 'upperMm');
  for (let k = 0; k < n; k++) if (lowerMm[k] > upperMm[k] || initialMm[k] < lowerMm[k] || initialMm[k] > upperMm[k])
    fail('DOMAIN_CONSTRAINT_CONFLICT', 'The initial field and height bounds must agree.', { index: k });
  const excludedByHole = markTouchedCells(grid, throughHoles), protectedMask = markTouchedCells(grid, protectedZones);
  const active = new Uint8Array(n), fixedMask = new Uint8Array(n), fixedMm = new Float64Array(initialMm);
  for (let j = 0; j < grid.rows; j++) for (let i = 0; i < grid.columns; i++) {
    const k = j * grid.columns + i;
    const distance = signedInsideDistance(support, -grid.widthMm / 2 + i * grid.dxMm, -grid.heightMm / 2 + j * grid.dyMm);
    active[k] = distance >= 0 && !excludedByHole[k] ? 1 : 0;
    if (active[k] && (protectedMask[k] || distance <= band)) fixedMask[k] = 1;
  }
  // At least the one-node rim of every active component stays at the authored baseline.
  // Grid edges also remain fixed when support extends beyond the design rectangle.
  for (let j = 0; j < grid.rows; j++) for (let i = 0; i < grid.columns; i++) {
    const k = j * grid.columns + i;
    if (active[k] && (i === 0 || j === 0 || i === grid.columns - 1 || j === grid.rows - 1
        || !active[k - 1] || !active[k + 1] || !active[k - grid.columns] || !active[k + grid.columns])) fixedMask[k] = 1;
  }
  const hardPoints = input.hardPoints ?? [];
  if (!Array.isArray(hardPoints) || hardPoints.length > n) fail('DOMAIN_CAPACITY', 'Too many hard grid-node points.');
  const hardIds = new Set();
  for (const p of hardPoints) {
    if (!p || typeof p.id !== 'string' || !p.id.length || p.id.length > 128 || hardIds.has(p.id)
        || ![p.xMm, p.yMm, p.valueMm].every(Number.isFinite)) fail('DOMAIN_INVALID', 'Invalid or duplicate hard point.');
    hardIds.add(p.id);
    const u = (p.xMm + grid.widthMm / 2) / grid.dxMm, v = (p.yMm + grid.heightMm / 2) / grid.dyMm;
    const i = Math.round(u), j = Math.round(v);
    // This tolerance is ONLY floating-point coordinate roundoff, not nearest-node modelling.
    if (Math.abs(u - i) > 1e-10 || Math.abs(v - j) > 1e-10 || i < 0 || i >= grid.columns || j < 0 || j >= grid.rows)
      fail('DOMAIN_HARD_POINT_NOT_ON_GRID', 'Hard points must lie on an existing grid node; use a soft observation otherwise.', { id: p.id });
    const k = j * grid.columns + i;
    if (!active[k]) fail('DOMAIN_HARD_POINT_OUTSIDE', 'A hard point lies outside the active support.', { id: p.id });
    if (p.valueMm < lowerMm[k] || p.valueMm > upperMm[k] || fixedMask[k] && fixedMm[k] !== p.valueMm)
      fail('DOMAIN_CONSTRAINT_CONFLICT', 'A hard point conflicts with a boundary/protection/height constraint.', { id: p.id });
    fixedMask[k] = 1; fixedMm[k] = p.valueMm;
  }
  if (!countOn(active)) fail('DOMAIN_EMPTY', 'Conservative rasterization leaves no active design nodes.');
  // Preview triangles are a top-surface patch only, NOT a closed machining mesh.
  const triangles = [];
  for (let j = 0; j + 1 < grid.rows; j++) for (let i = 0; i + 1 < grid.columns; i++) {
    const a = j * grid.columns + i, b = a + 1, c = a + grid.columns, d = c + 1;
    if ([a, b, c, d].every(k => active[k])) triangles.push(a, b, d, a, d, c);
  }
  return {
    ...grid, initialMm, active, fixedMask, fixedMm, lowerMm, upperMm,
    domain: { support, throughHoles, protectedZones, boundaryBandMm: band },
    previewTriangles: Uint32Array.from(triangles),
    domainReport: {
      activeNodeCount: countOn(active), fixedNodeCount: countOn(fixedMask),
      excludedByHoleNodeCount: countOn(excludedByHole), conservativelyProtectedNodeCount: countOn(protectedMask),
      hardPointCount: hardPoints.length, previewTriangleCount: triangles.length / 3,
      holePolicy: 'exclude-all-vertices-of-every-intersecting-cell',
      protectionScope: 'original-bilinear-design-field-only',
      minFeatureResolutionCertified: false, topologyStatus: 'discrete-top-patch-only',
      closedMesh: false, geometryKind: 'design-height-field', commitState: 'notCommitted',
    },
  };
}
