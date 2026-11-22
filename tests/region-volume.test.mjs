import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {createPageAPI} from '../src/page-api.js';
import {buildCurveSweep} from '../src/curve-sweep.js';
import {MODELING_DOCS} from '../src/modeling-guidance.js';
import {assertRegionBox,measureRegionVolume} from '../src/modeling/inspection/region-volume.js';
import {CadKernel} from '../src/cad-kernel.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

test('region boxes reject inverted or unbounded extents before any kernel work',()=>{
  assert.throws(()=>assertRegionBox([0,0,0],[0,1,1]),{code:'PARAM_RANGE_INVALID'});
  assert.throws(()=>assertRegionBox([2,0,0],[1,1,1]),{code:'PARAM_RANGE_INVALID'});
  assert.throws(()=>assertRegionBox([0,0,0],[1e7,1,1]),{code:'PARAM_RANGE_INVALID'});
  assert.throws(()=>assertRegionBox([0,0],[1,1,1]),{code:'PARAM_SCHEMA_INVALID'});
});

test('region volume is a read-only AABB intersection and distinguishes deep and shallow recess ends',()=>{
  const stock=cad.makeBox([0,0,0],[20,6,8]);
  const before=stock.serialize();
  const full=measureRegionVolume(stock,[1,2,7],[3,4,8],cad);
  assert.equal(full.overlap,true);
  assert.ok(Math.abs(full.volume-4)<1e-6,JSON.stringify(full));
  assert.equal(stock.serialize(),before);
  const params=JSON.parse(MODELING_DOCS['api.modeling.methods.fading-recess'].match(/```json\n([\s\S]*?)\n```/)[1]);
  const cutter=buildCurveSweep(params,cad);
  let result;
  try{
    result=stock.cut(cutter);
    const source=result.serialize(),whole=cad.measureVolume(result);
    const deep=measureRegionVolume(result,[1,2,7],[3,4,8],cad);
    const shallow=measureRegionVolume(result,[17,2,7],[19,4,8],cad);
    const miss=measureRegionVolume(result,[40,0,0],[42,2,2],cad);
    assert.equal(result.serialize(),source);
    assert.equal(cad.measureVolume(result),whole);
    assert.ok(deep.volume<shallow.volume-0.05,JSON.stringify({deep:deep.volume,shallow:shallow.volume}));
    assert.ok(deep.volume<4&&shallow.volume<4);
    assert.equal(miss.volume,0);
    assert.equal(miss.empty,true);
    assert.equal(miss.overlap,false);
    assert.equal(deep.source,'exact-brep-aabb-intersection');
  }finally{[result,cutter,stock].forEach(s=>s?.delete?.());}
});

test('kernel measureRegion does not treat the region as a full-body measurement',()=>{
  const kernel=new CadKernel(oc);
  const document={version:2,imports:{},features:[{id:'stock',op:'box',params:{width:20,depth:6,height:8},refs:[]}]};
  return kernel.rebuild(document).then(()=>{
    const whole=kernel.measure('stock');
    const region=kernel.measureRegion('stock',[1,2,7],[3,4,8]);
    assert.equal(region.kind,'region');
    assert.ok(Math.abs(region.volume-4)<1e-6);
    assert.ok(Math.abs(whole.volume-960)<1e-6);
    assert.notEqual(region.volume,whole.volume);
    const after=kernel.measure('stock');
    assert.equal(after.volume,whole.volume);
  });
});

test('page measure kind:region forwards bounds, labels AABB source and leaves revision unchanged',async()=>{
  let forwarded;
  const api=createPageAPI({
    buildId:'test',
    state:()=>({status:'read',context:{sessionId:'s',documentId:'d',documentInstanceId:'i',revision:3},summary:{name:'Stock',kernelReady:true,busy:false,dirty:false},preview:{active:false,computing:false},bodies:[{id:'body-1',faceCount:6,edgeCount:12}],features:[]}),
    display:()=>({status:'not_rendered'}),
    measure:async input=>{forwarded=input;return {volume:1.5,solidCount:1,empty:false,overlap:true,bounds:{min:[1,2,7],max:[3,4,8]}};},
    files:async()=>({status:'read'}),confirmSaved:async()=>({saved:true})
  });
  const base={context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:3},bodyId:'body-1'};
  for(const input of [
    {...base,kind:'region'},
    {...base,kind:'region',minMm:[1,2,7],maxMm:[1,4,8]},
    {...base,kind:'region',minMm:[1,2,7],maxMm:[3,4,8],topologyId:0},
    {...base,kind:'body',minMm:[1,2,7],maxMm:[3,4,8]},
    {context:base.context,points:[[0,0,0],[1,0,0]],minMm:[0,0,0],maxMm:[1,1,1]}
  ])assert.equal((await api.measure(input)).status,'failed',JSON.stringify(input));
  assert.equal(forwarded,undefined);
  const result=await api.measure({...base,kind:'region',minMm:[1,2,7],maxMm:[3,4,8]});
  assert.equal(result.status,'read');
  assert.equal(result.source,'exact-brep-aabb-intersection');
  assert.equal(result.volume,1.5);
  assert.deepEqual(forwarded.minMm,[1,2,7]);
  assert.equal(api.getState().context.revision,3);
});


test('region inspection releases owned intersection solid and bounding-box handles on success and failure',()=>{
 for(const fail of [false,true]){
  const deleted=[],owned=name=>({delete(){deleted.push(name);}}),solid=owned('solid'),bounds={...owned('bounds'),bounds:[[0,0,0],[1,1,1]]},common={...owned('common'),solids:[solid],boundingBox:bounds},work={...owned('work'),intersect:()=>common},probe=owned('probe'),fakeCad={deserializeShape:()=>work,makeBox:()=>probe,measureVolume:()=>{if(fail)throw Error('native measure failed');return 1;}};
  fakeCad.getOC=()=>({BRepAlgoAPI_Common:class{Build(){}Clear(){}IsDone(){return true;}SimplifyResult(){}Shape(){return {...owned('raw'),IsNull:()=>false};}delete(){deleted.push('builder');}}});fakeCad.cast=()=>common;
  const invoke=()=>measureRegionVolume({serialize:()=>''},[0,0,0],[1,1,1],fakeCad);
  if(fail)assert.throws(invoke,/native measure/);else assert.equal(invoke().volume,1);
  assert.ok(deleted.includes('solid'),'intersection solid retains native surface data unless explicitly released');
  if(!fail)assert.ok(deleted.includes('bounds'));
  assert.ok(deleted.includes('common')&&deleted.includes('work')&&deleted.includes('probe'));
 }
});


test('region inspection owns its native Common builder and never reports a native exception as empty material',()=>{
 for(const mode of ['empty','throw','not-done']){
  const deleted=[],owned=name=>({wrapped:{},delete(){deleted.push(name);}}),raw={...owned('raw'),IsNull:()=>true},work={...owned('work'),intersect(){throw Error('native common failed');}},fakeCad={deserializeShape:()=>work,makeBox:()=>owned('probe'),getOC:()=>({BRepAlgoAPI_Common:class{Build(){if(mode==='throw')throw Error('native common failed');}Clear(){}IsDone(){return mode!=='not-done';}SimplifyResult(){}Shape(){return raw;}delete(){deleted.push('builder');}}})};
  const invoke=()=>measureRegionVolume({serialize:()=>''},[0,0,0],[1,1,1],fakeCad);
  if(mode==='empty')assert.equal(invoke().empty,true);else assert.throws(invoke,/native common failed|区域交集/);
  assert.ok(deleted.includes('builder'),'the retained native BOP data structure is much larger than its returned shape');
 }
});


test('repeated native material queries clear retained Boolean working data on success and failure',()=>{
 for(const broken of [false,true]){
  let retained=0,cleared=0,deleted=0;
  const fakeCad={deserializeShape:()=>({wrapped:{},delete(){}}),makeBox:()=>({wrapped:{},delete(){}}),getOC:()=>({BRepAlgoAPI_Common:class{
   constructor(){retained++;}Build(){if(broken)throw Error('native operation failed');}IsDone(){return true;}Shape(){return {IsNull:()=>true,delete(){}};}
   Clear(){retained--;cleared++;}delete(){deleted++;}
  }})};
  for(let i=0;i<12;i++){
   const inspect=()=>measureRegionVolume({serialize:()=>''},[0,0,0],[1,1,1],fakeCad);
   if(broken)assert.throws(inspect,/native operation failed/);else assert.equal(inspect().empty,true);
   assert.equal(retained,0,'a finished/failed query must not retain the native Boolean working data until process exit');
  }
  assert.equal(cleared,12);assert.equal(deleted,12);
 }
});
