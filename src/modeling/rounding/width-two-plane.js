import * as cad from 'replicad';

const dispose=value=>{try{value?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,k)=>a.map(x=>x*k);
const norm=a=>Math.hypot(...a);
const unit=a=>mul(a,1/norm(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const fail=(message,code='WIDTH_FAMILY_UNMATCHED')=>{throw Object.assign(new Error(message),{code,recoveryAction:'CORRECT_PARAMETERS'});};

function inFaceBounds(point,face){
  const box=face.boundingBox;
  try{const [lo,hi]=box.bounds;return point.every((x,i)=>x>=lo[i]-1e-5&&x<=hi[i]+1e-5);}
  finally{dispose(box);}
}

function supportFaces(row,faces,scope){
  const ids=scope.kind==='shared-faces'?[scope.faceAIds[0],scope.faceBIds[0]]:[...row.adjacentFaceIds].sort((a,b)=>a-b);
  if(ids.length!==2||ids[0]===ids[1]||ids.some(id=>!row.adjacentFaceIds.includes(id)))fail('A/B 支撑面没有唯一对应目标边');
  return {ids,faceA:faces[ids[0]],faceB:faces[ids[1]]};
}

function seamAngleDeg(blend,support,point){
  const a=blend.normalAt(point).toTuple(),b=support.normalAt(point).toTuple();
  return Math.acos(Math.max(-1,Math.min(1,Math.abs(dot(a,b))/(norm(a)*norm(b)))))*180/Math.PI;
}

function verifyStraightWidth(result,row,axis,dA,dB,faceA,faceB,widthA,widthB){
  const faces=result.faces;
  try{
    const blends=faces.filter(face=>face.geomType==='EXTRUSION_SURFACE');
    if(blends.length!==1)fail('结果未形成唯一的宽圆润过渡面','GEOMETRY_INVALID');
    const blend=blends[0],boundary=blend.edges;
    try{
      const seams=boundary.filter(edge=>edge.geomType==='LINE'&&Math.abs(edge.length-norm(sub(row.endPoint,row.startPoint)))<1e-5);
      if(seams.length!==2)fail('宽圆润过渡面缺少两条完整接合边','GEOMETRY_INVALID');
      const locate=(offset)=>{
        const ranked=seams.map(edge=>{const p=edge.pointAt(.5).toTuple();return {edge,distance:norm(sub(sub(p,row.midpoint),offset)),point:p};}).sort((a,b)=>a.distance-b.distance);
        if(ranked[0].distance>1e-5||ranked.length>1&&Math.abs(ranked[0].distance-ranked[1].distance)<1e-7)fail('宽圆润接合边位置不符合请求','GEOMETRY_INVALID');
        return ranked[0];
      };
      const a=locate(mul(dA,widthA)),b=locate(mul(dB,widthB));
      if(a.edge===b.edge)fail('两侧宽度错误地指向同一接合边','GEOMETRY_INVALID');
      const actualA=norm(sub(a.point,row.midpoint)),actualB=norm(sub(b.point,row.midpoint));
      const angles=[];
      for(const [seam,support] of [[a.edge,faceA],[b.edge,faceB]])for(const t of [.2,.5,.8])angles.push(seamAngleDeg(blend,support,seam.pointAt(t).toTuple()));
      const maxTangentAngleDeg=Math.max(...angles);
      if(Math.abs(actualA-widthA)>1e-5||Math.abs(actualB-widthB)>1e-5||maxTangentAngleDeg>.1)fail('宽圆润实际宽度或两侧接合超出固定容差','GEOMETRY_INVALID');
      return {actualWidthAMm:actualA,actualWidthBMm:actualB,maxTangentAngleDeg,contactSamples:6};
    }finally{boundary.forEach(dispose);}
  }finally{faces.forEach(dispose);}
}

function verifyCircularWidth(result,sourceCenter,sourceRadius,axis,faceA,faceB,widthA,widthB,planeIsA,oc){
  const faces=result.faces;
  try{
    const blends=faces.filter(face=>face.geomType==='REVOLUTION_SURFACE');
    if(blends.length!==1)fail('结果未形成唯一的回转宽圆润面','GEOMETRY_INVALID');
    const blend=blends[0],boundary=blend.edges;
    try{
      const seams=boundary.filter(edge=>edge.geomType==='CIRCLE');
      if(seams.length<2)fail(`圆形宽圆润缺少两条闭合接合轨线：${boundary.map(edge=>edge.geomType).join(',')}`,'GEOMETRY_INVALID');
      const rows=seams.map(edge=>{let curve,circle,location;try{curve=new oc.BRepAdaptor_Curve(edge.wrapped);circle=curve.Circle();location=circle.Location();const center=[location.X(),location.Y(),location.Z()];return {edge,radius:circle.Radius(),axial:Math.abs(dot(sub(center,sourceCenter),axis))};}finally{[curve,circle,location].forEach(dispose);}});
      const planeWidth=planeIsA?widthA:widthB,wallWidth=planeIsA?widthB:widthA;
      const plane=rows.find(row=>row.axial<1e-5&&Math.abs(Math.abs(row.radius-sourceRadius)-planeWidth)<1e-5);
      const wall=rows.find(row=>Math.abs(row.radius-sourceRadius)<1e-5&&Math.abs(row.axial-wallWidth)<1e-5&&row!==plane);
      if(!plane||!wall)fail(`圆形宽圆润轨线未落在正确支撑面：${rows.map(row=>[row.radius,row.axial])}`,'GEOMETRY_INVALID');
      const actualPlane=Math.abs(plane.radius-sourceRadius),actualWall=wall.axial;
      const actualA=planeIsA?actualPlane:actualWall,actualB=planeIsA?actualWall:actualPlane;
      const angles=[];
      for(const [seam,support] of [[plane.edge,planeIsA?faceA:faceB],[wall.edge,planeIsA?faceB:faceA]])for(const t of [.2,.5,.8])angles.push(seamAngleDeg(blend,support,seam.pointAt(t).toTuple()));
      const maxTangentAngleDeg=Math.max(...angles);
      if(Math.abs(actualA-widthA)>1e-5||Math.abs(actualB-widthB)>1e-5||maxTangentAngleDeg>.1)fail('圆形宽圆润实际宽度或两侧接合超出固定容差','GEOMETRY_INVALID');
      return {actualWidthAMm:actualA,actualWidthBMm:actualB,maxTangentAngleDeg,contactSamples:6};
    }finally{boundary.forEach(dispose);}
  }finally{faces.forEach(dispose);}
}

export function widthTwoPlaneStraight(shape,params,plan){
  if(plan.targets.length!==1)fail('两平面宽圆润要求一条完整公共直边');
  const row=plan.targets[0],edges=shape.edges,faces=shape.faces;
  let tool,result;
  try{
    const edge=edges[row.edgeId];
    if(edge.geomType!=='LINE'||row.adjacentFaceIds.length!==2)fail('目标不是两平面公共直边');
    const {ids,faceA,faceB}=supportFaces(row,faces,params.scope);
    if(faceA.geomType!=='PLANE'||faceB.geomType!=='PLANE')fail('宽圆润的两侧支撑面不是平面');
    const holesA=faceA.clone().innerWires(),holesB=faceB.clone().innerWires();
    try{if(holesA.length||holesB.length)fail('支撑面含内孔，不能使用两平面宽圆润');}
    finally{[...holesA,...holesB].forEach(dispose);}
    const widthA=params.widthAMm,widthB=params.widthBMm;
    if(!Number.isFinite(widthA)||!Number.isFinite(widthB)||widthA<=0||widthB<=0)fail('两侧宽度必须为正有限数','PARAM_SCHEMA_INVALID');
    const start=row.startPoint,axis=unit(sub(row.endPoint,start)),length=norm(sub(row.endPoint,start));
    if(length<1e-7)fail('公共直边长度无效');
    const ray=(face)=>{const toward=sub(face.center.toTuple(),row.midpoint),across=sub(toward,mul(axis,dot(toward,axis)));if(norm(across)<1e-7)fail('支撑面局部朝向不明确');return unit(across);};
    const dA=ray(faceA),dB=ray(faceB),theta=Math.acos(Math.max(-1,Math.min(1,dot(dA,dB))));
    if(theta<Math.PI/18||theta>Math.PI*17/18)fail('支撑面夹角不适合两平面宽圆润');
    const nA=unit(faceA.normalAt(row.midpoint).toTuple()),nB=unit(faceB.normalAt(row.midpoint).toTuple());
    const sideA=dot(dA,nB),sideB=dot(dB,nA);
    if(Math.abs(sideA)<1e-5||Math.abs(sideB)<1e-5||sideA*sideB<=0)fail('两侧材料语义不一致');
    const material=sideA<0?'remove':'add';
    const ta=mul(dA,widthA),tb=mul(dB,widthB),p1=mul(dA,widthA*2/3),p2=mul(dB,widthB*2/3);
    for(const base of [row.startPoint,row.midpoint,row.endPoint]){
      if(!inFaceBounds(add(base,ta),faceA)||!inFaceBounds(add(base,tb),faceB))fail('宽度接点越过支撑面范围','GEOMETRY_CONFLICT');
    }
    const y=unit(cross(axis,dA)),to2=p=>[dot(p,dA),dot(p,y)];
    const plane=new cad.Plane(start,dA,axis);
    tool=cad.draw([0,0]).lineTo(to2(ta)).cubicBezierCurveTo(to2(tb),to2(p1),to2(p2)).close().sketchOnPlane(plane).extrude(length,{extrusionDirection:axis});
    result=material==='remove'?shape.cut(tool):shape.fuse(tool);
    const measured=verifyStraightWidth(result,row,axis,dA,dB,faceA,faceB,widthA,widthB);
    const output={shape:result,actualEdgeIds:[row.edgeId],contourCount:1,surfaceCount:1,
      strategy:'width-two-plane-bezier-v1',width:{widthAMm:widthA,widthBMm:widthB,...measured,supportFaceAId:ids[0],supportFaceBId:ids[1],material,sectionAngleDeg:theta*180/Math.PI,handleRule:'one-third-each-width'}};
    result=null;return output;
  }finally{dispose(result);dispose(tool);edges.forEach(dispose);faces.forEach(dispose);}
}

export function widthPlanarCircular(shape,params,plan){
  if(plan.targets.length!==1)fail('规则曲边宽圆润要求一条完整目标轮廓');
  const row=plan.targets[0],edges=shape.edges,faces=shape.faces,oc=cad.getOC();
  let adaptor,circle,location,axisValue,tool,result;
  try{
    const edge=edges[row.edgeId];
    if(edge.geomType!=='CIRCLE'||row.adjacentFaceIds.length!==2)fail('目标不是圆形公共边');
    const {ids,faceA,faceB}=supportFaces(row,faces,params.scope);
    const planeFace=[faceA,faceB].find(f=>f.geomType==='PLANE'),wallFace=[faceA,faceB].find(f=>f.geomType==='CYLINDRE');
    if(!planeFace||!wallFace)fail('目标不是平面与规则圆柱拉伸侧壁');
    const holes=planeFace.clone().innerWires();try{if(holes.length)fail('平面支撑含内孔，圆形宽过渡需单独裁剪');}finally{holes.forEach(dispose);}
    adaptor=new oc.BRepAdaptor_Curve(edge.wrapped);circle=adaptor.Circle();location=circle.Location();axisValue=circle.Axis();
    const axisDirection=axisValue.Direction(),axis=unit([axisDirection.X(),axisDirection.Y(),axisDirection.Z()]);
    const origin=[location.X(),location.Y(),location.Z()],baseRadius=circle.Radius();
    const sweep=edge.length/baseRadius;
    if(edge.isClosed&&Math.abs(sweep-2*Math.PI)>1e-6)fail('闭合圆边的解析角度不一致');
    if(!edge.isClosed&&(sweep<1e-5||sweep>=2*Math.PI-1e-5))fail('开放圆弧的解析角度无效');
    const sampledPoint=edge.pointAt(.2),point=sampledPoint.toTuple();dispose(sampledPoint);
    const radial=unit(sub(point,origin));
    if(Math.abs(dot(radial,axis))>1e-5)fail('圆边平面与圆柱轴不正交');
    const radialProjection=dot(sub(planeFace.center.toTuple(),point),radial);
    if(Math.abs(radialProjection)<1e-6)fail('圆弧支撑面内侧不明确');
    const radialSign=Math.sign(radialProjection),dPlane=mul(radial,radialSign);
    const towardWall=sub(wallFace.center.toTuple(),point),axial=dot(towardWall,axis),dWall=unit(mul(axis,axial));
    if(!Number.isFinite(dWall[0])||Math.abs(dot(dPlane,dWall))>1e-5)fail('支撑面不是正交规则拉伸');
    const dA=faceA===planeFace?dPlane:dWall,dB=faceB===planeFace?dPlane:dWall;
    const nA=unit(faceA.normalAt(point).toTuple()),nB=unit(faceB.normalAt(point).toTuple());
    const sideA=dot(dA,nB),sideB=dot(dB,nA);
    if(Math.abs(sideA)<1e-5||Math.abs(sideB)<1e-5||sideA*sideB<=0)fail('圆边两侧材料语义不一致');
    const material=sideA<0?'remove':'add';
    const widthA=params.widthAMm,widthB=params.widthBMm;
    if(!Number.isFinite(widthA)||!Number.isFinite(widthB)||widthA<=0||widthB<=0)fail('宽度必须为正有限数','PARAM_SCHEMA_INVALID');
    if(baseRadius+dot(dPlane,radial)*(planeFace===faceA?widthA:widthB)<=1e-7)fail('平面接点越过回转轴','GEOMETRY_CONFLICT');
    const endpointCap=(p,r)=>faces.some((face,id)=>{
      if(row.adjacentFaceIds.includes(id)||face.geomType!=='PLANE')return false;
      const normal=unit(face.normalAt(p).toTuple());
      if(Math.abs(dot(normal,axis))>1e-5||Math.abs(dot(normal,r))>1e-5)return false;
      const boundary=face.edges;
      try{return boundary.some(segment=>[segment.startPoint,segment.endPoint].some(vertex=>{
        try{return norm(sub(vertex.toTuple(),p))<1e-5;}finally{dispose(vertex);}
      }));}finally{boundary.forEach(dispose);}
    });
    let startRadial=radial,angle;
    if(!edge.isClosed){
      const first=edge.startPoint,last=edge.endPoint,near=edge.pointAt(.01);
      try{
        const start=first.toTuple(),end=last.toTuple();startRadial=unit(sub(start,origin));
        const endRadial=unit(sub(end,origin)),nearRadial=unit(sub(near.toTuple(),origin));
        const orientation=Math.sign(dot(cross(startRadial,nearRadial),axis));
        if(!orientation||!endpointCap(start,startRadial)||!endpointCap(end,endRadial))fail('开放圆弧两端没有明确的径向限制面');
        angle=orientation*sweep*180/Math.PI;
      }finally{[first,last,near].forEach(dispose);}
    }
    for(const t of [0,.125,.375,.625,.875,1]){
      const sampled=edge.pointAt(t),p=sampled.toTuple();dispose(sampled);
      const localRadial=unit(sub(p,origin)),localPlane=mul(localRadial,radialSign);
      const localA=faceA===planeFace?localPlane:dWall,localB=faceB===planeFace?localPlane:dWall;
      const wallNormal=unit(wallFace.normalAt(p).toTuple());
      if(Math.abs(Math.abs(dot(wallNormal,localRadial))-1)>1e-5||Math.sign(dot(sub(planeFace.center.toTuple(),p),localRadial))!==radialSign)fail('圆弧沿程支撑方向不一致');
      if(!inFaceBounds(add(p,mul(localA,widthA)),faceA)||!inFaceBounds(add(p,mul(localB,widthB)),faceB))fail('宽度接点越过支撑面范围','GEOMETRY_CONFLICT');
    }
    const startPlane=mul(startRadial,radialSign),startA=faceA===planeFace?startPlane:dWall,startB=faceB===planeFace?startPlane:dWall;
    const ta=mul(startA,widthA),tb=mul(startB,widthB),p1=mul(startA,widthA*2/3),p2=mul(startB,widthB*2/3);
    const as2=p=>[baseRadius+dot(p,startRadial),dot(p,axis)];
    const sectionPlane=new cad.Plane(origin,startRadial,unit(cross(startRadial,axis)));
    tool=cad.draw([baseRadius,0]).lineTo(as2(ta)).cubicBezierCurveTo(as2(tb),as2(p1),as2(p2)).close().sketchOnPlane(sectionPlane).revolve(axis,{origin,...(angle===undefined?{}:{angle})});
    result=material==='remove'?shape.cut(tool):shape.fuse(tool);
    const measured=verifyCircularWidth(result,origin,baseRadius,axis,faceA,faceB,widthA,widthB,faceA===planeFace,oc);
    const output={shape:result,actualEdgeIds:[row.edgeId],contourCount:1,surfaceCount:1,strategy:edge.isClosed?'width-planar-circle-revolve-v1':'width-planar-arc-revolve-v1',
      width:{widthAMm:widthA,widthBMm:widthB,...measured,supportFaceAId:ids[0],supportFaceBId:ids[1],material,sourceCircleRadiusMm:baseRadius,sweepAngleDeg:angle??360,termination:edge.isClosed?'closed':'radial-plane-caps',handleRule:'one-third-each-width'}};
    result=null;return output;
  }finally{[adaptor,circle,location,axisValue,tool,result].forEach(dispose);edges.forEach(dispose);faces.forEach(dispose);}
}

export function buildWidthRounding(shape,params,plan){
  if(plan.targets.length!==1)fail('宽圆润要求一个完整目标轮廓');
  const edges=shape.edges;let type;
  try{type=edges[plan.targets[0].edgeId].geomType;}
  finally{edges.forEach(dispose);}
  if(type==='LINE')return widthTwoPlaneStraight(shape,params,plan);
  if(type==='CIRCLE')return widthPlanarCircular(shape,params,plan);
  fail('目标曲线不属于已验证的宽圆润构造族');
}
