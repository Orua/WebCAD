import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { buildSketchProfile } from '../src/modeling/profiles/profile-model.js';
import { buildProfileRevolve, buildProfileSweep, buildProfileLoft } from '../src/modeling/profiles/profile-solid-features.js';
import { profileSolidOperations, profileSolidExamples, profileSolidRefCounts } from '../src/modeling/profiles/profile-solid-contracts.js';
import { validateSchema } from '../src/contracts/operation-schema.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
cad.setOC(oc);
const dispose = shape => { try { shape?.delete?.(); } catch {} };
const near = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const valid = shape => {
  const solids = shape.solids, checker = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
  try { assert.equal(solids.length, 1); assert.equal(checker.IsValid(), true); assert.ok(cad.measureVolume(shape) > 0); }
  finally { solids.forEach(dispose); dispose(checker); }
};
const circle = (z = 0, radius = 1) => {
  const drawing = cad.drawCircle(radius), sketch = drawing.sketchOnPlane('XY', [0, 0, z]);
  try { return sketch.wire.clone(); } finally { [sketch, drawing].forEach(dispose); }
};
const rectangle = (originMm = [3, 0], widthMm = 2, heightMm = 4) => buildSketchProfile({
  profileVersion: 1, entities: [{ id: 'section', type: 'rectangle', originMm, widthMm, heightMm }],
  loops: [{ id: 'outer', edges: [{ entityId: 'section', reversed: false }] }],
  regions: [{ id: 'region', outerLoopId: 'outer', holeLoopIds: [] }], output: 'face',
}, cad);
const axis = { axisPoint: [0, 0, 0], axisDirection: [0, 1, 0], angleDeg: 360 };
const snapshot = shapes => shapes.map(shape => shape.serialize());

test('contracts expose explicit world axis, true source ref counts and valid minimal params', () => {
  for (const [id, operation] of Object.entries(profileSolidOperations)) {
    validateSchema(operation.paramsSchema, profileSolidExamples[id], '$.params');
    assert.equal(operation.paramsSchema.additionalProperties, false);
    assert.equal(operation.paramsSchema.properties.operation.default, 'newBody');
    assert.equal(operation.refsMax, profileSolidRefCounts[id].max);
  }
  assert.equal(profileSolidRefCounts.profileLoft.modification.max, 13);
  assert.throws(() => validateSchema(profileSolidOperations.profileRevolve.paramsSchema, { ...axis, angleDeg: 361 }, '$.params'));
});

test('saved exact rectangle revolves fully and partially with analytic toroidal volume', () => {
  const profile = rectangle(), before = snapshot([profile]); let full, quarter;
  try {
    full = buildProfileRevolve([profile], axis, cad);
    quarter = buildProfileRevolve([profile], { ...axis, angleDeg: 90 }, cad);
    valid(full); valid(quarter); near(cad.measureVolume(full), 64 * Math.PI); near(cad.measureVolume(quarter), 16 * Math.PI);
    assert.deepEqual(snapshot([profile]), before);
  } finally { [quarter, full, profile].forEach(dispose); }
});

test('world axis is explicit and native Face holes survive rotation', () => {
  const outer = rectangle([3, 0], 4, 6), innerEdge = cad.makeCircle(1, [5, 3, 0], [0, 0, 1]);
  const inner = cad.assembleWire([innerEdge]).flipOrientation(), outerWire = outer.clone().outerWire(), face = cad.makeFace(outerWire, [inner]);
  const moved = face.clone().translate(17, 9, 5), before = snapshot([face, moved]); let result;
  try {
    result = buildProfileRevolve([moved], { ...axis, axisPoint: [17, 9, 5] }, cad);
    valid(result); near(cad.measureVolume(result), 10 * Math.PI * (24 - Math.PI), 1e-4);
    assert.deepEqual(snapshot([face, moved]), before);
  } finally { [result, moved, face, outerWire, inner, innerEdge, outer].forEach(dispose); }
});

test('revolve rejects invalid axes, angles, open curves and axis crossing without changing source', () => {
  const profile = rectangle(), open = cad.makeLine([3, 0, 0], [3, 4, 0]), crossed = rectangle([-1, 0], 2, 4), before = snapshot([profile, open, crossed]);
  try {
    for (const params of [{ ...axis, axisDirection: [0, 0, 0] }, { ...axis, axisDirection: [0, 0, 1] }, { ...axis, axisPoint: [0, 0, 1] }, { ...axis, angleDeg: 0 }, { ...axis, angleDeg: 361 }])
      assert.throws(() => buildProfileRevolve([profile], params, cad), error => error.code === 'PROFILE_REVOLVE_INVALID');
    assert.throws(() => buildProfileRevolve([open], axis, cad), /开口|退化/);
    assert.throws(() => buildProfileRevolve([crossed], axis, cad), error => error.code === 'PROFILE_REVOLVE_INVALID');
    assert.deepEqual(snapshot([profile, open, crossed]), before);
  } finally { [profile, open, crossed].forEach(dispose); }
});

test('exact saved circle plus saved open wire sweep to expected volume and STEP roundtrip', async () => {
  const section = circle(), edge = cad.makeLine([0, 0, 0], [0, 0, 10]), path = cad.assembleWire([edge]), before = snapshot([section, path]);
  let result, imported;
  try {
    result = buildProfileSweep([section, path], {}, cad); valid(result); near(cad.measureVolume(result), 10 * Math.PI);
    const step = await cad.exportSTEP([{ shape: result }]); imported = await cad.importSTEP(step); valid(imported);
    near(cad.measureVolume(imported), cad.measureVolume(result), 1e-4);
    assert.deepEqual(snapshot([section, path]), before);
  } finally { [imported, result, path, edge, section].forEach(dispose); }
});

test('saved circular arc path remains exact and produces measured curved sweep', () => {
  const q = Math.SQRT1_2, sectionEdge = cad.makeCircle(0.2, [10, 0, 0], [0, 1, 0]), section = cad.assembleWire([sectionEdge]);
  const path = cad.makeThreePointArc([10, 0, 0], [10 * q, 10 * q, 0], [0, 10, 0]); let result;
  try {
    result = buildProfileSweep([section, path], {}, cad); valid(result);
    near(cad.measureVolume(result), Math.PI * 0.2 ** 2 * 5 * Math.PI, 1e-4);
    const edges = result.edges; try { assert.ok(edges.some(edge => edge.geomType === 'CIRCLE')); } finally { edges.forEach(dispose); }
    assert.equal(path.geomType, 'CIRCLE');
  } finally { [result, path, section, sectionEdge].forEach(dispose); }
});

test('saved B-spline path sweeps without replacing it with polyline geometry', () => {
  const path = cad.makeBSplineApproximation([[0, 0, 0], [0, 0, 4], [2, 1, 8], [3, 2, 12]], { tolerance: 0.001 });
  const curve = path.curve; let origin, normal;
  try { origin = curve.startPoint; normal = curve.tangentAt(0); } finally { dispose(curve); }
  const sectionEdge = cad.makeCircle(0.15, origin.toTuple(), normal.toTuple()), section = cad.assembleWire([sectionEdge]); let result;
  try {
    result = buildProfileSweep([section, path], {}, cad); valid(result); assert.ok(cad.measureVolume(result) > 0.7);
    assert.equal(path.geomType, 'BSPLINE_CURVE');
  } finally { [result, section, sectionEdge, origin, normal, path].forEach(dispose); }
});

test('sweep material modes change only an explicit last target and retain profile/path', () => {
  const section = circle(), path = cad.makeLine([0, 0, 0], [0, 0, 10]), target = cad.makeBox([-2, -2, 0], [2, 2, 5]);
  const before = snapshot([section, path, target]);
  for (const [operation, volume] of [['join', 80 + 5 * Math.PI], ['cut', 80 - 5 * Math.PI], ['intersect', 5 * Math.PI]]) {
    let result;
    try { result = buildProfileSweep([section, path, target], { operation }, cad); valid(result); near(cad.measureVolume(result), volume); }
    finally { dispose(result); }
  }
  try { assert.deepEqual(snapshot([section, path, target]), before); }
  finally { [target, path, section].forEach(dispose); }
});

test('sweep rejects holed sections, closed/disconnected/branch paths and mispositioned profiles atomically', () => {
  const section = circle(), outer = circle(0, 2), inner = circle(0, 0.5).flipOrientation(), face = cad.makeFace(outer, [inner]);
  const path = cad.makeLine([0, 0, 0], [0, 0, 10]), offset = section.clone().translate(0, 0, 1), closed = circle(0, 10);
  const branch = cad.makeCompound([path.clone(), cad.makeLine([0, 0, 10], [0, 0, 15]), cad.makeLine([0, 0, 10], [1, 0, 10])]);
  const disconnected = cad.makeCompound([path.clone(), cad.makeLine([0, 0, 11], [0, 0, 15])]);
  const before = snapshot([section, path, face, offset, closed, branch, disconnected]);
  try {
    assert.throws(() => buildProfileSweep([face, path], {}, cad), /孔/);
    assert.throws(() => buildProfileSweep([offset, path], {}, cad), /起点平面/);
    for (const invalid of [closed, branch, disconnected]) assert.throws(() => buildProfileSweep([section, invalid], {}, cad), /路径|开放/);
    assert.deepEqual(snapshot([section, path, face, offset, closed, branch, disconnected]), before);
  } finally { [disconnected, branch, closed, offset, path, face, inner, outer, section].forEach(dispose); }
});

test('ordered two and three exact saved sections loft without numeric surrogate profiles', () => {
  const a = circle(0, 2), b = circle(5, 2), c = circle(10, 2), before = snapshot([a, b, c]); let two, three;
  try {
    two = buildProfileLoft([a, c], { ruled: true }, cad); three = buildProfileLoft([a, b, c], {}, cad);
    valid(two); valid(three); near(cad.measureVolume(two), 40 * Math.PI); near(cad.measureVolume(three), 40 * Math.PI);
    assert.deepEqual(snapshot([a, b, c]), before);
  } finally { [three, two, c, b, a].forEach(dispose); }
});

test('loft adds subtractive/additive/intersection semantics to existing referenceLoft', () => {
  const a = circle(0), b = circle(10), target = cad.makeBox([-2, -2, 0], [2, 2, 5]), before = snapshot([a, b, target]);
  try {
    for (const [operation, volume] of [['join', 80 + 5 * Math.PI], ['cut', 80 - 5 * Math.PI], ['intersect', 5 * Math.PI]]) {
      let result;
      try { result = buildProfileLoft([a, b, target], { operation, ruled: true }, cad); valid(result); near(cad.measureVolume(result), volume); }
      finally { dispose(result); }
    }
    assert.deepEqual(snapshot([a, b, target]), before);
  } finally { [target, b, a].forEach(dispose); }
});

test('rotation material modes use explicit target and original hole geometry', () => {
  const section = rectangle(), target = cad.makeCylinder(6, 8, [0, -2, 0], [0, 1, 0]), partial = cad.makeCylinder(6, 4, [0, -2, 0], [0, 1, 0]);
  const before = snapshot([section, target, partial]); let cut, join, intersection;
  try {
    cut = buildProfileRevolve([section, target], { ...axis, operation: 'cut' }, cad);
    join = buildProfileRevolve([section, partial], { ...axis, operation: 'join' }, cad);
    intersection = buildProfileRevolve([section, target], { ...axis, operation: 'intersect' }, cad);
    valid(cut); valid(join); valid(intersection);
    near(cad.measureVolume(cut), 224 * Math.PI); near(cad.measureVolume(join), 176 * Math.PI); near(cad.measureVolume(intersection), 64 * Math.PI);
    assert.deepEqual(snapshot([section, target, partial]), before);
  } finally { [intersection, join, cut, partial, target, section].forEach(dispose); }
});

test('missing target, nonintersection, zero material changes and multi-solid outputs fail atomically', () => {
  const section = circle(), path = cad.makeLine([0, 0, 0], [0, 0, 10]), distant = cad.makeBox([10, 10, 0], [15, 15, 5]), containing = cad.makeBox([-2, -2, -2], [2, 2, 12]);
  const splitTarget = cad.makeBox([-2, -0.5, 0], [2, 0.5, 5]), other = circle(10), outer = circle(0, 2), inner = circle(0, 1).flipOrientation(), face = cad.makeFace(outer, [inner]), before = snapshot([section, path, distant, containing, splitTarget, other, face]);
  try {
    assert.throws(() => buildProfileSweep([section, path], { operation: 'cut' }, cad), /目标/);
    assert.throws(() => buildProfileSweep([section, path, distant], { operation: 'cut' }, cad), /移除材料/);
    assert.throws(() => buildProfileSweep([section, path, distant], { operation: 'join' }, cad), /一个有效|相交/);
    assert.throws(() => buildProfileSweep([section, path, distant], { operation: 'intersect' }, cad), /无效|有效|empty|3d shape/);
    assert.throws(() => buildProfileSweep([section, path, containing], { operation: 'join' }, cad), /增加材料/);
    assert.throws(() => buildProfileSweep([section, path, splitTarget], { operation: 'cut' }, cad), /一个有效/);
    assert.throws(() => buildProfileLoft([face, other], {}, cad), /孔/);
    assert.throws(() => buildProfileLoft([section], {}, cad), /引用/);
    assert.deepEqual(snapshot([section, path, distant, containing, splitTarget, other, face]), before);
  } finally { [face, inner, outer, other, splitTarget, containing, distant, path, section].forEach(dispose); }
});
