import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
test('semantic seam uses actual Boolean history and survives an unrelated prefix feature',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const a={id:'cylinder-a',op:'cylinder',params:{radius:3,height:12},refs:[]},b={id:'tool',op:'cylinder',params:{radius:2,height:12},refs:[]};
  const features=[a,{id:'base',op:'transform',params:{z:-6},refs:['cylinder-a']},b,{id:'tool-placed',op:'transform',params:{rx:90,y:6},refs:['tool']},{id:'joined',op:'union',params:{},refs:['base','tool-placed']},{id:'smooth',op:'smoothTransition',params:{radius:.2,selector:{seamBetween:{a:'base',b:'tool-placed'}}},refs:['joined']}];
  try{
    normalizeOperationParams('smoothTransition',features.at(-1).params);
    const first=await kernel.rebuild({version:2,features,imports:{}});assert.equal(first.bodies.length,1);assert(first.bodies[0].transitionReport.processedEdgeIds.length>0);
    const prefix={id:'unrelated',op:'sphere',params:{radius:1},refs:[]};const changed=await kernel.rebuild({version:2,features:[prefix,...features],imports:{}});
    const selected=changed.bodies.find(body=>body.id==='smooth');assert(selected);assert.equal(selected.solidCount,1);assert(Math.abs(selected.volume-first.bodies[0].volume)<1e-6);
  }finally{kernel.dispose();}
});
