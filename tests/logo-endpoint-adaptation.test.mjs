import test from 'node:test';
import assert from 'node:assert/strict';
import {fitLogoToMachining} from '../src/logo-machining-optimization.js';
import {inspectLogoMachiningCapacity,validateRegions} from '../src/logo-model.js';

const circle=(radius,n)=>Array.from({length:n},(_,i)=>[radius*Math.cos(i*2*Math.PI/n),radius*Math.sin(i*2*Math.PI/n)]);
test('automatic fit makes dense artwork machinable while preserving holes, physical bounds and its original',()=>{
 const logo={type:'webcad-logo',version:1,units:'mm',name:'dense-outline',sizeMm:[40,40],regions:[{outer:circle(20,14000),holes:[circle(8,5000)]}],source:{sha256:'original'}};
 const source=structuredClone(logo),result=fitLogoToMachining(logo);
 assert.equal(inspectLogoMachiningCapacity(logo).supported,false);
 assert.equal(inspectLogoMachiningCapacity(result).supported,true);
 assert.equal(result.regions.length,1);assert.equal(result.regions[0].holes.length,1);
 assert.deepEqual(logo,source);assert.deepEqual(result.source.machiningOriginalContours.regions,source.regions);
 assert.equal(Math.max(...result.regions[0].outer.map(p=>p[0])),20);
 assert.equal(Math.min(...result.regions[0].outer.map(p=>p[0])),-20);
 assert.ok(result.source.endpointAdaptation.maxDeviationMm<=result.source.endpointAdaptation.allowedDeviationMm);
 assert.doesNotThrow(()=>validateRegions(result));
});
test('an explicitly disabled or zero-deviation fit retains original geometry',()=>{
 const logo={sizeMm:[40,40],regions:[{outer:circle(20,4000),holes:[]}]};
 assert.equal(fitLogoToMachining(logo,{enabled:false}),logo);
 assert.equal(fitLogoToMachining(logo,{toleranceMm:0}),logo);
});
