import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const model=QUICK_MODELS.arcBandPlate;
assert.ok(quickModelIconKinds.includes('arcBandPlate'));
assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
for(const field of model.fields)assert.ok(Object.hasOwn(model.defaults,field.key));
const run=(id,params)=>kernel.rebuild({version:1,features:[{id,op:'quickModel',refs:[],params,name:id}],imports:{},hidden:[]});
const input={kind:'arcBandPlate',...model.defaults,recessDepth:0.7};
const analytic=p=>{
  const area=(p.spanAngle*Math.PI/180)/2*(p.outerRadius**2-p.innerRadius**2);
  return area*p.thickness-2*Math.PI*(p.holeDiameter/2)**2*p.thickness
    -2*Math.PI*((p.recessDiameter/2)**2-(p.holeDiameter/2)**2)*p.recessDepth;
};
for(const [id,params] of [['PG5752-B',input],['variant',{...input,outerRadius:24,innerRadius:18,spanAngle:135,holeInsetAngle:12,thickness:4,recessDepth:0}]]){
  const result=await run(id,params);
  assert.equal(result.stats.solids,1);
  assert.ok(Math.abs(result.stats.volume-analytic(params))<1e-4,`${id} analytic volume ${result.stats.volume}`);
  const bounds=result.bodies[0].bounds;
  assert.ok(Math.abs(bounds.max[2]-params.thickness)<1e-5&&Math.abs(bounds.min[2])<1e-5,`${id} thickness`);
  if(id==='PG5752-B'){
    assert.ok(Math.abs(result.stats.volume-802.0140647087536)<1e-4,'PG5752 source-geometry candidate volume');
    assert.ok(Math.abs(bounds.max[0]-16.51022654898958)<1e-4,'outer arc endpoint bound');
    const out=await kernel.export('step');
    const imported=await kernel.rebuild({version:1,features:[{id:'imported',op:'import',params:{key:'pg5752'},refs:[]}],imports:{pg5752:{format:'step',data:Buffer.from(out.data).toString('base64')}},hidden:[]});
    assert.equal(imported.stats.solids,1);
    assert.ok(Math.abs(imported.stats.volume-result.stats.volume)<1e-4,'STEP roundtrip volume');
  }
}
const before=(await kernel.export('brep')).data;
for(const bad of [{outerRadius:15},{innerRadius:20},{spanAngle:350},{holeInsetAngle:0},{holeInsetAngle:60},{holeDiameter:5},{recessDiameter:5},{recessDepth:5},{recessDepth:NaN}]){
  await assert.rejects(run('invalid',{...input,...bad}));
  assert.equal((await kernel.export('brep')).data,before);
}
kernel.dispose();
console.log('PASS PG5752 B annular band: source arc and hole geometry, analytic volume, STEP roundtrip, variant, invalid rollback');
