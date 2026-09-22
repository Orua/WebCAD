import assert from 'node:assert/strict';import fs from 'node:fs';import init from 'replicad-opencascadejs';import {CadKernel} from '../src/cad-kernel.js';
const k=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));const box={id:'b',op:'box',params:{width:40,depth:30,height:10},refs:[]};const run=features=>k.rebuild({version:1,features,imports:{},hidden:[]});const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
await run([box]);let top,side;for(let i=0;i<6;i++){const f=k.faceInfo('b',i);if(f.normal[2]>.99)top=i;if(f.normal[0]>.99)side=i;}
const outer=[[-5,-5],[5,-5],[5,5],[-5,5]],hole=[[-2,-2],[-2,2],[2,2],[2,-2]],tan=Math.tan(7*Math.PI/180),depth=2;
const feature=(mode,faceId,holes=[],extra={})=>({id:'l',op:'logo',refs:['b'],params:{faceId,mode,regions:[{outer,holes}],depth,draftAngle:7,scale:1,angle:0,...extra}});
for(const mode of ['engrave','emboss']){const r=await run([box,feature(mode,top)]);const delta=100*depth-20*tan*depth**2+4/3*tan**2*depth**3;near(r.bodies[0].volume,12000+(mode==='engrave'?-delta:delta));let found=false;for(let i=0;i<r.bodies[0].faceGroups.length;i++){try{const f=k.faceInfo('l',i);if(Math.abs(f.origin[2]-(10+(mode==='engrave'?-depth:depth)))<1e-5){near(k.measure('l','face',i).area,(10-2*depth*tan)**2);found=true;}}catch(e){if(e.code==='ERR_ASSERTION')throw e;}}assert(found);}
for(const faceId of [top,side]){const r=await run([box,feature('engrave',faceId,[hole])]);near(r.bodies[0].volume,12000-(84*depth-28*tan*depth**2));}
await assert.rejects(run([box,feature('engrave',top,[],{draftAngle:45})]),/45/);
await assert.rejects(run([box,feature('engrave',top,[],{depth:8,draftAngle:40})]),/斜度|无效/);
k.dispose();console.log('PASS 7-degree engraving and embossing, exact floor/top area, interior-hole taper, side-face taper and excessive draft rejection');
