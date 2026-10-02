// Constructive nonconstant contact blend over a closed planar extrusion rim.
// It uses the caller's current OC instance and does not alter the source shape.
import * as defaultCad from 'replicad';
import { topologyDetails } from './topology.js';
import { validateRoundingResult } from './validation.js';
import { sewFaces } from '../../surface-repair.js';

const dispose=x=>{try{x?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,k)=>a.map(v=>v*k);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
const unit=a=>{const n=norm(a);if(n<1e-12)throw new Error('Undefined rim tangent');return mul(a,1/n);};
const native=x=>[x.X(),x.Y(),x.Z()];
const tuple=x=>{try{return x.toTuple();}finally{dispose(x);}};
const requireThat=(ok,message,code='ADAPTIVE_FAMILY_UNMATCHED',report)=>{if(!ok)throw Object.assign(new Error(message),{code,recoveryAction:'CORRECT_PARAMETERS',...(report?{report}: {})});};
const angle=(a,b,unoriented=false)=>Math.acos(Math.min(1,Math.max(-1,(unoriented?Math.abs(dot(a,b)):dot(a,b))/(norm(a)*norm(b)))))*180/Math.PI;

function orderedRim(edges,rows,tolerance) {
  const remaining=[...rows],result=[];
  const first=remaining.shift();result.push({row:first,reversed:false});
  let endpoint=first.endPoint;
  while(remaining.length) {
    const matches=[];
    remaining.forEach((row,index)=>{
      if(norm(sub(row.startPoint,endpoint))<=tolerance)matches.push({index,row,reversed:false});
      else if(norm(sub(row.endPoint,endpoint))<=tolerance)matches.push({index,row,reversed:true});
    });
    requireThat(matches.length===1,'Selected rim is branched, disconnected, or ambiguously segmented');
    const next=matches[0];remaining.splice(next.index,1);result.push(next);
    endpoint=next.reversed?next.row.startPoint:next.row.endPoint;
  }
  requireThat(norm(sub(endpoint,first.startPoint))<=tolerance,'The adaptive extrusion rim must be closed');
  return result.map(item=>({...item,edge:edges[item.row.edgeId]}));
}

function edgeEvaluator(edge,reversed,cad,held) {
  const oc=cad.getOC(),adaptor=new oc.BRepAdaptor_Curve(edge.wrapped);held.push(adaptor);
  const first=adaptor.FirstParameter(),last=adaptor.LastParameter(),span=last-first;
  requireThat(Number.isFinite(span)&&span>0,'Rim curve has no finite parameter interval');
  return t=>{
    const p=new oc.gp_Pnt(),v1=new oc.gp_Vec(),v2=new oc.gp_Vec(),v3=new oc.gp_Vec();
    try {
      const direction=reversed?-1:1;
      adaptor.D3(first+(reversed?1-t:t)*span,p,v1,v2,v3);
      return {c:native(p),d1:mul(native(v1),span*direction),d2:mul(native(v2),span*span),d3:mul(native(v3),span**3*direction)};
    } finally {[p,v1,v2,v3].forEach(dispose);}
  };
}

function localWidth(d1,d2,d3,axis,inwardSign,options) {
  const speed=norm(d1),turn=dot(cross(d1,d2),axis)*inwardSign;
  const curvature=turn/speed**3;
  const curvatureDerivative=inwardSign*dot(cross(d1,d3),axis)/speed**3-3*turn*dot(d1,d2)/speed**5;
  requireThat(Number.isFinite(curvature)&&Number.isFinite(curvatureDerivative),'Source curvature derivative cannot be measured');
  if(Number.isFinite(options.globalReachWidthMm)) {
    const width=options.globalReachWidthMm;
    requireThat(width>=options.minimumWidthFraction*options.sizeMm&&width<=options.sizeMm,'Global reach width violates the declared finite scale','GEOMETRY_CONFLICT');
    return {width,widthDerivative:0,curvature};
  }
  const q=options.sizeMm*Math.max(curvature,0)/options.curvatureLimitFactor;
  const power=8,base=1+q**power;
  const width=options.sizeMm/base**(1/power);
  const widthDerivative=curvature>0?-options.sizeMm*q**(power-1)*(options.sizeMm/options.curvatureLimitFactor)*curvatureDerivative*base**(-1/power-1):0;
  requireThat(Number.isFinite(width)&&Number.isFinite(widthDerivative)&&width>=options.minimumWidthFraction*options.sizeMm,
    'Available local curvature requires a scale below the declared minimum','GEOMETRY_CONFLICT',
    {requestedSizeMm:options.sizeMm,actualWidthMm:width,minimumWidthFraction:options.minimumWidthFraction,curvaturePerMm:curvature});
  return {width,widthDerivative,curvature};
}

function rimField(evaluate,t,axis,inwardSign,options) {
  const {c,d1,d2,d3}=evaluate(t),speed=norm(d1),tangent=unit(d1);
  const tangentDerivative=mul(sub(d2,mul(tangent,dot(tangent,d2))),1/speed);
  const inward=mul(cross(axis,tangent),inwardSign),inwardDerivative=mul(cross(axis,tangentDerivative),inwardSign);
  const {width,widthDerivative}=localWidth(d1,d2,d3,axis,inwardSign,options);
  const side=sub(c,mul(axis,width)),inner=add(c,mul(inward,width));
  const controls=[side,sub(c,mul(axis,width/3)),add(c,mul(inward,2*width/3)),inner];
  const offsetDerivative=add(mul(inwardDerivative,width),mul(inward,widthDerivative));
  const derivatives=[sub(d1,mul(axis,widthDerivative)),sub(d1,mul(axis,widthDerivative/3)),add(d1,mul(offsetDerivative,2/3)),add(d1,offsetDerivative)];
  return {c,d1,inward,inwardDerivative,controls,derivatives,width,widthDerivative,
    signedCurvature:inwardSign*dot(cross(d1,d2),axis)/(speed**3)};
}

const bezier=(controls,t)=>{
  let list=controls.map(p=>[...p]);
  while(list.length>1)list=list.slice(0,-1).map((p,i)=>add(mul(p,1-t),mul(list[i+1],t)));
  return list[0];
};
const derivative=(controls,t,span)=>bezier(controls.slice(0,-1).map((p,i)=>mul(sub(controls[i+1],p),3/span)),t);

function segmentControls(evaluate,a,b,axis,inwardSign,options) {
  const first=rimField(evaluate,a,axis,inwardSign,options),last=rimField(evaluate,b,axis,inwardSign,options),span=b-a;
  const columns=first.controls.map((p,v)=>[p,add(p,mul(first.derivatives[v],span/3)),sub(last.controls[v],mul(last.derivatives[v],span/3)),last.controls[v]]);
  const outer=[first.c,add(first.c,mul(first.d1,span/3)),sub(last.c,mul(last.d1,span/3)),last.c];
  return {columns,outer};
}

function sampledSegmentError(evaluate,a,b,geometry,axis,inwardSign,options) {
  let maxControlErrorMm=0,maxSourceRimErrorMm=0,maxSideContactErrorMm=0,maxWallTangentErrorDeg=0,maxTopTangentErrorDeg=0;
  for(let i=0;i<=16;i++) {
    const q=i/16,t=a+(b-a)*q,exact=rimField(evaluate,t,axis,inwardSign,options);
    const fitted=geometry.columns.map(c=>bezier(c,q));
    fitted.forEach((p,j)=>{maxControlErrorMm=Math.max(maxControlErrorMm,norm(sub(p,exact.controls[j])));});
    maxSourceRimErrorMm=Math.max(maxSourceRimErrorMm,norm(sub(bezier(geometry.outer,q),exact.c)));
    maxSideContactErrorMm=Math.max(maxSideContactErrorMm,norm(sub(fitted[0],exact.controls[0])));
    const sideDu=derivative(geometry.columns[0],q,b-a),sideDv=mul(sub(fitted[1],fitted[0]),3);
    const topDu=derivative(geometry.columns[3],q,b-a),topDv=mul(sub(fitted[3],fitted[2]),3);
    maxWallTangentErrorDeg=Math.max(maxWallTangentErrorDeg,angle(cross(sideDu,sideDv),cross(exact.d1,axis),true));
    maxTopTangentErrorDeg=Math.max(maxTopTangentErrorDeg,angle(cross(topDu,topDv),axis,true));
  }
  return {maxControlErrorMm,maxSourceRimErrorMm,maxSideContactErrorMm,maxWallTangentErrorDeg,maxTopTangentErrorDeg};
}

function polygonSelfCrosses(points,axis,origin,tangent) {
  const x=unit(tangent),y=unit(cross(axis,x));
  const p=points.map(q=>{const r=sub(q,origin);return [dot(r,x),dot(r,y)];});
  const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let i=0;i<p.length-1;i++)for(let j=i+2;j<p.length-1;j++) {
    if(i===0&&j===p.length-2)continue;
    const a=p[i],b=p[i+1],c=p[j],d=p[j+1];
    if(orient(a,b,c)*orient(a,b,d)<-1e-18&&orient(c,d,a)*orient(c,d,b)<-1e-18)return true;
  }
  return false;
}

function joinedCubicNet(pieces) {
  requireThat(pieces.length>0,'Cannot assemble an empty rim surface','GEOMETRY_INVALID');
  const columnCount=pieces[0].columns.length;
  requireThat(columnCount>=2&&columnCount<=4,'Unsupported transverse surface degree','GEOMETRY_INVALID');
  let maxPositionGapMm=0,maxDerivativeGapMmPerU=0,maxRelativeDerivativeGap=0;
  const columns=Array.from({length:columnCount},(_,v)=>pieces[0].columns[v].map(p=>[...p]));
  const knots=[pieces[0].a,pieces[0].b];
  pieces.forEach((piece,index)=>{
    requireThat(Number.isFinite(piece.a)&&Number.isFinite(piece.b)&&piece.b>piece.a&&piece.columns.length===columnCount&&
      piece.columns.every(column=>column.length===4&&column.every(point=>point.length===3&&point.every(Number.isFinite))),
    'A surface segment has invalid cubic poles or parameters','GEOMETRY_INVALID');
    if(index===0)return;
    const previous=pieces[index-1];
    requireThat(Math.abs(previous.b-piece.a)<=1e-14,'Surface segments do not share the original curve parameter','GEOMETRY_INVALID');
    for(let v=0;v<columnCount;v++) {
      const left=previous.columns[v],right=piece.columns[v];
      const positionGap=norm(sub(left[3],right[0]));
      const leftDerivative=mul(sub(left[3],left[2]),3/(previous.b-previous.a));
      const rightDerivative=mul(sub(right[1],right[0]),3/(piece.b-piece.a));
      const derivativeGap=norm(sub(leftDerivative,rightDerivative)),derivativeScale=Math.max(1,norm(leftDerivative),norm(rightDerivative));
      maxPositionGapMm=Math.max(maxPositionGapMm,positionGap);
      maxDerivativeGapMmPerU=Math.max(maxDerivativeGapMmPerU,derivativeGap);
      maxRelativeDerivativeGap=Math.max(maxRelativeDerivativeGap,derivativeGap/derivativeScale);
      requireThat(positionGap<=1e-12&&derivativeGap/derivativeScale<=1e-10,
        'Cubic rim segments do not have matching position and parameter derivative','GEOMETRY_INVALID',
        {segmentIndex:index,column:v,positionGapMm:positionGap,derivativeGapMmPerU:derivativeGap,relativeDerivativeGap:derivativeGap/derivativeScale});
      columns[v].push(...right.slice(1).map(p=>[...p]));
    }
    knots.push(piece.b);
  });
  return {columns,knots,maxPositionGapMm,maxDerivativeGapMmPerU,maxRelativeDerivativeGap};
}

// Keep approximation intervals as knots, rather than making every interval a
// separate topological face. Native knot removal confirms the measured C1
// joins without changing the piecewise cubic geometry beyond 1e-12 mm.
function surfaceFace(pieces,cad,held,assembly) {
  const net=joinedCubicNet(pieces),oc=cad.getOC(),columnCount=net.columns.length,degreeV=columnCount-1;
  const poleCount=net.columns[0].length,knotCount=net.knots.length;
  const poles=new oc.NCollection_Array2_gp_Pnt(1,poleCount,1,columnCount),uk=new oc.NCollection_Array1_double(1,knotCount),um=new oc.NCollection_Array1_int(1,knotCount),vk=new oc.NCollection_Array1_double(1,2),vm=new oc.NCollection_Array1_int(1,2);
  let surface,maker;
  try {
    net.columns.forEach((column,v)=>column.forEach((point,u)=>{const p=new oc.gp_Pnt(...point);try{poles.SetValue(u+1,v+1,p);}finally{dispose(p);}}));
    net.knots.forEach((knot,index)=>{uk.SetValue(index+1,knot);um.SetValue(index+1,index===0||index===knotCount-1?4:3);});
    vk.SetValue(1,0);vk.SetValue(2,1);vm.SetValue(1,degreeV+1);vm.SetValue(2,degreeV+1);
    surface=new oc.Geom_BSplineSurface(poles,uk,vk,um,vm,3,degreeV,false,false);
    // Reducing multiplicity to two keeps every knot and its parameter. Work
    // backwards and require every exact reduction; there is no smoothing retry.
    for(let index=knotCount-1;index>=2;index--) {
      requireThat(surface.RemoveUKnot(index,2,1e-12),'A measured C1 cubic join cannot be represented by exact knot removal','GEOMETRY_INVALID',
        {sourceEdgeId:assembly.sourceEdgeId,role:assembly.role,knotIndex:index,knot:net.knots[index-1],knotRemovalToleranceMm:1e-12});
    }
    requireThat(surface.IsCNu(1),'The assembled rim surface is not parametrically C1','GEOMETRY_INVALID');
    let maxReadbackDeviationMm=0;
    for(const piece of pieces)for(let i=0;i<=16;i++) {
      const q=i/16,u=piece.a+(piece.b-piece.a)*q;
      const fittedColumns=piece.columns.map(column=>bezier(column,q));
      for(const v of [0,.25,.5,.75,1]) {
        const actual=surface.Value(u,v);
        try {maxReadbackDeviationMm=Math.max(maxReadbackDeviationMm,norm(sub(native(actual),bezier(fittedColumns,v))));}
        finally {dispose(actual);}
      }
    }
    requireThat(maxReadbackDeviationMm<=1e-11,'Native C1 assembly changed the fitted contact geometry','GEOMETRY_INVALID',
      {sourceEdgeId:assembly.sourceEdgeId,role:assembly.role,maxReadbackDeviationMm,maximumReadbackDeviationMm:1e-11});
    Object.assign(assembly,{segmentCount:pieces.length,poleCountBefore:poleCount,poleCountAfter:surface.NbUPoles(),internalKnotCount:knotCount-2,
      maxPositionGapMm:net.maxPositionGapMm,maxDerivativeGapMmPerU:net.maxDerivativeGapMmPerU,maxRelativeDerivativeGap:net.maxRelativeDerivativeGap,
      knotRemovalToleranceMm:1e-12,maxReadbackDeviationMm,parametricContinuity:'C1'});
    const uRange=[net.knots[0],net.knots[knotCount-1]];
    maker=new oc.BRepBuilderAPI_MakeFace(surface,uRange[0],uRange[1],0,1,1e-7);
    requireThat(maker.IsDone(),'Explicit planar rim surface construction failed','GEOMETRY_INVALID');
    const face=cad.cast(maker.Face());held.push(face);return face;
  } finally {[maker,surface,poles,uk,um,vk,vm].forEach(dispose);}
}

function verifyContactRange(part,axis,inwardSign,options,topFace,wallFace,cad,report) {
  for(const t of [0,.125,.25,.5,.75,.875,1]) {
    const f=rimField(part.evaluate,t,axis,inwardSign,options);
    const topPoint=cad.makeVertex(f.controls[3]),sidePoint=cad.makeVertex(f.controls[0]);
    try {
      const topDistance=cad.measureDistanceBetween(topFace,topPoint),wallDistance=cad.measureDistanceBetween(wallFace,sidePoint);
      report.maxExactContactToSourceFaceDistanceMm=Math.max(report.maxExactContactToSourceFaceDistanceMm,topDistance,wallDistance);
      requireThat(topDistance<=1e-6&&wallDistance<=1e-6,'Requested contact rails leave their trimmed source support faces','GEOMETRY_CONFLICT');
      const wallNormal=tuple(wallFace.normalAt(f.controls[0]));
      requireThat(Math.abs(dot(unit(wallNormal),axis))<1e-6,'Source wall is not an extrusion perpendicular to the source plane');
      requireThat(angle(wallNormal,cross(f.d1,axis),true)<.02,'Actual wall normals do not match the detected extrusion family');
    } finally {[topPoint,sidePoint].forEach(dispose);}
  }
}

/**
 * Build a closed ring cutter from a complete smooth outer planar rim.
 * Returns an actual valid oriented solid, without cutting or mutating source.
 * Actual result seams and locality must still be independently measured.
 */
export function createPlanarRimHermiteTool(shape,input,cad=defaultCad) {
  // Contact with an extrusion wall is tangential. A small normal error in the
  // fitted source curve can move a Boolean intersection by much more than the
  // fit error, so fit the source and side-contact curves to 1e-9 mm. The inner
  // rail stays exactly in its planar support and its field uses 1e-7 mm; a
  // nonpolynomial inward normal must not force needless source subdivisions.
  // Independent final BRep contact and tangent measurements remain mandatory.
  const options={minimumWidthFraction:.35,curvatureLimitFactor:.65,contactToleranceMm:1e-9,fieldToleranceMm:1e-7,tangentToleranceDeg:.02,sewingToleranceMm:1e-6,maxSegments:1024,...input};
  requireThat(Array.isArray(options.edgeIds)&&options.edgeIds.length>0&&options.edgeIds.every(Number.isInteger),'Explicit nonempty edgeIds are required','PARAM_SCHEMA_INVALID');
  requireThat(Number.isFinite(options.sizeMm)&&options.sizeMm>0,'sizeMm must be finite and positive','PARAM_SCHEMA_INVALID');
  requireThat(options.minimumWidthFraction>=.25&&options.minimumWidthFraction<=1,'Minimum scale fraction must stay in [.25,1]','PARAM_SCHEMA_INVALID');
  requireThat(options.curvatureLimitFactor>0&&options.curvatureLimitFactor<.9,'Curvature limit factor must stay in (0,.9)','PARAM_SCHEMA_INVALID');
  requireThat(Number.isFinite(options.contactToleranceMm)&&options.contactToleranceMm>0&&options.contactToleranceMm<=1e-6,'Construction position tolerance must be in (0,1e-6] mm','PARAM_SCHEMA_INVALID');
  requireThat(Number.isFinite(options.fieldToleranceMm)&&options.fieldToleranceMm>=options.contactToleranceMm&&options.fieldToleranceMm<=1e-7,
    'Inner control-field tolerance must be between contactToleranceMm and 1e-7 mm','PARAM_SCHEMA_INVALID');
  requireThat(Number.isFinite(options.tangentToleranceDeg)&&options.tangentToleranceDeg>0&&options.tangentToleranceDeg<=.02,'Construction tangent tolerance must be in (0,.02] degrees','PARAM_SCHEMA_INVALID');
  requireThat(Number.isFinite(options.sewingToleranceMm)&&options.sewingToleranceMm>0&&options.sewingToleranceMm<=1e-6,'Sewing tolerance must be in (0,1e-6] mm','PARAM_SCHEMA_INVALID');
  requireThat(Number.isInteger(options.maxSegments)&&options.maxSegments>0&&options.maxSegments<=1024,'maxSegments must be bounded by 1..1024','PARAM_SCHEMA_INVALID');
  const edges=shape.edges,faces=shape.faces,held=[];let tool;
  try {
    const rows=topologyDetails(shape),selected=[...new Set(options.edgeIds)].map(id=>rows[id]);
    requireThat(selected.every(Boolean),'A source edge identifier is unavailable','TOPOLOGY_REFERENCE_STALE');
    requireThat(selected.every(r=>r.adjacentFaceIds.length===2&&!r.degenerate&&!r.periodicSeam),'Rim edges must have two distinct source supports');
    const candidates=selected[0].adjacentFaceIds.filter(id=>faces[id].geomType==='PLANE'&&selected.every(row=>row.adjacentFaceIds.includes(id)));
    const topId=options.topFaceId===undefined?(candidates.length===1?candidates[0]:null):options.topFaceId;
    requireThat(Number.isInteger(topId)&&candidates.includes(topId),'The selected rim has no unique common planar support');
    // Replicad's wire extraction consumes its Face wrapper. Keep the borrowed
    // source support alive for normals and contact-distance checks.
    const topFace=faces[topId],holes=topFace.clone().innerWires(),outer=topFace.clone().outerWire();held.push(outer,...holes);
    requireThat(holes.length===0,'Adaptive rim family currently requires a planar support without holes');
    const outerEdges=outer.edges;held.push(...outerEdges);
    requireThat(outerEdges.length===selected.length&&outerEdges.every(edge=>selected.some(row=>edge.isSame(edges[row.edgeId]))),'Adaptive rim family requires the complete outer wire of its planar support');
    const ordered=orderedRim(edges,selected,1e-5),axis=unit(tuple(topFace.normalAt(ordered[0].row.midpoint)));
    const parts=ordered.map(part=>{
      const wallFaceId=part.row.adjacentFaceIds.find(id=>id!==topId),wall=faces[wallFaceId];
      requireThat(['CYLINDRE','EXTRUSION_SURFACE','PLANE'].includes(wall.geomType),'Unsupported nonextrusion rim wall');
      return {...part,wallFaceId,evaluate:edgeEvaluator(part.edge,part.reversed,cad,held)};
    });
    let areaVector=[0,0,0];const coarse=[];
    parts.forEach(part=>{for(let i=0;i<32;i++)coarse.push(part.evaluate(i/32).c);});coarse.push(coarse[0]);
    coarse.slice(0,-1).forEach((p,i)=>{areaVector=add(areaVector,cross(p,coarse[i+1]));});
    const inwardSign=Math.sign(dot(areaVector,axis));requireThat(inwardSign!==0,'Rim winding has no stable planar area');
    const origin=parts[0].evaluate(0).c;
    let maxJointAngleDeg=0,maxPositiveCurvaturePerMm=0,maxJointWidthGapMm=0,maxJointWidthDerivativeGap=0;
    const plannedWidthSamples=[];
    parts.forEach((part,index)=>{
      const final=part.evaluate(1),next=parts[(index+1)%parts.length].evaluate(0);
      maxJointAngleDeg=Math.max(maxJointAngleDeg,angle(final.d1,next.d1));
      const wf=localWidth(final.d1,final.d2,final.d3,axis,inwardSign,options),wn=localWidth(next.d1,next.d2,next.d3,axis,inwardSign,options);
      maxJointWidthGapMm=Math.max(maxJointWidthGapMm,Math.abs(wf.width-wn.width));
      maxJointWidthDerivativeGap=Math.max(maxJointWidthDerivativeGap,Math.abs(wf.widthDerivative/norm(final.d1)-wn.widthDerivative/norm(next.d1)));
      for(let i=0;i<=256;i++) {
        const t=i/256,p=part.evaluate(t);requireThat(Math.abs(dot(sub(p.c,origin),axis))<=1e-6,'Selected rim is not planar');
        const measured=localWidth(p.d1,p.d2,p.d3,axis,inwardSign,options);
        maxPositiveCurvaturePerMm=Math.max(maxPositiveCurvaturePerMm,measured.curvature);
        plannedWidthSamples.push({sourceEdgeId:part.row.edgeId,t,widthMm:measured.width});
      }
    });
    requireThat(maxJointAngleDeg<=options.tangentToleranceDeg,'Selected rim contains a corner; a corner patch is required');
    const localWidthJunctionMismatch=maxJointWidthGapMm>1e-7||maxJointWidthDerivativeGap>1e-5;
    let plannedMinimumWidthMm=Math.min(...plannedWidthSamples.map(s=>s.widthMm)),plannedMaximumWidthMm=Math.max(...plannedWidthSamples.map(s=>s.widthMm));
    const report={strategy:'adaptive-planar-extrusion-rim-hermite',requestedSizeMm:options.sizeMm,dimensionKind:'rounding-scale',
      plannedMinimumWidthMm,plannedMaximumWidthMm,plannedSizeFractionRange:[plannedMinimumWidthMm/options.sizeMm,plannedMaximumWidthMm/options.sizeMm],
      sizeStrategy:'smooth-local-curvature-limited-contact-width',widthLaw:{kind:'smooth-power-cap',power:8,curvatureLimitFactor:options.curvatureLimitFactor},
      curvatureLimitFactor:options.curvatureLimitFactor,minimumWidthFraction:options.minimumWidthFraction,maxPositiveCurvaturePerMm,maxSourceJointAngleDeg:maxJointAngleDeg,
      maxSourceJointWidthGapMm:maxJointWidthGapMm,maxSourceJointWidthDerivativeGap:maxJointWidthDerivativeGap,
      plannedWidthSamples:plannedWidthSamples.filter((_,i)=>i%4===0),
      sourceTopFaceId:topId,sourceWallFaceIds:[...new Set(parts.map(p=>p.wallFaceId))],actualEdgeIds:parts.map(p=>p.row.edgeId),
      maxExactContactToSourceFaceDistanceMm:0,maxControlErrorMm:0,maxSourceRimErrorMm:0,maxSideContactErrorMm:0,maxWallTangentErrorDeg:0,maxTopTangentErrorDeg:0,
      contactToleranceMm:options.contactToleranceMm,fieldToleranceMm:options.fieldToleranceMm,tangentToleranceDeg:options.tangentToleranceDeg,maxSegments:options.maxSegments,
      constructionAccuracyReason:'tight-source-and-wall-contact-fit-with-bounded-planar-control-field-fit',
      approximationSegmentCount:0,surfaceAssembly:{method:'piecewise-cubic-C1-BSpline-in-source-fit-bounded-blocks',
        blockStrategy:{decisionMeasurement:'measured-source-rim-Hermite-fit-error',wholeEdgeFitThresholdMm:1e-12,approximateCurveMaximumSegments:8,
          reason:'bound-near-coincident-source-support-intersection-while-reducing-topology'},blocks:[],surfaces:[]},
      toolFaces:0,patchCount:0,material:'remove',accepted:false,validationState:'TOOL_BUILD_PENDING'};
    const useGlobalReachWidth=reason=>{
      // Keep a strictly increasing response to the requested scale. A hard
      // min(size,reach) plateau made distinct history edits produce the same
      // geometry. This smooth cap remains below both size and contact reach.
      const reachCapMm=maxPositiveCurvaturePerMm>1e-12?options.curvatureLimitFactor/maxPositiveCurvaturePerMm:null;
      const globalWidth=reachCapMm===null?options.sizeMm:options.sizeMm/Math.hypot(1,options.sizeMm/reachCapMm);
      requireThat(globalWidth>=options.minimumWidthFraction*options.sizeMm,'Global contact reach requires a scale below the declared minimum','GEOMETRY_CONFLICT');
      options.globalReachWidthMm=globalWidth;
      plannedMinimumWidthMm=globalWidth;plannedMaximumWidthMm=globalWidth;
      report.plannedMinimumWidthMm=globalWidth;report.plannedMaximumWidthMm=globalWidth;
      report.plannedSizeFractionRange=[globalWidth/options.sizeMm,globalWidth/options.sizeMm];
      report.sizeStrategy=reason==='source-width-law-junction-discontinuity'?'global-curvature-cap-after-width-law-junction-discontinuity':'global-curvature-cap-after-local-rail-self-intersection';
      report.widthLaw={kind:'uniform-smooth-global-reach-cap',formula:'sizeMm / sqrt(1 + (sizeMm / reachCapMm)^2)',
        reachCapMm,curvatureLimitFactor:options.curvatureLimitFactor,strictlyIncreasingInRequestedSize:true};
      report.localWidthRejected={reason,plannedMinimumWidthMm:Math.min(...plannedWidthSamples.map(s=>s.widthMm)),plannedMaximumWidthMm:Math.max(...plannedWidthSamples.map(s=>s.widthMm)),
        maxWidthGapMm:maxJointWidthGapMm,maxArcWidthDerivativeGap:maxJointWidthDerivativeGap};
      report.plannedWidthSamples=report.plannedWidthSamples.map(sample=>({...sample,widthMm:globalWidth}));
      report.effectiveJointWidthGapMm=0;report.effectiveJointWidthDerivativeGap=0;
    };
    // Uniform width removes width-law junction incompatibility while keeping
    // strict original curve tangency. It does not erase a source corner.
    if(localWidthJunctionMismatch)useGlobalReachWidth('source-width-law-junction-discontinuity');
    const innerRailSamples=()=>{
      const samples=[];
      parts.forEach(part=>{for(let i=0;i<32;i++)samples.push(rimField(part.evaluate,i/32,axis,inwardSign,options).controls[3]);});samples.push(samples[0]);
      return samples;
    };
    if(polygonSelfCrosses(innerRailSamples(),axis,origin,parts[0].evaluate(0).d1)) {
      // Local curvature controls differential folding, but not collisions
      // between distant sections. A bounded global cap is a distinct width
      // strategy; the transverse cubic still has nonconstant curvature.
      requireThat(!Number.isFinite(options.globalReachWidthMm),'The globally capped inward contact rail still intersects itself','GEOMETRY_CONFLICT');
      useGlobalReachWidth('inward-contact-rail-self-intersection');
      requireThat(!polygonSelfCrosses(innerRailSamples(),axis,origin,parts[0].evaluate(0).d1),'The globally capped inward contact rail still intersects itself','GEOMETRY_CONFLICT');
    }
    parts.forEach(part=>verifyContactRange(part,axis,inwardSign,options,topFace,faces[part.wallFaceId],cad,report));
    const segments=[];
    for(const part of parts) {
      const visit=(a,b,depth)=>{
        const geometry=segmentControls(part.evaluate,a,b,axis,inwardSign,options),error=sampledSegmentError(part.evaluate,a,b,geometry,axis,inwardSign,options);
        if(error.maxControlErrorMm<=options.fieldToleranceMm&&error.maxSourceRimErrorMm<=options.contactToleranceMm&&error.maxSideContactErrorMm<=options.contactToleranceMm&&error.maxWallTangentErrorDeg<=options.tangentToleranceDeg&&error.maxTopTangentErrorDeg<=options.tangentToleranceDeg) {
          segments.push({part,a,b,geometry,error});return;
        }
        requireThat(depth<16&&segments.length+1<options.maxSegments,'Explicit Hermite rim approximation exceeds the bounded segment budget','GEOMETRY_CONFLICT');
        const mid=(a+b)/2;visit(a,mid,depth+1);visit(mid,b,depth+1);
      };visit(0,1,0);
    }
    requireThat(segments.length<=options.maxSegments,'Hermite rim segment budget exceeded','GEOMETRY_CONFLICT');
    const toolFaces=[],blendFaces=[];
    for(const segment of segments) {
      for(const key of ['maxControlErrorMm','maxSourceRimErrorMm','maxSideContactErrorMm','maxWallTangentErrorDeg','maxTopTangentErrorDeg'])report[key]=Math.max(report[key],segment.error[key]);
    }
    report.approximationSegmentCount=segments.length;
    for(const part of parts) {
      const edgeSegments=segments.filter(segment=>segment.part===part);
      const sourceFitErrorMm=Math.max(...edgeSegments.map(segment=>segment.error.maxSourceRimErrorMm));
      // A long fitted surface can be numerically almost coincident with its
      // exact support. Bound the Boolean intersection domain for that case.
      // Cubic source curves measured within 1e-12 mm retain whole-edge assembly.
      // This is one prescribed geometry partition, not a retry parameter scan.
      const wholeEdgeFit=sourceFitErrorMm<=report.surfaceAssembly.blockStrategy.wholeEdgeFitThresholdMm;
      const maximumSegments=wholeEdgeFit?edgeSegments.length:report.surfaceAssembly.blockStrategy.approximateCurveMaximumSegments;
      const blockCount=Math.ceil(edgeSegments.length/maximumSegments);
      for(let blockIndex=0;blockIndex<blockCount;blockIndex++) {
        const block=edgeSegments.slice(blockIndex*maximumSegments,(blockIndex+1)*maximumSegments);
        const interval=[block[0].a,block[block.length-1].b];
        report.surfaceAssembly.blocks.push({sourceEdgeId:part.row.edgeId,blockIndex,blockCount,interval,segmentCount:block.length,sourceFitErrorMm,
          strategy:wholeEdgeFit?'whole-edge-within-measured-fit-threshold':'at-most-eight-approximation-intervals'});
        const build=(role,columns)=>{
          const assembly={sourceEdgeId:part.row.edgeId,role,blockIndex,blockCount,interval};
          const pieces=block.map(segment=>({a:segment.a,b:segment.b,columns:columns(segment.geometry)}));
          const face=surfaceFace(pieces,cad,held,assembly);report.surfaceAssembly.surfaces.push(assembly);
          return face;
        };
        const blend=build('blend',geometry=>geometry.columns),top=build('top',geometry=>[geometry.outer,geometry.columns[3]]),side=build('side',geometry=>[geometry.outer,geometry.columns[0]]);
        blendFaces.push(blend);toolFaces.push(blend,top,side);
      }
    }
    const maximumAssemblyDeviationMm=Math.max(...report.surfaceAssembly.surfaces.map(surface=>surface.maxReadbackDeviationMm));
    report.surfaceAssembly.maxReadbackDeviationMm=maximumAssemblyDeviationMm;
    // Keep the original fit budgets after assembly as well. The native knot
    // operation's readback drift is counted instead of silently spent twice.
    requireThat(report.maxControlErrorMm+maximumAssemblyDeviationMm<=options.fieldToleranceMm&&
      report.maxSourceRimErrorMm+maximumAssemblyDeviationMm<=options.contactToleranceMm&&
      report.maxSideContactErrorMm+maximumAssemblyDeviationMm<=options.contactToleranceMm,
    'C1 assembly consumes the remaining contact fit accuracy budget','GEOMETRY_INVALID',
    {maxControlErrorMm:report.maxControlErrorMm,maxSourceRimErrorMm:report.maxSourceRimErrorMm,maxSideContactErrorMm:report.maxSideContactErrorMm,
      maximumAssemblyDeviationMm,fieldToleranceMm:options.fieldToleranceMm,contactToleranceMm:options.contactToleranceMm});
    tool=sewFaces({faces:toolFaces,tolerance:options.sewingToleranceMm,makeSolid:true},cad);
    report.toolFaces=toolFaces.length;report.patchCount=blendFaces.length;report.toolVolumeMm3=cad.measureVolume(tool);report.validationState='VALID_RING_TOOL_ONLY';
    const output={tool,report,contactAt(edgeId,t){const part=parts.find(p=>p.row.edgeId===edgeId);requireThat(!!part,'Unknown source rim edge');const f=rimField(part.evaluate,t,axis,inwardSign,options);return {outer:f.c,side:f.controls[0],inner:f.controls[3],widthMm:f.width};},
      limitations:['The cutter is valid; source Boolean result has not been built or independently accepted','Contact estimates are sampled against the exact source field; final BRep seam and region verification remains required'],
      disposeCandidate(){dispose(this.tool);this.tool=null;}};
    // contactAt must retain its curve adaptors, so ownership moves to output.
    const adaptors=held.filter(x=>x instanceof cad.getOC().BRepAdaptor_Curve);
    output.disposeCandidate=function(){dispose(this.tool);this.tool=null;adaptors.forEach(dispose);};
    held.splice(0,held.length,...held.filter(x=>!adaptors.includes(x)));
    tool=null;return output;
  } finally {dispose(tool);held.reverse().forEach(dispose);edges.forEach(dispose);faces.forEach(dispose);}
}

function historyShapes(raw,oc) {
  const list=new oc.NCollection_List_TopoDS_Shape(raw),items=[];
  try {
    while(list.Extent()){items.push(list.First());list.RemoveFirst();}
    return items;
  } finally {dispose(list);dispose(raw);}
}

function retainedFaceProvenance(source,result,builder,oc) {
  const sourceFaces=source.faces,resultFaces=result.faces,mappings=new Map();
  const register=(faceId,sourceFaceId)=>{
    requireThat(!mappings.has(faceId)||mappings.get(faceId)===sourceFaceId,'A result face has ambiguous source history','GEOMETRY_INVALID');
    mappings.set(faceId,sourceFaceId);
  };
  try {
    sourceFaces.forEach((sourceFace,sourceFaceId)=>{
      resultFaces.forEach((face,faceId)=>{if(face.isSame(sourceFace))register(faceId,sourceFaceId);});
      const modified=historyShapes(builder.Modified(sourceFace.wrapped),oc);
      try {modified.forEach(changed=>resultFaces.forEach((face,faceId)=>{if(face.wrapped.IsSame(changed))register(faceId,sourceFaceId);}));}
      finally {modified.forEach(dispose);}
    });
    const resultFaceSourceIds=[...mappings].map(([faceId,sourceFaceId])=>({faceId,sourceFaceId}));
    const generatedFaceIds=resultFaces.map((_,id)=>id).filter(id=>!mappings.has(id));
    requireThat(generatedFaceIds.length>0,'No generated blend surface remains in the final cut','GEOMETRY_INVALID');
    return {resultFaceSourceIds,generatedFaceIds};
  } finally {sourceFaces.forEach(dispose);resultFaces.forEach(dispose);}
}

function measureFinalContactWidths(source,result,sourceEdgeIds,generatedFaceIds,resultFaceSourceIds,planned,cad) {
  const sourceEdges=source.edges,resultEdges=result.edges,retained=new Set(resultFaceSourceIds.map(row=>row.faceId)),generated=new Set(generatedFaceIds);
  let originalRim,distanceQuery,rimClones=[];
  try {
    // makeCompound consumes every passed Replicad wrapper. Keep the original
    // source edges alive for extrema support identity and failure diagnostics.
    rimClones=sourceEdgeIds.map(id=>sourceEdges[id].clone());
    originalRim=cad.makeCompound(rimClones);rimClones=[];
    distanceQuery=new cad.DistanceQuery(originalRim);
    const distanceDeflectionMm=1e-10;
    distanceQuery.wrapped.SetDeflection(distanceDeflectionMm);
    const rows=topologyDetails(result,{connectivityOnly:true}).filter(row=>row.adjacentFaceIds.length===2&&
      row.adjacentFaceIds.some(id=>generated.has(id))&&row.adjacentFaceIds.some(id=>retained.has(id)));
    requireThat(rows.length>=2,'The final blend lacks both original-support contact boundaries','GEOMETRY_INVALID');
    const samples=[],measuredScaleMm=[];
    for(const row of rows)for(const t of [.001,.25,.5,.75,.999]) {
      const point=tuple(resultEdges[row.edgeId].pointAt(t)),vertex=cad.makeVertex(point);let widthMm,queryState;
      try {
        widthMm=distanceQuery.distanceTo(vertex);
        queryState={isDone:distanceQuery.wrapped.IsDone(),solutionCount:distanceQuery.wrapped.NbSolution(),distanceDeflectionMm};
      } finally {dispose(vertex);}
      const context={edgeId:row.edgeId,t,point,adjacentFaceIds:row.adjacentFaceIds,
        retainedSupportFaces:resultFaceSourceIds.filter(mapping=>row.adjacentFaceIds.includes(mapping.faceId)),widthMm,queryState};
      requireThat(queryState.isDone&&queryState.solutionCount>0&&Number.isFinite(widthMm)&&widthMm>0,
        'Actual BRep contact width cannot be measured','GEOMETRY_INVALID',context);
      const outsidePlannedRangeMm=Math.max(planned.plannedMinimumWidthMm-widthMm,widthMm-planned.plannedMaximumWidthMm,0);
      const withinFiniteRange=outsidePlannedRangeMm<=1e-5&&widthMm>=planned.minimumWidthFraction*planned.requestedSizeMm-1e-5&&widthMm<=planned.requestedSizeMm*1.0001;
      // Preserve the exact extrema support when a cut/contact differs from its
      // construction plan. A failed projection must not masquerade as a size.
      if(!withinFiniteRange) {
        context.distanceSolutions=[];
        for(let index=1;index<=queryState.solutionCount;index++) {
          let support,querySupport,rimPoint,queriedPoint;
          try {
            support=distanceQuery.wrapped.SupportOnShape1(index);
            querySupport=distanceQuery.wrapped.SupportOnShape2(index);
            rimPoint=distanceQuery.wrapped.PointOnShape1(index);queriedPoint=distanceQuery.wrapped.PointOnShape2(index);
            const sourceRimPoint=native(rimPoint),queryPoint=native(queriedPoint);
            // BRepExtrema_SupportType is not bound in this OC build. ShapeType
            // uses the available TopAbs enum on the actual support shapes.
            const supportType=support.ShapeType(),querySupportType=querySupport.ShapeType();
            context.distanceSolutions.push({index,sourceRimPoint,queryPoint,pointDistanceMm:norm(sub(sourceRimPoint,queryPoint)),
              supportType:String(supportType?.value??supportType),querySupportType:String(querySupportType?.value??querySupportType),
              sourceEdgeIds:sourceEdgeIds.filter(id=>sourceEdges[id].wrapped.IsSame(support))});
          }finally{[support,querySupport,rimPoint,queriedPoint].forEach(dispose);}
        }
      }
      requireThat(withinFiniteRange,
        'Actual BRep contact width does not match the finite planned scale','GEOMETRY_INVALID',
        {...context,plannedMinimumWidthMm:planned.plannedMinimumWidthMm,plannedMaximumWidthMm:planned.plannedMaximumWidthMm,outsidePlannedRangeMm});
      measuredScaleMm.push(widthMm);samples.push({edgeId:row.edgeId,t,widthMm,point});
    }
    return {measuredScaleMm,measuredMinimumMm:Math.min(...measuredScaleMm),measuredMaximumMm:Math.max(...measuredScaleMm),
      contactBoundaryCount:rows.length,contactSampleCount:samples.length,samples,distanceDeflectionMm,
      method:'BRep-result-contact-edge-minimum-distance-to-original-selected-rim'};
  } finally {dispose(distanceQuery);dispose(originalRim);rimClones.forEach(dispose);sourceEdges.forEach(dispose);resultEdges.forEach(dispose);}
}

/** Build a candidate; the dispatcher must enforce the complete shared gate. */
export function buildAdaptivePlanarRim(shape,params,scope=params?.scope,cad=defaultCad) {
  const sourceEdgeIds=scope?.edgeIds;
  requireThat(params?.specVersion===2&&Number.isFinite(params.sizeMm)&&params.sizeMm>0&&Array.isArray(sourceEdgeIds)&&sourceEdgeIds.length,
    'Adaptive rounding requires a current explicit rim and positive size','PARAM_SCHEMA_INVALID');
  const candidate=createPlanarRimHermiteTool(shape,{edgeIds:sourceEdgeIds,sizeMm:params.sizeMm},cad),oc=cad.getOC();let builder,result,argumentsList,toolsList;
  try {
    // The two-shape legacy constructor computes immediately. Configure the
    // empty builder first so safe processing applies before any source work.
    builder=new oc.BRepAlgoAPI_Cut();
    builder.SetNonDestructive(true);builder.SetRunParallel(false);builder.SetToFillHistory(true);
    argumentsList=new oc.NCollection_List_TopoDS_Shape();argumentsList.Append(shape.wrapped);
    toolsList=new oc.NCollection_List_TopoDS_Shape();toolsList.Append(candidate.tool.wrapped);
    builder.SetArguments(argumentsList);builder.SetTools(toolsList);
    const progress=new oc.Message_ProgressRange();try{builder.Build(progress);}finally{dispose(progress);}
    requireThat(builder.IsDone(),'Nonconstant rim cut did not complete','KERNEL_BUILD_FAILED');
    result=cad.cast(builder.Shape());
    const analyzer=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false),cutSolids=result.solids,cutFaces=result.faces;
    let cutDiagnostic;
    try {cutDiagnostic={stage:'adaptive-rim-cut',analyzerValid:analyzer.IsValid(),solidCount:cutSolids.length,faceCount:cutFaces.length,
      toolPatchCount:candidate.report.patchCount,toolFaceCount:candidate.report.toolFaces,constructionToleranceMm:candidate.report.contactToleranceMm,widthStrategy:candidate.report.sizeStrategy};}
    finally {dispose(analyzer);cutSolids.forEach(dispose);cutFaces.forEach(dispose);}
    requireThat(cutDiagnostic.analyzerValid&&cutDiagnostic.solidCount===1,'Nonconstant rim cut is not a valid single solid','GEOMETRY_INVALID',cutDiagnostic);
    let validation;
    try {validation=validateRoundingResult(shape,result,oc);}
    catch(error) {error.report={...(error.report||{}),adaptiveCut:cutDiagnostic};throw error;}
    requireThat(validation.deltaVolumeMm3<-1e-9,'Convex outer-rim smoothing must remove material','MATERIAL_CHECK_FAILED');
    const provenance=retainedFaceProvenance(shape,result,builder,oc);
    const scale=measureFinalContactWidths(shape,result,sourceEdgeIds,provenance.generatedFaceIds,provenance.resultFaceSourceIds,candidate.report,cad);
    const adaptive={...candidate.report,plannedMinimumMm:candidate.report.plannedMinimumWidthMm,plannedMaximumMm:candidate.report.plannedMaximumWidthMm,
      measuredMinimumMm:scale.measuredMinimumMm,measuredMaximumMm:scale.measuredMaximumMm,measurementMethod:scale.method,
      deltaVolumeMm3:validation.deltaVolumeMm3,validationState:'VALID_CUT_AND_MEASURED_SCALE_PENDING_SHARED_GATE'};
    const output={shape:result,...provenance,actualEdgeIds:[...candidate.report.actualEdgeIds],strategy:'adaptive-planar-extrusion-rim-hermite',
      contourCount:1,contourEdgeIds:[[...candidate.report.actualEdgeIds]],surfaceCount:provenance.generatedFaceIds.length,
      dimensionKind:'rounding-scale',adaptive,scale,measuredScaleMm:scale.measuredScaleMm,adaptiveScaleRatios:{min:.35,max:1.0001},validation};
    result=null;return output;
  } finally {dispose(result);dispose(builder);dispose(argumentsList);dispose(toolsList);candidate.disposeCandidate();}
}
