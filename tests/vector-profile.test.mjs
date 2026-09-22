import assert from 'node:assert/strict';import fs from 'node:fs';import init from 'replicad-opencascadejs';import {CadKernel} from '../src/cad-kernel.js';
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const regions=[{outer:[[-10,-6],[10,-6],[10,6],[-10,6]],holes:[[[-6,-3],[-6,3],[6,3],[6,-3]]]}];
const run=p=>kernel.rebuild({version:1,features:[{id:'v',name:'Vector',op:'vectorProfile',params:{regions,x:12,y:20,z:7,scale:1,angle:0,plane:'XY',...p},refs:[]}],imports:{},hidden:[]});
const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
let r=await run({output:'face'});assert.equal(r.bodies[0].solidCount,0);assert.equal(r.bodies[0].faceGroups.length,1);near(kernel.measure('v','face',0).area,168);near(r.bodies[0].bounds.min[2],7);
r=await run({output:'solid',height:3});assert.equal(r.bodies[0].solidCount,1);near(r.bodies[0].volume,504);near(r.bodies[0].bounds.max[2],10);
for(const [plane,axis,sign]of [['XZ',1,-1],['YZ',0,1]]){r=await run({output:'solid',height:2,plane});near(r.bodies[0].volume,336);near(r.bodies[0].bounds[sign<0?'min':'max'][axis],[12,20,7][axis]+sign*2);}
r=await run({output:'solid',height:-2,scale:2,angle:90});near(r.bodies[0].volume,1344);near(r.bodies[0].bounds.min[2],5);
await assert.rejects(run({output:'solid',height:0}),/零/);
await assert.rejects(run({output:'face',regions:[{outer:[[0,0],[2,2],[0,2],[2,0]],holes:[]}]}));
r=await run({output:'face',regions:[...regions,{outer:[[20,0],[25,0],[25,5],[20,5]],holes:[]}]});assert.equal(r.bodies[0].faceGroups.length,2);
await run({output:'solid',height:3});const step=await kernel.export('step');assert(step.data.length>1000);const base64=Buffer.from(step.data).toString('base64');r=await kernel.rebuild({version:1,features:[{id:'i',op:'import',params:{key:'s'},refs:[]}],imports:{s:{format:'step',data:base64}},hidden:[]});near(r.bodies[0].volume,504);
kernel.dispose();console.log('PASS vector face area/hole, solid volume, XY/XZ/YZ placement, negative height, scale/rotation, invalid profiles, multiple faces, STEP roundtrip');
