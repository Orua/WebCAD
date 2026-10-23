// 261023 relief fixes: grid budget, adaptive field/control net, edge margins on resize, face placement, BRep receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetGridSize,RELIEF_GRID_NODE_BUDGET} from '../src/relief-source/convert.js';
import {adaptiveFieldResolution,adaptiveBrowserControlNet,effectiveEdgeMargins,facePlacementFrame,RELIEF_FIELD_AUTO_MAX_SIDE} from '../src/relief-design-field.js';
import {brepExecutionSummary} from '../src/ui/forms/relief-design-brep-panel.js';

test('grid budget keeps 1025² and downsamples above it with aspect',()=>{
 assert.deepEqual(budgetGridSize(1025,1025),{columns:1025,rows:1025,downsampled:false});
 const r=budgetGridSize(2049,1025);assert.equal(r.downsampled,true);assert.ok(r.columns<=1025&&r.rows<=1025&&r.columns*r.rows<=RELIEF_GRID_NODE_BUDGET);
 assert.ok(Math.abs(r.columns/r.rows-2)<.02);
 assert.equal(budgetGridSize(513,513).downsampled,false);
});
const draft=(w,h,grid,keep=0,fade=0)=>({support:{kind:'rectangle',centerMm:[0,0],widthMm:w,heightMm:h},...(grid?{heightSource:{source:{grid},edgeKeepoutMm:keep,edgeFadeMm:fade}}:{})});
test('field resolution adapts to height source and precision',()=>{
 assert.deepEqual(adaptiveFieldResolution(draft(60,60)),{columns:33,rows:33,auto:false});
 const a=adaptiveFieldResolution(draft(60,30,{columns:1025,rows:513}),.05);
 assert.equal(a.columns,RELIEF_FIELD_AUTO_MAX_SIDE);assert.equal(a.rows,65);assert.equal(a.auto,true);
 const small=adaptiveFieldResolution(draft(2,2,{columns:1025,rows:1025}),.05);assert.equal(small.columns,41);
 const lowGrid=adaptiveFieldResolution(draft(60,60,{columns:64,rows:64}),.05);assert.equal(lowGrid.columns,64);
});
test('browser control net auto ≤33 keeps aspect',()=>{
 assert.deepEqual(adaptiveBrowserControlNet(129,65),{columns:33,rows:17});
 assert.deepEqual(adaptiveBrowserControlNet(20,20),{columns:20,rows:20});assert.deepEqual(adaptiveBrowserControlNet(2,2),{columns:9,rows:9});
});
test('edge keepout/fade scale down on small supports',()=>{
 const big=effectiveEdgeMargins(draft(60,60,{columns:9,rows:9},2,3));assert.equal(big.scaled,false);assert.equal(big.keepMm,2);
 const s=effectiveEdgeMargins(draft(18,18,{columns:9,rows:9},5,3));assert.equal(s.scaled,true);assert.equal(effectiveEdgeMargins(draft(40,40,{columns:9,rows:9},5,3)).scaled,false);
 assert.ok(Math.abs(s.keepMm+s.fadeMm-4.5)<1e-12);assert.ok(Math.abs(s.keepMm/s.fadeMm-5/3)<1e-12);
});
const rot=(q,v)=>{const [x,y,z,w]=q,u=[x,y,z],c=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],t=c(u,v).map(e=>2*e),r=c(u,t);return v.map((e,i)=>e+w*t[i]+r[i]);};
test('face placement frame maps local axes to the face',()=>{
 for(const [n,x] of [[[0,0,1],[1,0,0]],[[0,0,-1],[1,0,0]],[[1,0,0],[0,1,0]],[[0,1,1],[1,0,0]],[[-1,0,0],[0,0,1]]]){
  const f=facePlacementFrame({originMm:[1,2,3],normal:n,xDirection:x});assert.deepEqual(f.origin,[1,2,3]);
  const nz=Math.hypot(...n),z=rot(f.quaternion,[0,0,1]);z.forEach((c,i)=>assert.ok(Math.abs(c-n[i]/nz)<1e-9));
  const X=rot(f.quaternion,[1,0,0]);X.forEach((c,i)=>assert.ok(Math.abs(c-x[i])<1e-9));
 }
 assert.throws(()=>facePlacementFrame({originMm:[0,0],normal:[0,0,1],xDirection:[1,0,0]}),/placement/);
});
test('BRep receipt shows side, stage, control net and error',()=>{
 const run=brepExecutionSummary({lastDecision:{executor:'remote',reason:'capacity'},pendingWait:{jobId:'j1',elapsedMs:3000}},{elapsedMs:3500});
 assert.match(run,/Services/);assert.match(run,/j1/);
 const done=brepExecutionSummary({lastDecision:{executor:'remote'},lastReliefDesign:{controlNet:[257,129],maxErrorMm:.03,rmsErrorMm:.01,qualityCapacityRetry:{fromMaxControlSide:1025,toMaxControlSide:513}}},{elapsedMs:9000,done:true});
 assert.match(done,/257×129/);assert.match(done,/1025→513/);assert.match(done,/0\.0300/);
 assert.match(brepExecutionSummary({lastDecision:{executor:'local',reason:'Services 不可用'}},{done:true}),/浏览器（本地回退） — Services 不可用/);
});
import {createBilinearObservation} from '../src/relief-design-core/field-solver.mjs';
import {convertSourceOnServices} from '../src/services/relief-pipeline.js';
import {encodeHeightGrid} from '../src/relief-source/convert.js';
import {normalizeReliefDesignFitOptions} from '../src/relief-design-fit.js';
import {reliefVolumeReview} from '../src/services/geometry-exchange.js';
test('default browser fit uses Worker cancellation; explicit work budgets remain enforceable',()=>{
 const options={mode:'emboss',controlColumns:33,controlRows:33,acceptanceToleranceMm:.05};
 assert.equal(normalizeReliefDesignFitOptions(options).maxWork,undefined);
 assert.equal(normalizeReliefDesignFitOptions({...options,maxWork:100}).maxWork,100);
 assert.equal(normalizeReliefDesignFitOptions({...options,maxWork:1000000000}).maxWork,1000000000);
});
test('volume discrepancy is a visible candidate warning while strict and invalid reports reject',()=>{
 const feature={params:{designBinding:{audit:{deviationPolicy:'candidate'}}}},report={fit:{report:{deviationPolicy:'candidate'}},quality:{consistent:false,geometryValid:true,fieldIntegralMm3:9.086923803,gpropDeltaMm3:9.468712897,bestRel:.042015219}};
 const q=reliefVolumeReview(feature,report);assert.equal(q.consistent,false);assert.equal(q.status,'candidate-volume-unverified');assert.ok(q.warnings.includes('RELIEF_VOLUME_UNVERIFIED'));
 assert.equal(report.quality.status,undefined);
 assert.throws(()=>reliefVolumeReview({params:{designBinding:{audit:{deviationPolicy:'strict'}}}},report),{code:'RESULT_MISMATCH'});
 assert.throws(()=>reliefVolumeReview(feature,{...report,quality:{...report.quality,geometryValid:false}}),{code:'RESULT_MISMATCH'});
 assert.throws(()=>reliefVolumeReview(feature,{...report,quality:{...report.quality,bestRel:NaN}}),{code:'RESULT_MISMATCH'});
 assert.match(brepExecutionSummary({lastDecision:{executor:'remote'},lastReliefDesign:{volumeReview:{consistent:false,relativeError:.042015219}}},{done:true}),/4\.20%/);
});
test('Services downsample receipt is read from manifest separately from the grid artifact',async()=>{
 const asked={columns:2049,rows:9},b=budgetGridSize(asked.columns,asked.rows),grid=encodeHeightGrid({...b,values:new Float64Array(b.columns*b.rows)});
 const client={upload:async()=>({assetId:'a',sha256:'0'.repeat(64)}),submit:async()=>({jobId:'j'}),wait:async()=>({manifest:{downsampledFrom:[2049,9]},result:{grid}})};
 const r=await convertSourceOnServices({rgba:new Uint8Array(16),params:{width:2,height:2,settings:asked},context:{documentId:'d',documentInstanceId:'i',revision:1},imageSha256:'0'.repeat(64),client});
 assert.deepEqual(r.downsampledFrom,[2049,9]);assert.equal(r.settings.columns,b.columns);assert.equal(r.settings.rows,b.rows);
 client.wait=async()=>({manifest:{downsampledFrom:[1025,9]},result:{grid}});
 await assert.rejects(convertSourceOnServices({rgba:new Uint8Array(16),params:{width:2,height:2,settings:asked},context:{revision:1},imageSha256:'0'.repeat(64),client}),/降采样回执/);
});
test('node-aligned samples never add round-off terms on neighbouring (possibly inactive) nodes',()=>{
 for(const [c,w] of [[121,6],[129,50],[97,13.7]]){const g={columns:c,rows:c,widthMm:w,heightMm:w};
  for(let i=0;i<c;i++){const x=(0-w/2+i*w/(c-1))-0,o=createBilinearObservation(g,{id:'p',xMm:x,yMm:x,valueMm:0});
   assert.equal(o.indices.length,1,`${c}/${i}`);assert.equal(o.coefficients[0],1);}}
});
