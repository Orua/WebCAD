import {validateProfile} from './profile-model.js';

const EPS=1e-8;
export function prepareAnalyticProfileEdit(source,input){
  const profile=clone(source);if(input.output!==undefined){if(!['wire','face'].includes(input.output))fail('输出须为 wire 或 face');profile.output=input.output;}
  validateProfile(profile);
  if(input.mode==='fillet'){const next=filletProfileLines(profile,{firstId:input.entityId,secondId:input.targetId,radiusMm:input.radiusMm,arcId:input.arcId});return {profile:next,candidates:[],selectionRequired:false,commitRequired:true};}
  const entity=profile.entities.find(item=>item.id===input.entityId),target=profile.entities.find(item=>item.id===input.targetId);
  if(!entity||!target)fail('源或目标图元 ID 已失效','STALE_REFERENCE');
  const candidates=profileIntersections(entity,target);
  if(input.mode==='intersections'||!input.candidateId&&input.mode!=='trimCircle'||input.mode==='trimCircle'&&(!input.startCandidateId||!input.endCandidateId))return {profile:null,candidates,selectionRequired:input.mode!=='intersections',commitRequired:false};
  const next=input.mode==='trimCircle'?trimProfileCircle(profile,input):editProfileEndpoint(profile,{...input,end:input.endpoint||'end'});
  validateProfile(next);return {profile:next,candidates,selectionRequired:false,commitRequired:true};
}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const mul=(a,k)=>[a[0]*k,a[1]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const norm=a=>Math.hypot(...a);
const unit=a=>mul(a,1/norm(a));
const near=(a,b)=>norm(sub(a,b))<=1e-6;
const fail=(message,code='PROFILE_EDIT_INVALID')=>{throw Object.assign(new Error(message),{code});};
const clone=value=>structuredClone(value);
const circleOf=e=>{
  if(e.type==='circle')return {center:e.centerMm,radius:e.diameterMm/2};
  if(e.type!=='arc3')return null;
  const [a,b,c]=[e.startMm,e.midMm,e.endMm],ab=sub(b,a),ac=sub(c,a),d=2*cross(ab,ac);
  if(Math.abs(d)<EPS)fail('圆弧三点共线');
  const center=add(a,[(dot(ab,ab)*ac[1]-dot(ac,ac)*ab[1])/d,(dot(ac,ac)*ab[0]-dot(ab,ab)*ac[0])/d]);
  return {center,radius:norm(sub(a,center))};
};
const angle=(p,c)=>Math.atan2(p[1]-c[1],p[0]-c[0]);
const wrap=a=>(a%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
const arcSweep=e=>{const c=circleOf(e).center,s=angle(e.startMm,c),m=angle(e.midMm,c),t=angle(e.endMm,c);return wrap(m-s)<wrap(t-s)?wrap(t-s):-wrap(s-t);};
export function analyticCurveGeometry(entity){const circle=circleOf(entity);if(!circle)fail('只支持解析圆或圆弧');return {...circle,startAngle:entity.type==='arc3'?angle(entity.startMm,circle.center):0,sweep:entity.type==='arc3'?arcSweep(entity):2*Math.PI};}
const onArc=(e,p)=>{if(e.type==='circle')return true;if(e.type==='line'){const direction=sub(e.endMm,e.startMm),t=dot(sub(p,e.startMm),direction)/dot(direction,direction);return t>=-1e-7&&t<=1+1e-7;}const c=circleOf(e).center,s=angle(e.startMm,c),a=angle(p,c),sweep=arcSweep(e);return sweep>0?wrap(a-s)<=sweep+1e-7:wrap(s-a)<=-sweep+1e-7;};
export const containsAnalyticPoint=(entity,point)=>onArc(entity,point);

export function profileIntersections(source,target){
  if(!source||!target||source.id===target.id)fail('请选择不同的源曲线与目标曲线');
  if(![source,target].every(entity=>['line','circle','arc3'].includes(entity.type)))fail('参数基础轮廓须先明确转为独立直线 / 圆弧再逐段编辑');
  const a=source.type==='line'?source:null,b=target.type==='line'?target:null;
  let candidates=[];
  if(a&&b){const u=sub(a.endMm,a.startMm),v=sub(b.endMm,b.startMm),den=cross(u,v);if(Math.abs(den)>EPS)candidates=[add(a.startMm,mul(u,cross(sub(b.startMm,a.startMm),v)/den))];}
  else if(a||b){const line=a||b,circle=circleOf(a?target:source),d=sub(line.endMm,line.startMm),f=sub(line.startMm,circle.center),A=dot(d,d),B=2*dot(f,d),C=dot(f,f)-circle.radius**2,disc=B*B-4*A*C;if(disc>=-EPS){const q=Math.sqrt(Math.max(0,disc));candidates=[(-B-q)/(2*A),(-B+q)/(2*A)].map(t=>add(line.startMm,mul(d,t)));}}
  else {const c=circleOf(source),d=circleOf(target),delta=sub(d.center,c.center),length=norm(delta);if(length>EPS&&length<=c.radius+d.radius+EPS&&length>=Math.abs(c.radius-d.radius)-EPS){const x=(c.radius**2-d.radius**2+length**2)/(2*length),h=Math.sqrt(Math.max(0,c.radius**2-x*x)),foot=add(c.center,mul(delta,x/length)),perp=[-delta[1]/length,delta[0]/length];candidates=[add(foot,mul(perp,h)),add(foot,mul(perp,-h))];}}
  return candidates.filter((p,i)=>Number.isFinite(p[0])&&Number.isFinite(p[1])&&candidates.findIndex(q=>near(p,q))===i&&onArc(target,p)).map((point,index)=>({id:`intersection-${index+1}`,point}));
}

export function editProfileEndpoint(profile,{mode,entityId,targetId,candidateId,end='end'}){
  validateProfile(profile);
  if(!['trim','extend'].includes(mode)||!['start','end'].includes(end))fail('编辑模式或端点无效');
  const next=clone(profile),source=next.entities.find(e=>e.id===entityId),target=next.entities.find(e=>e.id===targetId);
  if(!source||!target||source.type==='circle')fail('源曲线须为直线或三点圆弧；目标可为直线、圆或圆弧');
  const candidate=profileIntersections(source,target).find(item=>item.id===candidateId);if(!candidate)fail('交点选择已失效');
  const point=candidate.point,old=source[end==='start'?'startMm':'endMm'],other=source[end==='start'?'endMm':'startMm'];
  if(near(old,point)||near(other,point))fail('交点与现有端点重合');
  if(source.type==='line'){
    const direction=sub(old,other),t=dot(sub(point,other),direction)/dot(direction,direction);
    if(norm(sub(add(other,mul(direction,t)),point))>1e-6)fail('交点不在源直线的延长线上');
    if(mode==='trim'&&!(t>EPS&&t<1-EPS))fail('此交点不在可修剪区间');
    if(mode==='extend'&&!(t>1+EPS))fail('此交点不会延伸所选端点');
  }else{
    const circle=circleOf(source),sweep=arcSweep(source),base=angle(other,circle),a=angle(point,circle),fromOther=end==='end'?sweep:-sweep;
    const delta=fromOther>0?wrap(a-base):wrap(base-a),oldLength=Math.abs(fromOther);
    if(mode==='trim'&&!(delta>EPS&&delta<oldLength-EPS))fail('交点不在圆弧可修剪区间');
    if(mode==='extend'&&!(delta>oldLength+EPS&&delta<2*Math.PI-EPS))fail('交点不会沿原圆延伸所选端点');
    const midpointAngle=base+Math.sign(fromOther)*delta/2;
    source.midMm=add(circle.center,[circle.radius*Math.cos(midpointAngle),circle.radius*Math.sin(midpointAngle)]);
  }
  source[end==='start'?'startMm':'endMm']=point;
  return next;
}

export function trimProfileCircle(profile,{entityId,targetId,startCandidateId,endCandidateId,keepSide='ccw'}){
  validateProfile(profile);if(profile.output!=='wire')fail('整圆修剪会形成开放圆弧，请先明确选择线框输出');
  const next=clone(profile),source=next.entities.find(entity=>entity.id===entityId),target=next.entities.find(entity=>entity.id===targetId);
  if(source?.type!=='circle'||!['ccw','cw'].includes(keepSide))fail('请选择源整圆与要保留的圆弧方向');
  const candidates=profileIntersections(source,target),a=candidates.find(candidate=>candidate.id===startCandidateId),b=candidates.find(candidate=>candidate.id===endCandidateId);
  if(!a||!b||a.id===b.id)fail('整圆修剪须明确选择两个不同交点');
  const start=angle(a.point,source.centerMm),end=angle(b.point,source.centerMm),sweep=keepSide==='ccw'?wrap(end-start):-wrap(start-end),mid=start+sweep/2,radius=source.diameterMm/2;
  const arc={id:source.id,type:'arc3',startMm:a.point,endMm:b.point,midMm:add(source.centerMm,[radius*Math.cos(mid),radius*Math.sin(mid)]),...(source.construction?{construction:true}:{})};
  next.entities[next.entities.indexOf(source)]=arc;return next;
}

export function filletProfileLines(profile,{firstId,secondId,radiusMm,arcId}){
  validateProfile(profile);
  if(!(radiusMm>0&&Number.isFinite(radiusMm)))fail('二维圆角半径须大于零');
  if(!arcId||profile.entities.some(e=>e.id===arcId))fail('新圆弧需要唯一 ID');
  const next=clone(profile),a=next.entities.find(e=>e.id===firstId),b=next.entities.find(e=>e.id===secondId);
  if(a?.type!=='line'||b?.type!=='line')fail('首版二维圆角只支持相邻两条直线');
  const loop=next.loops.find(item=>item.edges.some(e=>e.entityId===firstId)&&item.edges.some(e=>e.entityId===secondId));
  if(!loop)fail('两条直线须位于同一闭合环');
  const ia=loop.edges.findIndex(e=>e.entityId===firstId),ib=loop.edges.findIndex(e=>e.entityId===secondId);
  if((ia+1)%loop.edges.length!==ib||loop.edges[ia].reversed||loop.edges[ib].reversed||!near(a.endMm,b.startMm))fail('请按轮廓顺序选择相邻两条直线');
  const corner=a.endMm,u=unit(sub(a.startMm,corner)),v=unit(sub(b.endMm,corner)),cos=Math.max(-1,Math.min(1,dot(u,v))),theta=Math.acos(cos);
  if(theta<EPS||Math.PI-theta<EPS)fail('零角或共线段不能生成圆角');
  const tangent=radiusMm/Math.tan(theta/2);
  if(tangent>=norm(sub(a.startMm,corner))-EPS||tangent>=norm(sub(b.endMm,corner))-EPS)fail('圆角半径超过相邻线段可用长度');
  const start=add(corner,mul(u,tangent)),end=add(corner,mul(v,tangent)),bisector=unit(add(u,v)),center=add(corner,mul(bisector,radiusMm/Math.sin(theta/2))),mid=add(center,mul(unit(sub(corner,center)),radiusMm));
  a.endMm=start;b.startMm=end;next.entities.push({id:arcId,type:'arc3',startMm:start,midMm:mid,endMm:end});loop.edges.splice(ia+1,0,{entityId:arcId,reversed:false});
  validateProfile(next);return next;
}
