import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {PAGE_METHOD_SCHEMAS} from '../src/page-input-contracts.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const feature=(id,op,params)=>({id,name:id,op,params,refs:[]});
const doc=features=>({version:1,features,imports:{}});
test('revolve crossing points to the offset field and preserves the committed body',async()=>{
 const kernel=new CadKernel(oc),base=feature('base','box',{width:2,depth:3,height:4});
 try{
  const before=await kernel.rebuild(doc([base]));
  for(const plane of ['XY','XZ','YZ'])await assert.rejects(kernel.rebuild(doc([base,feature('bad','revolve',{profile:'rectangle',width:1,depth:13,offset:0,plane,angle:360})])),e=>e.code==='REVOLVE_AXIS_CROSSING'&&e.path==='params.offset'&&e.message.includes('offset')&&!e.message.includes('减小加工尺寸'));
  const after=await kernel.rebuild(doc([base]));assert.equal(after.bodies[0].volume,before.bodies[0].volume);assert.deepEqual(after.bodies[0].bounds,before.bodies[0].bounds);
 }finally{kernel.dispose();}
});
test('offset is a profile-center distance and axis-touching rectangles still revolve',async()=>{
 const kernel=new CadKernel(oc);
 try{for(const [offset,expected]of [[10,400*Math.PI],[-10,400*Math.PI],[2,80*Math.PI]]){
  const r=await kernel.rebuild(doc([feature('r','revolve',{profile:'rectangle',width:4,depth:5,offset,plane:'XY',angle:360})]));
  assert.ok(Math.abs(r.bodies[0].volume-expected)<1e-4);assert.ok(Math.abs(r.bodies[0].bounds.max[0]-(Math.abs(offset)+2))<1e-5);
 }}finally{kernel.dispose();}
});
test('queryGeometry missing kind names the exact field in both path and message',()=>{
 assert.throws(()=>validateSchema(PAGE_METHOD_SCHEMAS.queryGeometry,{context:{sessionId:'s',documentId:'d',documentInstanceId:'i'},bodyId:'b'},'args'),e=>e.path==='args.kind'&&e.message.includes('args.kind'));
});
test('YZ circle extrusion is the direct positive-X cylinder route',async()=>{
 const kernel=new CadKernel(oc);
 try{const b=(await kernel.rebuild(doc([feature('bar','extrude',{profile:'circle',radius:1,height:13,plane:'YZ'})]))).bodies[0];assert.ok(Math.abs(b.volume-13*Math.PI)<1e-5);assert.ok(Math.abs(b.bounds.min[0])<1e-5);assert.ok(Math.abs(b.bounds.max[0]-13)<1e-5);}finally{kernel.dispose();}
});
