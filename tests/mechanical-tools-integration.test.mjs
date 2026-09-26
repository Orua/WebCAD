import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { CadKernel } from '../src/cad-kernel.js';
import { createReferenceSystem, resolvePlacement } from '../src/work-frame.js';
import { mechanicalExamples } from '../src/mechanical-tool-contracts.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
const dispose = item => { try { item?.delete?.(); } catch {} };
const near = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) < Math.max(tolerance, Math.abs(expected) * 1e-7), `${actual} != ${expected}`);
const referenceSystem = createReferenceSystem();
const documentFor = features => ({ version: 2, features, imports: {}, referenceSystem });
const feature = (id, op, params, refs = [], placement) => ({ id, name: id, op, params, refs, ...(placement ? { placement } : {}) });
const placement = (op, params, origin = [0, 0, 0], quaternion = [0, 0, 0, 1]) => resolvePlacement({ version: 1, frame: { kind: 'snapshot', origin, quaternion }, sourceAnchor: { kind: 'model-origin' } }, referenceSystem, op, params);
const rectangleParams = (originMm = [3, 0], widthMm = 2, heightMm = 4) => ({ profileVersion: 1, entities: [{ id: 'rectangle', type: 'rectangle', originMm, widthMm, heightMm }], loops: [{ id: 'outer', edges: [{ entityId: 'rectangle', reversed: false }] }], regions: [{ id: 'region', outerLoopId: 'outer', holeLoopIds: [] }], output: 'face' });
const circleParams = (diameterMm = 2) => ({ profileVersion: 1, entities: [{ id: 'circle', type: 'circle', centerMm: [0, 0], diameterMm }], loops: [{ id: 'outer', edges: [{ entityId: 'circle', reversed: false }] }], regions: [{ id: 'region', outerLoopId: 'outer', holeLoopIds: [] }], output: 'face' });
const pathParams = (length = 10) => ({ profileVersion: 1, entities: [{ id: 'path-line', type: 'line', startMm: [0, 0], endMm: [0, length] }], chains: [{ id: 'path-chain', edges: [{ entityId: 'path-line', reversed: false }] }], output: 'wire' });
const pathFeature = (length = 10) => { const params = pathParams(length); return feature('path', 'sketchProfile', params, [], placement('sketchProfile', params, [0, 0, 0], [Math.SQRT1_2, 0, 0, Math.SQRT1_2])); };
const sourceCircle = (id, z = 0, diameter = 2) => { const params = circleParams(diameter); return feature(id, 'sketchProfile', params, [], placement('sketchProfile', params, [0, 0, z])); };
const target = () => feature('target', 'box', { width: 4, depth: 4, height: 5 }, [], placement('box', { width: 4, depth: 4, height: 5 }, [-2, -2, 0]));
const ids = kernel => [...kernel.active.keys()];
const snapshot = kernel => ({ shapes: [...kernel.shapes].map(([id, shape]) => [id, shape.serialize()]), active: JSON.stringify([...kernel.active]), renderVersion: kernel.renderVersion, renderCache: JSON.stringify([...kernel.renderCache]), historySignature: [...kernel.historySignature], importsSignature: kernel.importsSignature });
const checkAtomic = async (kernel, document, invalidFeature) => {
  const before = snapshot(kernel);
  await assert.rejects(kernel.rebuild({ ...document, features: [...document.features, invalidFeature] }));
  assert.deepEqual(snapshot(kernel), before, `${invalidFeature.op} failure changed committed kernel state`);
};
const kernelTest = (label, run) => test(label, async () => { const kernel = new CadKernel(oc); kernel.quality = 'draft'; try { await run(kernel); } finally { kernel.dispose(); } });

kernelTest('saved source rotation preserves source and recomputes when the original primitive is edited', async kernel => {
  const source = feature('section', 'sketchProfile', rectangleParams());
  const result = feature('rotated', 'profileRevolve', mechanicalExamples.profileRevolve, ['section']);
  await kernel.rebuild(documentFor([source, result]));
  assert.deepEqual(ids(kernel), ['section', 'rotated']); near(kernel.measure('rotated').volume, 64 * Math.PI);
  const edited = structuredClone(source); edited.params.entities[0].widthMm = 3;
  await kernel.rebuild(documentFor([edited, result])); near(kernel.measure('rotated').volume, 108 * Math.PI);
  assert.equal(kernel.active.get('rotated').refs[0], 'section'); assert.equal(kernel.active.get('section').params.entities[0].id, 'rectangle');
});

kernelTest('saved section/path sweep retains both sources and updates after section and path edits', async kernel => {
  let section = sourceCircle('section'), path = pathFeature();
  const result = feature('swept', 'profileSweep', { operation: 'newBody' }, ['section', 'path']);
  await kernel.rebuild(documentFor([section, path, result])); assert.deepEqual(ids(kernel), ['section', 'path', 'swept']); near(kernel.measure('swept').volume, 10 * Math.PI);
  section = sourceCircle('section', 0, 4); await kernel.rebuild(documentFor([section, path, result])); near(kernel.measure('swept').volume, 40 * Math.PI);
  path = pathFeature(15); await kernel.rebuild(documentFor([section, path, result])); near(kernel.measure('swept').volume, 60 * Math.PI);
  assert.deepEqual(kernel.active.get('swept').refs, ['section', 'path']);
});

kernelTest('saved ordered section loft retains all sources and rebuilds after an end section size edit', async kernel => {
  const a = sourceCircle('a', 0, 2); let b = sourceCircle('b', 10, 2);
  const result = feature('lofted', 'profileLoft', { operation: 'newBody', ruled: true }, ['a', 'b']);
  await kernel.rebuild(documentFor([a, b, result])); assert.deepEqual(ids(kernel), ['a', 'b', 'lofted']); near(kernel.measure('lofted').volume, 10 * Math.PI);
  b = sourceCircle('b', 10, 4); await kernel.rebuild(documentFor([a, b, result])); near(kernel.measure('lofted').volume, 10 * Math.PI * 7 / 3);
  assert.deepEqual(kernel.active.get('lofted').refs, ['a', 'b']);
});

kernelTest('sweep and loft material features consume only the explicit last target for all modes', async kernel => {
  for (const [operation, volume] of [['join', 80 + 5 * Math.PI], ['cut', 80 - 5 * Math.PI], ['intersect', 5 * Math.PI]]) {
    const section = sourceCircle('section'), path = pathFeature(), end = sourceCircle('end', 10);
    for (const [op, sources, preserved] of [['profileSweep', [section, path], ['section', 'path']], ['profileLoft', [section, end], ['section', 'end']]]) {
      const result = feature('result', op, { operation, ruled: true }, [...preserved, 'target']);
      // ruled belongs only to loft; the raw kernel does not stand in for strict input validation.
      if (op === 'profileSweep') delete result.params.ruled;
      await kernel.rebuild(documentFor([...sources, target(), result]));
      assert.deepEqual(ids(kernel), [...preserved, 'result']); assert.ok(kernel.shapes.has('target')); assert.ok(!kernel.active.has('target'));
      near(kernel.measure('result').volume, volume);
    }
  }
});

kernelTest('rotation material feature preserves the saved section and replaces its last solid target', async kernel => {
  const section = feature('section', 'sketchProfile', rectangleParams());
  const cylinderParams = { radius: 6, height: 8 }, cylinder = feature('target', 'cylinder', cylinderParams, [], placement('cylinder', cylinderParams, [0, -2, 0], [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]));
  const result = feature('result', 'profileRevolve', { ...mechanicalExamples.profileRevolve, operation: 'cut' }, ['section', 'target']);
  await kernel.rebuild(documentFor([section, cylinder, result])); assert.deepEqual(ids(kernel), ['section', 'result']); near(kernel.measure('result').volume, 224 * Math.PI);
});

kernelTest('all added source/model operations preserve committed BRep, active/history/cache and renderVersion on failure', async kernel => {
  const base = documentFor([sourceCircle('section'), sourceCircle('end', 10), pathFeature(), target()]); await kernel.rebuild(base);
  const invalid = [
    feature('bad', 'profileRevolve', { ...mechanicalExamples.profileRevolve, axisDirection: [0, 0, 0] }, ['section']),
    feature('bad', 'profileSweep', { operation: 'cut' }, ['section', 'path']),
    feature('bad', 'profileLoft', { operation: 'newBody' }, ['section']),
    feature('bad', 'offsetSolid', { distanceMm: -50, join: 'intersection' }, ['target']),
    feature('bad', 'offsetSurface', { faceId: 999, distanceMm: 1 }, ['target']),
    feature('bad', 'draftByPlane', { ...mechanicalExamples.draftByPlane, faceIds: [999] }, ['target']),
    feature('bad', 'helix', { radiusMm: 3, pitchMm: -1, turns: 1 }),
    feature('bad', 'coil', { radiusMm: 3, pitchMm: 0.2, turns: 1, wireDiameterMm: 1 }),
    feature('bad', 'thread', { ...mechanicalExamples.thread, faceId: 999 }, ['target']),
  ];
  for (const item of invalid) await checkAtomic(kernel, base, item);
});

kernelTest('solid offset replaces its source while face offset preserves source as a separate exact face', async kernel => {
  const box = feature('box', 'box', { width: 10, depth: 8, height: 6 }); await kernel.rebuild(documentFor([box]));
  const faces = kernel.activeShape('box').faces; let top;
  try { top = faces.findIndex(face => { const center = face.center; try { return Math.abs(center.toTuple()[2] - 6) < 1e-7; } finally { dispose(center); } }); }
  finally { faces.forEach(dispose); }
  assert.ok(top >= 0);
  await kernel.rebuild(documentFor([box, feature('offset', 'offsetSolid', { distanceMm: 1, join: 'intersection' }, ['box'])]));
  assert.deepEqual(ids(kernel), ['offset']); near(kernel.measure('offset').volume, 960);
  await kernel.rebuild(documentFor([box, feature('face', 'offsetSurface', { faceId: top, distanceMm: 2 }, ['box'])]));
  assert.deepEqual(ids(kernel), ['box', 'face']); assert.equal(kernel.measure('face').solidCount, 0); near(cad.measureArea(kernel.activeShape('face')), 80);
  const bounds = kernel.measure('face').bounds; near(bounds.min[2], 8); near(bounds.max[2], 8);
});

kernelTest('arbitrary-neutral-plane draft is connected to kernel and replaces a real analytic source', async kernel => {
  const box = feature('box', 'box', { width: 10, depth: 8, height: 6 }); await kernel.rebuild(documentFor([box]));
  const faces = kernel.activeShape('box').faces; let sideIds;
  try { sideIds = faces.map((face, index) => { const n = face.normalAt(); try { return Math.abs(n.toTuple()[2]) < 1e-8 ? index : null; } finally { dispose(n); } }).filter(value => value !== null); }
  finally { faces.forEach(dispose); }
  await kernel.rebuild(documentFor([box, feature('drafted', 'draftByPlane', { faceIds: sideIds, neutralPoint: [0, 0, 0], neutralNormal: [0, 0, 1], pullDirection: [0, 0, 1], angleDeg: 2 }, ['box'])]));
  assert.deepEqual(ids(kernel), ['drafted']); assert.ok(kernel.measure('drafted').volume < 480); assert.ok(kernel.measure('drafted').volume > 300);
});

kernelTest('exact helix and round-wire coil use frozen creation placement across work-frame changes', async kernel => {
  const helixParams = { radiusMm: 3, pitchMm: 2, turns: 1.5 }, coilParams = { ...helixParams, wireDiameterMm: 0.4 };
  const features = [feature('helix', 'helix', helixParams, [], placement('helix', helixParams, [15, 30, 4])), feature('coil', 'coil', coilParams, [], placement('coil', coilParams, [35, 30, 4]))];
  let result = await kernel.rebuild(documentFor(features)); assert.deepEqual(ids(kernel), ['helix', 'coil']);
  assert.equal(kernel.measure('helix').solidCount, 0); near(cad.measureLength(kernel.activeShape('helix')), 1.5 * Math.hypot(6 * Math.PI, 2));
  near(kernel.measure('coil').volume, Math.PI * 0.2 ** 2 * 1.5 * Math.hypot(6 * Math.PI, 2), 1e-4);
  const before = snapshot(kernel), bounds = result.bodies.map(body => body.bounds);
  result = await kernel.rebuild({ ...documentFor(features), referenceSystem: { ...referenceSystem, workFrame: { ...referenceSystem.workFrame, origin: [200, 100, 50], quaternion: [0, 0, Math.SQRT1_2, Math.SQRT1_2], frameVersion: 2 } } });
  assert.deepEqual(result.bodies.map(body => body.bounds), bounds); assert.deepEqual(snapshot(kernel), before);
});

kernelTest('saved slanted profile rotation uses its frozen placement after a later work-anchor move', async kernel => {
  const params = rectangleParams(), origin = [20, 30, 40], source = feature('section', 'sketchProfile', params, [], placement('sketchProfile', params, origin, [0, 0, Math.SQRT1_2, Math.SQRT1_2]));
  const result = feature('result', 'profileRevolve', { axisPoint: origin, axisDirection: [-1, 0, 0], angleDeg: 360 }, ['section']);
  let output = await kernel.rebuild(documentFor([source, result])); near(kernel.measure('result').volume, 64 * Math.PI);
  const bounds = output.bodies.find(body => body.id === 'result').bounds, before = snapshot(kernel);
  output = await kernel.rebuild({ ...documentFor([source, result]), referenceSystem: { ...referenceSystem, workFrame: { ...referenceSystem.workFrame, origin: [100, 500, 900], frameVersion: 2 } } });
  assert.deepEqual(output.bodies.find(body => body.id === 'result').bounds, bounds); assert.deepEqual(snapshot(kernel), before);
});

kernelTest('modeled thread removes exact material, consumes its target and publishes truthful V-groove readback', async kernel => {
  const cylinder = feature('cylinder', 'cylinder', { radius: 5, height: 8 }); await kernel.rebuild(documentFor([cylinder]));
  const faces = kernel.activeShape('cylinder').faces; let faceId;
  try { faceId = faces.findIndex(face => face.geomType === 'CYLINDRE'); } finally { faces.forEach(dispose); }
  assert.ok(faceId >= 0);
  const params = { faceId, kind: 'external', pitchMm: 2, depthMm: 0.3, lengthMm: 4, startOffsetMm: 2, includedAngleDeg: 60, leftHanded: false };
  const result = await kernel.rebuild(documentFor([cylinder, feature('threaded', 'thread', params, ['cylinder'])]));
  assert.deepEqual(ids(kernel), ['threaded']); assert.ok(kernel.measure('threaded').volume < 200 * Math.PI); assert.ok(kernel.measure('threaded').volume > 190 * Math.PI);
  const report = result.bodies[0].threadReport; assert.equal(report.profile, 'explicit-symmetric-V-groove'); assert.equal(report.standard, 'none'); assert.equal(report.faceId, faceId); assert.deepEqual(report.axisOrigin, [0, 0, 2]);
});

kernelTest('kernel STEP export and OCCT reimport preserve exact derived solid volume', async kernel => {
  const doc = documentFor([sourceCircle('section'), pathFeature(), feature('solid', 'profileSweep', { operation: 'newBody' }, ['section', 'path'])]);
  await kernel.rebuild(doc); const exported = await kernel.export('step', ['solid']);
  assert.equal(exported.mime, 'application/step'); assert.ok(exported.data.length > 1000);
  const restored = await cad.importSTEP(new Blob([exported.data]));
  try { near(cad.measureVolume(restored), 10 * Math.PI, 1e-4); const solids = restored.solids; try { assert.equal(solids.length, 1); } finally { solids.forEach(dispose); } }
  finally { dispose(restored); }
});

const lockedRectangleDimensions = (width, height) => [
  { type: 'fixPoint', point: { entityId: 'rectangle_0', point: 'start' }, positionMm: [5, 7] },
  { type: 'length', entityId: 'rectangle_0', lengthMm: width },
  { type: 'length', entityId: 'rectangle_1', lengthMm: height },
];
const constrainedRectangleSource = () => {
  const params = rectangleParams([5, 7], 10, 6);
  return feature('source', 'sketchProfile', params, [], placement('sketchProfile', params, [20, 30, 40], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]));
};
const constraintExtrusion = sourceId => feature('solid', 'profileExtrude', { operation: 'newBody', extent: 'distance', direction: 1, distanceMm: 3 }, [sourceId]);

kernelTest('placed saved rectangle constraints publish actual rank and drive extrusion in the frozen local plane', async kernel => {
  const source = constrainedRectangleSource(), constrained = feature('constrained', 'profileConstraints', { constraints: lockedRectangleDimensions(12, 8) }, ['source']), solid = constraintExtrusion('constrained');
  const beforeSource = structuredClone(source); let output = await kernel.rebuild(documentFor([source, constrained, solid]));
  assert.deepEqual(ids(kernel), ['source', 'constrained', 'solid']); assert.deepEqual(source, beforeSource);
  near(cad.measureArea(kernel.activeShape('source')), 60); near(cad.measureArea(kernel.activeShape('constrained')), 96); near(kernel.measure('solid').volume, 288);
  const body = output.bodies.find(item => item.id === 'constrained'), report = body.constraintReport;
  assert.equal(report.sourceId, 'source'); assert.equal(report.coordinateSystem, 'frozen-source-local-2D'); assert.equal(report.constraintCount, 3);
  assert.equal(report.degreesOfFreedom, 0); assert.equal(report.underconstrained, false); assert.equal(report.rank, report.variableCount);
  assert.ok(report.maxResidualMm <= 1e-6); assert.deepEqual(report.unsatisfiedConstraintIds, []);
  assert.deepEqual(report.primitiveConversion, [{ sourceId: 'rectangle', sourceType: 'rectangle', entityIds: ['rectangle_0', 'rectangle_1', 'rectangle_2', 'rectangle_3'] }]);
  assert.equal(report.intrinsicConstraints.length, 4); assert.ok(body.faceCount > 0); assert.ok(body.edgeCount >= 4);
  const bounds = kernel.measure('solid').bounds; near(bounds.min[0], 25); near(bounds.max[0], 37); near(bounds.min[1], 27); near(bounds.max[1], 30); near(bounds.min[2], 47); near(bounds.max[2], 55);
  const frozen = snapshot(kernel);
  output = await kernel.rebuild({ ...documentFor([source, constrained, solid]), referenceSystem: { ...referenceSystem, workFrame: { ...referenceSystem.workFrame, origin: [300, 500, 100], quaternion: [0, 0, Math.SQRT1_2, Math.SQRT1_2], frameVersion: 2 } } });
  assert.deepEqual(snapshot(kernel), frozen); assert.deepEqual(output.bodies.find(item => item.id === 'solid').bounds, bounds);
});

kernelTest('editing driving dimensions rebuilds the dependent exact solid while preserving original source geometry and refs', async kernel => {
  const source = constrainedRectangleSource(), constrained = feature('constrained', 'profileConstraints', { constraints: lockedRectangleDimensions(12, 8) }, ['source']), solid = constraintExtrusion('constrained');
  await kernel.rebuild(documentFor([source, constrained, solid])); const originalBrep = kernel.shapes.get('source').serialize(), previousVersion = kernel.renderVersion;
  const edited = structuredClone(constrained); edited.params.constraints[1].lengthMm = 20;
  await kernel.rebuild(documentFor([source, edited, solid])); near(kernel.measure('solid').volume, 480); near(cad.measureArea(kernel.activeShape('constrained')), 160);
  assert.deepEqual(kernel.shapes.get('source').serialize(), originalBrep); assert.deepEqual(kernel.active.get('constrained').refs, ['source']); assert.deepEqual(kernel.active.get('solid').refs, ['constrained']); assert.ok(kernel.renderVersion > previousVersion);
  assert.deepEqual(kernel.active.get('source').params.entities.map(item => item.id), ['rectangle']);
});

kernelTest('chained profile constraints retain inherited dimensions and update downstream solids when their source changes', async kernel => {
  const source = constrainedRectangleSource(), parent = feature('width', 'profileConstraints', { constraints: lockedRectangleDimensions(12, 8).slice(0, 2) }, ['source']);
  const child = feature('height', 'profileConstraints', { constraints: [{ type: 'length', entityId: 'rectangle_1', lengthMm: 8 }] }, ['width']), solid = constraintExtrusion('height');
  let output = await kernel.rebuild(documentFor([source, parent, child, solid])); near(kernel.measure('solid').volume, 288);
  let report = output.bodies.find(item => item.id === 'height').constraintReport; assert.equal(report.constraintCount, 3); assert.equal(report.degreesOfFreedom, 0);
  assert.deepEqual(ids(kernel), ['source', 'width', 'height', 'solid']); assert.equal(output.bodies.find(item => item.id === 'width').constraintReport.degreesOfFreedom, 1);
  const editedParent = structuredClone(parent); editedParent.params.constraints[1].lengthMm = 20;
  output = await kernel.rebuild(documentFor([source, editedParent, child, solid])); near(kernel.measure('solid').volume, 480);
  report = output.bodies.find(item => item.id === 'height').constraintReport; assert.equal(report.degreesOfFreedom, 0); assert.ok(report.maxResidualMm <= 1e-6);
  const editedSource = structuredClone(source); editedSource.params.entities[0].heightMm = 9;
  await kernel.rebuild(documentFor([editedSource, editedParent, child, solid])); near(cad.measureArea(kernel.activeShape('source')), 90); near(kernel.measure('solid').volume, 480);
});

kernelTest('contradictory inherited constraints and unsupported source types fail without changing committed shapes or render state', async kernel => {
  const source = constrainedRectangleSource(), constrained = feature('constrained', 'profileConstraints', { constraints: lockedRectangleDimensions(12, 8) }, ['source']), solid = constraintExtrusion('constrained');
  const base = documentFor([source, constrained, solid]); await kernel.rebuild(base);
  await checkAtomic(kernel, base, feature('conflict', 'profileConstraints', { constraints: [{ id: 'contradiction', type: 'length', entityId: 'rectangle_0', lengthMm: 20 }] }, ['constrained']));
  await checkAtomic(kernel, base, feature('badSource', 'profileConstraints', { constraints: [] }, ['solid']));
  await checkAtomic(kernel, base, feature('missingEntity', 'profileConstraints', { constraints: [{ type: 'radius', entityId: 'missing', radiusMm: 2 }] }, ['source']));
});
