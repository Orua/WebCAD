import test from 'node:test';
import assert from 'node:assert/strict';
import {countSummary,formatBodyCount} from '../src/count-summary.js';

test('object and solid counts use stable separate meanings',()=>{
  const bodies=[{solidCount:1},{solidCount:4},{solidCount:0}];
  assert.deepEqual(countSummary(bodies),{objects:3,solids:5});
  assert.equal(formatBodyCount(bodies),'3 个对象 · 5 个实心体');
});

test('empty and incomplete body records do not inflate solid count',()=>{
  assert.deepEqual(countSummary([]),{objects:0,solids:0});
  assert.equal(formatBodyCount([{}, {solidCount:NaN}]),'2 个对象 · 0 个实心体');
});
