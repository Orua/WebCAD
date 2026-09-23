import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactStore } from '../scripts/artifact-store.mjs';

async function withStore(options, run) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webcad-artifact-store-'));
  const root = path.join(parent, 'store');
  try { await run(await new ArtifactStore({ root, ...options }).initialize(), root); }
  finally { await fs.rm(parent, { recursive: true, force: true }); }
}

test('upload is one-use, stores random disk names, and returns verified size/hash', async () => {
  await withStore({ maxBytes: 100 }, async (store, root) => {
    const bytes = Buffer.from('exact input bytes');
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const grant = store.createUpload({ name: '../../outside.step', mime: 'model/step', size: bytes.length, sha256 });
    assert.equal(store.verifyUpload(grant.uploadToken).size, bytes.length);
    assert.equal(store.verifyUpload(grant.uploadToken).sha256, sha256);
    const receipt = await store.acceptUpload(grant.uploadToken, bytes);
    assert.equal(receipt.kind, 'asset');
    assert.equal(receipt.name, '../../outside.step'); // Display metadata only.
    assert.equal(receipt.size, bytes.length);
    assert.equal(receipt.sha256, sha256);
    assert.match(receipt.id, /^ast_[a-f\d]{48}$/);
    assert.deepEqual(await fs.readdir(root), [`${receipt.id}.bin`]);
    assert.deepEqual((await store.read(receipt.id)).bytes, bytes);
    assert.throws(() => store.verifyUpload(grant.uploadToken), { code: 'UPLOAD_TOKEN_INVALID' });
    await assert.rejects(store.acceptUpload(grant.uploadToken, bytes), { code: 'UPLOAD_TOKEN_INVALID' });
  });
});

test('declared and actual size limits reject before storing', async () => {
  await withStore({ maxBytes: 3 }, async (store, root) => {
    assert.throws(() => store.createUpload({ size: 4 }), { code: 'SIZE_LIMIT' });
    const grant = store.createUpload({ size: 2 });
    await assert.rejects(store.acceptUpload(grant.uploadToken, Buffer.from('four')), { code: 'SIZE_LIMIT' });
    assert.deepEqual(await fs.readdir(root), []);
    const mismatch = store.createUpload({ size: 1 });
    await assert.rejects(store.acceptUpload(mismatch.uploadToken, Buffer.from('xx')), { code: 'SIZE_MISMATCH' });
    assert.deepEqual(await fs.readdir(root), []);
  });
});

test('declared hash is checked and stored bytes are checked on read', async () => {
  await withStore({}, async (store, root) => {
    const bytes = Buffer.from('correct');
    const grant = store.createUpload({ sha256: '0'.repeat(64) });
    await assert.rejects(store.acceptUpload(grant.uploadToken, bytes), { code: 'HASH_MISMATCH' });
    const receipt = await store.createArtifact(bytes, { name: 'result.step' });
    await fs.writeFile(path.join(root, `${receipt.id}.bin`), 'tampered');
    await assert.rejects(store.read(receipt.id), { code: 'STORAGE_INTEGRITY' });
  });
});

test('expired resources remain registered until awaited prune removes them', async () => {
  let now = 1_000;
  await withStore({ ttlMs: 50, clock: () => now }, async (store, root) => {
    const grant = store.createUpload({});
    const receipt = await store.createArtifact(Buffer.from('x'));
    await fs.writeFile(path.join(root, 'unregistered.keep'), 'keep');
    now += 50;
    assert.throws(() => store.verifyUpload(grant.uploadToken), { code: 'RESOURCE_EXPIRED' });
    await assert.rejects(store.read(receipt.id), { code: 'RESOURCE_EXPIRED' });
    assert((await fs.readdir(root)).includes(`${receipt.id}.bin`));
    const report = await store.pruneExpired();
    assert.equal(report.removed, 1);
    assert.equal(report.uploads, 0);
    assert.equal(await fs.readFile(path.join(root, 'unregistered.keep'), 'utf8'), 'keep');
    assert.deepEqual((await fs.readdir(root)).sort(), ['unregistered.keep']);
  });
});

test('explicit root required and ids cannot traverse outside it', async () => {
  assert.throws(() => new ArtifactStore(), /explicit storage root/i);
  await withStore({}, async store => {
    await assert.rejects(store.read('../../outside'), { code: 'RESOURCE_INVALID' });
    await assert.rejects(store.delete('../../outside'), { code: 'RESOURCE_INVALID' });
  });
});

test('pending upload count, stored resource count, and aggregate bytes are bounded without eviction', async () => {
  await withStore({ maxBytes: 3, maxTotalBytes: 4, maxUploads: 2, maxResources: 2 }, async store => {
    const u1 = store.createUpload({ size: 2 });
    store.createUpload({ size: 2 });
    assert.throws(() => store.createUpload({ size: 1 }), { code: 'UPLOAD_LIMIT' });
    const first = await store.acceptUpload(u1.uploadToken, Buffer.from('ab'));
    const second = await store.createArtifact(Buffer.from('c'));
    await assert.rejects(store.createArtifact(Buffer.from('d')), { code: 'RESOURCE_LIMIT' });
    const queued = store.createUpload({ size: 1 });
    assert.throws(() => store.verifyUpload(queued.uploadToken), { code: 'RESOURCE_LIMIT' });
    await store.delete(second.id);
    assert.equal(store.verifyUpload(queued.uploadToken).size, 1);
    const third = await store.acceptUpload(queued.uploadToken, Buffer.from('d'));
    assert.equal((await store.read(first.id)).bytes.toString(), 'ab');
    assert.equal((await store.read(third.id)).bytes.toString(), 'd');
  });

  await withStore({ maxBytes: 3, maxTotalBytes: 3 }, async store => {
    const first = await store.createArtifact(Buffer.from('ab'));
    const second = await store.createArtifact(Buffer.from('c'));
    await assert.rejects(store.createArtifact(Buffer.from('d')), { code: 'TOTAL_SIZE_LIMIT' });
    const queued = store.createUpload({ size: 1 });
    assert.throws(() => store.verifyUpload(queued.uploadToken), { code: 'TOTAL_SIZE_LIMIT' });
    assert.equal((await store.read(first.id)).bytes.toString(), 'ab');
    assert.equal((await store.read(second.id)).bytes.toString(), 'c');
  });
  assert.throws(() => new ArtifactStore({ root: 'x', maxTotalBytes: 256 * 1024 * 1024 + 1 }), /maxTotalBytes/i);
});

test('read and delete refuse symlink paths resolving outside root without touching target', async t => {
  await withStore({}, async (store, root) => {
    const receipt = await store.createArtifact(Buffer.from('stored'));
    const outside = path.join(path.dirname(root), 'outside.keep');
    const stored = path.join(root, `${receipt.id}.bin`);
    await fs.writeFile(outside, 'external bytes');
    await fs.unlink(stored);
    try {
      await fs.symlink(outside, stored, 'file');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip(`File symlinks unavailable: ${error.code}`);
      throw error;
    }
    await assert.rejects(store.read(receipt.id), { code: 'PATH_ESCAPE' });
    await assert.rejects(store.delete(receipt.id), { code: 'PATH_ESCAPE' });
    assert.equal(await fs.readFile(outside, 'utf8'), 'external bytes');
  });
});

test('storage root real path cannot be redirected after initialization', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webcad-artifact-root-'));
  const root = path.join(parent, 'store');
  const moved = path.join(parent, 'moved');
  const outside = path.join(parent, 'outside');
  try {
    const store = await new ArtifactStore({ root }).initialize();
    const receipt = await store.createArtifact(Buffer.from('x'));
    await fs.rename(root, moved);
    await fs.mkdir(root);
    try {
      await fs.symlink(outside, path.join(root, 'redirect'), 'junction');
    } catch {}
    await assert.rejects(store.read(receipt.id), { code: 'ROOT_CHANGED' });
    await assert.rejects(store.delete(receipt.id), { code: 'ROOT_CHANGED' });
    assert.equal(await fs.readFile(path.join(moved, `${receipt.id}.bin`), 'utf8'), 'x');
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});
