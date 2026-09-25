import test from 'node:test';
import assert from 'node:assert/strict';
import {clearOccupiedAnchor} from '../src/anchor-clearance.js';

function box(x0,x1,y0,y1,z0,z1){
  const positions=new Float32Array([x0,y0,z0,x1,y0,z0,x1,y1,z0,x0,y1,z0,x0,y0,z1,x1,y0,z1,x1,y1,z1,x0,y1,z1]);
  const indices=new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
  return {positions,indices,solidCount:1,bounds:{min:[x0,y0,z0],max:[x1,y1,z1]}};
}

test('occupied work point rises along world Z, without changing X/Y',()=>{
  assert.deepEqual(clearOccupiedAnchor([0,0,0],[box(-2,2,-2,2,0,10)]),[0,0,10.05]);
});
test('nearby taller solid and a hollow vertical column leave an empty anchor fixed',()=>{
  const around=[box(-5,-2,-5,5,0,30),box(2,5,-5,5,0,30),box(-2,2,-5,-2,0,30),box(-2,2,2,5,0,30)];
  assert.deepEqual(clearOccupiedAnchor([0,0,1],around),[0,0,1]);
  assert.deepEqual(clearOccupiedAnchor([0,0,1],[box(3,9,3,9,0,100)]),[0,0,1]);
});
test('stacked intersecting solids move to the first available space above both',()=>{
  assert.deepEqual(clearOccupiedAnchor([0,0,2],[box(-2,2,-2,2,0,10),box(-2,2,-2,2,9,20)]),[0,0,20.05]);
});
