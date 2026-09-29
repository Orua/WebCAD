import assert from 'node:assert/strict';
import {snapReleasedDrag} from '../src/viewport/drag-snap-controller.js';

const viewport={
  snapEnabled:true,
  objects:new Map([['moving',{root:{visible:true}}],['target',{root:{visible:true}}]]),
  displayPreferences:{snapThresholdMm:0.2},
  callbacks:{onDragSnap:async()=>({requestId:1,ok:true})},
};
assert.equal(await snapReleasedDrag(viewport,{bodyId:'moving',translation:[1,0,0]}),null);
viewport.callbacks.onDragSnap=async()=>({requestId:2,ok:true,delta:[0.1,0,0]});
assert.deepEqual((await snapReleasedDrag(viewport,{bodyId:'moving',translation:[1,0,0]})).delta,[0.1,0,0]);
viewport.callbacks.onDragSnap=async()=>({requestId:3,ok:true,delta:[undefined,0,0]});
assert.equal(await snapReleasedDrag(viewport,{bodyId:'moving',translation:[1,0,0]}),null);
console.log('PASS drag snap accepts only finite 3D offsets');
