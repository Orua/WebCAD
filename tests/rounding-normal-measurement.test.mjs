import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrientedSurfaceNormal} from '../src/modeling/rounding/normal-measurement.js';

const scale = (value, factor) => value.map(coordinate => coordinate * factor);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sameDirection = (a, b) => assert.ok(Math.hypot(...a.map((coordinate, i) => coordinate - b[i])) < 1e-14);

test('normal direction and dimensionless regularity survive uniform 1e-6 UV derivative scaling', () => {
  const du = [1, 0, 0], dv = [.4, .9, 0], normal = cross(du, dv);
  const original = normalizeOrientedSurfaceNormal({normal, du, dv});
  const tiny = normalizeOrientedSurfaceNormal({normal: scale(normal, 1e-12), du: scale(du, 1e-6), dv: scale(dv, 1e-6)});
  assert.ok(tiny.rawNormalMagnitude < 1e-12);
  assert.ok(tiny.relativeJacobian > .9);
  sameDirection(original.normal, tiny.normal);
  assert.ok(Math.abs(original.relativeJacobian - tiny.relativeJacobian) < 1e-14);
  assert.equal(tiny.alignmentAbsDot, 1);
});

test('oriented BRep normal sign is preserved instead of replaced by unsigned D1 cross', () => {
  const du = [1e-6, 0, 0], dv = [0, 9e-7, 0], normal = [0, 0, -9e-13];
  const measured = normalizeOrientedSurfaceNormal({normal, du, dv});
  sameDirection(measured.normal, [0, 0, -1]);
  assert.equal(measured.relativeJacobian, 1);
  assert.equal(measured.alignmentAbsDot, 1);
});

test('independent UV reparameterization keeps actual tangent direction regular', () => {
  const du = [1, 2, 0], dv = [0, 1, 2], normal = cross(du, dv);
  const original = normalizeOrientedSurfaceNormal({normal, du, dv});
  const reparameterized = normalizeOrientedSurfaceNormal({normal: scale(normal, 1e-16), du: scale(du, 1e-12), dv: scale(dv, 1e-4)});
  sameDirection(original.normal, reparameterized.normal);
  assert.ok(Math.abs(original.relativeJacobian - reparameterized.relativeJacobian) < 1e-14);
});

test('actual zero/parallel D1, zero raw normal and nonfinite values remain rejected', () => {
  for (const evidence of [
    {normal: [0, 0, 1], du: [0, 0, 0], dv: [0, 1, 0]},
    {normal: [0, 0, 1e-20], du: [1e-10, 0, 0], dv: [2e-10, 0, 0]},
    {normal: [0, 0, 0], du: [1, 0, 0], dv: [0, 1, 0]},
    {normal: [0, 0, NaN], du: [1, 0, 0], dv: [0, 1, 0]},
    {normal: [0, 0, 1], du: [Infinity, 0, 0], dv: [0, 1, 0]}
  ]) {
    assert.throws(() => normalizeOrientedSurfaceNormal(evidence), error =>
      error.code === 'GEOMETRY_INVALID' && error.report.failedCheck === 'surface-normal-regularity');
  }
});

test('finite oriented normal must align with actual regular D1 cross', () => {
  assert.throws(() => normalizeOrientedSurfaceNormal({normal: [1e-20, 0, 0], du: [1e-6, 0, 0], dv: [0, 1e-6, 0]}), /inconsistent/);
  assert.throws(() => normalizeOrientedSurfaceNormal({normal: [0, 0, 1], du: [1, 0, 0], dv: [0, 1, 0]}, {minimumRelativeJacobian: NaN}), /policy/);
});
