import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createBrowserFiles } from '../src/browser-files.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const context = () => ({ sessionId: 'page', documentId: 'doc', documentInstanceId: 'instance', expectedRevision: 4 });
const payload = bytes => Buffer.from(bytes).toString('base64');

function harness() {
  let revision = 4;
  let dirty = true;
  const calls = [];
  const acknowledgements = [];
  const command = async input => {
    calls.push(input);
    if (input.context.expectedRevision !== revision) return { status: 'failed', error: { code: 'REVISION_CONFLICT', message: 'Changed' } };
    if (input.action === 'save') return { status: 'read', revision, documentId: 'doc', documentInstanceId: 'instance',
      extension: 'webcad', mime: 'application/json', encoding: 'base64', data: payload('{"version":1}') };
    if (input.action === 'export') return { status: 'read', revision, extension: 'step', mime: 'application/step',
      encoding: 'base64', data: payload(new Uint8Array(100_000).fill(47)) };
    return { status: 'committed', context: { revision } };
  };
  const confirmSaved = async receipt => {
    acknowledgements.push(receipt);
    if (receipt.savedRevision === revision) dirty = false;
    return { saved: !dirty, dirty };
  };
  return { files: createBrowserFiles({ command, confirmSaved }), calls, acknowledgements,
    get dirty() { return dirty; }, set revision(value) { revision = value; } };
}

test('register copies bytes, applies basename and size limits, and forwards exact open/import bytes', async () => {
  const h = harness();
  const original = new Uint8Array([0, 1, 2, 255]);
  const resource = await h.files.register({ name: '零件.step', data: original });
  original.fill(7);
  assert.deepEqual([...await h.files.read({ resourceId: resource.resourceId, as: 'bytes' })], [0, 1, 2, 255]);
  assert.equal((await h.files.read({ resourceId: resource.resourceId })).size, 4);
  await h.files.import({ context: context(), resourceId: resource.resourceId });
  assert.equal(h.calls.at(-1).action, 'import');
  assert.deepEqual([...Buffer.from(h.calls.at(-1).args.data, 'base64')], [0, 1, 2, 255]);
  await assert.rejects(h.files.open({ context: context(), resourceId: resource.resourceId }), { code: 'FORMAT_UNSUPPORTED' });
  const native = await h.files.register({ name: 'native.webcad', data: new Blob(['{}']) });
  await h.files.open({ context: context(), resourceId: native.resourceId });
  assert.equal(h.calls.at(-1).action, 'open');
  const iges = await h.files.register({ name: 'old.iges', data: new Blob(['IGES']) });
  await assert.rejects(h.files.import({ context: context(), resourceId: iges.resourceId }), { code: 'CAPABILITY_UNAVAILABLE' });
  await assert.rejects(h.files.register({ name: '../outside.step', data: original }), { code: 'NAME_INVALID' });
  await assert.rejects(h.files.register({ name: 'https:evil.step', data: original }), { code: 'NAME_INVALID' });
  await assert.rejects(h.files.register({ name: 'big.step', data: new Uint8Array(20 * 1024 * 1024 + 1) }), { code: 'SIZE_LIMIT' });
  h.files.release({ resourceId: resource.resourceId });
  await assert.rejects(h.files.read({ resourceId: resource.resourceId }), { code: 'RESOURCE_EXPIRED' });
});

test('save produces immutable bytes and only verified handle writes can confirm the snapshot', async () => {
  const h = harness();
  const artifact = await h.files.save({ context: context(), name: 'plate.webcad' });
  assert.equal(artifact.name, 'plate.webcad');
  assert.equal(h.dirty, true);
  assert.equal(artifact.context.revision, 4);
  await assert.rejects(h.files.write({ resourceId: artifact.resourceId, handle: { kind: 'file' } }), { code: 'HANDLE_REQUIRED' });
  assert.equal(h.acknowledgements.length, 0);

  const previousClass = globalThis.FileSystemFileHandle;
  class FileSystemFileHandle {
    kind = 'file';
    bytes = new Blob([]);
    async queryPermission() { return 'granted'; }
    async createWritable() { return { write: async blob => { this.bytes = blob; }, close: async () => {} }; }
    async getFile() { return this.bytes; }
  }
  globalThis.FileSystemFileHandle = FileSystemFileHandle;
  try {
    const handle = new FileSystemFileHandle();
    const result = await h.files.write({ resourceId: artifact.resourceId, handle });
    assert.equal(result.verified, true);
    assert.equal(result.confirmation.saved, true);
    assert.equal(h.dirty, false);
    assert.equal(h.acknowledgements.length, 1);
    assert.equal(h.acknowledgements[0].sha256, artifact.sha256);
    assert.equal(await handle.bytes.text(), '{"version":1}');
  } finally { globalThis.FileSystemFileHandle = previousClass; }
});

test('save during later edits stays dirty; failures and downloads never acknowledge', async () => {
  const h = harness();
  const artifact = await h.files.save({ context: context() });
  h.revision = 5;
  const previousClass = globalThis.FileSystemFileHandle;
  class FileSystemFileHandle {
    kind = 'file';
    behavior = 'ok';
    async queryPermission() { return this.behavior === 'permission' ? 'denied' : 'granted'; }
    async createWritable() {
      if (this.behavior === 'write') throw new Error('Disk full');
      return { write: async blob => { this.blob = blob; }, close: async () => {} };
    }
    async getFile() { return this.behavior === 'corrupt' ? new Blob(['wrong']) : this.blob; }
  }
  globalThis.FileSystemFileHandle = FileSystemFileHandle;
  try {
    const handle = new FileSystemFileHandle();
    handle.behavior = 'permission';
    await assert.rejects(h.files.write({ resourceId: artifact.resourceId, handle }), { code: 'PERMISSION_REQUIRED' });
    handle.behavior = 'write';
    await assert.rejects(h.files.write({ resourceId: artifact.resourceId, handle }), /Disk full/);
    handle.behavior = 'corrupt';
    await assert.rejects(h.files.write({ resourceId: artifact.resourceId, handle }), { code: 'HASH_MISMATCH' });
    assert.equal(h.acknowledgements.length, 0);
    handle.behavior = 'ok';
    const written = await h.files.write({ resourceId: artifact.resourceId, handle });
    assert.equal(written.confirmation.saved, false);
    assert.equal(h.dirty, true);
    assert.equal(h.acknowledgements[0].savedRevision, 4);
  } finally { globalThis.FileSystemFileHandle = previousClass; }
});

test('export transfers large binary exactly and releases bounded resources', async () => {
  const h = harness();
  const artifact = await h.files.export({ context: context(), format: 'step', ids: ['body-1'] });
  assert.equal(artifact.size, 100_000);
  assert.equal(h.calls.at(-1).args.ids[0], 'body-1');
  const bytes = await h.files.read({ resourceId: artifact.resourceId, as: 'bytes' });
  assert.equal(bytes.length, 100_000);
  assert(bytes.every(byte => byte === 47));
  assert.equal(h.files.capabilities().maxBytes, 20 * 1024 * 1024);
  assert.equal(h.files.capabilities().transport, 'in-page');
  const resources = [];
  for (let i = 0; i < 31; i++) resources.push(await h.files.register({ name: `asset-${i}.step`, data: new Uint8Array([i]) }));
  await assert.rejects(h.files.register({ name: 'excess.step', data: new Uint8Array([1]) }), { code: 'RESOURCE_LIMIT' });
  h.files.release({ resourceId: resources[0].resourceId });
  const next = await h.files.register({ name: 'next.step', data: new Uint8Array([2]) });
  assert.equal(next.size, 1);
  await assert.rejects(h.files.export({ context: { ...context(), expectedRevision: 3 }, format: 'step' }), { code: 'REVISION_CONFLICT' });
});

test('a pending authorized write blocks competing write/release and confirmation failure does not hide disk success', async () => {
  const command = async () => ({ status: 'read', revision: 4, documentId: 'doc', documentInstanceId: 'instance',
    extension: 'webcad', mime: 'application/json', encoding: 'base64', data: payload('saved bytes') });
  const files = createBrowserFiles({ command, confirmSaved: async () => { throw new Error('State changed'); } });
  const artifact = await files.save({ context: context() });
  const previousClass = globalThis.FileSystemFileHandle;
  let continuePermission;
  class FileSystemFileHandle {
    kind = 'file';
    async queryPermission() { return new Promise(resolve => { continuePermission = resolve; }); }
    async createWritable() { return { write: async blob => { this.blob = blob; }, close: async () => {} }; }
    async getFile() { return this.blob; }
  }
  globalThis.FileSystemFileHandle = FileSystemFileHandle;
  try {
    const handle = new FileSystemFileHandle();
    const pending = files.write({ resourceId: artifact.resourceId, handle });
    await assert.rejects(files.write({ resourceId: artifact.resourceId, handle }), { code: 'RESOURCE_BUSY' });
    assert.throws(() => files.release({ resourceId: artifact.resourceId }), { code: 'RESOURCE_BUSY' });
    continuePermission('granted');
    const result = await pending;
    assert.equal(result.written, true);
    assert.equal(result.verified, true);
    assert.equal(result.confirmation.saved, false);
    assert.equal(result.confirmation.error.code, 'SAVE_CONFIRMATION_FAILED');
  } finally { globalThis.FileSystemFileHandle = previousClass; }
});

test('expired resources are unusable and release their capacity', async()=>{
 const h=harness(),original=Date.now,resource=await h.files.register({name:'expires.step',data:new Uint8Array([1,2])});
 try{Date.now=()=>original()+31*60*1000;await assert.rejects(h.files.read({resourceId:resource.resourceId}),{code:'RESOURCE_EXPIRED'});const fresh=await h.files.register({name:'fresh.step',data:new Uint8Array([3])});assert.equal(fresh.size,1);}
 finally{Date.now=original;}
});
