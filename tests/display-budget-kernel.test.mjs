import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {RENDER_QUALITIES} from '../src/render-quality.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});

test('small box and cylinder still remesh at draft, standard and fine',async()=>{
  const kernel=new CadKernel(oc);
  try{
    const doc={version:2,imports:{},features:[
      {id:'box',op:'box',params:{width:10,depth:8,height:6},refs:[]},
      {id:'cyl',op:'cylinder',params:{radius:4,height:10},refs:[]},
    ]};
    const standard=await kernel.rebuild(doc);
    assert.equal(standard.bodies.length,2);
    for(const quality of ['draft','standard','fine']){
      const result=kernel.remesh(quality);
      assert.equal(result.quality,quality);
      assert.equal(kernel.quality,quality);
      assert.equal(result.bodies.length,2);
      for(const body of result.bodies){
        assert.ok(body.indices.length>=3,`${body.id} at ${quality} has triangles`);
        assert.deepEqual(body.displayReport?.untriangulatedFaceIds||[],[]);
        assert.equal(body.adaptiveDisplay,undefined);
      }
    }
    assert.equal(kernel.shapes.size,2);
  }finally{kernel.dispose();}
});

test('requested fine on a small part still uses the fine chord and does not invent a 0.08 clamp',async()=>{
  const kernel=new CadKernel(oc);
  try{
    const standard=(await kernel.rebuild({version:2,imports:{},features:[{id:'cyl',op:'cylinder',params:{radius:10,height:18},refs:[]}]})).bodies[0];
    const fine=kernel.remesh('fine').bodies[0];
    assert.equal(fine.volume,standard.volume);
    assert.ok(fine.indices.length>standard.indices.length);
    assert.equal(fine.adaptiveDisplay,undefined);
    assert.equal(RENDER_QUALITIES.fine.tolerance,0.025);
  }finally{kernel.dispose();}
});
