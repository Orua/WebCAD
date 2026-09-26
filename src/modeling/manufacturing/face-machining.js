import {planarFace} from '../../reference-profile-wires.js';
import {validateSchema,contractError} from '../../contracts/operation-schema.js';
import {faceMachiningOperations} from './face-machining-contracts.js';
const dispose=x=>{try{x?.delete?.();}catch{}};
const fail=message=>contractError('GEOMETRY_INVALID','params',message,'READ_STATE_AND_REPLAN');
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);if(n<1e-10)fail('截面方向无效');return mul(a,1/n);};
export function buildFaceMachining(source,p,kind,oc,cad){
 validateSchema(faceMachiningOperations[kind].paramsSchema,p);let copy,cutter,outer,inner,result,normal,center,box,sketch,plane;let faces=[];
 try{
  copy=cad.deserializeShape(source.serialize());const solids=copy.solids;try{if(solids.length!==1)fail('加工来源须为一个封闭实体');}finally{solids.forEach(dispose);}
  faces=copy.faces;const face=faces[p.faceId];if(!face)contractError('STALE_REFERENCE','params.faceId','选中截面已失效','READ_STATE_AND_REPLAN');
  if(!planarFace(face,cad))contractError('CAPABILITY_UNAVAILABLE','params.faceId','请选择一个平面截面','READ_TOOL_CONTRACT');
  center=face.center;const origin=center.toTuple();normal=face.normalAt(origin);const axis=unit(mul(normal.toTuple(),-1));
  const seed=Math.abs(axis[0])<.9?[1,0,0]:[0,1,0],x=unit(seed.map((v,i)=>v-axis[i]*dot(seed,axis))),y=cross(axis,x);
  const epsilon=1e-5,start=add(origin,mul(axis,-epsilon)),height=p.depthMm+epsilon;
  if(kind==='faceGroove'){
   plane=new cad.Plane(start,x,axis);sketch=cad.drawRectangle(p.lengthMm,p.widthMm).sketchOnPlane(plane);cutter=sketch.extrude(height);
  }else if(kind==='innerTurn')cutter=cad.makeCylinder(p.diameterMm/2,height,start,axis);
  else{
   box=copy.boundingBox;const [min,max]=box.bounds;const corners=Array.from({length:8},(_,i)=>[i&1?max[0]:min[0],i&2?max[1]:min[1],i&4?max[2]:min[2]]);
   const radius=Math.max(...corners.map(v=>{const r=v.map((n,i)=>n-origin[i]);return Math.hypot(dot(r,x),dot(r,y));}))+1;
   if(p.diameterMm/2>=radius)fail('车削直径没有切入现有外形');
   outer=cad.makeCylinder(radius,height,start,axis);inner=cad.makeCylinder(p.diameterMm/2,height+2*epsilon,add(start,mul(axis,-epsilon)),axis);cutter=outer.cut(inner);
  }
  const before=cad.measureVolume(copy);result=copy.cut(cutter);let check;const pieces=result.solids;
  try{check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);if(pieces.length!==1||!check.IsValid())fail('加工结果须保留一个有效实体');const after=cad.measureVolume(result);if(!(after>1e-9)||before-after<=Math.max(1e-7,before*1e-9))contractError('NO_MATERIAL_REMOVED','params','加工没有实际去除材料或删除了整个实体','READ_STATE_AND_REPLAN');}finally{pieces.forEach(dispose);dispose(check);}
  return result;
 }catch(error){dispose(result);throw error;}finally{[copy,cutter,outer,inner,normal,center,box,sketch,plane,...faces].forEach(dispose);}
}
