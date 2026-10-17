import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {normalizeOperationParams,normalizeOperationPatch} from '../src/operation-registry.js';
import {boundsAlignment} from '../src/bounds-alignment.js';
import {checkpointReports,restoreCheckpointReports} from '../src/local-checkpoint-reports.js';
import {bodyState} from '../src/body-state.js';

test('strict world-bound targets reject ambiguous translation and invalid coordinates',()=>{
  assert.deepEqual(normalizeOperationPatch('transform',{z:7.292,rx:0},{align:{axis:'z',to:'min',valueMm:0}}),{rx:0,align:{axis:'z',to:'min',valueMm:0}});
  for(const params of [{align:{axis:'z',to:'min',valueMm:0},z:0},{align:{axis:'z',to:'min',valueMm:0},mode:'translate',delta:[0,0,0]},{align:{axis:'Z',to:'min',valueMm:0}},{align:{axis:'z',to:'min'}},{align:{axis:'z',to:'min',valueMm:Infinity}}])assert.throws(()=>normalizeOperationParams('transform',params));
  for(const [axis,to,expected] of [['x','max',-4],['y','center',-1],['z','min',3]]){
    const r=boundsAlignment([[-2,-4,-3],[4,6,8]],{axis,to,valueMm:0});assert.equal(r.deltaMm[['x','y','z'].indexOf(axis)],expected);
  }
});

test('actual solid remains grounded after upstream size changes and checkpoint readback',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const document={version:2,features:[{id:'source',op:'sphere',params:{radius:3},refs:[]},{id:'floor',op:'transform',params:{align:{axis:'z',to:'min',valueMm:0}},refs:['source']}],imports:{}};
  try{
    const observations=[];
    for(const radius of [3,7]){
      document.features[0].params.radius=radius;
      const r=await kernel.rebuild(document,{headless:true}),b=r.bodies[0];
      assert.ok(Math.abs(b.bounds.min[2])<1e-6);assert.ok(Math.abs(b.bounds.max[2]-2*radius)<1e-6);
      assert.ok(Math.abs(b.volume-4/3*Math.PI*radius**3)<1e-6);assert.equal(b.faceCount,1);
      assert.ok(Math.abs(b.alignmentReport.deltaMm[2]-radius)<1e-6);
      observations.push({radius,bounds:b.bounds,volume:b.volume,report:b.alignmentReport});
    }
    const stored=checkpointReports(kernel.shapes.get('floor')),restored=restoreCheckpointReports({},stored);
    assert.deepEqual(restored.alignmentReport,observations.at(-1).report);
    assert.deepEqual(bodyState({alignmentReport:restored.alignmentReport}).alignmentReport,restored.alignmentReport);
    console.log(JSON.stringify({case:'UP-30 dynamic source dimensions',observations}));
    const before=kernel.shapes.get('floor');document.features[1].params={mode:'translate',delta:[0,0,0],align:{axis:'z',to:'min',valueMm:0}};
    await assert.rejects(kernel.rebuild(document,{headless:true}),e=>e.code==='PARAM_SCHEMA_INVALID');
    assert.equal(kernel.shapes.get('floor'),before);
  }finally{kernel.dispose();}
});
