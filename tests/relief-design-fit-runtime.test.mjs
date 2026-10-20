import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {solveReliefDesign} from '../src/relief-design-field.js';
import {prepareReliefDesignFit,fitReliefDesignField} from '../src/relief-design-fit.js';
import {runReliefDesignField,readReliefDesignField,cancelReliefDesignField,candidateReliefDesignField,runReliefDesignFit,readReliefDesignFit,cancelReliefDesignFit} from '../src/relief-design-runtime.js';

const draft=()=>({schemaVersion:1,name:'显式数值拟合',support:{kind:'rect',centerMm:[2,3],widthMm:20,heightMm:20},throughHoles:[],protectedZones:[],heightRangeMm:[.35,.65],points:[{id:'height',pointMm:[2,3],heightMm:.55}],fieldSettings:{columns:33,rows:33,toleranceMm:.0001}});
const options=()=>({mode:'emboss',controlColumns:17,controlRows:17,controlMaxMm:.3,acceptanceToleranceMm:.035});
const binding=()=>({context:{sessionId:'page',documentId:'doc',documentInstanceId:'instance',revision:1},entry:{id:'design',revision:1,draft:draft()}});
class BrowserWorker{
 constructor(url){const code=`import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:x=>parentPort.postMessage(x)};await import(${JSON.stringify(url.href)});parentPort.on('message',data=>self.onmessage({data}));`;this.w=new NodeWorker(new URL('data:text/javascript,'+encodeURIComponent(code)));this.w.on('message',data=>this.onmessage?.({data}));this.w.on('error',e=>this.onerror?.(e));}
 postMessage(x){this.w.postMessage(x);}terminate(){this.w.terminate();}
}
class HeldWorker{
 static instances=[];
 constructor(){HeldWorker.instances.push(this);}postMessage(data){this.input=structuredClone(data);}terminate(){this.terminated=true;}
 emit(data){this.onmessage?.({data});}
}
async function seed(now){
 const pending=runReliefDesignField(now.context,now.entry,{},()=>now),worker=HeldWorker.instances.at(-1);
 worker.emit({ok:true,kind:'field',result:solveReliefDesign(worker.input.draft,worker.input.options)});
 await pending;return worker;
}
const originalWorker=globalThis.Worker;
test.afterEach(()=>{cancelReliefDesignField();globalThis.Worker=originalWorker;});

test('thin fit adapter shifts the original domain and audits exact masks without exposing raw source overrides',()=>{
 const d=draft();d.points=[];d.throughHoles=[{kind:'circle',centerMm:[7,3],radiusMm:.7}];d.protectedZones=[{kind:'rect',centerMm:[-3,3],widthMm:1,heightMm:2}];
 const solved=solveReliefDesign(d),before=structuredClone(solved),prepared=prepareReliefDesignFit(d,solved,options());
 assert.deepEqual(prepared.input.domain.support.centerMm,[0,0]);assert.deepEqual(prepared.input.domain.throughHoles[0].centerMm,[5,0]);assert.deepEqual(prepared.input.domain.protectedZones[0].centerMm,[-5,0]);
 assert.equal(prepared.input.baselineMm,.35);assert.deepEqual(prepared.input.field.active,solved.field.active);assert.deepEqual(prepared.input.field.fixedMask,solved.field.fixedMask);assert.equal(prepared.input.maxControlPoints,4225);
 assert.equal(Object.hasOwn(prepared.input.field,'previewTriangles'),false);assert.deepEqual(solved,before);
 for(const key of ['field','domain','baselineMm','shouldCancel','maxControlPoints'])assert.throws(()=>prepareReliefDesignFit(d,solved,{...options(),[key]:key==='shouldCancel'?()=>false:{}}),{code:'PARAM_SCHEMA_INVALID'});
 const tampered=structuredClone(solved);tampered.report.protectionBaselineMm=.65;assert.throws(()=>prepareReliefDesignFit(d,tampered,options()),{code:'FIT_SOURCE_INVALID'});
 const changed=structuredClone(solved);changed.field.active[0]=0;assert.notEqual(prepareReliefDesignFit(d,changed,options()).source.fieldFingerprint,prepared.source.fieldFingerprint);
 const engrave=fitReliefDesignField(d,solved,{...options(),mode:'engrave'});assert.equal(engrave.fit.baselineMm,.35,'flat field does not switch to the upper height bound for engrave');
 const nonzero=solveReliefDesign(draft());assert.throws(()=>fitReliefDesignField(draft(),nonzero,{...options(),mode:'engrave'}),{code:'FIT_DIRECTION_CONFLICT'});
});

test('real numerical Worker fits a solved nonzero field, preserves old mesh candidate and returns auditable JSON arrays',async()=>{
 globalThis.Worker=BrowserWorker;const now=binding(),current=()=>now;
 now.entry.draft.points=[];now.entry.draft.fieldSettings.edits=[{mode:'raise',centerMm:[2,3],radiusMm:3,amountMm:.1,strength:1}];
 await runReliefDesignField(now.context,now.entry,{},current);
 const before=readReliefDesignField(now.context,now.entry),requested=options(),pending=runReliefDesignFit(now.context,now.entry,requested,current);
 requested.controlColumns=4;
 assert.equal(readReliefDesignFit(now.context,now.entry).status,'computing');assert.equal(readReliefDesignField(now.context,now.entry).status,'solved');
 const result=await pending;assert.equal(result.status,'fitted');assert.equal(result.fit.report.status,'numerically-accepted');
 assert.ok(result.fit.controlDeltasMm.some(v=>v>0));assert.equal(result.fit.report.deviationKind,'sampled-not-global');assert.equal(result.fit.baselineMm,.35);
 assert.equal(result.geometryReady,false);assert.equal(result.brepComputed,false);assert.equal(result.commitState,'notCommitted');assert.equal(Object.hasOwn(result,'args'),false);
 const json=JSON.parse(JSON.stringify(result));assert.ok(Array.isArray(json.fit.controlHeightsMm));assert.ok(Array.isArray(json.fit.sourceMasks.active));assert.equal(json.fit.controlHeightsMm.length,17*17);
 assert.equal(json.sourceBinding.documentId,'doc');assert.equal(json.sourceBinding.draftRevision,1);assert.ok(json.sourceBinding.fieldFingerprint);assert.ok(json.sourceBinding.optionsFingerprint);
 assert.deepEqual(readReliefDesignField(now.context,now.entry),before);assert.equal(candidateReliefDesignField(now.context,now.entry,1).status,'candidate');
 result.fit.controlHeightsMm.fill(999);assert.ok(readReliefDesignFit(now.context,now.entry).fit.controlHeightsMm.every(v=>v!==999));
 now.entry.revision++;assert.throws(()=>readReliefDesignFit(now.context,now.entry),{code:'RELIEF_DESIGN_STALE'});assert.equal(readReliefDesignFit(now.context,now.entry).status,'empty');
});

test('cancel terminates the sole fit Worker, keeps solved field and ignores its late result',async()=>{
 globalThis.Worker=HeldWorker;const now=binding();await seed(now);
 const pending=runReliefDesignFit(now.context,now.entry,options(),()=>now),rejected=assert.rejects(pending,{code:'FIT_CANCELLED'}),worker=HeldWorker.instances.at(-1);
 assert.equal(cancelReliefDesignFit().status,'cancelled');assert.equal(worker.terminated,true);await rejected;
 worker.emit({ok:true,kind:'fit',result:{}});assert.equal(readReliefDesignFit(now.context,now.entry).status,'empty');assert.equal(readReliefDesignField(now.context,now.entry).status,'solved');
 assert.equal(cancelReliefDesignFit().status,'idle');
});

test('a new field solve cancels fit and a late fit cannot overwrite the new task slot',async()=>{
 globalThis.Worker=HeldWorker;const now=binding();await seed(now);
 const old=runReliefDesignFit(now.context,now.entry,options(),()=>now),rejected=assert.rejects(old,{code:'FIT_CANCELLED'}),fitWorker=HeldWorker.instances.at(-1);
 const next=runReliefDesignField(now.context,now.entry,{},()=>now),fieldWorker=HeldWorker.instances.at(-1);await rejected;
 fitWorker.emit({ok:true,kind:'fit',result:{}});assert.equal(readReliefDesignField(now.context,now.entry).status,'computing');assert.equal(readReliefDesignFit(now.context,now.entry).status,'empty');
 fieldWorker.emit({ok:true,kind:'field',result:solveReliefDesign(fieldWorker.input.draft,{})});assert.equal((await next).status,'solved');
});

test('full document identity and draft revision reject and clear late fitted results',async()=>{
 for(const mutate of [n=>n.context.documentId='other-document',n=>n.entry.revision++,n=>n.context.documentInstanceId='other-instance']){
  globalThis.Worker=HeldWorker;const now=binding();await seed(now);
  const pending=runReliefDesignFit(now.context,now.entry,options(),()=>now),rejected=assert.rejects(pending,{code:'RELIEF_DESIGN_STALE'}),worker=HeldWorker.instances.at(-1);
  mutate(now);worker.emit({ok:true,kind:'fit',result:{}});await rejected;assert.equal(readReliefDesignFit(now.context,now.entry).status,'empty');
 }
});

test('fit refuses unsolved fields and propagates numerical rejection without partial cached success',async()=>{
 globalThis.Worker=HeldWorker;const now=binding();
 const field=runReliefDesignField(now.context,now.entry,{},()=>now),rejectedField=assert.rejects(field,{code:'FIELD_CANCELLED'});
 await assert.rejects(runReliefDesignFit(now.context,now.entry,options(),()=>now),{code:'RELIEF_DESIGN_UNSOLVED'});cancelReliefDesignField();await rejectedField;
 await seed(now);const pending=runReliefDesignFit(now.context,now.entry,options(),()=>now),rejected=assert.rejects(pending,error=>error.code==='FIT_DEVIATION'&&error.details.retry==='none');
 HeldWorker.instances.at(-1).emit({ok:false,kind:'fit',error:{code:'FIT_DEVIATION',message:'independent sampled error',details:{retry:'none'}}});await rejected;
 assert.equal(readReliefDesignFit(now.context,now.entry).status,'empty');assert.equal(readReliefDesignField(now.context,now.entry).status,'solved');
});

test('fit timeout terminates its Worker and never discards the source field',async()=>{
 globalThis.Worker=HeldWorker;const now=binding();await seed(now);
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;let expire;
 try{
  globalThis.setTimeout=callback=>{expire=callback;return 123;};globalThis.clearTimeout=()=>{};
  const pending=runReliefDesignFit(now.context,now.entry,options(),()=>now),rejected=assert.rejects(pending,{code:'FIT_TIMEOUT'}),worker=HeldWorker.instances.at(-1);
  expire();await rejected;assert.equal(worker.terminated,true);assert.equal(readReliefDesignFit(now.context,now.entry).status,'empty');assert.equal(readReliefDesignField(now.context,now.entry).status,'solved');
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
