import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {importSTEP} from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {exportBinarySTL,decodeBinarySTL} from '../src/mesh/stl-source.js';
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
function fixture(){const bytes=new Uint8Array(134),v=new DataView(bytes.buffer);v.setUint32(80,1,true);[0,0,0,2,0,0,0,3,0].forEach((p,i)=>v.setFloat32(96+i*4,p,true));const hash=binaryHash(bytes).slice(7);return {bytes,hash,document:{version:4,features:[{id:'mesh',op:'import',params:{key:'source'},refs:[]}],imports:{source:{format:'stl',units:'mm',assetHash:hash}},binaryAssets:{[hash]:bytes},hidden:[]}};}
test('Worker kernel commits open raw mesh without fake BRep validity; full measurement/export and transforms retain source',async()=>{
 const {bytes,document}=fixture(),result=await kernel.rebuild(document);assert.equal(result.bodies[0].geometryType,'rawMesh');assert.equal(result.bodies[0].triangleCount,1);assert.equal(result.bodies[0].volume,null);assert.equal(kernel.measure('mesh').source,'authoritative-mesh');assert.deepEqual((await kernel.export('stl',['mesh'])).data,bytes);
 const moved={...document,features:[...document.features,{id:'moved',op:'transform',params:{x:10,y:5,z:2},refs:['mesh']}]};const r=await kernel.rebuild(moved);assert.deepEqual(r.bodies[0].bounds,{min:[10,5,2],max:[12,8,2]});
 await assert.rejects(kernel.queryGeometry('moved','face',{}),{code:'MESH_TOPOLOGY_UNAVAILABLE'});
 await assert.rejects(kernel.export('step',['moved']),{code:'MESH_FACETED_STEP_INVALID',featureId:'moved'});
 const before=(await kernel.export('stl',['moved'])).data;await assert.rejects(kernel.rebuild({...moved,features:[...moved.features,{id:'invalid',op:'logo',params:{depth:.4,faceId:0},refs:['moved']}]}),{code:'MESH_TOOL_UNAVAILABLE'});assert.deepEqual((await kernel.export('stl',['moved'])).data,before);
});

test('separate meshes and an exact cylinder keep their source geometry and world placement when exported',async()=>{
 const positions=new Float64Array([0,0,0,2,0,0,0,3,0,0,0,4]);
 const indices=new Uint32Array([0,2,1,0,1,3,0,3,2,1,2,3]);
 const {bytes}=exportBinarySTL({positions,indices}),hash=binaryHash(bytes).slice(7);
 const features=[
   {id:'mesh',op:'import',params:{key:'source'},refs:[]},
   {id:'moved',op:'copy',params:{x:10,y:5,z:2},refs:['mesh']},
   {id:'exact',op:'cylinder',params:{radius:2,height:6},refs:[]},
 ];
 const document={version:4,features,imports:{source:{format:'stl',units:'mm',assetHash:hash}},binaryAssets:{[hash]:bytes},hidden:[]};
 await kernel.rebuild(document);
 const stl=await kernel.export('stl',['mesh','moved']);
 assert.deepEqual(stl.report.bodies.map(part=>part.triangleCount),[4,4]);
 const decoded=decodeBinarySTL(stl.data,'mm');
 assert.deepEqual(decoded.bounds,{min:[0,0,0],max:[12,8,6]});
 assert.deepEqual(stl.data.subarray(84,284),bytes.subarray(84));
 const mixedSTL=await kernel.export('stl');
 assert.deepEqual(mixedSTL.report.bodies.map(body=>body.geometryType),['rawMesh','rawMesh','brep']);
 const exact=await kernel.export('step',['exact']);
 const mixed=await kernel.export('step');
 const mixedText=new TextDecoder().decode(mixed.data),exactText=new TextDecoder().decode(exact.data);
 assert.ok(mixedText.startsWith(exactText.slice(0,exactText.lastIndexOf('ENDSEC;'))));
 assert.match(mixedText,/CYLINDRICAL_SURFACE/);
 assert.equal((mixedText.match(/=FACETED_BREP\(/g)||[]).length,2);
 assert.equal(new Set([...mixedText.matchAll(/^#(\d+)\s*=/gm)].map(row=>row[1])).size,
   [...mixedText.matchAll(/^#\d+\s*=/gm)].length);
 const selected=await kernel.export('step',['moved']);
 assert.deepEqual(selected.report.bodies,[{id:'moved',geometryType:'faceted-brep',triangleCount:4,solidCount:1}]);
 const roundTrip=await importSTEP(new Blob([selected.data]));
 try{
   assert.equal(roundTrip.faces.length,4);
   assert.ok(roundTrip.boundingBox.bounds[0].every((v,i)=>Math.abs(v-[10,5,2][i])<1e-6));
 }finally{roundTrip.delete();}
 const mixedRoundTrip=await importSTEP(new Blob([mixed.data]));
 try{assert.equal(mixedRoundTrip.faces.length,11);}
 finally{mixedRoundTrip.delete();}
 await assert.rejects(kernel.export('stl',[]),{code:'EXPORT_EMPTY_SELECTION'});
 await assert.rejects(kernel.export('step',['missing']),{code:'STALE_REFERENCE',featureId:'missing'});
 assert.deepEqual((await kernel.export('stl',['mesh'])).data,bytes);
});
test.after(()=>kernel.dispose());
