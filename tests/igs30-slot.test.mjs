import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {operationCatalog} from '../src/operation-catalog.js';
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const f=(id,op,params={},refs=[])=>({id,op,params,refs,name:id});
const box=f('box','box',{width:40,depth:40,height:40});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1e-5,Math.abs(b)*1e-7),`${a} != ${b}`);
const area=(l,w)=>(l-w)*w+Math.PI*(w/2)**2;
let passed=0;async function test(name,fn){await fn();console.log('PASS',name);passed++;}
await test('capsule slots: 3 axes, both directions, rotated, through and blind exact volumes',async()=>{
 for(const axis of ['X','Y','Z'])for(const direction of [-1,1])for(const angle of [0,37,90])for(const through of [true,false]){
  const center=[20,20,20],idx=['X','Y','Z'].indexOf(axis);center[idx]=direction===1?0:40;
  const depth=through?40:5;
  const r=await run([box,f('slot','slot',{length:20,width:6,depth,x:center[0],y:center[1],z:center[2],axis,direction,angle},['box'])]);
  near(r.stats.volume,64000-area(20,6)*depth);assert.equal(r.stats.solids,1);
 }
});
await test('exact arc centers prove overall length and rotated placement',async()=>{
 const result=await run([box,f('slot','slot',{length:20,width:6,depth:5,x:20,y:20,z:40,direction:-1,angle:90},['box'])]);
 const centers=result.bodies[0].snapPoints.filter(p=>p.type==='center');assert.equal(centers.length,4);
 for(const p of centers){near(p.point[0],20);near(Math.abs(p.point[1]-20),7);assert.ok([35,40].some(z=>Math.abs(p.point[2]-z)<1e-6));near(kernel.measure('slot','edge',p.edgeId).radius,3);}
});
await test('equal length and width makes an exact circular hole',async()=>{
 const r=await run([box,f('slot','slot',{length:6,width:6,depth:40,x:20,y:20},['box'])]);near(r.stats.volume,64000-Math.PI*9*40);
});
await test('invalid or off-body cuts roll back the entire feature',async()=>{
 await run([box]);const before=(await kernel.export('brep')).data;
 for(const params of [{length:5,width:6},{length:0},{width:0},{depth:-1},{axis:'Q'},{direction:0},{x:100},{angle:Infinity}]){
  await assert.rejects(run([box,f('bad','slot',{length:20,width:6,depth:5,x:20,y:20,...params},['box'])]));
  assert.equal((await kernel.export('brep')).data,before);
 }
});
await test('slot STEP roundtrip retains exact volume and can be edited',async()=>{
 const original=await run([box,f('slot','slot',{length:20,width:6,depth:40,x:20,y:20,angle:22},['box'])]),step=await kernel.export('step');
 const r=await kernel.rebuild({version:1,hidden:[],imports:{part:{format:'step',data:Buffer.from(step.data).toString('base64')}},features:[f('import','import',{key:'part'}),f('scale','transform',{scale:2,x:8},['import'])]});
 near(r.stats.volume,original.stats.volume*8);assert.equal(r.stats.solids,1);
 assert.equal(operationCatalog.operations.slot.refs,1);
});
console.log(`${passed} IGS30 slot groups passed`);
