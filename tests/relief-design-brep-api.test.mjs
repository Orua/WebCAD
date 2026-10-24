import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker as NodeWorker} from 'node:worker_threads';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {createPageAPI} from '../src/page-api.js';
import {CadKernel} from '../src/cad-kernel.js';
import {getTool} from '../src/page-api-docs.js';
import {validatePayload,AGENT_CONTRACT} from '../src/agent/protocol.js';
import {PAGE_CLIENT_METHODS} from '../skills/webcad-page-api/scripts/page-client.mjs';
import {selectedPlanarTarget,brepRequestFields,defaultFaceXDirection} from '../src/ui/forms/relief-design-brep-panel.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
class BrowserWorker{
 constructor(url){const code=`import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:x=>parentPort.postMessage(x)};await import(${JSON.stringify(url.href)});parentPort.on('message',data=>self.onmessage({data}));`;this.w=new NodeWorker(new URL('data:text/javascript,'+encodeURIComponent(code)));this.w.on('message',data=>this.onmessage?.({data}));this.w.on('error',e=>this.onerror?.(e));}
 postMessage(value){this.w.postMessage(value);}terminate(){this.w.terminate();}
}

const topFace=shape=>{const faces=shape.faces;try{return faces.findIndex(f=>{if(f.geomType!=='PLANE')return false;const c=f.center,n=f.normalAt(c);try{return n.z>.99;}finally{c.delete();n.delete();}});}finally{faces.forEach(f=>f.delete());}};
const intentText='按当前设计在顶面做连续浮雕';

test('page tool + UI helpers: real face read, blocked reasons, prepared args that build one exact solid, stale rejection',async()=>{
 const old=globalThis.Worker;globalThis.Worker=BrowserWorker;
 const kernel=new CadKernel(oc),doc={version:1,name:'p',features:[{id:'base',op:'box',params:{width:30,depth:30,height:4},refs:[]}],hidden:[],imports:{}};
 await kernel.rebuild(doc);const faceId=topFace(kernel.activeShape('base'));
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1};
 const entry={id:'fit',revision:1,draft:{schemaVersion:1,name:'数值场',support:{kind:'rect',centerMm:[0,0],widthMm:16,heightMm:16},throughHoles:[],protectedZones:[],heightRangeMm:[.35,.65],points:[],fieldSettings:{columns:33,rows:33,edits:[{mode:'raise',centerMm:[1,1],radiusMm:4,amountMm:.12}]}}};
 let selection={bodyIds:[],topology:{bodyId:'base',type:'face',ids:[faceId]}};
 const api=createPageAPI({state:()=>({context:{...context},summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[{id:'base'}],reliefDesigns:[entry],selection}),display:()=>({}),confirmSaved:()=>({saved:false}),files:async()=>{throw Error('No file access');},reliefDesignSupport:async(bodyId,faceId)=>kernel.reliefDesignSupport(bodyId,faceId)});
 const base=()=>({context:{...context,expectedRevision:context.revision},designId:entry.id,expectedDraftRevision:entry.revision});
 try{
  // Unfitted -> blocked, still returns the trusted face facts for the UI.
  const picked=selectedPlanarTarget(selection);assert.deepEqual(picked.target,{bodyId:'base',faceId});
  const unfitted=await api.prepareReliefDesignRelief({...base(),target:picked.target});
  assert.equal(unfitted.status,'blocked');assert.equal(unfitted.blockers[0].code,'RELIEF_DESIGN_UNFITTED');assert.equal(unfitted.support.planar,true);assert.deepEqual(unfitted.support.normal,[0,0,1]);
  assert.equal((await api.reliefDesignField({...base(),action:'solve'})).status,'solved');
  const fitted=await api.reliefDesignFit({...base(),action:'fit',options:{mode:'emboss',controlColumns:13,controlRows:13,controlMaxMm:.3,acceptanceToleranceMm:.04}});assert.equal(fitted.status,'fitted');
  // Missing explicit placement/datum/intent -> blocked with Chinese reasons, no args.
  const missing=await api.prepareReliefDesignRelief({...base(),...brepRequestFields({target:picked.target,support:unfitted.support,origin:['','',''],xDirection:['','',''],baselineConfirmed:false,baselineMm:fitted.fit.baselineMm,evidence:''})});
  assert.equal(missing.status,'blocked');assert.deepEqual(missing.blockers.map(b=>b.code).sort(),['RELIEF_DESIGN_DATUM_REQUIRED','RELIEF_DESIGN_INTENT_REQUIRED','RELIEF_DESIGN_PLACEMENT_REQUIRED']);assert.equal(missing.previewArgs,undefined);
  assert.ok(missing.blockers.every(b=>/[\u4e00-\u9fff]/.test(b.message)));
  // Explicit UI clicks: face centre + default X + confirmed baseline + evidence.
  const fields=brepRequestFields({target:picked.target,support:unfitted.support,origin:unfitted.support.centerMm.map(String),xDirection:defaultFaceXDirection(unfitted.support.normal).map(String),baselineConfirmed:true,baselineMm:fitted.fit.baselineMm,evidence:intentText});
  const prepared=await api.prepareReliefDesignRelief({...base(),...fields});
  assert.equal(prepared.status,'prepared',JSON.stringify(prepared.blockers??prepared.error));
  const card=getTool({id:'relief'});assert.equal(prepared.previewArgs.opVersion,card.version);assert.equal(prepared.previewArgs.schemaHash,card.schemaHash);
  assert.equal(prepared.previewArgs.params.designBinding.support.sourceSha256,unfitted.support.sourceSha256);assert.equal(context.revision,1,'prepare never mutates the document');
  // The same args, as preview.start would run them, give one exact closed solid.
  const {op,refs,params}=prepared.previewArgs,built=await kernel.rebuild({...doc,features:[...doc.features,{id:'relief',op,refs,params}]});
  assert.equal(built.bodies.length,1);assert.equal(built.bodies[0].solidCount,1);assert.ok(built.bodies[0].reliefReport.addedMm3>0);
  // Wrong/unsafe inputs.
  assert.equal((await api.prepareReliefDesignRelief({...base(),...fields,target:{bodyId:'gone',faceId}})).error.code,'STALE_REFERENCE');
  assert.equal((await api.prepareReliefDesignRelief({...base(),...fields,extra:1})).error.code,'PARAM_SCHEMA_INVALID');
  assert.equal((await api.prepareReliefDesignRelief({...base(),...fields,placement:{...fields.placement,frame:'x'}})).error.code,'PARAM_SCHEMA_INVALID');
  assert.equal((await api.prepareReliefDesignRelief({...base(),...fields,expectedDraftRevision:2})).error.code,'REVISION_CONFLICT');
  const side=await api.prepareReliefDesignRelief({...base(),...fields,target:{bodyId:'base',faceId:(faceId+1)%6}});assert.equal(side.status,'blocked');
  // An unrelated document revision preserves a fit bound to the same draft/source.
  context.revision++;assert.equal((await api.prepareReliefDesignRelief({...base(),...fields})).status,'prepared');
 }finally{globalThis.Worker=old;kernel.dispose();}
});

test('UI selection helper refuses non-face, multi-face and empty selections; discovery and Agent scope expose the read-only tool',()=>{
 for(const sel of [null,{topology:null},{topology:{bodyId:'b',type:'edge',ids:[1]}},{topology:{bodyId:'b',type:'face',ids:[1,2]}}])assert.ok(/面/.test(selectedPlanarTarget(sel).error));
 assert.deepEqual(brepRequestFields({target:{bodyId:'b',faceId:1},origin:['1','x','3'],xDirection:[1,0,0],baselineConfirmed:true,baselineMm:.2,evidence:'  '}),{target:{bodyId:'b',faceId:1},datum:{kind:'authoredBaselineOnSelectedFace',baselineMm:.2}});
 const binding={sessionId:'s',documentId:'d',documentInstanceId:'i'};
 assert.ok(AGENT_CONTRACT.readMethods.includes('prepareReliefDesignRelief'));assert.ok(PAGE_CLIENT_METHODS.includes('prepareReliefDesignRelief'));
 assert.doesNotThrow(()=>validatePayload({method:'prepareReliefDesignRelief',args:{context:{...binding,expectedRevision:1}}},binding,['cad.read']));
 const card=getTool({id:'prepareReliefDesignRelief'});assert.equal(card.implementationStatus,'implemented');assert.equal(card.executionPolicy.readOnly,true);assert.equal(card.inputSchema.additionalProperties,false);
});
