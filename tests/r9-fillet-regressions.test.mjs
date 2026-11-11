// Round9 R角/圆润 regressions (87-case probe): never commit a partial or wrong
// fillet as success, NO_CHANGE for bodies without sharp edges, unified
// edge/face/body/mixed selection, verified maximum feasible radius suggestion.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildEdgeBlend,buildSelectorFillet} from '../src/edge-blend.js';
import {topologyDetails,buildSmoothTransition} from '../src/smooth-transition.js';
import {buildRoundTool} from '../src/modeling/rounding/round-tool.js';
import {buildRounding} from '../src/modeling/rounding/index.js';
import {millFeasibility} from '../src/modeling/rounding/mill-fillet-fallback.js';
import {adaptUISelection} from '../src/ui-selection-adapter.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

const box=()=>cad.makeBox([0,0,0],[40,30,20]),plate=()=>cad.makeBox([0,0,0],[40,30,2]),cyl=()=>cad.makeCylinder(10,20);
const L=()=>cad.draw([0,0]).lineTo([40,0]).lineTo([40,10]).lineTo([10,10]).lineTo([10,30]).lineTo([0,30]).close().sketchOnPlane('XY').extrude(15);
const torus=()=>cad.drawCircle(4).translate(15,0).sketchOnPlane('XZ').revolve();
const sharpCount=s=>topologyDetails(s).filter(r=>r.sharp).length;
function rejects(make,params,options,check){
  const s=make(),before=s.serialize();
  try{assert.throws(()=>buildEdgeBlend(s,'fillet',params,options),e=>{check?.(e);return true;});assert.equal(s.serialize(),before,'source preserved');}
  finally{s.delete();}
}
function commits(make,params,check,options){
  const s=make();let r;
  try{r=buildEdgeBlend(s,'fillet',params,options);check(r,s);}finally{r?.delete();s.delete();}
}

test('A07/A08 whole box below the limit still commits with zero sharp edges',()=>{
  for(const radius of [3,9.9])commits(box,{radius,allEdges:true},r=>{assert.equal(sharpCount(r),0);assert.equal(r.blendReport.status,'committed');assert.deepEqual(r.blendReport.failedEdgeIds,[]);assert.equal(r.blendReport.remainingSharpEdgeCount,0);assert.equal(r.blendReport.radiusPerEdge.length,12);});
});
test('A09/A10 whole box R10/R12 is a failure, never a partial mill commit; max radius is suggested and verified',()=>{
  for(const radius of [10,12])rejects(box,{radius,allEdges:true},{suggestRadius:true},e=>{
    assert.equal(e.code,'GEOMETRY_INVALID');assert.equal(e.report.status,'failed');assert.deepEqual(e.report.processedEdgeIds,[]);
    assert.equal(e.report.cause,'radius-exceeds-local-space');
    const max=e.report.maxFeasibleRadiusMm;assert.ok(max>9.5&&max<10,`max ${max}`);
    assert.ok(e.report.attempts.every(a=>a.strategy!=='mill-complementary-all-targets'||!a.ok));
  });
  commits(box,{radius:10,allEdges:true,radiusFallback:'maxFeasible'},r=>{assert.equal(r.blendReport.strategy,'native-max-feasible-radius');assert.equal(r.blendReport.radiusReduced,true);assert.ok(r.blendReport.amount<10);assert.equal(sharpCount(r),0);},{suggestRadius:true});
});
test('A16 cylinder R=radius fails with finite geometry instead of a 263-face spike',()=>{
  rejects(cyl,{radius:10,allEdges:true},{suggestRadius:true},e=>{assert.equal(e.report.status,'failed');assert.ok(e.report.maxFeasibleRadiusMm===null||e.report.maxFeasibleRadiusMm<10);assert.ok(e.report.millFeasibility.reasons.some(r=>r.includes('curved')));});
  commits(cyl,{radius:9.5,allEdges:true},r=>assert.equal(sharpCount(r),0));
});
test('A44/A45 2 mm plate R1/R1.5 fails; R0.9 commits; geometric limit ~R1',()=>{
  for(const radius of [1,1.5])rejects(plate,{radius,allEdges:true},{suggestRadius:true},e=>{assert.ok(e.report.maxFeasibleRadiusMm<1);assert.ok(e.report.millFeasibility.geometricLimitMm<=1+1e-9);assert.match(e.message,/可用最大约 R0\.9/);});
  commits(plate,{radius:.9,allEdges:true},r=>assert.equal(sharpCount(r),0));
  const s=plate();try{const f=millFeasibility(s,topologyDetails(s).filter(r=>r.sharp).map(r=>r.edgeId),1);assert.equal(f.fits,false);assert.ok(f.reasons.some(r=>r.includes('opposite-fillets-overlap')||r.includes('corner')));}finally{s.delete();}
});
test('G01/G02 fillet after fillet: success has zero sharp edges, leftover creases are rejected',()=>{
  const pre=()=>{const s=box(),r=buildEdgeBlend(s,'fillet',{radius:2,edgeIds:[0]});s.delete();return r;};
  commits(pre,{radius:1,allEdges:true},r=>assert.equal(sharpCount(r),0));
  rejects(pre,{radius:3,allEdges:true},{},e=>{assert.equal(e.report.status,'failed');});
  // G03: already fully rounded body is NO_CHANGE
  const full=()=>{const s=box(),r=buildEdgeBlend(s,'fillet',{radius:2,allEdges:true});s.delete();return r;};
  rejects(full,{radius:1,allEdges:true},{},e=>assert.equal(e.code,'NO_CHANGE'));
});
test('A38/A39/B10 sphere and torus are NO_CHANGE for fillet, autoRound and round',()=>{
  for(const make of [()=>cad.makeSphere(10),torus]){
    rejects(make,{radius:1,allEdges:true},{},e=>{assert.equal(e.code,'NO_CHANGE');assert.equal(e.report.status,'no_change');});
    const s=make();
    try{
      assert.throws(()=>buildSmoothTransition(s,{allEdges:true,radius:1}),{code:'NO_CHANGE'});
      assert.throws(()=>buildRoundTool(s,{allEdges:true}),{code:'NO_CHANGE'});
    }finally{s.delete();}
  }
});
test('G06 mixed edge+face selection is the deduplicated union; allEdges stays exclusive',()=>{
  const s=box();let r;
  try{
    const rows=topologyDetails(s),face=5,boundary=rows.filter(x=>x.adjacentFaceIds.includes(face)).map(x=>x.edgeId);
    const extra=rows.find(x=>x.sharp&&!boundary.includes(x.edgeId)).edgeId;
    r=buildEdgeBlend(s,'fillet',{radius:2,edgeIds:[extra,boundary[0]],faceIds:[face]});
    assert.deepEqual([...r.blendReport.processedEdgeIds].sort((a,b)=>a-b),[...new Set([extra,...boundary])].sort((a,b)=>a-b));
    assert.equal(r.blendReport.scope,'mixed');
  }finally{r?.delete();s.delete();}
  assert.deepEqual(normalizeOperationParams('fillet',{radius:1,edgeIds:[0],faceIds:[1]}),{radius:1,edgeIds:[0],faceIds:[1]});
  assert.throws(()=>normalizeOperationParams('fillet',{radius:1,edgeIds:[0],allEdges:true}),{code:'SELECTION_CONFLICT'});
});
test('G07 single faces of an L-shape: each commits fully rounded or fails without partial commit',()=>{
  const s=L();let ok=0;
  try{
    const n=s.faces.length;
    for(let face=0;face<n;face++){
      let r;
      try{r=buildEdgeBlend(s,'fillet',{radius:2,faceIds:[face]});ok++;assert.deepEqual(r.blendReport.failedEdgeIds,[]);}
      catch(e){assert.equal(e.report?.status,'failed');assert.deepEqual(e.report.processedEdgeIds,[]);}
      finally{r?.delete();}
    }
    assert.ok(ok>=n-1,`${ok}/${n} faces`);
  }finally{s.delete();}
});
test('round: curved face boundary, whole body, visible default radius, body-only UI selection',()=>{
  const c=cyl();let r;
  try{const side=c.faces.findIndex(f=>f.geomType!=='PLANE');r=buildRoundTool(c,{faceIds:[side]});assert.equal(sharpCount(r),0);assert.ok(r.roundReport.radiusMm>=1);}finally{r?.delete();c.delete();}
  const b=box();
  try{r=buildRoundTool(b,{allEdges:true});assert.equal(r.roundReport.scope.kind,'body');assert.equal(sharpCount(r),0);assert.ok(r.roundReport.radiusMm>=2-1e-9);}finally{r?.delete();b.delete();}
  assert.deepEqual(adaptUISelection('round',{strength:.5},['b'],null),{strength:.5,allEdges:true});
  assert.deepEqual(adaptUISelection('fillet',{radius:1},['b'],null),{radius:1,allEdges:true});
  assert.deepEqual(adaptUISelection('round',{},['b'],{bodyId:'b',type:'face',ids:[3]}),{faceIds:[3]});
  assert.deepEqual(normalizeOperationParams('round',{allEdges:true}).allEdges,true);
});
test('C02 smoothTransition accepts one face (its boundary)',()=>{
  const s=box();let r;
  try{r=buildSmoothTransition(s,{faceIds:[0],radius:3});assert.equal(r.transitionReport.mode,'face-boundary');assert.equal(r.transitionReport.processedEdgeIds.length,4);assert.deepEqual(r.transitionReport.failedEdgeIds,[]);}finally{r?.delete();s.delete();}
});
test('F01 automatic polishing does not spread to unselected edges unless expand:network',()=>{
  const s=box();let r;
  try{
    try{r=buildRounding(s,{specVersion:3,scope:{kind:'edges',edgeIds:[0]}});assert.deepEqual(r.roundingReport.region.expandedEdgeIds,[]);}
    catch(e){assert.equal(e.code,'SCOPE_EXPANSION_REQUIRED');assert.ok(e.report.proposedExpandedEdgeIds.length>0);}
    r?.delete();r=null;
    r=buildRounding(s,{specVersion:3,expand:'network',scope:{kind:'edges',edgeIds:[0]}});
    assert.ok(r.roundingReport.region.expandedEdgeIds.length>0);
  }finally{r?.delete();s.delete();}
});
test('A11 variable radius selector path writes the unified blendReport after acceptance',()=>{
  const s=box();let r;
  try{r=buildSelectorFillet(s,{selector:{edgeIds:[0]},radiusMm:4,blendLaw:{startRadiusMm:2,endRadiusMm:6}});assert.equal(r.blendReport.strategy,'native-variable-radius');assert.deepEqual(r.blendReport.processedEdgeIds,[0]);assert.equal(r.blendReport.acceptance.selectedEdgesRounded,'passed');}finally{r?.delete();s.delete();}
});
test('mill fallback is never used for a real corner or curved edge',()=>{
  const s=box();
  try{
    const rows=topologyDetails(s),a=rows[0],b=rows.find(r=>r.edgeId!==a.edgeId&&r.sharp&&[r.startPoint,r.endPoint].some(p=>[a.startPoint,a.endPoint].some(q=>Math.hypot(...p.map((v,i)=>v-q[i]))<1e-6)));
    const f=millFeasibility(s,[a.edgeId,b.edgeId],1);assert.equal(f.fits,false);assert.ok(f.reasons.some(r=>r.includes('corner')));
    assert.equal(millFeasibility(s,[a.edgeId],1).fits,true);
  }finally{s.delete();}
  const c=cyl();try{assert.equal(millFeasibility(c,[topologyDetails(c).find(r=>r.sharp).edgeId],1).fits,false);}finally{c.delete();}
});
