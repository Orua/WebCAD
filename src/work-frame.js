import {placementPolicy} from './placement-policy.js';
import {resolveAlignPose} from './align-mode.js';

const fail=(code,path,message)=>{throw Object.assign(new Error(message),{code,path,recoveryAction:'READ_STATE_AND_REPLAN'});};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=(v,allowed,path)=>{if(!plain(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail('FRAME_INVALID',path,'Invalid reference fields');};
const vector=(v,length,path)=>{if(!Array.isArray(v)||v.length!==length||v.some(n=>typeof n!=='number'||!Number.isFinite(n)))fail('FRAME_INVALID',path,`Expected ${length} finite coordinates`);return [...v];};
export const identityFrame=()=>({origin:[0,0,0],quaternion:[0,0,0,1]});
export function validateFrame(value,path='frame'){
  fields(value,['origin','quaternion'],path);
  const origin=vector(value.origin,3,`${path}.origin`),quaternion=vector(value.quaternion,4,`${path}.quaternion`);
  const norm=Math.hypot(...quaternion);
  if(Math.abs(norm-1)>1e-6)fail('FRAME_INVALID',`${path}.quaternion`,'Quaternion must have unit length');
  return {origin,quaternion};
}
export function createReferenceSystem(){return {version:1,workFrame:{frameVersion:1,...identityFrame(),locked:false,sourceLabel:'世界原点',provenance:{kind:'manual'}},savedFrames:[],bodyAnchors:[]};}
export function validateReferenceSystem(system){
  fields(system,['version','workFrame','savedFrames','bodyAnchors'],'referenceSystem');
  if(system.version!==1||!Array.isArray(system.savedFrames)||!Array.isArray(system.bodyAnchors))fail('FRAME_INVALID','referenceSystem','Unsupported reference system');
  const w=system.workFrame;fields(w,['frameVersion','origin','quaternion','locked','sourceLabel','provenance'],'referenceSystem.workFrame');
  validateFrame({origin:w.origin,quaternion:w.quaternion},'referenceSystem.workFrame');
  if(!Number.isSafeInteger(w.frameVersion)||w.frameVersion<1||typeof w.locked!=='boolean')fail('FRAME_INVALID','referenceSystem.workFrame','Invalid frame version or lock state');
  if(typeof w.sourceLabel!=='string'||!w.sourceLabel.trim()||w.sourceLabel.length>100)fail('FRAME_INVALID','referenceSystem.workFrame.sourceLabel','Invalid source label');
  fields(w.provenance,['kind','frameId','frameVersion'],'referenceSystem.workFrame.provenance');
  if(!['manual','saved'].includes(w.provenance.kind))fail('FRAME_INVALID','referenceSystem.workFrame.provenance.kind','Unknown provenance');
  if(w.provenance.kind==='saved'&&(typeof w.provenance.frameId!=='string'||!Number.isSafeInteger(w.provenance.frameVersion)))fail('FRAME_INVALID','referenceSystem.workFrame.provenance','Invalid saved frame provenance');
  const ids=new Set();
  for(const [index,saved] of system.savedFrames.entries()){
    const path=`referenceSystem.savedFrames.${index}`;
    fields(saved,['frameId','frameVersion','name','origin','quaternion'],path);
    if(typeof saved.frameId!=='string'||!saved.frameId||ids.has(saved.frameId)||!Number.isSafeInteger(saved.frameVersion)||saved.frameVersion<1||typeof saved.name!=='string'||!saved.name.trim()||saved.name.length>100)fail('FRAME_INVALID',path,'Invalid saved frame identity');
    validateFrame({origin:saved.origin,quaternion:saved.quaternion},path);ids.add(saved.frameId);
  }
  const anchorIds=new Set();
  for(const [index,anchor] of system.bodyAnchors.entries()){
    const path=`referenceSystem.bodyAnchors.${index}`;
    fields(anchor,['anchorId','anchorVersion','bodyId','name','worldPoint','quaternion','geometryFingerprint','status'],path);
    if(typeof anchor.anchorId!=='string'||!anchor.anchorId||anchorIds.has(anchor.anchorId)||!Number.isSafeInteger(anchor.anchorVersion)||anchor.anchorVersion<1||typeof anchor.bodyId!=='string'||!anchor.bodyId||typeof anchor.name!=='string'||!anchor.name.trim()||anchor.name.length>100||typeof anchor.geometryFingerprint!=='string'||!anchor.geometryFingerprint.startsWith('brep-sha256:')||!['valid','stale'].includes(anchor.status))fail('FRAME_INVALID',path,'Invalid body anchor identity or proof');
    vector(anchor.worldPoint,3,`${path}.worldPoint`);validateFrame({origin:anchor.worldPoint,quaternion:anchor.quaternion},path);anchorIds.add(anchor.anchorId);
  }
  return structuredClone(system);
}
export function rotateVector(q,v){
  const [x,y,z,w]=q,[vx,vy,vz]=v;
  const tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);
  return [vx+w*tx+y*tz-z*ty,vy+w*ty+z*tx-x*tz,vz+w*tz+x*ty-y*tx];
}
export function worldPoint(frame,local){const r=rotateVector(frame.quaternion,local);return r.map((v,i)=>v+frame.origin[i]);}
export function localPoint(frame,world){return rotateVector(frame.quaternion.slice(0,3).map(v=>-v).concat(frame.quaternion[3]),world.map((v,i)=>v-frame.origin[i]));}
export function resolvePlacement(placement,system,op,params={}){
  if(placement===undefined)return undefined;
  const policy=placementPolicy(op);
  const spatialAxisOps=['transform','copy','mirror','linearPattern','circularPattern','split','planeSection','referenceExtrude'];
  if(!['C','T'].includes(policy)&&!spatialAxisOps.includes(op)&&!['faceHole','logo'].includes(op))fail('PLACEMENT_NOT_APPLICABLE','args.placement',`${op} placement is not enabled for this operation`);
  fields(placement,['version','frame','sourceAnchor'],'args.placement');
  if(placement.version!==1)fail('FRAME_INVALID','args.placement.version','Unsupported placement version');
  const f=placement.frame;fields(f,['kind','origin','quaternion','expectedFrameVersion','frameId'],'args.placement.frame');
  let frame,sourceFrameRef;
  if(f.kind==='world'){if(Object.keys(f).length!==1)fail('FRAME_INVALID','args.placement.frame','World frame has no coordinates');frame=identityFrame();sourceFrameRef={kind:'world'};}
  else if(f.kind==='snapshot'){if(Object.keys(f).length!==3)fail('FRAME_INVALID','args.placement.frame','Snapshot requires origin and quaternion');frame=validateFrame({origin:f.origin,quaternion:f.quaternion},'args.placement.frame');sourceFrameRef={kind:'snapshot'};}
  else if(f.kind==='work'){
    if(Object.keys(f).length!==2||f.expectedFrameVersion!==system.workFrame.frameVersion)fail('STALE_REFERENCE','args.placement.frame.expectedFrameVersion','Work frame changed');
    frame=validateFrame({origin:system.workFrame.origin,quaternion:system.workFrame.quaternion},'referenceSystem.workFrame');sourceFrameRef={kind:'work',frameVersion:f.expectedFrameVersion};
  }else if(f.kind==='saved'){
    if(Object.keys(f).length!==3)fail('FRAME_INVALID','args.placement.frame','Saved frame needs ID and version');
    const saved=system.savedFrames.find(x=>x.frameId===f.frameId);if(!saved||saved.frameVersion!==f.expectedFrameVersion)fail('STALE_REFERENCE','args.placement.frame','Saved frame changed');
    frame=validateFrame({origin:saved.origin,quaternion:saved.quaternion},'referenceSystem.savedFrames');sourceFrameRef={kind:'saved',frameId:f.frameId,frameVersion:f.expectedFrameVersion};
  }else fail('FRAME_INVALID','args.placement.frame.kind','Unknown frame kind');
  const a=placement.sourceAnchor??{kind:'model-origin'};fields(a,['kind','point','anchorId'],'args.placement.sourceAnchor');
  if(!['model-origin','bottom-center','bounds-center','point','named'].includes(a.kind))fail('PLACEMENT_NOT_APPLICABLE','args.placement.sourceAnchor.kind','Unsupported source anchor');
  if((policy==='T'||policy==='S'||policy==='X'&&!['transform','copy'].includes(op))&&a.kind!=='model-origin')fail('PLACEMENT_NOT_APPLICABLE','args.placement.sourceAnchor','This operation uses local coordinates without a source anchor');
  if(policy==='S'){vector(params.point,3,'args.params.point');if(op==='logo'&&params.placementVersion!==2)fail('PLACEMENT_NOT_APPLICABLE','args.params.placementVersion','Explicit logo placement requires version 2 target-face mode');}
  if(['transform','copy'].includes(op)){
    if(!params.mode)fail('COORDINATE_MODE_CONFLICT','args.params.mode','Explicit placement requires a transform mode');
    if(['positionMode','x','y','z','rx','ry','rz'].some(key=>Object.hasOwn(params,key)))fail('COORDINATE_MODE_CONFLICT','args.params','Legacy position fields conflict with the spatial mode');
    if(params.mode==='align'){if(a.kind!=='model-origin')fail('COORDINATE_MODE_CONFLICT','args.placement.sourceAnchor','Align mode declares its source point explicitly');resolveAlignPose(params,frame);}
    if(params.mode==='translate')vector(params.delta,3,'args.params.delta');
    else if(params.mode==='toPoint'){vector(params.targetPoint,3,'args.params.targetPoint');if(params.orientation!==undefined&&!['preserve','align-frame'].includes(params.orientation))fail('PARAM_SCHEMA_INVALID','args.params.orientation','Invalid orientation');}
    else if(params.mode==='rotate'){vector(params.pivot,3,'args.params.pivot');vector(params.axisVector,3,'args.params.axisVector');if(Math.hypot(...params.axisVector)<=1e-12||!Number.isFinite(params.angleDeg))fail('PARAM_RANGE_INVALID','args.params','Rotate needs a nonzero axis and finite angle');}
    else if(params.mode==='scale'){vector(params.pivot,3,'args.params.pivot');if(!Number.isFinite(params.scale)||params.scale<=0)fail('PARAM_RANGE_INVALID','args.params.scale','Scale must be positive');}
    else if(params.mode==='align'){}
    else fail('PARAM_SCHEMA_INVALID','args.params.mode','Unknown spatial mode');
  }
  if(op==='referenceExtrude')vector(params.direction,3,'args.params.direction');
  if(a.kind==='point')vector(a.point,3,'args.placement.sourceAnchor.point');
  else if(a.kind==='named'){if(!['transform','copy'].includes(op)||Object.keys(a).length!==2||typeof a.anchorId!=='string'||!a.anchorId)fail('PLACEMENT_NOT_APPLICABLE','args.placement.sourceAnchor','Named anchors require a current transform/copy source');}
  else if(Object.keys(a).length!==1)fail('FRAME_INVALID','args.placement.sourceAnchor','Unexpected source point');
  const named=a.kind==='named'?system.bodyAnchors.find(item=>item.anchorId===a.anchorId&&item.status==='valid'):null;
  if(a.kind==='named'&&!named)fail('STALE_REFERENCE','args.placement.sourceAnchor.anchorId','Named source anchor is missing or stale');
  const sourcePoint=a.kind==='named'?[...named.worldPoint]:a.kind==='point'?a.point:a.kind==='model-origin'?[0,0,0]:op==='box'?[params.width/2,params.depth/2,a.kind==='bounds-center'?params.height/2:0]:null;
  if(sourcePoint?.some(n=>!Number.isFinite(n)))fail('FRAME_INVALID','args.params','Source dimensions must be finite');
  return {version:1,resolverVersion:1,frameSnapshot:frame,sourceAnchor:structuredClone(a),sourceFrameRef,sourcePoint};
}
export function validateResolvedPlacement(placement,op){
  const path='feature.placement';
  fields(placement,['version','resolverVersion','frameSnapshot','sourceAnchor','sourceFrameRef','sourcePoint'],path);
  if(placement.version!==1||placement.resolverVersion!==1||!['C','T','S','X'].includes(placementPolicy(op)))fail('FRAME_INVALID',path,'Unsupported resolved placement');
  validateFrame(placement.frameSnapshot,`${path}.frameSnapshot`);
  fields(placement.sourceAnchor,['kind','point','anchorId'],`${path}.sourceAnchor`);
  if(!['model-origin','bottom-center','bounds-center','point','named'].includes(placement.sourceAnchor.kind))fail('FRAME_INVALID',`${path}.sourceAnchor.kind`,'Unknown source anchor');
  if(placement.sourceAnchor.kind==='point')vector(placement.sourceAnchor.point,3,`${path}.sourceAnchor.point`);
  else if(placement.sourceAnchor.kind==='named'){if(typeof placement.sourceAnchor.anchorId!=='string'||!placement.sourceAnchor.anchorId||Object.keys(placement.sourceAnchor).length!==2)fail('FRAME_INVALID',`${path}.sourceAnchor`,'Invalid named anchor');}
  else if(Object.keys(placement.sourceAnchor).length!==1)fail('FRAME_INVALID',`${path}.sourceAnchor`,'Unexpected anchor point');
  if(placement.sourcePoint!==null)vector(placement.sourcePoint,3,`${path}.sourcePoint`);
  fields(placement.sourceFrameRef,['kind','frameId','frameVersion'],`${path}.sourceFrameRef`);
  const ref=placement.sourceFrameRef;
  if(!['world','snapshot','work','saved'].includes(ref.kind))fail('FRAME_INVALID',`${path}.sourceFrameRef.kind`,'Unknown frame reference');
  if(['work','saved'].includes(ref.kind)&&(!Number.isSafeInteger(ref.frameVersion)||ref.frameVersion<1))fail('FRAME_INVALID',`${path}.sourceFrameRef.frameVersion`,'Invalid frame version');
  if(ref.kind==='saved'&&(typeof ref.frameId!=='string'||!ref.frameId))fail('FRAME_INVALID',`${path}.sourceFrameRef.frameId`,'Missing saved frame ID');
  return structuredClone(placement);
}
export function describeResolvedPlacement(op,params={},resolved){
  const frame=resolved.frameSnapshot,point=p=>worldPoint(frame,p),vector=v=>rotateVector(frame.quaternion,v),axis={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]}[params.axis||'Z'];
  const base={frameSnapshot:frame,sourcePoint:resolved.sourcePoint,coordinateSemantics:'explicit-local-frame',placementValidated:true,geometryValidated:false};
  if(['hole','slot'].includes(op))return {...base,worldPoint:point([params.x??0,params.y??0,params.z??0]),worldAxis:vector(axis.map(v=>v*(params.direction??1)))};
  if(['faceHole','logo'].includes(op))return {...base,worldPoint:point(params.point),worldAxis:vector([0,0,1])};
  if(['multiHole','multiBoss'].includes(op))return {...base,worldPoints:(params.points||[]).map(point),worldAxis:vector(axis.map(v=>v*(params.direction??1)))};
  if(op==='multiPocket')return {...base,worldPoints:(params.pockets||[]).map(p=>point([p.x,p.y,p.z])),worldAxis:vector(axis.map(v=>v*(params.direction??-1)))};
  if(op==='linearPattern')return {...base,worldVector:vector([params.dx??0,params.dy??0,params.dz??0]),originUsage:'none'};
  if(op==='circularPattern')return {...base,worldPoint:point([params.cx??0,params.cy??0,params.cz??0]),worldAxis:vector(axis)};
  if(['mirror','split','planeSection'].includes(op)){const name=params.plane||'XY',offset=params.offset??0,localPoint=name==='XY'?[0,0,offset]:name==='XZ'?[0,offset,0]:[offset,0,0],normal=name==='XY'?[0,0,1]:name==='XZ'?[0,-1,0]:[1,0,0];return {...base,worldPlane:{point:point(localPoint),normal:vector(normal)}};}
  if(op==='referenceExtrude')return {...base,worldVector:vector(params.direction),originUsage:'none'};
  if(['transform','copy'].includes(op)){
    if(params.mode==='translate')return {...base,worldVector:vector(params.delta),originUsage:'none'};
    if(params.mode==='toPoint')return {...base,worldPoint:point(params.targetPoint)};
    if(params.mode==='rotate')return {...base,worldPoint:point(params.pivot),worldAxis:vector(params.axisVector)};
    if(params.mode==='scale')return {...base,worldPoint:point(params.pivot)};
    if(params.mode==='align'){const pose=resolveAlignPose(params,frame);return {...base,worldPoint:pose.targetPoint,worldAxis:pose.worldAxis,sourcePoint:pose.sourcePoint,fullyConstrained:true};}
  }
  return {...base,worldPoint:[...frame.origin]};
}
