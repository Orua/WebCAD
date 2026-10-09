import {validateProfile} from './modeling/profiles/profile-model.js';
import {inspectProfileModel} from './modeling/profiles/profile-inspection.js';

const fail=message=>{throw Object.assign(new Error(message),{code:'VECTOR_INVALID'});};
const TAU=2*Math.PI,dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const point=p=>{const a=Array.isArray(p)?p:[p?.x,p?.y,p?.z];if(!a.slice(0,2).every(Number.isFinite)||a.length<2||a.length>3||(a[2]!==undefined&&(!Number.isFinite(a[2])||Math.abs(a[2])>1e-7)))fail('只接受 XY 平面二维矢量，不能丢弃非零 Z');return a.slice(0,2);};
const at=(c,r,a)=>[c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)];
// Preserve the source evidence even when the current sketch builder cannot use it.
export function sourceSplineDescriptor(e,{scaleMm=1}={}){
 const readPoints=value=>{if(value===undefined)return undefined;if(!Array.isArray(value)||value.length>2000)fail('样条源点超过 2000 点预算');return value.map(p=>{const v=Array.isArray(p)?p:[p.x,p.y,p.z??0];if(v.length<2||v.length>3||v.some(n=>!Number.isFinite(n)))fail('样条源点无效');return v.map(n=>n*scaleMm);});};
 const controlPoints=readPoints(e.controlPoints??e.ctrl_pts),fitPoints=readPoints(e.fitPoints??e.fit_pts);
 const degree=e.degree??e.degreeOfSplineCurve,knots=e.knots??e.knotValues,weights=e.weights;
 for(const list of [knots,weights])if(list!==undefined&&(!Array.isArray(list)||list.length>4000||list.some(v=>!Number.isFinite(v))))fail('样条节点或权重无效');
 if(degree!==undefined&&(!Number.isInteger(degree)||degree<1||degree>25))fail('样条次数无效');
 const fitTolerance=e.fitTolerance??e.fit_tol;if(fitTolerance!==undefined&&(!Number.isFinite(fitTolerance)||fitTolerance<0))fail('样条拟合公差无效');
 const complete=!!(degree&&controlPoints?.length&&knots?.length);
 const tangent=value=>value===undefined?undefined:readPoints([value])[0];
 const flags=e.flag??e.flags;
 return {representation:complete?'nurbs-parameters':fitPoints?.length?'fit-points':'incomplete-spline',sourceHandle:String(e.handle??''),units:'mm',degree,controlPoints,knots:knots&&[...knots],weights:weights&&[...weights],periodic:e.periodic??e.isPeriodic??(flags===undefined?null:Boolean(flags&2)),closed:e.closed??(flags===undefined?null:Boolean(flags&1)),fitPoints,fitEndpointsCoincident:fitPoints?.length>1?fitPoints[0].every((v,i)=>v===fitPoints.at(-1)[i]):null,fitToleranceMm:fitTolerance===undefined?undefined:fitTolerance*scaleMm,startTangent:tangent(e.startTangent??e.beg_tan_vec),endTangent:tangent(e.endTangent??e.end_tan_vec),geometryCreated:false,parameterValidity:'not-checked-by-kernel',limitation:complete?'parameters-preserved; native-spline-construction-not-exposed':'fit-points-do-not-determine-original-nurbs'};
}
function arc(id,c,r,a,b){if(![r,a,b].every(Number.isFinite)||r<=0)fail('圆弧参数无效');const sweep=((b-a)%TAU+TAU)%TAU;if(sweep<1e-12)fail('零角圆弧不能当作圆');return {id,type:'arc3',startMm:at(c,r,a),midMm:at(c,r,a+sweep/2),endMm:at(c,r,a+sweep)};}
export function curveData(e){
 if(e.type==='circle')return {c:e.centerMm,r:e.diameterMm/2,a:0,sweep:TAU};
 if(e.type!=='arc3')return null;
 const [p,q,s]=[e.startMm,e.midMm,e.endMm],u=[q[0]-p[0],q[1]-p[1]],v=[s[0]-p[0],s[1]-p[1]],d=2*(u[0]*v[1]-u[1]*v[0]);
 if(Math.abs(d)<1e-12)fail('退化圆弧');const U=u[0]**2+u[1]**2,V=v[0]**2+v[1]**2,c=[p[0]+(U*v[1]-V*u[1])/d,p[1]+(u[0]*V-v[0]*U)/d],a=Math.atan2(p[1]-c[1],p[0]-c[0]),b=Math.atan2(s[1]-c[1],s[0]-c[0]),m=Math.atan2(q[1]-c[1],q[0]-c[0]);
 let sweep=((b-a)%TAU+TAU)%TAU;if(((m-a)%TAU+TAU)%TAU>sweep)sweep-=TAU;
 return {c,r:dist(c,p),a,sweep};
}
export function vectorPoints(e,segments=48){const c=curveData(e);return c?Array.from({length:segments+1},(_,i)=>at(c.c,c.r,c.a+c.sweep*i/segments)):[e.startMm,e.endMm];}
export function vectorBounds(entities){let min=[Infinity,Infinity],max=[-Infinity,-Infinity];for(const e of entities){const c=curveData(e),points=e.type==='circle'?[at(c.c,c.r,0),at(c.c,c.r,Math.PI/2),at(c.c,c.r,Math.PI),at(c.c,c.r,3*Math.PI/2)]:[e.startMm,e.endMm];if(c&&e.type==='arc3')for(let i=0;i<4;i++){const angle=i*Math.PI/2,t=((Math.sign(c.sweep)*(angle-c.a))%TAU+TAU)%TAU;if(t<=Math.abs(c.sweep)+1e-10)points.push(at(c.c,c.r,angle));}for(const p of points)for(let i=0;i<2;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}}return [...min,...max];}

// LibreDWG model-space database and DXF both use this analytic conversion.
export function convertVectorEntities(raw,{scaleMm=1}={}){
 if(!Number.isFinite(scaleMm)||scaleMm<=0||scaleMm>1e6)fail('每单位毫米数必须大于 0');
 if(!Array.isArray(raw)||raw.length>100000)fail('矢量实体数量超过限制');
 const entities=[],unsupported=[];
 for(const [index,e] of raw.entries()){
  if(e.isInPaperSpace)continue;const sourceId=String(e.handle??index),id=`v${index}`,layer=String(e.layer??'0');
  try{
   const n=e.extrusionDirection;if(n&&(Math.abs(n.x)>1e-9||Math.abs(n.y)>1e-9||Math.abs(n.z-1)>1e-9))fail('非 +Z 法向暂不支持');
   let added=[];
   if(e.type==='LINE')added=[{id,type:'line',startMm:point(e.startPoint),endMm:point(e.endPoint)}];
   else if(e.type==='ARC')added=[arc(id,point(e.center),e.radius,e.startAngle,e.endAngle)];
   else if(e.type==='CIRCLE')added=[{id,type:'circle',centerMm:point(e.center),diameterMm:e.radius*2}];
   else if(e.type==='LWPOLYLINE'){
    if(Math.abs(e.elevation||0)>1e-7||e.constantWidth||e.vertices.some(v=>v.startWidth||v.endWidth))fail('有宽度或非零高程的多段线需另行处理');
    const vs=e.vertices,closed=e.closed===true||!!(e.flag&512);for(let i=0;i<vs.length-(closed?0:1);i++){const v=vs[i],p=point(v),q=point(vs[(i+1)%vs.length]),b=v.bulge||0,key=`${id}_${i}`;if(!b)added.push({id:key,type:'line',startMm:p,endMm:q});else{const dx=q[0]-p[0],dy=q[1]-p[1];added.push({id:key,type:'arc3',startMm:p,midMm:[(p[0]+q[0])/2+b*dy/2,(p[1]+q[1])/2-b*dx/2],endMm:q});}}
   }else{unsupported.push({sourceId,layer,type:e.type,...(e.type==='SPLINE'?{sourceSpline:sourceSplineDescriptor(e,{scaleMm})}:{}),reason:'未导入该类型（含标注、文字、块、样条）；样条保留源参数，不擅自闭合插值'});continue;}
   for(const v of added){for(const k of ['startMm','midMm','endMm','centerMm'])if(v[k])v[k]=v[k].map(x=>x*scaleMm);if(v.diameterMm)v.diameterMm*=scaleMm;validateProfile({profileVersion:1,entities:[v],output:'wire'});}
   entities.push(...added.map(v=>({...v,sourceId,layer})));
  }catch(error){unsupported.push({sourceId,layer,type:e.type,reason:error.message});}
 }
 return {version:1,units:'mm',entities,unsupported,bounds:entities.length?vectorBounds(entities):null,scaleMm};
}

export function parseDxf(text){
 if(typeof text!=='string'||text.length>20*1024*1024||text.startsWith('AutoCAD Binary DXF'))fail('需要 ASCII DXF 文本');
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/),records=[];let section='',r=null;
 for(let i=0;i+1<lines.length;i+=2){const code=Number(lines[i].trim()),value=lines[i+1].trim();if(code===2&&r?.type==='SECTION')section=value;if(code===0){if(r&&section==='ENTITIES'&&r.type!=='SECTION')records.push(r);r={type:value,pairs:[]};if(value==='ENDSEC')section='';}else r?.pairs.push([code,value]);}
 return records.filter(r=>r.type!=='ENDSEC').map(r=>{const val=(c,d=0)=>Number(r.pairs.find(p=>p[0]===c)?.[1]??d),str=(c,d)=>r.pairs.find(p=>p[0]===c)?.[1]??d,p=(x)=>({x:val(x),y:val(x+10),z:val(x+20)}),e={type:r.type,handle:str(5),layer:str(8,'0'),isInPaperSpace:val(67)===1,extrusionDirection:{x:val(210),y:val(220),z:val(230,1)}};
  if(r.type==='LINE')Object.assign(e,{startPoint:p(10),endPoint:p(11)});
  if(r.type==='SPLINE'){
   const points=code=>{const result=[];for(const [c,v]of r.pairs){if(c===code)result.push({x:Number(v),y:0,z:0});else if(result.length&&c===code+10)result.at(-1).y=Number(v);else if(result.length&&c===code+20)result.at(-1).z=Number(v);}return result;};
   Object.assign(e,{degree:val(71),flag:val(70),knots:r.pairs.filter(([c])=>c===40).map(([,v])=>Number(v)),weights:r.pairs.filter(([c])=>c===41).map(([,v])=>Number(v)),controlPoints:points(10),fitPoints:points(11),fitTolerance:val(44,1e-10),...(r.pairs.some(([c])=>c===12)?{startTangent:p(12)}:{}),...(r.pairs.some(([c])=>c===13)?{endTangent:p(13)}:{})});
  }
  if(['ARC','CIRCLE'].includes(r.type))Object.assign(e,{center:p(10),radius:val(40),startAngle:val(50)*Math.PI/180,endAngle:val(51)*Math.PI/180});
  if(r.type==='LWPOLYLINE'){const vertices=[];for(const [c,v] of r.pairs){if(c===10)vertices.push({x:Number(v)});else if(vertices.length&&[20,40,41,42].includes(c))vertices.at(-1)[{20:'y',40:'startWidth',41:'endWidth',42:'bulge'}[c]]=Number(v);}Object.assign(e,{vertices,closed:!!(val(70)&1),elevation:val(38),constantWidth:val(43)});}return e;});
}

const inside=(p,poly)=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
export function connectVector({entities,toleranceMm=1e-6,origin=[0,0],flipY=false}={}){
 if(!Array.isArray(entities)||!entities.length||entities.length>500)fail('请选择 1–500 条轮廓线');
 if(!Number.isFinite(toleranceMm)||toleranceMm<0||toleranceMm>1)fail('连接容差须为 0–1 mm');point(origin);if(typeof flipY!=='boolean')fail('flipY 须为布尔值');
 const clean=entities.map(e=>{const v={id:e.id,type:e.type};for(const k of ['startMm','midMm','endMm','centerMm','diameterMm'])if(e[k]!==undefined)v[k]=structuredClone(e[k]);validateProfile({profileVersion:1,entities:[v],output:'wire'});return v;});
 if(new Set(clean.map(e=>e.id)).size!==clean.length)fail('实体 ID 重复');
 const ends=clean.flatMap((e,i)=>e.type==='circle'?[]:['startMm','endMm'].map(key=>({i,key,p:e[key]}))),mates=new Map(),moves=[],issues=[];
 for(let i=0;i<ends.length;i++){const candidates=[];for(let j=0;j<ends.length;j++)if(i!==j&&dist(ends[i].p,ends[j].p)<=toleranceMm)candidates.push(j);if(candidates.length!==1)issues.push({kind:candidates.length?'branch':'open',entityId:clean[ends[i].i].id,point:ends[i].p,matches:candidates.length});else mates.set(i,candidates[0]);}
 if(issues.length)return {canCreateFace:false,issues,profile:null};
 for(const [i,j] of mates)if(i<j){if(mates.get(j)!==i)fail('端点连接存在歧义');const a=ends[i],b=ends[j],gap=dist(a.p,b.p),p=a.p.map((x,k)=>(x+b.p[k])/2);clean[a.i][a.key]=p;clean[b.i][b.key]=[...p];if(gap>0)moves.push({entityIds:[clean[a.i].id,clean[b.i].id],gapMm:gap,endpointMoveMm:gap/2});}
 const visited=new Set(),loops=[];
 for(let i=0;i<clean.length;i++){if(visited.has(i))continue;const edges=[],id=`loop${loops.length}`;if(clean[i].type==='circle'){visited.add(i);edges.push({entityId:clean[i].id,reversed:false});}else{const first=ends.findIndex(e=>e.i===i&&e.key==='startMm');let cursor=first;do{const e=ends[cursor];if(visited.has(e.i))fail('轮廓回到已访问边，存在分叉');visited.add(e.i);edges.push({entityId:clean[e.i].id,reversed:e.key==='endMm'});const exit=ends.findIndex(v=>v.i===e.i&&v.key!==e.key);cursor=mates.get(exit);}while(cursor!==first);}loops.push({id,edges});}
 const byId=new Map(clean.map(e=>[e.id,e])),polys=loops.map(l=>l.edges.flatMap(r=>{const p=vectorPoints(byId.get(r.entityId),256);return (r.reversed?p.reverse():p).slice(0,-1);}));
 // Intersections are checked analytically; polygon sampling is used only for nesting.
 const inspected=inspectProfileModel({profileVersion:1,entities:clean,loops,regions:[],output:'wire'});
 const blocking=inspected.issues.filter(i=>i.severity==='error');if(blocking.length)return {canCreateFace:false,issues:blocking,profile:null};
 const containers=polys.map((p,i)=>polys.map((q,j)=>i!==j&&inside(p[0],q)?j:-1).filter(j=>j>=0)),regions=[];
 for(let i=0;i<loops.length;i++)if(containers[i].length%2===0)regions.push({id:`region${i}`,outerLoopId:loops[i].id,holeLoopIds:loops.filter((_,j)=>containers[j].length===containers[i].length+1&&containers[j].includes(i)).map(l=>l.id)});
 for(const e of clean)for(const k of ['startMm','midMm','endMm','centerMm'])if(e[k])e[k]=[e[k][0]-origin[0],(e[k][1]-origin[1])*(flipY?-1:1)];
 const profile={profileVersion:1,entities:clean,loops,regions,output:'face'};validateProfile(profile);
 return {canCreateFace:true,profile,issues:[],receipt:{entityCount:clean.length,loopCount:loops.length,regionCount:regions.length,toleranceMm,moves,origin,flipY,bounds:vectorBounds(clean)}};
}
