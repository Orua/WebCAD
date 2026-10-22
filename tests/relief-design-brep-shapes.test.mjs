// Real-kernel coverage for fit-to-relief beyond the rectangular emboss case:
// (1) round support with a through-hole on a real pierced disk host;
// (2) engrave. Authored designs cannot produce a non-zero engrave fit (baseline is the
//     lowest authored height -> FIT_DIRECTION_CONFLICT), so the engrave kernel path is
//     exercised with an explicitly sign-mirrored fit object whose fingerprints are recomputed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {solveReliefDesign} from '../src/relief-design-field.js';
import {fitReliefDesignField,normalizeReliefDesignFitOptions} from '../src/relief-design-fit.js';
import {prepareReliefDesignRelief} from '../src/relief-design-brep.js';
import {contractHash} from '../src/contracts/operation-schema.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const intent={version:1,requestedGeometry:'continuousRelief',sourceInterpretation:'authoredHeightMap',userIntentEvidence:'测试：真实内核覆盖'};
const topFace=shape=>{const faces=shape.faces;try{return faces.findIndex(f=>{if(f.geomType!=='PLANE')return false;const c=f.center,n=f.normalAt(c);try{return n.z>.99;}finally{c.delete();n.delete();}});}finally{faces.forEach(f=>f.delete());}};
function fitted(d,options){const solved=solveReliefDesign(d),r=fitReliefDesignField(d,solved,options);return {solved:{status:'solved',...solved},fit:{status:'fitted',designId:'design',draftRevision:1,...r,sourceBinding:{draftRevision:1,...r.source}},entry:{id:'design',revision:1,draft:d}};}
async function plan(kernel,doc,bodyId,f,originXY,absolute=false){
 await kernel.rebuild(doc);const faceId=topFace(kernel.activeShape(bodyId)),support=kernel.reliefDesignSupport(bodyId,faceId);
 const origin=absolute?[originXY[0],originXY[1],support.centerMm[2]]:[support.centerMm[0]+originXY[0],support.centerMm[1]+originXY[1],support.centerMm[2]];
 return prepareReliefDesignRelief({...f,expectedDraftRevision:1,support,target:{bodyId,faceId,expectedSourceSha256:support.sourceSha256},placement:{originMm:origin,xDirection:[1,0,0]},datum:{kind:'authoredBaselineOnSelectedFace',baselineMm:f.fit.fit.baselineMm},machiningIntent:intent});
}
const probe=(shape,p)=>{const v=cad.makeVertex(p);try{return cad.measureDistanceBetween(shape,v);}finally{v.delete();}};

test('round support with a through-hole: retained mask keeps the hole, the real pierced disk gets one valid solid and the bore stays open',async()=>{
 const R=10,hole=[3,0],holeR=1.2;
 const d={schemaVersion:1,name:'圆牌带孔',support:{kind:'circle',centerMm:[0,0],radiusMm:R},throughHoles:[{kind:'circle',centerMm:hole,radiusMm:holeR}],protectedZones:[],heightRangeMm:[0,.4],points:[],fieldSettings:{columns:33,rows:33,toleranceMm:.0001,edits:[{mode:'raise',centerMm:[-4,0],radiusMm:4,amountMm:.25,strength:1}]}};
 const f=fitted(d,{mode:'emboss',controlColumns:17,controlRows:17,acceptanceToleranceMm:.1,controlMaxMm:.4});
 const doc={version:1,name:'disk',features:[{id:'disk',op:'cylinder',params:{radius:R,height:3},refs:[]},{id:'drill',op:'cylinder',params:{radius:holeR,height:3},refs:[]},{id:'bore',op:'transform',params:{x:hole[0],y:hole[1],z:0},refs:['drill']},{id:'plate',op:'cut',params:{},refs:['disk','bore']}],hidden:[],imports:{}};
 const kernel=new CadKernel(oc);
 try{
  let r;
  try{r=await plan(kernel,doc,'plate',f,[0,0],true);}catch(e){throw new Error('host/plan: '+e.message);}
  assert.equal(r.status,'prepared',JSON.stringify(r.blockers));
  const p=r.previewArgs.params;assert.equal(p.regions.length,1);assert.equal(p.regions[0].holes.length,1,'through-hole survives as a mask hole');
  assert.ok(p.regions[0].outer.length>4,'circular staircase, not the bounding rectangle');
  const before=(await kernel.rebuild(doc)).bodies[0].volume;
  doc.features.push({id:'relief',op:'relief',refs:['plate'],params:p});
  const out=await kernel.rebuild(doc),body=out.bodies.find(b=>b.id==='relief');
  assert.equal(body.solidCount,1);assert.ok(body.reliefReport.addedMm3>0);assert.ok(Math.abs(body.volume-before-body.reliefReport.addedMm3)<1e-6);
  const shape=kernel.activeShape('relief');
  assert.ok(probe(shape,[hole[0],hole[1],1.5])>=holeR-1e-6,'bore axis remains empty');
  const faces=shape.faces;try{assert.ok(faces.some(x=>x.geomType==='BSPLINE_SURFACE'));}finally{faces.forEach(x=>x.delete());}
  const step=await kernel.export('step',['relief']),round=(await cad.importSTEP(new Blob([step.data]))).asShape3D();
  try{assert.equal(round.solids.length,1);assert.ok(Math.abs(cad.measureVolume(round)-body.volume)<1e-3);}finally{round.delete();}
  // Support center is the face centroid (shifted by the bore), so the round test places the design at the absolute disk axis.
  // Moving the pattern so the retained mask no longer clears the real bore is rejected, not clipped.
  const shifted=await plan(kernel,{...doc,features:doc.features.slice(0,4)},'plate',f,[1.5,0],true);// 261022-03: detected already at 准备 (circular-edge sampling), with a Chinese reason.
  assert.equal(shifted.status,'blocked');assert.equal(shifted.blockers[0].code,'RELIEF_OUTSIDE_FACE');assert.match(shifted.blockers[0].message,/圆孔|超出选面/);
  const aligned=await plan(kernel,{...doc,features:doc.features.slice(0,4)},'plate',f,[0,0],true);assert.equal(aligned.status,'prepared');
 }finally{kernel.dispose();}
});

test('authored non-zero design cannot be fitted as engrave (baseline is the lowest height)',()=>{
 const d={schemaVersion:1,name:'凹雕',support:{kind:'rect',centerMm:[0,0],widthMm:16,heightMm:16},throughHoles:[],protectedZones:[],heightRangeMm:[0,.4],points:[],fieldSettings:{columns:33,rows:33,toleranceMm:.0001,edits:[{mode:'raise',centerMm:[1,1],radiusMm:4,amountMm:.2,strength:1}]}};
 assert.throws(()=>fitted(d,{mode:'engrave',controlColumns:13,controlRows:13,acceptanceToleranceMm:.05,controlMaxMm:.4}),{code:'FIT_DIRECTION_CONFLICT'});
});

test('engrave kernel path: mirrored fit is cut into the real face, removes material, persists and rejects tampering',async()=>{
 const d={schemaVersion:1,name:'凹雕',support:{kind:'rect',centerMm:[0,0],widthMm:16,heightMm:16},throughHoles:[],protectedZones:[],heightRangeMm:[0,.4],points:[],fieldSettings:{columns:33,rows:33,toleranceMm:.0001,edits:[{mode:'raise',centerMm:[1,1],radiusMm:4,amountMm:.2,strength:1}]}};
 const f=fitted(d,{mode:'emboss',controlColumns:13,controlRows:13,acceptanceToleranceMm:.05,controlMaxMm:.4});
 // Explicit mirror: same poles/masks, opposite sign; option fingerprint recomputed for engrave.
 const F=f.fit.fit;F.mode='engrave';F.controlDeltasMm=F.controlDeltasMm.map(v=>-v);F.controlHeightsMm=F.controlDeltasMm.map(v=>F.baselineMm+v);
 f.fit.options=normalizeReliefDesignFitOptions({...f.fit.options,mode:'engrave'});f.fit.source={...f.fit.source,optionsFingerprint:contractHash(f.fit.options)};
 const doc={version:1,name:'box',features:[{id:'base',op:'box',params:{width:30,depth:30,height:4},refs:[]}],hidden:[],imports:{}};
 const kernel=new CadKernel(oc);let stored,volume;
 try{
  const r=await plan(kernel,doc,'base',f,[0,0]);assert.equal(r.status,'prepared',JSON.stringify(r.blockers));assert.equal(r.previewArgs.params.mode,'engrave');
  doc.features.push({id:'relief',op:'relief',refs:['base'],params:r.previewArgs.params});
  const body=(await kernel.rebuild(doc)).bodies[0];
  assert.equal(body.solidCount,1);assert.ok(body.reliefReport.removedMm3>0);assert.equal(body.reliefReport.addedMm3,0);assert.ok(Math.abs(3600-body.volume-body.reliefReport.removedMm3)<1e-6);
  const shape=kernel.activeShape('relief'),bb=shape.boundingBox;try{assert.ok(Math.abs(bb.bounds[1][2]-4)<1e-6,'engrave never rises above the face');}finally{bb.delete?.();}
  const deepest=r.previewArgs.params.depthMm;assert.ok(probe(shape,[16,16,4])>.05&&probe(shape,[16,16,4])<=deepest+1e-6,'cavity at the design peak, bounded by the control envelope');
  stored=JSON.stringify(doc);volume=body.volume;
  const tampered=JSON.parse(stored);tampered.features[1].params.mode='emboss';
  await assert.rejects(kernel.rebuild(tampered),e=>e.code==='RELIEF_DESIGN_BINDING_INVALID');
 }finally{kernel.dispose();}
 const cold=new CadKernel(oc);try{const r=await cold.rebuild(JSON.parse(stored));assert.ok(Math.abs(r.bodies[0].volume-volume)<1e-7);}finally{cold.dispose();}
});
