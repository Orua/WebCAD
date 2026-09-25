import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const kernel=new CadKernel(oc);
try{
 const before=await kernel.rebuild({version:1,imports:{},features:[{id:'cyl',op:'cylinder',params:{radius:10,height:18},refs:[]}]});
 const shape=kernel.shapes.get('cyl');
 const standard=before.bodies[0];
 const fine=kernel.remesh('fine').bodies[0];
 assert.equal(kernel.shapes.get('cyl'),shape,'no BRep reconstruction');
 assert.equal(fine.volume,standard.volume);assert.deepEqual(fine.bounds,standard.bounds);
 assert(fine.indices.length>standard.indices.length,'curved cylinder gains actual triangles');
 const sides=await kernel.queryGeometry('cyl','face',{surfaceType:'cylinder'});
 assert.equal(sides.matchCount,1);assert.equal(sides.items[0].geomType,'CYLINDRE');
 assert.equal((await kernel.queryGeometry('cyl','face',{surfaceType:'sphere'})).matchCount,0);
 assert.throws(()=>kernel.remesh('invalid'),{code:'PARAM_SCHEMA_INVALID'});
 assert.equal(kernel.shapes.get('cyl'),shape);
 console.log(JSON.stringify({standardTriangles:standard.indices.length/3,fineTriangles:fine.indices.length/3,exactVolume:fine.volume}));
}finally{kernel.dispose();}
