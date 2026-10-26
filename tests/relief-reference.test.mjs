import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAPI} from '../src/page-api.js';
import {bindReliefEditor} from '../src/relief-ui-state.js';
import {validatePayload} from '../src/agent/protocol.js';

const packet={version:1,widthMm:8,heightMm:8,layers:[{name:'ring',heightMm:.3,mode:'emboss',regions:[{outer:[[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]],holes:[[[-.1,-.1],[-.1,.1],[.1,.1],[.1,-.1]]]}]}]};
function fixture(){
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:0},calls=[];
 const api=createPageAPI({state:()=>({context:{...context},summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[]}),display:()=>({}),confirmSaved:()=>({saved:false}),execute:async input=>{calls.push(input);return {status:'committed'};},files:async()=>{throw Error('No geometry expected');}});
 return {api,context,calls};
}
test('compact relief references preserve the original holes and reach the same execute path',async()=>{
 const {api,context,calls}=fixture(),resource=await api.files.register({name:'ring.relief.json',data:new TextEncoder().encode(JSON.stringify(packet))});
 const read=await api.readRelief({context,resourceId:resource.resourceId,name:resource.name,sourceInterpretation:'reviewedVectors',includeData:false});
 assert.equal(read.status,'read');assert.equal(read.layerCount,1);assert.equal(read.layers,undefined);
 const original=await api.readRelief({context,reliefId:read.reliefId});assert.deepEqual(original.layers[0].regions[0].holes,packet.layers[0].regions[0].holes);
 const args={op:'relief',refs:['plate'],params:{reliefId:read.reliefId,faceId:4,widthMm:8,heightMm:8,depthMm:.3}};
 const result=await api.execute({context:{...context,expectedRevision:0},idempotencyKey:'one',action:'preview.start',args});
 assert.equal(result.status,'committed');assert.equal(calls.length,1);assert.deepEqual(calls[0].args.params.layers,original.layers);assert.equal(calls[0].args.params.reliefId,undefined);
 const mixed=await api.execute({context:{...context,expectedRevision:0},idempotencyKey:'mixed',action:'feature.add',args:{...args,params:{...args.params,values:[[1]]}}});assert.equal(mixed.error.code,'PARAM_SCHEMA_INVALID');assert.equal(calls.length,1);
 context.documentInstanceId='other';const expired=await api.readRelief({context,reliefId:read.reliefId});assert.equal(expired.error.code,'RESOURCE_EXPIRED');
});
test('UI source attachment reuses one reference and separates editor lifetimes',async()=>{
 const {api,context}=fixture();let rev=0;
 const open=()=>bindReliefEditor({get:()=>({active:true,revision:rev}),act:async()=>({data:{source:{name:'ring',sha256:'hash'},layers:packet.layers},bodyId:'plate',params:{faceId:4,widthMm:8,heightMm:8}})});
 const close=open();try{
  const a=await api.reliefWizard({context,action:'source'}),b=await api.reliefWizard({context,action:'source'});assert.equal(a.reliefId,b.reliefId);assert.equal(a.params.reliefId,a.reliefId);assert.equal(a.params.widthMm,8);
  close();const closeAgain=open();try{const c=await api.reliefWizard({context,action:'source'});assert.notEqual(c.reliefId,a.reliefId);}finally{closeAgain();}
 }finally{close();}
 assert.equal((await api.reliefWizard({context})).wizard.active,false);
});
test('image design creation requires edit scope and rejects photo interpretation before CAD writes',async()=>{
 const {api,context,calls}=fixture(),resource=await api.files.register({name:'original.png',data:new Uint8Array([1,2,3])});
 const args={context,action:'createDesign',resourceId:resource.resourceId,name:'original.png',idempotencyKey:'image-once',widthMm:18,heightMm:18,depthMm:.6,sourceInterpretation:'shadedReference'};
 assert.throws(()=>validatePayload({method:'reliefWizard',args},{...context},['cad.read']),{code:'scope_denied'});
 const photo=await api.reliefWizard(args);assert.equal(photo.error.code,'PARAM_SCHEMA_INVALID');assert.equal(calls.length,0);
 const image={...args,sourceInterpretation:'authoredHeightMap'};
 const result=await api.reliefWizard(image);assert.equal(result.error.code,'RELIEF_IMAGE_INVALID');assert.equal(calls.length,0);
 const repeated=await api.reliefWizard(image);assert.equal(repeated.error.code,result.error.code);assert.equal(calls.length,0);
 const conflict=await api.reliefWizard({...image,depthMm:.8});assert.equal(conflict.error.code,'IDEMPOTENCY_CONFLICT');
});
