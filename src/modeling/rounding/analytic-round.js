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
const fail=(message,code='ANALYTIC_FAMILY_UNMATCHED')=>{throw Object.assign(new Error(message),{code,recoveryAction:'CORRECT_PARAMETERS'});};

function faceRay(face,point,axis){
  const center=face.center.toTuple(),toward=sub(center,point),across=sub(toward,mul(axis,dot(toward,axis)));
  if(norm(across)<EPS)fail('支撑面中心不能确定公共边的内向射线');
  return unit(across);
}

function inBounds(point,face,tolerance=1e-5){
  const box=face.boundingBox;
  try{const [low,high]=box.bounds;return point.every((value,i)=>value>=low[i]-tolerance&&value<=high[i]+tolerance);}
  finally{dispose(box);}
}

// Independent exact-arc prism Boolean. It does not call a native fillet builder.
// The current guarded family is one straight common edge of two planar faces.
export function analyticStraightPlanarFillet(shape,params,plan){
  if(plan.targets.length!==1)fail('解析直边构造要求单一完整目标轮廓');
  const row=plan.targets[0],edges=shape.edges,faces=shape.faces;
  let tool,result;
  try{
    const edge=edges[row.edgeId];
    if(edge.geomType!=='LINE'||row.adjacentFaceIds.length!==2)fail('目标不是两平面公共直边');
    const [faceA,faceB]=row.adjacentFaceIds.map(id=>faces[id]);
    if(faceA.geomType!=='PLANE'||faceB.geomType!=='PLANE')fail('目标两侧不是解析平面');
    // Restrict this first family to simple support patches; holes require a
    // separate trim and exclusion analysis before a material Boolean is safe.
    const holesA=faceA.clone().innerWires(),holesB=faceB.clone().innerWires();
    try{if(holesA.length||holesB.length)fail('支撑面含孔，不能使用直边解析构造');}
    finally{[...holesA,...holesB].forEach(dispose);}
    const start=row.startPoint,end=row.endPoint,axis=unit(sub(end,start)),length=norm(sub(end,start));
    if(length<EPS||!Number.isFinite(params.radiusMm)||params.radiusMm<=0)fail('直边或半径无效','PARAM_SCHEMA_INVALID');
    const dA=faceRay(faceA,row.midpoint,axis),dB=faceRay(faceB,row.midpoint,axis);
    const nA=unit(faceA.normalAt(row.midpoint).toTuple()),nB=unit(faceB.normalAt(row.midpoint).toTuple());
    const sideA=dot(dA,nB),sideB=dot(dB,nA);
    if(Math.abs(sideA)<1e-5||Math.abs(sideB)<1e-5||sideA*sideB<=0)fail('支撑面材料侧或局部边界不明确');
    const material=sideA<0?'remove':'add';
    const cos=Math.max(-1,Math.min(1,dot(dA,dB))),theta=Math.acos(cos),sinHalf=Math.sin(theta/2);
    if(theta<Math.PI/18||theta>Math.PI*17/18||sinHalf<1e-6)fail('支撑面夹角不适合该解析构造');
    const radius=params.radiusMm,tangentDistance=radius/Math.tan(theta/2),bisector=unit(add(dA,dB));
    const center=mul(bisector,radius/sinHalf),ta=mul(dA,tangentDistance),tb=mul(dB,tangentDistance),mid=sub(center,mul(bisector,radius));
    for(const base of [start,row.midpoint,end]){
      if(!inBounds(add(base,ta),faceA)||!inBounds(add(base,tb),faceB))fail('指定半径的接点越过支撑面范围','GEOMETRY_CONFLICT');
    }
    const y=unit(cross(axis,dA));
    const to2=p=>[dot(p,dA),dot(p,y)];
    const plane=new cad.Plane(start,dA,axis);
    tool=cad.draw([0,0]).lineTo(to2(ta)).threePointsArcTo(to2(tb),to2(mid)).close().sketchOnPlane(plane).extrude(length,{extrusionDirection:axis});
    result=material==='remove'?shape.cut(tool):shape.fuse(tool);
    const output={shape:result,actualEdgeIds:[row.edgeId],contourCount:1,surfaceCount:1,
      strategy:'analytic-two-plane-prism-v1',analytic:{material,dihedralSectionDeg:theta*180/Math.PI,tangentDistanceMm:tangentDistance,radiusMm:radius}};
    result=null;return output;
  }finally{dispose(result);dispose(tool);edges.forEach(dispose);faces.forEach(dispose);}
}

// A closed circular intersection between a planar cap and its orthogonal,
// genuinely cylindrical extrusion wall. Revolving the exact section is the
// circular counterpart of the straight-edge prism above.
export function analyticPlanarCircularFillet(shape,params,plan){
  if(plan.targets.length!==1)fail('解析曲边构造要求单一闭合目标轮廓');
  const row=plan.targets[0],edges=shape.edges,faces=shape.faces,oc=cad.getOC();
  let adaptor,circle,axisValue,location,tool,result;
  try{
    const edge=edges[row.edgeId];
    if(edge.geomType!=='CIRCLE'||row.adjacentFaceIds.length!==2)fail('目标不是平面与解析拉伸侧壁的圆边');
    const pair=row.adjacentFaceIds.map(id=>faces[id]);
    const planeFace=pair.find(face=>face.geomType==='PLANE'),wallFace=pair.find(face=>face.geomType==='CYLINDRE');
    if(!planeFace||!wallFace)fail('目标不是平面与圆柱拉伸侧壁');
    const holes=planeFace.clone().innerWires();
    try{if(holes.length)fail('支撑平面含内孔，不能使用闭合曲边解析构造');}
    finally{holes.forEach(dispose);}
    adaptor=new oc.BRepAdaptor_Curve(edge.wrapped);circle=adaptor.Circle();
    location=circle.Location();axisValue=circle.Axis();
    const origin=[location.X(),location.Y(),location.Z()],directionValue=axisValue.Direction(),axis=unit([directionValue.X(),directionValue.Y(),directionValue.Z()]);
    const baseRadius=circle.Radius(),radius=params.radiusMm;
    if(!Number.isFinite(radius)||radius<=0)fail('半径无效','PARAM_SCHEMA_INVALID');
    const sweep=edge.length/baseRadius;
    if(edge.isClosed&&Math.abs(sweep-2*Math.PI)>1e-6)fail('闭合圆边的解析角度不一致');
    if(!edge.isClosed&&(sweep<1e-5||sweep>=2*Math.PI-1e-5))fail('开放圆弧的解析角度无效');
    const pointValue=edge.pointAt(.2),point=pointValue.toTuple();dispose(pointValue);
    const radial=unit(sub(point,origin));
    if(Math.abs(dot(radial,axis))>1e-5)fail('圆边平面与圆柱轴不正交');
    // Project the planar patch interior onto the local radial direction.
    // An open sector's face centroid is not collinear with each arc point.
    const radialProjection=dot(sub(planeFace.center.toTuple(),point),radial);
    if(Math.abs(radialProjection)<1e-6)fail('圆弧支撑面内侧不明确');
    const radialSign=Math.sign(radialProjection),dP=mul(radial,radialSign);
    const centerWall=wallFace.center.toTuple(),towardWall=sub(centerWall,point),dC=unit(mul(axis,dot(towardWall,axis)));
    if(!Number.isFinite(dC[0])||Math.abs(dot(dP,dC))>1e-5)fail('支撑面不是正交规则拉伸');
    const nP=unit(planeFace.normalAt(point).toTuple()),nC=unit(wallFace.normalAt(point).toTuple());
    if(Math.abs(Math.abs(dot(nC,radial))-1)>1e-5)fail('圆柱壁法向不是圆弧径向');
    const sideP=dot(dP,nC),sideC=dot(dC,nP);
    if(Math.abs(sideP)<1e-5||Math.abs(sideC)<1e-5||sideP*sideC<=0)fail('圆边两侧材料语义不一致');
    const material=sideP<0?'remove':'add';
    if(baseRadius+radius*dot(dP,radial)<=EPS)fail('内向接点越过回转轴','GEOMETRY_CONFLICT');
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
      const localRadial=unit(sub(p,origin)),localDP=mul(localRadial,radialSign),localNC=unit(wallFace.normalAt(p).toTuple());
      if(Math.abs(Math.abs(dot(localNC,localRadial))-1)>1e-5||Math.sign(dot(sub(planeFace.center.toTuple(),p),localRadial))!==radialSign)fail('圆弧沿程支撑方向不一致');
      if(!inBounds(add(p,mul(localDP,radius)),planeFace)||!inBounds(add(p,mul(dC,radius)),wallFace))fail('指定半径的圆边接点越过支撑面范围','GEOMETRY_CONFLICT');
    }
    const startDP=mul(startRadial,radialSign),bisector=unit(add(startDP,dC)),circleCenter=mul(bisector,radius*Math.SQRT2),ta=mul(startDP,radius),tb=mul(dC,radius),mid=sub(circleCenter,mul(bisector,radius));
    const as2=p=>[baseRadius+dot(p,startRadial),dot(p,axis)];
    const plane=new cad.Plane(origin,startRadial,unit(cross(startRadial,axis)));
    tool=cad.draw([baseRadius,0]).lineTo(as2(ta)).threePointsArcTo(as2(tb),as2(mid)).close().sketchOnPlane(plane).revolve(axis,{origin,...(angle===undefined?{}:{angle})});
    result=material==='remove'?shape.cut(tool):shape.fuse(tool);
    const output={shape:result,actualEdgeIds:[row.edgeId],contourCount:1,surfaceCount:1,
      strategy:edge.isClosed?'analytic-planar-circle-revolve-v1':'analytic-planar-arc-revolve-v1',analytic:{material,sourceCircleRadiusMm:baseRadius,radiusMm:radius,sweepAngleDeg:angle??360,termination:edge.isClosed?'closed':'radial-plane-caps'}};
    result=null;return output;
  }finally{[adaptor,circle,axisValue,location,tool,result].forEach(dispose);edges.forEach(dispose);faces.forEach(dispose);}
}

export function analyticConstantFillet(shape,params,plan){
  if(plan.targets.length!==1)fail('解析备用路线要求一个完整目标轮廓');
  const edges=shape.edges;
  let type;
  try{type=edges[plan.targets[0].edgeId].geomType;}
  finally{edges.forEach(dispose);}
  if(type==='LINE')return analyticStraightPlanarFillet(shape,params,plan);
  if(type==='CIRCLE')return analyticPlanarCircularFillet(shape,params,plan);
  fail('目标边不属于已验证的解析构造族');
}
