import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {finalStateProject} from '../src/project-final-state.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {recordTimeline,timelineList} from '../src/document-timeline.js';
import {encodeMesh} from '../src/mesh/mesh-codec.js';
import {binaryHash} from '../src/contracts/operation-schema.js';

test('disk save has only final BRep/mesh, preserving transformed geometry, ids, hidden and appearance',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
  const kernel=new CadKernel(oc);kernel.quality='draft';
  const mesh=encodeMesh({positions:new Float64Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2])}),hash=binaryHash(mesh).slice(7);
  const doc={version:4,documentId:'final-test',name:'最终形态',features:[
    {id:'base',op:'box',params:{width:8,depth:6,height:3},refs:[]},
    {id:'moved',name:'移动后',op:'transform',params:{x:11,y:2,z:5},refs:['base']},
    {id:'mesh',op:'import',params:{key:'mesh'},refs:[]},
    {id:'shifted-mesh',op:'transform',params:{x:3,y:4,z:5},refs:['mesh']}],
    imports:{mesh:{format:'mesh',assetHash:hash,units:'mm'}},binaryAssets:{[hash]:mesh},hidden:['moved'],appearance:{moved:{finish:'nickel'}},colors:{moved:'#123456'}};
  try{
    const before=await kernel.rebuild(doc),sources=kernel.finalShapeSources(),saved=finalStateProject(doc,sources);
    assert.equal(saved.features.length,2);assert(saved.features.every(f=>f.op==='import'&&!f.refs.length));assert.equal(saved.timeline,undefined);
    assert.equal(doc.features.length,4);assert.deepEqual(saved.hidden,['moved']);assert.deepEqual(saved.appearance,doc.appearance);assert.deepEqual(saved.colors,doc.colors);
    const reopened=await decodeProject(encodeProjectV4(saved));
    kernel.dispose();const cold=new CadKernel(oc);cold.quality='draft';
    try{const after=await cold.rebuild(reopened);for(const b of before.bodies){const a=after.bodies.find(x=>x.id===b.id);assert(a);assert.deepEqual(a.bounds,b.bounds);if(b.volume!==null)assert(Math.abs(a.volume-b.volume)<1e-6);}assert.equal(after.perFeatureMs.length,2);}finally{cold.dispose();}
  }finally{kernel.dispose();}
});

test('timeline defaults are bounded to twenty and old larger limits are reduced',()=>{
 let doc={version:2,documentId:'d',features:[],imports:{},name:'0'};
 for(let i=1;i<35;i++){const next={...doc,name:String(i)};recordTimeline(doc,next);doc=next;}
 assert.equal(timelineList(doc).storedSteps,20);assert.equal(doc.timeline.maxBytes,512*1024);
 doc.timeline.maxSteps=100;const next={...doc,name:'last'};recordTimeline(doc,next);assert.equal(next.timeline.maxSteps,20);
 assert.throws(()=>finalStateProject(doc),{code:'PROJECT_SNAPSHOT_UNAVAILABLE'});
});
