import test from 'node:test';
import assert from 'node:assert/strict';
import {maxSegmentCornerDegrees} from '../src/modeling/sweep-continuity.js';

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
