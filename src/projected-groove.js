import {buildSectionCurveLoft} from './section-curve-loft.js';

const dispose = object => { try { object?.delete?.(); } catch {} };
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm = v => Math.hypot(...v);
const unit = vector => {const length=norm(vector);if(length<1e-10)throw new Error('无法构造稳定的沿面标架');return vector.map(n=>n/length);};
const dist = (a,b) => norm(a.map((x,i)=>x-b[i]));
const check = (ok,message) => { if(!ok) throw new Error(message); };
const finitePositive = (value,name) => {
  check(typeof value==='number' && Number.isFinite(value) && value>0,`${name} 必须为正的有限数值`);
  return value;
};
function solidCount(shape) {
  const solids=shape.solids;
  try{return solids.length;}finally{solids.forEach(dispose);}
}
function projectPoint(face,cad,point,hold){
  const anchor=hold(cad.makeVertex(point));
  const query=hold(new cad.DistanceQuery(face));
  const residualMm=query.distanceTo(anchor);
  const snapped=hold(query.wrapped.PointOnShape1(1));
  return {point:[snapped.X(),snapped.Y(),snapped.Z()],residualMm};
}
function polylineLength(points){
  let length=0;
  for(let i=1;i<points.length;i++)length+=dist(points[i],points[i-1]);
  return length;
}
function pointAtLength(points,target){
  let walked=0;
  for(let i=1;i<points.length;i++){
    const step=dist(points[i],points[i-1]);
    if(walked+step>=target||i===points.length-1){
      const span=Math.max(step,1e-15),f=Math.min(1,Math.max(0,(target-walked)/span));
      return points[i-1].map((v,j)=>v*(1-f)+points[i][j]*f);
    }
    walked+=step;
  }
  return points.at(-1);
}
function boundaryEdges(face,cad,hold){
  const oc=cad.getOC(),edges=face.edges;
  hold(...edges);
  const periodic=edges.filter(edge=>{try{return oc.BRep_Tool.IsClosed(edge.wrapped,face.wrapped);}catch{return false;}});
  return edges.filter(edge=>!periodic.includes(edge));
}
function onBoundary(point,edges,cad,hold){
  const vertex=hold(cad.makeVertex(point));
  return edges.some(edge=>cad.measureDistanceBetween(vertex,edge)<=1e-5);
}

// First slice of surface-following grooves: snap a world polyline onto ONE
// current face, frame each station so section depth follows the local surface
// normal, then cut. This is not a planar slot, not a closed logo engrave, and
// not a multi-face or UV-geodesic projector.
export function buildProjectedGroove(source,params,cad){
  const widthMm=finitePositive(params.widthMm,'槽宽 widthMm');
  const penetrationMm=finitePositive(params.depthMm,'切深 depthMm');
  const points=params.pointsMm;
  check(Array.isArray(points)&&points.length>=2&&points.length<=64,'pointsMm 须为 2–64 个世界坐标点');
  check(points.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)),'pointsMm 的每个点必须是有限 XYZ');
  check(solidCount(source)===1,'投影刻槽需要一个封闭实体');
  const resources=[],hold=(...objects)=>{for(const object of objects)resources.push(object);return objects[0];};
  let tool=null,result=null;
  try{
    const faces=source.faces;hold(...faces);
    check(Number.isInteger(params.faceId)&&faces[params.faceId],'请选择有效曲面 faceId');
    const face=faces[params.faceId];
    const snapToleranceMm=0.1;
    const anchors=[];
    for(let i=0;i<points.length;i++){
      const snapped=projectPoint(face,cad,points[i],hold);
      check(snapped.residualMm<=snapToleranceMm,`第 ${i+1} 个路径点距所选面 ${snapped.residualMm.toFixed(3)} mm，超过 ${snapToleranceMm} mm 吸附限`);
      if(i&&dist(snapped.point,anchors.at(-1).point)<1e-6)throw new Error('投影后的相邻路径点不得重合');
      const normalVec=hold(face.normalAt(snapped.point));
      const normal=unit(typeof normalVec.toTuple==='function'?normalVec.toTuple():[normalVec.x,normalVec.y,normalVec.z]);
      if(i&&dot(normal,anchors.at(-1).normal)<0.5)throw new Error('相邻投影点的面法向变化过大，请沿路径加密点，勿一次跨过可见半周或不同面');
      anchors.push({...snapped,normal});
    }
    const boundary=boundaryEdges(face,cad,hold);
    const path=anchors.map(item=>item.point);
    const length=polylineLength(path);
    check(length>=Math.max(1e-3,widthMm*0.05),'投影路径过短，无法生成沿面刻槽');
    const count=Math.min(64,Math.max(path.length,16));
    const stations=[],projected=[];let maxResidual={value:0,index:0};
    let previousWidth=null,previousTangent=null;
    for(let i=0;i<count;i++){
      const target=length*i/(count-1);
      const seed=pointAtLength(path,target);
      const snapped=projectPoint(face,cad,seed,hold);
      if(snapped.residualMm>maxResidual.value)maxResidual={value:snapped.residualMm,index:i};
      if(onBoundary(snapped.point,boundary,cad,hold)&&snapped.residualMm>snapToleranceMm)throw new Error('路径离开所选面的内部，当前不支持跨面延续或沿边界滑移');
      const normalVec=hold(face.normalAt(snapped.point));
      const surfaceNormal=unit(typeof normalVec.toTuple==='function'?normalVec.toTuple():[normalVec.x,normalVec.y,normalVec.z]);
      projected.push({point:snapped.point,residualMm:snapped.residualMm,normal:surfaceNormal});
    }
    for(let i=0;i<projected.length;i++){
      const prev=projected[Math.max(0,i-1)].point,next=projected[Math.min(projected.length-1,i+1)].point;
      const rawTangent=next.map((v,j)=>v-prev[j]);
      check(norm(rawTangent)>=1e-8,'沿面采样后的相邻站点过近，请调整路径或减少加密');
      const surfaceNormal=projected[i].normal;
      const tangentOnFace=rawTangent.map((v,j)=>v-dot(rawTangent,surfaceNormal)*surfaceNormal[j]);
      check(norm(tangentOnFace)>=1e-8,'路径几乎沿面法向，无法在曲面上构造槽宽方向');
      const tangent=unit(previousTangent&&dot(unit(tangentOnFace),previousTangent)<0?tangentOnFace.map(v=>-v):tangentOnFace);
      let widthDirection=unit(cross(tangent,surfaceNormal));
      if(previousWidth&&dot(widthDirection,previousWidth)<0)widthDirection=widthDirection.map(v=>-v);
      stations.push({
        centerMm:projected[i].point,
        normal:tangent,
        widthDirection,
        widthMm,
        depthMm:2*penetrationMm,
        t:i/(count-1)
      });
      previousTangent=tangent;
      previousWidth=widthDirection;
    }
    tool=buildSectionCurveLoft({pathType:'sections',stations},cad);
    const before=Math.abs(cad.measureVolume(source));
    result=source.cut(tool);
    check(!result.isNull && solidCount(result)===1,'投影刻槽使实体断开或无效，请减小切深或槽宽');
    const after=Math.abs(cad.measureVolume(result));
    check(before-after>Math.max(1e-8,before*1e-12),'投影刻槽未切入材料，请检查面号、路径和切深方向');
    result.projectedGrooveReport={
      method:'surface-normal-spine',
      source:'exact-brep-face-projection',
      faceId:params.faceId,
      faceGeomType:face.geomType,
      snapToleranceMm,
      widthMm,
      penetrationMm,
      sectionDepthMm:2*penetrationMm,
      stationCount:stations.length,
      pathLengthMm:length,
      maxResampleResidualMm:maxResidual.value,
      startMm:projected[0].point,
      endMm:projected.at(-1).point,
      midMm:projected[Math.floor(projected.length/2)].point,
      midNormal:projected[Math.floor(projected.length/2)].normal,
      limits:'single-face world polyline snapped to the face; constant width and inward normal depth; not multi-face, not a UV geodesic, not a planar cutter'
    };
    const complete=result;result=null;return complete;
  }catch(error){
    throw new Error('曲面投影刻槽失败：'+(error.message||String(error)));
  }finally{
    dispose(result);dispose(tool);resources.reverse().forEach(dispose);
  }
}
