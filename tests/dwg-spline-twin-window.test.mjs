import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {traceTwinWindowProfile} from '../src/dwg-spline-twin-window.js';
import {getTool,readDocs} from '../src/page-api-docs.js';

assert.equal(getTool({id:'traceTwinWindow'}).id,'traceTwinWindow');
assert.match(readDocs({docId:'api.dwg-spline-twin-window'}).text,/vectorProfile/);
const input={
  outerLeft:[[0,21],[-2,16],[-3,10.5],[-2,5],[0,0]],
  outerRight:[[18,21],[20,16],[21,10.5],[20,5],[18,0]],
  innerLeft:[[3,17.5],[1,14],[0,10.5],[1,7],[3,3.5]],
  innerRight:[[15,17.5],[17,14],[18,10.5],[17,7],[15,3.5]],
  barTopY:12,barBottomY:9,
};
const traced=traceTwinWindowProfile(input);
assert.equal(traced.status,'read');
assert.deepEqual(traced.size,[24,21]);
assert.equal(traced.regions.length,1);
assert.equal(traced.regions[0].holes.length,2);
const reduced=traceTwinWindowProfile({...input,simplifyToleranceMm:0.1});
assert.deepEqual(reduced.size,traced.size);
assert.ok(reduced.maxObservedDeviationMm<=0.1);
assert.ok(reduced.sidePointCounts.reduce((a,b)=>a+b,0)<=traced.sourcePointCounts.reduce((a,b)=>a+b,0));
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=regions=>kernel.rebuild({version:1,features:[{id:'source',op:'vectorProfile',params:{regions,output:'solid',height:3.5},refs:[]}],imports:{},hidden:[]});
const built=await run(traced.regions);
assert.equal(built.stats.solids,1);
assert.ok(built.stats.volume>0);
const size=built.bodies[0].bounds.max.map((value,i)=>value-built.bodies[0].bounds.min[i]);
[24,21,3.5].forEach((value,i)=>assert.ok(Math.abs(size[i]-value)<1e-6));
const step=await kernel.export('step');
const imported=await kernel.rebuild({version:1,features:[{id:'imported',op:'import',params:{key:'twin'},refs:[]}],imports:{twin:{format:'step',data:Buffer.from(step.data).toString('base64')}},hidden:[]});
assert.equal(imported.stats.solids,1);
assert.ok(Math.abs(imported.stats.volume-built.stats.volume)<1e-4);
const before=(await kernel.export('brep')).data;
for(const bad of [{barTopY:9,barBottomY:12},{outerRight:input.outerRight.toReversed()},{innerRight:input.innerLeft},{barTopY:20},{simplifyToleranceMm:-0.01},{simplifyToleranceMm:0.3}]){
  assert.throws(()=>traceTwinWindowProfile({...input,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log('PASS sampled spline twin-window: closed vectorProfile, dimensions, STEP and invalid-input rollback');
