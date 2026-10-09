import * as cad from 'replicad';
import {buildEndRounding} from './end-rounding.js';
import {buildEdgeBlend} from '../../edge-blend.js';
import {topologyDetails} from './topology.js';

const dispose=x=>{try{x?.delete?.();}catch{}};
const fail=(message,code='ROUND_SELECTION_AMBIGUOUS')=>{throw Object.assign(new Error(message),{code});};
const xyz='XYZ';

// Planning measures one actual section; it does not search radii or try solvers.
export function planRoundTool(shape,p){
 const edges=shape.edges,faces=p.faceIds?shape.faces:[],box=shape.boundingBox,owned=[...edges,...faces,box],bounds=box.bounds;
 try{
  if(Boolean(p.edgeIds)===Boolean(p.faceIds))fail('请选择边或平面边界中的一种范围。','SELECTION_CONFLICT');
  let edgeIds=p.edgeIds,faceBudgetMm;
  if(p.faceIds){
   if(!p.faceIds.length||p.faceIds.some(id=>!Number.isInteger(id)||!faces[id]))fail('请重新选择当前实体的平面。','STALE_REFERENCE');
   if(p.mode==='end'||p.depthMm!==undefined||p.directionEdgeId!==undefined)fail('按面边界圆润仅支持边缘模式。','PARAM_SCHEMA_INVALID');
   if(p.faceIds.some(id=>faces[id].geomType!=='PLANE'))fail('按面边界圆润需要真实平面，请选择字母顶面。','ROUND_SELECTION_AMBIGUOUS');
   const selected=new Set(p.faceIds),rows=topologyDetails(shape);
   edgeIds=rows.filter(row=>row.adjacentFaceIds.some(id=>selected.has(id))).map(row=>row.edgeId);
   if(!edgeIds.length||edgeIds.length>1000)fail('面边界为空或超过本次圆润的 1000 条边预算。','SIZE_LIMIT');
   const spans=[];
   for(const row of rows.filter(row=>edgeIds.includes(row.edgeId)&&row.sharp)){
    const topId=row.adjacentFaceIds.find(id=>selected.has(id)),wallId=row.adjacentFaceIds.find(id=>!selected.has(id));
    if(wallId===undefined)continue;
    const normal=faces[topId].normalAt();let n;try{n=normal.toTuple();}finally{dispose(normal);}
    const stations=[];
    for(const vertex of cad.iterTopo(faces[wallId].wrapped,'vertex')){
     let point;try{point=cad.getOC().BRep_Tool.Pnt(vertex);stations.push(n[0]*point.X()+n[1]*point.Y()+n[2]*point.Z());}finally{dispose(point);dispose(vertex);}
    }
    const span=Math.max(...stations)-Math.min(...stations);if(Number.isFinite(span)&&span>1e-5)spans.push(span);
   }
   if(spans.length)faceBudgetMm=Math.min(...spans)*.12;
  }
  if(!edgeIds?.length||edgeIds.some(id=>!Number.isInteger(id)||!edges[id]))fail('请重新选择当前实体的边。','STALE_REFERENCE');
  const dims=bounds[1].map((v,i)=>v-bounds[0][i]);
  let axisIndex=p.axis?xyz.indexOf(p.axis):dims.indexOf(Math.max(...dims));
  if(p.directionEdgeId!==undefined){
   const e=edges[p.directionEdgeId];if(!e||e.geomType!=='LINE')fail('杆身方向需要同一实体上的一条直边。');
   const v=e.tangentAt(.5);owned.push(v);const a=v.toTuple().map(Math.abs);axisIndex=a.indexOf(Math.max(...a));
   if(a[axisIndex]<.999999)fail('首版圆头仅支持沿 X/Y/Z 的杆件；所选方向为斜向。');
   if(p.axis&&xyz[axisIndex]!==p.axis)fail('点选方向与指定轴冲突。');
  }
  const across=[0,1,2].filter(i=>i!==axisIndex),minor=Math.min(...across.map(i=>dims[i]));
  const selectedBounds=edgeIds.map(id=>{const b=edges[id].boundingBox;owned.push(b);return b.bounds;});
  const lo=Math.min(...selectedBounds.map(b=>b[0][axisIndex])),hi=Math.max(...selectedBounds.map(b=>b[1][axisIndex]));
  const direction=p.direction??((lo+hi)/2>(bounds[0][axisIndex]+bounds[1][axisIndex])/2?1:-1);
  const end=bounds[direction===1?1:0][axisIndex],reach=direction===1?end-lo:hi-end;
  const elongated=dims[axisIndex]>Math.max(...across.map(i=>dims[i]))*1.5;
  const terminal=reach<minor*.8&&hi-lo<minor*.8;
  const mode=p.faceIds?'edge':p.mode&&p.mode!=='auto'?p.mode:(elongated&&terminal?'end':'edge');
  if(mode==='edge'){
   if(p.depthMm!==undefined)fail('端头范围仅用于重建圆头，请选择圆头方式或清除范围。','PARAM_SCHEMA_INVALID');
   const base=Math.min(p.faceIds?(faceBudgetMm??Math.min(...dims)*.1):Math.min(...edgeIds.map(id=>cad.measureLength(edges[id])))*.12,Math.min(...dims)*.1);
   const radius=p.radiusMm??base*(p.strength??.5);
   if(!(radius>1e-5))fail('选边太短，无法推荐可用圆角。','GEOMETRY_INVALID');
   return {mode,requestedMode:p.mode??'auto',resolved:{...(p.faceIds?{faceIds:[...p.faceIds]}:{edgeIds:[...edgeIds]}),radius},
    ...(p.faceIds?{scope:{kind:'face-boundaries',faceIds:[...p.faceIds],edgeIds:[...edgeIds]},recommendation:'measured-support-depth; exact radius is never reduced; holes remain part of the selected face boundary'}:{}),
    control:{kind:'strength',min:.1,max:1,value:p.strength??.5},radiusMm:radius};
  }
  if(!terminal&&!p.depthMm)fail('选边不能明确定位杆件端部；请选端部边或在高级设置指定处理深度。');
  if(p.radiusMm!==undefined)fail('圆头使用处理范围；请清除精确半径或改为只磨边缘。','PARAM_SCHEMA_INVALID');
  const oc=cad.getOC(),probeDepth=Math.max(minor*.6,reach+.01),pos=end-direction*probeDepth;
  const point=new oc.gp_Pnt(...[0,0,0].map((_,i)=>i===axisIndex?pos:0)),normal=new oc.gp_Dir(...[0,0,0].map((_,i)=>i===axisIndex?1:0));owned.push(point,normal);
  const plane=new oc.gp_Pln(point,normal),section=new oc.BRepAlgoAPI_Section(),progress=new oc.Message_ProgressRange();owned.push(plane,section,progress);
  section.Init1(shape.wrapped);section.Init2(plane);section.SetNonDestructive(true);section.Build(progress);
  if(!section.IsDone()||section.HasErrors())fail('无法读取杆身截面，请指定杆身方向。');
  const profile=cad.cast(section.Shape()),pb=profile.boundingBox;owned.push(profile,pb);
  const pd=pb.bounds[1].map((v,i)=>v-pb.bounds[0][i]);
  const thickness=p.profileAxis?xyz.indexOf(p.profileAxis):across.reduce((a,b)=>pd[a]<=pd[b]?a:b);
  if(thickness===axisIndex)fail('杆身方向和厚度轴必须不同。','PARAM_SCHEMA_INVALID');
  const widthAxis=across.find(i=>i!==thickness),width=pd[widthAxis];
  if(!Number.isFinite(width)||width<=1e-5)fail('端部截面无法可靠识别。');
  const minimum=Math.ceil((Math.max(width/2,reach)+1e-5)*100)/100;
  const depth=p.depthMm??minimum;
  const center=pb.bounds[0].map((v,i)=>(v+pb.bounds[1][i])/2);center[axisIndex]=end-direction*depth;
  const max=Math.min(minimum+width*.5,dims[axisIndex]*.75);
  if(!(max>=minimum))fail('杆身过短，无法建议端头范围。');
  return {mode,requestedMode:p.mode??'auto',resolved:{edgeIds:[...p.edgeIds],axis:xyz[axisIndex],direction,profileAxis:xyz[thickness],depthMm:depth},
   control:{kind:'depth',min:minimum,max:Math.max(max,depth),value:depth,step:.01},
   scope:{axis:xyz[axisIndex],direction,end,center,sectionSize:across.map(i=>pd[i]),crossAxes:across.map(i=>xyz[i]),depthMm:depth},
   recommendation:'one-measured-section; depth is a recommendation, not a guaranteed feasible interval'};
 }finally{owned.reverse().forEach(dispose);}
}

export function buildRoundTool(input,p){
 // OCCT may update tolerances. Keep the caller's exact source independent.
 const source=cad.deserializeShape(input.serialize()).asShape3D();
 try{
  const plan=planRoundTool(source,p);
  const result=plan.mode==='end'?buildEndRounding(source,plan.resolved):buildEdgeBlend(source,'fillet',plan.resolved,{suggestRadius:false});
  result.roundReport={version:1,...plan,endRoundingReport:result.endRoundingReport??null,blendReport:result.blendReport??null,attemptCount:1};
  return result;
 }finally{source.delete();}
}

// The section operation can update OCCT flags/p-curves; inspect an owned BRep.
export function inspectRoundTool(input,p){
 const started=performance.now(),source=cad.deserializeShape(input.serialize()).asShape3D();
 try{
  const plan=planRoundTool(source,p),ids=plan.scope?.edgeIds??plan.resolved.edgeIds;
  const selected=new Set(ids),faces=source.faces,edges=source.edges;
  try{
   const targets=topologyDetails(source,{connectivityOnly:true}).filter(row=>selected.has(row.edgeId)).map(row=>({edgeId:row.edgeId,curveType:edges[row.edgeId].geomType,normalContinuity:'not-assessed',adjacentFaceIds:row.adjacentFaceIds,supportSurfaceTypes:row.adjacentFaceIds.map(id=>faces[id].geomType)}));
   return {version:1,operation:'round',stage:'planning',attemptCount:0,elapsedMs:performance.now()-started,...plan,targetCount:ids.length,targets,constructionCategories:[plan.mode==='end'?'principal-axis-end-reconstruction':'native-constant-radius-edge-blend'],feasibility:'not-proven',limitations:['planning-does-not-construct-a-blend','no-radius-search','face-scope-requires-analytic-planes','analytic-fallback-not-selected-by-round']};
  }finally{[...faces,...edges].forEach(dispose);}
 }catch(error){error.report={operation:'round',stage:'planning',attemptCount:0,elapsedMs:performance.now()-started,sourcePreserved:true};throw error;}
 finally{dispose(source);}
}
