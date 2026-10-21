import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeLogoForMachining,validateLogoMachining} from '../src/logo-machining-optimization.js';
import {validateRegions} from '../src/logo-model.js';
import {fitRasterRing,contourDeviationBound} from '../src/logo-contour-fit.js';
const square=(x,y,w)=>[[x,y],[x+w,y],[x+w,y+w],[x,y+w]];
test('explicit mm optimization retains original contours and prunes only compact small regions and holes',()=>{
 const logo={name:'fixture',sizeMm:[10,10],regions:[{outer:[[0,0],[5,.01],[10,0],[10,10],[0,10]],holes:[square(3,3,.1),square(5,5,1)]},{outer:square(11,1,.1),holes:[]},{outer:[[12,0],[12.05,0],[12.05,5],[12,5]],holes:[]}],source:{sha256:'source',reviewed:true}};
 const before=structuredClone(logo),result=optimizeLogoForMachining(logo,{enabled:true,toleranceMm:.05,minDetailMm:.2});
 assert.deepEqual(logo,before);assert.deepEqual(result.source.machiningOriginalContours.regions,before.regions);
 assert.equal(result.regions.length,2);assert.equal(result.regions[0].holes.length,1);assert.equal(result.regions[0].outer.length,4);
 assert.equal(result.source.reviewed,false);assert.equal(result.source.machiningOptimization.removedRegions,1);assert.equal(result.source.machiningOptimization.removedHoles,1);
 assert.ok(result.source.machiningOptimization.maxDeviationMm<=.05);assert.doesNotThrow(()=>validateRegions(result));
 assert.throws(()=>optimizeLogoForMachining(result,{enabled:true}),{code:'LOGO_REVIEW_STALE'});
});
test('omitted or disabled optimization preserves the exact object; malformed mm settings reject',()=>{
 const logo={};assert.equal(optimizeLogoForMachining(logo),logo);assert.equal(optimizeLogoForMachining(logo,{enabled:false}),logo);
 for(const value of [null,[],{unknown:true},{enabled:1},{toleranceMm:-.1},{toleranceMm:.11},{minDetailMm:1.1},{toleranceMm:NaN}])assert.throws(()=>validateLogoMachining(value),{code:'PARAM_SCHEMA_INVALID'});
});
test('discarding the complete artwork returns a reason instead of an empty valid logo',()=>{
 assert.throws(()=>optimizeLogoForMachining({regions:[{outer:square(0,0,.1),holes:[]}]},{enabled:true,minDetailMm:.2}),error=>error.code==='NO_VECTOR_CONTENT'&&/尺寸/.test(error.details.logoFailure.reason));
});
test('raster reconstruction straightens pixel noise while retaining real corners',()=>{
 const ring=[[0,0],[1,.009],[2,-.008],[3,.01],[4,0],[4,3],[0,3]];
 const f=fitRasterRing(ring,.04);
 assert.equal(f.rejected,false);assert.ok(f.lines>=4);assert.ok(f.ring.length<ring.length);
 assert.ok(f.ring.some((p,i)=>Math.abs(p[1]-f.ring[(i+1)%f.ring.length][1])<.003&&Math.abs(p[0]-f.ring[(i+1)%f.ring.length][0])>3.9));
 assert.notEqual(contourDeviationBound(ring,f.ring,.04),null);
});
test('curved raster boundaries fit arcs with a certified two-sided complete-boundary deviation',()=>{
 const ring=Array.from({length:160},(_,i)=>{const a=i*Math.PI/80,r=1+(i%2?.004:-.004);return [r*Math.cos(a),r*Math.sin(a)];});
 const f=fitRasterRing(ring,.03);assert.equal(f.rejected,false);assert.ok(f.arcs>=4);assert.ok(f.bound<=.03);
 assert.equal(contourDeviationBound(square(0,0,1),square(0,0,2),.05),null);
});
test('narrow raster tolerance uses the short physical dimension, preserves holes and original source',()=>{
 const logo={sizeMm:[60,2],source:{kind:'raster'},regions:[{outer:[[0,0],[30,.005],[60,0],[60,2],[0,2]],holes:[square(2,.5,.5)]}]};
 const r=optimizeLogoForMachining(logo,{enabled:true,toleranceMm:.1,minDetailMm:0});
 assert.equal(r.source.machiningOptimization.toleranceMm,.04);assert.equal(r.source.machiningOptimization.requestedToleranceMm,.1);
 assert.equal(r.regions[0].holes.length,1);assert.deepEqual(r.source.machiningOriginalContours.regions,logo.regions);assert.doesNotThrow(()=>validateRegions(r));
 const zero=optimizeLogoForMachining(logo,{enabled:true,toleranceMm:0,minDetailMm:0});assert.deepEqual(zero.regions,logo.regions);
});
