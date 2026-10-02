import * as cad from 'replicad';
import {buildEndRounding} from './end-rounding.js';
import {buildEdgeBlend} from '../../edge-blend.js';

const dispose=x=>{try{x?.delete?.();}catch{}};
const fail=(message,code='ROUND_SELECTION_AMBIGUOUS')=>{throw Object.assign(new Error(message),{code});};
const xyz='XYZ';

// Planning measures one actual section; it does not search radii or try solvers.
export function planRoundTool(shape,p){
 const edges=shape.edges,box=shape.boundingBox,owned=[...edges,box],bounds=box.bounds;
 try{
  if(!p.edgeIds?.length||p.edgeIds.some(id=>!Number.isInteger(id)||!edges[id]))fail('请重新选择当前实体的边。','STALE_REFERENCE');
  const dims=bounds[1].map((v,i)=>v-bounds[0][i]);
  let axisIndex=p.axis?xyz.indexOf(p.axis):dims.indexOf(Math.max(...dims));
  if(p.directionEdgeId!==undefined){
   const e=edges[p.directionEdgeId];if(!e||e.geomType!=='LINE')fail('杆身方向需要同一实体上的一条直边。');
   const v=e.tangentAt(.5);owned.push(v);const a=v.toTuple().map(Math.abs);axisIndex=a.indexOf(Math.max(...a));
   if(a[axisIndex]<.999999)fail('首版圆头仅支持沿 X/Y/Z 的杆件；所选方向为斜向。');
   if(p.axis&&xyz[axisIndex]!==p.axis)fail('点选方向与指定轴冲突。');
  }
  const across=[0,1,2].filter(i=>i!==axisIndex),minor=Math.min(...across.map(i=>dims[i]));
  const selectedBounds=p.edgeIds.map(id=>{const b=edges[id].boundingBox;owned.push(b);return b.bounds;});
  const lo=Math.min(...selectedBounds.map(b=>b[0][axisIndex])),hi=Math.max(...selectedBounds.map(b=>b[1][axisIndex]));
  const direction=p.direction??((lo+hi)/2>(bounds[0][axisIndex]+bounds[1][axisIndex])/2?1:-1);
  const end=bounds[direction===1?1:0][axisIndex],reach=direction===1?end-lo:hi-end;
  const elongated=dims[axisIndex]>Math.max(...across.map(i=>dims[i]))*1.5;
  const terminal=reach<minor*.8&&hi-lo<minor*.8;
  const mode=p.mode&&p.mode!=='auto'?p.mode:(elongated&&terminal?'end':'edge');
  if(mode==='edge'){
   if(p.depthMm!==undefined)fail('端头范围仅用于重建圆头，请选择圆头方式或清除范围。','PARAM_SCHEMA_INVALID');
   const base=Math.min(Math.min(...p.edgeIds.map(id=>cad.measureLength(edges[id])))*.12,Math.min(...dims)*.1);
   const radius=p.radiusMm??base*(p.strength??.5);
   if(!(radius>1e-5))fail('选边太短，无法推荐可用圆角。','GEOMETRY_INVALID');
   return {mode,requestedMode:p.mode??'auto',resolved:{edgeIds:[...p.edgeIds],radius},control:{kind:'strength',min:.1,max:1,value:p.strength??.5},radiusMm:radius};
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
