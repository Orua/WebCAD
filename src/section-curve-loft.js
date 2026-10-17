// Ordered, orientation-aware solid lofts. All generated profiles use a stable
// cyclic correspondence so OpenCascade cannot silently rotate a section seam.
const dispose=v=>{try{v?.delete?.()}catch{}};
const point=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const norm=v=>Math.hypot(...v);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=norm(v);if(n<1e-10)throw new Error('方向向量不得为零');return v.map(x=>x/n)};
const rotate=(v,axis,angle)=>{const c=Math.cos(angle),s=Math.sin(angle),d=dot(axis,v);return v.map((x,i)=>x*c+cross(axis,v)[i]*s+axis[i]*d*(1-c))};
function fail(code,message,report){throw Object.assign(new Error(message),{code,report});}
function profilePoints(station,count=64){
 const p=station.profile??{kind:'ellipse'},kind=p.kind??'ellipse',w=station.widthMm,d=station.depthMm;
 if(kind==='ellipse')return Array.from({length:count},(_,i)=>{const t=2*Math.PI*i/count;return [w/2*Math.cos(t),d/2*Math.sin(t)];});
 if(kind==='superellipse'){
  const e=p.exponent;if(!Number.isFinite(e)||e<2||e>8)throw new Error('superellipse exponent 须为 2–8');
  const q=2/e;return Array.from({length:count},(_,i)=>{const t=2*Math.PI*i/count;return [w/2*Math.sign(Math.cos(t))*Math.abs(Math.cos(t))**q,d/2*Math.sign(Math.sin(t))*Math.abs(Math.sin(t))**q];});
 }
 if(kind==='asymmetric'){
  const up=p.depthUpMm??d/2,down=p.depthDownMm??d/2,left=p.widthLeftMm??w/2,right=p.widthRightMm??w/2;
  if([up,down,left,right].some(x=>!Number.isFinite(x)||x<=0))throw new Error('asymmetric 截面四个半尺寸必须为正');
  return Array.from({length:count},(_,i)=>{const t=2*Math.PI*i/count,c=Math.cos(t),s=Math.sin(t);return [c<0?left*c:right*c,s<0?down*s:up*s];});
 }
 if(kind==='airfoil'){
  const spec=typeof p.naca==='string'?{thicknessPct:Number(p.naca.slice(-2)),camberPct:Number(p.naca[0]),camberPosPct:Number(p.naca[1])*10}:p.naca??{};
  const thick=spec.thicknessPct,camber=spec.camberPct??0,pos=(spec.camberPosPct??0)/100;
  if(!Number.isFinite(thick)||thick<=0||thick>40||!Number.isFinite(camber)||camber<0||camber>20||!Number.isFinite(pos)||pos<0||pos>1)throw new Error('airfoil 须使用有效 NACA 四位数或厚度/弯度参数');
  const upper=[],lower=[],n=count/2;
  for(let i=0;i<=n;i++){const x=(1-Math.cos(Math.PI*i/n))/2,yt=5*thick/100*w*(.2969*Math.sqrt(x)-.1260*x-.3516*x*x+.2843*x**3-.1015*x**4);let yc=0,dy=0;if(camber&&pos>0){if(x<pos){yc=camber/100/(pos*pos)*(2*pos*x-x*x)*w;dy=2*camber/100/(pos*pos)*(pos-x);}else{yc=camber/100/((1-pos)**2)*((1-2*pos)+2*pos*x-x*x)*w;dy=2*camber/100/((1-pos)**2)*(pos-x);}}const a=Math.atan(dy);upper.push([w*(x-yt*Math.sin(a)),yc+yt*Math.cos(a)]);lower.push([w*(x+yt*Math.sin(a)),yc-yt*Math.cos(a)]);}
  const pts=[...upper.toReversed(),...lower.slice(1,-1)];return resampleClosed(pts,count);
 }
 if(kind==='spline'){
  if(!Array.isArray(p.points2d)||p.points2d.length<3||p.points2d.length>128||p.closed!==true||!p.points2d.every(a=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite)))throw new Error('spline 截面需要 3–128 个有限 points2d 且 closed:true');
  return resampleClosed(p.points2d,count);
 }
 throw new Error(`不支持的截面类型：${kind}`);
}
function resampleClosed(points,count){
 const pts=points.slice();if(pts.length>1&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<1e-10)pts.pop();
 const lengths=pts.map((p,i)=>Math.hypot(pts[(i+1)%pts.length][0]-p[0],pts[(i+1)%pts.length][1]-p[1]));const total=lengths.reduce((a,b)=>a+b,0);if(total<1e-9)throw new Error('截面轮廓长度为零');
 return Array.from({length:count},(_,i)=>{let target=total*i/count,j=0;while(target>lengths[j])target-=lengths[j++];const a=pts[j],b=pts[(j+1)%pts.length],f=target/lengths[j];return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];});
}
function areaOf(points){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p[0]*q[1]-q[0]*p[1];}return Math.abs(a)/2;}
function makeWire(station,points,cad,held){
 const plane=held(new cad.Plane(station.centerMm,station.widthDirection,station.normal));
 const pen=held(cad.draw(points[0]));for(let i=1;i<points.length;i++)pen.lineTo(points[i]);
 const drawing=held(pen.close()),sketch=held(drawing.sketchOnPlane(plane));return sketch.wire;
}
function makeEllipseWire(station,cad,held){
 const plane=held(new cad.Plane(station.centerMm,station.widthDirection,station.normal));
 const drawing=held(cad.drawEllipse(station.widthMm/2,station.depthMm/2));
 const sketch=held(drawing.sketchOnPlane(plane));return sketch.wire;
}
function capShape(cap){return cap??{kind:'flat'};}
function expandCaps(stations,params){
 let list=stations.map(s=>({...s}));
 for(const side of ['start','end']){
  const cap=capShape(params[`${side}Cap`]);if(!['flat','point','round'].includes(cap.kind))throw new Error(`${side}Cap.kind 须为 flat、point 或 round`);
  if(cap.kind==='round'){
   const length=cap.lengthMm;if(!Number.isFinite(length)||length<=0)throw new Error(`${side}Cap.lengthMm 必须为正`);
   const end=list[side==='start'?0:list.length-1],sign=side==='start'?-1:1;
   const added=[[.25,.88],[.55,.62],[.82,.3]].map(([fraction,scale])=>({...end,centerMm:end.centerMm.map((v,i)=>v+sign*length*fraction*end.normal[i]),widthMm:end.widthMm*scale,depthMm:end.depthMm*scale,profile:end.profile}));
   if(side==='start')list=[...added.toReversed(),...list];else list.push(...added);
  }
 }
 return list;
}
export function buildSectionCurveLoft(params,cad){
 let stations=params.stations;
 if(!Array.isArray(stations)||stations.length<2||stations.length>64)throw new Error('多截面模式需要 2–64 个有序截面');
 if(params.closed===true)throw new Error('多截面模式暂不支持闭环');
 if(!['error','warn','off',undefined].includes(params.volumeCheck))throw new Error('volumeCheck 须为 error、warn 或 off');
 if(params.guides?.length)fail('LOFT_GUIDE_UNSUPPORTED','当前 OCCT ThruSections 构建不支持按导轨约束曲面；未生成近似冒充结果',{capability:'guided-loft',supported:false});
 if(params.matchTo)fail('CONTINUITY_UNSUPPORTED','当前特征接口不能读取相邻放样面的边界几何，matchTo 接续校验未执行',{capability:'cross-feature-continuity',supported:false});
 for(const side of ['start','end'])if((params[`${side}Condition`]??'G0')!=='G0')fail('CONTINUITY_UNSUPPORTED',`当前 OCCT ThruSections 不提供 ${side} 端 ${params[`${side}Condition`]} 曲面连续性约束；请使用 G0`,{side,requested:params[`${side}Condition`],supported:['G0'],curvatureContinuity:false});
 const degree=params.loftDegree??8;if(!Number.isInteger(degree)||degree<2||degree>8)throw new Error('放样最高次数须为 2–8 的整数');
 const orthogonalizedStations=[];let priorNormal=null;
 const prepared=stations.map((s,i)=>{
  if(!point(s.centerMm)||!point(s.normal)||!point(s.widthDirection))throw new Error(`截面 ${i} 的中心、法向及料宽方向必须是有限 XYZ`);
  if(!(Number.isFinite(s.widthMm)&&s.widthMm>0&&Number.isFinite(s.depthMm)&&s.depthMm>0))throw new Error(`截面 ${i} 的宽深必须为正`);
  let normal=unit(s.normal);const directionSign=priorNormal&&dot(normal,priorNormal)<0?-1:1;if(directionSign<0)normal=normal.map(v=>-v);priorNormal=normal;
  const raw=unit(s.widthDirection),cos=dot(normal,raw),correction=Math.asin(Math.min(1,Math.abs(cos)))*180/Math.PI;
  if(correction>5)throw new Error(`截面 ${i} 法向与料宽方向偏差 ${correction.toFixed(3)}°，超过 5°`);
  const widthDirection=unit(raw.map((v,j)=>v-cos*normal[j]));if(correction>1e-6)orthogonalizedStations.push({i,correctionDeg:correction});
  const startAngleDeg=s.startAngleDeg??params.seamAngleDeg??0;if(!Number.isFinite(startAngleDeg))throw new Error(`截面 ${i} startAngleDeg 必须为有限角度`);
  const x=unit(rotate(widthDirection,normal,startAngleDeg*Math.PI/180));
  if(i&&Math.hypot(...s.centerMm.map((v,j)=>v-stations[i-1].centerMm[j]))<1e-6)throw new Error('相邻截面中心不得重合');
  return {...s,normal,widthDirection:x,startAngleDeg,directionSign};
 });
 const resolved=expandCaps(prepared,params);
 const held=[],hold=v=>{held.push(v);return v;};let result;
 try{
  const sampled=resolved.map(s=>profilePoints(s));
  const wires=resolved.map((s,i)=>(s.profile?.kind??'ellipse')==='ellipse'?makeEllipseWire(s,cad,hold):makeWire(s,sampled[i],cad,hold));
  const builder=hold(new (cad.getOC().BRepOffsetAPI_ThruSections)(true,false,1e-6));builder.SetMaxDegree(degree);
  if(typeof builder.CheckCompatibility==='function')builder.CheckCompatibility(params.autoAlign!==false);
  const addPoint=(side)=>{
    const source=side==='start'?stations[0]:stations.at(-1),cap=capShape(params[`${side}Cap`]);
    const sign=side==='start'?-1:1,roundLength=cap.kind==='round'?cap.lengthMm:0,step=roundLength||Math.max(1e-4,Math.hypot(...stations.at(side==='start'?1:-2).centerMm.map((v,i)=>v-source.centerMm[i]))*.5);
    const inferred=source.centerMm.map((v,i)=>v+sign*step*source.normal[i]);const p=cap.pointMm??inferred;if(!point(p))throw new Error(`${side}Cap.pointMm 必须是有限 XYZ`);
    if(typeof builder.AddVertex!=='function'||typeof cad.makeVertex!=='function')fail('LOFT_POINT_CAP_UNSUPPORTED','当前 OCCT 构建没有 AddVertex/makeVertex，无法生成点收尾',{capability:'AddVertex',supported:false});
    const vertex=hold(cad.makeVertex(p));if(side==='start')builder.AddVertex(vertex.wrapped);
    else builder.AddVertex(vertex.wrapped);
  };
  if(['point','round'].includes(capShape(params.startCap).kind))addPoint('start');
  wires.forEach(w=>builder.AddWire(w.wrapped));
  if(['point','round'].includes(capShape(params.endCap).kind))addPoint('end');
  builder.Build();result=cad.cast(builder.Shape());
  const analyzer=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false));if(!analyzer.IsValid())throw new Error('多截面放样拓扑无效，请检查截面顺序、自交及宽深');
  const solids=result.solids;let volume;try{if(solids.length!==1)throw new Error('多截面放样须得到一个实体');volume=cad.measureVolume(result);if(volume<=1e-9)throw new Error('多截面放样须得到一个正体积实体');}finally{solids.forEach(dispose)}
  let estimate=0;for(let i=0;i<resolved.length-1;i++){const a=sampled[i],b=sampled[i+1],dist=Math.hypot(...resolved[i+1].centerMm.map((v,j)=>v-resolved[i].centerMm[j]));const tangent=unit(resolved[i+1].centerMm.map((v,j)=>v-resolved[i].centerMm[j]));const projected=Math.abs(dot(tangent,unit(resolved[i].normal.map((v,j)=>v+resolved[i+1].normal[j]))));estimate+=(areaOf(a)+areaOf(b))/2*dist*Math.max(projected,.05);}
  const ratio=estimate>1e-12?volume/estimate:null;let suspectStations=[];
  if(resolved.length>2){const turns=resolved.slice(1,-1).map((s,j)=>{const a=unit(resolved[j+1].centerMm.map((v,k)=>v-resolved[j].centerMm[k])),b=unit(resolved[j+2].centerMm.map((v,k)=>v-resolved[j+1].centerMm[k]));return {i:j+1,angleDeg:Math.acos(Math.max(-1,Math.min(1,dot(a,b))))*180/Math.PI};}).sort((a,b)=>b.angleDeg-a.angleDeg);suspectStations=turns.slice(0,3).filter(x=>x.angleDeg>0).map(x=>x.i);}
  const mismatch=ratio!==null&&(ratio<.85||ratio>1.15),report={volumeMm3:volume,estimatedVolumeMm3:estimate,ratio,suspectStations,stationsResolved:resolved.map((s,i)=>({i,startAngleDeg:s.startAngleDeg,directionSign:s.directionSign,profileKind:s.profile?.kind??'ellipse'})),orthogonalizedStations,autoAlign:params.autoAlign!==false,warning:resolved.length>=32?{code:'LOFT_COMPLEXITY',stationCount:resolved.length,degree}:null};
  if(mismatch){report.warning={code:'LOFT_VOLUME_MISMATCH',ratio,estimatedVolumeMm3:estimate,volumeMm3:volume,suspectStations};if((params.volumeCheck??'warn')==='error')fail('LOFT_VOLUME_MISMATCH',`放样体积与截面估算不一致（ratio=${ratio.toFixed(3)}）`,report);}
  if(params.volumeCheck==='off')report.warning=null;
  result.loftReport=report;const complete=result;result=null;return complete;
 }catch(error){if(error?.report)throw error;throw Object.assign(error,{report:{orthogonalizedStations,stationsResolved:prepared.map((s,i)=>({i,startAngleDeg:s.startAngleDeg,directionSign:s.directionSign}))}});}
 finally{dispose(result);held.reverse().forEach(dispose);}
}
