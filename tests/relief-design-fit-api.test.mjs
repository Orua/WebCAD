import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {createPageAPI} from '../src/page-api.js';
import {validatePayload,AGENT_CONTRACT} from '../src/agent/protocol.js';
import {PAGE_CLIENT_METHODS} from '../skills/webcad-page-api/scripts/page-client.mjs';
class BrowserWorker{
 constructor(url){const code=`import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:x=>parentPort.postMessage(x)};await import(${JSON.stringify(url.href)});parentPort.on('message',data=>self.onmessage({data}));`;this.w=new NodeWorker(new URL('data:text/javascript,'+encodeURIComponent(code)));this.w.on('message',data=>this.onmessage?.({data}));this.w.on('error',e=>this.onerror?.(e));}
 postMessage(value){this.w.postMessage(value);}terminate(){this.w.terminate();}
}
test('fit public API reads current source and rejects option injection and stale references without document mutation',async()=>{
 const old=globalThis.Worker;globalThis.Worker=BrowserWorker;
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1};
 const entry={id:'fit',revision:1,draft:{schemaVersion:1,name:'数值场',support:{kind:'rect',centerMm:[2,3],widthMm:20,heightMm:20},throughHoles:[],protectedZones:[],heightRangeMm:[.35,.65],points:[],fieldSettings:{columns:33,rows:33,edits:[{mode:'raise',centerMm:[2,3],radiusMm:3,amountMm:.1}]}}};
 const api=createPageAPI({state:()=>({context:{...context},summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[],reliefDesigns:[entry]}),display:()=>({}),confirmSaved:()=>({saved:false}),files:async()=>{throw Error('No file access');}});
 const args=()=>({context:{...context,expectedRevision:context.revision},designId:entry.id,expectedDraftRevision:entry.revision});
 const options={mode:'emboss',controlColumns:17,controlRows:17,controlMaxMm:.3,acceptanceToleranceMm:.035};
 try{
  assert.equal((await api.reliefDesignFit({...args(),action:'fit',options})).error.code,'RELIEF_DESIGN_UNSOLVED');
  assert.equal((await api.reliefDesignField({...args(),action:'solve'})).status,'solved');
  assert.equal((await api.reliefDesignFit({...args(),action:'fit',options:{...options,baselineMm:0}})).error.code,'PARAM_SCHEMA_INVALID');
  assert.equal((await api.reliefDesignFit({...args(),action:'get',options})).error.code,'PARAM_SCHEMA_INVALID');
  const fitted=await api.reliefDesignFit({...args(),action:'fit',options});
  assert.equal(fitted.status,'fitted',JSON.stringify(fitted));assert.equal(fitted.geometryReady,false);assert.equal(fitted.brepComputed,false);
  assert.equal(fitted.sourceBinding.documentInstanceId,'i');assert.equal(fitted.sourceBinding.baselineMm,.35);assert.equal(context.revision,1);assert.equal(entry.revision,1);
  assert.ok(fitted.fit.controlDeltasMm.some(x=>x>0));assert.equal(fitted.fit.report.deviationKind,'sampled-not-global');
  assert.equal((await api.reliefDesignFit({...args(),action:'get'})).status,'fitted');
  context.revision++;
  assert.equal((await api.reliefDesignFit({...args(),action:'get'})).error.code,'RELIEF_DESIGN_STALE');
 }finally{globalThis.Worker=old;}
});
test('fit discovery, portable host and Agent scopes expose the same numerical operation',()=>{
 const binding={sessionId:'s',documentId:'d',documentInstanceId:'i'};
 const request=action=>({method:'reliefDesignFit',args:{context:{...binding,expectedRevision:1},action}});
 assert.ok(AGENT_CONTRACT.readMethods.includes('reliefDesignFit'));assert.ok(AGENT_CONTRACT.jobMethods.includes('reliefDesignFit'));assert.ok(PAGE_CLIENT_METHODS.includes('reliefDesignFit'));
 assert.doesNotThrow(()=>validatePayload(request('get'),binding,['cad.read']));
 for(const action of ['fit','cancel']){assert.throws(()=>validatePayload(request(action),binding,['cad.read']),{code:'scope_denied'});assert.doesNotThrow(()=>validatePayload(request(action),binding,['cad.read','cad.edit']));}
});
