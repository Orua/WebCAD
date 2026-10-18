import test from 'node:test';
import assert from 'node:assert/strict';
import {boundsClearInXY,findFreePlacement,unionBounds,xShiftToClear,placePendingFeature} from '../src/free-placement.js';
import {recordTimeline,validateTimeline,restoreTimeline} from '../src/document-timeline.js';
import {encodeCommittedProject} from '../src/project-save.js';

const box=(x0,x1,y0,y1,z0=0,z1=10)=>({min:[x0,y0,z0],max:[x1,y1,z1]});

test('free placement uses origin in an empty document and the right edge otherwise',()=>{
  assert.deepEqual(findFreePlacement([],[20,10]),[0,0,0]);
  assert.deepEqual(findFreePlacement([box(-10,10,-5,5)],[8,4]),[19,0,0]);
});

test('union and X clearance cover disjoint existing models conservatively',()=>{
  const existing=[box(-10,0,-4,4),box(20,30,8,12)];
  assert.deepEqual(unionBounds(existing),box(-10,30,-4,12));
  assert.equal(xShiftToClear(existing,box(0,5,0,5),{gapMm:5}),35);
  assert.equal(boundsClearInXY(existing,box(40,45,0,5),{gapMm:5}),true);
});

test('placement validates model size, gap, and axis',()=>{
  assert.throws(()=>findFreePlacement([],[-1,2]));
  assert.throws(()=>findFreePlacement([],[2,2],{gapMm:-1}));
  assert.throws(()=>findFreePlacement([],[2,2],{axis:'z'}));
});

test('automatic placement commits a saveable history entry and restores the original recipe',async()=>{
  const previous={version:2,documentId:'placement',features:[],imports:{}};
  const candidate={...structuredClone(previous),features:[{id:'ring',op:'torus',params:{},refs:[],placement:{frameSnapshot:{origin:[0,0,0]}}}]};
  const original=structuredClone(candidate);
  const placed=await placePendingFeature({document:candidate,featureId:'ring',existingBodies:[{id:'existing',bounds:box(-15,15,-15,15)}],
    result:{bodies:[{id:'ring',bounds:box(-14,14,-14,14)}]},rebuild:async document=>{
      assert.equal(document.features[0].placement.frameSnapshot.origin[0],34);
      return {bodies:[{id:'ring',bounds:box(20,48,-14,14)}]};
    }});
  assert.deepEqual(candidate,original,'candidate and committed sources remain unchanged');
  recordTimeline(previous,placed.document);
  validateTimeline(placed.document);
  assert((await encodeCommittedProject(placed.document)).length>0);
  assert.deepEqual(restoreTimeline(placed.document,placed.document.timeline.baseId).features,[]);
  assert.equal(placed.document.timeline.entries.length,1,'one placement belongs to one history step');
  await assert.rejects(placePendingFeature({document:candidate,featureId:'ring',existingBodies:[{id:'existing',bounds:box(-15,15,-15,15)}],
    result:{bodies:[{id:'ring',bounds:box(-14,14,-14,14)}]},rebuild:async()=>{throw new Error('kernel failed');}}),/kernel failed/);
  assert.deepEqual(candidate,original,'failed placement leaves the source intact');
});
