import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {bodyResizePlan} from '../src/body-resize.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
import {CadKernel} from '../src/cad-kernel.js';
import {finalStateProject} from '../src/project-final-state.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {encodeMesh} from '../src/mesh/mesh-codec.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
const runtime=process.env.WEBCAD_AFFINE_KERNEL_DIR;
const init=(await import(runtime?pathToFileURL(path.join(runtime,'replicad_single.js')).href:'replicad-opencascadejs')).default;
const oc=await init({wasmBinary:fs.readFileSync(runtime?path.join(runtime,'replicad_single.wasm'):new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const sizes=body=>body.bounds.max.map((v,i)=>v-body.bounds.min[i]);
const close=(a,b)=>a.forEach((v,i)=>assert(Math.abs(v-b[i])<.0001,`${v} != ${b[i]}`));
test('body-size arguments are explicit, bounded and separate from other transforms',()=>{
 assert.equal(typeof oc.BRepBuilderAPI_GTransform,'function');assert(oc.BRepFill_ThruSectionErrorStatus);
 assert.deepEqual(normalizeOperationParams('transform',{sizeMm:[30,10,6],resizeAnchor:'center'}).sizeMm,[30,10,6]);
 assert.deepEqual(bodyResizePlan([[1,2,3],[11,22,7]],{sizeMm:[20,20,4],resizeAnchor:'min'}).pivotMm,[1,2,3]);
 for(const p of [{sizeMm:[1,2,0]},{sizeMm:[1,2,3],mode:'scale'},{sizeMm:[1,2,3],x:2},{resizeAnchor:'min'}])assert.throws(()=>normalizeOperationParams('transform',p));
});
test('existing hollow BRep changes dimensions, preserves source and edits the same resize step',async()=>{
 const kernel=new CadKernel(oc);kernel.quality='draft';
 const features=[{id:'outer',op:'cylinder',params:{radius:10,height:6},refs:[]},{id:'inner',op:'cylinder',params:{radius:3,height:6},refs:[]},{id:'ring',op:'cut',params:{},refs:['outer','inner']}];
 const base={version:2,documentId:'resize-brep',name:'Resize',imports:{},features};
 try{
  const baseline=await kernel.rebuild(base),original=baseline.bodies[0],source=kernel.serializeFeatureShape('ring').data.slice();
  const feature={id:'sized',op:'transform',params:{sizeMm:[30,10,6],resizeAnchor:'center'},refs:['ring']};
  const result=await kernel.rebuild({...base,features:[...features,feature]}),body=result.bodies[0];assert.equal(result.bodies.length,1);assert.equal(body.solidCount,1);close(sizes(body),[30,10,6]);assert(Math.abs(body.volume-original.volume*.75)<.0001);assert.equal(body.resizeReport.method,'occt-affine-brep');assert.deepEqual(kernel.serializeFeatureShape('ring').data,source);
  const changed={...feature,params:{sizeMm:[24,16,6],resizeAnchor:'center'}},edited={...base,features:[...features,changed]};
  const after=(await kernel.rebuild(edited)).bodies[0];close(sizes(after),[24,16,6]);assert(Math.abs(after.volume-original.volume*.96)<.0001);assert.equal(after.id,'sized');
  const saved=await decodeProject(encodeProjectV4(finalStateProject(edited,kernel.finalShapeSources()))),cold=new CadKernel(oc);cold.quality='draft';try{const reopened=(await cold.rebuild(saved)).bodies[0];close(sizes(reopened),[24,16,6]);assert(Math.abs(reopened.volume-after.volume)<.0001);}finally{cold.dispose();}
 }finally{kernel.dispose();}
});
test('mesh body-size transform keeps Float64 source immutable',async()=>{
 const bytes=encodeMesh({positions:new Float64Array([0,0,0,10,0,0,0,20,0,0,0,4]),indices:new Uint32Array([0,2,1,0,1,3,0,3,2,1,2,3])}),hash=binaryHash(bytes).slice(7),kernel=new CadKernel(oc);kernel.quality='draft';
 const document={version:4,documentId:'resize-mesh',name:'Mesh',imports:{source:{format:'mesh',units:'mm',assetHash:hash}},binaryAssets:{[hash]:bytes},features:[{id:'mesh',op:'import',params:{key:'source'},refs:[]},{id:'sized',op:'transform',params:{sizeMm:[20,20,8],resizeAnchor:'min'},refs:['mesh']}]};
 try{const body=(await kernel.rebuild(document)).bodies[0];close(sizes(body),[20,20,8]);assert.equal(body.meshReport.formalPrecision,'Float64');assert.equal(body.resizeReport.method,'affine-float64-mesh');assert.equal(binaryHash(bytes).slice(7),hash);}finally{kernel.dispose();}
});
