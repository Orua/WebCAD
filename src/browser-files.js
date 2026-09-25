// Browser-only transfer boundary for the existing document file commands.
// File handles are selected by the UI before calling write; this module never opens a picker.
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_RESOURCES = 32;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const TTL_MS = 30 * 60 * 1000;

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function basename(name) {
  if (typeof name !== 'string' || !name || name.length > 255 || name === '.' || name === '..' ||
      /[\\/\x00-\x1f\x7f<>:"|?*]/u.test(name) || /\.\./u.test(name) || /[. ]$/u.test(name) ||
      /^[a-z][a-z0-9+.-]*:/iu.test(name)) {
    throw failure('NAME_INVALID', 'Expected a safe file basename, without a path or URL');
  }
  return name;
}

function bytesFromBase64(data) {
  // Repeated capture/group regexes overflow V8's stack on ordinary multi-MB
  // STEP projects. Scan flat characters and validate padding separately.
  if (typeof data !== 'string' || data.length > Math.ceil(MAX_BYTES / 3) * 4 + 4 ||
      data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(data) ||
      (data.includes('=') && !/^[A-Za-z0-9+/]*={1,2}$/u.test(data))) {
    throw failure('ASSET_INVALID', 'Invalid or oversized base64 file payload');
  }
  let binary;
  try { binary = atob(data); } catch { throw failure('ASSET_INVALID', 'Invalid base64 file payload'); }
  if (binary.length > MAX_BYTES) throw failure('SIZE_LIMIT', 'File exceeds browser resource limit');
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function base64FromBytes(bytes) {
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += 32766) {
    result += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 32766)));
  }
  // Chunk boundaries are multiples of three only when chunks are 32766 bytes.
  return result;
}

async function sha256(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}

function commandResult(result) {
  if (!result || typeof result !== 'object') throw failure('FILE_COMMAND_FAILED', 'File command returned no result');
  if (result.status === 'failed' || result.status === 'unknown') {
    const error = failure(result.error?.code || 'FILE_COMMAND_FAILED', result.error?.message || 'File command failed');
    error.result = result;
    throw error;
  }
  return result;
}

function inputBytes(data) {
  if (data instanceof Blob) return data.arrayBuffer().then(buffer => new Uint8Array(buffer));
  if (data instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(data.slice(0)));
  if (data instanceof Uint8Array) return Promise.resolve(new Uint8Array(data));
  throw failure('ASSET_INVALID', 'Expected File, Blob, ArrayBuffer or Uint8Array');
}

export function createBrowserFiles({ command, confirmSaved, capture } = {}) {
  if (typeof command !== 'function' || typeof confirmSaved !== 'function') {
    throw new TypeError('command and confirmSaved functions are required');
  }
  const resources = new Map();
  const writing = new Set();
  let usedBytes = 0;

  function purge() {
    const now = Date.now();
    for (const [id, resource] of resources) {
      if (resource.expiresAt <= now && !writing.has(id)) {
        resources.delete(id);
        usedBytes -= resource.size;
      }
    }
  }
  function requireResource(id) {
    purge();
    const resource = resources.get(id);
    if (!resource) throw failure('RESOURCE_EXPIRED', 'Unknown, expired or released file resource');
    return resource;
  }
  async function add({ kind, name, mime, bytes, context, saveSnapshot }) {
    basename(name);
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES) throw failure('SIZE_LIMIT', 'File exceeds browser resource limit');
    const hash = await sha256(bytes);
    purge();
    if (resources.size >= MAX_RESOURCES || usedBytes + bytes.length > MAX_TOTAL_BYTES) {
      throw failure('RESOURCE_LIMIT', 'Browser file resource capacity reached; release unused resources');
    }
    const resourceId = `${kind === 'input' ? 'ast' : 'art'}_${crypto.randomUUID().replaceAll('-', '')}`;
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    const descriptor = Object.freeze({ status: kind === 'input' ? 'registered' : 'generated',
      resourceId, name, mime: blob.type, size: blob.size, sha256: hash,
      expiresAt: Date.now() + TTL_MS, ...(context ? { context: Object.freeze({ ...context }) } : {}) });
    resources.set(resourceId, { ...descriptor, blob, kind, saveSnapshot });
    usedBytes += blob.size;
    return descriptor;
  }
  async function run(context, action, args = {}) {
    return commandResult(await command({ context, action, args }));
  }
  function inputFor(resourceId, extensions) {
    const source = requireResource(resourceId);
    if (source.kind !== 'input') throw failure('ASSET_INVALID', 'Only registered input can be opened or imported');
    const extension = source.name.split('.').pop().toLowerCase();
    if (extension === 'igs' || extension === 'iges') {
      throw failure('CAPABILITY_UNAVAILABLE', 'Static browser build has no local IGES converter');
    }
    if (!extensions.includes(extension)) throw failure('FORMAT_UNSUPPORTED', 'Unsupported input format');
    return source;
  }
  async function generated({ context, action, args, name }) {
    const result = await run(context, action, args);
    if (result.encoding !== 'base64') throw failure('ASSET_INVALID', 'Expected base64 from document file command');
    const revision = result.revision ?? result.context?.revision;
    if (revision !== context?.expectedRevision ||
        (result.documentId !== undefined && result.documentId !== context.documentId) ||
        (result.documentInstanceId !== undefined && result.documentInstanceId !== context.documentInstanceId)) {
      throw failure('REVISION_CONFLICT', 'Generated file does not match requested document snapshot');
    }
    const extension = result.extension;
    if (typeof extension !== 'string' || !/^[a-z0-9]{1,8}$/iu.test(extension)) {
      throw failure('ASSET_INVALID', 'File command returned an invalid extension');
    }
    const outputName = basename(name ?? `document.${extension}`);
    const savedContext = { sessionId: context.sessionId, documentId: context.documentId,
      documentInstanceId: context.documentInstanceId, revision };
    return add({ kind: 'output', name: outputName, mime: result.mime, bytes: bytesFromBase64(result.data),
      context: savedContext,
      saveSnapshot: action === 'save' ? { documentId: context.documentId,
        documentInstanceId: context.documentInstanceId, savedRevision: revision } : undefined });
  }

  return Object.freeze({
    capabilities() { return Object.freeze({ maxBytes: MAX_BYTES, maxResources: MAX_RESOURCES,
      maxTotalBytes: MAX_TOTAL_BYTES, ttlSeconds: TTL_MS / 1000,
      imports: ['step', 'stp', 'brep', 'brp'], exports: ['step', 'stl', 'brep', 'png'],
      native: 'webcad', iges: 'unavailable_in_static_browser', transport: 'in-page' }); },
    async register({ name, data, mime } = {}) {
      basename(name);
      if (data?.size > MAX_BYTES || data?.byteLength > MAX_BYTES) throw failure('SIZE_LIMIT', 'File exceeds browser resource limit');
      return add({ kind: 'input', name, mime: mime ?? data?.type, bytes: await inputBytes(data) });
    },
    async open({ context, resourceId } = {}) {
      const source = inputFor(resourceId, ['webcad', 'json']);
      const bytes = new Uint8Array(await source.blob.arrayBuffer());
      return run(context, 'open', { name: source.name, mime: source.mime, data: base64FromBytes(bytes) });
    },
    async import({ context, resourceId, placement, idempotencyKey } = {}) {
      const source = inputFor(resourceId, ['step', 'stp', 'brep', 'brp']);
      if(placement!==undefined&&(typeof idempotencyKey!=='string'||!idempotencyKey||idempotencyKey.length>128))throw failure('PARAM_SCHEMA_INVALID','Placed import requires an idempotencyKey');
      const bytes = new Uint8Array(await source.blob.arrayBuffer());
      return run(context, 'import', { name: source.name, mime: source.mime, data: base64FromBytes(bytes),...(placement===undefined?{}:{placement,idempotencyKey}) });
    },
    async previewInput({resourceId}={}){
      const source=inputFor(resourceId,['step','stp','brep','brp']);
      return {name:source.name,mime:source.mime,data:base64FromBytes(new Uint8Array(await source.blob.arrayBuffer()))};
    },
    new({ context } = {}) { return run(context, 'new'); },
    save({ context, name } = {}) { return generated({ context, action: 'save', name }); },
    export({ context, format, ids, name } = {}) {
      if (!['step', 'stl', 'brep', 'png'].includes(format)) throw failure('FORMAT_UNSUPPORTED', 'Unsupported export format');
      return generated({ context, action: 'export', args: { format, ...(ids === undefined ? {} : { ids }) }, name });
    },
    async read({ resourceId, as = 'blob' } = {}) {
      const resource = requireResource(resourceId);
      if (as === 'blob') return resource.blob;
      if (as === 'bytes') return new Uint8Array(await resource.blob.arrayBuffer());
      throw failure('PARAM_SCHEMA_INVALID', 'Expected blob or bytes');
    },
    download({ resourceId } = {}) {
      const resource = requireResource(resourceId);
      if (resource.kind !== 'output') throw failure('ASSET_INVALID', 'Only generated output can be downloaded');
      if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        throw failure('CAPABILITY_UNAVAILABLE', 'Browser download is unavailable');
      }
      const url = URL.createObjectURL(resource.blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = resource.name;
        anchor.hidden = true;
        document.body.append(anchor);
        try { anchor.click(); } finally { anchor.remove(); }
      } finally { setTimeout(() => URL.revokeObjectURL(url), 60_000); }
      return { status: 'download_initiated', downloadStarted: true, saved: false, resourceId };
    },
    async write({ resourceId, handle } = {}) {
      const resource = requireResource(resourceId);
      if (resource.kind !== 'output') throw failure('ASSET_INVALID', 'Only generated output can be written');
      if (writing.has(resourceId)) throw failure('RESOURCE_BUSY', 'File write already in progress');
      if (typeof FileSystemFileHandle === 'undefined' || !(handle instanceof FileSystemFileHandle) ||
          handle.kind !== 'file' || typeof handle.queryPermission !== 'function' ||
          typeof handle.createWritable !== 'function' || typeof handle.getFile !== 'function') {
        throw failure('HANDLE_REQUIRED', 'A selected FileSystemFileHandle is required');
      }
      writing.add(resourceId);
      try {
        if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
          throw failure('PERMISSION_REQUIRED', 'File handle needs read/write permission from a user gesture');
        }
        const writable = await handle.createWritable();
        try { await writable.write(resource.blob); await writable.close(); }
        catch (error) { try { await writable.abort?.(); } catch { /* Preserve the write error. */ } throw error; }
        const file = await handle.getFile();
        if (file.size !== resource.size || await sha256(await file.arrayBuffer()) !== resource.sha256) {
          throw failure('HASH_MISMATCH', 'Written file did not match the generated artifact');
        }
        let confirmation;
        if (resource.saveSnapshot) {
          try {
            confirmation = await confirmSaved({ ...resource.saveSnapshot, sha256: resource.sha256, size: resource.size });
          } catch (error) {
            confirmation = { saved: false, error: { code: error.code || 'SAVE_CONFIRMATION_FAILED', message: error.message } };
          }
        }
        return { status: 'write_verified', written: true, verified: true, resourceId, sha256: resource.sha256,
          ...(confirmation === undefined ? {} : { confirmation }) };
      } finally { writing.delete(resourceId); }
    },
    release({ resourceId } = {}) {
      if (writing.has(resourceId)) throw failure('RESOURCE_BUSY', 'File write already in progress');
      const resource = requireResource(resourceId);
      resources.delete(resourceId);
      usedBytes -= resource.size;
      return { released: true, resourceId };
    },
  });
}
