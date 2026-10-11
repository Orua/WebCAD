import {binaryHash,contractHash} from '../contracts/operation-schema.js';
import {serviceError} from './settings.js';
const dispose=value=>{try{value?.delete?.();}catch{}};
// A read-only eligibility hint. The native constructor independently checks
// support geometry, dimensions, topology and material before accepting a shape.
export function inspectFaceRoundSource(source,p,oc,cad,{sourceBrep=source.serialize(),prepare=false}={}){
 const shape=cad.deserializeShape(sourceBrep),faces=shape.faces,owned=[shape,...faces];
 try{
  const face=faces[p.faceIds?.[0]],cylinders=faces.filter(row=>row.geomType==='CYLINDRE');
  if(p.faceIds?.length!==1||!face||face.geomType!=='PLANE'||faces.length!==7||cylinders.length!==1||faces.filter(row=>row.geomType==='PLANE').length!==6)return {candidate:false};
  const boundary=face.edges,roundEdges=cylinders[0].edges;owned.push(...boundary,...roundEdges);
  if(boundary.length!==4||boundary.some(edge=>edge.geomType!=='LINE')||!boundary.some(edge=>roundEdges.some(other=>edge.isSame(other))))return {candidate:false};
  if(!prepare)return {candidate:true};
  const adaptor=new oc.BRepAdaptor_Surface(cylinders[0].wrapped,false),cylinder=adaptor.Cylinder();owned.push(adaptor,cylinder);
  const priorRadius=cylinder.Radius(),radius=p.radiusMm??priorRadius;
  if(!Number.isFinite(radius)||radius<=0||Math.abs(radius-priorRadius)>1e-7)throw serviceError('ROUND_RADIUS_MISMATCH','整面边界须沿用已有圆角的半径；不会缩小半径重试');
  const center=face.center,normal=face.normalAt();owned.push(center,normal);
  const n=normal.toTuple(),length=Math.hypot(...n);if(!(length>0))throw serviceError('GEOMETRY_INVALID','无法读取所选面的向外法向');
  return {candidate:true,semanticVersion:'round.planar-boundary-1.0',paramsFingerprint:contractHash(p),sourceSha256:binaryHash(new TextEncoder().encode(sourceBrep)).slice(7),
   params:{radius},selectionIntent:{kind:'planar-face-geometric-intent',point:center.toTuple(),normal:n.map(value=>value/length)},
   roundReport:{version:1,mode:'edge',requestedMode:p.mode??'auto',radiusMm:radius,resolved:{faceIds:[...p.faceIds],radius},scope:{kind:'face-boundaries',faceIds:[...p.faceIds]},control:{kind:'fixed-radius',min:.5,max:.5,value:.5},attemptCount:1,
    construction:'planar-boundary-cutter',cornerSemantics:'smooth-freeform-patches',limitations:['isolated-corner-termination-points','single-existing-equal-radius-edge','rectangular-planar-support-only']}};
 }finally{owned.reverse().forEach(dispose);}
}
