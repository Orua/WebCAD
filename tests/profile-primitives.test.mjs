import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {primitiveEntities,expandProfilePrimitives} from '../src/profile-primitives.js';
const profile=entity=>({profileVersion:1,entities:[entity],loops:[{id:'outer',edges:[{entityId:entity.id,reversed:false}]}],regions:[{id:'r',outerLoopId:'outer',holeLoopIds:[]}],output:'face'});
test('parameter primitives retain one authoritative definition and stable exact derived curves',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const rounded={id:'rounded',type:'roundedRectangle',originMm:[0,0],widthMm:40,heightMm:30,cornerRadiusMm:3},capsule={id:'slot',type:'capsule',originMm:[0,0],widthMm:40,heightMm:20};
  try{
    for(const [entity,area] of [[rounded,1200-(4-Math.PI)*9],[capsule,400+100*Math.PI]]){
      const params=profile(entity),snapshot=JSON.stringify(params);await kernel.rebuild({version:2,features:[{id:'p',op:'sketchProfile',params,refs:[]}],imports:{}});
      assert.ok(Math.abs(cad.measureArea(kernel.activeShape('p'))-area)<1e-5);assert.equal(JSON.stringify(params),snapshot);
      const converted=expandProfilePrimitives(params);await kernel.rebuild({version:2,features:[{id:'p',op:'sketchProfile',params:converted,refs:[]}],imports:{}});assert.ok(Math.abs(cad.measureArea(kernel.activeShape('p'))-area)<1e-5);
    }
    assert.deepEqual(primitiveEntities(rounded).map(entity=>entity.id),primitiveEntities({...rounded,widthMm:50}).map(entity=>entity.id));
    assert.throws(()=>primitiveEntities({...rounded,cornerRadiusMm:15}),/短边/);
    assert.throws(()=>primitiveEntities({...capsule,widthMm:10}),/总长/);
  }finally{kernel.dispose();}
});
