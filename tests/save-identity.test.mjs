import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createBrowserFiles } from '../src/browser-files.js';
import { FILE_ARGUMENT_KEYS } from '../src/browser-file-contracts.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const context = () => ({ sessionId: 'page', documentId: 'doc', documentInstanceId: 'instance', expectedRevision: 4 });

test('files.new forwards an optional live title (R8-002)', async () => {
  assert.deepEqual(FILE_ARGUMENT_KEYS.new, ['context', 'name', 'unsaved']);
  const calls = [];
  const files = createBrowserFiles({ confirmSaved: async () => ({}), command: async input => { calls.push(input); return { status: 'committed', context: { revision: 1 }, name: input.args.name }; } });
  await files.new({ context: context(), name: 'F22' });
  await files.new({ context: context() });
  await files.new({ context: context(), unsaved: 'discard' });
  assert.deepEqual(calls.map(c => c.args), [{ name: 'F22' }, {}, { unsaved: 'discard' }]);
  assert.match(main, /const fresh=emptyDocument\(\);if\(args\?\.name!==undefined\)fresh\.name=args\.name\.trim\(\);/);
  assert.match(main, /return \{dirty,name:documentModel\.name\};/);
});

test('files.save receipt says the title and dirty flag are unchanged (R7-002/R7-020)', async () => {
  const files = createBrowserFiles({ confirmSaved: async () => ({}), command: async () => ({ status: 'read', revision: 4, documentId: 'doc', documentInstanceId: 'instance', extension: 'webcad', mime: 'application/json', encoding: 'base64', data: Buffer.from('{}').toString('base64') }) });
  const saved = await files.save({ context: context(), name: 'F22-v3' });
  assert.equal(saved.status, 'generated'); assert.equal(saved.name, 'F22-v3.webcad');
  assert.equal(saved.documentNameChanged, false); assert.equal(saved.dirtyCleared, false);
  assert.match(saved.durability, /page-memory/);
});

test('startup recovery keeps instanceId and revision of the recovered row (R7-021)', () => {
  assert.match(main, /if\(!restoredFrom&&\(newInstance\|\|documentModel\.documentId!==next\.documentId\)\)\{documentInstanceId=crypto\.randomUUID\(\)/);
  assert.match(main, /revision=restoredFrom&&Number\.isSafeInteger\(restoredFrom\.revision\)&&restoredFrom\.revision>revision\?restoredFrom\.revision:revision\+1/);
  assert.match(main, /restoredFrom:\{instanceId:recovered\.instanceId,revision:recovered\.revision/);
  // Undo/redo/history revert still use restoring:true without restoredFrom, so they keep revision++.
  assert.ok(!/restoring:true,historyLabel:'退回：'\+entry\.label,restoredFrom/.test(main));
});

test('files.save still reports dirtyCleared:false; confirmWritten is the handshake (F-01)', async () => {
  const files = createBrowserFiles({ confirmSaved: async snapshot => ({ cleared:true, ...snapshot }), command: async input => {
    if (input.action === 'save') return { status: 'read', revision: 4, documentId: 'doc', documentInstanceId: 'instance', extension: 'webcad', mime: 'application/json', encoding: 'base64', data: Buffer.from('{"ok":1}').toString('base64') };
    return { status: 'committed', context: { revision: 5 } };
  } });
  const saved = await files.save({ context: context() });
  assert.equal(saved.dirtyCleared, false);
  assert.ok(saved.next.includes('files.confirmWritten'));
  const confirmed = await files.confirmWritten({ resourceId: saved.resourceId, size: saved.size, sha256: saved.sha256 });
  assert.ok(confirmed);
});
