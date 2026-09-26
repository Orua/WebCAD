import test from 'node:test';
import assert from 'node:assert/strict';
import {usesDiameter,displayDimension,geometryDimensions} from '../src/dimension-adapter.js';

test('new and historical hole or cylinder dimensions share diameter adapter',()=>{
  for(const op of ['cylinder','hole','multiHole','faceHole','multiBoss']){
    assert.equal(usesDiameter(op,'radius'),true);
    assert.equal(displayDimension(op,'radius',2),4);
    assert.equal(geometryDimensions(op,{radius:5}).radius,2.5);
  }
  assert.equal(displayDimension('fillet','radius',2),2);
  assert.equal(geometryDimensions('fillet',{radius:2}).radius,2);
});
