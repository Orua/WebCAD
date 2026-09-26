import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { mechanicalIds, mechanicalNames, mechanicalExamples, mechanicalCreationIds, profileSolidIds, mechanicalRefRange } from '../src/mechanical-tool-contracts.js';
import { getOperation, normalizeOperationParams, validateOperationRefs, assertOperationContract } from '../src/operation-registry.js';
import { getTool, getTools, readDocs } from '../src/page-api-docs.js';
import { placementPolicy, placementContract, assertPlacementCoverage } from '../src/placement-policy.js';
import { UI_API_ROUTES, requireUIRoute } from '../src/ui-api-coverage.js';
import { UI_LAYOUT } from '../src/ui/config/ui-layout.js';

test('every mechanical tool has a strict executable card, exact Chinese label, current schema and readable contract', () => {
  for (const id of mechanicalIds) {
    const card = getOperation(id), pageCard = getTool({ id });
    assert.equal(card.strictContract, true, id); assert.equal(card.v2Executable, true, id); assert.equal(card.inputSchema.additionalProperties, false, id);
    assert.match(card.schemaHash, /^sha256:[a-f0-9]{64}$/); assert.equal(pageCard.schemaHash, card.schemaHash); assert.equal(pageCard.label, mechanicalNames[id]);
    const normalized = normalizeOperationParams(id, mechanicalExamples[id]); assert.equal(typeof normalized, 'object');
    assertOperationContract(id, { opVersion: card.version, schemaHash: card.schemaHash });
    assert.throws(() => assertOperationContract(id, { opVersion: card.version, schemaHash: 'sha256:' + '0'.repeat(64) }), { code: 'SCHEMA_MISMATCH' });
    assert.throws(() => normalizeOperationParams(id, { ...mechanicalExamples[id], unknownField: true }), { code: 'PARAM_SCHEMA_INVALID' });
    for (const key of card.inputSchema.required || []) {
      const incomplete = structuredClone(mechanicalExamples[id]); delete incomplete[key];
      assert.throws(() => normalizeOperationParams(id, incomplete), { code: 'PARAM_SCHEMA_INVALID' }, `${id} requires ${key}`);
    }
    const docId = `webcad://operations/${id}/${card.version}`; let cursor, text = '', pages = 0;
    do {
      const doc = readDocs({ docId, limitChars: 16000, ...(cursor ? { cursor } : {}) });
      assert.equal(doc.status, 'read'); text += doc.text; cursor = doc.nextCursor; pages++;
      assert.ok(pages < 100, 'contract documentation pagination must terminate');
    } while (cursor);
    assert.ok(text.includes(`"id": "${id}"`)); assert.ok(text.includes(card.schemaHash));
    assert.equal(requireUIRoute(id).method, 'execute'); assert.ok(requireUIRoute(id).tools.includes(id));
  }
});

test('mechanical reference bounds reject duplicate, insufficient and excessive IDs and publish conditional target-last counts', () => {
  for (const id of mechanicalIds) {
    const card = getOperation(id), refs = Array.from({ length: card.refsSchema.minItems }, (_, index) => `body-${index}`);
    assert.deepEqual(validateOperationRefs(id, refs), refs);
    if (refs.length) assert.throws(() => validateOperationRefs(id, refs.slice(1)));
    if (card.refsSchema.maxItems !== undefined) assert.throws(() => validateOperationRefs(id, Array.from({ length: card.refsSchema.maxItems + 1 }, (_, index) => `body-${index}`)));
    if ((card.refsSchema.maxItems ?? 2) >= 2) assert.throws(() => validateOperationRefs(id, ['same', 'same']), { code: 'PARAM_SCHEMA_INVALID' });
    assert.deepEqual(mechanicalRefRange(id, mechanicalExamples[id]), card.conditionalRefs?.newBody || { min: card.refsSchema.minItems, max: card.refsSchema.maxItems });
    if (profileSolidIds.includes(id)) {
      assert.ok(typeof card.preservesInputs === 'string' && card.preservesInputs.includes('last target'));
      assert.deepEqual(mechanicalRefRange(id, { operation: 'cut' }), card.conditionalRefs.modification);
      assert.equal(card.conditionalRefs.modification.min, card.conditionalRefs.newBody.min + 1);
      assert.equal(card.conditionalRefs.modification.max, card.conditionalRefs.newBody.max + 1);
    }
  }
});

test('mechanical numeric inputs do not coerce strings/nonfinite values and bounded or signed parameters reject invalid values', () => {
  for (const id of mechanicalIds) {
    const card = getOperation(id), numeric = Object.entries(card.inputSchema.properties).find(([, property]) => property.type === 'number');
    if (numeric) for (const value of ['1', NaN, Infinity]) assert.throws(() => normalizeOperationParams(id, { ...mechanicalExamples[id], [numeric[0]]: value }), { code: 'PARAM_SCHEMA_INVALID' });
  }
  for (const [id, patch] of [['profileRevolve', { angleDeg: 361 }], ['offsetSolid', { distanceMm: 0 }], ['offsetSurface', { distanceMm: 0 }], ['draftByPlane', { angleDeg: 45 }], ['draftByPlane', { angleDeg: 0 }], ['helix', { turns: 101 }], ['coil', { wireDiameterMm: -1 }], ['thread', { includedAngleDeg: 121 }]])
    assert.throws(() => normalizeOperationParams(id, { ...mechanicalExamples[id], ...patch }), error => ['PARAM_RANGE_INVALID', 'PARAM_SCHEMA_INVALID'].includes(error.code));
});

test('creation helix/coil use placement snapshots while saved-source operations never apply a new insertion transform', () => {
  assert.ok(assertPlacementCoverage() > 0);
  for (const id of mechanicalIds) {
    const creation = mechanicalCreationIds.includes(id), policy = placementContract(id), pageCard = getTool({ id });
    assert.equal(placementPolicy(id), creation ? 'C' : 'N'); assert.equal(policy.placementSupported, creation); assert.deepEqual(pageCard.placementPolicy, policy);
    if (creation) assert.equal(policy.historyBinding, 'snapshot');
  }
  assert.equal(getOperation('offsetSurface').preservesInputs, true);
  assert.equal(getOperation('offsetSolid').preservesInputs, false);
  assert.equal(getOperation('thread').preservesInputs, false);
  assert.equal(getOperation('profileConstraints').preservesInputs, true);
});

test('constraint API validates nested variants, entity IDs and explicit units without accepting hidden fields', () => {
  const valid = { constraints: [
    { id: 'lock_start', type: 'fixPoint', point: { entityId: 'edge_0', point: 'start' }, positionMm: [5, 7] },
    { type: 'distance', first: { entityId: 'edge_0', point: 'start' }, second: { entityId: 'edge_1', point: 'end' }, axis: 'x', distanceMm: -10 },
    { type: 'angle', firstId: 'edge_0', secondId: 'edge_1', angleDeg: 60, direction: 'cw' },
  ] };
  assert.deepEqual(normalizeOperationParams('profileConstraints', valid), valid);
  assert.deepEqual(normalizeOperationParams('profileConstraints', { constraints: [] }), { constraints: [] });
  for (const constraint of [
    { type: 'length', entityId: 'unsafe/entity', lengthMm: 10 },
    { type: 'length', entityId: 'edge_0', lengthMm: '10' },
    { type: 'length', entityId: 'edge_0', lengthMm: Infinity },
    { type: 'length', entityId: 'edge_0', lengthMm: 10, hidden: true },
    { type: 'fixPoint', point: { entityId: 'edge_0', point: 'start', hidden: true }, positionMm: [0, 0] },
    { type: 'fixPoint', point: { entityId: 'edge_0', point: 'start' }, positionMm: [0, 0, 0] },
    { type: 'angle', firstId: 'edge_0', secondId: 'edge_1', angleDeg: 60, direction: 'clockwise' },
    { type: 'tangent', lineId: 'edge_0', circleId: 'circle', side: 'above' },
    { type: 'automatic' },
  ]) assert.throws(() => normalizeOperationParams('profileConstraints', { constraints: [constraint] }), { code: 'PARAM_SCHEMA_INVALID' });
  assert.throws(() => normalizeOperationParams('profileConstraints', { constraints: Array.from({ length: 129 }, () => valid.constraints[0]) }), error => ['PARAM_RANGE_INVALID', 'PARAM_SCHEMA_INVALID'].includes(error.code));
});

test('batch API discovery returns all mechanical cards and honors complete card hashes', () => {
  const first = getTools({ ids: mechanicalIds }); assert.equal(first.items.length, mechanicalIds.length);
  assert.ok(first.items.every(item => item.status === 'read' && item.card.strictContract));
  const knownHashes = Object.fromEntries(first.items.map(item => [item.id, item.docsHash]));
  const second = getTools({ ids: mechanicalIds, knownHashes }); assert.ok(second.items.every(item => item.status === 'not_modified' && !Object.hasOwn(item, 'card')));
});

const originalGroups = {
  edit: [['选择', ['selectTool']], ['变换', ['moveTool', 'rotateTool']], ['复制', ['copySelection', 'pasteSelection', 'copy', 'mirror']], ['组合', ['group', 'explode']], ['轮廓编辑', ['profileOffset', 'profileRepair']], ['管理', ['remove']]],
  create: [['轮廓', ['sketchProfile', 'sketch', 'vectorProfile', 'arcProfile']], ['轮廓成型', ['profileExtrude', 'extrude', 'revolve', 'sweep', 'loft']]],
  model: [['基本实体', ['box', 'cylinder', 'sphere', 'cone', 'torus']], ['模型库', ['quickModel', 'importAtFrame']]],
  machine: [['布尔运算', ['union', 'cut', 'intersect']], ['孔与槽', ['holeWizard', 'hole', 'multiHole', 'slot', 'multiPocket', 'multiBoss']], ['面加工', ['faceHole', 'faceExtrude', 'logo']]],
  finish: [['边与过渡', ['fillet', 'chamfer', 'autoRound', 'smoothTransition']], ['壳与拆分', ['shell', 'split', 'extractSolid']], ['拔模', ['draftFaces']]],
  surface: [['曲面成型', ['curveSweep', 'advancedLoft', 'fittedSurface']], ['参考提取', ['planeSection', 'faceBoundary', 'extractFaces', 'extractShell']], ['参考成体', ['referenceExtrude', 'referenceLoft', 'thickenFace']], ['曲面处理', ['sewFaces', 'surfaceTrim']]],
  inspect: [['几何检查', ['measure', 'measureRelation', 'inspectFit', 'inspectThickness', 'inspectDraft', 'section', 'inspectPrintability']], ['结果记录', ['screenshot']]],
  view: [], settings: [['外观', ['themeSettings', 'displayPreferences', 'logoConverterSettings']], ['交互', ['precisionSettings', 'snapSettings', 'languageSettings']], ['工程', ['parameters']], ['AGENT', ['agentGuide']]],
};

test('original nine tabs and tool inventory remain intact after requested simple-first ordering', () => {
  assert.deepEqual(UI_LAYOUT.tabs.map(tab => tab.id), Object.keys(originalGroups));
  for (const tab of UI_LAYOUT.tabs) {
    const groups=tab.groups.filter(([name])=>tab.id!=='model'||name!=='常用模型');
    assert.deepEqual(groups.map(([name]) => name).sort(), originalGroups[tab.id].map(([name]) => name).sort());
    originalGroups[tab.id].forEach(([name, actions]) => {const current=groups.find(([label])=>label===name)[1];assert.deepEqual(current.filter(action=>actions.includes(action)).sort(),[...actions].sort(),`${tab.id}/${name}`);});
    if(tab.id==='model')assert.deepEqual(tab.groups.filter(([name])=>name==='常用模型'),[['常用模型',['quickModelFavorites']]]);
    if (['edit', 'create', 'model'].includes(tab.id)) assert.equal(tab.unfolded, true);
  }
  const actions = UI_LAYOUT.tabs.flatMap(tab => tab.groups.flatMap(([, ids]) => ids));
  assert.equal(actions.filter(id => ['profileRevolve', 'profileSweep', 'profileLoft'].includes(id)).length, 0, 'source operations share original entries instead of duplicate ribbon buttons');
});

test('original revolve/sweep/loft entries document both parameter and saved-source modes with public API mappings', () => {
  for (const [legacy, source] of [['revolve', 'profileRevolve'], ['sweep', 'profileSweep'], ['loft', 'profileLoft']]) {
    assert.deepEqual(UI_API_ROUTES[legacy].tools, [legacy, source]); assert.equal(UI_API_ROUTES[legacy].method, 'execute');
    assert.equal(requireUIRoute(source).tools[0], source);
  }
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8'), helper = fs.readFileSync(new URL('../src/ui/forms/profile-solid-dialogs.js', import.meta.url), 'utf8');
  assert.match(ui, /showProfileSolidDialog\(op,/); assert.match(ui, /onLegacy:op!==action\?\(\)=>actionDialog\(action\):undefined/);
  assert.match(helper, /_targetRefs:\s*refs/); assert.match(helper, /bindParameterForm\(form, op, read\)/);
  assert.ok(!helper.includes("element('textarea'")); assert.ok(!helper.includes("element('details'"));
});
