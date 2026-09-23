import { apiVersion, catalogHash, getOperation, listOperations, migratedOperationIds } from './operation-registry.js';
import { contractError, contractHash, validateSchema } from './contracts/operation-schema.js';

const string = (maxLength = 150) => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', properties, additionalProperties: false });
const version = '1.0.0';
const docs = {
  'api.query-geometry': `Read current state first. Input is {context:{sessionId,documentId,documentInstanceId,expectedRevision},bodyId,kind,filter,requireUnique?,limit?,cursor?}.
kind=face accepts surfaceType:"plane", normal:{direction:[x,y,z],sameDirection?:true,angleToleranceDeg?:0.1}, atExtreme:{axis:"X"|"Y"|"Z",side:"min"|"max",toleranceMm?:0.01}. Normals use world coordinates and topological orientation; open-shell outward direction is not guaranteed. atExtreme compares a principal-axis supporting plane to the body's exact bounds.
kind=edge accepts curveType:"line"|"circle", lengthRangeMm:{min?,max?}, radiusRangeMm:{min?,max?}, onFaceToken. Ranges need at least one bound and min<=max. onFaceToken must identify one current face; its boundaries include both outer and hole loops. loopRole is not implemented. Circle results include exact radiusMm and center. Cylindrical face filtering is not implemented; use circular edges to inspect hole radii/positions.
requireUnique defaults true; zero matches returns NO_MATCH, multiple matches returns AMBIGUOUS_SELECTION with candidates. No automatic first-match choice. requireUnique=false returns all-match count and paged items; limit defaults20/max100. selectionToken represents the entire matching index set, not just the visible page. Cursor binds the same snapshot, filter, uniqueness mode and limit; repeat these values when paging.
Tokens bind documentInstanceId, revision, bodyId, kind, exact BRep fingerprint and indices. Tokens are invalid after any revision change or document reload. At execution refs must match the selected body. Supported token operations: fillet/chamfer/shell/faceHole, feature.add only. Token plus explicit faceId/faceIds/edgeIds/allEdges conflicts. A current final-model token is not a stable historical reference.
While the Worker is busy or preview is active the query is rejected, never silently run against preview geometry. Limit 1000 tokens and 1000 pagination cursors per instance. Exhaustion rejects new queries, without silently reusing expired IDs; start a new document instance when appropriate.`,
  start: `WebCAD local API ${apiVersion}
The authoritative modeling kernel and document remain in the browser Worker. Static help requires no browser; execution requires a ready browser session. This is not a second Node CAD kernel.
Workflow: webcad_bootstrap -> webcad_list_sessions -> webcad_get_state_v2 -> webcad_search_tools -> webcad_get_tool -> webcad_query_geometry when topology is needed -> webcad_execute_v2 -> inspect/measure -> legacy webcad_export.
Never model with DOM clicks or simulated mouse input. UI regression automation is separate. Explicit refs never fall back to current UI selection.
Only box, hole, multiHole, faceHole, fillet, chamfer, shell have a migrated strict v2 parameter contract. Legacy operations remain documented and available through their existing entrypoints; schema metadata is not proof of kernel success.
Read api.execute-v2 for the command envelope, coordinates for units, errors for recovery, recipes.mounting-plate for a coordinate-driven recipe.
Cache key: trusted server identity + authorization scope + apiVersion + catalogHash + op ID/version. Check hashes on reconnection. Do not cache sessionId, revision, indices, selection tokens or unchecked body IDs as permanent facts. Repository caches belong in agent/cache/webcad/.`,
  coordinates: `Lengths are millimetres; angles degrees; volume mm^3; scale dimensionless. Coordinates are right-handed world XYZ unless the individual tool states otherwise.
box width/depth/height means positive X/Y/Z extent from [0,0,0]. It does not center at the origin.
hole and multiHole use radius, never diameter. multiHole.points are 1..100 world [x,y,z] cutter START points, not local XY. Depth is positive; direction is 1 or -1 along axis X/Y/Z, default Z/+1. These tools do not accept through.
faceHole.point is world XYZ on a planar face. through=true computes sufficient depth from the body bounds; otherwise positive depth is required. Face direction comes from exact topology.
Face and edge indices are zero-based within one body at one snapshot. No index is a stable semantic name. Prefer query selectionToken for feature.add. Current-model tokens cannot retarget a historical feature.edit.
transform rotates/scales about world origin, applies rotations X/Y/Z, then translates; absolute positioning sets final bounding-box center. Its legacy contract is unchanged.
slot.angle is degrees, independent of the sign of cut direction.`,
  'api.execute-v2': `The execute request is a strict JSON object:
{context:{sessionId,documentId,documentInstanceId,expectedRevision},idempotencyKey,action,args}
All IDs come from the current session/state. Set expectedRevision to the revision returned by get_state_v2 or a committed result; never guess or increment it locally.
feature.add args: required op,opVersion,schemaHash,params,refs; optional name,selectionToken. Read exact opVersion/schemaHash from get_tool. Independent creation uses explicit refs:[].
feature.edit args: required featureId,opVersion,schemaHash,params; optional name. params is a patch. It cannot change op/id/refs or remove arbitrary fields. The merged complete params are checked. fillet/chamfer switching: a patch with nonempty edgeIds removes the old allEdges; allEdges=true removes old edgeIds; both in a patch conflict. Amount can be retained from the prior params.
feature.remove args:{bodyIds:[current IDs]}; unique nonempty current bodies only. history.undo/history.redo/document.refresh args:{}.
feature.add selectionToken is supported only by faceHole,fillet,chamfer,shell. It conflicts with explicit faceId/faceIds/edgeIds/allEdges. Validate user input first, resolve token at the current snapshot, then validate full kernel params. feature.edit does not accept tokens; unsafe downstream index references fail UNSAFE_LEGACY_REFERENCE.
Success/failure/unknown and commitState are separate. A committed operation must not be reported rolled back because a late cancellation or view update failed. A transport failure can mean unknown, not not_committed. Legacy response shapes remain unchanged.
Idempotency is same documentInstanceId, in-memory and bounded for M1. Identical retries reuse the receipt; reusing a key for different commands fails. The capacity is 1000 receipts per instance; new commands are rejected at capacity and existing receipts are not evicted. Restart or reload does not provide durable receipt guarantees.
No implicit batch, preview lifecycle, native file save/open or durable receipt is promised by M1. Legacy export remains the export entrypoint.`,
  errors: `Errors contain code,path,message,retryable,recoveryAction. A failure before commit has commitState=not_committed; unknown outcomes must preserve unknown status and cannot claim rollback.
PARAM_SCHEMA_INVALID / PARAM_RANGE_INVALID: correct the named field without silently changing requested dimensions.
UNKNOWN_OPERATION / OPERATION_VERSION_UNSUPPORTED / SCHEMA_MISMATCH / CAPABILITY_UNAVAILABLE: READ_TOOL_CONTRACT and check current runtime capabilities.
DOCUMENT_MISMATCH / INSTANCE_MISMATCH / REVISION_CONFLICT / STALE_REFERENCE / UNSAFE_LEGACY_REFERENCE: READ_STATE_AND_REPLAN; do not retry stale IDs or guess another face.
NO_MATCH / AMBIGUOUS_SELECTION / SELECTION_CONFLICT: refine or correct selection; never silently choose the first match.
GEOMETRY_INVALID / NO_MATERIAL_REMOVED: review geometry and explicit dimensions. No automatic radius or size reduction.
PREVIEW_ACTIVE / RESOURCE_LIMIT / IDEMPOTENCY_KEY_REUSED: resolve the reported constraint; do not change idempotency keys merely to bypass an uncertain result.
PERSISTENCE_FAILED / RESULT_UNKNOWN: distinguish committed memory from durable storage or unknown delivery. No durable guarantee in M1. When no automatic action exists, recoveryAction=NONE.`,
  'recipes.mounting-plate': `Coordinate recipe, version ${version}. Resolve dynamic IDs from each actual result.
1. In an authorized empty ready document, read state and get_tool for box and multiHole.
2. feature.add box params:{width:50,depth:30,height:3},refs:[]. Use its current opVersion/schemaHash, context and a new semantic-command idempotencyKey.
3. Read committed revision/body ID. feature.add multiHole params:{radius:2,depth:5,axis:"Z",direction:-1,points:[[5,5,4],[45,5,4],[5,25,4],[45,25,4]]},refs:[the actual plate body ID].
4. Inspect exact B-Rep dimensions and volume. Expected extents 50 x 30 x 3 mm, four holes diameter 4 mm; volume = 4500 - 48*pi mm^3. The starts at Z=4 and depth 5 reach Z=-1; this uses fixed depth, not multiHole.through.
5. To modify use feature.edit with the actual featureId, same operation contract, explicit parameter patch and new context/key. Measure the changed result.
6. Export via webcad_export. Client must save returned bytes and verify STEP readback. A recipe or an export response alone is not a verified saved file or a completed acceptance test.`,
};
const docAliases = {
  'webcad://docs/start': 'start', 'webcad://docs/coordinates': 'coordinates',
  'webcad://docs/errors': 'errors', 'webcad://docs/api.execute-v2': 'api.execute-v2',
  'webcad://recipes/mounting-plate/1.0.0': 'recipes.mounting-plate',
};
export const docsHash = contractHash({ docs, cards: listOperations() });

export function bootstrap({ serverInstanceId = null, buildId = 'unreported', browserReady = false } = {}) {
  return { product: 'WebCAD', buildId, apiVersion, serverInstanceId, catalogHash, docsHash,
    mode: 'local-node-bridge-browser-worker', units: { length: 'mm', angle: 'degrees', volume: 'mm^3', scale: 'dimensionless' },
    entrypoints: { docs: ['start', 'coordinates', 'api.execute-v2', 'api.query-geometry', 'errors', 'recipes.mounting-plate'],
      nextTools: ['webcad_list_sessions', 'webcad_get_state_v2', 'webcad_search_tools', 'webcad_get_tool'],
      read: 'webcad_read_docs', execute: 'webcad_execute_v2', export: 'webcad_export' },
    limits: { operationIdLength: 60, idLength: 150, nameLength: 120, searchLength: 500, idempotencyKeyLength: 128,
      cursorLength: 2048, searchLimit: 50, docsLimitChars: 16000, receiptsPerInstance: 1000, selectionTokensPerInstance: 1000, queryCursorsPerInstance: 1000, migratedOperations: [...migratedOperationIds] },
    idempotencyGuarantee: { scope: 'same documentInstanceId; in-memory bounded receipts', durable: false,
      survivesReload: false, survivesBridgeReconnect: 'only while the same browser instance and cached receipt remain alive' },
    capabilities: { staticDocumentation: 'available', modeling: browserReady ? 'available' : 'not_ready',
      v2Operations: [...migratedOperationIds], allOtherOperations: 'legacy entrypoints only; advisory schemas',
      fileLifecycleV2: 'unavailable', persistentReceipts: 'unavailable' } };
}

function cursorOffset(cursor, scope) {
  if (cursor === undefined) return 0;
  const [tag, offset, extra] = cursor.split(':');
  if (tag !== contractHash(scope).slice(7) || extra !== undefined || !/^\d+$/.test(offset || '')) {
    contractError('PARAM_SCHEMA_INVALID', 'cursor', 'Cursor does not match this query/document.', 'READ_TOOL_CONTRACT');
  }
  const result = Number(offset);
  if (!Number.isSafeInteger(result)) contractError('PARAM_RANGE_INVALID', 'cursor', 'Invalid cursor offset.');
  return result;
}
const cursorAt = (scope, offset) => `${contractHash(scope).slice(7)}:${offset}`;

export function searchTools(input, runtime = {}) {
  validateSchema({ ...object({ query: { type: 'string', maxLength: 500 }, category: string(60), limit: { type: 'integer', minimum: 1, maximum: 50 },
    cursor: string(2048), sessionId: string() }), required: ['query'] }, input, 'input');
  const { query, category, sessionId, limit = 10, cursor } = input;
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const scope = { catalogHash, query, category: category || null, sessionId: sessionId || null };
  const offset = cursorOffset(cursor, scope);
  const matches = listOperations().filter(card => card.id !== 'import' && card.id !== 'remove')
    .filter(card => !category || card.category === category)
    .filter(card => words.every(word => `${card.id} ${card.title} ${card.synonyms.join(' ')} ${card.description}`.toLocaleLowerCase().includes(word)));
  if (offset > matches.length) contractError('PARAM_RANGE_INVALID', 'cursor', 'Cursor offset exceeds the result count.');
  return { items: matches.slice(offset, offset + limit).map(card => ({ id: card.id, title: card.title, version: card.version,
    schemaHash: card.schemaHash, description: card.description, category: card.category,
    implementationStatus: card.implementationStatus, v2Executable: card.v2Executable,
    runtimeAvailability: !sessionId ? 'unknown' : runtime.browserReady === true ? 'available' : runtime.browserReady === false ? 'not_ready' : 'unknown' })),
    nextCursor: offset + limit < matches.length ? cursorAt(scope, offset + limit) : null, catalogHash };
}

export function getTool(input) {
  validateSchema({ ...object({ id: string(60), version: string(60) }), required: ['id'] }, input, 'input');
  const card = getOperation(input.id);
  if (input.version !== undefined && input.version !== card.version) contractError('OPERATION_VERSION_UNSUPPORTED', 'version', 'Requested operation version is not registered.', 'READ_TOOL_CONTRACT');
  return { ...card, docsHash: contractHash(card), runtimeAvailability: 'unknown' };
}

export function readDocs(input) {
  validateSchema({ ...object({ docId: string(), version: string(60), cursor: string(2048),
    limitChars: { type: 'integer', minimum: 1000, maximum: 16000 } }), required: ['docId'] }, input, 'input');
  const id = Object.hasOwn(docAliases, input.docId) ? docAliases[input.docId] : input.docId;
  let text, actualVersion = version;
  if (Object.hasOwn(docs, id)) text = docs[id];
  else {
    const match = /^webcad:\/\/operations\/([A-Za-z][A-Za-z0-9]*)\/([^/]+)$/.exec(id);
    if (!match) contractError('PARAM_SCHEMA_INVALID', 'docId', 'Unknown documentation ID; filesystem paths are not accepted.', 'READ_TOOL_CONTRACT');
    const card = getTool({ id: match[1], version: match[2] });
    text = JSON.stringify(card, null, 2); actualVersion = card.version;
  }
  if (input.version !== undefined && input.version !== actualVersion) contractError('OPERATION_VERSION_UNSUPPORTED', 'version', 'Requested documentation version is not registered.', 'READ_TOOL_CONTRACT');
  const hash = contractHash({ docId: id, version: actualVersion, text });
  const scope = { id, hash }, offset = cursorOffset(input.cursor, scope), limit = input.limitChars ?? 8000;
  if (offset > text.length) contractError('PARAM_RANGE_INVALID', 'cursor', 'Cursor offset exceeds the document length.');
  return { docId: id, version: actualVersion, docsHash: hash, text: text.slice(offset, offset + limit),
    nextCursor: offset + limit < text.length ? cursorAt(scope, offset + limit) : null };
}

export function listDocumentation() { return Object.keys(docs).sort().map(docId => ({ docId, version })); }
