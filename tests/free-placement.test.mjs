import test from 'node:test';
import assert from 'node:assert/strict';
import {boundsClearInXY,findFreePlacement,unionBounds,xShiftToClear} from '../src/free-placement.js';

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
