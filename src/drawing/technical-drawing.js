import * as cad from 'replicad';
import {extractPlaneSection} from '../reference-curves.js';
const dispose=o=>{try{o?.delete?.();}catch{}};
const fail=(m,c='PARAM_SCHEMA_INVALID')=>{throw Object.assign(new Error(m),{code:c});};
const point=v=>{try{return v.toTuple();}finally{v.delete();}};
const xy=v=>v.slice(0,2);
const fmt=v=>Number(v.toFixed(2)).toString();
function edgeCurves(edges,hidden,project=xy){
 const out=[];
 for(const e of edges){
  if(e.geomType==='LINE'){out.push({kind:'line',a:project(point(e.startPoint)),b:project(point(e.endPoint)),hidden});continue;}
  if(e.geomType==='CIRCLE'&&e.isClosed){const adaptor=new (cad.getOC().BRepAdaptor_Curve)(e.wrapped);let circle,location;try{circle=adaptor.Circle();location=circle.Location();out.push({kind:'circle',center:project([location.X(),location.Y(),location.Z()]),radius:circle.Radius(),hidden});}finally{[location,circle,adaptor].forEach(dispose);}continue;}
  // OCCT tessellation, independent of the viewport quality. Dimensions never use these vertices.
  const mesh=e.meshEdges({tolerance:.01,angularTolerance:.05}),lines=mesh.lines;
  if(lines.length>120000)fail('曲线过于复杂，请减少出图对象','RESOURCE_LIMIT');
  for(let i=0;i+5<lines.length;i+=6)out.push({kind:'line',a:project(lines.slice(i,i+3)),b:project(lines.slice(i+3,i+6)),hidden,approximate:true});
 }
 const seen=new Set();return out.filter(p=>{const key=JSON.stringify(p,(_k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v);if(seen.has(key))return false;seen.add(key);return true;});
}
function boundsOf(edges){
 const bounds=edges.map(e=>{const b=e.boundingBox;try{return b.bounds;}finally{b.delete();}});
 if(!bounds.length)fail('投影没有可见轮廓','GEOMETRY_INVALID');
 return {min:[0,1].map(i=>Math.min(...bounds.map(b=>b[0][i]))),max:[0,1].map(i=>Math.max(...bounds.map(b=>b[1][i])))};
}
function dimensions(view){
 const {min,max}=view.bounds,d=[];
 const seen=new Set();
 const add=(kind,a,b,label)=>{const i=kind==='horizontal'?0:1,key=[kind,a[i].toFixed(5),b[i].toFixed(5)].join(':');if(seen.has(key))return;seen.add(key);d.push({id:`${view.id}-d${d.length}`,viewId:view.id,kind,a,b,label,valueMm:Math.hypot(b[0]-a[0],b[1]-a[1]),source:'exact-brep',enabled:true});};
 add('horizontal',[min[0],min[1]],[max[0],min[1]],fmt(max[0]-min[0]));
 add('vertical',[min[0],min[1]],[min[0],max[1]],fmt(max[1]-min[1]));
 const circles=view.curves.filter(p=>p.kind==='circle'&&!p.hidden);
 const diameterGroups=[];
 for(const c of circles){let group=diameterGroups.find(g=>Math.abs(g[0].radius-c.radius)<1e-6);if(!group){group=[];diameterGroups.push(group);}group.push(c);}
 for(const group of diameterGroups.slice(0,6)){const c=group[0],id=`${view.id}-d${d.length}`;d.push({id,viewId:view.id,kind:'diameter',center:c.center,radius:c.radius,count:group.length,valueMm:c.radius*2,label:(group.length>1?group.length+'x ':'')+'Ø'+fmt(c.radius*2),source:'analytic-circle',enabled:true});}
 // Baseline center positions are less redundant than every possible pairwise distance.
 for(const c of circles.slice(0,3)){
  if(c.center[0]-min[0]>1e-5)add('horizontal',[min[0],c.center[1]],c.center,fmt(c.center[0]-min[0]));
  if(c.center[1]-min[1]>1e-5)add('vertical',[c.center[0],min[1]],c.center,fmt(c.center[1]-min[1]));
 }
 return d;
}
export function createTechnicalDrawing(shapes,{projection='first',sections=[],hiddenLines=true}={}){
 if(!['first','third'].includes(projection)||!Array.isArray(sections)||sections.length>3||typeof hiddenLines!=='boolean'||sections.some(s=>!['XY','XZ','YZ'].includes(s.plane)||!Number.isFinite(s.offset)))fail('投影方式或截面参数无效');
 if(!shapes.length||shapes.length>40)fail('一次选择 1–40 个实体出图');
 const owned=shapes.map(s=>cad.deserializeShape(s.serialize())),compound=cad.makeCompound(owned),views=[];
 try{
  const defs=[['front','FRONT',[0,-1,0],[1,0,0]],['top','TOP',[0,0,1],[1,0,0]],projection==='first'?['side','LEFT',[-1,0,0],[0,-1,0]]:['side','RIGHT',[1,0,0],[0,1,0]]];
  for(const [id,label,normal,x]of defs){const camera=new cad.ProjectionCamera([0,0,0],normal,x);let p;try{p=cad.makeProjectedEdges(compound,camera,hiddenLines);const bounds=boundsOf(p.visible);views.push({id,label,bounds,curves:edgeCurves([...p.visible],false).concat(edgeCurves(p.hidden,true))});}finally{camera.delete();if(p)[...p.visible,...p.hidden].forEach(dispose);}}
  for(const [i,s]of sections.entries()){
   const section=extractPlaneSection(compound,s,cad);const edges=section.edges;
   try{const project=p=>s.plane==='XY'?[p[0],p[1]]:s.plane==='XZ'?[p[0],p[2]]:[p[1],p[2]],curves=edgeCurves(edges,false,project),box=section.boundingBox;let bounds;try{bounds={min:project(box.bounds[0]),max:project(box.bounds[1])};}finally{box.delete();}views.push({id:`section${i}`,label:`SECTION ${String.fromCharCode(65+i)}-${String.fromCharCode(65+i)}  ${s.plane} @ ${fmt(s.offset)}`,bounds,curves,section:{...s}});}finally{edges.forEach(dispose);section.delete();}
  }
  const all=views.flatMap(dimensions);return {version:1,units:'mm',projection,views,dimensions:all,source:'OCCT-HLR-and-exact-sections',curveToleranceMm:.01,limitations:['自动尺寸为几何候选，不推断配合、公差、加工要求或孔的工艺类型。','非整圆曲线以 OCCT 折线输出；标注值来自精确几何。','附加截面为真实交线图，不是带材料剖面线的完整剖视图。']};
 }finally{dispose(compound);owned.forEach(dispose);}
}

export {layoutDrawing} from './technical-layout.js';
