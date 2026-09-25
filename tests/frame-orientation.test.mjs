import test from 'node:test';
import assert from 'node:assert/strict';
import {frameFromThreePoints,frameOnPlane,rotateLocalFrame} from '../src/frame-orientation.js';
import {rotateVector} from '../src/work-frame.js';

const close=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-9,`${a} != ${b}`);
test('three points define a right-handed work frame; collinear points reject',()=>{
 const frame=frameFromThreePoints([100,50,6],[100,51,6],[99,50,6]);
 close(frame.origin,[100,50,6]);close(rotateVector(frame.quaternion,[1,0,0]),[0,1,0]);close(rotateVector(frame.quaternion,[0,0,1]),[0,0,1]);
 assert.throws(()=>frameFromThreePoints([0,0,0],[1,0,0],[2,0,0]),{code:'ALIGN_UNDERCONSTRAINED'});
});
test('face alignment preserves a declared in-plane direction and local rotation',()=>{
 const frame=frameOnPlane([3,4,5],[0,-1,0],[0,0,0,1]);close(rotateVector(frame.quaternion,[0,0,1]),[0,-1,0]);
 const turned=rotateLocalFrame([0,0,0,1],'Z',90);close(rotateVector(turned,[1,0,0]),[0,1,0]);
 assert.throws(()=>frameOnPlane([0,0,0],[1,0,0],[0,0,0,1]),{code:'ALIGN_UNDERCONSTRAINED'});
});
