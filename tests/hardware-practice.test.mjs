import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {createPageAPI} from '../src/page-api.js';
import {createCommandService} from '../src/command-service.js';
import {CadKernel} from '../src/cad-kernel.js';
import {createReferenceSystem} from '../src/work-frame.js';
import {runHardwarePractice} from '../docs/examples/hardware-practice.js';

test('complete practice batches pass the public API with exact kernel geometry and explicit source visibility',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
  const kernel=new CadKernel(oc);kernel.quality='draft';
  const identity={sessionId:'practice-session',documentId:'practice-document',documentInstanceId:'practice-instance'};
  let document={version:2,features:[],imports:{},referenceSystem:createReferenceSystem()},bodies=[],revision=0,view;
  const hidden=new Set();
  // A minimal in-memory document host exercises the real page/batch/command
  // validators and BREP kernel. It intentionally has no renderer or disk save.
  const service=createCommandService({allowAdvisory:true,
    snapshot:()=>({...identity,revision,documentName:'Hardware practice',features:structuredClone(document.features),bodies:structuredClone(bodies),
      selectedIds:[],selectedTopology:null,busy:false,kernelReady:true,dirty:revision>0,preview:false,referenceSystem:document.referenceSystem}),
    execute:async(command,args)=>{
      if(command==='add_feature'){
        const feature={id:'practice-'+(document.features.length+1),...args};
        const next={...document,features:[...document.features,feature]},result=await kernel.rebuild(next);
        document=next;bodies=result.bodies.map(body=>({id:body.id,name:body.name,bounds:body.bounds,volume:body.volume,solidCount:body.solidCount,
          faceCount:body.faceGroups.length,edgeCount:body.edges.length,hidden:hidden.has(body.id)}));
      }else{
        assert.equal(command,'editor_action');assert.equal(args.action,'body.visibility');
        for(const id of args.values.bodyIds){if(args.values.visible)hidden.delete(id);else hidden.add(id);}
        bodies=bodies.map(body=>({...body,hidden:hidden.has(body.id)}));
      }
      revision++;
    },
  });
  const api=createPageAPI({buildId:'test',state:()=>service.getState({sessionId:identity.sessionId,include:['summary','features','bodies']}),
    display:()=>({status:'not_rendered'}),execute:input=>service.execute(input),measure:input=>kernel.measure(input.bodyId,input.kind,input.topologyId),
    view:async input=>{view=input;},files:()=>{throw new Error('Practice must not export files');},confirmSaved:()=>{throw new Error('Practice must not claim a save');}});
  try{
    const result=await runHardwarePractice(api);
    assert.equal(result.status,'completed',JSON.stringify(result));
    assert.equal(result.saved,false);assert.equal(revision,10);assert.equal(document.features.length,8);
    assert.deepEqual(result.receipts.map(r=>r.results.length),[5,8]);
    assert(result.receipts.every(r=>r.displayMatchesContext===false),'headless geometry does not establish rendering');
    assert.equal(hidden.size,4);assert.equal(view.direction,'iso');
    const visible=bodies.filter(body=>!body.hidden);assert.equal(visible.length,2);
    assert(visible.every(body=>body.solidCount===1&&body.volume>0));
    const measured=result.receipts.map(r=>r.results.find(step=>step.id.endsWith('Measure')).result);
    const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
    near(measured[0].bounds.max[0]-measured[0].bounds.min[0],32);near(measured[0].bounds.max[1]-measured[0].bounds.min[1],18);
    near(measured[0].volume,9855.13426640911);near(measured[1].volume,12458.66250666191);
    near(measured[1].bounds.max[2]-measured[1].bounds.min[2],32);
  }finally{kernel.dispose();}
});
