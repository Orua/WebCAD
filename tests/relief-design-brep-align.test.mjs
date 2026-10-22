import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker as NodeWorker} from 'node:worker_threads';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {createPageAPI} from '../src/page-api.js';
import {CadKernel} from '../src/cad-kernel.js';
import {selectedPlanarTarget,brepRequestFields,defaultFaceXDirection} from '../src/ui/forms/relief-design-brep-panel.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
class BrowserWorker{
 constructor(url){const code=`import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:x=>parentPort.postMessage(x)};await import(${JSON.stringify(url.href)});parentPort.on('message',data=>self.onmessage({data}));`;this.w=new NodeWorker(new URL('data:text/javascript,'+encodeURIComponent(code)));this.w.on('message',data=>this.onmessage?.({data}));this.w.on('error',e=>this.onerror?.(e));}
 postMessage(value){this.w.postMessage(value);}terminate(){this.w.terminate();}
}

const topFace=shape=>{const faces=shape.faces;try{return faces.findIndex(f=>{if(f.geomType!=='PLANE')return false;const c=f.center,n=f.normalAt(c);try{return n.z>.99;}finally{c.delete();n.delete();}});}finally{faces.forEach(f=>f.delete());}};
const intent={version:1,requestedGeometry:'continuousRelief',sourceInterpretation:'authoredHeightMap',userIntentEvidence:'测试：凹雕基准与对孔放置'};
const ctx={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1};
function pageFor(kernel,bodyId,entry){
 let selection={bodyIds:[],topology:{bodyId,type:'face',ids:[]}};
 const api=createPageAPI({state:()=>({context:{...ctx},summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[{id:bodyId}],reliefDesigns:[entry],selection}),display:()=>({}),confirmSaved:()=>({saved:false}),files:async()=>{throw Error('No file access');},reliefDesignSupport:async(b,f)=>kernel.reliefDesignSupport(b,f)});
 return {api,base:()=>({context:{...ctx,expectedRevision:ctx.revision},designId:entry.id,expectedDraftRevision:entry.revision})};
}

test('engraveDepth: a real authored raised design is fitted as engrave and cut into the real face',async()=>{
 const old=globalThis.Worker;globalThis.Worker=BrowserWorker;
 const kernel=new CadKernel(oc),doc={version:1,name:'e',features:[{id:'base',op:'box',params:{width:30,depth:30,height:4},refs:[]}],hidden:[],imports:{}};
 await kernel.rebuild(doc);const faceId=topFace(kernel.activeShape('base'));
 const entry={id:'eng',revision:1,draft:{schemaVersion:1,name:'凹雕',support:{kind:'rect',centerMm:[0,0],widthMm:16,heightMm:16},throughHoles:[],protectedZones:[],heightRangeMm:[0,.4],points:[],fieldSettings:{columns:33,rows:33,toleranceMm:.0001,edits:[{mode:'raise',centerMm:[1,1],radiusMm:4,amountMm:.2,strength:1}]}}};
 const {api,base}=pageFor(kernel,'base',entry);
 try{
  assert.equal((await api.reliefDesignField({...base(),action:'solve'})).status,'solved');
  const opts={controlColumns:13,controlRows:13,controlMaxMm:.4,acceptanceToleranceMm:.05};
  const plain=await api.reliefDesignFit({...base(),action:'fit',options:{mode:'engrave',...opts}});
  assert.equal(plain.status,'failed');assert.equal(plain.error.code,'FIT_DIRECTION_CONFLICT');
  const wrong=await api.reliefDesignFit({...base(),action:'fit',options:{mode:'emboss',heightInterpretation:'engraveDepth',...opts}});assert.equal(wrong.status,'failed');
  const fit=await api.reliefDesignFit({...base(),action:'fit',options:{mode:'engrave',heightInterpretation:'engraveDepth',...opts}});
  assert.equal(fit.status,'fitted',JSON.stringify(fit.error));assert.equal(fit.fit.mode,'engrave');assert.equal(fit.fit.baselineMm,0);assert.ok(Math.min(...fit.fit.controlDeltasMm)<-.1);assert.ok(Math.max(...fit.fit.controlDeltasMm)<=0);
  const s=(await api.prepareReliefDesignRelief({...base(),target:{bodyId:'base',faceId}})).support;
  const r=await api.prepareReliefDesignRelief({...base(),target:{bodyId:'base',faceId,expectedSourceSha256:s.sourceSha256},placement:{originMm:s.centerMm,xDirection:[1,0,0]},datum:{kind:'authoredBaselineOnSelectedFace',baselineMm:0},machiningIntent:intent});
  assert.equal(r.status,'prepared',JSON.stringify(r.blockers));assert.equal(r.previewArgs.params.mode,'engrave');
  doc.features.push({id:'relief',op:'relief',refs:['base'],params:r.previewArgs.params});
  const body=(await kernel.rebuild(doc)).bodies[0];
  assert.equal(body.solidCount,1);assert.ok(body.reliefReport.removedMm3>1);assert.equal(body.reliefReport.addedMm3,0);assert.ok(Math.abs(3600-body.volume-body.reliefReport.removedMm3)<1e-6);
  const v=cad.makeVertex([s.centerMm[0]+1,s.centerMm[1]+1,4]);try{const d=cad.measureDistanceBetween(kernel.activeShape('relief'),v);assert.ok(d>.1&&d<=.4+1e-6,'cavity depth ~ authored height '+d);}finally{v.delete();}
  const step=await kernel.export('step',['relief']),round=(await cad.importSTEP(new Blob([step.data]))).asShape3D();try{assert.ok(Math.abs(cad.measureVolume(round)-body.volume)<5e-3,'step '+cad.measureVolume(round)+' vs '+body.volume+' solids '+round.solids.length);}finally{round.delete();}
 }finally{globalThis.Worker=old;kernel.dispose();}
});

test('pierced disk: kernel reports exact circular-edge centres; alignTo places on the disk axis; centroid placement is off-axis and rejected',async()=>{
 const old=globalThis.Worker;globalThis.Worker=BrowserWorker;
 const R=10,hole=[3,0],holeR=1.2,kernel=new CadKernel(oc);
 const doc={version:1,name:'disk',features:[{id:'disk',op:'cylinder',params:{radius:R,height:3},refs:[]},{id:'drill',op:'cylinder',params:{radius:holeR,height:3},refs:[]},{id:'bore',op:'transform',params:{x:hole[0],y:hole[1],z:0},refs:['drill']},{id:'plate',op:'cut',params:{},refs:['disk','bore']}],hidden:[],imports:{}};
 await kernel.rebuild(doc);const faceId=topFace(kernel.activeShape('plate'));
 // Design hole is close-fitting (0.05 mm clearance) so a 0.04 mm centroid shift matters.
 const entry={id:'round',revision:1,draft:{schemaVersion:1,name:'圆牌',support:{kind:'circle',centerMm:[0,0],radiusMm:R},throughHoles:[{kind:'circle',centerMm:hole,radiusMm:holeR+.05}],protectedZones:[],heightRangeMm:[0,.4],points:[],fieldSettings:{columns:65,rows:65,toleranceMm:.0001,edits:[{mode:'raise',centerMm:[-4,0],radiusMm:4,amountMm:.25,strength:1}]}}};
 const {api,base}=pageFor(kernel,'plate',entry);
 try{
  assert.equal((await api.reliefDesignField({...base(),action:'solve'})).status,'solved');
  const fit=await api.reliefDesignFit({...base(),action:'fit',options:{mode:'emboss',controlColumns:17,controlRows:17,controlMaxMm:.4,acceptanceToleranceMm:.1}});assert.equal(fit.status,'fitted',JSON.stringify(fit.error));
  const s0=await api.prepareReliefDesignRelief({...base(),target:{bodyId:'plate',faceId}});const s=s0.support;assert.ok(s,JSON.stringify(s0.error));
  assert.equal(s.circularEdges.length,2);
  const byR=[...s.circularEdges].sort((a,b)=>a.radiusMm-b.radiusMm),[bore,rim]=byR;
  assert.ok(Math.abs(bore.radiusMm-holeR)<1e-9&&Math.abs(rim.radiusMm-R)<1e-9);
  for(const [e,c] of [[bore,[hole[0],hole[1],3]],[rim,[0,0,3]]])e.centerMm.forEach((v,i)=>assert.ok(Math.abs(v-c[i])<1e-9,`edge centre ${e.centerMm} vs ${c}`));
  assert.ok(Math.hypot(s.centerMm[0],s.centerMm[1])>.03,'centroid is shifted by the bore');
  const req=placement=>({...base(),target:{bodyId:'plate',faceId,expectedSourceSha256:s.sourceSha256},placement,datum:{kind:'authoredBaselineOnSelectedFace',baselineMm:0},machiningIntent:intent});
  const bad=await api.prepareReliefDesignRelief(req({originMm:[0,0,3],alignTo:{kind:'circularEdge',edgeIndex:rim.edgeIndex},xDirection:[1,0,0]}));assert.equal(bad.status,'failed');assert.equal(bad.error.code,'PARAM_SCHEMA_INVALID');
  const missing=await api.prepareReliefDesignRelief(req({alignTo:{kind:'circularEdge',edgeIndex:999},xDirection:[1,0,0]}));assert.equal(missing.status,'failed');
  const aligned=await api.prepareReliefDesignRelief(req({alignTo:{kind:'circularEdge',edgeIndex:rim.edgeIndex},xDirection:[1,0,0]}));
  assert.equal(aligned.status,'prepared',JSON.stringify(aligned.blockers));assert.deepEqual(aligned.resolvedOriginMm,rim.centerMm);
  const body=(await kernel.rebuild({...doc,features:[...doc.features,{id:'relief',op:'relief',refs:['plate'],params:aligned.previewArgs.params}]})).bodies.find(b=>b.id==='relief');
  assert.equal(body.solidCount,1);assert.ok(body.reliefReport.addedMm3>0);
  const v=cad.makeVertex([hole[0],hole[1],1.5]);try{assert.ok(cad.measureDistanceBetween(kernel.activeShape('relief'),v)>=holeR-1e-6);}finally{v.delete();}
  // Same request placed at the (shifted) face centroid: explicit rejection, never clipped geometry.
  const off=await api.prepareReliefDesignRelief(req({originMm:s.centerMm,xDirection:[1,0,0]}));
  if(off.status==='prepared')await assert.rejects(kernel.rebuild({...doc,features:[...doc.features,{id:'relief',op:'relief',refs:['plate'],params:off.previewArgs.params}]}),e=>e.code==='RELIEF_OUTSIDE_FACE');
  else assert.notEqual(off.status,'prepared');
 }finally{globalThis.Worker=old;kernel.dispose();}
});
