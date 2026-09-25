import {resolveAlignPose} from './align-mode.js';
import {rotateVector} from './work-frame.js';

const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const multiply=(a,b)=>{const [x,y,z,w]=a,[u,v,t,s]=b;return [w*u+x*s+y*t-z*v,w*v-x*t+y*s+z*u,w*t+x*v-y*u+z*s,w*s-x*u-y*v-z*t];};
const base={origin:[0,0,0],quaternion:[0,0,0,1]};
const orient=(axis,up)=>resolveAlignPose({sourcePoint:[0,0,0],sourceAxis:[0,0,1],sourceUp:[1,0,0],targetPoint:[0,0,0],targetAxis:axis,targetUp:up,axisRelation:'same',gapMm:0,twistAngleDeg:0},base).rotationQuaternion;
export function frameFromThreePoints(origin,xPoint,xyPoint){
  if([origin,xPoint,xyPoint].some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))throw Object.assign(new Error('Three finite XYZ points required'),{code:'FRAME_INVALID'});
  const x=sub(xPoint,origin),toward=sub(xyPoint,origin),z=cross(x,toward);
  return {origin:[...origin],quaternion:orient(z,x)};
}
export function frameOnPlane(origin,normal,currentQuaternion){
  if(!Array.isArray(origin)||origin.length!==3||origin.some(v=>!Number.isFinite(v))||!Array.isArray(normal)||normal.length!==3||normal.some(v=>!Number.isFinite(v)))throw Object.assign(new Error('Exact planar face point and normal required'),{code:'FRAME_INVALID'});
  return {origin:[...origin],quaternion:orient(normal,rotateVector(currentQuaternion,[1,0,0]))};
}
export function rotateLocalFrame(quaternion,axis,angleDeg){
  if(!['X','Y','Z'].includes(axis)||!Number.isFinite(angleDeg))throw Object.assign(new Error('Local axis and finite angle required'),{code:'FRAME_INVALID'});
  const v={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]}[axis],s=Math.sin(angleDeg*Math.PI/360),r=[...v.map(n=>n*s),Math.cos(angleDeg*Math.PI/360)];
  return multiply(quaternion,r);
}
