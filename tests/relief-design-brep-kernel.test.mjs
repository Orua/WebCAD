import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {solveReliefDesign} from '../src/relief-design-field.js';
import {fitReliefDesignField} from '../src/relief-design-fit.js';
import {prepareReliefDesignRelief} from '../src/relief-design-brep.js';
import {createCommandService} from '../src/command-service.js';
import {getOperation} from '../src/operation-registry.js';
import {physicalExecutionKey} from '../src/services/execution-context.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

const draft=()=>({schemaVersion:1,name:'拟合转BRep',support:{kind:'rect',centerMm:[0,0],widthMm:16,heightMm:16},throughHoles:[],protectedZones:[{kind:'rect',centerMm:[-5,-5],widthMm:2,heightMm:2}],heightRangeMm:[.35,.65],points:[],fieldSettings:{columns:33,rows:33,toleranceMm:.0001,edits:[{mode:'raise',centerMm:[1,1],radiusMm:4,amountMm:.12,strength:1}]}});
const options={mode:'emboss',controlColumns:13,controlRows:13,acceptanceToleranceMm:.04,controlMaxMm:.3};
const intent={version:1,requestedGeometry:'continuousRelief',sourceInterpretation:'authoredHeightMap',userIntentEvidence:'测试：显式设计场拟合后在顶面生成精确浮雕'};
const host={id:'base',op:'box',params:{width:30,depth:30,height:4},refs:[]};
function fitted(d=draft()){
 const solved=solveReliefDesign(d),result=fitReliefDesignField(d,solved,options);
 return {solved:{status:'solved',designId:'design',draftRevision:1,...solved,options:{}},fit:{status:'fitted',designId:'design',draftRevision:1,...result,sourceBinding:{draftRevision:1,...result.source}},entry:{id:'design',revision:1,draft:d}};
}
const topFace=shape=>{const faces=shape.faces;try{return faces.findIndex(f=>{if(f.geomType!=='PLANE')return false;const c=f.center,n=f.normalAt(c);try{return n.z>.99;}finally{c.delete();n.delete();}});}finally{faces.forEach(f=>f.delete());}};
async function prepared(kernel){
 const doc={version:1,name:'fit-brep',features:[structuredClone(host)],hidden:[],imports:{}};
 await kernel.rebuild(doc);
 const faceId=topFace(kernel.activeShape('base')),support=kernel.reliefDesignSupport('base',faceId),{fit,solved,entry}=fitted();
 const plan=prepareReliefDesignRelief({fit,solved,entry,expectedDraftRevision:1,support,target:{bodyId:'base',faceId,expectedSourceSha256:support.sourceSha256},placement:{originMm:[support.centerMm[0]+2,support.centerMm[1]-1,support.centerMm[2]],xDirection:[0,1,0]},datum:{kind:'authoredBaselineOnSelectedFace',baselineMm:.35},machiningIntent:intent});
 return {doc,plan,support,fit};
}

test('fit-bound relief builds one valid closed exact BRep solid with the expected material and provenance',async()=>{
 const kernel=new CadKernel(oc);
 try{
  const {doc,plan,support,fit}=await prepared(kernel);
  assert.equal(plan.status,'prepared',JSON.stringify(plan.blockers));
  assert.equal(plan.previewArgs.params.angleDeg,90);assert.ok(Math.abs(plan.previewArgs.params.offsetX-2)<1e-12);
  assert.equal(plan.previewArgs.params.designBinding.support.sourceSha256,support.sourceSha256);
  doc.features.push({id:'relief',op:'relief',refs:['base'],params:plan.previewArgs.params});
  const result=await kernel.rebuild(doc),body=result.bodies.find(b=>b.id==='relief');
  assert.equal(result.bodies.length,1);assert.equal(body.solidCount,1);
  assert.ok(body.reliefReport.addedMm3>0,'material added');assert.ok(Math.abs(body.volume-3600-body.reliefReport.addedMm3)<1e-6,'closed-solid volume = host + relief');
  assert.equal(body.reliefReport.kind,'contour-bspline-relief');
  {const faces=kernel.activeShape('relief').faces;try{assert.ok(faces.some(f=>f.geomType==='BSPLINE_SURFACE'),'exact OCCT B-spline face present');}finally{faces.forEach(f=>f.delete());}}
  // Bound by the fitted control envelope: never above the host plus max control delta.
  const shape=kernel.activeShape('relief'),bb=shape.boundingBox;
  try{assert.ok(bb.bounds[1][2]<=4+plan.previewArgs.params.depthMm+1e-6);assert.ok(bb.bounds[1][2]>4+.01);}finally{bb.delete?.();}
  // STEP export of the resulting solid re-imports as one solid with the same volume.
  const step=await kernel.export('step',['relief']),round=(await cad.importSTEP(new Blob([step.data]))).asShape3D();
  try{assert.equal(round.solids.length,1);assert.ok(Math.abs(cad.measureVolume(round)-body.volume)<1e-3);}finally{round.delete();}
  assert.ok(fit.fit.report.metrics.protection.maxMm<=1e-9);
 }finally{kernel.dispose();}
});

test('recipe JSON persists the binding and a cold reopen rebuilds the same solid without re-fitting',async()=>{
 const kernel=new CadKernel(oc);let stored,expected;
 try{const {doc,plan}=await prepared(kernel);doc.features.push({id:'relief',op:'relief',refs:['base'],params:plan.previewArgs.params});expected=(await kernel.rebuild(doc)).bodies[0].volume;stored=JSON.stringify(doc);}finally{kernel.dispose();}
 const reopened=new CadKernel(oc);
 try{const doc=JSON.parse(stored);assert.ok(doc.features[1].params.designBinding.controls.controlsSha256);const r=await reopened.rebuild(doc);assert.equal(r.bodies[0].solidCount,1);assert.ok(Math.abs(r.bodies[0].volume-expected)<1e-7);}finally{reopened.dispose();}
});

test('kernel rejects tampered controls, masks, placement and a changed source without touching committed geometry',async()=>{
 const kernel=new CadKernel(oc);
 try{
  const {doc,plan}=await prepared(kernel);doc.features.push({id:'relief',op:'relief',refs:['base'],params:plan.previewArgs.params});await kernel.rebuild(doc);
  const before=kernel.activeShape('relief').serialize();
  const variant=edit=>{const d=structuredClone(doc);edit(d.features[1].params,d);return d;};
  const cases=[
   [p=>{const j=p.values.findIndex(r=>r.some(v=>v>0));p.values[j][p.values[j].findIndex(v=>v>0)]*=.5;},'RELIEF_DESIGN_BINDING_INVALID'],
   [p=>{p.values[0][0]=.5;},'RELIEF_DESIGN_BINDING_INVALID'],
   [p=>{p.offsetX+=.1;},'RELIEF_DESIGN_BINDING_INVALID'],
   [p=>{p.regions[0].outer[0]=[-.49,-.5];},'RELIEF_DESIGN_BINDING_INVALID'],
   [p=>{p.maskStrategy='cutHoleSolids';},'RELIEF_DESIGN_BINDING_INVALID'],
   [(p,d)=>{d.features[0].params.height=5;},'RELIEF_DESIGN_SOURCE_CHANGED'],
  ];
  for(const [edit,code] of cases){await assert.rejects(kernel.rebuild(variant(edit)),e=>e.code===code&&/[\u4e00-\u9fff]/.test(e.message),code);}
  await kernel.rebuild(doc);assert.equal(kernel.activeShape('relief').serialize(),before,'unchanged recipe still rebuilds identically');
 }finally{kernel.dispose();}
});

test('preview.start/commit carry the prepared args through CommandService unchanged; cancel leaves the document',async()=>{
 const kernel=new CadKernel(oc);
 try{
  const {doc,plan}=await prepared(kernel),op=getOperation('relief');
  const s={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:structuredClone(doc.features),bodies:[{id:'base'}],kernelReady:true,busy:false,preview:false};
  let draftFeature=null,previewBody=null;
  const service=createCommandService({snapshot:()=>structuredClone(s),execute:async(command,args)=>{
   if(command==='preview_feature'||command==='preview.start'||args?.previewIdentity){draftFeature={id:'relief',op:args.op,refs:args.refs,params:args.params};const r=await kernel.rebuild({...doc,features:[...doc.features,draftFeature]});previewBody=r.bodies[0];s.preview=true;s.previewInfo=args.previewIdentity;return;}
   if(command==='preview.commit'){s.features.push(draftFeature);s.revision++;s.preview=false;s.previewInfo=null;return;}
   if(command==='preview.cancel'){s.preview=false;s.previewInfo=null;draftFeature=null;return;}
   throw new Error('unexpected command '+command);
  }});
  const ctx=()=>({sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:s.revision});
  const started=await service.execute({context:ctx(),idempotencyKey:'fit-preview',action:'preview.start',args:{...plan.previewArgs,opVersion:op.version,schemaHash:op.schemaHash}});
  assert.equal(started.status,'previewing',JSON.stringify(started));
  assert.equal(previewBody.solidCount,1);assert.deepEqual(draftFeature.params.designBinding,plan.previewArgs.params.designBinding);
  const cancelled=await service.execute({context:ctx(),idempotencyKey:'fit-cancel',action:'preview.cancel',args:{previewId:s.previewInfo.previewId,expectedGeneration:s.previewInfo.generation}});assert.notEqual(cancelled.status,'failed',JSON.stringify(cancelled));assert.equal(s.preview,false);assert.equal(s.features.length,1);
  await service.execute({context:ctx(),idempotencyKey:'fit-preview-2',action:'preview.start',args:{...plan.previewArgs,opVersion:op.version,schemaHash:op.schemaHash}});
  const committed=await service.execute({context:ctx(),idempotencyKey:'fit-commit',action:'preview.commit',args:{previewId:s.previewInfo.previewId,expectedGeneration:s.previewInfo.generation}});assert.notEqual(committed.status,'failed',JSON.stringify(committed));
  assert.equal(s.features.length,2);assert.equal(s.features[1].params.designBinding.kind,'reliefDesignFit');
 }finally{kernel.dispose();}
});

test('physical execution key ignores binding audit identity only',async()=>{
 const kernel=new CadKernel(oc);
 try{
  const {plan}=await prepared(kernel),f={op:'relief',refs:['base'],params:plan.previewArgs.params},g=structuredClone(f);
  g.params.designBinding.audit.draftRevision=99;g.params.designBinding.audit.designId='other';
  assert.equal(physicalExecutionKey(f,'a','b','c'),physicalExecutionKey(g,'a','b','c'));
  g.params.designBinding.support.sourceSha256='0'.repeat(64);assert.notEqual(physicalExecutionKey(f,'a','b','c'),physicalExecutionKey(g,'a','b','c'));
 }finally{kernel.dispose();}
});
