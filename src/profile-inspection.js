import {expandProfilePrimitives} from './profile-primitives.js';
import {profileIntersections,containsAnalyticPoint} from './profile-editing.js';
const finitePoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const pointAt = (entity,reversed,end) => reversed ? end ? entity.startMm : entity.endMm : end ? entity.endMm : entity.startMm;
const issue = (id,kind,message,entityIds,position,severity='error',extra={}) => ({issueId:id,kind,message,entityIds,position,severity,...extra});
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const lineIntersection = (a,b,c,d) => {
  const den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
  if(Math.abs(den)<1e-12)return null;
  const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den;
  const u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
  return t>1e-8&&t<1-1e-8&&u>1e-8&&u<1-1e-8?[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]:null;
};
const loopShape=(loop,byId)=>{const entities=loop?.edges?.map(ref=>byId.get(ref.entityId));if(!entities?.length||entities.some(item=>!item))return null;if(entities.length===1&&entities[0].type==='circle')return {kind:'circle',center:entities[0].centerMm,radius:entities[0].diameterMm/2};if(entities.every(item=>item.type==='line'))return {kind:'polygon',points:loop.edges.map((ref,i)=>ref.reversed?entities[i].endMm:entities[i].startMm)};return null;};
const insidePolygon=(point,poly)=>{let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
const edgeDistance=(point,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)));return distance(point,[a[0]+t*dx,a[1]+t*dy]);};
const holeContained=(outer,hole)=>{
  if(outer.kind==='circle'&&hole.kind==='circle')return distance(outer.center,hole.center)+hole.radius<outer.radius-1e-8;
  if(outer.kind==='circle')return hole.points.every(point=>distance(point,outer.center)<outer.radius-1e-8);
  if(hole.kind==='circle')return insidePolygon(hole.center,outer.points)&&outer.points.every((point,i)=>edgeDistance(hole.center,point,outer.points[(i+1)%outer.points.length])>hole.radius+1e-8);
  return hole.points.every(point=>insidePolygon(point,outer.points));
};

// Read-only diagnostic on the saved analytic source. Geometry remains unchanged.
export function inspectProfileModel(profile) {
  profile=expandProfilePrimitives(profile);
  if(!profile||!Array.isArray(profile.entities)||profile.entities.length>500)throw new Error('轮廓数据缺失或超过 500 个解析实体');
  const issues=[],byId=new Map(),segments=[];
  for(const [index,entity] of profile.entities.entries()){
    if(!entity||typeof entity.id!=='string'||byId.has(entity.id)){issues.push(issue(`entity:${index}:id`,'invalidEntity','解析实体 ID 缺失或重复',[entity?.id].filter(Boolean),null));continue;}
    byId.set(entity.id,entity);
    if(entity.type==='line'||entity.type==='arc3'){
      if(!finitePoint(entity.startMm)||!finitePoint(entity.endMm)){issues.push(issue(`entity:${entity.id}:point`,'invalidPoint','端点坐标无效',[entity.id],null));continue;}
      const length=distance(entity.startMm,entity.endMm);
      if(length<=1e-9)issues.push(issue(`entity:${entity.id}:zero`,'zeroLength','零长度线段或圆弧',[entity.id],entity.startMm,'error',{availableRepair:'deleteExplicitEntity'}));
      if(entity.type==='line'&&length>1e-9&&!entity.construction)segments.push(entity);
      if(entity.type==='arc3'&&(!finitePoint(entity.midMm)||Math.abs(cross(entity.startMm,entity.midMm,entity.endMm))<=1e-9))issues.push(issue(`entity:${entity.id}:arc`,'degenerateArc','三点圆弧共线或中点无效',[entity.id],entity.midMm||null));
    }else if(entity.type==='circle'){
      if(!finitePoint(entity.centerMm)||!Number.isFinite(entity.diameterMm)||entity.diameterMm<=0)issues.push(issue(`entity:${entity.id}:circle`,'invalidCircle','圆心或直径无效',[entity.id],entity.centerMm||null));
    }else issues.push(issue(`entity:${entity.id}:type`,'unsupportedEntity','未支持的轮廓实体类型',[entity.id],null));
  }
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const a=segments[i],b=segments[j],same=distance(a.startMm,b.startMm)<=1e-7&&distance(a.endMm,b.endMm)<=1e-7||distance(a.startMm,b.endMm)<=1e-7&&distance(a.endMm,b.startMm)<=1e-7;
    if(same)issues.push(issue(`duplicate:${a.id}:${b.id}`,'duplicateLine','重复直线',[a.id,b.id],a.startMm,'error',{availableRepair:'deleteExplicitEntity'}));
    const at=lineIntersection(a.startMm,a.endMm,b.startMm,b.endMm);
    if(at)issues.push(issue(`cross:${a.id}:${b.id}`,'selfIntersection','直线在非端点处相交',[a.id,b.id],at));
  }
  const analytic=profile.entities.filter(entity=>!entity.construction&&!issues.some(item=>item.severity==='error'&&item.entityIds.includes(entity.id)));
  for(let i=0;i<analytic.length;i++)for(let j=i+1;j<analytic.length;j++){const a=analytic[i],b=analytic[j];if(a.type==='line'&&b.type==='line')continue;try{if(a.type==='circle'&&b.type==='circle'&&distance(a.centerMm,b.centerMm)<1e-7&&Math.abs(a.diameterMm-b.diameterMm)<1e-7){issues.push(issue(`duplicate:${a.id}:${b.id}`,'duplicateCurve','重复解析圆',[a.id,b.id],a.centerMm));continue;}for(const crossing of profileIntersections(a,b)){const point=crossing.point;if(!containsAnalyticPoint(a,point))continue;const endpointA=a.type!=='circle'&&[a.startMm,a.endMm].some(end=>distance(end,point)<1e-7),endpointB=b.type!=='circle'&&[b.startMm,b.endMm].some(end=>distance(end,point)<1e-7);if(endpointA&&endpointB)continue;issues.push(issue(`cross:${a.id}:${b.id}:${crossing.id}`,'selfIntersection','解析曲线在非公共端点处相交',[a.id,b.id],point));}}catch(error){issues.push(issue(`curve:${a.id}:${b.id}`,'invalidCurve',error.message,[a.id,b.id],null));}}
  const paths=[...(profile.loops||[]).map(path=>({...path,closed:true})),...(profile.chains||[]).map(path=>({...path,closed:false}))];
  for(const path of paths){
    if(!Array.isArray(path.edges)||!path.edges.length){issues.push(issue(`path:${path.id}:empty`,'emptyPath','路径为空',[],null));continue;}
    const members=path.edges.map(entry=>({entry,entity:byId.get(entry.entityId)}));
    for(let i=0;i<members.length;i++){
      const current=members[i],next=members[(i+1)%members.length];
      if(!current.entity){issues.push(issue(`path:${path.id}:${i}:missing`,'missingEntity','路径引用的实体不存在',[current.entry?.entityId].filter(Boolean),null));continue;}
      if(current.entity.type==='circle'||!finitePoint(current.entity.startMm)||!finitePoint(current.entity.endMm))continue;
      if(i===members.length-1&&!path.closed){
        const first=members[0],start=pointAt(first.entity,first.entry.reversed,false),end=pointAt(current.entity,current.entry.reversed,true),closure=distance(start,end);
        issues.push(issue(`open:${path.id}:start`,'openEndpoint','开放路径起点',[first.entity.id],start,'info'));
        issues.push(issue(`open:${path.id}:end`,'openEndpoint','开放路径终点',[current.entity.id],end,'info'));
        if(closure>1e-6)issues.push(issue(`closure:${path.id}`,'closureGap',`闭合端点间隙 ${closure.toFixed(6)} mm`,[current.entity.id,first.entity.id],end,'warning',{distanceMm:closure,targetPoint:start,availableRepair:'moveExplicitEndpoint'}));
        continue;
      }
      if(!next.entity||next.entity.type==='circle'||!finitePoint(next.entity.startMm)||!finitePoint(next.entity.endMm))continue;
      const a=pointAt(current.entity,current.entry.reversed,true),b=pointAt(next.entity,next.entry.reversed,false),gap=distance(a,b);
      if(gap>1e-6)issues.push(issue(`gap:${path.id}:${i}`,'endpointGap',`端点间隙 ${gap.toFixed(6)} mm`,[current.entity.id,next.entity.id],a,'error',{distanceMm:gap,targetPoint:b,availableRepair:'moveExplicitEndpoint'}));
    }
  }
  const loopsById=new Map((profile.loops||[]).map(loop=>[loop.id,loop]));
  for(const [index,region] of (profile.regions||[]).entries()){
    const outer=loopShape(loopsById.get(region.outerLoopId),byId);
    for(const holeId of region.holeLoopIds||[]){const hole=loopShape(loopsById.get(holeId),byId);if(outer&&hole&&!holeContained(outer,hole))issues.push(issue(`region:${index}:hole:${holeId}`,'holeOutside','孔环不完全位于所属外轮廓内部',[...(loopsById.get(holeId)?.edges||[]).map(ref=>ref.entityId)],hole.center||hole.points?.[0]||null));}
  }
  const blocking=issues.filter(item=>item.severity==='error');
  return {status:issues.length?'issues':'clear',issues,summary:{entityCount:profile.entities.length,loopCount:profile.loops?.length||0,regionCount:profile.regions?.length||0,blockingCount:blocking.length,coplanarityErrorMm:0,canMakeFace:profile.output==='face'&&blocking.length===0}};
}
