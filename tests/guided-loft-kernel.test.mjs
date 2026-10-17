import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { buildGuidedLoft } from '../src/loft-guided.js';
import { buildBoundGuidedLoft } from '../src/guided-loft-binding.js';
import { getOperation, guidedLoftContract } from '../src/guided-loft-contract.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
cad.setOC(oc);
const dispose = value => { try { value?.delete?.(); } catch {} };
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map(v => v * s);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const norm = a => Math.hypot(...a);
const unit = a => mul(a, 1 / norm(a));
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const makeSection = (centerMm, widthMm, depthMm, frame = {}) => ({
  frame: { centerMm, normal: frame.normal ?? [0, 0, 1], widthDirection: frame.widthDirection ?? [1, 0, 0] },
  profile: { kind: 'ellipse', widthMm, depthMm },
});
const axesY = frame => unit([
  frame.normal[1] * frame.widthDirection[2] - frame.normal[2] * frame.widthDirection[1],
  frame.normal[2] * frame.widthDirection[0] - frame.normal[0] * frame.widthDirection[2],
  frame.normal[0] * frame.widthDirection[1] - frame.normal[1] * frame.widthDirection[0],
]);
const rail = (sections, sign = 1) => sections.map(s => add(s.frame.centerMm, mul(axesY(s.frame), sign * s.profile.depthMm / 2)));
const profileEdgeMidpoint = section => {
  const a = section.profile.widthMm / 2, b = section.profile.depthMm / 2, k = 4 * Math.tan(Math.PI / 8) / 3;
  const poles = [[0, b], [k * a, b], [a, k * b], [a, 0]];
  let p = poles.map(q => add(section.frame.centerMm, add(mul(section.frame.widthDirection, q[0]), mul(axesY(section.frame), q[1]))));
  for (let i = 0; i < 3; i++) p = p.slice(0, -1).map((q, j) => mul(add(q, p[j + 1]), 0.5));
  return p[0];
};

function faceLongitudinalJet(shape, xyz) {
  const p = new oc.gp_Pnt(...xyz), faces = shape.faces;
  try {
    for (const face of faces.filter(f => f.geomType === 'BSPLINE_SURFACE')) {
      let surface, projection, uv, point, du, dv, duu, dvv, duv;
      try {
        surface = oc.BRep_Tool.Surface(face.wrapped);
        projection = new oc.GeomAPI_ProjectPointOnSurf(p, surface, 1e-6);
        if (!projection.IsDone() || projection.NbPoints() < 1 || projection.LowerDistance() > 0.02) continue;
        uv = projection.LowerDistanceParameters();
        point = new oc.gp_Pnt(); du = new oc.gp_Vec(); dv = new oc.gp_Vec();
        duu = new oc.gp_Vec(); dvv = new oc.gp_Vec(); duv = new oc.gp_Vec();
        surface.D2(uv.U, uv.V, point, du, dv, duu, dvv, duv);
        const u = [du.X(), du.Y(), du.Z()], v = [dv.X(), dv.Y(), dv.Z()], vv = [dvv.X(), dvv.Y(), dvv.Z()];
        const normal = unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
        const curvature = dot(normal, vv) / (norm(v) ** 2);
        return { normal, curvature, u, v };
      } catch { /* the nearest matching face is checked next */ }
      finally { [surface, projection, uv, point, du, dv, duu, dvv, duv].forEach(dispose); }
    }
    throw new Error('No actual B-rep side surface could be differentiated at the shared section.');
  } finally { dispose(p); faces.forEach(dispose); }
}

function firstFeatureForMatch() {
  const sections = [makeSection([0, 0, 0], 3, 2), makeSection([0, 0, 5], 4.5, 2.5), makeSection([0, 0, 10], 5, 3)];
  const params = { sections, guides: [{ role: 'dorsal', pointsMm: rail(sections) }] };
  return { sections, params, shape: buildGuidedLoft(params, cad), feature: { id: 'previous', params } };
}

test('TC25-1: existing single-guide circular pipe remains a valid positive-volume B-rep', () => {
  const params = {
    sections: [{ centerMm: [0, 0, 0], radiusMm: 6 }, { centerMm: [0, 0, 20], radiusMm: 6 }],
    spinePointsMm: [[0, 0, 0], [1, 0, 10], [0, 0, 20]],
    guides: [{ role: 'lateral', pointsMm: [[6, 0, 0], [7, 0, 10], [6, 0, 20]] }],
    startCondition: 'G1', endCondition: 'G1', startTangentMm: [0, 0, 1], endTangentMm: [0, 0, 1],
  };
  const shape = buildGuidedLoft(params, cad);
  try {
    const solids = shape.solids;
    try { assert.equal(solids.length, 1); } finally { solids.forEach(dispose); }
    assert.ok(cad.measureVolume(shape) > 0);
    assert.ok(shape.guidedLoftReport.maxGuideDeviationMm <= 0.05);
    console.log('TC25-1 measured', JSON.stringify({ volumeMm3: shape.guidedLoftReport.volumeMm3, maxGuideDeviationMm: shape.guidedLoftReport.maxGuideDeviationMm }));
  } finally { dispose(shape); }
});

test('TC25-2 local section: two v6 first-section rails lie on the generated side B-rep surfaces', () => {
  // Source: the first curveSweep section from references/whale-v6.webcad; copied here only as a geometric fixture.
  const v6First = {
    frame: { centerMm: [-18.9157, -0.0002, -1.9279], normal: [0.995492643, -0.090199333, -0.029299783], widthDirection: [0.090397269, 0.995890598, 0.005500002] },
    profile: { kind: 'ellipse', widthMm: 0.1582, depthMm: 0.08 },
  };
  const travel = mul(unit(v6First.frame.normal), 4);
  const next = { ...v6First, frame: { ...v6First.frame, centerMm: add(v6First.frame.centerMm, travel) } };
  const sections = [v6First, next];
  const params = { sections, guides: [
    { role: 'dorsal', pointsMm: rail(sections) },
    { role: 'ventral', pointsMm: rail(sections, -1) },
  ], guideToleranceMm: 0.05, fitToleranceMm: 0.01 };
  const shape = buildGuidedLoft(params, cad);
  try {
    const solids = shape.solids;
    try { assert.equal(solids.length, 1); } finally { solids.forEach(dispose); }
    assert.ok(cad.measureVolume(shape) > 0);
    assert.equal(shape.guidedLoftReport.patchCount, 4);
    assert.ok(shape.guidedLoftReport.maxGuideDeviationMm <= 0.05);
    console.log('TC25-2 measured', JSON.stringify({ volumeMm3: shape.guidedLoftReport.volumeMm3, maxGuideDeviationMm: shape.guidedLoftReport.maxGuideDeviationMm, fitErrorMm: shape.guidedLoftReport.fitErrorMm, boundaryCount: shape.guidedLoftReport.guides.length }));
    for (const point of [...params.guides[0].pointsMm, ...params.guides[1].pointsMm]) {
      const probe = cad.makeVertex(point);
      try { assert.ok(cad.measureDistanceBetween(shape, probe) <= 0.05); } finally { dispose(probe); }
    }
  } finally { dispose(shape); }
});

test('TC25-3 G1: matchTo.end=end binds the source end to the inferred target start; actual seam normals agree', () => {
  const previous = firstFeatureForMatch();
  const sections = [previous.sections.at(-1), makeSection([0, 0, 20], 6, 4)];
  const params = {
    sections, guides: [{ role: 'dorsal', pointsMm: rail(sections) }],
    startCondition: 'G1', endCondition: 'G0', matchTo: { featureId: 'previous', end: 'end' },
  };
  const next = buildGuidedLoft(params, cad, { matchFeature: previous.feature, matchShape: previous.shape });
  try {
    const point = profileEdgeMidpoint(sections[0]);
    const left = faceLongitudinalJet(previous.shape, point), right = faceLongitudinalJet(next, point);
    const angleDeg = Math.acos(Math.min(1, Math.abs(dot(left.normal, right.normal)))) * 180 / Math.PI;
    assert.ok(angleDeg < 1, `actual adjacent B-rep normal angle=${angleDeg} degrees`);
    console.log('TC25-3 G1 measured', JSON.stringify({ normalAngleDeg: angleDeg }));
    assert.equal(next.guidedLoftReport.matchTo.matchedActualBrep, true);
    assert.equal(next.guidedLoftReport.matchTo.sourceEnd, 'end');
    assert.equal(next.guidedLoftReport.matchTo.targetEnd, 'start');
    assert.equal(next.guidedLoftReport.startJet.source, 'matchTo:previous');
  } finally { dispose(next); dispose(previous.shape); }
});

test('TC25-3 G2: matched actual seam has less than 10% longitudinal curvature error', () => {
  const previous = firstFeatureForMatch();
  const sections = [previous.sections.at(-1), makeSection([0, 0, 20], 6, 4)];
  const params = {
    sections, guides: [{ role: 'dorsal', pointsMm: rail(sections) }],
    startCondition: 'G2', endCondition: 'G0', matchTo: { featureId: 'previous', end: 'end' },
  };
  const next = buildGuidedLoft(params, cad, { matchFeature: previous.feature, matchShape: previous.shape });
  try {
    const point = profileEdgeMidpoint(sections[0]);
    const left = faceLongitudinalJet(previous.shape, point), right = faceLongitudinalJet(next, point);
    const relativeError = Math.abs(left.curvature - right.curvature) / Math.max(Math.abs(left.curvature), 1e-8);
    assert.ok(Math.abs(left.curvature) > 1e-6, `fixture must exercise nonzero actual seam curvature; curvature=${left.curvature}`);
    assert.ok(relativeError < 0.1, `actual relative normal-curvature error=${relativeError}`);
    console.log('TC25-3 G2 measured', JSON.stringify({ previousNormalCurvaturePerMm: left.curvature, nextNormalCurvaturePerMm: right.curvature, relativeErrorPct: relativeError * 100 }));
    assert.ok(next.guidedLoftReport.startJet.d2Mm.length === 16);
  } finally { dispose(next); dispose(previous.shape); }
});

test('same-end source/target pairing reverses D1 while preserving D2', () => {
  const rootSections = [makeSection([0, 0, -5], 3, 2), makeSection([0, 0, 0], 3, 2)];
  const rootParams = { sections: rootSections, guides: [{ role: 'dorsal', pointsMm: rail(rootSections) }] };
  const rootShape = buildGuidedLoft(rootParams, cad), rootFeature = { id: 'root', params: rootParams };
  const base = firstFeatureForMatch(), priorParams = { ...base.params, startCondition: 'G2', endCondition: 'G0', matchTo: { featureId: 'root', end: 'end' } };
  const priorShape = buildGuidedLoft(priorParams, cad, { matchFeature: rootFeature, matchShape: rootShape });
  const previous = { ...base, shape: priorShape, feature: { id: 'previous', params: priorParams } };
  const sections = [previous.sections[0], makeSection([0, 0, -10], 6, 4)];
  const params = { sections, guides: [{ role: 'dorsal', pointsMm: rail(sections) }], startCondition: 'G2', endCondition: 'G0', matchTo: { featureId: 'previous', end: 'start' } };
  const next = buildGuidedLoft(params, cad, { matchFeature: previous.feature, matchShape: previous.shape });
  try {
    for (let i = 0; i < 16; i++) {
      const sourceD1 = previous.shape.guidedLoftReport.startJet.d1Mm[i], targetD1 = next.guidedLoftReport.startJet.d1Mm[i];
      const sourceD2 = previous.shape.guidedLoftReport.startJet.d2Mm[i], targetD2 = next.guidedLoftReport.startJet.d2Mm[i];
      assert.ok(norm(add(sourceD1, targetD1)) < 1e-10, `D1 pole ${i} must reverse for same-end pairing`);
      assert.ok(norm(sub(sourceD2, targetD2)) < 1e-10, `D2 pole ${i} must keep its direction for same-end pairing`);
    }
  } finally { dispose(next); dispose(previous.shape); dispose(rootShape); }
});

test('strict parent registration contract carries one finite example and context wiring signature', () => {
  const operation = getOperation('guidedLoft');
  assert.equal(operation.id, 'guidedLoft');
  assert.equal(operation.strict, true);
  assert.equal(operation.inputSchema.additionalProperties, false);
  assert.deepEqual(operation.example, guidedLoftContract.finiteExample);
  assert.deepEqual(operation.refs, { min: 0, max: 1 });
  assert.match(operation.functionContract.signature, /buildBoundGuidedLoft\(feature, shapes, historyFeatures, cad\)/);
  assert.match(operation.functionContract.result, /placement once/);
  assert.match(guidedLoftContract.functionContract.signature, /context = \{ matchFeature, matchShape \}/);
  assert.equal(operation.example.sections.length, 2);
  assert.equal(operation.example.matchTo.end, 'end');
  assert.throws(() => buildGuidedLoft({
    sections: [makeSection([0, 0, 0], 4, 2), makeSection([0, 0, 5], 4, 2)],
    guides: [{ role: 'dorsal', pointsMm: [[0, 1, 0], [0, 1, 5]] }],
    startCondition: 'G1', endCondition: 'G1', matchTo: { featureId: 'previous', end: 'end' },
  }, cad), error => error.code === 'GUIDED_LOFT_SINGLE_MATCH_LIMIT');
});

function rotateQuaternion(q, v) {
  const [x, y, z, w] = q, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const uv = cross([x, y, z], v), uuv = cross([x, y, z], uv);
  return v.map((value, i) => value + 2 * (w * uv[i] + uuv[i]));
}
const applyPlacementPoint = (p, placement) => add(rotateQuaternion(placement.frameSnapshot.quaternion, sub(p, placement.sourcePoint)), placement.frameSnapshot.origin);
const inversePlacementPoint = (p, placement) => add(rotateQuaternion(placement.frameSnapshot.quaternion.map((v, i) => i === 3 ? v : -v), sub(p, placement.frameSnapshot.origin)), placement.sourcePoint);
const transformPlacedShape = (shape, placement) => {
  let out = shape.clone();
  try {
    let next = out.translate(...placement.sourcePoint.map(v => -v)); dispose(out); out = next;
    const [x, y, z, w] = placement.frameSnapshot.quaternion, length = Math.hypot(x, y, z);
    if (length > 1e-12) { next = out.rotate(2 * Math.atan2(length, w) * 180 / Math.PI, [0, 0, 0], [x / length, y / length, z / length]); dispose(out); out = next; }
    next = out.translate(...placement.frameSnapshot.origin); dispose(out); return next;
  } catch (error) { dispose(out); throw error; }
};

test('parent dispatch helper binds a three-feature G2 chain across frozen creation frames', () => {
  const sourceLocal = firstFeatureForMatch(), sourcePlacement = {
    frameSnapshot: { origin: [13, -4, 7], quaternion: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] }, sourcePoint: [0, 0, 0],
  }, targetPlacement = {
    frameSnapshot: { origin: [-20, 15, 4], quaternion: [Math.sin(Math.PI / 12), 0, 0, Math.cos(Math.PI / 12)] }, sourcePoint: [0, 0, 0],
  };
  const source = { ...sourceLocal.feature, id: 'source', op: 'guidedLoft', refs: [], placement: sourcePlacement };
  let worldSource, middle, middleWorld, third;
  try {
    worldSource = transformPlacedShape(sourceLocal.shape, sourcePlacement);
    const localEnd = sourceLocal.sections.at(-1), worldCenter = applyPlacementPoint(localEnd.frame.centerMm, sourcePlacement), targetCenter = inversePlacementPoint(worldCenter, targetPlacement);
    const worldNormal = rotateQuaternion(sourcePlacement.frameSnapshot.quaternion, localEnd.frame.normal), worldWidth = rotateQuaternion(sourcePlacement.frameSnapshot.quaternion, localEnd.frame.widthDirection);
    const inverseQ = targetPlacement.frameSnapshot.quaternion.map((v, i) => i === 3 ? v : -v);
    const normal = rotateQuaternion(inverseQ, worldNormal), widthDirection = rotateQuaternion(inverseQ, worldWidth);
    const seam = makeSection(targetCenter, 5, 3, { normal, widthDirection });
    const next = makeSection(add(targetCenter, mul(normal, 10)), 6, 4, { normal, widthDirection });
    const middleParams = { sections: [seam, next], guides: [{ role: 'dorsal', pointsMm: rail([seam, next]) }], startCondition: 'G2', endCondition: 'G0', matchTo: { featureId: 'source', end: 'end' } };
    const middleFeature = { id: 'middle', op: 'guidedLoft', refs: ['source'], params: middleParams, placement: targetPlacement };
    middle = buildBoundGuidedLoft(middleFeature, new Map([['source', worldSource]]), [source], cad);
    assert.equal(middle.guidedLoftReport.startJet.source, 'matchTo:source');
    middleWorld = transformPlacedShape(middle, targetPlacement);

    const nextPlacement = { frameSnapshot: { origin: [31, 8, -5], quaternion: [0, Math.sin(Math.PI / 10), 0, Math.cos(Math.PI / 10)] }, sourcePoint: [0, 0, 0] };
    const middleEnd = middleParams.sections.at(-1), middleWorldCenter = applyPlacementPoint(middleEnd.frame.centerMm, targetPlacement), thirdCenter = inversePlacementPoint(middleWorldCenter, nextPlacement);
    const middleWorldNormal = rotateQuaternion(targetPlacement.frameSnapshot.quaternion, middleEnd.frame.normal), middleWorldWidth = rotateQuaternion(targetPlacement.frameSnapshot.quaternion, middleEnd.frame.widthDirection);
    const nextInverseQ = nextPlacement.frameSnapshot.quaternion.map((v, i) => i === 3 ? v : -v);
    const thirdNormal = rotateQuaternion(nextInverseQ, middleWorldNormal), thirdWidth = rotateQuaternion(nextInverseQ, middleWorldWidth);
    const thirdSeam = makeSection(thirdCenter, 6, 4, { normal: thirdNormal, widthDirection: thirdWidth });
    const thirdNext = makeSection(add(thirdCenter, mul(thirdNormal, 8)), 5.5, 3.5, { normal: thirdNormal, widthDirection: thirdWidth });
    const thirdParams = { sections: [thirdSeam, thirdNext], guides: [{ role: 'dorsal', pointsMm: rail([thirdSeam, thirdNext]) }], startCondition: 'G1', endCondition: 'G0', matchTo: { featureId: 'middle', end: 'end' } };
    third = buildBoundGuidedLoft({ id: 'third', op: 'guidedLoft', refs: ['middle'], params: thirdParams, placement: nextPlacement }, new Map([['middle', middleWorld]]), [source, middleFeature], cad);
    assert.equal(third.guidedLoftReport.matchTo.sourceEnd, 'end');
    assert.equal(third.guidedLoftReport.startJet.source, 'matchTo:middle');
  } finally { [third, middleWorld, middle, worldSource, sourceLocal.shape].forEach(dispose); }
});

test('parent dispatch helper requires exact refs and frozen anchor points', () => {
  const sectionA = makeSection([0, 0, 0], 4, 2), sectionB = makeSection([0, 0, 5], 4, 2), params = { sections: [sectionA, sectionB], guides: [{ role: 'dorsal', pointsMm: rail([sectionA, sectionB]) }] };
  assert.throws(() => buildBoundGuidedLoft({ id: 'loft', op: 'guidedLoft', refs: ['wrong'], params: { ...params, matchTo: { featureId: 'source', end: 'end' }, startCondition: 'G1' }, placement: { frameSnapshot: { origin: [0, 0, 0], quaternion: [0, 0, 0, 1] }, sourcePoint: [0, 0, 0] } }, new Map(), [], cad), { code: 'GUIDED_LOFT_BINDING_REFS_INVALID' });
  assert.throws(() => buildBoundGuidedLoft({ id: 'loft', op: 'guidedLoft', refs: [], params, placement: { frameSnapshot: { origin: [0, 0, 0], quaternion: [0, 0, 0, 1] }, sourceAnchor: { kind: 'bounds-center' } } }, new Map(), [], cad), { code: 'GUIDED_LOFT_BINDING_ANCHOR_UNFROZEN' });
});
