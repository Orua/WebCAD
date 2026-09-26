import test from 'node:test';
import assert from 'node:assert/strict';
import {projectEdgeToProfile,projectPointToProfile} from '../src/profile-projection.js';
const frame={origin:[10,20,0],quaternion:[0,0,0,1]},source={bodyId:'plate',geometryFingerprint:'brep-sha256:test'};

test('line and circle project to exact local editable geometry with frozen source snapshot',()=>{
  const line=projectEdgeToProfile({edgeId:2,geomType:'LINE',startPoint:[10,20,4],endPoint:[20,20,4]},frame,source);
  assert.deepEqual(line.startMm,[0,0]);assert.deepEqual(line.endMm,[10,0]);assert.equal(line.projectionSource.association,'snapshot-only');
  const circle=projectEdgeToProfile({edgeId:3,geomType:'CIRCLE',center:[15,20,3],axis:[0,0,1],radiusMm:2,startPoint:[17,20,3],endPoint:[17,20,3],lengthMidpoint:[13,20,3],lengthMm:4*Math.PI},frame,source);
  assert.equal(circle.type,'circle');assert.deepEqual(circle.centerMm,[5,0]);assert.equal(circle.diameterMm,4);
  assert.deepEqual(projectPointToProfile([20,21,7],frame).pointMm,[10,1]);
});

test('ellipse and collapsed line projections reject instead of fabricating curves',()=>{
  const edge={edgeId:3,geomType:'CIRCLE',center:[0,0,0],axis:[1,0,0],radiusMm:2,startPoint:[0,2,0],endPoint:[0,2,0],lengthMidpoint:[0,-2,0],lengthMm:4*Math.PI};
  assert.throws(()=>projectEdgeToProfile(edge,frame,source),{code:'UNSUPPORTED_CURVE_PROJECTION'});
  assert.throws(()=>projectEdgeToProfile({edgeId:4,geomType:'LINE',startPoint:[0,0,0],endPoint:[0,0,10]},frame,source),{code:'DEGENERATE_PROJECTION'});
});
