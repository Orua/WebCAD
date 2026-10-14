import {reliefPlateExample} from './mesh/relief-plate.js';
import {heightfieldReliefExample} from './mesh/heightfield-relief.js';
import {meshBooleanExample} from './mesh/mesh-boolean.js';
import {reliefEditExample} from './mesh/relief-edit-contract.js';
import {MACHINING_INTENT_SCHEMA,assertPatternExecution,PATTERN_OPERATIONS} from './machining-intent.js';
import { operationCatalog, legacyRoundingOperation, legacyUnifiedRoundingOperation } from './operation-catalog.js';
import { QUICK_MODELS } from './quick-models.js';
import {mechanicalIds,mechanicalDefaults,mechanicalExamples,mechanicalNames,mechanicalRefCounts,mechanicalResultTypes,mechanicalPreservedIds,profileSolidIds,mechanicalErrorCodes} from './mechanical-tool-contracts.js';
import { assertJsonValue, contractError, contractHash, validateSchema } from './contracts/operation-schema.js';
import { annotateParameterSchema, numericInputPolicy } from './parameter-metadata.js';
import {heightfieldSamples} from './mesh/heightfield-relief.js';

export const apiVersion = '2.0';
export const migratedOperationIds = Object.freeze(['meshHeightfieldRelief','meshBoolean','logo','union','cut','intersect','transform','copy','reliefShoulder','meshReliefPlate','meshReliefEdit','box', 'cylinder', 'sphere', 'cone', 'torus', 'mirror', 'linearPattern', 'circularPattern', 'hole', 'holeWizard', 'draftFaces', 'multiHole', 'multiPocket', 'multiBoss', 'faceHole', 'round', 'roundEnd', 'rounding', 'fillet', 'chamfer', 'shell', 'smoothTransition', 'autoRound', 'extractFaces','extractShell','sketchProfile','profileOffset','profileRepair','profileExtrude',...mechanicalIds]);
const migrated = new Set(migratedOperationIds);
const clone = value => JSON.parse(JSON.stringify(value));
const topology = new Set(['faceHole', 'rounding', 'fillet', 'chamfer', 'shell', 'smoothTransition']);
const topologyConvention = operationCatalog.topology;
import {operationDefaults as defaults,operationExamples as examples} from './operation-examples.js';

function schemaFor(id, source) {
  const schema = clone(source.paramsSchema || { type: 'object', properties: {}, additionalProperties: false });
  schema.$schema = 'https://json-schema.org/draft/2020-12/schema';
  if(PATTERN_OPERATIONS.includes(id))schema.properties.machiningIntent=clone(MACHINING_INTENT_SCHEMA);
  if (id === 'quickModel') {
    return { $schema: schema.$schema, type: 'object', oneOf: Object.entries(QUICK_MODELS).map(([kind, definition]) => {
      const fields = new Map(definition.fields.map(field => [field.key, field]));
      return { type: 'object', required: ['kind'], additionalProperties: false,
        description: definition.descriptionEn || definition.description,
        properties: { modelScript:{type:'array',minItems:1,maxItems:20,items:{type:'object',required:['id','op'],additionalProperties:false,properties:{id:{type:'string'},op:{type:'string',enum:['box','cylinder','sphere','quickModel','union','cut','intersect','transform']},params:{type:'object',additionalProperties:true},refs:{type:'array',items:{type:'string'}}}}},kind: { type: 'string', const: kind }, ...Object.fromEntries(Object.entries(definition.defaults).map(([key, value]) => {
          const field = fields.get(key);
          return [key, { type: typeof value, default: value,
            description: field?.labelEn || field?.label || key,
            ...(field?.options ? { enum: field.options.map(option => option.value) } : {}) }];
        })) } };
    }) };
  }
  if (!migrated.has(id)) return schema;
  for (const [key, value] of Object.entries(defaults[id]||{})) schema.properties[key].default = value;
  if(id==='round')schema.oneOf=[{required:['edgeIds']},{required:['faceIds']}];
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

const names = {reliefShoulder:['浮雕肩部','中央肩部','cylindrical shoulder'], round:['圆润','自动圆润','磨边','圆头','round','smooth selected edge'], roundEnd:['端头圆润','针尖','圆头','自由端','round end','revolve cap'], box: ['长方体', '安装板', 'plate'], hole: ['孔', '钻孔', 'radius'], multiHole: ['多孔', '孔位', 'mounting plate'], multiPocket:['多凹槽','批量凹刻','rectangular pocket','recess'], multiBoss:['多凸台','批量圆柱凸台','cylindrical boss'], rounding:['自动打磨','打磨','圆润','去利角','smooth sharp edges'],
  smoothTransition:['平滑过渡','接缝','利角','blend'], faceHole: ['面钻孔', '贯穿'], fillet: ['圆角','标准圆角','倒圆','半径','fillet'], chamfer: ['倒角'], shell: ['抽壳', '壁厚'],
  referenceExtrude: ['参考轮廓', '精确曲线', '拉伸'], referenceLoft: ['参考截面', '精确曲线', '放样'] };

function buildCard(id, source) {
  const strict = migrated.has(id), special = source.mcpAddFeature === false;
  const version = id==='rounding'?'3.0.0':id==='mirror'?'1.2.0':['mirror','linearPattern','circularPattern','chamfer','holeWizard','profileConstraints'].includes(id)?'1.1.0':strict ? '1.0.0' : 'legacy-1';
  const inputSchema = schemaFor(id, source), refsSchema = refsFor(source.refs);
  if (id === 'profileExtrude') refsSchema.maxItems = 2;
  if (id === 'referenceLoft') refsSchema.maxItems = 12;
  if (mechanicalRefCounts[id]) refsSchema.maxItems=mechanicalRefCounts[id].max;
  const selector = topology.has(id)&&id!=='rounding' ? { supported: true, kind: ['fillet', 'chamfer'].includes(id) ? 'edge' : 'face',
    location: 'args.selectionToken', featureAddOnly: true,
    conflictsWith: ['faceId', 'faceIds', 'edgeIds', 'allEdges'],
    phases: 'Validate user params with phase=input and selectionToken, resolve against current snapshot, then validate complete params with phase=resolved.' } : { supported: false };
  const preserves = profileSolidIds.includes(id) ? 'Preserves section/path sources; replaces only the last target for join/cut/intersect.' : ['copy', 'planeSection', 'faceBoundary', 'extractFaces', 'extractShell', 'surfaceTrim', 'referenceExtrude', 'referenceLoft','profileOffset','profileRepair',...mechanicalPreservedIds].includes(id) ? true
    : ['mirror', 'extractSolid'].includes(id) ? 'unless keepOriginal=false' : false;
  const minRefs = refsSchema.minItems;
  const example = { op: id, params: clone(examples[id]), refs: Array.from({ length: minRefs }, (_, i) => `<current-bodyId-${i + 1}>`),
    referenceInstructions: 'Resolve body IDs from get_state_v2. Numeric topology examples are placeholders: query the actual current body; never assume faceId/edgeId 0 has a spatial meaning.',
    validation: strict ? 'strict-parameter-schema' : special ? 'dedicated-entry-only' : 'advisory-schema-only; kernel prerequisites are not certified by this example' };
  if(PATTERN_OPERATIONS.includes(id))example.params.machiningIntent={version:1,requestedGeometry:id==='relief'?'continuousRelief':'constantDepthContours',sourceInterpretation:id==='relief'?'authoredHeightMap':'reviewedVectors',userIntentEvidence:'Example only: replace with the actual confirmed user request and source identity'};
  const invalidParams = id === 'box' ? { ...examples[id], width: -1 }
    : ['hole', 'multiHole', 'faceHole'].includes(id) ? { ...examples[id], diameter: 4 }
      : id === 'shell' ? { ...examples[id], thickness: 0 }
        : ['fillet', 'chamfer'].includes(id) ? { ...examples[id], allEdges: true }
          : { ...examples[id], __unknownField: true };
  const known = [source.notes || source.description];
  if (!strict) known.push('This operation has not migrated to the strict v2 contract. Its schema remains advisory; use the documented legacy entry.');
  if (special) known.push(id === 'remove' ? 'Use webcad_remove or v2 feature.remove; not feature.add.' : 'File lifecycle automation is deferred to M2; browser import is not a zero-mouse API.');
  const editRule = id==='rounding' ? 'Patch merges into the saved specVersion without converting history: v3 edits strength; v2 edits sizeMm; v1 retains its mode-specific fields. A changed scope must be resolved on the current upstream source and previewed again. Complete merged params are validated against the matching historical/current schema.' : ['fillet', 'chamfer'].includes(id)
    ? 'On edit, patch edgeIds or faceIds selects that exact current topology scope and removes the other scope. Patch allEdges=true selects all body edges. Supplying multiple scopes in one patch conflicts. Amount is merged from existing params.' : 'Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.';
  const contract = { id, version, inputSchema:annotateParameterSchema(inputSchema), refsSchema, numericInputPolicy,
    defaults: id === 'quickModel' ? Object.fromEntries(Object.entries(QUICK_MODELS).map(([kind, definition]) => [kind, clone(definition.defaults)])) : defaults[id] || {},
    selectionTokenSupport: selector, editRule, units: operationCatalog.units,
    ...(id==='rounding'?{historicalInputSchemas:{1:annotateParameterSchema(clone(legacyRoundingOperation.paramsSchema)),2:annotateParameterSchema(clone(legacyUnifiedRoundingOperation.paramsSchema))}}:{}),
    coordinateConvention: id === 'box' ? 'World [0,0,0] to [width,depth,height], all in mm.'
      : id === 'cylinder' ? 'Full cylinder centered on Z, base at [0,0,0], top at Z=height. radius is the cross-section radius, not diameter. Explicit placement transforms this local geometry.'
        : id === 'sphere' ? 'Full sphere centered at [0,0,0], bounds [-radius,-radius,-radius] to [radius,radius,radius]. Explicit placement transforms this local geometry.'
          : id === 'cone' ? 'Full cone/frustum centered on Z; radius1 at Z=0, radius2 at Z=height. Defaults radius1=10, radius2=0 mm. Both radii nonnegative, at least one positive; equal positive radii make a cylinder. Explicit placement transforms this local geometry.'
            : id === 'torus' ? 'Full ring centered at [0,0,0] around Z. majorRadius is the tube centerline radius, minorRadius the tube radius; majorRadius must exceed minorRadius. Outer diameter=2*(majorRadius+minorRadius), inner diameter=2*(majorRadius-minorRadius), thickness=2*minorRadius. Explicit placement transforms this local geometry.'
      : ['hole', 'multiHole'].includes(id) ? 'World XYZ cutter start, signed principal axis, radius in mm (not diameter), fixed positive depth. No through parameter.'
        : id==='multiPocket' ? 'Each world XYZ is a pocket cutter start center; shared positive depth cuts along signed axis. Width/height directions: Z axis X/Y, X axis Y/Z, Y axis Z/X. No automatic through or inferred surface.'
          : id==='multiBoss' ? 'Each world XYZ is a boss base center; shared radius and positive height extend along signed X/Y/Z. Each must fuse to one solid and add material. No bore.'
        : id === 'faceHole' ? 'World XYZ point on a planar face. Drill inward along the negative outward face normal. through computes depth from body bounds.'
          : `${topologyConvention} ${source.notes || source.description}` };
  const card={ ...contract, title: source.description, category: categoryFor(id), synonyms: names[id] || (mechanicalNames[id]?[mechanicalNames[id],id]:[id]),
    description: source.description, schemaHash: contractHash(contract), apiCompatibility: strict ? ['legacy', '2.0'] : ['legacy'],
    implementationStatus: 'implemented', availability: 'requires_browser', unavailableReason: null,
    strictContract: strict, v2Executable: strict, contractStatus: strict ? 'migrated' : 'advisory',
    outputSchema: { type: 'object', description: 'Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.',
      properties: { status: { type: 'string', enum: ['committed', 'no_change', 'failed', 'unknown'] },
        ...(id==='reliefShoulder'?{reliefReport:{type:'object',description:'Central seams G1; retained end caps G0; fixedRadius false; actual mechanism, width, end protection and material removal.'}}:{}),
        ...(id==='round'?{roundReport:{type:'object',description:'Read preview.scope or bodies[].roundReport: chosen mode, resolved exact parameters, control, world scope, attemptCount:1, endRoundingReport or blendReport.'}}:{}),
        ...(id==='roundEnd'?{endRoundingReport:{type:'object',description:'status rounded or rounded-with-inherited-creases; sourceProfileAngleDeg, maxJoinAngleDeg, maxHeadAngleDeg, residualSeams, depthMm, axis, direction, profileAxis, section dimensions/deviations, separate added/removed volumes, lengthChangeMm and targetDisplacementsMm.'}}:{}),
        ...(id==='rounding'?{roundingReport:{type:'object',description:'Preview receipt, getState().previewScope and committed body roundingReport expose the same report. v3 requires region; historical v1/v2 keep their original fields.',properties:{
          specVersion:{type:'integer',enum:[1,2,3]},region:{type:'object',required:['sourceBodyId','requestedEdgeIds','expandedEdgeIds','affectedFaceIds'],properties:{
            sourceBodyId:{type:'string',minLength:1,description:'The same current upstream source body as refs[0].'},
            ...Object.fromEntries(['requestedEdgeIds','expandedEdgeIds','affectedFaceIds'].map(key=>[key,{type:'array',uniqueItems:true,items:{type:'integer',minimum:0},description:'Topology IDs on sourceBodyId; never result-body indices.'}]))
          }}
        }}}:{})
      } },
    preconditions: [minRefs ? 'Use current referenced bodies in the same document instance and revision.' : 'Use explicit empty refs for independent creation.',
      ...(topology.has(id) ? ['Resolve topology against the current snapshot; do not reuse indices across revisions.'] : [])],
    postconditions: ['A successful modeling operation commits one undoable history transaction; invalid geometry must not commit.',
      ...(id==='rounding'?['Accepted automatic grinding exposes roundingReport.region with sourceBodyId, requestedEdgeIds, expandedEdgeIds and affectedFaceIds, the effective strength and measured local dimensions, candidate attempts, and every contact/inter-patch/terminal boundary plus material/locality evidence. Historical v1/v2 reports retain their semantics. Failed quality checks preserve the source and do not commit.']:[])],
    resultShapeTypes: ['meshReliefEdit','meshReliefPlate'].includes(id)?['rawMesh']:mechanicalResultTypes[id] || (['box','cylinder','sphere','cone','torus'].includes(id)?['solid']:id==='sketchProfile'||id==='profileOffset'||id==='profileRepair'?['wire','planar face']:['planeSection', 'faceBoundary'].includes(id) ? ['curve compound'] : id === 'extractFaces' ? ['face','compound of faces'] : id === 'extractShell' ? ['shell'] : id === 'fittedSurface' ? ['face']
      : ['advancedLoft', 'vectorProfile', 'sewFaces', 'surfaceTrim'].includes(id) ? ['solid', 'shell', 'face (operation-dependent)'] : special ? [] : ['solid', 'compound (operation-dependent)']),
    ...(mechanicalRefCounts[id]?{conditionalRefs:clone(mechanicalRefCounts[id])}:{}),
    consumesInputs: minRefs > 0 && preserves !== true, preservesInputs: preserves, createsResults: id !== 'remove',
    sideEffects: ['Updates active document history and derived view on commit.'], permissions: id==='reliefShoulder'?['Configured Services authorization; sends the selected source BRep to that endpoint.']:['Authorized local modeling session; no external upload.'],
    undoBehavior: 'One successful feature operation is one undo step. Legacy refresh is separately documented.',
    idempotency: strict ? 'v2 same documentInstanceId, at most 1000 in-memory receipts; refuses new commands at capacity without evicting old receipts. No durable or cross-reload guarantee.' : 'Legacy calls do not guarantee idempotency.',
    limits: strict ? ['Finite JSON values; no numeric strings, unknown fields, or implicit UI selection.'] : ['Schema advisory only; existing operation/kernel restrictions apply.'],
    knownUnsupportedCases: known, minimalExample: example, normalExample: id==='rounding'?{...clone(example),params:{...clone(example.params),strength:0.75}}:clone(example),
    invalidExamples: [{ params: invalidParams, errorCode: strict ? (id === 'box' ? 'PARAM_RANGE_INVALID' : ['fillet', 'chamfer'].includes(id) ? 'SELECTION_CONFLICT' : 'PARAM_SCHEMA_INVALID') : 'NOT_A_STRICT_V2_OPERATION',
      explanation: strict ? 'Rejected before kernel execution.' : 'v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement.' },
      ...(id==='cone'?[{params:{radius1:0,radius2:0,height:5},errorCode:'PARAM_RANGE_INVALID',explanation:'At least one radius must be positive; validation applies after the existing defaults.'}]:[]),
      ...(id==='torus'?[{params:{majorRadius:2,minorRadius:2},errorCode:'PARAM_RANGE_INVALID',explanation:'The tube radius must be smaller than the centerline radius.'}]:[])],
    errorCodes: ['PARAM_SCHEMA_INVALID', 'PARAM_RANGE_INVALID', 'UNKNOWN_OPERATION', 'OPERATION_VERSION_UNSUPPORTED', 'SCHEMA_MISMATCH', 'CAPABILITY_UNAVAILABLE', 'GEOMETRY_INVALID', 'SIZE_LIMIT',
      ...(id==='meshReliefPlate'?['RELIEF_PLATE_INVALID','RELIEF_EDIT_CAPACITY','RELIEF_THICKNESS']:[]),
      ...(id==='meshReliefEdit'?['RELIEF_FIELD_INVALID','RELIEF_PROFILE_INVALID','RELIEF_DEFORMATION_INVALID','RELIEF_SAMPLE_OUTSIDE','RELIEF_RESOLUTION_INSUFFICIENT','RELIEF_TARGET_OUTSIDE','RELIEF_CONSTRAINT_CONFLICT','RELIEF_LAYERS_INVALID']:[]),
      ...(id==='meshReliefEdit'?['RELIEF_SOURCE_UNSUPPORTED','RELIEF_EDIT_CAPACITY','RELIEF_EDIT_VERSION','RELIEF_SUPPORT_INVALID','RELIEF_REGION_INVALID','RELIEF_CONSTRAINT_INVALID','RELIEF_GEOMETRY_INVALID','RELIEF_NOT_CLOSED','RELIEF_SELECTION_AMBIGUOUS','RELIEF_BOUNDARY_CONFLICT','RELIEF_MULTIVALUED','RELIEF_THICKNESS_UNKNOWN','RELIEF_INTERSECTION','RELIEF_THICKNESS','STALE_REFERENCE','NO_CHANGE']:[]),
      ...(id==='reliefShoulder'?['SERVICES_CONFIG_REQUIRED','SERVICES_CAPABILITY_UNAVAILABLE','RELIEF_SHOULDER_UNSUPPORTED','SOURCE_HASH_MISMATCH','NATIVE_BRIDGE_FAILED']:[]),
      ...(id==='round'?['ROUND_SELECTION_AMBIGUOUS','END_ROUNDING_UNSUPPORTED','KERNEL_BUILD_FAILED','NO_CHANGE','STALE_REFERENCE']:[]),
      ...(id==='roundEnd'?['END_ROUNDING_UNSUPPORTED','KERNEL_BUILD_FAILED','NO_CHANGE']:[]),
      ...(topology.has(id) ? ['SELECTION_CONFLICT', 'STALE_REFERENCE', 'UNSAFE_LEGACY_REFERENCE'] : []),
      ...(id==='rounding'?['AMBIGUOUS_SELECTION','SCOPE_EXPANSION_REQUIRED','KERNEL_BUILD_FAILED','MATERIAL_CHECK_FAILED']:[]),
      ...(['hole', 'multiHole', 'multiPocket', 'faceHole'].includes(id) ? ['NO_MATERIAL_REMOVED'] : []),
      ...(id==='multiBoss'?['NO_MATERIAL_ADDED']:[]),...(mechanicalErrorCodes[id]||[])],
    recoveryActions: ['CORRECT_PARAMETERS', 'READ_STATE_AND_REPLAN', 'READ_TOOL_CONTRACT', 'NONE'],
    relatedTools: ['webcad_get_state_v2', 'webcad_query_geometry', strict ? 'webcad_execute_v2' : 'webcad_add_feature'],
    recipes: ['box', 'hole', 'multiHole'].includes(id) ? ['recipes.mounting-plate'] : [],
    testIds: id==='reliefShoulder'?['tests/operation-registry.test.mjs','tests/services-shoulder-native.test.mjs']:strict ? ['tests/operation-registry.test.mjs'] : [],
    ...(id === 'quickModel' ? { templates: Object.entries(QUICK_MODELS).map(([kind, definition]) => ({ kind,
      title: definition.labelEn || definition.label, description: definition.descriptionEn || definition.description,
      defaults: clone(definition.defaults), fields: clone(definition.fields),
      knownUnsupportedCases: ['Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid.'],
      minimalExample: { kind }, normalExample: { kind, ...clone(definition.defaults) } })) } : {}),
    verification: { contract: strict ? 'covered-by-contract-tests' : 'not_migrated', kernel: 'See test run report; card generation is not proof of kernel execution.' } };
  const details=clone(source.contract);
  details.params=Object.fromEntries(Object.entries(card.inputSchema.properties||{}).map(([key,schema])=>[key,details.params[key]||{meaning:schema.description||key,unit:schema.unit||'none',range:[schema.minimum??null,schema.maximum??null],default:{behavior:'omitted; source default'}}]));
  if(['meshHeightfieldRelief','meshBoolean'].includes(id))card.invalidExamples=details.examples.invalid;
  else if(!strict)card.invalidExamples=[{params:{__invalid:true},errorCode:'PARAM_SCHEMA_INVALID'}];
  details.examples={minimal:clone(card.minimalExample),normal:clone(card.normalExample),invalid:clone(card.invalidExamples)};
  details.errors=[...new Set([...card.errorCodes,...details.errors.map(e=>e.code)])].map(code=>details.errors.find(e=>e.code===code)||{code,when:'该操作schema或执行流程拒绝输入',recovery:'读取当前工具卡并修正参数或来源'});
  Object.assign(card,{contract:details,purpose:details.purpose,whenToUse:details.whenToUse,whenNotToUse:details.whenNotToUse,limits:details.limits,outputs:details.outputs,errors:details.errors,routing:details.routing,status:details.status,relatedTools:details.related,synonyms:[...new Set([...details.synonyms,...card.synonyms])],errorCodes:details.errors.map(e=>e.code),testIds:card.testIds.length?card.testIds:['tests/operation-contract.test.mjs']});
  return card;
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
  const schema = clone(op==='rounding'&&params.specVersion===1?legacyRoundingOperation.paramsSchema:op==='rounding'&&params.specVersion===2?legacyUnifiedRoundingOperation.paramsSchema:card.inputSchema);
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
    if(params.sharedFaces===true&&!(params.faceIds?.length>=2))contractError('SELECTION_CONFLICT','params.sharedFaces','sharedFaces=true requires at least two adjacent faceIds.');
  }
  try{validateSchema(schema, params);}catch(error){if(op==='meshHeightfieldRelief')error.code='HEIGHTFIELD_INVALID';if(op==='meshBoolean')error.code='MESH_BOOLEAN_INVALID';throw error;}
  if(op==='meshHeightfieldRelief'&&!params.heights?.importKey)heightfieldSamples(params);
  if(op==='chamfer'){
    const mode=params.mode||'equalDistance';
    if(mode==='twoDistances'&&!Object.hasOwn(params,'distance2'))contractError('PARAM_SCHEMA_INVALID','params.distance2','Two-distance chamfer requires distance2.');
    if(mode==='distanceAngle'&&!Object.hasOwn(params,'angleDeg'))contractError('PARAM_SCHEMA_INVALID','params.angleDeg','Distance-angle chamfer requires angleDeg.');
    if(mode!=='twoDistances'&&Object.hasOwn(params,'distance2')||mode!=='distanceAngle'&&Object.hasOwn(params,'angleDeg'))contractError('PARAM_SCHEMA_INVALID','params.mode','Only fields belonging to the selected chamfer mode are allowed.');
    if(mode==='equalDistance'&&(Object.hasOwn(params,'referenceFaceId')||params.flipDirection===true))contractError('PARAM_SCHEMA_INVALID','params.mode','Equal-distance mode has no asymmetric support direction.');
  }
  if(op==='holeWizard'){
    if(params.through!==true&&!Object.hasOwn(params,'depthMm'))contractError('PARAM_SCHEMA_INVALID','params.depthMm','Blind hole requires depthMm.');
    if(params.kind==='counterbore'&&(!Object.hasOwn(params,'recessDiameterMm')||!Object.hasOwn(params,'recessDepthMm')))contractError('PARAM_SCHEMA_INVALID','params','Counterbore requires opening diameter and recess depth.');
    if(params.kind==='countersink'&&(!Object.hasOwn(params,'recessDiameterMm')||!Object.hasOwn(params,'includedAngleDeg')))contractError('PARAM_SCHEMA_INVALID','params','Countersink requires opening diameter and included angle.');
    if(params.drillPoint==='angled'&&params.through===true)contractError('PARAM_SCHEMA_INVALID','params.drillPoint','Angled tip is only for blind holes.');
    if(params.drillPoint!=='angled'&&(Object.hasOwn(params,'drillPointAngleDeg')||Object.hasOwn(params,'depthReference')))contractError('PARAM_SCHEMA_INVALID','params.drillPoint','Tip angle/depth reference requires angled drillPoint.');
  }
  if(op==='rounding'&&params.specVersion===1){
    if(params.mode!=='constant'&&params.propagation!=='selected-only')contractError('PARAM_SCHEMA_INVALID','params.propagation','Tangent-chain propagation currently applies to constant R only.');
    const fields={edges:['edgeIds'],'face-boundaries':['faceIds'],'shared-faces':['faceAIds','faceBIds'],body:[]};
    const expected=fields[params.scope.kind],actual=Object.keys(params.scope).filter(key=>key!=='kind'&&key!=='excludeEdgeIds');
    if(expected.length!==actual.length||expected.some(key=>!actual.includes(key)))contractError('SELECTION_CONFLICT','params.scope','Scope kind must match exactly its topology selection fields.');
    if(params.scope.kind==='edges'&&params.scope.excludeEdgeIds?.some(id=>params.scope.edgeIds.includes(id)))contractError('SELECTION_CONFLICT','params.scope','An edge cannot be selected and excluded in the same request.');
    if(params.scope.kind==='shared-faces'&&params.scope.faceAIds.some(id=>params.scope.faceBIds.includes(id)))contractError('SELECTION_CONFLICT','params.scope','Support face groups must be disjoint.');
    if(params.mode==='constant'){
      if(!Object.hasOwn(params,'radiusMm')||Object.hasOwn(params,'laws')||Object.hasOwn(params,'widthAMm')||Object.hasOwn(params,'widthBMm'))contractError('PARAM_SCHEMA_INVALID','params.radiusMm','Constant mode requires radiusMm and forbids law and width fields.');
    }else if(params.mode==='variable'){
      if(!Object.hasOwn(params,'laws')||Object.hasOwn(params,'radiusMm')||Object.hasOwn(params,'widthAMm')||Object.hasOwn(params,'widthBMm'))contractError('PARAM_SCHEMA_INVALID','params.laws','Variable mode requires laws and forbids constant radius or width fields.');
      if(params.scope.kind!=='edges'||params.scope.edgeIds.length<1||params.scope.edgeIds.length>16||new Set(params.scope.edgeIds).size!==params.scope.edgeIds.length)contractError('SELECTION_CONFLICT','params.scope','Variable construction requires one to sixteen distinct ordered source edges.');
      const law=params.laws[0],ids=params.scope.edgeIds,chainId=ids.length===1?`edge:${ids[0]}`:`edges:${ids.join(',')}`;
      if(law.chainId!==chainId||law.stations[0].s!==0||law.stations.at(-1).s!==1||law.stations.some((item,i)=>i>0&&item.s<=law.stations[i-1].s))contractError('PARAM_SCHEMA_INVALID','params.laws','Law must identify the entire ordered edge chain and contain strictly increasing stations from s=0 to 1.');
    }else if(params.mode==='width'){
      if(!Object.hasOwn(params,'widthAMm')||!Object.hasOwn(params,'widthBMm')||Object.hasOwn(params,'radiusMm')||Object.hasOwn(params,'laws'))contractError('PARAM_SCHEMA_INVALID','params.widthAMm','Width mode requires both widths and forbids radius or law fields.');
      const oneEdge=params.scope.kind==='edges'&&params.scope.edgeIds.length===1;
      const facePair=params.scope.kind==='shared-faces'&&params.scope.faceAIds.length===1&&params.scope.faceBIds.length===1;
      if(!oneEdge&&!facePair)contractError('SELECTION_CONFLICT','params.scope','Width construction requires one edge or one explicitly ordered adjacent face pair.');
    }
  }
  const normalized={ ...clone(op==='rounding'&&params.specVersion!==3?{}:defaults[op]||{}), ...clone(params) };
  if(op==='holeWizard'&&normalized.drillPoint==='angled'){
    normalized.drillPointAngleDeg??=118;normalized.depthReference??='cylindricalLength';
  }
  if(op==='cone'&&normalized.radius1===0&&normalized.radius2===0)contractError('PARAM_RANGE_INVALID','params.radius2','At least one cone radius must be positive.');
  if(op==='torus'&&normalized.majorRadius<=normalized.minorRadius)contractError('PARAM_RANGE_INVALID','params.majorRadius','majorRadius must exceed minorRadius; use centerline radius and tube radius, not diameters.');
  if(op==='linearPattern'&&[normalized.dx,normalized.dy,normalized.dz].every(value=>value===0))contractError('PARAM_RANGE_INVALID','params','Linear pattern requires at least one nonzero step.');
  return normalized;
}

export function normalizeOperationPatch(op, previousParams, patch) {
  assertJsonValue(patch);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) contractError('PARAM_SCHEMA_INVALID', 'params', 'Expected a parameter patch object.');
  const merged = { ...previousParams, ...patch };
  if(op==='round'){
    if(Object.hasOwn(patch,'edgeIds')&&Object.hasOwn(patch,'faceIds'))contractError('SELECTION_CONFLICT','params','Choose edges or face boundaries, not both.');
    if(Object.hasOwn(patch,'edgeIds'))delete merged.faceIds;
    if(Object.hasOwn(patch,'faceIds'))delete merged.edgeIds;
  }
  if(op==='chamfer'&&patch.mode&&patch.mode!==previousParams.mode){
    if(patch.mode!=='twoDistances'&&!Object.hasOwn(patch,'distance2'))delete merged.distance2;
    if(patch.mode!=='distanceAngle'&&!Object.hasOwn(patch,'angleDeg'))delete merged.angleDeg;
    if(patch.mode==='equalDistance'){if(!Object.hasOwn(patch,'referenceFaceId'))delete merged.referenceFaceId;if(!Object.hasOwn(patch,'flipDirection'))delete merged.flipDirection;}
  }
  if(op==='holeWizard'&&(patch.drillPoint==='flat'||patch.through===true)){
    if(patch.through===true&&!Object.hasOwn(patch,'drillPoint'))merged.drillPoint='flat';
    if(!Object.hasOwn(patch,'drillPointAngleDeg'))delete merged.drillPointAngleDeg;if(!Object.hasOwn(patch,'depthReference'))delete merged.depthReference;
  }
  if(op==='rounding'&&patch.mode&&patch.mode!==previousParams.mode){
    if(patch.mode==='width'){delete merged.radiusMm;delete merged.laws;}
    else if(patch.mode==='variable'){delete merged.radiusMm;delete merged.widthAMm;delete merged.widthBMm;}
    else{delete merged.laws;delete merged.widthAMm;delete merged.widthBMm;}
  }
  if (op === 'fillet' || op === 'chamfer') {
    const scopes = Number(Object.hasOwn(patch, 'edgeIds')) + Number(Object.hasOwn(patch, 'faceIds')) + Number(patch.allEdges === true);
    if (scopes > 1) contractError('SELECTION_CONFLICT', 'params', 'One patch cannot select multiple edge scopes.');
    if (Object.hasOwn(patch, 'edgeIds')) { delete merged.faceIds; delete merged.allEdges; if(!Object.hasOwn(patch,'sharedFaces'))delete merged.sharedFaces; }
    else if (Object.hasOwn(patch, 'faceIds')) { delete merged.edgeIds; delete merged.allEdges; }
    else if (patch.allEdges === true) { delete merged.edgeIds; delete merged.faceIds; if(!Object.hasOwn(patch,'sharedFaces'))delete merged.sharedFaces; }
  }
  return normalizeOperationParams(op, merged);
}

export function validateOperationRefs(op, refs) {
  validateSchema(getOperation(op).refsSchema, refs, 'args.refs');
  return [...refs];
}

/** Documentation examples are parameter-checked; this is not a geometry test. */
export function validateOperationExample(op, params) {
  assertPatternExecution(op,params);
  const card = getOperation(op);
  return card.strictContract ? normalizeOperationParams(op, params) : validateSchema(card.inputSchema, params);
}
