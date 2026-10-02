import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveRoundingInfluenceBounds, derivePolishingInfluenceBounds, measureSelectedPolishingEdgeEffects} from '../src/modeling/rounding/geometry-quality.js';

const row = (bounds, normalAngleDeg = 90) => ({bounds, normalAngleDeg});

test('rounding locality box is determined from source geometry and requested size', () => {
  const rows = [row([[0, 0, 0], [10, 0, 0]])];
  const influence = deriveRoundingInfluenceBounds(rows, [0], .2);
  assert.deepEqual(influence.bounds, [[-.4, -.4, -.4], [10.4, .4, .4]]);
  assert.equal(influence.edgeRegions[0].marginMm, .4);
  assert.equal(influence.edgeRegions[0].sourceEdgeId, 0);
});

test('an acute material corner expands locality by its actual dihedral tangent distance', () => {
  const influence = deriveRoundingInfluenceBounds([row([[0, 0, 0], [10, 0, 0]], 135)], [0], .2);
  assert(Math.abs(influence.edgeRegions[0].marginMm - .2 * Math.tan(135 * Math.PI / 360)) < 1e-12);
  assert(influence.edgeRegions[0].marginMm > .4);
});

test('separate selected source edges retain their predetermined individual influence boxes', () => {
  const influence = deriveRoundingInfluenceBounds([
    row([[0, 0, 0], [10, 0, 0]]), row([[10, 0, 0], [10, 5, 0]])
  ], [0, 1], .2);
  assert.deepEqual(influence.bounds, [[-.4, -.4, -.4], [10.4, 5.4, .4]]);
  assert.equal(influence.edgeRegions.length, 2);
});

test('locality cannot be derived from stale edges, duplicate scope, unknown normals or invalid size', () => {
  const rows = [row([[0, 0, 0], [10, 0, 0]])];
  for (const [sourceRows, ids, size] of [[rows, [1], .2], [rows, [0, 0], .2], [rows, [0], 0],
    [[row([[0, 0, 0], [10, 0, 0]], null)], [0], .2], [[row([[0, 0, 0], [10, 0, 0]], 180)], [0], .2]]) {
    assert.throws(() => deriveRoundingInfluenceBounds(sourceRows, ids, size), error =>
      error.code === 'GEOMETRY_INVALID' && error.report.failedCheck === 'scope');
  }
});

test('automatic polishing derives its finite source dependency region without a requested R or dihedral constraint', () => {
  const influence = derivePolishingInfluenceBounds([
    row([[0, 0, 0], [10, 0, 0]], null), row([[10, 0, 0], [10, 5, 0]], 180)
  ], [0, 1], .3);
  assert.deepEqual(influence.bounds, [[-.3, -.3, -.3], [10.3, 5.3, .3]]);
  assert.deepEqual(influence.sourceEdgeIds, [0, 1]);
  assert.equal(influence.marginMm, .3);
  assert.equal(influence.edgeRegions.length, 2);
  assert.match(influence.limitations[0], /enclosing.*not the union/);
});

test('automatic polishing predeclared source region rejects invalid margins, stale/duplicate edges and malformed bounds', () => {
  const rows = [row([[0, 0, 0], [10, 0, 0]])];
  for (const [sourceRows, ids, margin] of [[rows, [0], 0], [rows, [0], Infinity], [rows, [0, 0], .3], [rows, [1], .3],
    [[row([[1, 0, 0], [0, 0, 0]])], [0], .3], [[row([[0, 0, 0], [1e308, 0, 0]])], [0], 1e308]]) {
    assert.throws(() => derivePolishingInfluenceBounds(sourceRows, ids, margin), error =>
      error.code === 'GEOMETRY_INVALID' && error.report.failedCheck === 'scope');
  }
});

test('automatic selected-edge measurement samples all final faces, nine stations and actual source endpoints without kernel initialization', () => {
  const calls = [], deletes = [];
  const source = {edges: [0, 1].map(id => ({pointAt(t) {return {toTuple: () => [t, id, 0], delete() {deletes.push('point');}};}, delete() {deletes.push('edge');}}))};
  const result = {faces: [0, 1, 2].map(id => ({clone() {return {id, delete() {deletes.push('clone');}};}, delete() {deletes.push('face');}}))};
  const cad = {getOC() {throw new Error('Kernel initialization is forbidden in this pure mock test');},
    makeCompound(faces) {assert.equal(faces.length, 3); return {count: faces.length, delete() {deletes.push('compound');}};},
    makeVertex(point) {return {point, delete() {deletes.push('vertex');}};},
    measureDistanceBetween(boundary, vertex) {assert.equal(boundary.count, 3); calls.push(vertex.point); return vertex.point[0] === 0 || vertex.point[0] === 1 ? 0 : .01;}};
  const effects = measureSelectedPolishingEdgeEffects(source, result, [0, 1], cad);
  assert.equal(effects.length, 2); assert.equal(calls.length, 22);
  for (const effect of effects) {
    assert.deepEqual(effect.samples.map(sample => sample.t), [.0005, .01, .1, .25, .5, .75, .9, .99, .9995]);
    assert.deepEqual(effect.sourceEndpointSamples.map(sample => sample.distanceMm), [0, 0]);
  }
  for (const [kind, expected] of [['point', 22], ['vertex', 22], ['clone', 3], ['face', 3], ['edge', 2], ['compound', 1]]) {
    assert.equal(deletes.filter(value => value === kind).length, expected);
  }
});
