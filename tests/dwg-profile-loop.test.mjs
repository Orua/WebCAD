import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const model=QUICK_MODELS.profileLoop;
assert.ok(quickModelIconKinds.includes('profileLoop'));
assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
for(const field of model.fields)assert.ok(Object.hasOwn(model.defaults,field.key));
const run=(id,params)=>kernel.rebuild({version:1,features:[{id,op:'quickModel',params,refs:[],name:id}],imports:{},hidden:[]});
const expectedVolume=p=>{
  const area=p.sectionWidth*p.sectionDepth-(4-Math.PI)*p.sectionRadius**2;
  const pathLength=2*(p.innerWidth-p.innerHeight)+Math.PI*(p.innerHeight+p.sectionWidth);
  return area*pathLength;
};
const source={kind:'profileLoop',innerWidth:35.2,innerHeight:14.6,sectionWidth:5.5,sectionDepth:6,sectionRadius:2.5};
for(const [id,params] of [
  ['PG3195',source],
  ['other',{...source,innerWidth:31,innerHeight:12,sectionWidth:4.2,sectionDepth:5,sectionRadius:1.3}],
  ['PG10669',{...source,innerWidth:51,innerHeight:15,sectionWidth:4,sectionDepth:8,sectionRadius:2}],
  ['PG10670',{...source,innerWidth:76,innerHeight:15,sectionWidth:4,sectionDepth:8,sectionRadius:2}],
  ['wide-stadium',{...source,innerWidth:51,innerHeight:15,sectionWidth:8,sectionDepth:4,sectionRadius:2}],
  ['round-limit',{...source,innerWidth:51,innerHeight:15,sectionWidth:4,sectionDepth:4,sectionRadius:2}],
]){
  const result=await run(id,params);
  assert.equal(result.stats.solids,1);
  const size=result.bodies[0].bounds.max.map((v,i)=>v-result.bodies[0].bounds.min[i]);
  [params.innerWidth+2*params.sectionWidth,params.innerHeight+2*params.sectionWidth,params.sectionDepth].forEach((n,i)=>assert.ok(Math.abs(size[i]-n)<1e-5,`${id} bound ${i}: ${size[i]}`));
  assert.ok(Math.abs(result.stats.volume-expectedVolume(params))<1e-4,`${id} volume ${result.stats.volume}`);
  if(id==='PG3195')assert.ok(Math.abs(result.stats.volume-2883.5972567049357)<1e-4,'independent text-to-cad STEP volume');
  if(id==='PG10669'){
    assert.ok(Math.abs(result.stats.volume-3761.9127854079406)<1e-4,'PG10669 stadium-section kernel volume');
    const out=await kernel.export('step');
    const imported=await kernel.rebuild({version:1,features:[{id:'imported',op:'import',params:{key:'pg10669'},refs:[]}],imports:{pg10669:{format:'step',data:Buffer.from(out.data).toString('base64')}},hidden:[]});
    assert.equal(imported.stats.solids,1);
    assert.ok(Math.abs(imported.stats.volume-result.stats.volume)<1e-4,'PG10669 STEP roundtrip volume');
  }
}
const before=(await kernel.export('brep')).data;
for(const bad of [{innerWidth:14.6},{innerHeight:0},{sectionWidth:0},{sectionDepth:0},{sectionRadius:0},{sectionRadius:2.5},{sectionRadius:NaN}]){
  await assert.rejects(run('invalid',{...source,sectionWidth:4.2,sectionDepth:5,sectionRadius:1.3,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log('PASS PG3195, PG10669 and PG10670 rounded/stadium section capsules: six sizes, analytic volumes, STEP roundtrip, invalid rollback');
