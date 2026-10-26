import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAPI} from '../src/page-api.js';
import {validatePayload} from '../src/agent/protocol.js';
import {getTool} from '../src/page-api-docs.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {createLogoImportUI,getLogoWizardState,actLogoWizard} from '../src/browser-logo-input.js';

const packet=()=>({type:'webcad-logo',version:1,units:'mm',name:'ring',sizeMm:[10,10],regions:[{outer:[[-5,-5],[5,-5],[5,5],[-5,5]],holes:[[[-2,-2],[-2,2],[2,2],[2,-2]]]}],source:{kind:'raster',sha256:'original',reviewed:false,inspectionReport:{pageCount:1}}});
function fixture(){
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:3};
 const api=createPageAPI({state:()=>({context:{...context},summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[]}),display:()=>({}),files:async()=>{throw new Error('No geometry file operation expected');},confirmSaved:()=>({saved:false})});
 return {api,context};
}
async function read(api,context){
 const source=await api.files.register({name:'ring.logo.json',data:new TextEncoder().encode(JSON.stringify(packet()))});
 const result=await api.readLogo({context,resourceId:source.resourceId,name:source.name,reviewPolicy:'preview'});
 assert.equal(result.status,'read',JSON.stringify(result));return {result,source};
}
class LogoNode{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.listeners={};this.isConnected=true;this.value='';this.textContent='';this.files=[];}
 setAttribute(key,value){this.attributes[key]=String(value);if(key==='value')this.value=String(value);}
 removeAttribute(key){delete this.attributes[key];}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 addEventListener(name,fn){this.listeners[name]=fn;}
 querySelector(){return null;}
}
function wizardFixture(){
 const previous={document:globalThis.document,MutationObserver:globalThis.MutationObserver},nodes=[];let accepted=null;
 const create=tag=>{const node=new LogoNode(tag);nodes.push(node);return node;};
 globalThis.document={body:new LogoNode('body'),createElement:create,createElementNS:(_,tag)=>create(tag)};
 globalThis.MutationObserver=class{observe(){}disconnect(){}};
 const host=createLogoImportUI({onLogo:value=>{accepted=value;},onInvalidate(){},validateLogoDocument:x=>x,logoSummary:()=>new LogoNode('div')});
 return {host,nodes,input:nodes.find(n=>n.attributes.type==='file'),accepted:()=>accepted,restore(){host.disposeLogoImporter();for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}
test('LOGO review preserves source and holes; artifact bytes match confirmed draft without CAD writes',async()=>{
 const {api,context}=fixture(),{result,source}=await read(api,context),args={context,logoId:result.logoId};
 assert.equal(result.sourceResourceId,source.resourceId);assert.equal(result.review.revision,0);
 const before=await api.reviewLogo({...args,action:'get'});
 assert.deepEqual(before.resources,[]);
 const selected=await api.reviewLogo({...args,action:'select',expectedRevision:0,regionIndex:0,holeIndex:0,pointIndex:1});
 const edited=await api.reviewLogo({...args,action:'setPoint',expectedRevision:selected.review.revision,pointMm:[-2,2.5]});
 assert.equal(edited.status,'applied');assert.equal(edited.review.reviewRequired,true);
 assert.equal((await api.reviewLogo({...args,action:'confirm',expectedRevision:edited.review.revision})).error.code,'LOGO_REVIEW_REQUIRED');
 const confirmed=await api.reviewLogo({...args,action:'confirm',expectedRevision:edited.review.revision,confirmed:true});
 assert.equal(confirmed.review.reviewRequired,false);
 const artifacts=await api.reviewLogo({...args,action:'artifacts',expectedRevision:confirmed.review.revision});
 assert.equal(artifacts.status,'generated',JSON.stringify(artifacts));assert.equal(artifacts.resources.length,5);
 const doc=JSON.parse(await (await api.files.read({resourceId:artifacts.resources.find(x=>x.kind==='contours').resourceId})).text());
 assert.deepEqual(doc.regions[0].holes[0][1],[-2,2.5]);assert.equal(doc.source.sha256,'original');assert.equal(doc.source.reviewed,true);
 const repeated=await api.reviewLogo({...args,action:'artifacts',expectedRevision:confirmed.review.revision});
 assert.deepEqual(repeated.resources,artifacts.resources,'same revision reuses resources');
 assert.equal(context.revision,3);
 assert.equal(JSON.parse(await (await api.files.read({resourceId:source.resourceId})).text()).source.reviewed,false);
});
test('LOGO drafts reject stale edits and wrong document; released artifacts regenerate within resource bounds',async()=>{
 const {api,context}=fixture(),{result}=await read(api,context),args={context,logoId:result.logoId};
 const art=await api.reviewLogo({...args,action:'artifacts',expectedRevision:0});
 await api.files.release({resourceId:art.resources[0].resourceId});
 const regenerated=await api.reviewLogo({...args,action:'artifacts',expectedRevision:0});
 assert.equal(regenerated.status,'generated');assert.notEqual(regenerated.resources[0].resourceId,art.resources[0].resourceId);
 for(let i=0;i<10;i++){
  const s=await api.reviewLogo({...args,action:'get'});
  const e=await api.reviewLogo({...args,action:'setPoint',expectedRevision:s.review.revision,pointMm:[-5-i*.01,-5]});
  assert.equal(e.status,'applied');
  const out=await api.reviewLogo({...args,action:'artifacts',expectedRevision:e.review.revision});
  assert.equal(out.status,'generated',JSON.stringify(out));
 }
 assert.equal((await api.reviewLogo({...args,action:'confirm',expectedRevision:0,confirmed:true})).error.code,'LOGO_REVIEW_STALE');
 context.documentInstanceId='new';
 assert.equal((await api.reviewLogo({...args,action:'get'})).error.code,'RESOURCE_EXPIRED');
});
test('LOGO wizard absence is explicit and independent draft access remains usable through invoke and batch',async()=>{
 const {api,context}=fixture(),{result}=await read(api,context);
 assert.deepEqual((await api.logoWizard({context})).wizard,{open:false});
 assert.equal((await api.logoWizard({context,action:'confirm',expectedRevision:0,confirmed:true})).error.code,'LOGO_WIZARD_CLOSED');
 assert.equal((await api.invoke({method:'reviewLogo',args:{context,logoId:result.logoId}})).status,'read');
 const batch=await api.run({context:api.createRequestContext(),idempotencyKey:'review-batch',steps:[{id:'get-review',method:'reviewLogo',args:{logoId:result.logoId,action:'get'}}]});
 assert.equal(batch.status,'completed',JSON.stringify(batch));
});
test('Agent LOGO reads, draft edits and artifact generation retain separate scopes',()=>{
 const binding={sessionId:'s',documentId:'d',documentInstanceId:'i'},request=action=>({method:'reviewLogo',args:{context:binding,logoId:'logo',action,expectedRevision:0}});
 assert.doesNotThrow(()=>validatePayload(request('get'),binding,['cad.read']));
 assert.throws(()=>validatePayload(request('setPoint'),binding,['cad.read']),{code:'scope_denied'});
 assert.doesNotThrow(()=>validatePayload(request('confirm'),binding,['cad.read','cad.edit']));
 assert.throws(()=>validatePayload(request('artifacts'),binding,['cad.read','cad.edit']),{code:'scope_denied'});
 assert.doesNotThrow(()=>validatePayload(request('artifacts'),binding,['cad.read','cad.export']));
 const wizard=action=>({method:'logoWizard',args:{context:binding,action,expectedRevision:0}});
 assert.doesNotThrow(()=>validatePayload(wizard('attach'),binding,['cad.read']));
 assert.throws(()=>validatePayload(wizard('artifacts'),binding,['cad.read','cad.edit']),{code:'scope_denied'});
 assert.doesNotThrow(()=>validatePayload(wizard('artifacts'),binding,['cad.read','cad.export']));
 assert.throws(()=>validatePayload(wizard('setPoint'),binding,['cad.read']),{code:'scope_denied'});
});
test('Public LOGO interfaces retain explicit PDF join tolerance and reject invalid values before reading',async()=>{
 const {api,context}=fixture();
 const source=await api.files.register({name:'ring.logo.json',data:new TextEncoder().encode(JSON.stringify(packet()))});
 for(const pdfJoinToleranceMm of [0,.02,.1]){
  const result=await api.readLogo({context,resourceId:source.resourceId,name:source.name,pdfJoinToleranceMm});
  assert.equal(result.status,'read',JSON.stringify(result));
 }
 for(const pdfJoinToleranceMm of [-.01,.10001,'0.02',null]){
  const result=await api.readLogo({context,resourceId:source.resourceId,name:source.name,pdfJoinToleranceMm});
  assert.equal(result.error?.code,'PARAM_SCHEMA_INVALID',JSON.stringify(result));
 }
 for(const schema of [
  getTool({id:'readLogo'}).inputSchema.properties.pdfJoinToleranceMm,
  getTool({id:'logoWizard'}).inputSchema.properties.parameters.properties.pdfJoinToleranceMm,
 ])assert.deepEqual(schema,{type:'number',minimum:0,maximum:.1,default:0});
 assert.equal(context.revision,3);
});
test('UI-first LOGO shares one review with Agent and readable original/derived resources',async()=>{
 const {api,context}=fixture(),ui=wizardFixture();try{
  const bytes=JSON.stringify(packet());ui.input.files=[new File([bytes],'ui-ring.logo.json',{type:'application/json'})];
  await ui.input.listeners.change(); // The actual UI file-selection path, not readLogo.
  let state=getLogoWizardState();assert.equal(state.logoId,null);assert.equal(state.sourceStatus,'not-registered');
  const attached=await api.logoWizard({context,action:'attach',expectedRevision:state.revision});
  assert.equal(attached.status,'attached',JSON.stringify(attached));assert.ok(attached.logoId);assert.ok(attached.sourceResourceId);assert.deepEqual(attached.resources,[]);
  assert.equal(await (await api.files.read({resourceId:attached.sourceResourceId})).text(),bytes,'registered source is the actual selected file, not generated contours');
  const args={context,logoId:attached.logoId};
  // Click the actual editor coordinate control, which mutates the shared UI session.
  ui.nodes.findLast(n=>n.attributes['aria-label']==='节点 X 毫米').value='-5.25';
  ui.nodes.findLast(n=>n.attributes['aria-label']==='应用节点坐标').listeners.click();
  const current=await api.reviewLogo({...args});assert.deepEqual(current.review.logo.regions[0].outer[0],[-5.25,-5]);
  const exported=await api.exportDrawing({...args,format:'json'});assert.equal(exported.status,'generated',JSON.stringify(exported));
  assert.deepEqual(JSON.parse(await(await api.files.read({resourceId:exported.resourceId})).text()).regions[0].outer[0],[-5.25,-5]);
  const confirmed=await api.reviewLogo({...args,action:'confirm',expectedRevision:current.review.revision,confirmed:true});
  assert.equal(confirmed.review.reviewRequired,false);assert.equal(getLogoWizardState().step,'target');assert.equal(ui.accepted().source.reviewed,true);
  const updated=await api.reviewLogo({...args,action:'setPoint',expectedRevision:confirmed.review.revision,pointMm:[-5.5,-5]});
  assert.equal(updated.status,'applied');assert.equal(getLogoWizardState().step,'review');assert.equal(ui.accepted(),null);
  const artifacts=await api.logoWizard({context,action:'artifacts',expectedRevision:getLogoWizardState().revision});assert.equal(artifacts.status,'generated',JSON.stringify(artifacts));assert.equal(artifacts.logoId,attached.logoId);
  const doc=JSON.parse(await(await api.files.read({resourceId:artifacts.resources.find(r=>r.kind==='contours').resourceId})).text());assert.deepEqual(doc.regions[0].outer[0],[-5.5,-5]);
 }finally{ui.restore();}
});
test('loading a cached LOGO binds the actual session and UI changes invalidate in-flight exports',async()=>{
 const {api,context}=fixture(),{result}=await read(api,context),ui=wizardFixture();try{
  const loaded=await api.logoWizard({context,action:'load',logoId:result.logoId,expectedRevision:getLogoWizardState().revision});assert.equal(loaded.status,'applied');
  assert.equal(loaded.wizard.logoId,result.logoId);
  const reloaded=await api.logoWizard({context,action:'load',logoId:result.logoId,expectedRevision:getLogoWizardState().revision});assert.equal(reloaded.status,'applied',JSON.stringify(reloaded));
  assert.equal((await api.reviewLogo({context,logoId:result.logoId})).status,'read','repeated load retains the same cached review session');
  const exportPromise=api.exportDrawing({context,logoId:result.logoId,format:'json'});
  await actLogoWizard({action:'setPoint',expectedRevision:getLogoWizardState().revision,pointMm:[-5.1,-5]});
  assert.equal((await exportPromise).error?.code,'LOGO_REVIEW_STALE');
  const draft=await api.reviewLogo({context,logoId:result.logoId});assert.deepEqual(draft.review.logo.regions[0].outer[0],[-5.1,-5]);
  const pending=api.reviewLogo({context,logoId:result.logoId,action:'artifacts',expectedRevision:draft.review.revision});
  await actLogoWizard({action:'setPoint',expectedRevision:getLogoWizardState().revision,pointMm:[-5.2,-5]});
  assert.equal((await pending).error?.code,'LOGO_REVIEW_STALE');
  const latest=await api.reviewLogo({context,logoId:result.logoId});assert.deepEqual(latest.resources,[]);
  const fresh=await api.reviewLogo({context,logoId:result.logoId,action:'artifacts',expectedRevision:latest.review.revision});assert.equal(fresh.status,'generated',JSON.stringify(fresh));
  await actLogoWizard({action:'parameters',expectedRevision:getLogoWizardState().revision,parameters:{targetWidthMm:20}});
  assert.equal((await api.reviewLogo({context,logoId:result.logoId})).error?.code,'RESOURCE_EXPIRED','source/parameter changes cannot keep the old linked draft current');
 }finally{ui.restore();}
});
test('wizard source registration rejects changes during hashing and remains bounded across replacements',async()=>{
 const {api,context}=fixture(),ui=wizardFixture();try{
  ui.input.files=[new File([JSON.stringify(packet())],'ring.logo.json')];await ui.input.listeners.change();
  const pending=api.logoWizard({context,action:'attach',expectedRevision:getLogoWizardState().revision});
  await actLogoWizard({action:'setPoint',expectedRevision:getLogoWizardState().revision,pointMm:[-5.1,-5]});
  assert.equal((await pending).error?.code,'LOGO_REVIEW_STALE');assert.equal(getLogoWizardState().logoId,null);
  let previous=[];
  for(let i=0;i<6;i++){
   const full=packet();full.source.rasterOriginalContours=packet();full.source.rasterSmoothing={status:'applied',requestedTolerancePx:.25};
   ui.input.files=[new File([JSON.stringify(full)],`ring-${i}.logo.json`)];await ui.input.listeners.change();
   const linked=await api.logoWizard({context,action:'artifacts',expectedRevision:getLogoWizardState().revision});assert.equal(linked.status,'generated',JSON.stringify(linked));previous.push(linked);
  }
  await assert.rejects(api.files.read({resourceId:previous[0].sourceResourceId}),{code:'RESOURCE_EXPIRED'});
  assert.equal((await api.reviewLogo({context,logoId:previous.at(-1).logoId})).status,'read');
 }finally{ui.restore();}
});


test('automatic LOGO acceptance materializes a live logoId without sending arrays back through the caller',async()=>{
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:3};let forwarded;
 const api=createPageAPI({state:()=>({context:{...context},summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[]}),display:()=>({}),execute:async input=>{forwarded=input;return {status:'applied',context};},files:async()=>{},confirmSaved:()=>({saved:false})});
 const loaded=await api.readLogo({context,logo:packet()});assert.equal(loaded.status,'read',JSON.stringify(loaded));assert.equal(loaded.reviewRequired,false);assert.equal(loaded.logo.source.contourReview.acceptance,'automatic-policy');
 const result=await api.execute({context:api.createRequestContext(),idempotencyKey:'logo-reference',action:'feature.add',args:{op:'logo',params:{logoId:loaded.logoId,faceId:0,mode:'engrave',depthMm:.2,placementVersion:2,point:[0,0,0]},refs:['target']}});
 assert.equal(result.status,'applied',JSON.stringify(result));assert.deepEqual(forwarded.args.params.regions,packet().regions);assert.equal(forwarded.args.params.source.reviewed,true);assert.equal(forwarded.args.params.logoId,undefined);
 for(const metadata of ['type','version','units'])assert.equal(Object.hasOwn(forwarded.args.params,metadata),false,`file metadata ${metadata} must not reach strict CAD parameters`);
 assert.doesNotThrow(()=>validateSchema(getTool({id:'logo'}).inputSchema,forwarded.args.params));
 const preview=await api.readLogo({context,logo:packet(),reviewPolicy:'preview'});assert.equal(preview.reviewRequired,true);forwarded=null;
 const blocked=await api.execute({context:api.createRequestContext(),idempotencyKey:'logo-preview-blocked',action:'feature.add',args:{op:'logo',params:{logoId:preview.logoId},refs:['target']}});
 assert.equal(blocked.error.code,'LOGO_REVIEW_REQUIRED');assert.equal(forwarded,null);
});
