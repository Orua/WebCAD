import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { buildReferenceExtrude } from '../src/reference-profile-extrude.js';
import { buildReferenceLoft } from '../src/reference-profile-loft.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
cad.setOC(oc);
const dispose = item => { try { item?.delete?.(); } catch {} };
const solids = shape => { const parts = shape.solids; try { return parts.length; } finally { parts.forEach(dispose); } };
const area = (shape) => cad.measureArea(shape);
const volume = shape => cad.measureVolume(shape);
const near = (actual, expected, tol = 1e-5) => assert.ok(Math.abs(actual - expected) < tol, `${actual} != ${expected}`);
const edgeCount = shape => { const edges = shape.edges; try { return edges.length; } finally { edges.forEach(dispose); } };
const rectangle = (z, width = 10, height = 8) => {
  const drawing = cad.drawRectangle(width, height), sketch = drawing.sketchOnPlane('XY', [0, 0, z]);
  try { return sketch.wire.clone(); } finally { dispose(sketch); dispose(drawing); }
};
const circle = (z, radius) => {
  const drawing = cad.drawCircle(radius), sketch = drawing.sketchOnPlane('XY', [0, 0, z]);
  try { return sketch.wire.clone(); } finally { dispose(sketch); dispose(drawing); }
};

test('unordered exact rectangle edges extrude and source remains available', () => {
  const source = rectangle(0), edges = source.edges;
  const compound = cad.makeCompound([edges[2].clone(), edges[0].clone(), edges[3].clone(), edges[1].clone()]);
  let result;
  try {
    result = buildReferenceExtrude(compound, { direction: [0, 0, 2], distance: 3 }, cad);
    assert.equal(solids(result), 1); near(volume(result), 240);
    assert.equal(edgeCount(compound), 4); assert.equal(edgeCount(source), 4);
  } finally { dispose(result); dispose(compound); edges.forEach(dispose); dispose(source); }
});

test('planar face with native hole extrudes to exact volume and STEP roundtrip', async () => {
  const outer = rectangle(0, 10, 10), inner = circle(0, 2);
  const face = cad.makeFace(outer, [inner]); let result, imported;
  try {
    result = buildReferenceExtrude(face, { direction: [0, 0, 1], distance: 5 }, cad);
    assert.equal(solids(result), 1); near(volume(result), (100 - 4 * Math.PI) * 5, 1e-4);
    const blob = await cad.exportSTEP([{ shape: result }]);
    imported = await cad.importSTEP(blob);
    assert.equal(solids(imported), 1); near(volume(imported), volume(result), 1e-4);
    near(area(face), 100 - 4 * Math.PI, 1e-4);
  } finally { [imported, result, face, outer, inner].forEach(dispose); }
});

test('single Face Compound wrapper is accepted, mixed or multi-Face compound rejected', () => {
  const wire = rectangle(0), face = cad.makeFace(wire);
  const wrapped = cad.makeCompound([face.clone()]);
  const mixed = cad.makeCompound([face.clone(), cad.makeLine([20, 0, 0], [21, 0, 0])]);
  const multiple = cad.makeCompound([face.clone(), face.clone().translate(20, 0, 0)]);
  let result;
  try {
    result = buildReferenceExtrude(wrapped, { direction: [0, 0, 1], distance: 2 }, cad);
    near(volume(result), 160);
    assert.throws(() => buildReferenceExtrude(mixed, { direction: [0, 0, 1], distance: 2 }, cad), /游离边/);
    assert.throws(() => buildReferenceExtrude(multiple, { direction: [0, 0, 1], distance: 2 }, cad), /多张/);
  } finally { [result, multiple, mixed, wrapped, face, wire].forEach(dispose); }
});

test('circle edge remains analytic after extrusion', () => {
  const source = circle(0, 3); let result;
  try {
    result = buildReferenceExtrude(source, { direction: [0, 0, 1], distance: 2 }, cad);
    near(volume(result), 18 * Math.PI);
    const edges = result.edges;
    try { assert.ok(edges.some(edge => edge.geomType === 'CIRCLE')); }
    finally { edges.forEach(dispose); }
  } finally { dispose(result); dispose(source); }
});

test('two and three circular sections loft to valid solids', () => {
  for (const radii of [[2, 4], [2, 4, 3]]) {
    const shapes = radii.map((r, i) => circle(i * 5, r)); let result;
    try { result = buildReferenceLoft(shapes, {}, cad); assert.equal(solids(result), 1); assert.ok(volume(result) > 0); }
    finally { dispose(result); shapes.forEach(dispose); }
  }
});

test('rounded exact curves loft without polygon conversion', () => {
  const rounded = (z, width, height, radius) => {
    const drawing = cad.drawRoundedRectangle(width, height, radius), sketch = drawing.sketchOnPlane('XY', [0, 0, z]);
    try { return sketch.wire.clone(); } finally { [sketch, drawing].forEach(dispose); }
  };
  const shapes = [rounded(0, 12, 8, 1), rounded(5, 9, 7, 1.5), rounded(10, 7, 5, 1)];
  let result;
  try {
    result = buildReferenceLoft(shapes, { ruled: true }, cad);
    assert.equal(solids(result), 1); assert.ok(volume(result) > 0);
    for (const shape of shapes) { const edges = shape.edges; try { assert.ok(edges.some(edge => edge.geomType === 'CIRCLE')); } finally { edges.forEach(dispose); } }
  } finally { dispose(result); shapes.forEach(dispose); }
});

test('strictly rejects open, branching, nonplanar, solid-edge, and holed loft inputs', () => {
  const a = cad.makeLine([0, 0, 0], [5, 0, 0]);
  const b = cad.makeLine([5, 0, 0], [5, 5, 0]);
  const c = cad.makeLine([5, 0, 0], [5, -5, 0]);
  const open = cad.makeCompound([a.clone(), b.clone()]);
  const branch = cad.makeCompound([a.clone(), b.clone(), c.clone()]);
  const nonplanar = cad.makeCompound([
    cad.makeLine([0, 0, 0], [5, 0, 0]), cad.makeLine([5, 0, 0], [5, 5, 1]),
    cad.makeLine([5, 5, 1], [0, 5, 0]), cad.makeLine([0, 5, 0], [0, 0, 0])
  ]);
  const solid = cad.makeBox([0, 0, 0], [5, 5, 5]);
  const outer = rectangle(0), inner = circle(0, 1), face = cad.makeFace(outer, [inner]);
  const other = circle(5, 2);
  const outerLoop = rectangle(0), innerLoop = circle(0, 1);
  const disjointEdges = [...outerLoop.edges, ...innerLoop.edges];
  const disjoint = cad.makeCompound(disjointEdges.map(edge => edge.clone()));
  disjointEdges.forEach(dispose); [outerLoop, innerLoop].forEach(dispose);
  const crossed = cad.makeCompound([
    cad.makeLine([0, 0, 0], [4, 4, 0]), cad.makeLine([4, 4, 0], [0, 4, 0]),
    cad.makeLine([0, 4, 0], [4, 0, 0]), cad.makeLine([4, 0, 0], [0, 0, 0])
  ]);
  try {
    assert.throws(() => buildReferenceExtrude(open, { direction: [0, 0, 1], distance: 2 }, cad), /开口/);
    assert.throws(() => buildReferenceExtrude(branch, { direction: [0, 0, 1], distance: 2 }, cad), /分叉/);
    assert.throws(() => buildReferenceExtrude(nonplanar, { direction: [0, 0, 1], distance: 2 }, cad), /共面|planar|无效/);
    assert.throws(() => buildReferenceExtrude(solid, { direction: [0, 0, 1], distance: 2 }, cad), /仅接受|实体/);
    assert.throws(() => buildReferenceExtrude(face, { direction: [1, 0, 0], distance: 2 }, cad), /平行/);
    assert.throws(() => buildReferenceLoft([face, other], {}, cad), /孔/);
    assert.throws(() => buildReferenceExtrude(disjoint, { direction: [0, 0, 1], distance: 2 }, cad), /多个环/);
    assert.throws(() => buildReferenceExtrude(crossed, { direction: [0, 0, 1], distance: 2 }, cad), /无效|自交|面积/);
  } finally { [crossed, disjoint, other, face, inner, outer, solid, nonplanar, branch, open, a, b, c].forEach(dispose); }
});

if (process.env.WEBCAD_REFERENCE_BREP) test('local native BREP planar BSpline face extraction', () => {
  const source = cad.deserializeShape(fs.readFileSync(process.env.WEBCAD_REFERENCE_BREP, 'utf8'));
  const faces = source.faces; let result, wrapped, fromWrapped, mixed, outer, fromOuter;
  try {
    assert.ok(faces.length > 0);
    result = buildReferenceExtrude(faces[0], { direction: [0, 0, 1], distance: 1 }, cad);
    assert.equal(solids(result), 1); assert.ok(volume(result) > 0);
    outer = faces[0].clone().outerWire();
    fromOuter = buildReferenceExtrude(outer, { direction: [0, 0, 1], distance: 1 }, cad);
    assert.equal(solids(fromOuter), 1); assert.ok(volume(fromOuter) >= volume(result));
    wrapped = cad.makeCompound([faces[0].clone()]);
    fromWrapped = buildReferenceExtrude(wrapped, { direction: [0, 0, 1], distance: 1 }, cad);
    near(volume(fromWrapped), volume(result), 1e-4);
    mixed = cad.makeCompound([faces[0].clone(), cad.makeLine([1e5, 0, 0], [1e5 + 1, 0, 0])]);
    assert.throws(() => buildReferenceExtrude(mixed, { direction: [0, 0, 1], distance: 1 }, cad), /游离边/);
  } finally { [fromOuter, outer, mixed, fromWrapped, wrapped, result].forEach(dispose); faces.forEach(dispose); dispose(source); }
});
