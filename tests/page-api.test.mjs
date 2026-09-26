import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageAPI } from '../src/page-api.js';
import { getTool, infoMetadata, readDocs } from '../src/page-api-docs.js';
import { UI_API_ROUTES } from '../src/ui-api-coverage.js';
import {prepareAnalyticProfileEdit} from '../src/profile-editing.js';

const context = () => ({ sessionId: 'page-1', documentId: 'doc-1', documentInstanceId: 'instance-1', expectedRevision: 7 });

test('analytic edit proposals share UI geometry and remain read-only through batch and invoke',async()=>{
  const {api,host}=fixture(),profile={profileVersion:1,output:'wire',entities:[{id:'a',type:'line',startMm:[0,0],endMm:[10,0]},{id:'b',type:'line',startMm:[20,-10],endMm:[20,10],construction:true}],chains:[{id:'path',edges:[{entityId:'a',reversed:false}]}],loops:[],regions:[]};
  host.prepareProfileEdit=input=>prepareAnalyticProfileEdit(profile,input);
  const input={context:context(),bodyId:'body-1',mode:'extend',entityId:'a',targetId:'b',endpoint:'end'};
  const candidates=await api.prepareProfileEdit(input);assert.equal(candidates.selectionRequired,true);assert.equal(candidates.profile,null);assert.deepEqual(candidates.candidates[0].point,[20,0]);
  const proposed=await api.prepareProfileEdit({...input,candidateId:'intersection-1'});assert.deepEqual(proposed.profile.entities[0].endMm,[20,0]);assert.deepEqual(profile.entities[0].endMm,[10,0]);assert.equal(api.getState().context.revision,7);
  const invoked=await api.invoke({method:'prepareProfileEdit',args:{...input,candidateId:'intersection-1'}});assert.equal(invoked.status,'read');
  const batch=await api.run({context:context(),idempotencyKey:'proposal-read',steps:[{id:'proposal',method:'prepareProfileEdit',args:{bodyId:'body-1',mode:'extend',entityId:'a',targetId:'b',candidateId:'intersection-1'}}]});assert.equal(batch.status,'completed');assert.deepEqual(batch.results[0].result.profile.entities[0].endMm,[20,0]);
  const stale=await api.prepareProfileEdit({...input,context:{...context(),expectedRevision:6}});assert.equal(stale.error.code,'REVISION_CONFLICT');
  const invalid=await api.prepareProfileEdit({...input,endpoint:'middle'});assert.equal(invalid.status,'failed');
});

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

test('editor discovery covers every registered UI route and supports paginated inventory',()=>{
  for(const route of Object.values(UI_API_ROUTES))for(const id of route.tools)assert.equal(getTool({id}).id,id);
  assert(infoMetadata().docs.includes('api.editor'));
  assert.equal(getTool({id:'body.appearance'}).minimalExample.args.color,'#e87939');
  const page=readDocs({docId:'api.ui-coverage',limitChars:1000});assert(page.nextCursor);
});
test('draft inspection shares guarded direct, invoke, batch and job entry points',async()=>{
  const f=fixture(),originalState=f.host.state;f.host.state=()=>({...originalState(),bodies:[{id:'body-1',solidCount:1}]});let calls=0;
  f.host.inspectDraft=async()=>{calls++;return {method:'exactPlanarNormal',faces:[{faceId:0,signedAngleDeg:2}]};};
  const args={context:context(),bodyId:'body-1',pullDirection:[0,0,1],thresholdDeg:2};
  assert.equal((await f.api.inspectDraft(args)).status,'read');
  assert.equal((await f.api.invoke({method:'inspectDraft',args})).status,'read');
  assert.equal((await f.api.run({context:context(),idempotencyKey:'draft-read',steps:[{id:'read',method:'inspectDraft',args:{bodyId:'body-1',pullDirection:[0,0,1],thresholdDeg:2}}]})).status,'completed');
  f.api.submit({jobId:'draft-job',method:'inspectDraft',args});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.api.getJob({jobId:'draft-job'}).result.status,'read');
  assert.equal(calls,4);assert.equal(f.api.getState().context.revision,7);
  assert.equal((await f.api.inspectDraft({...args,pullDirection:[0,0,0]})).status,'failed');assert.equal(calls,4);
});
test('file preview resolves only a registered STEP resource before entering the command queue',async()=>{
 const f=fixture();let request;f.host.execute=async input=>{request=input;return {status:'previewing'};};
 const registered=await f.api.files.register({name:'source.step',data:new Uint8Array([1,2,3])});
 const placement={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
 const result=await f.api.execute({context:context(),idempotencyKey:'file-preview',action:'preview.start',args:{fileImport:{resourceId:registered.resourceId,placement}}});
 assert.equal(result.status,'previewing');assert.equal(request.args.fileImport.name,'source.step');assert.equal(request.args.fileImport.data,'AQID');
 assert.equal((await f.api.execute({context:context(),idempotencyKey:'bad',action:'preview.start',args:{fileImport:{resourceId:'missing',placement}}})).error.code,'RESOURCE_EXPIRED');
});
test('explicit view controls validate before host mutation and point measurement states its source',async()=>{
  const f=fixture();
  for(const args of [{display:'bad'},{snap:1},{grid:'yes'},{camera:{position:[0,0,0],target:[0,0,0]}},{gizmo:'scale'},{selectionMode:'vertex'},{language:'de'}]){
    assert.equal((await f.api.setView({context:context(),...args})).status,'failed');
  }
  assert.equal(f.calls.view,0);
  assert.equal((await f.api.setView({context:context(),display:'wire',grid:false,snap:true,gizmo:'off',selectionMode:'face',language:'zh',camera:{position:[30,40,50],target:[0,0,0]}})).status,'read');
  assert.equal(f.calls.view,1);
  const d=await f.api.measure({context:context(),points:[[1,2,3],[4,6,3]]});
  assert.equal(d.distance,5);assert.equal(d.source,'provided-coordinates');assert.equal(f.calls.measure,0);
  assert.equal((await f.api.measure({context:context(),points:[[0,0,0],[1,2,3]],bodyId:'body-1'})).status,'failed');
});

test('sampled twin-window page method strips context, returns closed profiles and preserves revision',async()=>{
  const f=fixture();
  const outerLeft=[[0,21],[-3,10.5],[0,0]],outerRight=[[18,21],[21,10.5],[18,0]];
  const innerLeft=[[3,17.5],[1,10.5],[3,3.5]],innerRight=[[15,17.5],[17,10.5],[15,3.5]];
  const args={context:context(),outerLeft,outerRight,innerLeft,innerRight,barTopY:12,barBottomY:9,simplifyToleranceMm:0.02};
  const result=await f.api.traceTwinWindow(args);
  assert.equal(result.status,'read');
  assert.equal(result.regions[0].holes.length,2);
  assert.deepEqual(result.size,[24,21]);
  assert.equal(result.simplifyToleranceMm,0.02);
  assert.equal(f.api.getState().context.revision,7);
  assert.equal((await f.api.traceTwinWindow({...args,context:{...context(),expectedRevision:6}})).error.code,'REVISION_CONFLICT');
});

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
