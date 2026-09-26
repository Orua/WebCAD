import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { operationCatalog } from '../src/operation-catalog.js';
import { QUICK_MODELS } from '../src/quick-models.js';
import { apiVersion, catalogHash, migratedOperationIds, listOperations, getOperation,
  normalizeOperationParams, normalizeOperationPatch, validateOperationRefs,
  assertOperationContract, validateOperationExample } from '../src/operation-registry.js';
import { canonicalJson, contractHash, validateSchema } from '../src/contracts/operation-schema.js';
import { bootstrap, searchTools, getTool, readDocs, docsHash } from '../src/ai-docs.js';

const fails = (fn, code, path) => assert.throws(fn, error => error.code === code && (!path || error.path === path));

test('deterministic SHA-256 matches Node on ASCII, Unicode and multi-block canonical input', () => {
  for (const value of [{ b: 2, a: 1 }, '孔位坐标', { text: 'long'.repeat(1000) }]) {
    assert.equal(contractHash(value), `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`);
  }
  assert.equal(contractHash({ b: 2, a: 1 }), contractHash({ a: 1, b: 2 }));
});

test('registry covers every existing operation and publishes required tool-card fields', () => {
  const cards = listOperations();
  assert.deepEqual(cards.map(c => c.id), Object.keys(operationCatalog.operations).sort());
  const fields = 'id title category synonyms version schemaHash apiCompatibility implementationStatus availability unavailableReason inputSchema outputSchema refsSchema units coordinateConvention defaults preconditions postconditions resultShapeTypes consumesInputs preservesInputs createsResults sideEffects permissions undoBehavior idempotency limits knownUnsupportedCases minimalExample normalExample invalidExamples errorCodes recoveryActions relatedTools recipes testIds'.split(' ');
  for (const card of cards) {
    for (const field of fields) assert.ok(Object.hasOwn(card, field), `${card.id}.${field}`);
    validateOperationExample(card.id, card.minimalExample.params);
    validateOperationExample(card.id, card.normalExample.params);
    validateSchema(card.refsSchema, card.minimalExample.refs);
  }
  assert.deepEqual(cards.filter(c => c.v2Executable).map(c => c.id).sort(), [...migratedOperationIds].sort());
  const card = getOperation('box'); card.inputSchema.properties.width.type = 'string';
  assert.equal(getOperation('box').inputSchema.properties.width.type, 'number');
  validateSchema(getOperation('box').outputSchema, { status: 'committed', revisionAfter: 1 });
  fails(() => validateSchema(getOperation('box').outputSchema, { status: 'succeeded' }), 'PARAM_SCHEMA_INVALID');
  assert.ok(!getOperation('curvedLogo').coordinateConvention.includes('Face tools require a planar face.'));
});

test('old radius/world XYZ semantics and legal defaults are retained without coercion', () => {
  assert.deepEqual(normalizeOperationParams('hole', { radius: 2, depth: 5 }), { radius: 2, depth: 5, x: 0, y: 0, z: 0, axis: 'Z', direction: 1 });
  assert.deepEqual(normalizeOperationParams('multiHole', { radius: 2, depth: 5, points: [[5, 5, 4]] }),
    { radius: 2, depth: 5, points: [[5, 5, 4]], axis: 'Z', direction: 1 });
  assert.deepEqual(normalizeOperationParams('faceHole', { radius: 2, depth: 5, point: [5, 5, 3], faceId: 0 }),
    { radius: 2, depth: 5, point: [5, 5, 3], faceId: 0, through: false });
  assert.deepEqual(normalizeOperationParams('extractFaces', { faceIds: [0, 2] }), { faceIds: [0, 2] });
  assert.deepEqual(normalizeOperationParams('extractShell', { shellIndex: 1 }), { shellIndex: 1 });
  fails(() => normalizeOperationParams('extractShell', { shellIndex: -1 }), 'PARAM_RANGE_INVALID');
  fails(() => normalizeOperationParams('extractShell', { shellIndex: 0.5 }), 'PARAM_SCHEMA_INVALID');
  assert.equal(getOperation('extractShell').preservesInputs, true);
  fails(() => normalizeOperationParams('extractFaces', { faceIds: [] }), 'PARAM_RANGE_INVALID');
  fails(() => normalizeOperationParams('extractFaces', { faceIds: [0, 0] }), 'PARAM_SCHEMA_INVALID');
  assert.equal(normalizeOperationParams('shell', { thickness: -1, faceIds: [0] }).thickness, -1);
  assert.deepEqual(normalizeOperationParams('box', { width: 50, depth: 30, height: 3 }), { width: 50, depth: 30, height: 3 });
});

test('quick-model help includes every template parameter and default without enabling v2 execution', () => {
  const card = getOperation('quickModel');
  assert.equal(card.strictContract, false);
  assert.equal(card.v2Executable, false);
  assert.deepEqual(card.templates.map(t => t.kind).sort(), Object.keys(QUICK_MODELS).sort());
  for (const template of card.templates) {
    validateSchema(card.inputSchema, template.minimalExample);
    validateSchema(card.inputSchema, template.normalExample);
    assert.deepEqual(card.defaults[template.kind], QUICK_MODELS[template.kind].defaults);
  }
  fails(() => validateSchema(card.inputSchema, { kind: 'tube', misspelling: 3 }), 'PARAM_SCHEMA_INVALID');
});

test('A04/A05/A06 invalid fields, units, points, nonfinite numbers and enums reject with paths', () => {
  fails(() => normalizeOperationParams('hole', { radius: 2, depth: 5, diameter: 4 }), 'PARAM_SCHEMA_INVALID', 'params.diameter');
  fails(() => normalizeOperationParams('hole', { radius: '2mm', depth: 5 }), 'PARAM_SCHEMA_INVALID', 'params.radius');
  fails(() => normalizeOperationParams('hole', { radius: -2, depth: 5 }), 'PARAM_RANGE_INVALID', 'params.radius');
  fails(() => normalizeOperationParams('hole', { radius: 2, depth: 5, direction: 0 }), 'PARAM_SCHEMA_INVALID', 'params.direction');
  fails(() => normalizeOperationParams('hole', { radius: 2, depth: 5, axis: 'z' }), 'PARAM_SCHEMA_INVALID', 'params.axis');
  fails(() => normalizeOperationParams('multiHole', { radius: 2, depth: 5, points: [[5, 5]] }), 'PARAM_RANGE_INVALID', 'params.points.0');
  for (const radius of [NaN, Infinity, -Infinity, undefined, null, '2']) {
    fails(() => normalizeOperationParams('hole', { radius, depth: 5 }), 'PARAM_SCHEMA_INVALID', 'params.radius');
  }
  fails(() => normalizeOperationParams('multiHole', { radius: 2, depth: 5, points: [[5, Infinity, 4]] }), 'PARAM_SCHEMA_INVALID', 'params.points.0.1');
  fails(() => normalizeOperationParams('unknown', {}), 'UNKNOWN_OPERATION');
  fails(() => normalizeOperationParams('shell', { thickness: 0, faceIds: [0] }), 'PARAM_SCHEMA_INVALID');
  fails(() => normalizeOperationParams('faceHole', { radius: 2, faceId: 0, point: [5, 5, 3] }), 'PARAM_SCHEMA_INVALID');
  fails(() => normalizeOperationParams('multiHole', { radius: 2, depth: 5, through: true, points: [[5, 5, 4]] }), 'PARAM_SCHEMA_INVALID', 'params.through');
});

test('A03 explicit edge modes never silently override conflicting input', () => {
  for (const op of ['fillet', 'chamfer']) {
    const amount = op === 'fillet' ? { radius: 1 } : { distance: 1 };
    fails(() => normalizeOperationParams(op, { ...amount, allEdges: true, edgeIds: [1] }), 'SELECTION_CONFLICT');
    fails(() => normalizeOperationParams(op, { ...amount, edgeIds: [] }), 'PARAM_RANGE_INVALID');
    fails(() => normalizeOperationParams(op, { ...amount, edgeIds: [1, 1] }), 'PARAM_SCHEMA_INVALID');
    fails(() => normalizeOperationParams(op, { ...amount, allEdges: false }), 'PARAM_SCHEMA_INVALID');
    assert.deepEqual(normalizeOperationParams(op, { ...amount, allEdges: false, edgeIds: [1] }), { ...amount, allEdges: false, edgeIds: [1] });
    assert.deepEqual(normalizeOperationPatch(op, { ...amount, allEdges: true }, { edgeIds: [2] }), { ...amount, edgeIds: [2] });
    assert.deepEqual(normalizeOperationPatch(op, { ...amount, edgeIds: [1] }, { allEdges: true }), { ...amount, allEdges: true });
    fails(() => normalizeOperationPatch(op, { ...amount, edgeIds: [1] }, { allEdges: true, edgeIds: [2] }), 'SELECTION_CONFLICT');
  }
});

test('token selection uses separate input and resolved validation phases', () => {
  const pointParams = { point: [5, 5, 3], radius: 2, through: true };
  assert.deepEqual(normalizeOperationParams('faceHole', pointParams, { phase: 'input', selectionToken: 'current-token' }), pointParams);
  fails(() => normalizeOperationParams('faceHole', pointParams), 'PARAM_SCHEMA_INVALID', 'params.faceId');
  assert.equal(normalizeOperationParams('faceHole', { ...pointParams, faceId: 2 }).faceId, 2);
  for (const key of ['faceId', 'faceIds', 'edgeIds', 'allEdges']) {
    fails(() => normalizeOperationParams('faceHole', { ...pointParams, [key]: 0 }, { phase: 'input', selectionToken: 'current-token' }), 'SELECTION_CONFLICT');
  }
  assert.deepEqual(normalizeOperationParams('fillet', { radius: 1 }, { phase: 'input', selectionToken: 'token' }), { radius: 1 });
  fails(() => normalizeOperationParams('box', { width: 1, depth: 1, height: 1 }, { phase: 'input', selectionToken: 'token' }), 'PARAM_SCHEMA_INVALID');
});

test('refs and version gates fail closed; advisory operations are excluded from v2', () => {
  assert.deepEqual(validateOperationRefs('box', []), []);
  fails(() => validateOperationRefs('hole', []), 'PARAM_RANGE_INVALID');
  fails(() => validateOperationRefs('box', ['body']), 'PARAM_RANGE_INVALID');
  fails(() => validateOperationRefs('union', ['same', 'same']), 'PARAM_SCHEMA_INVALID');
  const card = getOperation('box');
  assert.equal(assertOperationContract('box', { opVersion: card.version, schemaHash: card.schemaHash }).id, 'box');
  fails(() => assertOperationContract('box', { opVersion: '100', schemaHash: card.schemaHash }), 'OPERATION_VERSION_UNSUPPORTED');
  fails(() => assertOperationContract('box', { opVersion: card.version, schemaHash: 'changed' }), 'SCHEMA_MISMATCH');
  fails(() => assertOperationContract('slot', {}), 'CAPABILITY_UNAVAILABLE');
  assert.equal(operationCatalog.operations.slot.paramsSchema.properties.angle.description.includes('mm'), false);
});

test('static discovery reports unknown runtime without session, deterministic pagination and bounded input', () => {
  const info = bootstrap();
  assert.equal(info.apiVersion, apiVersion); assert.equal(info.catalogHash, searchTools({query: ""}).catalogHash); assert.notEqual(info.catalogHash, catalogHash); assert.equal(info.docsHash, docsHash);
  assert.equal(info.capabilities.modeling, 'not_ready'); assert.equal(info.serverInstanceId, null);
  const first = searchTools({ query: '', limit: 2 });
  assert.equal(first.items.length, 2); assert.ok(first.nextCursor);
  const second = searchTools({ query: '', limit: 2, cursor: first.nextCursor });
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.ok(first.items.every(x => x.runtimeAvailability === 'unknown'));
  assert.equal(searchTools({ query: '多孔' }).items[0].id, 'multiHole');
  assert.equal(searchTools({ query: 'box', sessionId: 's' }, { browserReady: true }).items[0].runtimeAvailability, 'available');
  assert.equal(searchTools({ query: 'box' }, { browserReady: true }).items[0].runtimeAvailability, 'unknown');
  fails(() => searchTools({ query: '', unknown: true }), 'PARAM_SCHEMA_INVALID');
  fails(() => searchTools({ query: '', limit: Infinity }), 'PARAM_SCHEMA_INVALID');
  fails(() => searchTools({ query: 'different', cursor: first.nextCursor }), 'PARAM_SCHEMA_INVALID');
  fails(() => getTool({ id: 'box', version: 'missing' }), 'OPERATION_VERSION_UNSUPPORTED');
});

test('documents are whitelist only, paginated and cache-identifiable', () => {
  const first = readDocs({ docId: 'api.execute-v2', limitChars: 1000 });
  assert.equal(first.text.length, 1000); assert.ok(first.nextCursor);
  const second = readDocs({ docId: 'api.execute-v2', limitChars: 1000, cursor: first.nextCursor });
  assert.equal(first.docsHash, second.docsHash); assert.notEqual(first.text, second.text);
  assert.equal(readDocs({ docId: 'webcad://docs/start' }).docId, 'start');
  assert.ok(readDocs({ docId: 'webcad://operations/multiHole/1.0.0' }).text.includes('multiHole'));
  fails(() => readDocs({ docId: '../package.json' }), 'PARAM_SCHEMA_INVALID');
  fails(() => readDocs({ docId: 'start', cursor: first.nextCursor }), 'PARAM_SCHEMA_INVALID');
  fails(() => readDocs({ docId: 'start', version: '0' }), 'OPERATION_VERSION_UNSUPPORTED');
});

test('unsupported schema assertion and non-JSON values cannot be silently accepted', () => {
  assert.throws(() => validateSchema({ type: 'number', multipleOf: 2 }, 4), /Unsupported schema keyword: multipleOf/);
  fails(() => normalizeOperationParams('box', new Date()), 'PARAM_SCHEMA_INVALID');
  const cyclic = {}; cyclic.self = cyclic;
  fails(() => normalizeOperationParams('box', cyclic), 'PARAM_SCHEMA_INVALID');
});

test('supported string patterns validate stable IDs with useful error paths and Unicode semantics', () => {
  const schema = { type: 'object', additionalProperties: false, required: ['entityId'], properties: {
    entityId: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]*$' },
  } };
  const input = { entityId: 'rectangle-1_0' };
  assert.deepEqual(validateSchema(schema, input), input);
  for (const entityId of ['1rectangle', 'rectangle 1', 'rectangle#1', '']) {
    fails(() => validateSchema(schema, { entityId }), 'PARAM_SCHEMA_INVALID', 'params.entityId');
  }
  fails(() => validateSchema(schema, { entityId: 1 }), 'PARAM_SCHEMA_INVALID', 'params.entityId');
  assert.equal(validateSchema({ type: 'string', pattern: '^[\\p{L}][\\p{L}\\p{N}_-]*$' }, '孔位_01'), '孔位_01');
  // JSON Schema patterns match a substring unless anchors are explicitly used.
  assert.equal(validateSchema({ pattern: 'base' }, 'prefix_base_0'), 'prefix_base_0');
  fails(() => validateSchema({ pattern: '^base$' }, 'prefix_base_0'), 'PARAM_SCHEMA_INVALID');
  assert.deepEqual(input, { entityId: 'rectangle-1_0' });
});
