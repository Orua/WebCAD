import {rotateVector,worldPoint} from '../../work-frame.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const valid=(value,label)=>{if(!Number.isFinite(value)||value<=0)throw new Error(`${label}必须大于零`);return value;};
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const pointOnRay=(origin,axis,t)=>origin.map((v,i)=>v+axis[i]*t);
const axisByName={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]};
const radial=axis=>{const seed=Math.abs(axis[0])<0.9?[1,0,0]:[0,1,0],cross=[axis[1]*seed[2]-axis[2]*seed[1],axis[2]*seed[0]-axis[0]*seed[2],axis[0]*seed[1]-axis[1]*seed[0]],m=Math.hypot(...cross);return cross.map(v=>v/m);};
function exactCenterMaterialDepth(shape,cad,start,axis){
  const box=shape.boundingBox;let line,common;
  try{const [min,max]=box.bounds,length=Math.hypot(...max.map((v,i)=>v-min[i]))*2+10;line=cad.makeLine(start,pointOnRay(start,axis,length));common=shape.intersect(line);const edges=common.edges,intervals=[];try{for(const edge of edges){const a=edge.startPoint,b=edge.endPoint;try{const ta=dot(a.toTuple().map((v,i)=>v-start[i]),axis),tb=dot(b.toTuple().map((v,i)=>v-start[i]),axis);intervals.push([Math.min(ta,tb),Math.max(ta,tb)]);}finally{dispose(a);dispose(b);}}}finally{edges.forEach(dispose);}const entry=intervals.find(([lo,hi])=>Math.abs(lo)<1e-5&&hi>1e-5);if(!entry)throw new Error('孔中心未从选定位置进入连续材料');return {firstDepth:entry[1],throughDepth:Math.max(...intervals.map(([,hi])=>hi))};}finally{[box,line,common].forEach(dispose);}
}
function frustum(cad,point,axis,largeRadius,smallRadius,depth){const r=radial(axis),at=(radius,z)=>pointOnRay(pointOnRay(point,axis,z),r,radius),face=cad.makePolygon([point,at(largeRadius,0),at(smallRadius,depth),pointOnRay(point,axis,depth)]);try{return cad.revolution(face,point,axis,360);}finally{dispose(face);}}
export function buildHoleWizard(shape,p,cad,frame){
  const kind=p.kind||'plain';if(!['plain','counterbore','countersink'].includes(kind))throw new Error('未知孔型');
  const diameter=valid(p.diameterMm,'小孔直径'),axisName=p.axis||'Z',direction=p.direction??1;
  if(!axisByName[axisName]||![1,-1].includes(direction))throw new Error('孔轴或钻孔方向无效');
  if(![p.x,p.y,p.z].every(Number.isFinite))throw new Error('钻孔起点必须为有限世界/基准坐标');
  const localAxis=axisByName[axisName].map(v=>v*direction),axis=frame?rotateVector(frame.quaternion,localAxis):localAxis,start=frame?worldPoint(frame,[p.x,p.y,p.z]):[p.x,p.y,p.z];
  const material=exactCenterMaterialDepth(shape,cad,start,axis),interval=material.firstDepth,through=p.through===true,depth=through?material.throughDepth+1:valid(p.depthMm,'孔深');
  if(!through&&depth>=interval-1e-5)throw new Error('盲孔深度到达或穿过材料边界；请缩短孔深或明确选贯穿');
  const largeDiameter=kind==='plain'?null:valid(p.recessDiameterMm,'大孔直径');
  if(largeDiameter!==null&&largeDiameter<=diameter)throw new Error('沉孔/沉头大直径必须大于小孔直径');
  let recessDepth=0;
  if(kind==='counterbore')recessDepth=valid(p.recessDepthMm,'沉孔深度');
  if(kind==='countersink'){const angle=valid(p.includedAngleDeg,'锥体包含角');if(angle>=179)throw new Error('锥体包含角须小于 179°');recessDepth=(largeDiameter-diameter)/(2*Math.tan(angle*Math.PI/360));}
  if(recessDepth&&recessDepth>=Math.min(depth,interval)-1e-5)throw new Error('沉孔/沉头深度超过小孔深度或局部材料厚度');
  let small,large,first,result;
  try{
    small=cad.makeCylinder(diameter/2,depth,start,axis);first=shape.cut(small);
    const before=Math.abs(cad.measureVolume(shape)),afterSmall=first.isNull?0:Math.abs(cad.measureVolume(first));
    if(before-afterSmall<=Math.max(1e-8,before*1e-12))throw new Error('小孔未切入材料');
    if(kind==='plain'){result=first;first=null;return result;}
    large=kind==='counterbore'?cad.makeCylinder(largeDiameter/2,recessDepth,start,axis):frustum(cad,start,axis,largeDiameter/2,diameter/2,recessDepth);
    result=first.cut(large);const after=result.isNull?0:Math.abs(cad.measureVolume(result));
    if(afterSmall-after<=Math.max(1e-8,before*1e-12))throw new Error('沉孔/沉头没有去除额外材料');
    return result;
  }catch(error){dispose(result);throw error;}finally{[small,large,first].forEach(dispose);}
}
