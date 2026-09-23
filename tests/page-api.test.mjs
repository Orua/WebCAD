import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageAPI } from '../src/page-api.js';

const context = () => ({ sessionId: 'page-1', documentId: 'doc-1', documentInstanceId: 'instance-1', expectedRevision: 7 });

function fixture() {
  let revision = 7;
  let displayStatus = 'rendered';
  let renderedRevision = 7;
  let frameError = null;
  const calls = { measure: 0, view: 0, frame: 0, capture: 0, redraw: 0, files: 0, execute: 0 };
  const host = {
    buildId: 'test-build',
    state: () => ({ status: 'read', context: { ...context(), revision },
      summary: { name: 'Plate', kernelReady: true, busy: false, dirty: true },
      preview: { active: false, computing: false }, bodies: [{ id: 'body-1' }], features: [] }),
    display: () => ({ status: displayStatus,
      rendered: { documentId: 'doc-1', documentInstanceId: 'instance-1', revision: renderedRevision }, frame: 12 }),
    measure: async () => { calls.measure++; return { volume: 42, bounds: { min: [0, 0, 0], max: [7, 3, 2] } }; },
    view: async () => { calls.view++; },
    frame: async () => { calls.frame++; if (frameError) throw frameError; },
    capture: () => { calls.capture++; return 'data:image/png;base64,aW1hZ2U='; },
    redraw: async () => { calls.redraw++; },
    files: async () => { calls.files++; return { status: 'read' }; },
    confirmSaved: async () => ({ saved: true }),
    execute: async () => { calls.execute++; return { status: 'committed' }; },
    query: async () => ({ status: 'read' }),
  };
  return { api: createPageAPI(host), host, calls,
    set revision(value) { revision = value; },
    set renderedRevision(value) { renderedRevision = value; },
    set displayStatus(value) { displayStatus = value; },
    set frameError(value) { frameError = value; } };
}

test('public API exposes no mutable host internals; read-only methods leave document revision alone', async () => {
  const oldLocation = globalThis.location, oldWindow = globalThis.window;
  globalThis.location = { href: 'https://example.invalid/webcad/' };
  globalThis.window = {}; globalThis.window.top = globalThis.window;
  try {
    const f = fixture();
    assert(Object.isFrozen(f.api));
    assert(Object.isFrozen(f.api.files));
    assert.equal(f.api.host, undefined);
    assert.equal(f.api.viewport, undefined);
    assert.equal(f.api.commandService, undefined);
    assert.equal(f.api.info().context.revision, 7);
    assert.equal(f.api.info().page.topLevel, true);
    assert.equal(f.api.getState().context.revision, 7);
    assert.equal((await f.api.setView({ context: context(), direction: 'top' })).status, 'read');
    assert.equal((await f.api.redraw({ context: context() })).status, 'read');
    assert.equal(f.api.getState().context.revision, 7);
    assert.equal(f.calls.view, 1);
    assert.equal(f.calls.redraw, 1);
    assert.equal(f.calls.execute, 0);
  } finally { globalThis.location = oldLocation; globalThis.window = oldWindow; }
});

test('measure rejects invalid or stale context before the host runs, then returns exact host values', async () => {
  const f = fixture();
  const invalid = await f.api.measure({ context: { ...context(), documentInstanceId: 'other' }, bodyId: 'body-1' });
  assert.equal(invalid.status, 'failed');
  assert.equal(invalid.error.code, 'INSTANCE_MISMATCH');
  const stale = await f.api.measure({ context: { ...context(), expectedRevision: 6 }, bodyId: 'body-1' });
  assert.equal(stale.error.code, 'REVISION_CONFLICT');
  assert.equal(f.calls.measure, 0);
  const unknown = await f.api.measure({ context: context(), bodyId: 'missing' });
  assert.equal(unknown.error.code, 'STALE_REFERENCE');
  assert.equal(f.calls.measure, 0);
  const result = await f.api.measure({ context: context(), bodyId: 'body-1', kind: 'body' });
  assert.equal(result.status, 'read');
  assert.equal(result.source, 'exact-brep');
  assert.equal(result.units.volume, 'mm^3');
  assert.equal(result.volume, 42);
  assert.deepEqual(result.bounds.max, [7, 3, 2]);
  assert.equal(f.calls.measure, 1);
  assert.equal(f.api.getState().context.revision, 7);
});

test('measure detects revision change during host work and does not relabel stale geometry', async () => {
  const f = fixture();
  let release;
  f.host.measure = async () => { f.calls.measure++; return new Promise(resolve => { release = resolve; }); };
  const pending = f.api.measure({ context: context(), bodyId: 'body-1' });
  assert.equal(f.calls.measure, 1);
  f.revision = 8;
  release({ volume: 42 });
  const result = await pending;
  assert.equal(result.error.code, 'REVISION_CONFLICT');
  assert.equal(result.volume, undefined);
});

test('capture waits for a matching rendered frame and preserves display failure', async () => {
  const f = fixture();
  const good = await f.api.capture({ context: context() });
  assert.equal(good.status, 'read');
  assert.equal(good.display.rendered.revision, 7);
  assert.equal(good.mime, 'image/png');
  assert.equal(f.calls.frame, 1);
  assert.equal(f.calls.capture, 1);

  f.renderedRevision = 6;
  const stale = await f.api.capture({ context: context() });
  assert.equal(stale.status, 'failed');
  assert.equal(f.calls.capture, 1, 'stale rendered frame must never be labelled current');
  f.renderedRevision = 7;
  f.displayStatus = 'failed';
  const failed = await f.api.capture({ context: context() });
  assert.equal(failed.status, 'failed');
  assert.equal(f.calls.capture, 1);
  f.displayStatus = 'rendered';
  f.frameError = Object.assign(new Error('GPU lost'), { code: 'DISPLAY_FAILED' });
  const frameFailure = await f.api.capture({ context: context() });
  assert.equal(frameFailure.error.code, 'DISPLAY_FAILED');
  assert.equal(f.calls.capture, 1);
  assert.equal(f.api.getState().context.revision, 7);
});
