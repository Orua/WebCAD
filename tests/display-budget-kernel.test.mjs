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

test('hidden independent BRep retains its exact save source and meshes only when revealed',async()=>{
  const kernel=new CadKernel(oc);
  const document={version:2,imports:{},hidden:['box'],features:[
    {id:'box',op:'box',params:{width:2,depth:3,height:4},refs:[]},
  ]};
  try{
    const hidden=(await kernel.rebuild(document)).bodies[0];
    const [before]=kernel.finalShapeSources();
    assert.equal(hidden.displayDeferred,true);
    assert.equal(hidden.indices.length,0);
    assert.equal(hidden.volume,null);
    assert.ok(Math.abs(kernel.measure('box').volume-24)<1e-8);
    assert.equal(kernel.remesh('fine').bodies[0].displayDeferred,true);
    const shown=(await kernel.rebuild({...document,hidden:[]})).bodies[0];
    const [after]=kernel.finalShapeSources();
    assert.ok(shown.indices.length>0);
    assert.equal(shown.displayDeferred,undefined);
    assert.equal(after.sourceHash,before.sourceHash);
    assert.deepEqual(after.data,before.data);
  }finally{kernel.dispose();}
});

test('fit distinguishes gap, contact and positive volume, and group maps solid identities',async()=>{
  const kernel=new CadKernel(oc);
  const features=[{id:'a',op:'box',params:{width:2,depth:2,height:2},refs:[]},
    ...[[1,'overlap'],[2,'touch'],[3,'gap']].map(([x,id])=>({id,op:'copy',params:{x,y:0,z:0,rx:0,ry:0,rz:0,scale:1},refs:['a']}))];
  try{
    const document={version:2,imports:{},features};
    await kernel.rebuild(document);
    const overlap=kernel.inspectFit('a','overlap');
    assert.equal(overlap.classification,'overlap');
    assert.ok(Math.abs(overlap.commonVolumeMm3-4)<1e-8);
    assert.deepEqual(overlap.locationMm,[1.5,1,1]);
    assert.equal(kernel.inspectFit('a','overlap',1e-5,5).classification,'overlapBelowThreshold');
    assert.equal(kernel.inspectFit('a','touch').classification,'contactWithinTolerance');
    const gap=kernel.inspectFit('a','gap');
    assert.equal(gap.classification,'separated');
    assert.equal(gap.distanceMm,1);
    features.push({id:'group',op:'group',params:{},refs:['a','gap']});
    const grouped=(await kernel.rebuild(document)).bodies.find(body=>body.id==='group');
    assert.deepEqual(grouped.groupSolidSources,[{id:'a',index:0},{id:'gap',index:0}]);
    assert.deepEqual([...new Set(grouped.faceSolidIndices)],[0,1]);
    assert.throws(()=>kernel.inspectFit('group','touch'),/单一封闭实体/);
  }finally{kernel.dispose();}
});
