import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const f=(id,op,params={},refs=[])=>({id,op,params,refs,name:id});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1e-5,Math.abs(b)*1e-7),`${a} != ${b}`);
const area=(w,h,r)=>w*h-(4-Math.PI)*r*r;
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}

await test('new templates provide complete Chinese and English metadata',()=>{
  for(const key of ['flatFrame','mountingPlate']){
    const model=QUICK_MODELS[key];assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
    for(const field of model.fields){assert.ok(field.label&&field.labelEn);assert.ok(Object.hasOwn(model.defaults,field.key));}
  }
});
await test('flat frame independent radii, zero corner radii, and exact capsule/circle boundaries',async()=>{
  for(const p of [QUICK_MODELS.flatFrame.defaults,{outerWidth:40,outerHeight:20,outerRadius:10,innerWidth:32,innerHeight:12,innerRadius:6,thickness:2},{outerWidth:20,outerHeight:20,outerRadius:10,innerWidth:12,innerHeight:12,innerRadius:6,thickness:2},{outerWidth:40,outerHeight:30,outerRadius:0,innerWidth:32,innerHeight:22,innerRadius:0,thickness:4}]){
    const result=await run([f('frame','quickModel',{kind:'flatFrame',...p})]);
    near(result.stats.volume,(area(p.outerWidth,p.outerHeight,p.outerRadius)-area(p.innerWidth,p.innerHeight,p.innerRadius))*p.thickness);
    assert.equal(result.stats.solids,1);const bounds=result.bodies[0].bounds;
    near(bounds.max[0]-bounds.min[0],p.outerWidth);near(bounds.max[1]-bounds.min[1],p.outerHeight);near(bounds.max[2]-bounds.min[2],p.thickness);
  }
});
await test('flat frame refuses crossing inner corners and invalid dimensions',async()=>{
  for(const p of [{outerWidth:20,outerHeight:20,outerRadius:10,innerWidth:19,innerHeight:19,innerRadius:0},{innerWidth:40},{innerWidth:-2},{outerRadius:15},{thickness:0}])await assert.rejects(run([f('bad','quickModel',{kind:'flatFrame',...p})]));
});
await test('mounting plate analytical volume and exact symmetric hole centers',async()=>{
  const p=QUICK_MODELS.mountingPlate.defaults,result=await run([f('plate','quickModel',{kind:'mountingPlate',...p})]);
  near(result.stats.volume,(area(p.width,p.depth,p.cornerRadius)-2*Math.PI*(p.holeDiameter/2)**2)*p.thickness);assert.equal(result.stats.solids,1);
  const holes=result.bodies[0].snapPoints.filter(point=>point.type==='center').filter(point=>Math.abs(kernel.measure('plate','edge',point.edgeId).radius-p.holeDiameter/2)<1e-6);
  assert.equal(holes.length,4);for(const hole of holes){near(Math.abs(hole.point[0]),p.holeSpacing/2);near(hole.point[1],0);assert.ok(Math.abs(hole.point[2])<1e-6||Math.abs(hole.point[2]-p.thickness)<1e-6);}
  const capsule={kind:'mountingPlate',width:40,depth:16,thickness:3,cornerRadius:8,holeDiameter:4,holeSpacing:24};
  near((await run([f('capsule','quickModel',capsule)])).stats.volume,(area(40,16,8)-8*Math.PI)*3);
});
await test('mounting holes reject tangency, overlap, crossing boundary and nonpositive data',async()=>{
  for(const p of [{holeSpacing:4},{holeSpacing:3},{holeSpacing:36},{holeDiameter:16,holeSpacing:18},{holeDiameter:0},{cornerRadius:9}])await assert.rejects(run([f('bad','quickModel',{kind:'mountingPlate',...p})]));
});
const cube=f('cube','box',{width:20,depth:20,height:20});
await test('multi-position plain holes exact volumes on all axes, both directions and blind holes',async()=>{
  for(const axis of ['X','Y','Z'])for(const direction of [1,-1]){
    const index=['X','Y','Z'].indexOf(axis),points=[[5,5,5],[15,15,15]].map(point=>{point[index]=direction===1?-1:21;return point;});
    const result=await run([cube,f('holes','multiHole',{radius:2,depth:22,axis,direction,points},['cube'])]);
    near(result.stats.volume,8000-2*Math.PI*4*20);assert.equal(result.stats.solids,1);
  }
  near((await run([cube,f('blind','multiHole',{radius:2,depth:5,axis:'Z',direction:-1,points:[[5,5,20]]},['cube'])])).stats.volume,8000-20*Math.PI);
});
await test('one missed/repeated hole rolls back entire feature and preserves exact prior export',async()=>{
  await run([cube]);const before=(await kernel.export('brep')).data;
  for(const points of [[[5,5,-1],[100,100,-1]],[[5,5,-1],[5,5,-1]],[],Array.from({length:101},()=>[5,5,-1]),[[1,2]]]){
    await assert.rejects(run([cube,f('bad','multiHole',{radius:2,depth:22,axis:'Z',points},['cube'])]));
    assert.equal((await kernel.export('brep')).data,before);
  }
});
await test('both new templates and multi-hole STEP roundtrip preserve solids/volume and remain editable',async()=>{
  for(const features of [[f('frame','quickModel',{kind:'flatFrame'})],[f('plate','quickModel',{kind:'mountingPlate'})],[cube,f('holes','multiHole',{radius:2,depth:22,axis:'Z',points:[[5,5,-1],[15,15,-1]]},['cube'])]]){
    const result=await run(features),step=await kernel.export('step');
    const roundtrip=await kernel.rebuild({version:1,imports:{file:{format:'step',data:Buffer.from(step.data).toString('base64')}},features:[f('imported','import',{key:'file'}),f('edited','transform',{scale:2,x:3},['imported'])],hidden:[]});
    assert.equal(roundtrip.stats.solids,result.stats.solids);near(roundtrip.stats.volume,result.stats.volume*8);
  }
});
kernel.dispose();console.log(`${passed} IGS-derived tool checks passed`);
