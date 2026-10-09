import {planarFace} from '../../reference-profile-wires.js';
import {validateSchema,contractError} from '../../contracts/operation-schema.js';
import {reliefOperations} from './relief-contracts.js';
import {cylindricalReliefTool} from './cylindrical-relief.js';
import {maskReliefTool} from './relief-mask.js';
import {effectiveReliefParams,sculptState,reliefHeights} from '../../relief-sculpt.js';

const dispose=x=>{try{x?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
const fail=(code,message,path='params')=>contractError(code,path,message,'READ_STATE_AND_REPLAN');
function valid(shape,oc){
 const solids=shape.solids,owned=[...solids];
 try{
  if(solids.length!==1)return false;
  const faces=shape.faces,edges=shape.edges,solidFaces=solids[0].faces,solidEdges=solids[0].edges;
  owned.push(...faces,...edges,...solidFaces,...solidEdges);
  if(faces.length!==solidFaces.length||edges.length!==solidEdges.length)return false;
  const check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);owned.push(check);
  return check.IsValid();
 }finally{owned.reverse().forEach(dispose);}
}
function volume(shape,oc){
 const properties=new oc.GProp_GProps();
 try{const error=oc.BRepGProp.VolumePropertiesGK(shape.wrapped,properties,1e-9,true,true,false,false,false),value=Math.abs(properties.Mass());if(!Number.isFinite(error)||error<0||!Number.isFinite(value))fail('RELIEF_INVALID','浮雕体积积分失败');return value;}
 finally{dispose(properties);}
}

// Height samples are control poles, not interpolation targets. The convex hull
// property prevents cubic overshoot outside the explicit [0, depth] range.
function splineFace(grid,oc,cad){
 const owned=[],hold=x=>(owned.push(x),x),rows=grid.length,cols=grid[0].length;
 try{
  const poles=hold(new oc.NCollection_Array2_gp_Pnt(1,cols,1,rows));
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const p=new oc.gp_Pnt(...grid[j][i]);try{poles.SetValue(i+1,j+1,p);}finally{dispose(p);}}
  const knots=(n,d)=>{const count=n-d+1,k=hold(new oc.NCollection_Array1_double(1,count)),m=hold(new oc.NCollection_Array1_int(1,count));for(let i=1;i<=count;i++){k.SetValue(i,i-1);m.SetValue(i,i===1||i===count?d+1:1);}return[k,m];};
  const du=Math.min(3,cols-1),dv=Math.min(3,rows-1),[uk,um]=knots(cols,du),[vk,vm]=knots(rows,dv);
  const surface=hold(new oc.Geom_BSplineSurface(poles,uk,vk,um,vm,du,dv,false,false));
  const maker=hold(new oc.BRepBuilderAPI_MakeFace(surface,1e-7));
  if(!maker.IsDone())fail('RELIEF_INVALID','浮雕曲面构造失败');
  return cad.cast(maker.Face());
 }finally{owned.reverse().forEach(dispose);}
}

function buildLayers(source,p,oc,cad,onProgress){
 if(p.sculpt)fail('RELIEF_INVALID','分层矢量浮雕请编辑各层高度或轮廓，不能套用单层高度笔刷');
 const faces=source.faces,anchor=faces[p.faceId];let current=null;
 try{
  if(!anchor)fail('STALE_REFERENCE','目标面已失效，请重新选择');
  const reports=[];
  for(const [index,layer] of p.layers.entries()){
   const progress=detail=>onProgress?.({layer:index+1,layerCount:p.layers.length,name:layer.name??`Layer ${index+1}`,...detail});
   progress({phase:'relief-layer',completed:index,total:p.layers.length});
   if((layer.startHeightMm??0)>=layer.heightMm)fail('RELIEF_INVALID',`第 ${index+1} 层起点必须低于层高度`);
   const {layers,regions,strokes,values,sculpt,...common}=p;
   const params={...common,depthMm:layer.heightMm,mode:layer.mode??'emboss',surfaceMode:'smooth',...(layer.regions?{regions:layer.regions}:{}),...(layer.strokes?{strokes:layer.strokes}:{}),...(layer.sculpt?{sculpt:layer.sculpt}:{}),values:layer.values??Array.from({length:4},()=>Array(4).fill(1))};
   if(layer.sculpt&&Math.min(...reliefHeights(params).flat())<(layer.startHeightMm??0))fail('RELIEF_LIMIT',`第 ${index+1} 层精修高度低于起点，请明确调整 startHeightMm`);
   let next;
   try{next=buildRelief(current??source,params,oc,cad,{supportFace:anchor,startHeightMm:layer.startHeightMm??0,measureMaterial:false,sourceValidated:!!current,onProgress:progress});}
   catch(error){error.message=`第 ${index+1} 层（${layer.name??'未命名'}）：${error.message}`;throw error;}
   reports.push({...next.reliefReport,index,name:layer.name??`Layer ${index+1}`,layerHeightMm:layer.heightMm});
   dispose(current);current=next;
   progress({phase:'relief-layer',completed:index+1,total:p.layers.length});
  }
  current.reliefReport={kind:'layered-vector-relief',faceId:p.faceId,layerCount:reports.length,layers:reports,background:'unchanged-host',curveToleranceMm:p.curveToleranceMm??0,contourSnapMm:p.contourSnapMm??0,addedMm3:null,removedMm3:null,materialMetrics:'not-computed-per-layer',solidCount:1,valid:true,rows:4,columns:4};
  const out=current;current=null;return out;
 }finally{dispose(current);faces.forEach(dispose);}
}
export function buildRelief(source,p,oc,cad,{supportFace:anchorFace=null,startHeightMm=0,measureMaterial=true,sourceValidated=false,onProgress}={}){
 validateSchema(reliefOperations.relief.paramsSchema,p);
 if(p.layers)return buildLayers(source,p,oc,cad,onProgress);
 const sculptFlat=p.surfaceMode==='flat'&&p.sculpt?.deltaMm?.some(row=>row.some(v=>v!==0));
 if(p.sculpt){sculptState(p);if(p.sculpt.deltaMm.some(row=>row.some(v=>v!==0)))p=effectiveReliefParams(p);}
 if(p.surfaceMode==='flat'&&!p.regions&&!p.strokes)fail('RELIEF_INVALID','平顶浮雕需要明确图案轮廓');
 if(p.regions||p.strokes)p={...p,baseMm:p.baseMm??.005};
 const sourceRows=p.values.length,sourceCols=p.values[0].length;
 if(p.values.some(r=>r.length!==sourceCols))fail('RELIEF_INVALID','高度网格每行必须具有相同列数','params.values');
 if(!p.values.some(r=>r.some(v=>v>0)))fail('RELIEF_NO_CHANGE','图像没有非零高度，请调整明暗或图案','params.values');
 // Constant controls describe the same plane or rational cylinder at any grid
 // density. Keep source controls in history; remove redundant kernel poles.
 if(p.surfaceMode==='flat'||p.values.every(r=>r.every(v=>v===p.values[0][0])))p={...p,values:Array.from({length:4},()=>Array(4).fill(p.surfaceMode==='flat'?1:p.values[0][0]))};
 const rows=p.values.length,cols=p.values[0].length,kernelGrid={rows,columns:cols};
 const owned=[],hold=x=>(owned.push(x),x),timingsMs={};let result,phase='relief-source';
 const timed=(name,run)=>{phase=name;onProgress?.({phase:name,completed:0,total:1,timingsMs:{...timingsMs}});const started=performance.now();let done=false;try{const result=run();done=true;return result;}finally{timingsMs[name]=performance.now()-started;onProgress?.({phase:name,completed:done?1:0,total:1,status:done?'completed':'failed',timingsMs:{...timingsMs}});}};
 try{
  const copy=timed('relief-source-copy',()=>hold(cad.deserializeShape(source.serialize())));
  if(!sourceValidated&&!timed('relief-source-validation',()=>valid(copy,oc)))fail('RELIEF_UNSUPPORTED','浮雕需要一个有效封闭实体');
  const faces=copy.faces;owned.push(...faces);
  if(faces.length>20000)fail('RELIEF_LIMIT','目标超过 20000 个面，请分开处理');
  const face=anchorFace??faces[p.faceId];if(!face)fail('STALE_REFERENCE','目标面已失效，请重新选择','params.faceId');
  if(!planarFace(face,cad)){
   const built=timed('relief-tool-build',()=>cylindricalReliefTool(face,p,oc,cad,{sculptFlat,startHeightMm})),rawTool=hold(built.tool);
   if(!timed('relief-tool-validation',()=>valid(rawTool,oc)))fail('RELIEF_INVALID','柱面浮雕刀具不是有效实体');
   const tool=p.regions||p.strokes?timed('relief-mask',()=>hold(maskReliefTool(rawTool,p,built.frame,oc,cad,onProgress))):rawTool;
   // The cutter floor overlaps the host by 0.001 mm. Its distance to an edge
   // lying inside the cutter can therefore be 0.001 rather than zero.
   if(p.regions||p.strokes){
    const edges=face.edges;owned.push(...edges);
    // One boundary query lets OCCT prune the complete edge set once. Repeating
    // a query per edge multiplied the dense ornament cost by the host outline.
    const boundary=hold(cad.makeCompound(edges));
    if(timed('relief-boundary-check',()=>cad.measureDistanceBetween(tool,boundary))<=.00101)fail('RELIEF_OUTSIDE_FACE','实际图案跨越柱面边界、接缝或孔，请调整轮廓或位置');
   }
   // The finished body already receives measured metadata from CadKernel.
   // Layered ornaments need topology validation, not two expensive adaptive
   // integrals of the increasingly complex body after every small layer.
   const before=measureMaterial?volume(copy,oc):null,direction=p.mode==='engrave'?-1:1;
   const builder=hold(direction===1?new oc.BRepAlgoAPI_Fuse():new oc.BRepAlgoAPI_Cut());
   const args=hold(new oc.NCollection_List_TopoDS_Shape()),tools=hold(new oc.NCollection_List_TopoDS_Shape());
   args.Append(copy.wrapped);tools.Append(tool.wrapped);builder.SetArguments(args);builder.SetTools(tools);
   builder.SetFuzzyValue(1e-7);builder.SetNonDestructive(true);builder.SetUseOBB(true);
   timed('relief-boolean-build',()=>builder.Build());
   if(builder.HasErrors())fail('RELIEF_INVALID','柱面浮雕布尔失败，请减小图案或调整位置');
   result=cad.cast(builder.Shape());if(!timed('relief-result-validation',()=>valid(result,oc)))fail('RELIEF_INVALID','柱面浮雕结果未保持一个有效实体');
   const delta=measureMaterial?(volume(result,oc)-before)*direction:null;if(measureMaterial&&!(delta>1e-7))fail('RELIEF_NO_CHANGE','柱面浮雕没有可测量的材料变化');
   result.reliefReport={...built.report,mode:p.mode??'emboss',faceId:p.faceId,rows:sourceRows,columns:sourceCols,kernelGrid,widthMm:p.widthMm,heightMm:p.heightMm,controlHeightMm:p.depthMm,offsetX:p.offsetX??0,offsetY:p.offsetY??0,angleDeg:0,addedMm3:direction===1?delta:0,removedMm3:direction===-1?delta:0,sourceName:p.source?.name??null,sourceHash:p.source?.sha256??null,valid:true,solidCount:1,smoothing:'approximating-control-grid',...maskReport(p)};
   result.reliefReport.curveConversion=tool.curveConversionReport;result.reliefReport.timingsMs=timingsMs;result.reliefReport.booleanOptions={orientedBounds:true,fuzzyToleranceMm:1e-7,nonDestructive:true};
   const out=result;result=null;return out;
  }
  const center=hold(face.center).toTuple(),normal=unit(hold(face.normalAt(center)).toTuple());
  const seed=Math.abs(normal[0])<.9?[1,0,0]:[0,1,0],x=unit(seed.map((v,i)=>v-dot(seed,normal)*normal[i])),y=cross(normal,x);
  const angle=(p.angleDeg??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),direction=p.mode==='engrave'?-1:1;
  const origin=center.map((v,i)=>v+(p.offsetX??0)*x[i]+(p.offsetY??0)*y[i]);
  const point=(u,v,h)=>origin.map((n,i)=>(n+(u*c-v*s)*x[i]+(u*s+v*c)*y[i]+direction*h*normal[i]));
  const embed=.001,grid=p.values.map((row,j)=>row.map((h,i)=>point((i/(cols-1)-.5)*p.widthMm,(j/(rows-1)-.5)*p.heightMm,(p.surfaceMode==='flat'?1:h)*p.depthMm)));
  const bottom=pt=>{const h=dot(pt.map((v,i)=>v-origin[i]),normal);return pt.map((v,i)=>v-(h-direction*(startHeightMm-embed))*normal[i]);};
  const top=hold(p.surfaceMode==='flat'?cad.makePolygon([grid[0][0],grid[0][cols-1],grid[rows-1][cols-1],grid[rows-1][0]]):splineFace(grid,oc,cad));
  const boundaries=[grid[0],grid.map(r=>r[cols-1]),[...grid[rows-1]].reverse(),grid.map(r=>r[0]).reverse()];
  const sides=boundaries.map(b=>hold(splineFace([b,b.map(bottom)],oc,cad)));
  const floor=hold(cad.makePolygon([grid[0][0],grid[0][cols-1],grid[rows-1][cols-1],grid[rows-1][0]].map(bottom)));
  const rawTool=hold(cad.makeSolid([top,...sides,floor]));
  if(!valid(rawTool,oc))fail('RELIEF_INVALID','图案无法构成有效封闭浮雕');
  const tool=p.regions||p.strokes?hold(maskReliefTool(rawTool,p,{normal,point:(u,v,h)=>point(u,v,direction*h)},oc,cad,onProgress)):rawTool;
  // Check the entire image rectangle, including zero-height margins, against
  // the finite selected face and its holes. Never silently clip the pattern.
  const supportFace=hold(face.clone().translate(normal.map(v=>-direction*embed*2)));
  const vector=hold(new cad.Vector(normal.map(v=>direction*(p.depthMm+embed*4))));
  const support=hold(cad.basicFaceExtrusion(supportFace,vector));
  // Rectangle orientation must use the rotated face axes, including engraving.
  const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>point(u*p.widthMm,v*p.heightMm,-embed));
  const footprint=hold(cad.makePolygon(corners)),span=hold(new cad.Vector(normal.map(v=>direction*(p.depthMm+embed))));
  const envelope=p.regions||p.strokes?tool:hold(cad.basicFaceExtrusion(footprint,span)),outside=hold(envelope.cut(support));
  if(Math.abs(cad.measureVolume(outside))>Math.max(1e-7,p.widthMm*p.heightMm*p.depthMm*1e-9))fail('RELIEF_OUTSIDE_FACE','实际图案超出选面或覆盖了孔，请调整轮廓或位置');
  const before=measureMaterial?volume(copy,oc):null;
  result=timed('relief-boolean-build',()=>direction===1?copy.fuse(tool):copy.cut(tool));
  if(!timed('relief-result-validation',()=>valid(result,oc)))fail('RELIEF_INVALID','浮雕结果未能保持一个有效封闭实体');
  const delta=measureMaterial?(volume(result,oc)-before)*direction:null;
  if(measureMaterial&&!(delta>Math.max(1e-7,before*1e-10)))fail('RELIEF_NO_CHANGE','图案没有产生可测量的材料变化，请检查目标与高度');
  result.reliefReport={kind:'cubic-bspline-heightfield',mode:p.mode??'emboss',faceId:p.faceId,rows:sourceRows,columns:sourceCols,kernelGrid,widthMm:p.widthMm,heightMm:p.heightMm,controlHeightMm:p.depthMm,origin,normal,offsetX:p.offsetX??0,offsetY:p.offsetY??0,angleDeg:p.angleDeg??0,addedMm3:direction===1?delta:0,removedMm3:direction===-1?delta:0,sourceName:p.source?.name??null,sourceHash:p.source?.sha256??null,valid:true,solidCount:1,smoothing:'approximating-control-grid',limitations:['planar-face-only','image-brightness-is-not-photo-depth',p.regions?'actual-contours-within-face':'full-rectangle-within-face'],...maskReport(p)};
  result.reliefReport.curveConversion=tool.curveConversionReport;result.reliefReport.timingsMs=timingsMs;
  const out=result;result=null;return out;
 }catch(error){error.report={...(error.report||{}),operation:'relief',stage:phase,timingsMs,sourcePreserved:true};throw error;}
 finally{dispose(result);owned.reverse().forEach(dispose);}
}

function maskReport(p){return p.regions||p.strokes?{kind:p.surfaceMode==='flat'?'contour-planar-relief':'contour-bspline-relief',surfaceMode:p.surfaceMode??'smooth',background:'unchanged-host',regionCount:p.regions?.length??0,strokeCount:p.strokes?.length??0,curveToleranceMm:p.curveToleranceMm??0,contourSnapMm:p.contourSnapMm??0,smoothing:p.surfaceMode==='flat'?'exact-plane':'approximating-control-grid',...(p.surfaceMode==='flat'?{baseMm:0,totalControlHeightMm:p.depthMm,crestReference:'placement-tangent-plane'}:{}),limitations:['contour-polygon-approximation','image-brightness-is-not-photo-depth',p.regions?'actual-contours-within-face':'full-rectangle-within-face']}:{};}
