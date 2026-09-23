import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const NAME_LIMIT = 255;
const MIME_LIMIT = 127;
const MAX_UPLOADS = 128;
const MAX_RESOURCES = 128;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeLabel(value, fallback, limit) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  // This is display metadata only. It is never used to construct a disk path.
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) || fallback;
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function asBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw failure('INVALID_BYTES', 'Expected Buffer or Uint8Array bytes.');
}

/**
 * Bounded, process-local asset/artifact storage.
 *
 * `root` is mandatory and is created if absent; existing contents are never
 * enumerated or removed. Only opaque random ids form disk paths. Upload tokens
 * and resource metadata exist only in this process and expire after ttlMs.
 */
export class ArtifactStore {
  #root;
  #rootRealPath;
  #rootIdentity;
  #maxBytes;
  #maxUploads;
  #maxResources;
  #maxTotalBytes;
  #storedBytes = 0;
  #ttlMs;
  #clock;
  #uploads = new Map();
  #records = new Map();
  #writeTail = Promise.resolve();

  constructor({
    root,
    maxBytes = 20 * 1024 * 1024,
    maxUploads = MAX_UPLOADS,
    maxResources = MAX_RESOURCES,
    maxTotalBytes = MAX_TOTAL_BYTES,
    ttlMs = 30 * 60 * 1000,
    clock = Date.now,
  } = {}) {
    if (typeof root !== 'string' || !root.trim()) throw new TypeError('An explicit storage root is required.');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive safe integer.');
    if (!Number.isSafeInteger(maxUploads) || maxUploads < 1 || maxUploads > MAX_UPLOADS) throw new TypeError(`maxUploads must be between 1 and ${MAX_UPLOADS}.`);
    if (!Number.isSafeInteger(maxResources) || maxResources < 1 || maxResources > MAX_RESOURCES) throw new TypeError(`maxResources must be between 1 and ${MAX_RESOURCES}.`);
    if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > MAX_TOTAL_BYTES || maxTotalBytes < maxBytes) {
      throw new TypeError(`maxTotalBytes must be between maxBytes and ${MAX_TOTAL_BYTES}.`);
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new TypeError('ttlMs must be a positive safe integer.');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function.');
    this.#root = path.resolve(root);
    this.#maxBytes = maxBytes;
    this.#maxUploads = maxUploads;
    this.#maxResources = maxResources;
    this.#maxTotalBytes = maxTotalBytes;
    this.#ttlMs = ttlMs;
    this.#clock = clock;
  }

  get maxBytes() { return this.#maxBytes; }

  async initialize() {
    await fs.mkdir(this.#root, { recursive: true });
    const [resolved, details] = await Promise.all([fs.realpath(this.#root), fs.stat(this.#root)]);
    const identity = `${details.dev}:${details.ino}`;
    if (this.#rootRealPath && resolved !== this.#rootRealPath) throw failure('ROOT_CHANGED', 'Storage root real path changed after initialization.');
    if (this.#rootIdentity && identity !== this.#rootIdentity) throw failure('ROOT_CHANGED', 'Storage root directory changed after initialization.');
    this.#rootRealPath = resolved;
    this.#rootIdentity = identity;
    return this;
  }

  /** Issue a one-use upload capability. Expected size/hash are optional guards. */
  createUpload({ name, mime = 'application/octet-stream', size, sha256 } = {}) {
    if (this.#uploads.size >= this.#maxUploads) throw failure('UPLOAD_LIMIT', `At most ${this.#maxUploads} uploads may be pending.`);
    if (size !== undefined && (!Number.isSafeInteger(size) || size < 0 || size > this.#maxBytes)) {
      throw failure('SIZE_LIMIT', `Upload size must be between 0 and ${this.#maxBytes} bytes.`);
    }
    if (sha256 !== undefined && (typeof sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(sha256))) {
      throw failure('INVALID_HASH', 'sha256 must contain 64 hexadecimal characters.');
    }
    const uploadToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = this.#clock() + this.#ttlMs;
    this.#uploads.set(uploadToken, {
      name: safeLabel(name, 'upload.bin', NAME_LIMIT),
      mime: safeLabel(mime, 'application/octet-stream', MIME_LIMIT),
      size,
      sha256: sha256?.toLowerCase(),
      expiresAt,
    });
    return { uploadToken, expiresAt, maxBytes: this.#maxBytes };
  }

  /** Validate an upload capability before an HTTP handler reads its request body. */
  verifyUpload(uploadToken) {
    const pending = this.#uploads.get(uploadToken);
    if (!pending) throw failure('UPLOAD_TOKEN_INVALID', 'Upload token is invalid or already used.');
    if (pending.expiresAt <= this.#clock()) throw failure('RESOURCE_EXPIRED', 'Upload token has expired.');
    if (this.#records.size >= this.#maxResources) throw failure('RESOURCE_LIMIT', `At most ${this.#maxResources} resources may be stored.`);
    if (pending.size !== undefined && this.#storedBytes + pending.size > this.#maxTotalBytes) {
      throw failure('TOTAL_SIZE_LIMIT', `Stored resources may use at most ${this.#maxTotalBytes} bytes in total.`);
    }
    if (pending.size === undefined && this.#storedBytes >= this.#maxTotalBytes) {
      throw failure('TOTAL_SIZE_LIMIT', `Stored resources may use at most ${this.#maxTotalBytes} bytes in total.`);
    }
    return {
      name: pending.name,
      mime: pending.mime,
      size: pending.size,
      sha256: pending.sha256,
      expiresAt: pending.expiresAt,
      maxBytes: this.#maxBytes,
    };
  }

  /** Consume a capability once, atomically persist uploaded bytes, return asset metadata. */
  async acceptUpload(uploadToken, value) {
    const pending = this.#uploads.get(uploadToken);
    if (!pending) throw failure('UPLOAD_TOKEN_INVALID', 'Upload token is invalid or already used.');
    this.#uploads.delete(uploadToken); // Also prevents concurrent reuse while disk I/O yields.
    if (pending.expiresAt <= this.#clock()) throw failure('RESOURCE_EXPIRED', 'Upload token has expired.');
    return this.#persist('asset', pending, value);
  }

  /** Persist server-generated artifact bytes without a client upload token. */
  async createArtifact(value, { name = 'artifact.bin', mime = 'application/octet-stream' } = {}) {
    return this.#persist('artifact', {
      name: safeLabel(name, 'artifact.bin', NAME_LIMIT),
      mime: safeLabel(mime, 'application/octet-stream', MIME_LIMIT),
      expiresAt: this.#clock() + this.#ttlMs,
    }, value);
  }

  #persist(kind, metadata, value) {
    const operation = this.#writeTail.then(() => this.#persistExclusive(kind, metadata, value));
    this.#writeTail = operation.catch(() => {});
    return operation;
  }

  async #persistExclusive(kind, metadata, value) {
    const bytes = asBytes(value);
    if (bytes.byteLength > this.#maxBytes) throw failure('SIZE_LIMIT', `File exceeds the ${this.#maxBytes} byte limit.`);
    if (metadata.size !== undefined && metadata.size !== bytes.byteLength) {
      throw failure('SIZE_MISMATCH', `Declared ${metadata.size} bytes but received ${bytes.byteLength}.`);
    }
    const sha256 = digest(bytes);
    if (metadata.sha256 && metadata.sha256 !== sha256) throw failure('HASH_MISMATCH', 'Uploaded bytes do not match the declared SHA-256.');
    await this.#ensureRoot();
    if (this.#records.size >= this.#maxResources) throw failure('RESOURCE_LIMIT', `At most ${this.#maxResources} resources may be stored.`);
    if (this.#storedBytes + bytes.byteLength > this.#maxTotalBytes) {
      throw failure('TOTAL_SIZE_LIMIT', `Stored resources may use at most ${this.#maxTotalBytes} bytes in total.`);
    }
    const id = `${kind === 'asset' ? 'ast' : 'art'}_${crypto.randomBytes(24).toString('hex')}`;
    const finalPath = path.join(this.#root, `${id}.bin`);
    const temporaryPath = path.join(this.#root, `.${id}.${crypto.randomBytes(8).toString('hex')}.tmp`);
    let handle;
    try {
      handle = await fs.open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.rename(temporaryPath, finalPath);
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
    const record = {
      id,
      kind,
      name: metadata.name,
      mime: metadata.mime,
      size: bytes.byteLength,
      sha256,
      expiresAt: metadata.expiresAt,
      diskName: `${id}.bin`,
    };
    this.#records.set(id, record);
    this.#storedBytes += record.size;
    return this.#publicRecord(record);
  }

  async read(id) {
    const record = this.#requireRecord(id);
    let bytes;
    try {
      const filePath = await this.#checkedRecordPath(record);
      const handle = await fs.open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try { bytes = await handle.readFile(); } finally { await handle.close(); }
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.#forgetRecord(record);
        throw failure('RESOURCE_MISSING', 'Stored file is missing.');
      }
      throw error;
    }
    if (bytes.byteLength !== record.size || digest(bytes) !== record.sha256) {
      throw failure('STORAGE_INTEGRITY', 'Stored file size or SHA-256 does not match its receipt.');
    }
    return { metadata: this.#publicRecord(record), bytes };
  }

  get(id) { return this.#publicRecord(this.#requireRecord(id)); }

  async delete(id) {
    const record = this.#requireRecord(id);
    const filePath = await this.#checkedRecordPath(record);
    await fs.unlink(filePath).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    this.#forgetRecord(record);
    return true;
  }

  /** Expire this process's registrations and their owned files; never scans root. */
  async pruneExpired() {
    const now = this.#clock();
    for (const [token, item] of this.#uploads) if (item.expiresAt <= now) this.#uploads.delete(token);
    const expired = [...this.#records.values()].filter(item => item.expiresAt <= now);
    for (const item of expired) {
      const filePath = await this.#checkedRecordPath(item).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (filePath) await fs.unlink(filePath).catch(error => {
        if (error.code !== 'ENOENT') throw error;
      });
      this.#forgetRecord(item);
    }
    return { uploads: this.#uploads.size, removed: expired.length };
  }

  #requireRecord(id) {
    if (typeof id !== 'string' || !/^(ast|art)_[a-f\d]{48}$/.test(id)) throw failure('RESOURCE_INVALID', 'Resource id is invalid.');
    const record = this.#records.get(id);
    if (!record) throw failure('RESOURCE_EXPIRED', 'Resource does not exist in this process or has expired.');
    if (record.expiresAt <= this.#clock()) throw failure('RESOURCE_EXPIRED', 'Resource has expired.');
    return record;
  }

  async #ensureRoot() {
    if (!this.#rootRealPath) return this.initialize();
    const current = await fs.realpath(this.#root).catch(error => {
      if (error.code === 'ENOENT') throw failure('ROOT_CHANGED', 'Storage root is missing.');
      throw error;
    });
    if (current !== this.#rootRealPath) throw failure('ROOT_CHANGED', 'Storage root real path changed after initialization.');
    const details = await fs.stat(this.#root);
    if (`${details.dev}:${details.ino}` !== this.#rootIdentity) throw failure('ROOT_CHANGED', 'Storage root directory changed after initialization.');
  }

  async #checkedRecordPath(record) {
    await this.#ensureRoot();
    const filePath = path.join(this.#rootRealPath, record.diskName);
    let details;
    let resolved;
    try {
      [details, resolved] = await Promise.all([fs.lstat(filePath), fs.realpath(filePath)]);
    } catch (error) {
      if (error.code === 'ENOENT') throw error;
      throw error;
    }
    const relative = path.relative(this.#rootRealPath, resolved);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw failure('PATH_ESCAPE', 'Stored file resolves outside the configured storage root.');
    }
    if (details.isSymbolicLink()) throw failure('SYMLINK_RESOURCE', 'Stored resource path must not be a symbolic link.');
    return filePath;
  }

  #forgetRecord(record) {
    if (this.#records.delete(record.id)) this.#storedBytes -= record.size;
  }

  #publicRecord(record) {
    const { id, kind, name, mime, size, sha256, expiresAt } = record;
    return { id, kind, name, mime, size, sha256, expiresAt };
  }
}

export function sha256Hex(value) { return digest(asBytes(value)); }
