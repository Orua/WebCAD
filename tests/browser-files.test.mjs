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

test('UP-02 reattach returns the exact retained output without invoking geometry again',async()=>{
  const h=harness();
  const output=await h.files.save({context:context()});
  const calls=h.calls.length;
  const retained=h.files.reattach({context:context(),resourceId:output.resourceId});
  assert.equal(retained.sha256,output.sha256);assert.equal(retained.size,output.size);assert.equal(retained.resourceId,output.resourceId);
  assert.equal(h.calls.length,calls);
  h.files.release({resourceId:output.resourceId});
  assert.throws(()=>h.files.reattach({context,resourceId:output.resourceId}),error=>error.code==='RESOURCE_EXPIRED');
});

test('descriptive CAD output names get their actual format suffix before attachment transfer',async()=>{
  const h=harness();
  for(const [action,name,expected] of [
    ['save','钥匙圈套装-02-扣具与链条','钥匙圈套装-02-扣具与链条.webcad'],
    ['export','钥匙圈套装-02-扣具与链条','钥匙圈套装-02-扣具与链条.step'],
    ['export','part.stp','part.stp'],['export','part.STEP','part.STEP'],
    ['export','part.webcad','part.step'],['save','assembly.v1','assembly.v1.webcad']
  ]){
    const output=await h.files[action]({context:context(),name,...(action==='export'?{format:'step'}:{})});
    assert.equal(output.name,expected);assert.equal(output.status,'generated');
    const bytes=await h.files.read({resourceId:output.resourceId,as:'bytes'});
    const imported=await h.files.register({name:output.name,data:bytes});
    await h.files.open({context:context(),resourceId:imported.resourceId,unsaved:'discard'});
    assert.equal(h.calls.at(-1).action,'open','generated name is usable for a later open');
  }
});

test('register copies bytes, applies basename and size limits, and forwards exact open/import bytes', async () => {
  const h = harness();
  const original = new Uint8Array([0, 1, 2, 255]);
  const resource = await h.files.register({ name: '零件.step', data: original });
  original.fill(7);
  assert.deepEqual([...await h.files.read({ resourceId: resource.resourceId, as: 'bytes' })], [0, 1, 2, 255]);
  assert.equal((await h.files.read({ resourceId: resource.resourceId })).size, 4);
  await h.files.import({ context: context(), resourceId: resource.resourceId });
  assert.equal(h.calls.at(-1).action, 'import');
  assert(h.calls.at(-1).args.data instanceof Uint8Array);assert.deepEqual([...h.calls.at(-1).args.data], [0, 1, 2, 255]);
  await assert.rejects(h.files.open({ context: context(), resourceId: resource.resourceId }), { code: 'PARAM_SCHEMA_INVALID' });
  await h.files.open({ context: context(), resourceId: resource.resourceId, unsaved: 'fail' });
  assert.equal(h.calls.at(-1).action, 'open');assert.equal(h.calls.at(-1).args.unsaved, 'fail');
  const native = await h.files.register({ name: 'native.webcad', data: new Blob(['{}']) });
  await h.files.open({ context: context(), resourceId: native.resourceId, unsaved: 'discard' });
  assert.equal(h.calls.at(-1).action, 'open');assert.equal(h.calls.at(-1).args.unsaved, 'discard');
  const iges = await h.files.register({ name: 'old.iges', data: new Blob(['IGES']) });
  await assert.rejects(h.files.import({ context: context(), resourceId: iges.resourceId }), { code: 'CAPABILITY_UNAVAILABLE' });
  await assert.rejects(h.files.register({ name: '../outside.step', data: original }), { code: 'NAME_INVALID' });
  await assert.rejects(h.files.register({ name: 'https:evil.step', data: original }), { code: 'NAME_INVALID' });
  await assert.rejects(h.files.register({ name: 'big.step', data: {byteLength:128 * 1024 * 1024 + 1} }), { code: 'SIZE_LIMIT' });
  h.files.release({ resourceId: resource.resourceId });
  await assert.rejects(h.files.read({ resourceId: resource.resourceId }), { code: 'RESOURCE_EXPIRED' });
});

test('save produces immutable bytes and verified handle writes can confirm the snapshot', async () => {
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

test('external native write confirmation requires an exact generated artifact receipt', async () => {
  const h = harness();
  const artifact = await h.files.save({ context: context(), name: 'saved.webcad' });
  await assert.rejects(h.files.confirmWritten({ resourceId: artifact.resourceId, size: artifact.size + 1, sha256: artifact.sha256 }), { code: 'HASH_MISMATCH' });
  await assert.rejects(h.files.confirmWritten({ resourceId: artifact.resourceId, size: artifact.size, sha256: '0'.repeat(64) }), { code: 'HASH_MISMATCH' });
  assert.equal(h.dirty, true);
  const result = await h.files.confirmWritten({ resourceId: artifact.resourceId, size: artifact.size, sha256: artifact.sha256 });
  assert.equal(result.writeConfirmation, 'client_reported_verified_write');
  assert.equal(result.confirmation.saved, true);
  assert.equal(h.dirty, false);
  const exported = await h.files.export({ context: context(), format: 'step' });
  await assert.rejects(h.files.confirmWritten({ resourceId: exported.resourceId, size: exported.size, sha256: exported.sha256 }), { code: 'ASSET_INVALID' });
});

test('external confirmation of an older snapshot preserves later dirty edits', async () => {
  const h = harness();
  const artifact = await h.files.save({ context: context() });
  h.revision = 5;
  const result = await h.files.confirmWritten({ resourceId: artifact.resourceId, size: artifact.size, sha256: artifact.sha256 });
  assert.equal(result.confirmation.saved, false);
  assert.equal(h.dirty, true);
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
  assert.equal(h.files.capabilities().maxBytes, 100 * 1024 * 1024); // LIMITS.transport.maxInputBytes
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

test('large exact sources use typed import, preview and export without the legacy base64 ceiling', async () => {
  const source = new Uint8Array(21 * 1024 * 1024 + 3);
  source[0] = 73; source[source.length - 1] = 255;
  let imported;
  const files = createBrowserFiles({confirmSaved: async () => ({saved:false}), command: async input => {
    if (input.action === 'import') { imported = input; return {status:'committed'}; }
    assert.equal(input.action, 'export');
    return {status:'read', revision:4, extension:input.args.format, encoding:'bytes', data:source};
  }});
  const resource = await files.register({name:'large.STP',data:source});
  await files.import({context:context(),resourceId:resource.resourceId});
  assert(imported.args.data instanceof Uint8Array);
  assert.equal(imported.args.data.length, source.length);
  assert.equal(imported.args.idempotencyKey, undefined, 'unplaced legacy calls remain valid');
  const preview = await files.previewInput({resourceId:resource.resourceId});
  assert(preview.data instanceof Uint8Array);
  assert.deepEqual(preview.data, source);
  await files.import({context:context(),resourceId:resource.resourceId,idempotencyKey:'exact-input'});
  assert.equal(imported.args.idempotencyKey, 'exact-input');
  for (const format of ['step','brep']) {
    const output = await files.export({context:context(),format});
    assert.equal(output.size, source.length);
    assert.equal(output.sha256, resource.sha256);
    assert.deepEqual(await files.read({resourceId:output.resourceId,as:'bytes'}),source);
    files.release({resourceId:output.resourceId});
  }
  for (const ext of ['step','stp','brep','brp']) {
    assert.equal(files.capabilities().typedByteBudgets[ext],128 * 1024 * 1024);
    await assert.rejects(files.register({name:`oversized.${ext}`,data:{byteLength:128 * 1024 * 1024 + 1}}),{code:'SIZE_LIMIT'});
  }
  files.release({resourceId:resource.resourceId});
});
