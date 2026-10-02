// Pure measurement math. Parametric derivative magnitudes depend on the UV
// scale; direction regularity does not. This module never invokes a kernel.
const finiteVector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const length = value => Math.hypot(...value);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function invalid(message, details) {
  throw Object.assign(new Error(message), {code: 'GEOMETRY_INVALID', report: {failedCheck: 'surface-normal-regularity', ...details}});
}

/** Preserve oriented BRepGProp direction; D1 verifies regularity and alignment.
 * No absolute Jacobian/normal magnitude threshold is used. Genuine zero,
 * nonfinite, parallel derivatives and inconsistent normals remain invalid. */
export function normalizeOrientedSurfaceNormal({normal, du, dv}, {
  minimumRelativeJacobian = 1e-10, alignmentTolerance = 1e-8
} = {}) {
  if (!Number.isFinite(minimumRelativeJacobian) || minimumRelativeJacobian <= 0 || minimumRelativeJacobian >= 1 ||
      !Number.isFinite(alignmentTolerance) || alignmentTolerance <= 0 || alignmentTolerance >= 1) {
    invalid('Invalid dimensionless surface-normal measurement policy.', {minimumRelativeJacobian, alignmentTolerance});
  }
  if (![normal, du, dv].every(finiteVector)) invalid('Surface normal or D1 derivatives are nonfinite.', {normal, du, dv});
  const rawNormalMagnitude = length(normal), duMagnitude = length(du), dvMagnitude = length(dv);
  if (![rawNormalMagnitude, duMagnitude, dvMagnitude].every(value => Number.isFinite(value) && value > 0)) {
    invalid('Surface normal or a D1 derivative is genuinely zero or nonfinite.', {rawNormalMagnitude, duMagnitude, dvMagnitude});
  }
  const unitU = du.map(value => value / duMagnitude), unitV = dv.map(value => value / dvMagnitude);
  const relativeCross = cross(unitU, unitV), relativeJacobian = length(relativeCross);
  if (!Number.isFinite(relativeJacobian) || relativeJacobian <= minimumRelativeJacobian) {
    invalid('D1 derivatives are singular or dimensionlessly ill-conditioned.', {relativeJacobian, minimumRelativeJacobian});
  }
  const direction = normal.map(value => value / rawNormalMagnitude);
  const crossDirection = relativeCross.map(value => value / relativeJacobian);
  const alignmentAbsDot = Math.min(1, Math.abs(dot(direction, crossDirection)));
  if (!finiteVector(direction) || !Number.isFinite(alignmentAbsDot) || alignmentAbsDot < 1 - alignmentTolerance) {
    invalid('Oriented BRep normal is inconsistent with the actual D1 tangent plane.', {alignmentAbsDot, alignmentTolerance, relativeJacobian});
  }
  return {normal: direction, relativeJacobian, alignmentAbsDot, rawNormalMagnitude, duMagnitude, dvMagnitude,
    method: 'oriented-BRep-normal-unit-direction-with-dimensionless-D1-regularity'};
}
