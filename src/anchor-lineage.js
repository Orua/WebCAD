import {rotateVector,worldPoint} from './work-frame.js';
import {resolveAlignPose} from './align-mode.js';

const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,n)=>a.map(v=>v*n);
const unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
const multiply=(a,b)=>{const [x,y,z,w]=a,[u,v,t,s]=b;return [w*u+x*s+y*t-z*v,w*v-x*t+y*s+z*u,w*t+x*v-y*u+z*s,w*s-x*u-y*v-z*t];};
const axisAngle=(axis,degrees)=>{const a=unit(axis),s=Math.sin(degrees*Math.PI/360);return [...scale(a,s),Math.cos(degrees*Math.PI/360)];};
function sourcePoint(placement,body){
  if(placement.sourcePoint!==null)return placement.sourcePoint;
  const {min,max}=body.bounds;
  return min.map((v,i)=>i===2&&placement.sourceAnchor.kind==='bottom-center'?v:(v+max[i])/2);
}
export function inheritedAnchorPose(anchor,feature,body){
  if(!['transform','copy'].includes(feature.op)||!feature.params?.mode||!feature.placement?.frameSnapshot)return null;
  const p=feature.params,f=feature.placement.frameSnapshot,at=value=>worldPoint(f,value),dir=value=>rotateVector(f.quaternion,value);
  if(p.mode==='translate')return {worldPoint:add(anchor.worldPoint,dir(p.delta)),quaternion:[...anchor.quaternion]};
  if(p.mode==='scale'){const pivot=at(p.pivot);return {worldPoint:add(pivot,scale(sub(anchor.worldPoint,pivot),p.scale)),quaternion:[...anchor.quaternion]};}
  if(p.mode==='rotate'){const pivot=at(p.pivot),rotation=axisAngle(dir(p.axisVector),p.angleDeg);return {worldPoint:add(pivot,rotateVector(rotation,sub(anchor.worldPoint,pivot))),quaternion:multiply(rotation,anchor.quaternion)};}
  if(p.mode==='toPoint'){
    const source=sourcePoint(feature.placement,body),target=at(p.targetPoint);
    if((p.orientation??'preserve')==='preserve')return {worldPoint:add(anchor.worldPoint,sub(target,source)),quaternion:[...anchor.quaternion]};
    return {worldPoint:add(target,rotateVector(f.quaternion,sub(anchor.worldPoint,source))),quaternion:multiply(f.quaternion,anchor.quaternion)};
  }
  if(p.mode==='align'){const pose=resolveAlignPose(p,f);return {worldPoint:add(pose.targetPoint,rotateVector(pose.rotationQuaternion,sub(anchor.worldPoint,pose.sourcePoint))),quaternion:multiply(pose.rotationQuaternion,anchor.quaternion)};}
  return null;
}
export async function synchronizeBodyAnchors(previous,next,previousBodies,currentBodies,fingerprintOf){
  const anchors=next.referenceSystem?.bodyAnchors;if(!anchors?.length)return;
  const last=next.features.at(-1),newFeature=last&&next.features.length===previous.features.length+1&&last.id!==previous.features.at(-1)?.id;
  if(newFeature&&['transform','copy'].includes(last.op)&&last.refs?.length===1&&currentBodies.some(body=>body.id===last.id)){
    const sourceBody=previousBodies.find(body=>body.id===last.refs[0]);
    if(sourceBody){const destinationFingerprint=await fingerprintOf(last.id);for(const anchor of previous.referenceSystem.bodyAnchors.filter(a=>a.bodyId===sourceBody.id&&a.status==='valid')){
      const pose=inheritedAnchorPose(anchor,last,sourceBody);
      if(pose)anchors.push({anchorId:crypto.randomUUID(),anchorVersion:1,bodyId:last.id,name:anchor.name,worldPoint:pose.worldPoint,quaternion:pose.quaternion,geometryFingerprint:destinationFingerprint,status:'valid'});
    }}
  }
  const active=new Set(currentBodies.map(body=>body.id)),fingerprints=new Map();
  for(const anchor of anchors){
    if(!active.has(anchor.bodyId)){anchor.status='stale';continue;}
    if(!fingerprints.has(anchor.bodyId))fingerprints.set(anchor.bodyId,await fingerprintOf(anchor.bodyId));
    if(anchor.geometryFingerprint!==fingerprints.get(anchor.bodyId))anchor.status='stale';
  }
}
