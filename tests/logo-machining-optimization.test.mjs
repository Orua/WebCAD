import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeLogoForMachining,validateLogoMachining} from '../src/logo-machining-optimization.js';
import {validateRegions} from '../src/logo-model.js';
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
