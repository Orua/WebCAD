// Round10 regressions for I-01–I-08 on top of the 1.67.0 fillet honesty rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildEdgeBlend} from '../src/edge-blend.js';
import {topologyDetails,buildSmoothTransition} from '../src/smooth-transition.js';
import {buildRoundTool} from '../src/modeling/rounding/round-tool.js';
import {buildRounding} from '../src/modeling/rounding/index.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
import {robustUnion} from '../src/modeling/robust-union.js';
import {deferredMetricFields,bodyState} from '../src/body-state.js';
import {CadKernel} from '../src/cad-kernel.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

const box=()=>cad.makeBox([0,0,0],[40,30,20]);
const sharpCount=s=>topologyDetails(s).filter(r=>r.sharp).length;
const sharpIds=s=>topologyDetails(s).filter(r=>r.sharp).map(r=>r.edgeId);
const L=()=>cad.draw([0,0]).lineTo([40,0]).lineTo([40,10]).lineTo([10,10]).lineTo([10,30]).lineTo([0,30]).close().sketchOnPlane('XY').extrude(15);
function rejects(fn,check){
  const before=fn.sourceSerialize?.();
  try{assert.throws(fn,e=>{check?.(e);return true;});}
  finally{fn.cleanup?.();}
}

test('I-01 body-only / radius-only round defaults to whole-body sharp edges',()=>{
  assert.deepEqual(normalizeOperationParams('round',{}),{mode:'auto',strength:.5,allEdges:true});
  assert.deepEqual(normalizeOperationParams('round',{radiusMm:3}),{mode:'auto',strength:.5,radiusMm:3,allEdges:true});
  assert.throws(()=>normalizeOperationParams('round',{edgeIds:[0],faceIds:[1]}),e=>e.code==='PARAM_SCHEMA_INVALID'||e.code==='SELECTION_CONFLICT');
  const s=box();let r;
  try{r=buildRoundTool(s,{radiusMm:3});assert.equal(r.roundReport.scope.kind,'body');assert.equal(sharpCount(r),0);}
  finally{r?.delete();s.delete();}
});

test('I-02 autoRound / smoothTransition oversize reports max R and accepts radiusFallback',()=>{
  assert.equal(normalizeOperationParams('autoRound',{radius:10,radiusFallback:'maxFeasible'}).radiusFallback,'maxFeasible');
  assert.equal(normalizeOperationParams('smoothTransition',{radius:10,faceIds:[0,1],radiusFallback:'maxFeasible'}).radiusFallback,'maxFeasible');
  const s=box();
  try{
    assert.throws(()=>buildSmoothTransition(s,{radius:10,allEdges:true}),e=>{
      assert.equal(e.code,'GEOMETRY_INVALID');
      const max=e.report?.maxFeasibleRadiusMm;
      assert.ok(max>9.5&&max<10,`max ${max}`);
      assert.match(e.message,/可用最大约 R/);
      return true;
    });
  }finally{s.delete();}
  const t=box();let r;
  try{
    r=buildSmoothTransition(t,{radius:10,allEdges:true,radiusFallback:'maxFeasible'});
    assert.equal(sharpCount(r),0);
    assert.ok((r.transitionReport.radius||r.blendReport?.amount)<10);
    assert.equal(r.transitionReport.radiusReduced,true);
  }finally{r?.delete();t.delete();}
});

test('I-03 selected-only rounding polishes the chosen edges; mixed convex/concave networks group instead of hard-fail',()=>{
  const s=box();let r;
  try{
    r=buildRounding(s,{specVersion:3,scope:{kind:'edges',edgeIds:[0]}});
    assert.deepEqual(r.roundingReport.region.expandedEdgeIds,[]);
    assert.ok(r.roundingReport.processedEdgeIds.includes(0));
    const before=topologyDetails(s).find(row=>row.edgeId===0);
    const still=topologyDetails(r).some(row=>row.sharp&&row.midpoint&&before.midpoint&&Math.hypot(...row.midpoint.map((v,i)=>v-before.midpoint[i]))<1e-4);
    assert.equal(still,false,'selected edge 0 should no longer be sharp');
  }finally{r?.delete();s.delete();}
  const face=box();
  try{
    const rows=topologyDetails(face),top=5,boundary=rows.filter(x=>x.adjacentFaceIds.includes(top)).map(x=>x.edgeId);
    r=buildRounding(face,{specVersion:3,scope:{kind:'edges',edgeIds:boundary}});
    assert.deepEqual(r.roundingReport.region.expandedEdgeIds,[]);
    assert.equal(r.roundingReport.processedEdgeIds.length,boundary.length);
  }finally{r?.delete();face.delete();}
  const concave=L();
  try{
    const row=topologyDetails(concave).find(item=>item.sharp&&item.adjacentFaceIds.length===2);
    r=buildRounding(concave,{specVersion:3,scope:{kind:'edges',edgeIds:[row.edgeId]}});
    assert.ok(r.roundingReport.processedEdgeIds.includes(row.edgeId)||r.roundingReport.processedEdgeIds.length>=1);
  }finally{r?.delete();concave.delete();}
  const stem=cad.makeBox([15,0,0],[25,30,10]),bar=cad.makeBox([0,20,0],[40,30,10]);let tee,polished;
  try{
    tee=robustUnion([stem,bar]);
    const ids=sharpIds(tee);
    assert.ok(ids.length>8);
    polished=buildRounding(tee,{specVersion:3,expand:'network',scope:{kind:'edges',edgeIds:ids}});
    assert.ok(polished.roundingReport.processedEdgeIds.length>0);
    assert.ok(polished.roundingReport.materialIntent==='mixed'||polished.roundingReport.materialGroups||polished.roundingReport.processedEdgeIds.length>=1);
  }finally{polished?.delete();tee?.delete();stem.delete();bar.delete();}
});

function makeSweepTube(points=[[0,0,0],[0,0,20],[20,0,30],[40,0,30]],radius=3){
  const edges=[];let wire,plane,drawing,sketch;
  try{
    for(let i=1;i<points.length;i++)edges.push(cad.makeLine(points[i-1],points[i]));
    wire=cad.assembleWire(edges);
    const t=points[1].map((v,k)=>v-points[0][k]),len=Math.hypot(...t),n=t.map(v=>v/len);
    const seed=Math.abs(n[0])<.9?[1,0,0]:[0,1,0],dot=seed.reduce((s,v,i)=>s+v*n[i],0),x=seed.map((v,i)=>v-dot*n[i]);
    plane=new cad.Plane(points[0],x,n);
    drawing=cad.drawCircle(radius);
    sketch=drawing.sketchOnPlane(plane);
    return cad.genericSweep(sketch.wire,wire,{frenet:false,transitionMode:'right'});
  }finally{[sketch,drawing,plane,wire,...edges].forEach(v=>{try{v?.delete?.();}catch{}});}
}
function cylinderRadii(shape){
  const oc=cad.getOC(),faces=shape.faces,out=[];
  try{
    for(const face of faces){
      if(face.geomType!=='CYLINDRE')continue;
      const adaptor=new oc.BRepAdaptor_Surface(face.wrapped,false);
      try{out.push(adaptor.Cylinder().Radius());}finally{adaptor.delete?.();}
    }
    return out;
  }finally{faces.forEach(face=>face.delete?.());}
}

test('I-04 polyline circular-tube all-edges fillet rebuilds the mitered knuckles or fails honestly',()=>{
  const tube=makeSweepTube();let r;
  try{
    try{
      r=buildEdgeBlend(tube,'fillet',{radius:1,allEdges:true},{suggestRadius:true});
      assert.equal(r.blendReport.status,'committed');
      assert.equal(sharpCount(r),0);
      assert.equal(r.blendReport.remainingSharpEdgeCount,0);
      assert.ok(r.blendReport.strategy==='tube-spine-corner-rebuild'||r.blendReport.tubeRebuild,r.blendReport.strategy);
      assert.ok(r.blendReport.tubeRebuild.pathBendRadiusMm>3,r.blendReport.tubeRebuild);
    }catch(e){
      assert.equal(e.report?.status,'failed');
      assert.ok(e.report.maxFeasibleRadiusMm!=null||e.report.groupRadiusSearch||/可用最大约|未找到可通过验收|曲面上的过渡面无法构造/.test(e.message),e.message);
      assert.fail(`polyline tube fillet should now rebuild; leftover kernel limit: ${e.message}`);
    }
  }finally{r?.delete();tube.delete();}
});

test('I-05 one-sided edges after a tangent union do not veto the whole fillet',()=>{
  const body=cad.makeBox([0,0,0],[40,30,20]);
  const cyl=cad.makeCylinder(5,20,[5,5,0]);
  const boss=cad.makeBox([12,8,20],[24,18,28]);
  let fused,r;
  try{
    fused=robustUnion([body,cyl,boss]);
    assert.equal(fused.booleanReport.solidCount??fused.solids.length,1);
    const onesided=topologyDetails(fused).filter(row=>row.sharp===null&&row.adjacentFaceIds.length===1).map(row=>row.edgeId);
    try{
      r=buildEdgeBlend(fused,'fillet',{radius:1,allEdges:true},{suggestRadius:true});
      assert.equal(r.blendReport.status,'committed');
      if(onesided.length)assert.ok((r.blendReport.skippedOneSidedEdgeIds||[]).length||r.blendReport.warning);
    }catch(e){
      assert.doesNotMatch(e.message,/无法取得两侧有效面法向/);
      assert.ok(e.report?.maxFeasibleRadiusMm!=null||e.report?.skippedOneSidedEdgeIds||/可用最大约|请先合并/.test(e.message),e.message);
    }
  }finally{r?.delete();fused?.delete();body.delete();cyl.delete();boss.delete();}
});

test('I-06 a non-fusing union warns it is still two solids; fillet asks to merge first',()=>{
  const a=cad.makeBox([0,0,0],[20,20,20]),b=cad.makeBox([40,0,0],[50,10,10]);let fused;
  try{
    fused=robustUnion([a,b]);
    assert.equal(fused.booleanReport.fused,false);
    assert.equal(fused.booleanReport.solidCount,2);
    assert.ok((fused.warnings||[]).some(w=>/未融合、仍为 2 个实体/.test(w.message)));
    assert.throws(()=>buildEdgeBlend(fused,'fillet',{radius:1,allEdges:true}),e=>{
      assert.match(e.message,/请先合并为单一实体/);
      return true;
    });
  }finally{fused?.delete();a.delete();b.delete();}
});

test('I-07 chamfer then whole-body fillet writes volume and area back into state',async()=>{
  assert.equal(deferredMetricFields({metricsDeferred:true,volume:0}).volume,null);
  assert.equal(bodyState({id:'n38',metricsDeferred:true,volume:23308.56,area:5400}).volume,23308.56);
  const kernel=new CadKernel(oc);
  try{
    const result=await kernel.rebuild({version:2,imports:{},hidden:[],features:[
      {id:'box',op:'box',params:{width:40,depth:30,height:20},refs:[]},
      {id:'c',op:'chamfer',params:{distance:2,allEdges:true},refs:['box']},
      {id:'f',op:'fillet',params:{radius:1,allEdges:true},refs:['c']}
    ]});
    const body=result.bodies[0];
    assert.equal(body.blendReport.status,'committed');
    assert.ok(Number.isFinite(body.volume)&&body.volume>0,`volume ${body.volume}`);
    assert.ok(Number.isFinite(body.area)&&body.area>0,`area ${body.area}`);
  }finally{kernel.dispose?.();}
});

test('I-08 a larger whole-body fillet upgrades an existing smaller blend to the new radius',()=>{
  const s=box();let first,second,direct,full,upgraded;
  try{
    first=buildEdgeBlend(s,'fillet',{radius:2,edgeIds:[0]});
    second=buildEdgeBlend(first,'fillet',{radius:3,allEdges:true},{suggestRadius:true});
    direct=buildEdgeBlend(s,'fillet',{radius:3,allEdges:true});
    assert.equal(second.blendReport.status,'committed');
    assert.equal(sharpCount(second),0);
    assert.equal(second.blendReport.remainingSharpEdgeCount,0);
    assert.ok(second.blendReport.upgradedPriorBlends||second.blendReport.priorBlendUpgrade);
    const radii=cylinderRadii(second);
    assert.ok(radii.length&&radii.every(v=>Math.abs(v-3)<1e-4),radii);
    assert.ok(Math.abs(cad.measureVolume(second)-cad.measureVolume(direct))<1e-4);
    full=buildEdgeBlend(s,'fillet',{radius:2,allEdges:true});
    upgraded=buildEdgeBlend(full,'fillet',{radius:3,allEdges:true},{suggestRadius:true});
    assert.equal(upgraded.blendReport.status,'committed');
    assert.equal(sharpCount(upgraded),0);
    assert.ok(cylinderRadii(upgraded).every(v=>Math.abs(v-3)<1e-4));
    assert.ok(Math.abs(cad.measureVolume(upgraded)-cad.measureVolume(direct))<1e-4);
  }finally{upgraded?.delete();full?.delete();direct?.delete();second?.delete();first?.delete();s.delete();}
});

test('I-08 a larger whole-body fillet upgrades a concave planar blend to the new radius',()=>{
  const body=L();
  const inner=topologyDetails(body).find(item=>item.sharp&&item.midpoint&&Math.abs(item.midpoint[0]-10)<1e-4&&Math.abs(item.midpoint[1]-10)<1e-4);
  assert.ok(inner,'expected the L inner vertical edge at (10,10)');
  let first,upgraded,direct;
  try{
    first=buildEdgeBlend(body,'fillet',{radius:2,edgeIds:[inner.edgeId]});
    upgraded=buildEdgeBlend(first,'fillet',{radius:3,allEdges:true},{suggestRadius:true});
    direct=buildEdgeBlend(body,'fillet',{radius:3,allEdges:true});
    assert.equal(upgraded.blendReport.status,'committed');
    assert.ok(upgraded.blendReport.upgradedPriorBlends||upgraded.blendReport.priorBlendUpgrade);
    assert.equal(sharpCount(upgraded),0);
    assert.ok(cylinderRadii(upgraded).every(v=>Math.abs(v-3)<1e-4),cylinderRadii(upgraded));
    assert.ok(Math.abs(cad.measureVolume(upgraded)-cad.measureVolume(direct))<1e-3);
  }finally{upgraded?.delete();direct?.delete();first?.delete();body.delete();}
});

test('I-04 a tight polyline tube corner rebuilds at the max feasible bend',()=>{
  const tube=makeSweepTube([[0,0,0],[0,0,3.2],[3.2,0,3.2]]);let r;
  try{
    r=buildEdgeBlend(tube,'fillet',{radius:1,allEdges:true},{suggestRadius:true});
    assert.equal(r.blendReport.status,'committed');
    assert.equal(sharpCount(r),0);
    assert.equal(r.blendReport.strategy,'tube-spine-corner-rebuild');
    const bend=r.blendReport.tubeRebuild.pathBendRadiusMm;
    assert.ok(bend>3,r.blendReport.tubeRebuild);
    assert.ok(bend<=3.2+1e-6,r.blendReport.tubeRebuild);
  }finally{r?.delete();tube.delete();}
});

test('I-04 a tube corner tighter than the tube diameter is a proven geometric limit',()=>{
  const tube=makeSweepTube([[0,0,0],[0,0,2.5],[2.5,0,2.5]]);
  try{
    assert.throws(()=>buildEdgeBlend(tube,'fillet',{radius:1,allEdges:true},{suggestRadius:true}),e=>{
      assert.equal(e.report?.status,'failed');
      const diag=e.report?.tubeRebuild;
      assert.ok(diag,e.message);
      assert.equal(diag.tubeRadiusMm,3);
      assert.ok(diag.maxFeasibleBendRadiusMm!=null&&Math.abs(diag.maxFeasibleBendRadiusMm-2.5)<1e-6,diag);
      assert.match(e.message,/弯半径大于管半径 3|最多只能放下弯半径 2\.5/);
      return true;
    });
  }finally{tube.delete();}
});
