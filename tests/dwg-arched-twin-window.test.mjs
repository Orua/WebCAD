import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';
import {readDocs} from '../src/page-api-docs.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const model=QUICK_MODELS.archedTwinWindowPlate;
assert.ok(quickModelIconKinds.includes('archedTwinWindowPlate'));
assert.match(readDocs({docId:'recipes.arched-twin-window'}).text,/bendRadius/);
for(const field of model.fields)assert.ok(Object.hasOwn(model.defaults,field.key));
const run=(id,params)=>kernel.rebuild({version:1,features:[{id,op:'quickModel',params,refs:[],name:id}],imports:{},hidden:[]});
const cases=[
  {id:'PG5821',params:model.defaults,expected:[32.9,25.5],depth:[4.2,4.4]},
  {id:'variant',params:{...model.defaults,outerWidth:40,windowWidth:30,bendRadius:60},expected:[40,25.5],depth:[3.6,3.8]},
];
for(const p of cases){
  const result=await run(p.id,{kind:'archedTwinWindowPlate',...p.params});
  assert.equal(result.stats.solids,1);
  const size=result.bodies[0].bounds.max.map((v,i)=>v-result.bodies[0].bounds.min[i]);
  p.expected.forEach((n,i)=>assert.ok(Math.abs(size[i]-n)<1e-5,`${p.id} planar bound ${i}`));
  assert.ok(size[2]>p.depth[0]&&size[2]<p.depth[1],`${p.id} arch depth ${size[2]}`);
  assert.ok(result.stats.volume>0);
}
const before=(await kernel.export('brep')).data;
for(const bad of [{bendRadius:10},{radialThickness:50},{outerWidth:20},{barWidth:18.5},{windowRadius:6}]){
  await assert.rejects(run('invalid',{kind:'archedTwinWindowPlate',...model.defaults,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log('PASS PG5821 thin-strip arched plate and alternate dimensions: valid solids, projected bounds, measured depths and invalid rollback');
