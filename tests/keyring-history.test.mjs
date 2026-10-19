import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {recordTimeline,validateTimeline,restoreTimeline} from '../src/document-timeline.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';

test('adding a split key ring checkpoints the pending transaction before recording history once',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
  const engine=new CadKernel(oc);
  const empty={version:2,documentId:'keyring-history',name:'test',imports:{},features:[]};
  const previous=structuredClone(empty);
  previous.features.push({id:'wrong-ring',op:'quickModel',params:{kind:'ring',innerDiameter:25,sectionSize:3},refs:[]});
  recordTimeline(empty,previous);
  const next=structuredClone(previous);
  next.features.push({id:'split-ring',op:'quickModel',params:{kind:'keyRing',innerDiameterMm:25,outerDiameterMm:33,totalDepthMm:3},refs:[]});
  try{
    await engine.rebuild(next,{headless:true});
    const baked=engine.bakeProject(next,{thresholdMs:0,recordHistory:false}).document;
    recordTimeline(previous,baked);
    validateTimeline(baked);
    const loaded=await decodeProject(encodeProjectV4(baked));
    validateTimeline(loaded);
    assert.equal(loaded.timeline.entries.length,2);
    const old=restoreTimeline(loaded,previous.timeline.entries.at(-1).id);
    assert.deepEqual(old.features.map(f=>f.id),['wrong-ring']);
    const corrected=structuredClone(loaded);
    corrected.features=corrected.features.filter(f=>f.id!=='wrong-ring');
    recordTimeline(loaded,corrected);
    validateTimeline(corrected);
    assert.deepEqual(corrected.features.map(f=>f.id),['split-ring']);
  }finally{engine.dispose();}
});
