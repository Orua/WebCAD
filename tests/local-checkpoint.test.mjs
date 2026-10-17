import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
test('local checkpoints persist exact geometry and invalidate dependent recipes',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),a=new CadKernel(oc),b=new CadKernel(oc);
  const doc={version:2,imports:{},features:[{id:'a',op:'box',params:{width:10,depth:8,height:6},refs:[]},{id:'b',op:'transform',params:{x:2},refs:['a']},{id:'c',op:'transform',params:{z:3},refs:['b']}]};
  try{
    const original=await a.rebuild(doc,{headless:true}),baked=a.bakeProject(doc,{thresholdMs:0});assert.equal(baked.baked.length,3);
    const loaded=await decodeProject(encodeProjectV4(baked.document)),restored=await b.rebuild(loaded,{headless:true});
    assert.deepEqual(restored.compiledReuse,['a','b','c']);assert.equal(restored.bodies[0].faceCount,original.bodies[0].faceCount);assert(Math.abs(restored.bodies[0].volume-original.bodies[0].volume)<1e-8);
    loaded.features[1].params.x=4;const edited=await b.rebuild(loaded,{headless:true});assert.deepEqual(edited.compiledInvalidated,['b','c']);assert.equal(edited.perFeatureMs[0].reused,true);assert.equal(edited.perFeatureMs[1].reused,false);assert(Math.abs(edited.bodies[0].volume-480)<1e-8);
  }finally{a.dispose();b.dispose();}
});

test('checkpoint reports preserve used radius without reusing topology indices',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),a=new CadKernel(oc),b=new CadKernel(oc);
  const doc={version:2,imports:{},features:[{id:'a',op:'box',params:{width:20,depth:10,height:6},refs:[]},{id:'r',op:'fillet',params:{allEdges:true,radius:{maxMm:1,minMm:.5}},refs:['a']}]};
  try{
    await a.rebuild(doc);const baked=a.bakeProject(doc,{thresholdMs:0}),loaded=await decodeProject(encodeProjectV4(baked.document));
    const report=loaded.features[1].compiledCheckpoint.reports;assert.equal(report.reports.radiusSearchReport.radiusUsedMm,1);assert(!JSON.stringify(report).includes('resolvedEdgeIds'));
    const restored=await b.rebuild(loaded);assert.equal(restored.bodies[0].radiusSearchReport.radiusUsedMm,1);assert.equal(restored.bodies[0].blendRadiusReport.radiusMm,1);assert.deepEqual(restored.compiledReuse,['a','r']);
  }finally{a.dispose();b.dispose();}
});

test('editing feature 30 retains exactly the first 29 and invalidates only its dependent suffix',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),a=new CadKernel(oc),b=new CadKernel(oc);
  const features=[{id:'f1',op:'box',params:{width:10,depth:8,height:6},refs:[]}];
  for(let n=2;n<=32;n++)features.push({id:'f'+n,op:'transform',params:{x:1},refs:['f'+(n-1)]});
  try{
    const doc={version:2,imports:{},features};await a.rebuild(doc,{headless:true});const baked=a.bakeProject(doc,{thresholdMs:0}),loaded=await decodeProject(encodeProjectV4(baked.document));await b.rebuild(loaded,{headless:true});
    loaded.features[29].params.x=2;const edited=await b.rebuild(loaded,{headless:true});
    assert.equal(edited.perFeatureMs.filter(row=>row.reused).length,29);assert(edited.perFeatureMs.slice(0,29).every(row=>row.reused));assert.deepEqual(edited.compiledInvalidated,['f30','f31','f32']);assert(Math.abs(edited.bodies[0].volume-480)<1e-8);
  }finally{a.dispose();b.dispose();}
});
