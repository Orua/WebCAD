import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDimension } from '../src/parameter-calculator.js';
import { evaluateNamedParameters, evaluateDocumentParameters } from '../src/named-parameters.js';
import { QUICK_MODELS } from '../src/quick-models.js';

const mm = value => ({ value, unit: 'mm' });
const scalar = value => ({ value, unit: 'scalar' });
const rejects = (run, code) => assert.throws(run, error => error.code === code);
function plate() {
  return { version: 1, imports: {}, hidden: [], parameters: {
    cutDepth: mm('thickness + clearance * 2'), length: mm(50), width: mm(30), thickness: mm(3),
    holeRadius: mm(2), edgeMargin: mm(5), clearance: mm(1),
  }, features: [
    { id: 'plate', op: 'box', refs: [], params: { width: 50, depth: 30, height: 3 },
      expressions: { width: 'length', depth: 'width', height: 'thickness' } },
    { id: 'holes', op: 'multiHole', refs: ['plate'], params: {
      radius: 2, depth: 5, axis: 'Z', direction: -1,
      points: [[5, 5, 4], [45, 5, 4], [5, 25, 4], [45, 25, 4]],
    }, expressions: { radius: 'holeRadius', depth: 'cutDepth',
      'points.0.0': 'edgeMargin', 'points.0.1': 'edgeMargin', 'points.0.2': 'thickness + clearance',
      'points.1.0': 'length - edgeMargin', 'points.1.1': 'edgeMargin', 'points.1.2': 'thickness + clearance',
      'points.2.0': 'edgeMargin', 'points.2.1': 'width - edgeMargin', 'points.2.2': 'thickness + clearance',
      'points.3.0': 'length - edgeMargin', 'points.3.1': 'width - edgeMargin', 'points.3.2': 'thickness + clearance' } },
  ] };
}

test('four-hole plate resolves dependency order and all coordinates in one pure update', () => {
  const original = plate(), before = structuredClone(original);
  original.parameters.length.value = 63;
  const output = evaluateDocumentParameters(original, { previousDocument: before });
  assert.equal(output.features[0].params.width, 63);
  assert.deepEqual(output.features[1].params.points, [[5, 5, 4], [58, 5, 4], [5, 25, 4], [58, 25, 4]]);
  assert.equal(output.features[1].params.depth, 5);
  assert.equal(output.parameters.cutDepth.value, 'thickness + clearance * 2');
  assert.equal(original.features[0].params.width, 50);
  assert.deepEqual(original.features, before.features);
  const reopened = JSON.parse(JSON.stringify(output)); reopened.parameters.length.value = 58;
  const next = evaluateDocumentParameters(reopened);
  assert.equal(next.features[1].params.points[1][0], 53);
  assert.equal(next.features[1].params.points[3][0], 53);
  assert.equal(next.features[0].expressions.width, 'length');
});

test('rectangular buckle frame expressions keep section dimensions when inner width changes', () => {
  const doc = { version: 1, parameters: { inner: mm(28), rise: mm('inner / 2 + wire'), wire: mm(3) },
    features: [{ id: 'frame', op: 'quickModel', refs: [], params: { kind: 'rectBuckle', ...QUICK_MODELS.rectBuckle.defaults },
      expressions: { innerWidth: 'inner', innerHeight: 'rise', sectionSize: 'wire' } }] };
  const first = evaluateDocumentParameters(doc);
  assert.equal(first.features[0].params.innerWidth, 28); assert.equal(first.features[0].params.innerHeight, 17);
  first.parameters.inner.value = 36;
  const next = evaluateDocumentParameters(first);
  assert.equal(next.features[0].params.innerWidth, 36); assert.equal(next.features[0].params.innerHeight, 21);
  assert.equal(next.features[0].params.sectionSize, 3); assert.equal(next.features[0].params.innerRadius, 3);
});

test('unit algebra supports scalar scaling, same-unit addition and length ratios', () => {
  const values = evaluateNamedParameters({ scaled: mm('factor * length'), ratio: scalar('length / width'),
    length: mm(12), width: mm(4), factor: scalar(2), centered: mm('-length / 2'),
    clamp: mm('max(length, width)'), absolute: mm('abs(centered)') });
  assert.deepEqual(values.scaled, mm(24)); assert.deepEqual(values.ratio, scalar(3));
  assert.deepEqual(values.centered, mm(-6)); assert.deepEqual(values.absolute, mm(6));
  for (const expression of ['length + 2', 'length * width', '2 / length', 'sqrt(length)']) {
    rejects(() => evaluateNamedParameters({ length: mm(12), width: mm(4), bad: mm(expression) }), 'PARAM_UNIT_MISMATCH');
  }
  rejects(() => evaluateNamedParameters({ length: mm(12), bad: scalar('length') }), 'PARAM_UNIT_MISMATCH');
});

test('cycles, undefined names, division by zero and nonfinite results have explicit errors', () => {
  rejects(() => evaluateNamedParameters({ a: mm('b'), b: mm('a') }), 'PARAM_CYCLE');
  rejects(() => evaluateNamedParameters({ length: mm('missing') }), 'PARAM_UNDEFINED');
  rejects(() => evaluateNamedParameters({ bad: scalar('1 / 0') }), 'PARAM_RANGE_INVALID');
  rejects(() => evaluateNamedParameters({ bad: scalar('1e308 * 1e308') }), 'PARAM_EXPRESSION_INVALID');
  rejects(() => evaluateNamedParameters({ bad: mm(Infinity) }), 'PARAM_SCHEMA_INVALID');
  rejects(() => evaluateNamedParameters({ bad: scalar('globalThis.process') }), 'PARAM_UNDEFINED');
  rejects(() => evaluateNamedParameters({ bad: scalar('constructor(1)') }), 'PARAM_EXPRESSION_INVALID');
});

test('unknown, nonnumeric, topology, unsafe prototype and unit-incompatible paths reject', () => {
  for (const path of ['missing', 'points.4.0', 'points.01.0', 'points.0', 'axis', '__proto__.value', 'points.constructor']) {
    const doc = plate(); doc.features[1].expressions = { [path]: 'edgeMargin' };
    rejects(() => evaluateDocumentParameters(doc), 'PARAM_PATH_INVALID');
  }
  const doc = plate(); doc.features[1].expressions = { direction: 'length' };
  rejects(() => evaluateDocumentParameters(doc), 'PARAM_UNIT_MISMATCH');
  const topologyDoc = { parameters: { index: scalar(0) }, features: [{ id: 'round', op: 'fillet', refs: ['plate'],
    params: { radius: 1, edgeIds: [0] }, expressions: { 'edgeIds.0': 'index' } }] };
  rejects(() => evaluateDocumentParameters(topologyDoc), 'PARAM_PATH_INVALID');
});

test('range, integer and resource limits reject without mutating input', () => {
  rejects(() => evaluateDocumentParameters({ features: [], parameters: null }), 'PARAM_SCHEMA_INVALID');
  const doc = plate(); doc.parameters.length.value = -5; const before = structuredClone(doc);
  rejects(() => evaluateDocumentParameters(doc), 'PARAM_RANGE_INVALID'); assert.deepEqual(doc, before);
  const pattern = { parameters: { copies: scalar(2.5) }, features: [{ id: 'pattern', op: 'linearPattern', refs: ['plate'],
    params: { count: 3, dx: 10 }, expressions: { count: 'copies' } }] };
  rejects(() => evaluateDocumentParameters(pattern), 'PARAM_SCHEMA_INVALID');
  rejects(() => evaluateNamedParameters({ long: scalar('1'.repeat(257)) }), 'PARAM_EXPRESSION_INVALID');
  rejects(() => evaluateNamedParameters(Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`p${i}`, scalar(i)]))), 'RESOURCE_LIMIT');
  const chain = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`p${i}`, scalar(i === 64 ? 1 : `p${i + 1}`)]));
  rejects(() => evaluateNamedParameters(chain), 'RESOURCE_LIMIT');
});

test('affected upstream edits conservatively reject downstream index references', () => {
  for (const selector of [{ faceId: 0 }, { faceIds: [0] }, { edgeIds: [0] }]) {
    const doc = plate(); doc.features.push({ id: 'topology', op: 'legacy', params: selector, refs: ['holes'] });
    assert.deepEqual(evaluateDocumentParameters(doc), doc);
    doc.parameters.length.value = 63; const before = structuredClone(doc);
    rejects(() => evaluateDocumentParameters(doc), 'UNSAFE_LEGACY_REFERENCE'); assert.deepEqual(doc, before);
  }
  const old = plate(); old.features.push({ id: 'round', op: 'fillet', params: { radius: 1, edgeIds: [0] }, refs: ['holes'] });
  const next = structuredClone(old); delete next.features[0].expressions; next.features[0].params.width = 63;
  rejects(() => evaluateDocumentParameters(next, { previousDocument: old }), 'UNSAFE_LEGACY_REFERENCE');
});

test('legacy numeric documents and existing calculator behavior remain unchanged', () => {
  const doc = { version: 1, features: [{ id: 'old', op: 'box', refs: [], params: { width: 1, depth: 2, height: 3 } }], imports: {}, hidden: [] };
  const out = evaluateDocumentParameters(doc); assert.deepEqual(out, doc); assert.notEqual(out, doc);
  assert.equal(evaluateDimension('2^3^2'), 512);
  assert.equal(evaluateDimension('max(2,min(3,4))'), 3);
  assert.equal(evaluateDimension('-2^2'), -4);
});
