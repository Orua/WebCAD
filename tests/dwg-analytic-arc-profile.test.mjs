import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import { CadKernel } from '../src/cad-kernel.js';
import { getOperation } from '../src/operation-registry.js';
import { readDocs } from '../src/page-api-docs.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const line=(a,b)=>({type:'line',points:[a,b]});
const arc=(a,m,b)=>({type:'arc',points:[a,m,b]});
const outer=[line([0,0],[10,0]),arc([10,0],[12.5,2.5],[10,5]),line([10,5],[0,5]),line([0,5],[0,0])];
const hole=[arc([6,2.5],[5,3.5],[4,2.5]),arc([4,2.5],[5,1.5],[6,2.5])];
const params={outer,holes:[hole],height:3};
const rebuild=async p=>kernel.rebuild({version:1,features:[{id:'analytic',op:'arcProfile',refs:[],params:p}],imports:{},hidden:[]});
const result=await rebuild(params);
assert.equal(result.stats.solids,1);
assert.ok(Math.abs(result.stats.volume-(50+Math.PI*2.5**2/2-Math.PI)*3)<1e-5);
const size=result.bodies[0].bounds.max.map((v,i)=>v-result.bodies[0].bounds.min[i]);
[12.5,5,3].forEach((n,i)=>assert.ok(Math.abs(size[i]-n)<1e-6));
assert.ok((await kernel.export('step')).data.byteLength>0);
assert.ok(getOperation('arcProfile').inputSchema.properties.outer);
assert.match(readDocs({docId:'recipes.analytic-arc-profile'}).text,/api\.run/);
for(const bad of [
  {...params,outer:[...outer.slice(0,-1),line([0,5],[0,0.1])]},
  {...params,outer:[...outer.slice(0,1),arc([10,0],[11,0],[12,0]),...outer.slice(2)]},
  {...params,holes:[[arc([30,0],[31,1],[32,0]),arc([32,0],[31,-1],[30,0])]]},
  {...params,height:0},
])await assert.rejects(rebuild(bad));
kernel.dispose();
console.log('PASS exact LINE/ARC profile with hole, analytic volume, STEP and invalid-input rollback');
