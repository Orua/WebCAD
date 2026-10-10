import test from 'node:test';
import assert from 'node:assert/strict';
import {planContour,contourConversionReport} from '../src/modeling/manufacturing/relief-curves.js';
import {contourPlanIntersections} from '../src/modeling/manufacturing/relief-plan-intersections.js';
import {planRegionContours,CONTOUR_TOPOLOGY_REPORT_VERSION} from '../src/modeling/manufacturing/relief-region-plan.js';
import {planReliefTopologyUpgrade} from '../src/services/relief-plan.js';
import {geometryRecipeFingerprint} from '../src/services/geometry-exchange.js';
import {normalizeOperationParams,getOperation} from '../src/operation-registry.js';
import {reliefExample} from '../src/modeling/manufacturing/relief-contracts.js';
import {heightValuesFromRgba,rasterDimensions} from '../src/relief-image.js';
import fs from 'node:fs';
import {UI_LAYOUT} from '../src/ui/config/ui-layout.js';
import {toolDisabledReason} from '../src/tool-state.js';
import {reliefContours} from '../src/relief-contours.js';
import {validateRegions} from '../src/logo-model.js';

test('image contours preserve a hole and diagonal silhouettes independently of height resolution',()=>{
 const grid=Array.from({length:65},(_,y)=>Array.from({length:65},(_,x)=>Math.hypot(x-32,y-32)<25&&Math.hypot(x-32,y-32)>9?1:0));
 const regions=reliefContours(grid);assert.equal(regions.length,1);assert.equal(regions[0].holes.length,1);validateRegions({regions});
 const full=reliefContours(Array.from({length:17},()=>Array(17).fill(1)));validateRegions({regions:full});
 assert.equal(full.length,1);
});

test('relief has a strict bounded heightfield contract and unique menu ownership',()=>{
 const card=getOperation('relief');assert.ok(card.strictContract);assert.ok(card.errorCodes.includes('RELIEF_OUTSIDE_FACE'));
 const actions=UI_LAYOUT.tabs.flatMap(t=>t.groups.flatMap(g=>g[1]));assert.equal(actions.filter(a=>a==='relief').length,1);
 assert.equal(UI_LAYOUT.tabs.find(t=>t.id==='machine').label,'面加工');assert.equal(UI_LAYOUT.tabs.find(t=>t.id==='solidMachine').label,'实体加工');
 assert.match(toolDisabledReason('relief',{kernelReady:true,busy:false,selectedIds:[]}),/选面/);
 assert.deepEqual(normalizeOperationParams('relief',reliefExample).values,reliefExample.values);
 for(const patch of [{depthMm:0},{widthMm:-1},{values:[[1]]},{values:reliefExample.values.map(r=>r.map(()=>2))},{unexpected:1}])assert.throws(()=>normalizeOperationParams('relief',{...reliefExample,...patch}));
});
test('RGBA preserves orientation, transparency and explicit brightness polarity',()=>{
 const pixels=new Uint8ClampedArray(4*4*4).fill(255);pixels.set([0,0,0,255],0);pixels.set([0,0,0,0],4);
 const v=heightValuesFromRgba(pixels,4,4);assert.equal(v[3][0],1);assert.equal(v[3][1],0);assert.equal(v[0][0],0);
 const inverse=heightValuesFromRgba(pixels,4,4,{whiteHigh:true});assert.equal(inverse[3][0],0);assert.equal(inverse[3][1],0);assert.equal(inverse[0][0],1);
});
test('rounded silhouette has continuously changing height controls instead of a flat plateau',()=>{
 const size=9,pixels=new Uint8ClampedArray(size*size*4).fill(255);for(let y=1;y<8;y++)for(let x=1;x<8;x++)pixels.set([0,0,0,255],(y*size+x)*4);
 const v=heightValuesFromRgba(pixels,size,size,{style:'rounded'});assert.equal(v[0][0],0);assert.equal(v[4][4],1);assert.ok(v[1][4]>0&&v[1][4]<v[3][4]);
 assert.throws(()=>heightValuesFromRgba(pixels,size,size,{threshold:2}),/参数/);
});

test('raster dimensions are bounded before decoder allocation and malformed headers reject',()=>{
 const jpg=fs.readFileSync(new URL('../agent/temp/relief-waves.jpg',import.meta.url));
 assert.deepEqual(rasterDimensions(jpg,'jpg'),{width:129,height:129});
 assert.throws(()=>rasterDimensions(jpg.subarray(0,20),'jpg'),e=>e.code==='RELIEF_IMAGE_INVALID');
 const png=new Uint8Array(33),view=new DataView(png.buffer);png.set([137,80,78,71,13,10,26,10]);view.setUint32(8,13);view.setUint32(12,0x49484452);view.setUint32(16,300);view.setUint32(20,200);
 assert.deepEqual(rasterDimensions(png,'png'),{width:300,height:200});
 view.setUint32(16,100000);view.setUint32(20,100000);assert.throws(()=>rasterDimensions(png,'png'),e=>e.code==='RELIEF_LIMIT');
 assert.throws(()=>rasterDimensions(new Uint8Array([255,216,255,224,255,255]),'jpg'),e=>e.code==='RELIEF_IMAGE_INVALID');
});
test('real seven-point arc fragment is split when final samples exceed the unchanged fit tolerance',()=>{
 const points=[[32.62945547745075,-21.836799999999926,2.5248866665358576],[32.44523121153434,-22.121800000000007,2.5248866665358576],[32.24108055786197,-22.366800000000012,2.5248866665358576],[32.00206130931319,-22.621800000000007,2.5248866665358576],[31.772987521036928,-22.82179999999994,2.5248866665358585],[31.568801855567955,-22.95679999999993,2.5248866665358585],[31.155418351898003,-23.191799999999944,2.5248866665358585]],normal=[0,0,1],tolerance=.01;
 const rejected=contourConversionReport(points,normal,[{type:'arc',start:points[0],mid:points[3],end:points[6]}],tolerance,false);
 assert.equal(rejected.accepted,false);assert(rejected.maxSampledDeviationMm>tolerance);
 const planned=planContour(points,normal,tolerance,false);assert.equal(planned.report.accepted,true);assert(planned.segments.length>1);assert(planned.report.maxSampledDeviationMm<=tolerance+1e-8);assert.equal(planned.report.toleranceMm,tolerance);
});
test('real adjacent line/arc can intersect away from their shared vertex',()=>{
 const segments=[{type:'line',start:[15.825171784921453,-14.431799999999951,2.5248866665358585],end:[16.019976300337667,-14.436799999999948,2.5248866665358585]},{type:'arc',start:[16.019976300337667,-14.436799999999948,2.5248866665358585],mid:[15.970026881305799,-14.451799999999935,2.5248866665358585],end:[15.94505205337742,-14.481800000000023,2.5248866665358585]}];
 const intersections=contourPlanIntersections([{segments}],[0,0,1]);assert.equal(intersections.length,1);assert.deepEqual(intersections[0].segmentIndices,[0,1]);
 assert.equal(contourPlanIntersections([{segments:[{type:'line',start:[0,0,0],end:[1,0,0]},{type:'line',start:[1,0,0],end:[1,1,0]}]}],[0,0,1]).length,0);
});
test('explicit topology policy preserves source boundaries near a narrow hole clearance',()=>{
 const rings=[[[0,0,0],[2,0,0],[2,2,0],[0,2,0]],[[.005,.5,0],[.5,.5,0],[.5,1,0],[.005,1,0]]],before=JSON.stringify(rings),result=planRegionContours(rings,[0,0,1],.01,'preserveTopology');
 assert.deepEqual(result.preservedRingIndices,[0,1]);assert.equal(JSON.stringify(rings),before);assert.equal(result.sourceCoordinatesChanged,false);assert(result.plans.every(p=>p.report.suppliedSegmentsPreserved&&p.report.toleranceMm===.01&&p.report.maxSampledDeviationMm===0));
 assert.throws(()=>contourPlanIntersections([{segments:[{type:'line',start:[0,0,0],end:[1,0,0]},{type:'line',start:[1,0,0],end:[1,1,0]}]}],[0,0,1],{maxPairs:0}),{code:'RELIEF_PLAN_LIMIT'});
});

test('contour topology receipts distinguish ring causes and measured fit tolerance without changing plans',()=>{
 const rings=[[[0,0,0],[2,0,0],[2,2,0],[0,2,0]],[[.005,.5,0],[.5,.5,0],[.5,1,0],[.005,1,0]]],normal=[0,0,1],result=planRegionContours(rings,normal,.01,'preserveTopology');
 assert.equal(result.reportVersion,CONTOUR_TOPOLOGY_REPORT_VERSION);
 for(const [index,plan]of result.plans.entries()){
  const report=plan.report;assert.equal(report.ringIndex,index);assert.equal(report.role,index?'hole':'outer');assert.deepEqual(report.reasons,['source-clearance-within-fit-budget']);
  assert.equal(report.fitToleranceMm,0);assert.equal(report.toleranceMm,.01);assert.equal(report.sourceSplineDeviation,'unknown');assert.equal(report.errorBound,'sampled-not-global');
  assert.deepEqual(plan.segments,planContour(rings[index],normal,0).segments);assert.equal(report.sourceEdgeCount,4);assert.equal(report.resultEdgeCount,4);
 }
 const legacy=planRegionContours(rings,normal,.01);assert.equal(legacy.plans[0].report.topologyCheck,'not-requested');assert.deepEqual(legacy.plans[0].segments,planContour(rings[0],normal,.01).segments);
 const exact=planRegionContours(rings,normal,0,'preserveTopology');assert(exact.plans.every(p=>p.report.suppliedSegmentsPreserved));assert.deepEqual(exact.plans[0].report.reasons,['explicit-zero-tolerance']);
});

test('explicit relief topology upgrade is pure, preserves all design fields and changes recipe identities',()=>{
 const params={faceId:0,point:[0,0,0],widthMm:20,heightMm:20,depthMm:.8,curveToleranceMm:.01,baseMm:.005,maskStrategy:'faceWithHolesExtrude',layers:[{heightMm:.3,regions:[{outer:[[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]],holes:[[[-.1,-.1],[-.1,.1],[.1,.1],[.1,-.1]]]}]},{heightMm:.8,startHeightMm:.29,regions:[{outer:[[-.2,-.2],[.2,-.2],[.2,.2],[-.2,.2]]}]}]},before=structuredClone(params);
 Object.freeze(params);const upgrade=planReliefTopologyUpgrade(params);assert.deepEqual(params,before);assert.notStrictEqual(upgrade.params.layers,params.layers);
 assert.deepEqual(upgrade.params,{...before,curvePolicy:'preserveTopology'});assert.deepEqual(upgrade.receipt.changes,[{path:'/curvePolicy',beforePresent:false,after:'preserveTopology'}]);
 assert.equal(upgrade.receipt.designPreserved,true);assert.equal(upgrade.receipt.commitState,'notCommitted');assert.equal(upgrade.receipt.geometryComputed,false);assert.equal(upgrade.receipt.toleranceMm,.01);assert.equal(upgrade.receipt.sourceSplineDeviation,'unknown');
 assert.notEqual(upgrade.receipt.beforeParamsFingerprint,upgrade.receipt.afterParamsFingerprint);assert(upgrade.receipt.invalidationRequired.includes('feature-and-dependent-compiled-checkpoints'));
 const source={id:'source',op:'cylinder',params:{radius:50,height:20},refs:[]},feature={id:'relief',op:'relief',params,refs:['source']},doc={features:[source,feature],imports:{}};
 assert.notEqual(geometryRecipeFingerprint(doc,'relief'),geometryRecipeFingerprint({...doc,features:[source,{...feature,params:upgrade.params}]},'relief'));
 const repeated=planReliefTopologyUpgrade(upgrade.params);assert.equal(repeated.receipt.status,'no-change');assert.equal(repeated.receipt.requiresExplicitApply,false);assert.deepEqual(repeated.receipt.invalidationRequired,[]);assert.deepEqual(repeated.params,upgrade.params);
 const {maskStrategy,...unspecified}=before;assert.throws(()=>planReliefTopologyUpgrade(unspecified),{code:'RELIEF_UPGRADE_STRATEGY_REQUIRED',stage:'contour-upgrade-plan'});
 for(const strategy of ['faceWithHolesExtrude','cutHoleSolids']){
  const explicit=planReliefTopologyUpgrade(unspecified,{maskStrategy:strategy});assert.equal(explicit.params.maskStrategy,strategy);assert.equal(explicit.receipt.changes.length,2);
  assert.equal(explicit.receipt.before.localEffectiveMaskStrategy,'cutHoleSolids');assert.equal(explicit.receipt.before.remoteEffectiveMaskStrategy,'faceWithHolesExtrude');assert.equal(explicit.receipt.before.maskStrategy,null);
 }
});

test('unresolved source topology fails at contour planning without strategy or coordinate changes',()=>{
 const rings=[[[0,0,0],[3,0,0],[3,3,0],[0,3,0]],[[2,-1,0],[4,-1,0],[4,1,0],[2,1,0]]],before=structuredClone(rings);
 assert.throws(()=>planRegionContours(rings,[0,0,1],.01,'preserveTopology'),error=>error.code==='RELIEF_CURVE_TOPOLOGY_INVALID'&&error.stage==='contour-plan'&&error.report.sourceSplineDeviation==='unknown'&&error.report.sourceCoordinatesChanged===false);
 assert.deepEqual(rings,before);
});
