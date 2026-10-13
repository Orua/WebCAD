import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
function fixture(){const bytes=new Uint8Array(134),v=new DataView(bytes.buffer);v.setUint32(80,1,true);[0,0,0,2,0,0,0,3,0].forEach((p,i)=>v.setFloat32(96+i*4,p,true));const hash=binaryHash(bytes).slice(7);return {bytes,hash,document:{version:4,features:[{id:'mesh',op:'import',params:{key:'source'},refs:[]}],imports:{source:{format:'stl',units:'mm',assetHash:hash}},binaryAssets:{[hash]:bytes},hidden:[]}};}
test('Worker kernel commits open raw mesh without fake BRep validity; full measurement/export and transforms retain source',async()=>{
 const {bytes,document}=fixture(),result=await kernel.rebuild(document);assert.equal(result.bodies[0].geometryType,'rawMesh');assert.equal(result.bodies[0].triangleCount,1);assert.equal(result.bodies[0].volume,null);assert.equal(kernel.measure('mesh').source,'authoritative-mesh');assert.deepEqual((await kernel.export('stl',['mesh'])).data,bytes);
 const moved={...document,features:[...document.features,{id:'moved',op:'transform',params:{x:10,y:5,z:2},refs:['mesh']}]};const r=await kernel.rebuild(moved);assert.deepEqual(r.bodies[0].bounds,{min:[10,5,2],max:[12,8,2]});
 await assert.rejects(kernel.queryGeometry('moved','face',{}),{code:'MESH_TOPOLOGY_UNAVAILABLE'});await assert.rejects(kernel.export('step',['moved']),{code:'MESH_BREP_UNAVAILABLE'});
 const before=(await kernel.export('stl',['moved'])).data;await assert.rejects(kernel.rebuild({...moved,features:[...moved.features,{id:'invalid',op:'logo',params:{depth:.4,faceId:0},refs:['moved']}]}),{code:'MESH_TOOL_UNAVAILABLE'});assert.deepEqual((await kernel.export('stl',['moved'])).data,before);
});
test.after(()=>kernel.dispose());
