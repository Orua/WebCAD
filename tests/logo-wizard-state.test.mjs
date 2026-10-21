import test from 'node:test';
import assert from 'node:assert/strict';
import {createLogoImportUI,getLogoWizardState,actLogoWizard} from '../src/browser-logo-input.js';

class NodeStub{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.listeners={};this.isConnected=true;this.value='';this.textContent='';this.files=[];}
 setAttribute(key,value){this.attributes[key]=String(value);if(key==='value')this.value=String(value);}
 removeAttribute(key){delete this.attributes[key];}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 addEventListener(name,callback){this.listeners[name]=callback;}
 querySelector(){return null;}
}
function setup(){
 const nodes=[],observers=[],saved={document:globalThis.document,MutationObserver:globalThis.MutationObserver,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage};
 globalThis.document={body:new NodeStub('body'),createElement:tag=>{const node=new NodeStub(tag);nodes.push(node);return node;},createElementNS:(_,tag)=>{const node=new NodeStub(tag);nodes.push(node);return node;}};
 globalThis.MutationObserver=class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 globalThis.localStorage={getItem:key=>key==='webcad.services.v1'?JSON.stringify({enabled:true,url:'http://127.0.0.1/compute.ashx',authMode:'bearer'}):null};globalThis.sessionStorage={getItem:()=>null};
 const host=createLogoImportUI({onLogo(){},onInvalidate(){},validateLogoDocument:x=>x,logoSummary:()=>new NodeStub('div')});
 return {host,nodes,observers,input:nodes.find(n=>n.attributes.type==='file'),restore(){host.disposeLogoImporter();for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}
test('wizard Agent read rejects missing source and preserves original structured read failure while displaying it',async()=>{
 const ctx=setup();try{
  await assert.rejects(actLogoWizard({action:'read',expectedRevision:getLogoWizardState().revision}),{code:'LOGO_SOURCE_REQUIRED'});
  const original=Object.assign(new Error('original job failed'),{code:'NO_VECTOR_CONTENT',jobId:'same-job',details:{stage:'worker'}});
  ctx.input.files=[{name:'broken.logo.json',size:10,text:async()=>{throw original;}}];
  await assert.rejects(actLogoWizard({action:'read',expectedRevision:getLogoWizardState().revision}),error=>error===original);
  const state=getLogoWizardState();assert.notEqual(state.error,'original job failed');assert.match(state.error,/轮廓/);assert.equal(state.errorDetails.message,'original job failed');assert.equal(state.errorDetails.code,'NO_VECTOR_CONTENT');assert.equal(state.errorDetails.jobId,'same-job');assert.equal(state.review,null);assert.equal(state.busy,false);
 }finally{ctx.restore();}
});
test('wizard Agent read defaults to no upload and validates explicit boolean consent',async()=>{
 const ctx=setup();try{
  ctx.input.files=[{name:'image.png',size:10}];
  await assert.rejects(actLogoWizard({action:'read',expectedRevision:getLogoWizardState().revision}),{code:'UPLOAD_AUTH_REQUIRED'});
  await assert.rejects(actLogoWizard({action:'read',expectedRevision:getLogoWizardState().revision,allowUpload:'true'}),{code:'PARAM_SCHEMA_INVALID'});
 }finally{ctx.restore();}
});
test('reading locks all source controls and restores them after failure, preserving Agent details',async()=>{
 const ctx=setup();try{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  ctx.input.files=[{name:'waiting.logo.json',size:10,text:async()=>{await pending;throw Object.assign(new Error('specific failure'),{code:'MALFORMED_FILE',jobId:'original-job',stage:'worker',details:{serviceMessage:'specific failure'}});}}];
  const run=actLogoWizard({action:'read',expectedRevision:getLogoWizardState().revision});
  await Promise.resolve();assert.equal(getLogoWizardState().busy,true);
  for(const label of ['选择 LOGO 文件','轮廓平滑源像素','图案实际宽度 mm'])assert.equal(ctx.nodes.find(n=>n.attributes['aria-label']===label).disabled,true);
  await assert.rejects(actLogoWizard({action:'parameters',expectedRevision:getLogoWizardState().revision,parameters:{targetWidthMm:30}}),{code:'LOGO_WIZARD_BUSY'});
  release();await assert.rejects(run,{code:'MALFORMED_FILE'});
  assert.equal(ctx.input.disabled,false);assert.equal(getLogoWizardState().errorDetails.details.serviceMessage,'specific failure');assert.equal(getLogoWizardState().errorDetails.jobId,'original-job');
 }finally{ctx.restore();}
});
test('wizard exposes explicit PDF join tolerance and rejects invalid values before invalidating state',async()=>{
 const ctx=setup();try{
  assert.equal(getLogoWizardState().parameters.pdfJoinToleranceMm,0);
  let state=await actLogoWizard({action:'parameters',expectedRevision:getLogoWizardState().revision,parameters:{pdfJoinToleranceMm:.02}});assert.equal(state.parameters.pdfJoinToleranceMm,.02);
  for(const value of [null,'0.01',-.01,.11])await assert.rejects(actLogoWizard({action:'parameters',expectedRevision:state.revision,parameters:{pdfJoinToleranceMm:value}}),{code:'PARAM_SCHEMA_INVALID'});
  assert.equal(getLogoWizardState().revision,state.revision);
 }finally{ctx.restore();}
});

test('wizard smoothing edits round trip and reject invalid values without changing revision',async()=>{
 const ctx=setup();try{
  const state=await actLogoWizard({action:'parameters',expectedRevision:getLogoWizardState().revision,parameters:{raster:{smoothingPx:.25}}});
  assert.equal(state.parameters.raster.smoothingPx,.25);
  const slider=ctx.nodes.find(n=>n.attributes['aria-label']==='轮廓平滑源像素');assert.equal(typeof slider.listeners.input,'function');
  await assert.rejects(actLogoWizard({action:'parameters',expectedRevision:state.revision,parameters:{raster:{smoothingPx:.6}}}),{code:'PARAM_SCHEMA_INVALID'});
  assert.equal(getLogoWizardState().revision,state.revision);
 }finally{ctx.restore();}
});
test('local Agent reads need no upload consent and closing the mounted wizard revokes bitmap URL once',async()=>{
 const ctx=setup(),create=URL.createObjectURL,revoke=URL.revokeObjectURL;let created=0,revoked=0;
 URL.createObjectURL=()=>{created++;return 'blob:review-test';};URL.revokeObjectURL=url=>{assert.equal(url,'blob:review-test');revoked++;};
 try{
  const logo={name:'ring',type:'webcad-logo',version:1,units:'mm',sizeMm:[10,10],regions:[{outer:[[0,0],[10,0],[10,10],[0,10]],holes:[]}],source:{reviewed:false}};
  ctx.input.files=[new File([JSON.stringify(logo)],'ring.logo.json')];
  const state=await actLogoWizard({action:'read',expectedRevision:getLogoWizardState().revision});assert.equal(state.step,'review');assert.equal(state.review.reviewRequired,true);
  await actLogoWizard({action:'load',expectedRevision:state.revision,logo,sourceFile:new File(['image'],'image.png')});assert.equal(created,1);
  ctx.host.isConnected=false;for(const observer of ctx.observers)observer.callback();assert.equal(revoked,1);assert.deepEqual(getLogoWizardState(),{open:false});ctx.host.disposeLogoImporter();assert.equal(revoked,1);
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;ctx.restore();}
});
