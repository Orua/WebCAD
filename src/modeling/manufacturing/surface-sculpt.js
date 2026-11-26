const AREA_TOLERANCE=1e-9;
const EDGE_PADDING=0.00035;
const PICK_TOLERANCE_MM=0.08;
const MAX_POLES=100000;

const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const scale=(a,k)=>a.map(x=>x*k);
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const norm=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const lerp=(a,b,t)=>a.map((x,i)=>x+t*(b[i]-x));
const unit=a=>scale(a,1/norm(a));
const xyz=p=>[p.X(),p.Y(),p.Z()];
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const ease=x=>{const t=clamp(x,0,1);return t*t*t*(10+t*(-15+6*t));};

function distanceToSegment(point,a,b){
  const edge=sub(b,a), d=dot(edge,edge);
  return norm(sub(point,lerp(a,b,d>0?clamp(dot(sub(point,a),edge)/d,0,1):0)));
}

function inside(point,segments){
  const [x,y]=point;
  let hit=false;
  for(const {a,b} of segments)if((a[1]>y)!==(b[1]>y)&&x<a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]))hit=!hit;
  return hit;
}

function orient(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function crosses(a,b,c,d){
  const side=(a,b,p)=>Math.abs(orient(a,b,p))<1e-10&&p.every((value,i)=>value>=Math.min(a[i],b[i])-1e-10&&value<=Math.max(a[i],b[i])+1e-10);
  return (orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0)||side(a,b,c)||side(a,b,d)||side(c,d,a)||side(c,d,b);
}

function trimCoordinates(bounds){
  const u0=bounds.UMin,u1=bounds.UMax,v0=bounds.VMin,v1=bounds.VMax;
  if(![u0,u1,v0,v1].every(Number.isFinite)||u1<=u0||v1<=v0)fail('SCULPT_UNSUPPORTED_FACE','选面没有有效的裁剪参数域');
  return {local:([u,v])=>[(u-u0)/(u1-u0),(v-v0)/(v1-v0)],real:([u,v])=>[u0+u*(u1-u0),v0+v*(v1-v0)],u0,u1,v0,v1};
}

function evaluator(surface,transform,oc){
  return {
    point(uv){const p=surface.Value(...uv);try{p.Transform(transform);return xyz(p);}finally{p.delete();}},
    frame(uv){
      const p=new oc.gp_Pnt(),du=new oc.gp_Vec(),dv=new oc.gp_Vec();
      try{surface.D1(...uv,p,du,dv);du.Transform(transform);dv.Transform(transform);return {u:xyz(du),normal:cross(xyz(du),xyz(dv))};}
      finally{p.delete();du.delete();dv.delete();}
    }
  };
}

function traceSegment(read,t0,t1,a,b,depth,result){
  const mid=(t0+t1)/2,m=read(mid);
  if(depth<10&&(norm(sub(a.p,b.p))>0.40||distanceToSegment(m.a,a.a,b.a)>0.000045)){
    traceSegment(read,t0,mid,a,m,depth+1,result);traceSegment(read,mid,t1,m,b,depth+1,result);return;
  }
  result.push({a:a.a,b:b.a,pa:a.p,pb:b.p,probe:m.a});
}

function trimSegments(face,evaluate,chart,oc){
  const edges=face.edges,segments=[];
  try{
    for(const edge of edges){
      if(oc.BRep_Tool.Degenerated(edge.wrapped))continue;
      const adaptor=new oc.BRepAdaptor_Curve2d(edge.wrapped,face.wrapped);
      try{
        const read=t=>{const point=adaptor.Value(t);try{const uv=[point.X(),point.Y()];return {a:chart.local(uv),p:evaluate.point(uv)};}finally{point.delete();}};
        const start=adaptor.FirstParameter(),end=adaptor.LastParameter();
        if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)fail('SCULPT_UNSUPPORTED_FACE','选面的共边参数无效');
        for(let i=0;i<12;i++){
          const a=start+(end-start)*i/12,b=start+(end-start)*(i+1)/12;
          traceSegment(read,a,b,read(a),read(b),0,segments);
        }
        if(segments.length>8192)fail('SCULPT_CAPACITY','选面的边界过于复杂');
      }finally{adaptor.delete();}
    }
    if(!segments.length)fail('SCULPT_UNSUPPORTED_FACE','选面没有可保护的裁剪边界');
    return {segments,edges:edges.length};
  }finally{edges.forEach(edge=>edge.delete());}
}

function project(points,surface,chart,inverse,trim,oc){
  return points.map(point=>{
    const p=new oc.gp_Pnt(...point);
    p.Transform(inverse);
    const probe=new oc.GeomAPI_ProjectPointOnSurf(p,surface,chart.u0,chart.u1,chart.v0,chart.v1,1e-8);
    try{
      if(!probe.NbPoints()||probe.LowerDistance()>PICK_TOLERANCE_MM)fail('SCULPT_OUTSIDE_FACE','定位点不在当前选面上，请重新点选');
      const {U,V}=probe.LowerDistanceParameters(),uv=chart.local([U,V]);
      if(!inside(uv,trim))fail('SCULPT_OUTSIDE_FACE','定位点必须在面轮廓内和孔圈外');
      return uv;
    }finally{probe.delete();p.delete();}
  });
}

function polygonScope(points,trim,evaluate,chart){
  const segments=points.map((a,i)=>({a,b:points[(i+1)%points.length]}));
  if(points.some((p,i)=>points.some((q,j)=>i<j&&norm(sub(p,q))<1e-6)))fail('SCULPT_INVALID_REGION','圈区点不能重合');
  let area=0,weighted=[0,0];
  for(let i=0;i<segments.length;i++){
    const {a,b}=segments[i], twice=a[0]*b[1]-a[1]*b[0];
    area+=twice;weighted=add(weighted,scale(add(a,b),twice));
    if(trim.some(line=>crosses(a,b,line.a,line.b)))fail('SCULPT_INVALID_REGION','圈区跨越瓣缘或内孔的边界');
    for(let j=i+2;j<segments.length;j++){
      if(i===0&&j===segments.length-1)continue;
      if(crosses(a,b,segments[j].a,segments[j].b))fail('SCULPT_INVALID_REGION','圈区边界不能自交');
    }
  }
  if(Math.abs(area)<AREA_TOLERANCE)fail('SCULPT_INVALID_REGION','圈区没有有效面积');
  let center=scale(weighted,1/(3*area));
  if(!inside(center,segments)){
    const y=points.map(p=>p[1]).sort((a,b)=>a-b);
    let width=0;
    for(let i=1;i<y.length;i++){
      if(y[i]-y[i-1]<1e-10)continue;
      const h=(y[i]+y[i-1])/2;
      const intersections=segments.filter(({a,b})=>(a[1]>h)!==(b[1]>h)).map(({a,b})=>a[0]+(b[0]-a[0])*(h-a[1])/(b[1]-a[1])).sort((a,b)=>a-b);
      for(let j=0;j+1<intersections.length;j+=2)if(intersections[j+1]-intersections[j]>width){
        width=intersections[j+1]-intersections[j];center=[(intersections[j]+intersections[j+1])/2,h];
      }
    }
  }
  const boundary=[];
  for(const {a,b} of segments){
    const read=t=>{const p=lerp(a,b,t);return {a:p,p:evaluate.point(chart.real(p))};};
    traceSegment(read,0,1,read(0),read(1),0,boundary);
  }
  return {center,distance:(uv,p)=>inside(uv,segments)?0:Math.min(...boundary.map(({pa,pb})=>distanceToSegment(p,pa,pb)))};
}

function directionFor(params,frame,orientation){
  const normal=scale(unit(frame.normal),orientation);
  if(params.kind==='normal')return normal;
  if(params.kind==='vector'){
    if(norm(params.vector)<1e-9)fail('PARAM_RANGE_INVALID','三维方向向量不能为零');
    return unit(params.vector);
  }
  const u=unit(frame.u),v=cross(normal,u),tilt=params.tiltDeg*Math.PI/180,azimuth=params.azimuthDeg*Math.PI/180;
  return add(scale(normal,Math.cos(tilt)),scale(add(scale(u,Math.cos(azimuth)),scale(v,Math.sin(azimuth))),Math.sin(tilt)));
}

function axis(surface,label){
  const knots=[],repeated=[];
  for(let i=1;i<=surface[`Nb${label}Knots`]();i++){
    const x=surface[`${label}Knot`](i);knots.push(x);
    for(let count=surface[`${label}Multiplicity`](i);count>0;count--)repeated.push(x);
  }
  const degree=surface[`${label}Degree`](),count=surface[`Nb${label}Poles`]();
  const poles=Array.from({length:count},(_,i)=>({id:i+1,min:repeated[i],max:repeated[i+degree+1],
    center:repeated.slice(i+1,i+degree+1).reduce((sum,x)=>sum+x,0)/degree}));
  return {knots,poles};
}

function refinement(surface,label,source,chart,spacing){
  const f=(x,y)=>chart.real(label==='U'?[x,y]:[y,x]);
  const lengths=[.15,.5,.85].map(y=>{
    const p=Array.from({length:17},(_,i)=>source.point(f(i/16,y)));
    return p.slice(1).reduce((sum,x,i)=>sum+norm(sub(x,p[i])),0);
  });
  const segments=Math.max(10,Math.ceil(Math.max(...lengths)/spacing));
  if(segments>240)fail('SCULPT_CAPACITY','影响范围相对于选中面太小');
  const start=f(0,.5)[label==='U'?0:1],finish=f(1,.5)[label==='U'?0:1],width=(finish-start)/segments;
  const knots=axis(surface,label).knots;
  return Array.from({length:segments-1},(_,i)=>start+(i+1)*width).filter(x=>
    x>knots[0]+1e-10&&x<knots.at(-1)-1e-10&&knots.every(k=>Math.abs(k-x)>width*0.42));
}

function lockedBox(lo,hi,trim){
  if(lo.some(x=>x<EDGE_PADDING)||hi.some(x=>x>1-EDGE_PADDING))return false;
  return !trim.some(({a,b})=>lo.every((x,i)=>Math.max(a[i],b[i])>=x-EDGE_PADDING&&Math.min(a[i],b[i])<=hi[i]+EDGE_PADDING));
}

function selectPoles(surface,scope,source,chart,trim,influence){
  const picks=[],guardWidth=Math.max(.20,Math.min(influence*.32,.9));
  const us=axis(surface,'U').poles,vs=axis(surface,'V').poles;
  for(const u of us)for(const v of vs){
    const low=chart.local([u.min,v.min]),high=chart.local([u.max,v.max]),uv=[u.center,v.center],normalized=chart.local(uv);
    if(!inside(normalized,trim)||!lockedBox(low,high,trim))continue;
    const p=source.point(uv),d=scope.distance(normalized,p);
    if(d>=influence)continue;
    let clearance=guardWidth;
    for(const {pa,pb} of trim)clearance=Math.min(clearance,distanceToSegment(p,pa,pb));
    const weight=ease(1-d/influence)*ease(clearance/guardWidth);
    if(weight<=1e-8)continue;
    const pole=surface.Pole(u.id,v.id);
    try{picks.push({u:u.id,v:v.id,point:xyz(pole),weight,low,high});}finally{pole.delete();}
  }
  return picks;
}

function checkBoundaries(trim,source,result,chart){
  let drift=0, normalDrift=0;
  for(const {probe} of trim){
    const uv=chart.real(probe);
    drift=Math.max(drift,norm(sub(source.point(uv),result.point(uv))));
    const a=source.frame(uv).normal,b=result.frame(uv).normal;
    if(norm(a)>1e-9&&norm(b)>1e-9)normalDrift=Math.max(normalDrift,Math.atan2(norm(cross(a,b)),dot(a,b))*180/Math.PI);
  }
  if(drift>0.00001||normalDrift>0.001)fail('SCULPT_BOUNDARY_CHANGED','共边的位置或切平面发生变化，已保留原件');
  return {maxBoundaryDriftMm:drift,maxBoundaryNormalDriftDeg:normalDrift};
}

function checkFold(poles,trim,source,result,chart){
  const lo=[0,1].map(i=>poles.reduce((n,p)=>Math.min(n,p.low[i]),1));
  const hi=[0,1].map(i=>poles.reduce((n,p)=>Math.max(n,p.high[i]),0));
  let min=1;
  for(let i=0;i<=24;i++)for(let j=0;j<=24;j++){
    const point=[lo[0]+(hi[0]-lo[0])*i/24,lo[1]+(hi[1]-lo[1])*j/24];
    if(!inside(point,trim))continue;
    const uv=chart.real(point),a=source.frame(uv).normal,b=result.frame(uv).normal;
    const area=dot(a,a);if(area>1e-16)min=Math.min(min,dot(a,b)/area);
  }
  if(min<=0.04)fail('SCULPT_FOLD','局部位移会翻折曲面，请减小位移或增大过渡范围');
  return min;
}

// The caller owns an isolated BRep. Trim p-curves and 3D edge geometry keep
// their original support data. Only poles whose basis support clears every
// boundary of the selected face can move.
export function buildSurfaceSculpt(isolated,params,oc){
  const faces=isolated.faces,owned=[],hold=value=>{owned.push(value);return value;};
  try{
    const face=faces[params.faceId];
    if(!face||face.geomType!=='BSPLINE_SURFACE')fail('SCULPT_UNSUPPORTED_FACE','请选择已有 STEP 的 B 样条曲面');
    const location=hold(new oc.TopLoc_Location());
    const surface=hold(oc.BRep_Tool.Surface(face.wrapped,location));
    if(typeof surface.InsertUKnot!=='function'||surface.IsUPeriodic()||surface.IsVPeriodic()||surface.UDegree()<3||surface.VDegree()<3)
      fail('SCULPT_UNSUPPORTED_FACE','该工具需要非周期、至少三次的 B 样条曲面');
    const otherLocation=hold(new oc.TopLoc_Location());
    for(const other of faces){
      if(other===face)continue;
      const support=oc.BRep_Tool.Surface(other.wrapped,otherLocation);
      try{if(surface.isAliasOf(support))fail('SCULPT_UNSUPPORTED_FACE','该面与邻面共用同一个曲面支撑，无法独立变形');}
      finally{support?.delete();}
    }
    const transform=hold(location.Transformation()),inverse=hold(transform.Inverted());
    const original=hold(new oc.Geom_BSplineSurface(surface)),before=evaluator(original,transform,oc),after=evaluator(surface,transform,oc);
    const chart=trimCoordinates(oc.BRepTools.UVBounds(face.wrapped));
    const {segments,edges}=trimSegments(face,before,chart,oc);
    const inputs=params.scope.kind==='point'?[params.scope.pointMm]:params.scope.pointsMm;
    const points=project(inputs,original,chart,inverse,segments,oc);
    const pointOrigin=params.scope.kind==='point'?before.point(chart.real(points[0])):null;
    const scope=pointOrigin?{center:points[0],distance:(_,p)=>norm(sub(p,pointOrigin))}:
      polygonScope(points,segments,before,chart);
    const uv=chart.real(scope.center),anchor=before.point(uv),frame=before.frame(uv);
    if(norm(frame.normal)<1e-8||norm(frame.u)<1e-8)fail('SCULPT_OUTSIDE_FACE','所选位置的切平面不稳定');
    const orientation=face.wrapped.Orientation()===oc.TopAbs_Orientation.TopAbs_REVERSED?-1:1;
    const vector=directionFor(params.direction,frame,orientation);
    const local=hold(new oc.gp_Vec(...vector));local.Transform(inverse);
    const localDirection=xyz(local),spacing=clamp(params.influenceMm/9,.07,.6);
    const uKnots=refinement(surface,'U',before,chart,spacing),vKnots=refinement(surface,'V',before,chart,spacing);
    if((surface.NbUPoles()+uKnots.length)*(surface.NbVPoles()+vKnots.length)>MAX_POLES)
      fail('SCULPT_CAPACITY','选面的控制网超过局部变形容量');
    for(const u of uKnots)surface.InsertUKnot(u,1,1e-10,false);
    for(const v of vKnots)surface.InsertVKnot(v,1,1e-10,false);
    const poles=selectPoles(surface,scope,before,chart,segments,params.influenceMm);
    if(poles.length<1)fail('SCULPT_DISPLACEMENT_UNMET','定位太靠近锁定边界，或影响范围内没有可移动控制点');
    const apply=amount=>{
      for(const pole of poles){
        const p=new oc.gp_Pnt(...add(pole.point,scale(localDirection,amount*pole.weight)));
        try{surface.SetPole(pole.u,pole.v,p);}finally{p.delete();}
      }
    };
    apply(params.amountMm);
    const actual=dot(sub(after.point(uv),anchor),vector),ratio=params.amountMm/actual;
    if(!Number.isFinite(ratio)||ratio<=0||ratio>1.55)fail('SCULPT_DISPLACEMENT_UNMET','影响区不足以达到设定位移，请扩大范围或将位置移离锁定边界');
    if(Math.abs(ratio-1)>1e-6)apply(params.amountMm*ratio);
    const movedPoint=after.point(uv),displacement=dot(sub(movedPoint,anchor),vector);
    if(Math.abs(displacement-params.amountMm)>0.002)fail('SCULPT_DISPLACEMENT_UNMET','变形量未达到设定值');
    const boundary=checkBoundaries(segments,before,after,chart),minJacobian=checkFold(poles,segments,before,after,chart);
    oc.BRepTools.Clean(isolated.wrapped);
    const result=isolated.clone();
    result.surfaceSculptReport={sourceFaceId:params.faceId,scope:params.scope.kind,direction:vector,
      requestedDisplacementMm:params.amountMm,actualDisplacementMm:displacement,influenceMm:params.influenceMm,
      sourcePointMm:anchor,resultPointMm:movedPoint,sourceUV:uv,changedControlPoints:poles.length,
      lockedBoundaryEdgeCount:edges,sampledBoundaryPoints:segments.length,minSampledOrientationJacobian:minJacobian,...boundary};
    return result;
  }finally{owned.reverse().forEach(value=>value?.delete());faces.forEach(face=>face.delete());}
}
