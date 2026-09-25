import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAlignPose} from '../src/align-mode.js';
import {rotateVector} from '../src/work-frame.js';

const frame={origin:[0,0,0],quaternion:[0,0,0,1]};
const params={sourcePoint:[1,2,3],sourceAxis:[0,0,1],sourceUp:[1,0,0],targetPoint:[10,20,30],targetAxis:[1,0,0],targetUp:[0,1,0],axisRelation:'same',gapMm:2,twistAngleDeg:0};
const close=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-9,`${a} != ${b}`);
test('align maps both axis and in-plane direction with explicit point and gap',()=>{
 const pose=resolveAlignPose(params,frame);
 close(pose.targetPoint,[12,20,30]);close(rotateVector(pose.rotationQuaternion,[0,0,1]),[1,0,0]);close(rotateVector(pose.rotationQuaternion,[1,0,0]),[0,1,0]);
 assert.equal(pose.fullyConstrained,true);
});
test('opposite normals and degenerate in-plane references are explicit',()=>{
 const pose=resolveAlignPose({...params,axisRelation:'opposite'},frame);close(rotateVector(pose.rotationQuaternion,[0,0,1]),[-1,0,0]);
 assert.throws(()=>resolveAlignPose({...params,sourceUp:[0,0,2]},frame),{code:'ALIGN_UNDERCONSTRAINED'});
 assert.throws(()=>resolveAlignPose({...params,twistAngleDeg:undefined},frame),{code:'ALIGN_UNDERCONSTRAINED'});
});
