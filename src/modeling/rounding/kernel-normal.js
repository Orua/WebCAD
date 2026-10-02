import {normalizeOrientedSurfaceNormal} from './normal-measurement.js';

const dispose = value => {try {value?.delete?.();} catch {}};
const vector = value => [value.X(), value.Y(), value.Z()];
const finite = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const difference = (a, b) => a.map((value, i) => value - b[i]);
const norm = value => Math.hypot(...value);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function invalid(message, details = {}) {
  throw Object.assign(new Error(message), {code: 'GEOMETRY_INVALID',
    report: {failedCheck: 'surface-normal-regularity', ...details}});
}
const edgePointAt = (edge, t) => {const point = edge.pointAt(t); try {return point.toTuple();} finally {dispose(point);}};

// This identifies a failed parameter chart, not a geometric pole certificate.
// Nonfinite data or inconsistent normals on a regular D1 chart remain errors.
function singularFiniteD1(du, dv) {
  if (![du, dv].every(finite)) return false;
  const u = norm(du), v = norm(dv);
  if (!Number.isFinite(u) || !Number.isFinite(v)) return false;
  return u === 0 || v === 0 || norm(cross(du.map(value => value / u), dv.map(value => value / v))) <= 1e-10;
}

function spherePoint(point, center, radius, positionToleranceMm) {
  if (!finite(point) || !finite(center)) invalid('Analytic sphere point or center is nonfinite.');
  const radial = difference(point, center), radialMagnitude = norm(radial);
  const radialResidualMm = Math.abs(radialMagnitude - radius);
  const implicitGradient = radial.map(value => 2 * value), implicitGradientMagnitude = 2 * radialMagnitude;
  if (!Number.isFinite(radialMagnitude) || radialMagnitude <= 0 || !Number.isFinite(radialResidualMm) || radialResidualMm > positionToleranceMm) {
    invalid('Actual point is not on the positive-radius analytic sphere within the unchanged G0 tolerance.',
      {point, center, radiusMm: radius, radialMagnitude, radialResidualMm, positionToleranceMm});
  }
  if (!finite(implicitGradient) || !Number.isFinite(implicitGradientMagnitude) || implicitGradientMagnitude <= 0) {
    invalid('Analytic sphere implicit gradient is zero or nonfinite.', {point, center, radiusMm: radius, implicitGradientMagnitude});
  }
  return {radialUnit: radial.map(value => value / radialMagnitude), radialMagnitude, radialResidualMm,
    implicitGradient, implicitGradientMagnitude};
}

function nearbyStations(t) {
  const direction = t <= .5 ? 1 : -1;
  return [.0005, .001, .002, .005, .01].map(delta => t + direction * delta)
    .filter(value => value > 0 && value < 1 && value !== t);
}

/** Actual edge pcurve measurement shared by strict topology and final quality.
 * Regular D1 remains the first route. Only an actual native SPHERE can certify
 * geometric regularity at a singular UV chart: grad(|p-c|^2-R^2)=2(p-c) != 0.
 * No BSpline, cone, revolution, estimated normal, or nearest-face fallback.
 */
export function measureKernelEdgeFaceNormal(edge, face, t, oc, {positionToleranceMm = 1e-5} = {}) {
  if (!Number.isFinite(t) || t < 0 || t > 1 || !Number.isFinite(positionToleranceMm) ||
      positionToleranceMm <= 0 || positionToleranceMm > 1e-5) invalid('Invalid actual edge normal measurement policy.', {t, positionToleranceMm});
  let curve, uv, surface, point, du, dv, properties, normalPoint, nativeNormal, sphere, centerPoint;
  try {
    curve = new oc.BRepAdaptor_Curve2d(edge.wrapped, face.wrapped);
    const first = curve.FirstParameter(), last = curve.LastParameter(), parameter = first + t * (last - first);
    if (![first, last, parameter].every(Number.isFinite)) invalid('Actual pcurve interval is nonfinite.', {t, first, last});
    uv = curve.Value(parameter);
    const coordinates = [uv.X(), uv.Y()];
    if (!coordinates.every(Number.isFinite)) invalid('Actual pcurve UV is nonfinite.', {t, parameter, uv: coordinates});
    surface = new oc.BRepAdaptor_Surface(face.wrapped, false);
    point = new oc.gp_Pnt(); du = new oc.gp_Vec(); dv = new oc.gp_Vec();
    properties = new oc.BRepGProp_Face(face.wrapped, false);
    normalPoint = new oc.gp_Pnt(); nativeNormal = new oc.gp_Vec();
    surface.D1(...coordinates, point, du, dv); properties.Normal(...coordinates, normalPoint, nativeNormal);
    const position = vector(point), edgePoint = edgePointAt(edge, t), normalData = {
      normal: vector(nativeNormal), du: vector(du), dv: vector(dv)};
    if (!finite(position) || !finite(edgePoint)) invalid('Actual pcurve or 3D edge position is nonfinite.', {t, position, edgePoint});
    const gapMm = norm(difference(position, edgePoint));
    if (!Number.isFinite(gapMm)) invalid('Actual pcurve position gap is nonfinite.', {t});
    let normalMeasurement;
    try {normalMeasurement = normalizeOrientedSurfaceNormal(normalData);}
    catch (normalError) {
      const surfaceType = surface.GetType();
      if (surfaceType !== oc.GeomAbs_SurfaceType.GeomAbs_Sphere || !singularFiniteD1(normalData.du, normalData.dv) ||
          !finite(normalData.normal)) throw normalError;
      sphere = surface.Sphere(); centerPoint = sphere.Location();
      const center = vector(centerPoint), radiusMm = sphere.Radius(), chartDirect = sphere.Direct();
      const orientation = face.wrapped.Orientation(), orientations = oc.TopAbs_Orientation;
      if (!Number.isFinite(radiusMm) || radiusMm <= 0 || typeof chartDirect !== 'boolean' ||
          ![orientations.TopAbs_FORWARD, orientations.TopAbs_REVERSED].includes(orientation)) {
        invalid('Analytic sphere requires a positive finite radius and an explicit native Forward/Reversed orientation.',
          {surfaceType, radiusMm, chartDirect, orientation});
      }
      if (gapMm > positionToleranceMm) invalid('Actual sphere pole edge/pcurve gap exceeds the unchanged G0 tolerance.', {t, gapMm, positionToleranceMm});
      const pointProof = spherePoint(position, center, radiusMm, positionToleranceMm);
      const edgeProof = spherePoint(edgePoint, center, radiusMm, positionToleranceMm);
      const orientationSign = orientation === orientations.TopAbs_FORWARD ? 1 : -1;
      const chartSign = chartDirect ? 1 : -1, radialSign = orientationSign * chartSign;
      const direction = pointProof.radialUnit.map(value => value * radialSign);
      const witnesses = [], witnessErrors = [];
      for (const station of nearbyStations(t)) {
        let witnessUV;
        try {
          const witnessParameter = first + station * (last - first);
          witnessUV = curve.Value(witnessParameter);
          const witnessCoordinates = [witnessUV.X(), witnessUV.Y()];
          if (!witnessCoordinates.every(Number.isFinite)) invalid('Sphere witness pcurve UV is nonfinite.');
          surface.D1(...witnessCoordinates, point, du, dv);
          properties.Normal(...witnessCoordinates, normalPoint, nativeNormal);
          const actual = normalizeOrientedSurfaceNormal({normal: vector(nativeNormal), du: vector(du), dv: vector(dv)});
          const witnessPoint = vector(point), witnessEdgePoint = edgePointAt(edge, station);
          const witnessProof = spherePoint(witnessPoint, center, radiusMm, positionToleranceMm);
          spherePoint(witnessEdgePoint, center, radiusMm, positionToleranceMm);
          const witnessGapMm = norm(difference(witnessPoint, witnessEdgePoint));
          const expected = witnessProof.radialUnit.map(value => value * radialSign);
          const signedAlignmentDot = dot(actual.normal, expected);
          if (!Number.isFinite(witnessGapMm) || witnessGapMm > positionToleranceMm ||
              !Number.isFinite(signedAlignmentDot) || signedAlignmentDot < 1 - 1e-8) {
            invalid('Analytic sphere radial orientation disagrees with a nearby actual regular D1/BRep normal.',
              {station, witnessGapMm, signedAlignmentDot, orientation, chartDirect, radialSign});
          }
          witnesses.push({t: station, parameter: witnessParameter, uv: witnessCoordinates, point: witnessPoint,
            edgePoint: witnessEdgePoint, gapMm: witnessGapMm, orientedNormal: actual.normal,
            relativeJacobian: actual.relativeJacobian, signedAlignmentDot,
            radialResidualMm: witnessProof.radialResidualMm});
          if (witnesses.length === 2) break;
        } catch (error) {
          // A real sign/G0 disagreement is not hidden by choosing another point.
          if (error?.report?.signedAlignmentDot !== undefined || error?.report?.radialResidualMm !== undefined) throw error;
          witnessErrors.push({t: station, message: String(error?.message || error), details: error?.report || null});
        } finally {dispose(witnessUV);}
      }
      if (witnesses.length < 2) invalid('Analytic sphere pole has no two nearby actual regular pcurve D1 orientation witnesses.',
        {t, surfaceType, witnessErrors, witnesses, originalNormalDiagnostic: normalError?.report || null});
      normalMeasurement = {normal: direction, method: 'actual-native-analytic-sphere-implicit-gradient-pole-certificate',
        rawNormalMagnitude: norm(normalData.normal), duMagnitude: norm(normalData.du), dvMagnitude: norm(normalData.dv),
        relativeJacobian: null, alignmentAbsDot: null,
        analyticSpherePoleCertificate: {surfaceType, radiusMm, center, nativeFaceOrientation: orientation,
          sphereChartDirect: chartDirect, orientationSign, chartSign, radialSign, actualPcurvePoint: position,
          actualEdgePoint: edgePoint, radialResidualMm: pointProof.radialResidualMm,
          edgeRadialResidualMm: edgeProof.radialResidualMm, edgePcurveGapMm: gapMm, positionToleranceMm,
          implicitEquation: '|worldPoint-center|^2-radius^2=0',
          implicitGradient: pointProof.implicitGradient,
          implicitGradientMagnitude: pointProof.implicitGradientMagnitude,
          certifiedGeometricRegularity: true, certifiedOrientedDirection: true,
          proof: 'positive-radius-native-sphere-has-a-nonzero-world-implicit-gradient-at-this-actual-point',
          orientationWitnesses: witnesses, witnessErrors, originalNormalDiagnostic: normalError?.report || null,
          limitations: ['This proves the analytic sphere tangent plane only; the other incident face and the unchanged full G0/G1 seam check remain mandatory.']}};
    }
    return {point: position, edgePoint, normal: normalMeasurement.normal, normalMeasurement, gapMm, parameter, uv: coordinates};
  } finally {[centerPoint, sphere, nativeNormal, normalPoint, properties, dv, du, point, surface, uv, curve].forEach(dispose);}
}
