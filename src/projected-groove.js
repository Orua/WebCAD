import {measureSignedVolume} from './signed-volume.js';
import {buildProjectedPattern} from './projected-groove-pattern.js';
import {projectPointToFace as projectPoint,normalAtFace as faceNormal} from './surface-projection.js';
import {buildSectionCurveLoft} from './section-curve-loft.js';
import {assertInteriorLawPositive,sampleLaw} from './loft-spine.js';

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
const tuple = value => typeof value?.toTuple==='function'?value.toTuple():[value.x,value.y,value.z];
function solidCount(shape) {
  const solids=shape.solids;
  try{return solids.length;}finally{solids.forEach(dispose);}
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
      return {point:points[i-1].map((v,j)=>v*(1-f)+points[i][j]*f),segment:i-1};
    }
    walked+=step;
  }
  return {point:points.at(-1),segment:Math.max(0,points.length-2)};
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
function penetrationLaw(params){
  const hasLaw=params.depthLaw!==undefined,hasDepth=params.depthMm!==undefined;
  check(hasLaw||hasDepth,'请提供 depthMm 或 depthLaw；depthLaw 是沿路径的实际法向切入量，不是 curveSweep 椭圆全高');
  if(hasLaw)assertInteriorLawPositive(params.depthLaw,'depthLaw');
  else finitePositive(params.depthMm,'切深 depthMm');
  if(hasDepth&&hasLaw===false)finitePositive(params.depthMm,'切深 depthMm');
  if(hasDepth&&(typeof params.depthMm!=='number'||!Number.isFinite(params.depthMm)||params.depthMm<0))throw new Error('depthMm 必须为非负有限值');
  return t=>{
    const value=sampleLaw(params.depthLaw,t,hasDepth?params.depthMm:undefined,'depthLaw');
    if(!Number.isFinite(value)||value<0)throw new Error('depthLaw 必须为非负有限值');
    return value;
  };
}
function grooveWidthAt(params){
  const hasLaw=params.widthLaw!==undefined,hasWidth=params.widthMm!==undefined;
  check(hasLaw||hasWidth,'请提供 widthMm 或 widthLaw；widthLaw 是沿路径的完整槽宽，不是半宽，也不是 depthLaw 的切入量单位');
  if(hasLaw)assertInteriorLawPositive(params.widthLaw,'widthLaw');
  else finitePositive(params.widthMm,'槽宽 widthMm');
  if(hasWidth&&(typeof params.widthMm!=='number'||!Number.isFinite(params.widthMm)||params.widthMm<0))throw new Error('widthMm 必须为非负有限值');
  return t=>{
    const value=sampleLaw(params.widthLaw,t,hasWidth?params.widthMm:undefined,'widthLaw');
    if(!Number.isFinite(value)||value<0)throw new Error('widthLaw 必须为非负有限值');
    return value;
  };
}
function resolveFaceIds(params,faces){
  const listed=params.faceIds,hasList=listed!==undefined,hasFace=params.faceId!==undefined;
  if(!hasList&&!hasFace)return {ids:null,inferred:true};
  let ids=[];
  if(hasList){
    check(Array.isArray(listed)&&listed.length>=1&&listed.length<=8,'faceIds 须为 1–8 个当前面号');
    check(listed.every(id=>Number.isInteger(id)&&faces[id]),'faceIds 含有无效面号');
    check(new Set(listed).size===listed.length,'faceIds 不得重复');
    ids=listed.slice();
  }
  if(hasFace){
    check(Number.isInteger(params.faceId)&&faces[params.faceId],'请选择有效曲面 faceId');
    if(ids.length&&!ids.includes(params.faceId))throw new Error('faceId 必须包含在 faceIds 中');
    if(!ids.length)ids=[params.faceId];
  }
  return {ids,inferred:false};
}
function adjacency(faces,hold){
  const neighbours=faces.map(()=>new Map());
  const buckets=new Map();
  faces.forEach((face,id)=>{
    const edges=face.edges;hold(...edges);
    for(const edge of edges){
      const bucket=buckets.get(edge.hashCode)||[];
      for(const other of bucket)if(other.edge.isSame(edge)){
        const to=neighbours[id].get(other.id)||[];to.push(edge);neighbours[id].set(other.id,to);
        const back=neighbours[other.id].get(id)||[];back.push(other.edge);neighbours[other.id].set(id,back);
      }
      bucket.push({id,edge});buckets.set(edge.hashCode,bucket);
    }
  });
  return neighbours;
}
function edgePoint(edge,t,hold){
  return tuple(hold(edge.pointAt(t)));
}
function crossingOnSharedEdges(edges,from,to,hold){
  check(edges?.length,'路径点就近落到的面不相邻，不能跨面跳跃；请改给有共享边的 faceIds。就近推断不会自动寻路，也不是测地线');
  let best=null;
  const evaluate=(edge,t)=>{
    const point=edgePoint(edge,t,hold),cost=dist(from,point)+dist(point,to);
    if(!best||cost<best.cost)best={point,cost};
    return cost;
  };
  for(const edge of edges){
    const samples=32;
    const costs=Array.from({length:samples+1},(_,i)=>evaluate(edge,i/samples));
    // The coarse scan locates candidate basins; it is not the crossing itself.
    // Refine every sampled local minimum, keeping endpoints as candidates.
    for(let i=0;i<=samples;i++){
      if((i>0&&costs[i]>costs[i-1])||(i<samples&&costs[i]>costs[i+1]))continue;
      let lo=Math.max(0,i-1)/samples,hi=Math.min(samples,i+1)/samples;
      const ratio=(Math.sqrt(5)-1)/2;
      let a=hi-ratio*(hi-lo),b=lo+ratio*(hi-lo);
      let fa=evaluate(edge,a),fb=evaluate(edge,b);
      for(let step=0;step<48;step++){
        if(fa<fb){hi=b;b=a;fb=fa;a=hi-ratio*(hi-lo);fa=evaluate(edge,a);}
        else{lo=a;a=b;fa=fb;b=lo+ratio*(hi-lo);fb=evaluate(edge,b);}
      }
    }
  }
  return best.point;
}
function projectToAllowed(faces,allowed,point,cad,hold,snapToleranceMm,index,options={}){
  const tieMm=1e-5;
  const where=index!==undefined?`第 ${index+1} 个路径点`:'采样点';
  let best=null,tied=[];
  for(const id of allowed){
    const snapped=projectPoint(faces[id],cad,point,hold);
    if(snapped.residualMm>snapToleranceMm)continue;
    if(!best||snapped.residualMm<best.residualMm-tieMm){
      best={...snapped,faceId:id};
      tied=[best];
    }else if(Math.abs(snapped.residualMm-best.residualMm)<=tieMm){
      const item={...snapped,faceId:id};
      tied.push(item);
      if(snapped.residualMm<best.residualMm)best=item;
    }else if(!best||snapped.residualMm<best.residualMm){
      best={...snapped,faceId:id};
    }
  }
  if(options.inferTies&&tied.length>1){
    const prefer=options.preferFaceId;
    const kept=prefer!==undefined?tied.find(item=>item.faceId===prefer):undefined;
    if(!kept)throw new Error(`${where}同时靠近多张面，无法就近唯一确定面号；请改给 faceId 或 faceIds`);
    best=kept;
  }
  check(best&&best.residualMm<=snapToleranceMm,`${where}距目标曲面 ${best?best.residualMm.toFixed(3):'∞'} mm，超过 ${snapToleranceMm} mm 吸附限`);
  return best;
}

// Project a world polyline onto one face, or onto an explicit chain of
// topologically adjacent faces, and cut a groove whose section depth follows
// each local surface normal. If faceId and faceIds are omitted, each point
// snaps to the nearest current face (0.1 mm) and the inferred chain must
// still share edges; this is not a UV geodesic and does not search a route.
// A face change is inserted at the shared-edge point that minimizes the 3D
// polyline length. Optional widthLaw varies the full groove width. Optional
// depthLaw varies actual inward penetration.
function buildGroove(source,params,cad,{collectOnly=false}={}){
  const widthAt=grooveWidthAt(params);
  const penetrationAt=penetrationLaw(params);
  const points=params.pointsMm;
  check(Array.isArray(points)&&points.length>=2&&points.length<=64,'pointsMm 须为 2–64 个世界坐标点');
  check(points.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)),'pointsMm 的每个点必须是有限 XYZ');
  check(solidCount(source)===1,'投影刻槽需要一个封闭实体');
  const resources=[],hold=(...objects)=>{for(const object of objects)resources.push(object);return objects[0];};
  let tool=null,result=null,phase='faces';const toolPieces=[];
  try{
    const faces=source.faces;hold(...faces);
    const resolved=resolveFaceIds(params,faces);
    const inferred=resolved.inferred;
    phase='adjacency';const neighbours=adjacency(faces,hold);
    const snapToleranceMm=0.1;
    const pool=resolved.ids||faces.map((_,id)=>id);
    const anchors=[];
    for(let i=0;i<points.length;i++){
      phase='anchor-'+i;const snapped=projectToAllowed(faces,pool,points[i],cad,hold,snapToleranceMm,i,{inferTies:inferred,preferFaceId:anchors.at(-1)?.faceId});
      if(i&&dist(snapped.point,anchors.at(-1).point)<1e-6)throw new Error('投影后的相邻路径点不得重合');
      const normal=faceNormal(faces[snapped.faceId],snapped.point,hold,snapped.uv,cad);
      if(i&&snapped.faceId===anchors.at(-1).faceId&&dot(normal,anchors.at(-1).normal)<0.5)throw new Error('相邻投影点的面法向变化过大，请沿路径加密点，勿一次跨过可见半周或不同面');
      anchors.push({...snapped,normal});
    }
    const allowed=resolved.ids||[...new Set(anchors.map(item=>item.faceId))];
    if(inferred)check(allowed.length<=8,'就近推断得到的面超过 8 张，请改用 faceIds 明确列出路径经过的面');
    const refined=[];
    const crossings=[];
    for(let i=0;i<anchors.length;i++){
      if(i&&anchors[i].faceId!==anchors[i-1].faceId){
        const shared=neighbours[anchors[i-1].faceId].get(anchors[i].faceId);
        const crossing=crossingOnSharedEdges(shared,anchors[i-1].point,anchors[i].point,hold);
        if(!refined.length||dist(refined.at(-1).point,crossing)>1e-6){
          const arriving=faceNormal(faces[anchors[i-1].faceId],crossing,hold);
          refined.push({point:crossing,faceId:anchors[i-1].faceId,normal:arriving,kind:'crossing'});
        }
        crossings.push({point:crossing,fromFaceId:anchors[i-1].faceId,toFaceId:anchors[i].faceId});
      }
      if(!refined.length||dist(refined.at(-1).point,anchors[i].point)>1e-6)refined.push({...anchors[i],kind:'anchor'});
    }
    const path=refined.map(item=>item.point);
    const length=polylineLength(path);
    const spanWidth=Math.max(0,...[0,0.25,0.5,0.75,1].map(widthAt).filter(value=>value>0));
    check(length>=Math.max(1e-3,spanWidth*0.05),'投影路径过短，无法生成沿面刻槽');
    const runs=[];
    let run=[refined[0]];
    for(const item of refined.slice(1)){
      if(item.faceId!==run.at(-1).faceId){
        runs.push(run);
        run=[{...run.at(-1),faceId:item.faceId,kind:'crossing',normal:faceNormal(faces[item.faceId],run.at(-1).point,hold)},item];
      }else run.push(item);
    }
    runs.push(run);
    check(runs.every(row=>row.length>=2),'跨面路径在某一面上的段落过短，请在共享边两侧都给出点');
    const runStarts=[];
    let walked=0;
    for(const row of runs){
      runStarts.push(walked);
      walked+=polylineLength(row.map(item=>item.point));
    }
    let work=null;
    const allProjected=[],allStations=[];
    const tipCaps={};let maxResidual={value:0,index:0};
    try{
      for(let r=0;r<runs.length;r++){
        const row=runs[r],runPath=row.map(item=>item.point),runLength=polylineLength(runPath);
        const count=Math.min(64,Math.max(runPath.length,8));
        const projected=[];
        let previousWidth=null,previousTangent=null;
        const stations=[];
        for(let i=0;i<count;i++){
          const local=runLength*i/(count-1);
          const seed=pointAtLength(runPath,local);
          phase='resample-'+i;const snapped=projectPoint(faces[row[0].faceId],cad,seed.point,hold);
          if(snapped.residualMm>maxResidual.value)maxResidual={value:snapped.residualMm,index:allProjected.length};
          const single=allowed.length===1;
          phase='resample-boundary-'+i;
          if(onBoundary(snapped.point,boundaryEdges(faces[row[0].faceId],cad,hold),cad,hold)&&snapped.residualMm>snapToleranceMm){
            throw new Error(single?'路径离开所选面的内部，当前不支持跨面延续或沿边界滑移':'路径离开所列曲面的内部；跨面只能经过共享边，不能沿开放边界滑出');
          }
          phase='resample-normal-'+i;const surfaceNormal=faceNormal(faces[row[0].faceId],snapped.point,hold,snapped.uv,cad);
          if(!projected.length||dist(projected.at(-1).point,snapped.point)>1e-6)projected.push({point:snapped.point,residualMm:snapped.residualMm,normal:surfaceNormal,faceId:row[0].faceId,t:(runStarts[r]+local)/length});
        }
        for(let i=0;i<projected.length;i++){
          const t=projected[i].t;
          const prev=projected[Math.max(0,i-1)].point,next=projected[Math.min(projected.length-1,i+1)].point;
          const rawTangent=next.map((v,j)=>v-prev[j]);
          check(norm(rawTangent)>=1e-8,'沿面采样后的相邻站点过近，请调整路径或减少加密');
          const surfaceNormal=projected[i].normal;
          const tangentOnFace=rawTangent.map((v,j)=>v-dot(rawTangent,surfaceNormal)*surfaceNormal[j]);
          check(norm(tangentOnFace)>=1e-8,'路径几乎沿面法向，无法在曲面上构造槽宽方向');
          const tangent=unit(previousTangent&&dot(unit(tangentOnFace),previousTangent)<0?tangentOnFace.map(v=>-v):tangentOnFace);
          let widthDirection=unit(cross(tangent,surfaceNormal));
          if(previousWidth&&dot(widthDirection,previousWidth)<0)widthDirection=widthDirection.map(v=>-v);
          if(i&&dot(surfaceNormal,projected[i-1].normal)<0.5)throw new Error('相邻投影点的面法向变化过大，请沿路径加密点，勿一次跨过可见半周或不同面');
          const widthMm=widthAt(t);
          const penetrationMm=penetrationAt(t);
          const atTip=t===0||t===1;
          if(widthMm===0||penetrationMm===0){
            if(!atTip){
              const name=widthMm===0?'widthLaw':'depthLaw';
              throw new Error(`${name} 在路径内部必须始终为正；只有路径端点可以为 0，此时以该路径点做点收尾，不能在中途把截面收到 0`);
            }
            const side=t===0?'start':'end';
            tipCaps[`${side}Cap`]={kind:'point',pointMm:projected[i].point};
          }else{
            if(!(widthMm>0))throw new Error('widthLaw 必须为非负有限值');
            if(!(penetrationMm>0))throw new Error('depthLaw 必须为非负有限值');
            stations.push({centerMm:projected[i].point,normal:tangent,widthDirection,widthMm,depthMm:2*penetrationMm,t,penetrationMm});
          }
          previousTangent=tangent;
          previousWidth=widthDirection;
        }
        if(stations.length<2)throw new Error('零深度端点之外至少还需要两个正截面，才能生成点收尾的刀具');
        const caps={};
        if(r===0&&tipCaps.startCap)caps.startCap=tipCaps.startCap;
        if(r===runs.length-1&&tipCaps.endCap)caps.endCap=tipCaps.endCap;
        phase='loft';const piece=buildSectionCurveLoft({pathType:'sections',stations,...caps,...(collectOnly?{loftDegree:2}:{})},cad);
        if(collectOnly){toolPieces.push(piece);allProjected.push(...projected);allStations.push(...stations);continue;}
        const target=work||source;
        const before=measureSignedVolume(target,cad).volumeMm3;check(Number.isFinite(before)&&before>0,'源实体必须有正的有向体积，不能用绝对值掩盖方向错误');
        let next=null;
        try{
          next=target.cut(piece);
          check(!next.isNull && solidCount(next)===1,'投影刻槽使实体断开或无效，请减小切深或槽宽');
          const after=measureSignedVolume(next,cad).volumeMm3;check(Number.isFinite(after)&&after>0,'刻槽结果必须有正的有向体积');
          check(before-after>Math.max(1e-8,before*1e-12),'投影刻槽未切入材料，请检查面号、路径和切深方向');
        }catch(error){dispose(next);throw error;}finally{dispose(piece);}
        if(work)dispose(work);
        work=next;
        allProjected.push(...projected);
        allStations.push(...stations);
      }
      if(collectOnly){if(toolPieces.length===1)result=toolPieces.pop();else{result=cad.makeCompound(toolPieces);toolPieces.forEach(dispose);toolPieces.length=0;}}else{result=work;work=null;}
    }finally{dispose(work);}
    const projected=allProjected,stations=allStations;

    const startWidthMm=widthAt(0),endWidthMm=widthAt(1),midWidthMm=widthAt(0.5);
    const startPenetrationMm=penetrationAt(0),endPenetrationMm=penetrationAt(1),midPenetrationMm=penetrationAt(0.5);
    const variableWidth=params.widthLaw!==undefined&&!(typeof params.widthLaw==='number');
    const variableDepth=params.depthLaw!==undefined&&!(typeof params.depthLaw==='number');
    const usedIds=[...new Set(projected.map(item=>item.faceId))];
    result.projectedGrooveReport={
      method:'surface-normal-spine',
      source:'exact-brep-face-projection',
      ...(collectOnly?{samples:allProjected.map(q=>({point:q.point,normal:q.normal,faceId:q.faceId}))}:{}),
      faceId:allowed.length===1?allowed[0]:usedIds[0],
      faceIds:usedIds,
      faceIdsInferred:inferred,
      faceGeomType:faces[usedIds[0]].geomType,
      faceGeomTypes:usedIds.map(id=>faces[id].geomType),
      crossingCount:crossings.length,
      crossings:crossings.map(item=>({point:item.point,fromFaceId:item.fromFaceId,toFaceId:item.toFaceId})),
      crossingMethod:crossings.length?'shared-edge-shortest-polyline':undefined,
      crossingSearch:crossings.length?{method:'sampled-basin-golden-section',scanIntervals:32,refinementIterations:48,globalMinimumGuaranteed:false}:undefined,
      snapToleranceMm,
      widthMm:variableWidth||startWidthMm!==endWidthMm?undefined:startWidthMm,
      variableWidth:!!variableWidth||startWidthMm!==endWidthMm,
      startWidthMm,
      endWidthMm,
      midWidthMm,
      variableDepth:!!variableDepth||startPenetrationMm!==endPenetrationMm,
      penetrationMm:variableDepth||startPenetrationMm!==endPenetrationMm?undefined:startPenetrationMm,
      startPenetrationMm,
      endPenetrationMm,
      midPenetrationMm,
      sectionDepthMm:variableDepth||startPenetrationMm!==endPenetrationMm?undefined:2*startPenetrationMm,
      stationCount:stations.length,
      pathLengthMm:length,
      maxResampleResidualMm:maxResidual.value,
      startMm:projected[0].point,
      endMm:projected.at(-1).point,
      midMm:projected[Math.floor(projected.length/2)].point,
      midNormal:projected[Math.floor(projected.length/2)].normal,
      zeroEndWidth:{start:startWidthMm===0,end:endWidthMm===0},
      zeroEndDepth:{start:startPenetrationMm===0,end:endPenetrationMm===0},
      tipPoints:{start:tipCaps.startCap?.pointMm??null,end:tipCaps.endCap?.pointMm??null},
      limits:'world polyline snapped to one face, an explicit adjacent face chain, or an inferred adjacent chain from nearest-face snap when face ids are omitted; crossings are shared-edge shortest 3D polylines, not UV geodesics; omitting face ids does not search a route; widthLaw is full groove width, not half-width; depthLaw is actual inward normal penetration, not curveSweep full-section height; mid-path zeros of either law are rejected; not a planar cutter'
    };
    const complete=result;result=null;return complete;
  }catch(error){
    throw Object.assign(new Error('曲面投影刻槽失败：'+(error.message||String(error)),{cause:error}),{code:error.code||'GEOMETRY_INVALID',report:{phase,native:error.report}});
  }finally{
    toolPieces.forEach(dispose);dispose(result);dispose(tool);resources.reverse().forEach(dispose);
  }
}

export function buildProjectedGroove(source,params,cad){
 if(params.pattern!==undefined)return buildProjectedPattern(source,params,cad,p=>buildGroove(source,p,cad,{collectOnly:true}));
 return buildGroove(source,params,cad);
}
