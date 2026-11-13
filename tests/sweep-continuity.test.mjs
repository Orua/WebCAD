import test from 'node:test';
import assert from 'node:assert/strict';
import {maxSegmentCornerDegrees, sharpSweepMessage} from '../src/modeling/sweep-continuity.js';

test('translated tangent circular arcs retain zero corners in either direction',()=>{
  for(const sign of [1,-1]){
    const point=angle=>[12+3*Math.cos(sign*angle),-7+3*Math.sin(sign*angle),4];
    const segments=Array.from({length:4},(_,i)=>({type:'arc',points:[point(i*Math.PI/2),point((i+.5)*Math.PI/2),point((i+1)*Math.PI/2)]}));
    assert.ok(maxSegmentCornerDegrees(segments)<1e-5);
  }
});

test('true line corners remain distinct from tangent arcs',()=>{
  const points=[[0,0,0],[10,0,0],[10,10,0],[0,10,0]];
  const segments=points.map((point,i)=>({type:'line',points:[point,points[(i+1)%4]]}));
  assert.equal(maxSegmentCornerDegrees(segments),90);
});

test('open polylines ignore the implied closing turn when measuring corners', () => {
  const openL = [
    {type:'line', points:[[0,0,0],[10,0,0]]},
    {type:'line', points:[[10,0,0],[10,10,0]]},
  ];
  assert.equal(maxSegmentCornerDegrees(openL, {closed:false}), 90);
  const openU = [
    {type:'line', points:[[0,0,0],[0,10,0]]},
    {type:'line', points:[[0,10,0],[10,10,0]]},
    {type:'line', points:[[10,10,0],[10,0,0]]},
  ];
  assert.equal(maxSegmentCornerDegrees(openU, {closed:false}), 90);
  assert.equal(maxSegmentCornerDegrees(openU, {closed:true}), 180);
});

test('sharpSweepMessage distinguishes open and closed paths', () => {
  assert.match(sharpSweepMessage(90, 'transformed', {closed:false}), /开放扫掠路径/);
  assert.match(sharpSweepMessage(90, 'transformed', {closed:true}), /闭合扫掠路径/);
  assert.match(sharpSweepMessage(90, 'transformed'), /闭合扫掠路径/);
});
