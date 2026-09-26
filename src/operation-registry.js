import { operationCatalog } from './operation-catalog.js';
import { QUICK_MODELS } from './quick-models.js';
import { assertJsonValue, contractError, contractHash, validateSchema } from './contracts/operation-schema.js';

export const apiVersion = '2.0';
export const migratedOperationIds = Object.freeze(['box', 'hole', 'holeWizard', 'draftFaces', 'multiHole', 'multiPocket', 'multiBoss', 'faceHole', 'fillet', 'chamfer', 'shell', 'smoothTransition', 'autoRound', 'extractFaces','extractShell','sketchProfile','profileOffset','profileRepair','profileExtrude']);
const migrated = new Set(migratedOperationIds);
const clone = value => JSON.parse(JSON.stringify(value));
const topology = new Set(['faceHole', 'fillet', 'chamfer', 'shell', 'smoothTransition']);
const topologyConvention = operationCatalog.topology;
const defaults = { autoRound:{}, smoothTransition: {}, box: {}, hole: { x: 0, y: 0, z: 0, axis: 'Z', direction: 1 },holeWizard:{kind:'plain',axis:'Z',direction:1,through:false},
  multiHole: { axis: 'Z', direction: 1 }, multiPocket:{axis:'Z',direction:-1}, multiBoss:{axis:'Z',direction:1}, faceHole: { through: false }, fillet: {}, chamfer: {}, shell: {}, draftFaces:{}, extractFaces:{}, extractShell:{}, sketchProfile:{}, profileOffset:{}, profileRepair:{}, profileExtrude:{} };
const triangle = [[-1, -1], [1, -1], [0, 1]];
const regions = [{ outer: triangle }];
const examples = { autoRound:{radius:0.1}, smoothTransition:{radius:0.1,faceIds:[0,1]},
  box: { width: 50, depth: 30, height: 3 }, cylinder: { radius: 10, height: 20 }, sphere: { radius: 10 },
  cone: { radius1: 10, radius2: 0, height: 20 }, torus: { majorRadius: 10, minorRadius: 2 },
  extrude: { profile: 'rectangle', width: 20, depth: 10, height: 5 },
  revolve: { profile: 'rectangle', width: 2, depth: 3, offset: 10, angle: 360 },
  sweep: { profile: 'circle', radius: 1, points: [[0, 0, 0], [0, 0, 10]] },
  loft: { profile: 'circle', radius: 5, endRadius: 3, height: 10 },
  transform: { x: 10 }, copy: { x: 10 }, mirror: { plane: 'YZ' },
  hole: { radius: 2, depth: 5, x: 5, y: 5, z: 4, axis: 'Z', direction: -1 },
  multiHole: { radius: 2, depth: 5, axis: 'Z', direction: -1, points: [[5, 5, 4], [45, 5, 4], [5, 25, 4], [45, 25, 4]] },
  multiPocket:{depth:0.5,axis:'Z',direction:-1,pockets:[{x:10,y:10,z:3,width:6,height:4},{x:25,y:10,z:3,width:6,height:4,cornerRadius:0.5}]},
  multiBoss:{radius:2,height:3,axis:'Z',direction:1,points:[[10,10,3],[30,10,3]]},
  faceHole: { faceId: 0, point: [5, 5, 3], radius: 2, through: true },
  faceExtrude: { faceId: 0, height: 2 }, fillet: { radius: 0.5, edgeIds: [0] },
  chamfer: { distance: 0.5, edgeIds: [0] }, shell: { thickness: 1, faceIds: [0] },
  slot: { length: 10, width: 3, depth: 5, x: 20, y: 15, z: 4, direction: -1 },
  linearPattern: { count: 3, dx: 20 }, circularPattern: { count: 3, angle: 360, axis: 'Z' },
  split: { plane: 'XY', offset: 1 }, extractSolid: { solidIndex: 0 }, group: {}, union: {}, cut: {}, intersect: {},
  quickModel: { kind: 'tube' }, remove: {}, import: {},
  logo: { placementVersion:2, faceId: 0, point:[5,5,3], mode: 'engrave', depth: 0.2, draftAngle:0, regions, source:{kind:'reviewed-contours',reviewed:true} },
  vectorProfile: { regions, output: 'solid', height: 2 },
  arcProfile: { outer:[{type:'line',points:[[0,0],[10,0]]},{type:'line',points:[[10,0],[10,5]]},{type:'line',points:[[10,5],[0,5]]},{type:'line',points:[[0,5],[0,0]]}],height:2 },
  curveSweep: { pathType: 'arc', points: [[10, 0, 0], [7.071, 7.071, 0], [0, 10, 0]], radius: 1 },
  advancedLoft: { sections: [{ z: 0, points: triangle }, { z: 10, points: triangle }] },
  fittedSurface: { points: [0, 5, 10].map(y => [0, 5, 10].map(x => [x, y, 0])) },
  thickenFace: { faceId: 0, thickness: 1 }, curvedLogo: { faceId: 0, point: [10, 0, 5], depth: 0.2, regions },
  planeSection: { plane: 'XY', offset: 1 }, faceBoundary: { faceId: 0 }, extractFaces:{faceIds:[0]}, extractShell:{shellIndex:0},
  sewFaces: { tolerance: 0.01, makeSolid: false }, surfaceTrim: { faceId: 0, mode: 'intersect' },
  referenceExtrude: { direction: [0,0,1], distance: 3 }, referenceLoft: { ruled: false },
  sketchProfile:{profileVersion:1,entities:[{id:'circle-1',type:'circle',centerMm:[0,0],diameterMm:20}],loops:[{id:'outer',edges:[{entityId:'circle-1',reversed:false}]}],regions:[{id:'region-1',outerLoopId:'outer',holeLoopIds:[]}],output:'face'},
  profileOffset:{distanceMm:2,side:'inside',join:'intersection',output:'band'},
  profileRepair:{issueId:'closure:outline',maxEndpointMoveMm:0.03},
  profileExtrude:{operation:'newBody',extent:'distance',distanceMm:3,direction:1},
  holeWizard:{kind:'counterbore',diameterMm:4,depthMm:6,through:false,recessDiameterMm:7,recessDepthMm:2,x:10,y:10,z:10,axis:'Z',direction:-1},
  draftFaces:{faceIds:[0,1,2,3],neutralFaceId:4,pullDirection:[0,0,1],angleDeg:2},
};

function schemaFor(id, source) {
  const schema = clone(source.paramsSchema || { type: 'object', properties: {}, additionalProperties: false });
  schema.$schema = 'https://json-schema.org/draft/2020-12/schema';
  if (id === 'quickModel') {
    return { $schema: schema.$schema, type: 'object', oneOf: Object.entries(QUICK_MODELS).map(([kind, definition]) => {
      const fields = new Map(definition.fields.map(field => [field.key, field]));
      return { type: 'object', required: ['kind'], additionalProperties: false,
        description: definition.descriptionEn || definition.description,
        properties: { kind: { type: 'string', const: kind }, ...Object.fromEntries(Object.entries(definition.defaults).map(([key, value]) => {
          const field = fields.get(key);
          return [key, { type: typeof value, default: value,
            description: field?.labelEn || field?.label || key,
            ...(field?.options ? { enum: field.options.map(option => option.value) } : {}) }];
        })) } };
    }) };
  }
  if (!migrated.has(id)) return schema;
  for (const [key, value] of Object.entries(defaults[id])) schema.properties[key].default = value;
  if (id === 'fillet' || id === 'chamfer') {
    schema.properties.edgeIds.minItems = 1;
    schema.properties.edgeIds.uniqueItems = true;
    schema.properties.faceIds.minItems = 1;
    schema.properties.faceIds.uniqueItems = true;
    schema.anyOf = [{ required: ['edgeIds'] }, { required: ['faceIds'] }, { required: ['allEdges'], properties: { allEdges: { const: true } } }];
  }
  if (id === 'shell') {
    schema.properties.faceIds.uniqueItems = true;
    schema.properties.thickness.not = { const: 0 };
  }
  if (id === 'faceHole') schema.anyOf = [{ required: ['depth'] }, { required: ['through'], properties: { through: { const: true } } }];
  return schema;
}

function refsFor(refs) {
  const exact = typeof refs === 'number';
  const min = exact ? refs : Number(String(refs).slice(2));
  return { type: 'array', items: { type: 'string', minLength: 1, maxLength: 150 }, uniqueItems: true,
    minItems: min, ...(exact ? { maxItems: min } : {}) };
}

function categoryFor(id) {
  if (['remove', 'import'].includes(id)) return 'document';
  if (['planeSection', 'faceBoundary', 'extractFaces', 'extractShell', 'referenceExtrude', 'referenceLoft','sketchProfile','profileOffset','profileRepair','profileExtrude'].includes(id)) return 'reference';
  if (['fittedSurface', 'thickenFace', 'sewFaces', 'surfaceTrim', 'curvedLogo', 'advancedLoft'].includes(id)) return 'surface';
  if (['transform', 'copy', 'mirror', 'linearPattern', 'circularPattern', 'group', 'extractSolid', 'split'].includes(id)) return 'organization';
  return operationCatalog.operations[id].refs === 0 ? 'creation' : 'modification';
}

const names = { box: ['长方体', '安装板', 'plate'], hole: ['孔', '钻孔', 'radius'], multiHole: ['多孔', '孔位', 'mounting plate'], multiPocket:['多凹槽','批量凹刻','rectangular pocket','recess'], multiBoss:['多凸台','批量圆柱凸台','cylindrical boss'],
  smoothTransition:['平滑过渡','接缝','利角','blend'], faceHole: ['面钻孔', '贯穿'], fillet: ['圆角'], chamfer: ['倒角'], shell: ['抽壳', '壁厚'],
  referenceExtrude: ['参考轮廓', '精确曲线', '拉伸'], referenceLoft: ['参考截面', '精确曲线', '放样'] };

function buildCard(id, source) {
  const strict = migrated.has(id), special = source.mcpAddFeature === false;
  const version = strict ? '1.0.0' : 'legacy-1';
  const inputSchema = schemaFor(id, source), refsSchema = refsFor(source.refs);
  if (id === 'profileExtrude') refsSchema.maxItems = 2;
  if (id === 'referenceLoft') refsSchema.maxItems = 12;
  const selector = topology.has(id) ? { supported: true, kind: ['fillet', 'chamfer'].includes(id) ? 'edge' : 'face',
    location: 'args.selectionToken', featureAddOnly: true,
    conflictsWith: ['faceId', 'faceIds', 'edgeIds', 'allEdges'],
    phases: 'Validate user params with phase=input and selectionToken, resolve against current snapshot, then validate complete params with phase=resolved.' } : { supported: false };
  const preserves = ['copy', 'planeSection', 'faceBoundary', 'extractFaces', 'extractShell', 'surfaceTrim', 'referenceExtrude', 'referenceLoft','profileOffset','profileRepair'].includes(id) ? true
    : ['mirror', 'extractSolid'].includes(id) ? 'unless keepOriginal=false' : false;
  const minRefs = refsSchema.minItems;
  const example = { op: id, params: clone(examples[id]), refs: Array.from({ length: minRefs }, (_, i) => `<current-bodyId-${i + 1}>`),
    referenceInstructions: 'Resolve body IDs from get_state_v2. Numeric topology examples are placeholders: query the actual current body; never assume faceId/edgeId 0 has a spatial meaning.',
    validation: strict ? 'strict-parameter-schema' : special ? 'dedicated-entry-only' : 'advisory-schema-only; kernel prerequisites are not certified by this example' };
  const invalidParams = id === 'box' ? { ...examples[id], width: -1 }
    : ['hole', 'multiHole', 'faceHole'].includes(id) ? { ...examples[id], diameter: 4 }
      : id === 'shell' ? { ...examples[id], thickness: 0 }
        : ['fillet', 'chamfer'].includes(id) ? { ...examples[id], allEdges: true }
          : { ...examples[id], __unknownField: true };
  const known = [source.notes || source.description];
  if (!strict) known.push('This operation has not migrated to the strict v2 contract. Its schema remains advisory; use the documented legacy entry.');
  if (special) known.push(id === 'remove' ? 'Use webcad_remove or v2 feature.remove; not feature.add.' : 'File lifecycle automation is deferred to M2; browser import is not a zero-mouse API.');
  const editRule = ['fillet', 'chamfer'].includes(id)
    ? 'On edit, patch edgeIds or faceIds selects that exact current topology scope and removes the other scope. Patch allEdges=true selects all body edges. Supplying multiple scopes in one patch conflicts. Amount is merged from existing params.' : 'Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.';
  const contract = { id, version, inputSchema, refsSchema,
    defaults: id === 'quickModel' ? Object.fromEntries(Object.entries(QUICK_MODELS).map(([kind, definition]) => [kind, clone(definition.defaults)])) : defaults[id] || {},
    selectionTokenSupport: selector, editRule, units: operationCatalog.units,
    coordinateConvention: id === 'box' ? 'World [0,0,0] to [width,depth,height], all in mm.'
      : ['hole', 'multiHole'].includes(id) ? 'World XYZ cutter start, signed principal axis, radius in mm (not diameter), fixed positive depth. No through parameter.'
        : id==='multiPocket' ? 'Each world XYZ is a pocket cutter start center; shared positive depth cuts along signed axis. Width/height directions: Z axis X/Y, X axis Y/Z, Y axis Z/X. No automatic through or inferred surface.'
          : id==='multiBoss' ? 'Each world XYZ is a boss base center; shared radius and positive height extend along signed X/Y/Z. Each must fuse to one solid and add material. No bore.'
        : id === 'faceHole' ? 'World XYZ point on a planar face. Drill inward along the negative outward face normal. through computes depth from body bounds.'
          : `${topologyConvention} ${source.notes || source.description}` };
  return { ...contract, title: source.description, category: categoryFor(id), synonyms: names[id] || [id],
    description: source.description, schemaHash: contractHash(contract), apiCompatibility: strict ? ['legacy', '2.0'] : ['legacy'],
    implementationStatus: 'implemented', availability: 'requires_browser', unavailableReason: null,
    strictContract: strict, v2Executable: strict, contractStatus: strict ? 'migrated' : 'advisory',
    outputSchema: { type: 'object', description: 'Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.',
      properties: { status: { type: 'string', enum: ['committed', 'no_change', 'failed', 'unknown'] } } },
    preconditions: [minRefs ? 'Use current referenced bodies in the same document instance and revision.' : 'Use explicit empty refs for independent creation.',
      ...(topology.has(id) ? ['Resolve topology against the current snapshot; do not reuse indices across revisions.'] : [])],
    postconditions: ['A successful modeling operation commits one undoable history transaction; invalid geometry must not commit.'],
    resultShapeTypes: id==='sketchProfile'||id==='profileOffset'||id==='profileRepair'?['wire','planar face']:['planeSection', 'faceBoundary'].includes(id) ? ['curve compound'] : id === 'extractFaces' ? ['face','compound of faces'] : id === 'extractShell' ? ['shell'] : id === 'fittedSurface' ? ['face']
      : ['advancedLoft', 'vectorProfile', 'sewFaces', 'surfaceTrim'].includes(id) ? ['solid', 'shell', 'face (operation-dependent)'] : special ? [] : ['solid', 'compound (operation-dependent)'],
    consumesInputs: minRefs > 0 && preserves !== true, preservesInputs: preserves, createsResults: id !== 'remove',
    sideEffects: ['Updates active document history and derived view on commit.'], permissions: ['Authorized local modeling session; no external upload.'],
    undoBehavior: 'One successful feature operation is one undo step. Legacy refresh is separately documented.',
    idempotency: strict ? 'v2 same documentInstanceId, at most 1000 in-memory receipts; refuses new commands at capacity without evicting old receipts. No durable or cross-reload guarantee.' : 'Legacy calls do not guarantee idempotency.',
    limits: strict ? ['Finite JSON values; no numeric strings, unknown fields, or implicit UI selection.'] : ['Schema advisory only; existing operation/kernel restrictions apply.'],
    knownUnsupportedCases: known, minimalExample: example, normalExample: clone(example),
    invalidExamples: [{ params: invalidParams, errorCode: strict ? (id === 'box' ? 'PARAM_RANGE_INVALID' : ['fillet', 'chamfer'].includes(id) ? 'SELECTION_CONFLICT' : 'PARAM_SCHEMA_INVALID') : 'NOT_A_STRICT_V2_OPERATION',
      explanation: strict ? 'Rejected before kernel execution.' : 'v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement.' }],
    errorCodes: ['PARAM_SCHEMA_INVALID', 'PARAM_RANGE_INVALID', 'UNKNOWN_OPERATION', 'OPERATION_VERSION_UNSUPPORTED', 'SCHEMA_MISMATCH', 'CAPABILITY_UNAVAILABLE', 'GEOMETRY_INVALID',
      ...(topology.has(id) ? ['SELECTION_CONFLICT', 'STALE_REFERENCE', 'UNSAFE_LEGACY_REFERENCE'] : []),
      ...(['hole', 'multiHole', 'multiPocket', 'faceHole'].includes(id) ? ['NO_MATERIAL_REMOVED'] : []),
      ...(id==='multiBoss'?['NO_MATERIAL_ADDED']:[])],
    recoveryActions: ['CORRECT_PARAMETERS', 'READ_STATE_AND_REPLAN', 'READ_TOOL_CONTRACT', 'NONE'],
    relatedTools: ['webcad_get_state_v2', 'webcad_query_geometry', strict ? 'webcad_execute_v2' : 'webcad_add_feature'],
    recipes: ['box', 'hole', 'multiHole'].includes(id) ? ['recipes.mounting-plate'] : [],
    testIds: strict ? ['tests/operation-registry.test.mjs'] : [],
    ...(id === 'quickModel' ? { templates: Object.entries(QUICK_MODELS).map(([kind, definition]) => ({ kind,
      title: definition.labelEn || definition.label, description: definition.descriptionEn || definition.description,
      defaults: clone(definition.defaults), fields: clone(definition.fields),
      knownUnsupportedCases: ['Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid.'],
      minimalExample: { kind }, normalExample: { kind, ...clone(definition.defaults) } })) } : {}),
    verification: { contract: strict ? 'covered-by-contract-tests' : 'not_migrated', kernel: 'See test run report; card generation is not proof of kernel execution.' } };
}

const cards = Object.fromEntries(Object.keys(operationCatalog.operations).sort().map(id => [id, buildCard(id, operationCatalog.operations[id])]));
export const catalogHash = contractHash(Object.values(cards).map(({ id, version, schemaHash }) => ({ id, version, schemaHash })));

export function getOperation(id) {
  if (typeof id !== 'string' || !Object.hasOwn(cards, id)) contractError('UNKNOWN_OPERATION', 'args.op', `Unknown operation: ${String(id)}`, 'READ_TOOL_CONTRACT');
  return clone(cards[id]);
}
export function listOperations() { return Object.values(cards).map(clone); }

export function assertOperationContract(op, { opVersion, schemaHash } = {}) {
  const card = getOperation(op);
  if (!card.v2Executable) contractError('CAPABILITY_UNAVAILABLE', 'args.op', 'This operation has not migrated to the v2 execution contract.', 'READ_TOOL_CONTRACT');
  if (opVersion !== card.version) contractError('OPERATION_VERSION_UNSUPPORTED', 'args.opVersion', 'Read the current tool version before executing.', 'READ_TOOL_CONTRACT');
  if (schemaHash !== card.schemaHash) contractError('SCHEMA_MISMATCH', 'args.schemaHash', 'Read the current tool contract before executing.', 'READ_TOOL_CONTRACT');
  return card;
}

export function normalizeOperationParams(op, params, { selectionToken, phase = 'resolved' } = {}) {
  const card = getOperation(op);
  if (!card.strictContract) contractError('CAPABILITY_UNAVAILABLE', 'args.op', 'Strict normalization is available only for migrated operations.', 'READ_TOOL_CONTRACT');
  assertJsonValue(params);
  if (!params || Array.isArray(params) || typeof params !== 'object') contractError('PARAM_SCHEMA_INVALID', 'params', 'Expected an object.');
  if (!['input', 'resolved'].includes(phase)) throw new Error('Unknown parameter validation phase.');
  const schema = clone(card.inputSchema);
  if (selectionToken !== undefined) {
    if (!card.selectionTokenSupport.supported) contractError('PARAM_SCHEMA_INVALID', 'args.selectionToken', 'This operation does not support a selection token.');
    if (phase !== 'input') contractError('PARAM_SCHEMA_INVALID', 'args.selectionToken', 'Resolve the selection token before final parameter validation.');
    for (const key of card.selectionTokenSupport.conflictsWith) if (Object.hasOwn(params, key)) contractError('SELECTION_CONFLICT', `params.${key}`, 'Selection token conflicts with explicit topology selection.');
    schema.required = (schema.required || []).filter(k => !['faceId', 'faceIds'].includes(k));
    if (op === 'fillet' || op === 'chamfer') { delete schema.anyOf; delete schema.not; }
  }
  if (op === 'fillet' || op === 'chamfer') {
    const scopes = Number(Object.hasOwn(params, 'edgeIds')) + Number(Object.hasOwn(params, 'faceIds')) + Number(params.allEdges === true);
    if (scopes > 1) contractError('SELECTION_CONFLICT', 'params', 'Choose exactly one of edgeIds, faceIds, or allEdges=true.');
  }
  validateSchema(schema, params);
  return { ...clone(defaults[op]), ...clone(params) };
}

export function normalizeOperationPatch(op, previousParams, patch) {
  assertJsonValue(patch);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) contractError('PARAM_SCHEMA_INVALID', 'params', 'Expected a parameter patch object.');
  const merged = { ...previousParams, ...patch };
  if (op === 'fillet' || op === 'chamfer') {
    const scopes = Number(Object.hasOwn(patch, 'edgeIds')) + Number(Object.hasOwn(patch, 'faceIds')) + Number(patch.allEdges === true);
    if (scopes > 1) contractError('SELECTION_CONFLICT', 'params', 'One patch cannot select multiple edge scopes.');
    if (Object.hasOwn(patch, 'edgeIds')) { delete merged.faceIds; delete merged.allEdges; }
    else if (Object.hasOwn(patch, 'faceIds')) { delete merged.edgeIds; delete merged.allEdges; }
    else if (patch.allEdges === true) { delete merged.edgeIds; delete merged.faceIds; }
  }
  return normalizeOperationParams(op, merged);
}

export function validateOperationRefs(op, refs) {
  validateSchema(getOperation(op).refsSchema, refs, 'args.refs');
  return [...refs];
}

/** Documentation examples are parameter-checked; this is not a geometry test. */
export function validateOperationExample(op, params) {
  const card = getOperation(op);
  return card.strictContract ? normalizeOperationParams(op, params) : validateSchema(card.inputSchema, params);
}
