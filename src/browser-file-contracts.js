// Shared public-page argument names. Binary payloads and native file handles
// remain host objects; they must not pass through a JSON geometry validator.
export const FILE_ARGUMENT_KEYS=Object.freeze(Object.fromEntries(Object.entries({
  capabilities:[],register:['name','data','mime'],new:['context'],open:['context','resourceId'],
  import:['context','resourceId','placement','idempotencyKey'],save:['context','name'],
  export:['context','format','ids','name'],read:['resourceId','as'],download:['resourceId'],
  write:['resourceId','handle'],confirmWritten:['resourceId','size','sha256'],release:['resourceId'],
}).map(([key,value])=>[key,Object.freeze(value)])));
export const FILE_LIMITS=Object.freeze({maxBytes:20*1024*1024,maxResources:32,maxTotalBytes:64*1024*1024,ttlSeconds:1800});
export const CONTEXTUAL_FILE_METHODS=Object.freeze(['new','open','import','save','export']);
const commandErrors=['CAPABILITY_UNAVAILABLE','REVISION_CONFLICT','INSTANCE_MISMATCH','DOCUMENT_MISMATCH','UNSAVED_REPLACEMENT','FILE_COMMAND_FAILED','SIZE_LIMIT'];
const resourceErrors=['RESOURCE_EXPIRED','ASSET_INVALID'];
const generatedErrors=[...commandErrors,'ASSET_INVALID','NAME_INVALID','RESOURCE_LIMIT'];
export const FILE_ERROR_CODES=Object.freeze(Object.fromEntries(Object.entries({
  capabilities:[],register:['NAME_INVALID','ASSET_INVALID','SIZE_LIMIT','RESOURCE_LIMIT'],
  new:commandErrors,open:[...commandErrors,...resourceErrors,'FORMAT_UNSUPPORTED'],
  import:[...commandErrors,...resourceErrors,'FORMAT_UNSUPPORTED','IDEMPOTENCY_KEY_REUSED'],
  save:generatedErrors,export:[...generatedErrors,'FORMAT_UNSUPPORTED'],
  read:['RESOURCE_EXPIRED'],download:[...resourceErrors,'CAPABILITY_UNAVAILABLE'],
  write:[...resourceErrors,'RESOURCE_BUSY','HANDLE_REQUIRED','PERMISSION_REQUIRED','HASH_MISMATCH','SAVE_CONFIRMATION_FAILED'],
  confirmWritten:[...resourceErrors,'HASH_MISMATCH','INSTANCE_MISMATCH','REVISION_CONFLICT','SAVE_CONFIRMATION_FAILED'],
  release:['RESOURCE_EXPIRED','RESOURCE_BUSY'],
}).map(([key,value])=>[key,Object.freeze([...new Set(['PARAM_SCHEMA_INVALID',...value])])])));
