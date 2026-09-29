import * as cad from 'replicad';

const EPS=1e-7;
const dispose=value=>{try{value?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,k)=>a.map(x=>x*k);
const norm=a=>Math.hypot(...a);
const unit=a=>mul(a,1/norm(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const fail=(message,code='VARIABLE_FAMILY_UNMATCHED')=>{throw Object.assign(new Error(message),{code,recoveryAction:'CORRECT_PARAMETERS'});};

function faceRay(face,point,axis){
  const toward=sub(face.center.toTuple(),point),across=sub(toward,mul(axis,dot(toward,axis)));
  if(norm(across)<EPS)fail('支撑面内向射线不明确');
  return unit(across);
}
function inBounds(point,face){
  const box=face.boundingBox;
  try{const [lo,hi]=box.bounds;return point.every((x,i)=>x>=lo[i]-1e-5&&x<=hi[i]+1e-5);}
  finally{dispose(box);}
}
function sectionRadius(shape,origin,axis,radial,expected){
  const oc=cad.getOC(),drawing=cad.drawRectangle(Math.max(10,expected*8),Math.max(10,expected*8));
  let sketch,planeFace,builder,section,edges=[];
  try{
    sketch=drawing.sketchOnPlane(new cad.Plane(origin,radial,axis));planeFace=sketch.face();
    builder=new oc.BRepAlgoAPI_Section(shape.wrapped,planeFace.wrapped);builder.Build();
    if(!builder.IsDone?.()||builder.Shape?.().IsNull?.())fail('法截面求交失败','GEOMETRY_INVALID');
    section=cad.cast(builder.Shape());edges=section.edges;
    const curves=edges.filter(edge=>edge.geomType!=='LINE');
    if(curves.length!==1)fail('最终过渡面法截面不是唯一曲线','GEOMETRY_INVALID');
    const points=Array.from({length:17},(_,i)=>{const p=curves[0].pointAt((i+.5)/17);try{return p.toTuple();}finally{dispose(p);}});
    const coordinates=points.map(point=>{const d=sub(point,origin),y=unit(cross(axis,radial));return [dot(d,radial),dot(d,y)];});
    const mx=coordinates.reduce((s,p)=>s+p[0],0)/coordinates.length,my=coordinates.reduce((s,p)=>s+p[1],0)/coordinates.length;
    let aa=0,ab=0,bb=0,ac=0,bc=0;
    for(const [px,py] of coordinates){const x=px-mx,y=py-my,z=x*x+y*y;aa+=x*x;ab+=x*y;bb+=y*y;ac+=x*z;bc+=y*z;}
    const det=aa*bb-ab*ab;if(Math.abs(det)<1e-20)fail('截面圆拟合退化','GEOMETRY_INVALID');
    const cx=(ac*bb-bc*ab)/(2*det)+mx,cy=(bc*aa-ac*ab)/(2*det)+my;
    const distances=coordinates.map(([x,y])=>Math.hypot(x-cx,y-cy)),radius=distances.reduce((s,r)=>s+r,0)/distances.length;
    const residual=Math.max(...distances.map(r=>Math.abs(r-radius)));
    if(Math.abs(radius-expected)>1e-5||residual>1e-5)fail('最终截面半径未满足请求的线性规律','GEOMETRY_INVALID');
    return {measuredSectionRadiusMm:radius,radiusErrorMm:radius-expected,sectionFitResidualMm:residual};
  }finally{edges.forEach(dispose);[section,builder,planeFace,sketch,drawing].forEach(dispose);}
}

const samePoint=(a,b)=>norm(sub(a,b))<1e-5;

// Exact circular sections are ruled over the full accumulated source chain.
// Every segment must be on one line and share the same two support planes.
export function variableStraightPlanarFillet(shape,params,plan){
  const ids=params.scope?.edgeIds||[],rows=ids.map(id=>plan.targets.find(row=>row.edgeId===id));
  if(!ids.length||ids.length>16||rows.some(row=>!row)||rows.length!==plan.targets.length)fail('变 R 需要明确且完整的连续源边链');
  const row=rows[0],law=params.laws?.[0],edges=shape.edges,faces=shape.faces;
  let tool,result,profiles=[];
  try{
    const chainId=ids.length===1?`edge:${ids[0]}`:`edges:${ids.join(',')}`;
    if(params.laws?.length!==1||law.chainId!==chainId||!['forward','reverse'].includes(law.direction)||law.interpolation!=='linear'||law.stations.length<2||law.stations.length>16||law.stations[0].s!==0||law.stations.at(-1).s!==1||law.stations.some((item,i)=>i&&item.s<=law.stations[i-1].s))fail('变 R 需要整链有序线性站点、匹配的 chainId 和明确方向','PARAM_SCHEMA_INVALID');
    const firstShared=rows.length>1&&(samePoint(row.startPoint,rows[1].startPoint)||samePoint(row.startPoint,rows[1].endPoint));
    const start=firstShared?row.endPoint:row.startPoint;
    let cursor=start;
    const segments=[];
    for(const item of rows){
      if(edges[item.edgeId].geomType!=='LINE'||item.adjacentFaceIds.length!==2)fail('目标链包含非两平面公共直边');
      let next;
      if(samePoint(cursor,item.startPoint))next=item.endPoint;
      else if(samePoint(cursor,item.endPoint))next=item.startPoint;
      else fail('目标源边不是按顺序连续的链');
      segments.push({row:item,start:cursor,end:next,length:norm(sub(next,cursor)),faces:item.adjacentFaceIds.map(id=>faces[id])});cursor=next;
    }
    const end=cursor,axis=unit(sub(end,start)),length=norm(sub(end,start));
    if(length<EPS||Math.abs(segments.reduce((sum,item)=>sum+item.length,0)-length)>1e-5||segments.some(item=>item.length<EPS||norm(cross(sub(item.end,item.start),axis))>1e-5*item.length))fail('目标链不是单一直线上的累计弧长','VARIABLE_FAMILY_UNMATCHED');
    const [faceA,faceB]=segments[0].faces;
    if(faceA.geomType!=='PLANE'||faceB.geomType!=='PLANE')fail('目标两侧不是解析平面');
    const holes=segments.flatMap(item=>item.faces.flatMap(face=>face.clone().innerWires()));
    try{if(holes.length)fail('支撑面含孔，不能使用直边解析变 R 构造');}finally{holes.forEach(dispose);}
    const dA=faceRay(faceA,row.midpoint,axis),dB=faceRay(faceB,row.midpoint,axis);
    const nA=unit(faceA.normalAt(row.midpoint).toTuple()),nB=unit(faceB.normalAt(row.midpoint).toTuple());
    const sideA=dot(dA,nB),sideB=dot(dB,nA);
    if(Math.abs(sideA)<1e-5||Math.abs(sideB)<1e-5||sideA*sideB<=0)fail('支撑面材料侧不明确');
    const material=sideA<0?'remove':'add';
    for(const item of segments){
      if(item.faces.some(face=>face.geomType!=='PLANE'))fail('目标链包含非平面支撑面');
      const normals=item.faces.map(face=>unit(face.normalAt(item.row.midpoint).toTuple()));
      const matches=(face,normal)=>Math.abs(dot(unit(face.normalAt(row.midpoint).toTuple()),normal))>1-1e-7&&Math.abs(dot(sub(item.row.midpoint,row.midpoint),normal))<1e-5;
      if(!((matches(faceA,normals[0])&&matches(faceB,normals[1]))||(matches(faceA,normals[1])&&matches(faceB,normals[0]))))fail('目标链的两侧支撑面不是同一对平面');
    }
    const theta=Math.acos(Math.max(-1,Math.min(1,dot(dA,dB)))),sinHalf=Math.sin(theta/2);
    if(theta<Math.PI/18||theta>Math.PI*17/18||sinHalf<1e-6)fail('支撑面夹角不适合该解析构造');
    const mapped=law.direction==='reverse'?[...law.stations].reverse().map(item=>({s:1-item.s,radiusMm:item.radiusMm})):law.stations;
    const bisector=unit(add(dA,dB)),y=unit(cross(axis,dA));
    const to2=p=>[dot(p,dA),dot(p,y)];
    const profile=(origin,radius)=>{
      const tangent=radius/Math.tan(theta/2),center=mul(bisector,radius/sinHalf),ta=mul(dA,tangent),tb=mul(dB,tangent),mid=sub(center,mul(bisector,radius));
      const active=segments.find(item=>dot(sub(origin,item.start),axis)<=item.length+1e-5)||segments.at(-1);
      const supportA=active.faces.find(face=>Math.abs(dot(unit(face.normalAt(active.row.midpoint).toTuple()),nA))>1-1e-7);
      const supportB=active.faces.find(face=>face!==supportA);
      if(!supportA||!supportB||!inBounds(add(origin,ta),supportA)||!inBounds(add(origin,tb),supportB))fail('请求半径接点越过支撑面','GEOMETRY_CONFLICT');
      return cad.draw([0,0]).lineTo(to2(ta)).threePointsArcTo(to2(tb),to2(mid)).close().sketchOnPlane(new cad.Plane(origin,dA,axis));
    };
    profiles=mapped.map(item=>profile(add(start,mul(axis,length*item.s)),item.radiusMm));
    tool=profiles[0].loftWith(profiles.slice(1),{ruled:true});
    result=material==='remove'?shape.cut(tool):shape.fuse(tool);
    const resultFaces=result.faces,blendFaces=resultFaces.filter(face=>face.geomType==='BSPLINE_SURFACE');
    if(blendFaces.length!==mapped.length-1){resultFaces.forEach(dispose);fail('结果过渡面数量与线性站点区间不一致','GEOMETRY_INVALID');}
    const orderedBlends=blendFaces.map(face=>({face,s:dot(sub(face.center.toTuple(),start),axis)/length})).sort((a,b)=>a.s-b.s).map(item=>item.face),samples=[];
    try{
      const positions=new Set([.005,.025,.1,.25,.5,.75,.9,.975,.995]);
      let accumulated=0;
      for(const item of segments.slice(0,-1)){accumulated+=item.length;for(const delta of [-.1,.1])positions.add((accumulated+delta)/length);}
      for(let i=0;i<mapped.length-1;i++)for(const t of [.1,.5,.9])positions.add(mapped[i].s+(mapped[i+1].s-mapped[i].s)*t);
      for(const fraction of [...positions].filter(x=>x>0&&x<1).sort((a,b)=>a-b)){
        const segment=Math.min(mapped.length-2,Math.max(0,mapped.findIndex((item,i)=>i<mapped.length-1&&fraction>=item.s&&fraction<mapped[i+1].s)));
        const a=mapped[segment],b=mapped[segment+1],blend=orderedBlends[segment];
        const origin=add(start,mul(axis,length*fraction)),expected=a.radiusMm+(b.radiusMm-a.radiusMm)*(fraction-a.s)/(b.s-a.s);
        const measured=sectionRadius(blend,origin,axis,dA,expected);
        const tangent=expected/Math.tan(theta/2);
        const angles=[];
        const active=segments.find(item=>dot(sub(origin,item.start),axis)<item.length-1e-7)||segments.at(-1);
        const supportA=active.faces.find(face=>Math.abs(dot(unit(face.normalAt(active.row.midpoint).toTuple()),nA))>1-1e-7);
        const supportB=active.faces.find(face=>face!==supportA);
        for(const [point,support] of [[add(origin,mul(dA,tangent)),supportA],[add(origin,mul(dB,tangent)),supportB]]){
          const a=blend.normalAt(point).toTuple(),b=support.normalAt(point).toTuple();
          angles.push(Math.acos(Math.max(-1,Math.min(1,Math.abs(dot(a,b))/(norm(a)*norm(b)))))*180/Math.PI);
        }
        if(Math.max(...angles)>.1)fail('变 R 过渡面与支撑面不相切','GEOMETRY_INVALID');
        samples.push({sourceArcLengthMm:length*(law.direction==='reverse'?1-fraction:fraction),nativeParameter:null,expectedRadiusMm:expected,injectedLawRadiusMm:null,lawRadiusAfterBuildMm:null,...measured,maxTangentAngleDeg:Math.max(...angles)});
      }
    }finally{resultFaces.forEach(dispose);}
    const output={shape:result,actualEdgeIds:ids,contourCount:1,surfaceCount:mapped.length-1,strategy:ids.length===1?'analytic-variable-straight-ruled-v1':'analytic-variable-collinear-chain-ruled-v1',variable:{chainId:law.chainId,sourceEdgeId:ids.length===1?ids[0]:null,sourceEdgeIds:ids,sourceLengthMm:length,sourceSegments:segments.map(item=>({edgeId:item.row.edgeId,lengthMm:item.length})),direction:law.direction,interpolation:'linear',stations:law.stations,material,samples,maxRadiusErrorMm:Math.max(...samples.map(item=>Math.abs(item.radiusErrorMm))),maxSectionFitResidualMm:Math.max(...samples.map(item=>item.sectionFitResidualMm)),maxTangentAngleDeg:Math.max(...samples.map(item=>item.maxTangentAngleDeg)),internalStationContinuity:'C0 radius; piecewise-linear slope changes may create a visible station seam'}};
    result=null;return output;
  }finally{dispose(result);dispose(tool);profiles.forEach(dispose);edges.forEach(dispose);faces.forEach(dispose);}
}
