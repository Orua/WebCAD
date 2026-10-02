import test from 'node:test';
import assert from 'node:assert/strict';
import {recordTimeline,restoreTimeline,timelineList,validateTimeline} from '../src/document-timeline.js';
import {planBodyAlignment} from '../src/modeling/interaction/align-bodies.js';
test('history stores source once and reconstructs geometry, name, visibility, appearance and anchor',()=>{
 const first={version:2,documentId:'doc',name:'start',features:[{id:'original',op:'import',params:{key:'source'},refs:[]}],imports:{source:{format:'brep',data:'x'.repeat(100000)}},hidden:[],referenceSystem:{workFrame:{origin:[0,0,0]}}};
 let doc=first,states=[structuredClone(first)];
 for(let i=0;i<8;i++){const next=structuredClone(doc);next.features.push({id:'f'+i,op:'box',params:{width:i+1},refs:[]});next.name='state '+i;next.hidden=['f'+i];next.colors={['f'+i]:'#112233'};next.referenceSystem.workFrame.origin[0]=i;recordTimeline(doc,next);doc=next;states.push(structuredClone(doc));}
 validateTimeline(doc);assert(JSON.stringify(doc.timeline).length<12000);assert.equal(JSON.stringify(doc).split('x'.repeat(100000)).length,2);
 for(const [i,e]of timelineList(doc).entries.entries()){const restored=restoreTimeline(doc,e.id);delete restored.timeline;const expected=structuredClone(states[i]);delete expected.timeline;assert.deepEqual(restored,expected);}
 const old=restoreTimeline(doc,doc.timeline.baseId);recordTimeline(doc,old,{label:'退回开始'});validateTimeline(old);assert.equal(old.features.length,1);assert.equal(old.timeline.entries.length,9);
});
test('history pruning preserves earliest retained checkpoint and refuses hostile patches',()=>{
 let doc={version:2,documentId:'doc',features:[],imports:{},name:'a'};for(let i=0;i<12;i++){const next={...structuredClone(doc),name:String(i)};recordTimeline(doc,next,{maxSteps:4});doc=next;}assert.equal(timelineList(doc).storedSteps,4);assert.equal(restoreTimeline(doc,doc.timeline.baseId).name,'8');validateTimeline(doc);
 const bad=structuredClone(doc);bad.timeline.entries[0].patch=[{path:['__proto__','polluted'],value:true}];assert.throws(()=>validateTimeline(bad));assert.equal({}.polluted,undefined);
});
test('history pruning releases only sources unused by every retained state and keeps undo maps intact',()=>{
 let doc={version:2,documentId:'imports',name:'start',features:[],imports:{}};
 const undo=[];
 for(let i=0;i<6;i++){
  undo.push(doc);const next=structuredClone(doc),key='source'+i;
  next.features=[{id:'import'+i,op:'import',params:{key},refs:[]}];next.imports[key]={format:'brep',data:String(i).repeat(100000)};
  recordTimeline(doc,next,{maxSteps:3});doc=next;validateTimeline(doc);
 }
 assert.deepEqual(Object.keys(doc.imports),['source3','source4','source5']);
 assert(JSON.stringify(doc).length<302000);assert.equal(timelineList(doc).storedSteps,3);
 for(const [index,entry]of timelineList(doc).entries.entries()){
  const restored=restoreTimeline(doc,entry.id),key='source'+(index+3);
  assert.equal(restored.features[0].params.key,key);assert.equal(restored.imports[key].data,String(index+3).repeat(100000));
 }
 assert.equal(undo[2].imports.source0.data,'0'.repeat(100000),'an older undo snapshot owns its retained resource map');
 const reopened=JSON.parse(JSON.stringify(doc));validateTimeline(reopened);
 const restored=restoreTimeline(reopened,reopened.timeline.baseId);recordTimeline(reopened,restored,{label:'restore'});validateTimeline(restored);
 assert.equal(restored.features[0].params.key,'source3');assert.deepEqual(Object.keys(restored.imports),['source3','source4','source5']);
 const missing=structuredClone(doc);delete missing.imports.source3;
 assert.throws(()=>validateTimeline(missing),error=>error.code==='HISTORY_INVALID'&&/原始导入资源/.test(error.message));
});
test('history retains a deleted import until its last checkpoint expires, including byte pruning',()=>{
 const original={version:2,documentId:'deleted',name:'start',features:[{id:'source',op:'import',params:{key:'asset'},refs:[]}],imports:{asset:{format:'brep',data:'original bytes'}}};
 const removed={...structuredClone(original),features:[]};recordTimeline(original,removed,{maxSteps:2});assert.equal(removed.imports.asset.data,'original bytes');
 const renamed={...structuredClone(removed),name:'later'};recordTimeline(removed,renamed);validateTimeline(renamed);assert.deepEqual(renamed.imports,{});assert.equal(original.imports.asset.data,'original bytes');
 const beforeLarge={...structuredClone(original),name:'a'.repeat(4000)},large={...structuredClone(original),features:[],name:'x'.repeat(5000)};recordTimeline(beforeLarge,large,{maxBytes:6000});validateTimeline(large);assert.deepEqual(large.imports,{});assert.equal(timelineList(large).storedSteps,1);
 const noHistory={...structuredClone(original),features:[],name:'x'.repeat(5000)};recordTimeline(original,noHistory,{maxBytes:100});assert.equal(noHistory.timeline,undefined);assert.deepEqual(noHistory.imports,{});
});
test('alignment supports group and independent axes while preserving target',()=>{
 const bodies=[{id:'a',bounds:{min:[10,20,30],max:[12,24,36]}},{id:'b',bounds:{min:[20,20,30],max:[22,24,36]}},{id:'ref',bounds:{min:[-2,-4,0],max:[2,4,8]}}];
 const p=planBodyAlignment({bodyIds:['a','b'],target:{kind:'origin'},axes:['X','Z']},bodies,{});assert.deepEqual(p.moves.map(m=>m.delta),[[-16,0,-33],[-16,0,-33]]);
 const q=planBodyAlignment({bodyIds:['a','b'],target:{kind:'body',bodyId:'ref'},axes:['Z'],sourceSide:'min',targetSide:'max',gapMm:[0,0,2],group:false},bodies,{});assert.deepEqual(q.moves.map(m=>m.delta),[[0,0,-20],[0,0,-20]]);
 assert.throws(()=>planBodyAlignment({bodyIds:['a'],target:{kind:'body',bodyId:'a'}},bodies,{}));
});
