import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {recordTimeline,restoreTimeline,timelineList,validateTimeline} from '../src/document-timeline.js';

test('retained checkpoints and existing undo snapshots rebuild real imported BREP after source pruning',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
 kernel.quality='draft';
 const fixtures=[['box',{width:7,depth:4,height:3}],['cylinder',{radius:3,height:7}],['torus',{majorRadius:9,minorRadius:2}],['cone',{radius1:4,radius2:1,height:8}]],expected=new Map(),undo=[];
 let doc={version:2,documentId:'brep-history',name:'history test',features:[],imports:{},hidden:[]};
 try{
  for(const [index,[op,params]]of fixtures.entries()){
   await kernel.rebuild({version:2,features:[{id:'fixture',op,params,refs:[]}],imports:{}});
   const serialized=kernel.shapes.get('fixture').serialize(),key='asset'+index;
   expected.set(key,kernel.measure('fixture'));undo.push(doc);
   const next={...structuredClone(doc),features:[{id:'part'+index,op:'import',params:{key},refs:[]}],imports:{...doc.imports,[key]:{format:'brep',data:Buffer.from(serialized).toString('base64')}}};
   recordTimeline(doc,next,{maxSteps:3});doc=next;
  }
  assert.deepEqual(Object.keys(doc.imports),['asset1','asset2','asset3']);
  const reopened=JSON.parse(JSON.stringify(doc));validateTimeline(reopened);
  const states=timelineList(reopened).entries.map(e=>restoreTimeline(reopened,e.id));
  states.push(undo[1]);assert.deepEqual(Object.keys(undo[1].imports),['asset0']);
  for(const restored of states){
   const sourceBytes=JSON.stringify(restored.imports),feature=restored.features[0],wanted=expected.get(feature.params.key);
   const result=await kernel.rebuild(restored),actual=kernel.measure(feature.id);
   assert.equal(actual.solidCount,1);assert.equal(result.bodies.length,1);assert(result.bodies[0].indices.length>0);
   for(const key of ['volume','area'])assert(Math.abs(actual[key]-wanted[key])<1e-5);
   for(let i=0;i<3;i++){assert(Math.abs(actual.bounds.min[i]-wanted.bounds.min[i])<1e-6);assert(Math.abs(actual.bounds.max[i]-wanted.bounds.max[i])<1e-6);}
   assert.equal(JSON.stringify(restored.imports),sourceBytes,'restoration keeps source bytes read-only');
  }
 }finally{kernel.dispose();}
});
