// Mesh booleans through manifold-3d (Apache-2.0, wasm). Inputs are closed
// triangle meshes (mesh bodies or tessellated exact BReps); the output is a
// new closed Float64 mesh. Exact BRep/STEP is not produced.
import {meshError} from './mesh-contract.js';
export const meshBooleanExample={version:1,operation:'union',toleranceMm:.05};
export const meshBooleanOperation={description:'网格布尔合并 / Mesh boolean',refs:{min:2,max:16},paramsSchema:{type:'object',additionalProperties:false,required:['version','operation'],properties:{
 version:{type:'integer',const:1},operation:{type:'string',enum:['union','subtract','intersect']},toleranceMm:{type:'number',minimum:.005,maximum:1}}},
 notes:'refs: 2–16 bodies in order; subtract removes refs[1..] from refs[0]. Mesh bodies are used as-is (with placement); exact BRep bodies are tessellated at toleranceMm (default 0.05 mm). Every input must be a closed, manifold mesh. Result is a closed raw mesh (STL export), not a BRep/STEP; refs are consumed.'};
let modulePromise;
// The host injects the wasm loader (worker: bundled wasm URL; Node tests: package default).
export function defaultManifoldLoader(){if(!customLoader)throw meshError('MESH_BOOLEAN_UNAVAILABLE','Mesh boolean engine is not loaded in this host.');return modulePromise??=customLoader().then(w=>{w.setup();return w;});}
let customLoader;
export function setManifoldLoader(loader){customLoader=loader;modulePromise=undefined;}
export async function meshBoolean(meshes,operation){
 if(!Array.isArray(meshes)||meshes.length<2||meshes.length>16)throw meshError('MESH_BOOLEAN_INVALID','Mesh boolean needs 2–16 bodies.');
 if(!['union','subtract','intersect'].includes(operation))throw meshError('MESH_BOOLEAN_INVALID','Unknown boolean operation.');
 const wasm=await defaultManifoldLoader(),{Manifold,Mesh}=wasm,owned=[];
 try{
  const solids=meshes.map((m,index)=>{
   const mesh=new Mesh({numProp:3,vertProperties:Float32Array.from(m.positions),triVerts:Uint32Array.from(m.indices)});mesh.merge();
   const solid=new Manifold(mesh);owned.push(solid);
   if(solid.status()!=='NoError'||solid.isEmpty())throw meshError('MESH_NOT_MANIFOLD',`Input ${index+1} is not a closed manifold mesh (${solid.status()}).`);
   return solid;});
  const result=operation==='union'?Manifold.union(solids):operation==='intersect'?Manifold.intersection(solids):Manifold.difference(solids);owned.push(result);
  if(result.isEmpty())throw meshError('MESH_BOOLEAN_EMPTY','Boolean result is empty.');
  const out=result.getMesh(),n=out.numProp,v=out.vertProperties,positions=new Float64Array(v.length/n*3);
  for(let i=0,k=0;i<v.length;i+=n,k+=3){positions[k]=v[i];positions[k+1]=v[i+1];positions[k+2]=v[i+2];}
  return {mesh:{positions,indices:new Uint32Array(out.triVerts)},report:{engine:'manifold-3d',operation,volume:result.volume(),area:result.surfaceArea(),genus:result.genus(),inputs:meshes.length}};
 }finally{owned.forEach(o=>{try{o.delete();}catch{}});}
}

import {sourceOperationContract as declaredSourceContract} from '../operation-contracts.js';
Object.defineProperty(meshBooleanOperation,'contract',{get(){const source=meshBooleanOperation;return declaredSourceContract('meshBoolean',{description:source.description,refs:source.refs,notes:source.notes,paramsSchema:source.paramsSchema},{exampleParams:meshBooleanExample});}});
