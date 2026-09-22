import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';

const wasm=fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));
const kernel=new CadKernel(await init({wasmBinary:wasm}));
const f=(id,op,params={},refs=[])=>({id,op,params,refs,name:id});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<=Math.max(tolerance,Math.abs(b)*1e-7),`${a} != ${b}`);
const size=body=>body.bounds.max.map((v,i)=>v-body.bounds.min[i]);
const roundedArea=(w,d,r)=>w*d-(4-Math.PI)*r*r;
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}

await test('two templates expose complete bilingual UI metadata and exact requested defaults',()=>{
  const expected={bossPlate:{width:40,depth:16,thickness:3,cornerRadius:3,bossSpacing:24,bossOuterDiameter:8,boreDiameter:4,bossHeight:6},flangedBushing:{bodyDiameter:12,flangeDiameter:20,boreDiameter:6,bodyHeight:10,flangeThickness:3}};
  for(const [kind,defaults]of Object.entries(expected)){
    const model=QUICK_MODELS[kind];assert.deepEqual(model.defaults,defaults);assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
    for(const field of model.fields){assert.ok(field.label&&field.labelEn);assert.ok(Object.hasOwn(model.defaults,field.key));}
  }
  assert.match(QUICK_MODELS.bossPlate.description,/通用|参数/);assert.match(QUICK_MODELS.bossPlate.descriptionEn,/Generic/);
  assert.match(QUICK_MODELS.flangedBushing.description,/通用|参数/);assert.match(QUICK_MODELS.flangedBushing.descriptionEn,/Generic/);
});
await test('boss plate has one exact solid, analytic volume and required bounds',async()=>{
  for(const p of [QUICK_MODELS.bossPlate.defaults,{...QUICK_MODELS.bossPlate.defaults,cornerRadius:8},{...QUICK_MODELS.bossPlate.defaults,width:40,depth:40,cornerRadius:20,bossSpacing:16}]){
    const {bodies,stats}=await run([f('boss','quickModel',{kind:'bossPlate',...p})]);assert.equal(stats.solids,1);
    const plateArea=roundedArea(p.width,p.depth,p.cornerRadius),holes=Math.PI*(p.boreDiameter/2)**2;
    const expectedVolume=(plateArea-2*holes)*p.thickness+2*Math.PI*((p.bossOuterDiameter/2)**2-(p.boreDiameter/2)**2)*p.bossHeight;
    near(stats.volume,expectedVolume);const bounds=bodies[0].bounds;size(bodies[0]).forEach((v,i)=>near(v,[p.width,p.depth,p.bossHeight+p.thickness][i]));near(bounds.min[2],-p.bossHeight);near(bounds.max[2],p.thickness);
  }
});
await test('flanged bushing is one exact coaxial solid with through bore and requested bounds',async()=>{
  for(const p of [QUICK_MODELS.flangedBushing.defaults,{...QUICK_MODELS.flangedBushing.defaults,bodyDiameter:12,flangeDiameter:12}]){
    const {bodies,stats}=await run([f('bushing','quickModel',{kind:'flangedBushing',...p})]);assert.equal(stats.solids,1);
    const annulus=Math.PI*((p.flangeDiameter/2)**2-(p.boreDiameter/2)**2)*p.flangeThickness+Math.PI*((p.bodyDiameter/2)**2-(p.boreDiameter/2)**2)*p.bodyHeight;
    near(stats.volume,annulus);size(bodies[0]).forEach((v,i)=>near(v,[p.flangeDiameter,p.flangeDiameter,p.bodyHeight+p.flangeThickness][i]));near(bodies[0].bounds.min[2],0);near(bodies[0].bounds.max[2],p.bodyHeight+p.flangeThickness);
  }
});
await test('invalid template parameters reject and roll back to exact prior BREP',async()=>{
  for(const [kind,bad]of [
    ['bossPlate',[{width:0},{depth:-1},{thickness:0},{cornerRadius:8.1},{cornerRadius:-.1},{boreDiameter:8},{boreDiameter:0},{bossOuterDiameter:0},{bossHeight:0},{bossSpacing:8},{bossSpacing:7.9},{bossSpacing:34},{bossSpacing:100}]],
    ['flangedBushing',[{bodyDiameter:0},{bodyDiameter:5},{flangeDiameter:11},{boreDiameter:0},{boreDiameter:12},{bodyHeight:0},{flangeThickness:0}]],
  ]){
    await run([f('seed','box',{width:9,depth:8,height:7})]);const before=(await kernel.export('brep')).data;
    for(const override of bad){await assert.rejects(run([f('bad','quickModel',{kind,...QUICK_MODELS[kind].defaults,...override})]));assert.equal((await kernel.export('brep')).data,before,`${kind} rollback after ${JSON.stringify(override)}`);}
  }
});
await test('both templates survive STEP import, scale and translated exact edit',async()=>{
  for(const kind of ['bossPlate','flangedBushing']){
    const initial=await run([f('q','quickModel',{kind})]),step=await kernel.export('step');
    const edited=await kernel.rebuild({version:1,imports:{file:{format:'step',data:Buffer.from(step.data).toString('base64')}},features:[f('import','import',{key:'file'}),f('edit','transform',{scale:2,x:5,y:-3,z:7},['import'])],hidden:[]});
    assert.equal(edited.stats.solids,1);near(edited.stats.volume,initial.stats.volume*8);const before=initial.bodies[0].bounds,after=edited.bodies.at(-1).bounds;
    for(let i=0;i<3;i++)near(after.max[i]-after.min[i],(before.max[i]-before.min[i])*2);
    near(after.min[0],before.min[0]*2+5);near(after.min[1],before.min[1]*2-3);near(after.min[2],before.min[2]*2+7);
  }
});

kernel.dispose();console.log(`${passed} IGS30 template checks passed, ${failed} failed`);if(failed)process.exitCode=1;
