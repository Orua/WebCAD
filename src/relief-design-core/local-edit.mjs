/** Pure, bounded edits of authored height data; never a CAD or mesh operation. */
import { validateGridShape, copyFiniteArray, copyMask, copyBounds } from './field-solver.mjs';

function fail(code, message, details = {}) {
  const error = new Error(message); error.code = code; error.details = details; throw error;
}

/**
 * mode: raise/lower (amountMm), flatten (targetMm), smooth (one Jacobi pass).
 * strength in [0,1], default 1. radiusMm is a PHYSICAL radius.
 * Uses a compact C1 radial displacement envelope (1-distance^2/radius^2)^2.
 * Discrete bounds violations REJECT the whole edit; no clamping or partial write.
 */
export function applyLocalEdit(field, edit) {
  const grid = validateGridShape(field), n = grid.count;
  const original = copyFiniteArray(field.heightsMm, n, 'heightsMm');
  const active = copyMask(field.active, n, 'active'), fixed = copyMask(field.fixedMask, n, 'fixedMask');
  const lower = copyBounds(field.lowerMm, n, 'lowerMm'), upper = copyBounds(field.upperMm, n, 'upperMm');
  const fixedMm = field.fixedMm === undefined ? null : copyFiniteArray(field.fixedMm, n, 'fixedMm');
  if (!edit || !['raise', 'lower', 'flatten', 'smooth'].includes(edit.mode))
    fail('LOCAL_EDIT_INVALID', 'An explicit supported edit mode is required.');
  if (!Array.isArray(edit.centerMm) || edit.centerMm.length !== 2 || !edit.centerMm.every(Number.isFinite)
      || !Number.isFinite(edit.radiusMm) || edit.radiusMm <= 0)
    fail('LOCAL_EDIT_INVALID', 'centerMm and a positive physical radius are required.');
  const [cx, cy] = edit.centerMm;
  if (cx < -grid.widthMm / 2 || cx > grid.widthMm / 2 || cy < -grid.heightMm / 2 || cy > grid.heightMm / 2)
    fail('LOCAL_EDIT_OUTSIDE', 'The brush centre is outside the physical design frame.');
  const strength = edit.strength ?? 1;
  if (!Number.isFinite(strength) || strength < 0 || strength > 1)
    fail('LOCAL_EDIT_INVALID', 'strength must be within [0,1].');
  if (['raise', 'lower'].includes(edit.mode) && (!Number.isFinite(edit.amountMm) || edit.amountMm < 0))
    fail('LOCAL_EDIT_INVALID', 'raise/lower requires a finite nonnegative amountMm.');
  if (edit.mode === 'flatten' && !Number.isFinite(edit.targetMm))
    fail('LOCAL_EDIT_INVALID', 'flatten requires a finite targetMm.');
  if (edit.shouldCancel !== undefined && typeof edit.shouldCancel !== 'function')
    fail('LOCAL_EDIT_INVALID', 'shouldCancel must be a function.');
  if (edit.shouldCancel?.()) fail('LOCAL_EDIT_CANCELLED', 'Local edit cancelled.');
  for (let i = 0; i < n; i++) {
    if (lower[i] > upper[i] || original[i] < lower[i] || original[i] > upper[i])
      fail('LOCAL_EDIT_CONSTRAINT_CONFLICT', 'The baseline or bounds are inconsistent.', { index: i });
    if (fixed[i] && fixedMm && original[i] !== fixedMm[i])
      fail('LOCAL_EDIT_CONSTRAINT_CONFLICT', 'The baseline differs from a declared protected height.', { index: i });
  }
  const result = new Float64Array(original), violations = [];
  let changedNodeCount = 0, maxChangeMm = 0, eligibleNodeCount = 0;
  for (let j = 0; j < grid.rows; j++) {
    if (edit.shouldCancel?.()) fail('LOCAL_EDIT_CANCELLED', 'Local edit cancelled.', { row: j });
    for (let i = 0; i < grid.columns; i++) {
      const k = j * grid.columns + i;
      if (!active[k] || fixed[k]) continue;
      const x = -grid.widthMm / 2 + i * grid.dxMm, y = -grid.heightMm / 2 + j * grid.dyMm;
      const relativeDistance = Math.hypot(x - cx, y - cy) / edit.radiusMm;
      if (relativeDistance >= 1) continue;
      eligibleNodeCount++;
      const envelope = (1 - relativeDistance ** 2) ** 2, blend = strength * envelope;
      let desired = original[k];
      if (edit.mode === 'raise') desired += edit.amountMm * blend;
      else if (edit.mode === 'lower') desired -= edit.amountMm * blend;
      else if (edit.mode === 'flatten') desired += (edit.targetMm - original[k]) * blend;
      else {
        // Cardinal neighbours only: no diagonal jump across an inactive barrier.
        const neighbours = [];
        if (i > 0) neighbours.push(k - 1);
        if (i + 1 < grid.columns) neighbours.push(k + 1);
        if (j > 0) neighbours.push(k - grid.columns);
        if (j + 1 < grid.rows) neighbours.push(k + grid.columns);
        let sum = original[k], count = 1;
        for (const neighbour of neighbours) if (active[neighbour]) { sum += original[neighbour]; count++; }
        desired += (sum / count - original[k]) * blend;
      }
      if (!Number.isFinite(desired) || desired < lower[k] || desired > upper[k]) {
        if (violations.length < 16) violations.push({ index: k, xMm: x, yMm: y, proposedMm: desired, lowerMm: lower[k], upperMm: upper[k] });
        continue;
      }
      result[k] = desired;
      const change = Math.abs(desired - original[k]);
      if (change) changedNodeCount++;
      maxChangeMm = Math.max(maxChangeMm, change);
    }
  }
  if (violations.length)
    fail('LOCAL_EDIT_BOUNDS', 'The proposed edit violates height bounds; no result was accepted.', {
      firstViolations: violations, baselineModified: false, commitState: 'notCommitted',
    });
  if (edit.shouldCancel?.()) fail('LOCAL_EDIT_CANCELLED', 'Local edit cancelled before returning.');
  let minHeightMm = Infinity, maxHeightMm = -Infinity;
  for (let i = 0; i < n; i++) if (active[i]) {
    minHeightMm = Math.min(minHeightMm, result[i]); maxHeightMm = Math.max(maxHeightMm, result[i]);
  }
  if (minHeightMm === Infinity) fail('LOCAL_EDIT_EMPTY_DOMAIN', 'No active design node.');
  return {
    heightsMm: result,
    report: {
      status: changedNodeCount ? 'edited' : 'no-change', mode: edit.mode,
      centerMm: [...edit.centerMm], radiusMm: edit.radiusMm, strength,
      changedNodeCount, eligibleNodeCount, maxChangeMm, minHeightMm, maxHeightMm,
      extremaScope: 'active-grid-nodes-only',
      protectedNodesChanged: 0, inactiveNodesChanged: 0, outsideInfluenceNodesChanged: 0,
      baselineModified: false, boundaryEnvelope: 'compact-C1-radial-displacement',
      continuousNormalContinuityCertified: false, manufacturingStatus: 'not-evaluated',
      geometryKind: 'design-height-field', commitState: 'notCommitted',
    },
  };
}
