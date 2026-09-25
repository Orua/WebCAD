import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {readDocs} from '../src/page-api-docs.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const sourceCandidate={kind:'twinWindowPlate',outerWidth:24,outerHeight:21,outerRadius:6,
  windowWidth:17,totalInnerHeight:14,windowRadius:2,barWidth:3,thickness:3.5,edgeRadius:0};
const run=params=>kernel.rebuild({version:1,features:[{id:'plate',op:'quickModel',params,refs:[],name:'plate'}],imports:{},hidden:[]});
assert.match(readDocs({docId:'recipes.small-twin-window'}).text,/PG4307/);
const result=await run(sourceCandidate);
assert.equal(result.stats.solids,1);
const size=result.bodies[0].bounds.max.map((value,i)=>value-result.bodies[0].bounds.min[i]);
[24,21,3.5].forEach((value,i)=>assert.ok(Math.abs(size[i]-value)<1e-6,`bound ${i}: ${size[i]}`));
const area=(w,h,r)=>w*h-(4-Math.PI)*r*r;
const expected=(area(24,21,6)-2*area(17,(14-3)/2,2))*3.5;
assert.ok(Math.abs(result.stats.volume-expected)<1e-5);
const step=await kernel.export('step');
const imported=await kernel.rebuild({version:1,features:[{id:'imported',op:'import',params:{key:'pg4307'},refs:[]}],imports:{pg4307:{format:'step',data:Buffer.from(step.data).toString('base64')}},hidden:[]});
assert.equal(imported.stats.solids,1);
assert.ok(Math.abs(imported.stats.volume-expected)<1e-5);
const before=(await kernel.export('brep')).data;
await assert.rejects(run({...sourceCandidate,barWidth:14}));
assert.equal((await kernel.export('brep')).data,before);
kernel.dispose();
console.log('PASS PG4307 twin-window candidate: nominal envelope, analytic volume, STEP roundtrip and rollback');
