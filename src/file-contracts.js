import { contractHash, contractError } from './contracts/operation-schema.js';

const id = { type: 'string', minLength: 1, maxLength: 150 };
const context = { type: 'object', additionalProperties: false, required: ['sessionId', 'documentId', 'documentInstanceId', 'expectedRevision'], properties: {
  sessionId: id, documentId: id, documentInstanceId: id, expectedRevision: { type: 'integer', minimum: 0 }
} };
const hash = { type: 'string', pattern: '^[a-fA-F0-9]{64}$' };
const uniqueIds = { type: 'array', items: id, minItems: 1, maxItems: 200, uniqueItems: true };
const exampleContext = { sessionId: 'example-session', documentId: 'example-document', documentInstanceId: 'example-instance', expectedRevision: 0 };
const strict = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });

const examples = {
  file_capabilities: {},
  register_asset: { name: 'part.step', size: 0, sha256: '0'.repeat(64) },
  new_document: { context: exampleContext },
  open_asset: { context: exampleContext, assetId: `ast_${'0'.repeat(48)}` },
  import_asset: { context: exampleContext, assetId: `ast_${'0'.repeat(48)}` },
  save_document: { context: exampleContext },
  export_artifact: { context: exampleContext, format: 'step' },
  confirm_artifact_written: { artifactId: `art_${'0'.repeat(48)}`, size: 0, sha256: '0'.repeat(64) },
  release_resource: { resourceId: `ast_${'0'.repeat(48)}` }
};
const outputSchema = {
  type: 'object', additionalProperties: true,
  properties: {
    status: { type: 'string', enum: ['read', 'registered', 'committed', 'generated', 'written', 'released', 'failed', 'unknown'] },
    commitState: { type: 'string', enum: ['not_committed', 'unknown', 'committed'] },
    error: { type: 'object', additionalProperties: true, properties: {
      code: { type: 'string' }, path: { type: 'string' }, message: { type: 'string' }, retryable: { type: 'boolean' }, recoveryAction: { type: 'string' }
    }, required: ['code', 'message', 'retryable', 'recoveryAction'] },
    context: { type: 'object', additionalProperties: true }, requestId: { type: 'string' },
    assetId: { type: 'string', pattern: '^ast_[a-f0-9]{48}$' }, artifactId: { type: 'string', pattern: '^art_[a-f0-9]{48}$' },
    resourceId: { type: 'string', pattern: '^(ast|art)_[a-f0-9]{48}$' }, name: { type: 'string' }, mime: { type: 'string' },
    size: { type: 'integer', minimum: 0, maximum: 20 * 1024 * 1024 }, sha256: hash, expiresAt: { type: 'integer' },
    uploadUrl: { type: 'string' }, uploadToken: { type: 'string' }, downloadUrl: { type: 'string' }, downloadToken: { type: 'string' },
    generated: { type: 'boolean' }, downloaded: { type: 'boolean' }, written: { type: 'boolean' },
    writeConfirmation: { type: 'string', const: 'client_reported_verified_write' }, documentSaved: { type: 'boolean' }, acknowledgement: { type: 'object', additionalProperties: true },
    maxBytes: { type: 'integer' }, ttlSeconds: { type: 'integer' }, imports: { type: 'array', items: { type: 'string' } },
    exports: { type: 'array', items: { type: 'string' } }, native: { type: 'string' }, iges: { type: 'object', additionalProperties: true }, authorization: { type: 'string' },
    format: { type: 'string' }, revision: { type: 'integer', minimum: 0 }
  }
};

export const fileToolDefinitions = {
  file_capabilities: { description: 'Read public file workflow capabilities, limits, TTL, supported formats, and client transfer requirements.', inputSchema: strict({}) },
  register_asset: { description: 'Register expected local file metadata and receive a bounded one-use raw-byte upload capability. The upload PUT response returns assetId.', inputSchema: strict({
    name: { type: 'string', minLength: 1, maxLength: 255 }, size: { type: 'integer', minimum: 0, maximum: 20 * 1024 * 1024 }, sha256: hash,
    mime: { type: 'string', maxLength: 127 }
  }, ['name', 'size', 'sha256']) },
  new_document: { description: 'Create a new empty document for the explicitly selected current document instance; refuses unsaved replacement.', inputSchema: strict({ context }) },
  open_asset: { description: 'Open a registered .webcad or .json project asset. Dirty document replacement is always refused.', inputSchema: strict({ context, assetId: { type: 'string', pattern: '^ast_[a-f0-9]{48}$' } }) },
  import_asset: { description: 'Append a registered STEP, BREP, or IGES asset to the current document; .webcad assets are not importable.', inputSchema: strict({ context, assetId: { type: 'string', pattern: '^ast_[a-f0-9]{48}$' } }) },
  save_document: { description: 'Generate a self-contained .webcad artifact pinned to the supplied current document revision.', inputSchema: strict({ context }) },
  export_artifact: { description: 'Generate a STEP, STL, BREP, or PNG artifact pinned to the supplied revision.', inputSchema: strict({ context,
    format: { type: 'string', enum: ['step', 'stl', 'brep', 'png'] }, ids: uniqueIds
  }, ['context', 'format']) },
  confirm_artifact_written: { description: 'Record the client assertion that a downloaded artifact was verified and written inside its authorized directory. The server cannot prove disk fsync.', inputSchema: strict({
    artifactId: { type: 'string', pattern: '^art_[a-f0-9]{48}$' }, size: { type: 'integer', minimum: 0, maximum: 20 * 1024 * 1024 }, sha256: hash
  }) },
  release_resource: { description: 'Release an owned temporary asset or artifact resource before its TTL expires.', inputSchema: strict({ resourceId: { type: 'string', pattern: '^(ast|art)_[a-f0-9]{48}$' } }) }
};

const cardFor = (suffix, definition) => {
  const inputSchema = structuredClone(definition.inputSchema);
  const card = {
    id: `file.${suffix}`, toolName: `webcad_${suffix}`, version: '1.0.0', title: suffix.replaceAll('_', ' '),
    category: 'document', synonyms: ['file', 'asset', 'artifact', suffix.replaceAll('_', ' ')],
    description: definition.description, schemaHash: contractHash(inputSchema), inputSchema,
    outputSchema,
    refsSchema: { supported: false }, implementationStatus: 'implemented', v2Executable: false,
    apiCompatibility: ['mcp-file-1.0'], limits: ['Assets and artifacts are limited to 20 MiB; temporary resources expire after 1800 seconds.'],
    errorCodes: ['SIZE_LIMIT', 'RESOURCE_EXPIRED', 'HASH_MISMATCH', 'UNSAVED_REPLACEMENT', 'REVISION_CONFLICT', 'INSTANCE_MISMATCH', 'FORMAT_UNSUPPORTED', 'OCP_UNAVAILABLE'],
    relatedTools: ['webcad_bootstrap', 'webcad_get_state_v2', 'webcad_read_docs'], recipes: ['recipe.file-workflow'],
    permissions: ['Authorized local session and client-controlled file-transfer adapter; no arbitrary server filesystem path.'],
    minimalExample: structuredClone(examples[suffix]), normalExample: structuredClone(examples[suffix]),
    knownUnsupportedCases: ['No cross-restart exactly-once guarantee.', 'Server cannot independently prove client filesystem durability or fsync.']
  };
  card.preconditions = ['File operations requiring a document need the current complete context tuple; example IDs must be replaced with values from the active session.'];
  card.schemaHash = contractHash(card);
  return card;
};

const cards = Object.fromEntries(Object.entries(fileToolDefinitions).map(([suffix, definition]) => [suffix, cardFor(suffix, definition)]));
export const fileCatalogHash = contractHash(Object.values(cards).map(({ id, version, schemaHash }) => ({ id, version, schemaHash })));

export function listFileTools() { return Object.values(cards).map(card => structuredClone(card)); }
export function getFileTool(id) {
  const suffix = id.startsWith('webcad_') ? id.slice('webcad_'.length) : id.startsWith('file.') ? id.slice(5) : id;
  if (!Object.hasOwn(cards, suffix)) contractError('UNKNOWN_OPERATION', 'id', `Unknown file tool: ${id}`, 'READ_TOOL_CONTRACT');
  return structuredClone(cards[suffix]);
}
