import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {getTool,readDocs} from '../src/page-api-docs.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=params=>kernel.rebuild({version:1,features:[{id:'sample',op:'quickModel',refs:[],params,name:'sample'}],imports:{},hidden:[]});
const sizeOf=result=>result.bodies[0].bounds.max.map((v,i)=>v-result.bodies[0].bounds.min[i]);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);

assert.ok(QUICK_MODELS.dBuckle.fields.some(field=>field.key==='sectionChamfer'));
const dCard=getTool({id:'quickModel'}).inputSchema.oneOf.find(item=>item.properties?.kind?.const==='dBuckle');
assert.ok(dCard.properties.section.enum.includes('chamferedSquare'));
assert.equal(dCard.properties.sectionChamfer.type,'number');
assert.match(readDocs({docId:'recipes.chamfered-wire-frame'}).text,/sectionChamfer/);
const pg4819={kind:'dBuckle',section:'chamferedSquare',sectionSize:6,sectionChamfer:1.5,
  innerWidth:25,innerHeight:16.5,innerRadius:2,gapWidth:0};
const d=await run(pg4819);
assert.equal(d.stats.solids,1);
sizeOf(d).forEach((actual,i)=>near(actual,[37,28.5,6][i]));
assert.ok(d.stats.volume>0);

const rect=await run({...pg4819,kind:'rectBuckle',innerWidth:30,innerHeight:24,innerRadius:3});
assert.equal(rect.stats.solids,1);
sizeOf(rect).forEach((actual,i)=>near(actual,[42,36,6][i]));

const open=await run({kind:'openArcRing',section:'chamferedSquare',sectionSize:6,
  sectionChamfer:1.5,innerDiameter:30,openingAngle:70});
assert.equal(open.stats.solids,1);
assert.ok(open.stats.volume>0);
const before=(await kernel.export('brep')).data;
for(const bad of [0,3,4]){
  await assert.rejects(run({...pg4819,sectionChamfer:bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log('PASS chamfered square sweep: PG4819 D frame, rectangle, open arc and invalid chamfer rollback');
