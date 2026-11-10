import {extractPlaneSection,sampleSectionChains,PLANE_SECTION_SAMPLES} from '../../reference-curves.js';
const dispose=value=>{try{value?.delete?.();}catch{}};
const vec=value=>[value.X(),value.Y(),value.Z()];
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const delta=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>Math.hypot(...a);
export const RELATION_MODES=Object.freeze(['shortest','centerDistance','axisAlignment','pointFace','parallelFaces','planeSample','rayHits']);
export const PLANE_SAMPLE_AXES=Object.freeze({XY:[0,1],XZ:[0,2],YZ:[1,2]});
const fail=(message,path)=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID',path});};
// Pure summary of sampled section chains in plane coordinates (R8-001).
export function summarizeSectionChains(chains,plane,{includePoints=false}={}){
  const [u,v]=PLANE_SAMPLE_AXES[plane],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const loops=chains.map(({closed,points,lengthMm})=>{
    const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];let area=0;
    points.forEach((p,i)=>{p.forEach((x,k)=>{if(x<min[k])min[k]=x;if(x>max[k])max[k]=x;});[u,v].forEach((axis,j)=>{if(p[axis]<lo[j])lo[j]=p[axis];if(p[axis]>hi[j])hi[j]=p[axis];});if(closed){const q=points[(i+1)%points.length];area+=p[u]*q[v]-q[u]*p[v];}});
    return {closed,pointCount:points.length,lengthMm,areaMm2:closed?Math.abs(area)/2:null,planeBoundsMm:{min:lo,max:hi},extentsMm:[hi[0]-lo[0],hi[1]-lo[1]],...(includePoints?{points}:{})};
  });
  const any=loops.length>0;
  return {loopCount:loops.length,closedLoopCount:loops.filter(l=>l.closed).length,loops,worldBoundsMm:any?{min,max}:null,extentsMm:any?[max[u]-min[u],max[v]-min[v]]:null,planeAxes:[['X','Y','Z'][u],['X','Y','Z'][v]],areaMm2:loops.some(l=>l.closed)?loops.reduce((n,l)=>n+(l.areaMm2??0),0):null};
}
// Pure: dedupe and order ray hits by distance along the ray.
export function orderRayHits(points,origin,direction,tolerance=1e-6){
  const d=direction.map(x=>x/norm(direction)),hits=points.map(p=>({pointWorld:p,distanceMm:dot(delta(p,origin),d)})).filter(h=>h.distanceMm>=-tolerance).sort((a,b)=>a.distanceMm-b.distanceMm);
  return hits.filter((h,i)=>i===0||Math.abs(h.distanceMm-hits[i-1].distanceMm)>tolerance||norm(delta(h.pointWorld,hits[i-1].pointWorld))>tolerance);
}

export function measureRelationExact(input,getShape,oc,cad){
  const owned=[],hold=value=>{owned.push(value);return value;};
  const part=ref=>{if(!ref||typeof ref.bodyId!=='string'||!['body','edge','face'].includes(ref.kind))throw new Error('关系测量需要明确的当前实体、边或面');const shape=getShape(ref.bodyId);if(ref.kind==='body')return shape;const pieces=shape[ref.kind==='edge'?'edges':'faces'];if(!Number.isSafeInteger(ref.topologyId)||ref.topologyId<0||ref.topologyId>=pieces.length){pieces.forEach(dispose);throw new Error('关系测量的拓扑编号已失效');}const selected=pieces[ref.topologyId];pieces.forEach((piece,i)=>{if(i!==ref.topologyId)dispose(piece);});return hold(selected);};
  const extrema=(a,b)=>{const query=hold(new oc.BRepExtrema_DistShapeShape());query.LoadS1(a.wrapped);query.LoadS2(b.wrapped);query.Perform();if(!query.IsDone()||query.NbSolution()<1)throw new Error('精确距离计算未收敛');const p1=hold(query.PointOnShape1(1)),p2=hold(query.PointOnShape2(1));return {distanceMm:query.Value(),witnessPoints:[vec(p1),vec(p2)]};};
  const circle=ref=>{if(ref?.kind!=='edge')throw new Error('圆心/轴线关系须选择两条当前圆边');const edge=part(ref);if(edge.geomType!=='CIRCLE')throw new Error('选定边不是精确圆或圆弧');const adaptor=hold(new oc.BRepAdaptor_Curve(edge.wrapped)),c=hold(adaptor.Circle()),center=hold(c.Location()),axis=hold(c.Axis()),direction=hold(axis.Direction());return {center:vec(center),axis:vec(direction),radiusMm:c.Radius()};};
  try{
    if(input.mode==='shortest')return {mode:'shortest',...extrema(part(input.first),part(input.second)),scope:'finite-brep-shapes'};
    if(input.mode==='pointFace'){if(!finitePoint(input.pointWorld)||input.face?.kind!=='face')throw new Error('点到面需要世界坐标点与有限面');return {mode:'pointFace',...extrema(hold(cad.makeVertex(input.pointWorld)),part(input.face)),scope:'trimmed-finite-face'};}
    if(input.mode==='centerDistance'||input.mode==='axisAlignment'){
      const a=circle(input.first),b=circle(input.second),centerDistanceMm=norm(delta(a.center,b.center)),cos=Math.min(1,Math.max(-1,Math.abs(dot(a.axis,b.axis)))),axisAngleDeg=Math.acos(cos)*180/Math.PI,fromA=delta(b.center,a.center),coaxialDeviationMm=Math.sqrt(Math.max(0,dot(fromA,fromA)-dot(fromA,a.axis)**2));
      return {mode:input.mode,centerDistanceMm,axisAngleDeg,coaxialDeviationMm:axisAngleDeg<1e-5?coaxialDeviationMm:null,centers:[a.center,b.center],radiiMm:[a.radiusMm,b.radiusMm],scope:'exact-circle-axes'};
    }
    if(input.mode==='parallelFaces'){
      if(input.first?.kind!=='face'||input.second?.kind!=='face')throw new Error('法向距离须选择两个有限平面');const a=part(input.first),b=part(input.second);if(a.geomType!=='PLANE'||b.geomType!=='PLANE')throw new Error('法向距离只适用于真实平面面片');const an=hold(a.normalAt()),bn=hold(b.normalAt()),ac=hold(a.center),bc=hold(b.center),n=an.toTuple(),other=bn.toTuple();if(Math.abs(dot(n,other))<1-1e-6)throw new Error('两张面不平行');const normalDistanceMm=Math.abs(dot(delta(bc.toTuple(),ac.toTuple()),n)),shortest=extrema(a,b);return {mode:'parallelFaces',normalDistanceMm,shortestDistanceMm:shortest.distanceMm,witnessPoints:shortest.witnessPoints,finiteOverlap:shortest.distanceMm<=normalDistanceMm+1e-6,scope:'finite-trimmed-faces'};
    }
    if(input.mode==='planeSample'){
      if(input.first?.kind!=='body')fail('planeSample 需要 first:{bodyId,kind:"body"}','first');
      if(!PLANE_SAMPLE_AXES[input.plane])fail('plane 须为 XY、XZ 或 YZ','plane');
      const offset=input.offset??0,samples=input.samples??PLANE_SECTION_SAMPLES.default;
      if(!Number.isFinite(offset))fail('offset 须为有限数值','offset');
      if(!Number.isInteger(samples)||samples<PLANE_SECTION_SAMPLES.min||samples>PLANE_SECTION_SAMPLES.max)fail(`samples 须为 ${PLANE_SECTION_SAMPLES.min}–${PLANE_SECTION_SAMPLES.max} 的整数`,'samples');
      let section;try{section=extractPlaneSection(part(input.first),{plane:input.plane,offset},cad);}
      catch(error){if(/没有交线|未穿过/.test(error?.message??''))return {mode:'planeSample',plane:input.plane,offset,samples,loopCount:0,closedLoopCount:0,loops:[],worldBoundsMm:null,extentsMm:null,areaMm2:null,intersects:false,scope:'exact-section-sampled'};throw error;}
      hold(section);const edges=section.edges;
      try{const {chains,tolerance}=sampleSectionChains(section,edges,samples,cad);return {mode:'planeSample',plane:input.plane,offset,samples,intersects:true,toleranceMm:tolerance,...summarizeSectionChains(chains,input.plane,{includePoints:input.includePoints===true}),scope:'exact-section-sampled',note:'交线来自精确 B-Rep 截面；长度为精确边长，面积与范围按 samples 采样折线计算。'};}
      finally{edges.forEach(dispose);}
    }
    if(input.mode==='rayHits'){
      if(input.first?.kind!=='body')fail('rayHits 需要 first:{bodyId,kind:"body"}','first');
      if(!finitePoint(input.pointWorld))fail('rayHits 需要世界坐标起点 pointWorld','pointWorld');
      if(!finitePoint(input.direction)||norm(input.direction)<1e-12)fail('rayHits 需要非零方向 direction','direction');
      const shape=part(input.first),box=hold(shape.boundingBox),[lo,hi]=box.bounds,corners=[0,1,2,3,4,5,6,7].map(i=>[i&1?hi[0]:lo[0],i&2?hi[1]:lo[1],i&4?hi[2]:lo[2]]);
      const length=Math.max(...corners.map(c=>norm(delta(c,input.pointWorld))))+1,d=input.direction.map(x=>x/norm(input.direction)),end=input.pointWorld.map((x,i)=>x+d[i]*length);
      const ray=hold(cad.makeLine(input.pointWorld,end)),builder=hold(new oc.BRepAlgoAPI_Section(shape.wrapped,ray.wrapped,false));builder.Build();
      if(!builder.IsDone())throw new Error('射线求交未完成');
      const result=hold(builder.Shape()),points=[];let overlapEdges=0;
      for(const v of cad.iterTopo(result,'vertex')){const p=hold(oc.BRep_Tool.Pnt(v));points.push(vec(p));dispose(v);}
      for(const e of cad.iterTopo(result,'edge')){overlapEdges++;dispose(e);}
      const hits=orderRayHits(points,input.pointWorld,d);
      return {mode:'rayHits',origin:input.pointWorld,direction:d,hitCount:hits.length,hits,overlapEdges,firstHit:hits[0]??null,scope:'exact-brep-ray',note:overlapEdges?'射线与部分面相切/重合，overlapEdges>0 时命中点含重合段端点。':undefined};
    }
    throw new Error('未知关系测量模式');
  }finally{owned.reverse().forEach(dispose);}
}
