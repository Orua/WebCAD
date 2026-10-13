import {binaryHash,contractHash} from '../contracts/operation-schema.js';
import {serviceError} from './settings.js';
const dispose=value=>{try{value?.delete?.();}catch{}};

export function prepareShoulderPlan(source,p,oc,cad,{sourceBrep=source.serialize()}={}){
 const shape=cad.deserializeShape(sourceBrep),faces=shape.faces,owned=[shape,...faces];
 try{
  const face=faces[p.faceId];
  if(!face||face.geomType!=='PLANE'||!Array.isArray(p.point)||p.point.length!==3)throw serviceError('SELECTION_UNSUPPORTED','选择浮雕层上方、下方或侧方的平面阶梯及其内部点');
  const point=cad.makeVertex(p.point),query=new oc.BRepExtrema_DistShapeShape();owned.push(point,query);
  query.LoadS1(point.wrapped);query.LoadS2(face.wrapped);query.Perform();
  if(!query.IsDone()||query.NbSolution()<1||query.Value()>1e-7)throw serviceError('SELECTION_UNSUPPORTED','肩部选择点必须位于当前阶梯面的内部');
  const support=query.SupportOnShape2(1);owned.push(support);
  if(support.ShapeType()!==oc.TopAbs_ShapeEnum.TopAbs_FACE||!support.IsSame(face.wrapped))throw serviceError('SELECTION_UNSUPPORTED','选择点不能位于阶梯边缘');
  const normal=face.normalAt(p.point);owned.push(normal);const n=normal.toTuple(),length=Math.hypot(...n);
  if(!(length>0))throw serviceError('GEOMETRY_INVALID','无法确定当前阶梯面的向外法向');
  return {candidate:true,semanticVersion:'relief.central-shoulder-1.0',paramsFingerprint:contractHash(p),sourceSha256:binaryHash(new TextEncoder().encode(sourceBrep)).slice(7),
   params:{widthMm:p.widthMm,endProtectionMm:p.endProtectionMm,endPolicy:p.endPolicy},
   selectionIntent:{kind:'planar-face-geometric-intent',point:[...p.point],normal:n.map(v=>v/length)}};
 }finally{owned.reverse().forEach(dispose);}
}
