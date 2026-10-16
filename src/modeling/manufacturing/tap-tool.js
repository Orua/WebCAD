import {metricThreadSpec} from '../../quick-models/hardware-models.js';
import {buildThread} from './helical-tools.js';

const dispose=x=>{try{x?.delete?.();}catch{}};
const fail=(code,message)=>{throw Object.assign(new Error(`攻牙：${message}`),{code});};

// The selected planar face is resolved by CadKernel, using the same outward
// normal as faceHole. Work in an inward +Z frame before constructing the bore.
export function buildTap(source,p,info,oc,cad){
 const {size,diameterMm,pitchMm}=metricThreadSpec(p.threadSize),depth=p.depthMm,point=p.point;
 if(!Number.isFinite(depth)||depth<=0||depth/pitchMm>100)fail('TAP_DEPTH_INVALID','深度须大于零，且不能超过 100 圈');
 if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))fail('TAP_POINT_INVALID','请填写有效的孔中心坐标');
 const normal=info.normal,axis=normal.map(v=>-v),cross=[axis[1],-axis[0],0],n=Math.hypot(...cross);
 const rotationAxis=n>1e-12?cross.map(v=>v/n):[1,0,0],angle=Math.acos(Math.max(-1,Math.min(1,axis[2])))*180/Math.PI;
 const tooth=.54*pitchMm,radius=diameterMm/2-tooth,epsilon=1e-4;
 let vertex,local,envelope,inside,bore,drilled,threaded,result;let faces=[];
 try{
  vertex=cad.makeVertex(point);
  if(cad.measureDistanceBetween(info.face,vertex)>1e-5)fail('TAP_POINT_INVALID','孔中心必须位于选定平面的有效区域');
  local=source.clone().translate(point.map(v=>-v));
  if(angle>1e-10)local=local.rotate(angle,[0,0,0],rotationAxis);
  // Require the entire nominal diameter and a bottom margin to remain in
  // continuous material. No silent breakthrough or half-hole at an edge.
  envelope=cad.makeCylinder(diameterMm/2,depth,[0,0,epsilon]);inside=local.intersect(envelope);
  const expected=Math.PI*(diameterMm/2)**2*depth;
  if(Math.abs(cad.measureVolume(inside)-expected)>Math.max(1e-7,expected*1e-7))fail('TAP_MATERIAL_INSUFFICIENT','孔径或深度超出连续材料，请缩短深度或移开边缘/已有孔');
  bore=cad.makeCylinder(radius,depth,[0,0,0]);drilled=local.cut(bore);
  faces=drilled.faces;const matches=[];
  for(let i=0;i<faces.length;i++){
   if(faces[i].geomType!=='CYLINDRE')continue;
   let adaptor,cylinder,location;
   try{adaptor=new oc.BRepAdaptor_Surface(faces[i].wrapped,true);cylinder=adaptor.Cylinder();location=cylinder.Location();
    if(Math.abs(cylinder.Radius()-radius)<1e-7&&Math.hypot(location.X(),location.Y())<1e-7)matches.push(i);
   }finally{[location,cylinder,adaptor].forEach(dispose);}
  }
  if(matches.length!==1)fail('TAP_BORE_AMBIGUOUS','无法唯一识别新建底孔');
  threaded=buildThread(drilled,{faceId:matches[0],kind:'internal',pitchMm,depthMm:tooth,lengthMm:depth},oc,cad);
  const report={...threaded.threadReport,operation:'tap',nominalMetricSize:size,nominalDiameterMm:diameterMm,boreDiameterMm:2*radius,entryFaceId:p.faceId,axisOrigin:[...point],axisDirection:axis,coordinateSystem:'world',tappingDepthMm:depth};
  result=threaded;threaded=null;
  if(angle>1e-10)result=result.rotate(-angle,[0,0,0],rotationAxis);
  result=result.translate(point);result.threadReport=report;
  const out=result;result=null;return out;
 }finally{[result,threaded,...faces,drilled,bore,inside,envelope,local,vertex].forEach(dispose);}
}

