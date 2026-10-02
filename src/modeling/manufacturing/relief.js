import {planarFace} from '../../reference-profile-wires.js';
import {validateSchema,contractError} from '../../contracts/operation-schema.js';
import {reliefOperations} from './relief-contracts.js';
import {cylindricalReliefTool} from './cylindrical-relief.js';

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

export function buildRelief(source,p,oc,cad){
 validateSchema(reliefOperations.relief.paramsSchema,p);
 const rows=p.values.length,cols=p.values[0].length;
 if(p.values.some(r=>r.length!==cols))fail('RELIEF_INVALID','高度网格每行必须具有相同列数','params.values');
 if(!p.values.some(r=>r.some(v=>v>0)))fail('RELIEF_NO_CHANGE','图像没有非零高度，请调整明暗或图案','params.values');
 const owned=[],hold=x=>(owned.push(x),x);let result;
 try{
  const copy=hold(cad.deserializeShape(source.serialize()));
  if(!valid(copy,oc))fail('RELIEF_UNSUPPORTED','浮雕需要一个有效封闭实体');
  const faces=copy.faces;owned.push(...faces);
  if(faces.length>1000)fail('RELIEF_LIMIT','目标超过 1000 个面，请简化后再试');
  const face=faces[p.faceId];if(!face)fail('STALE_REFERENCE','目标面已失效，请重新选择','params.faceId');
  if(!planarFace(face,cad)){
   const built=cylindricalReliefTool(face,p,oc,cad),tool=hold(built.tool);
   if(!valid(tool,oc))fail('RELIEF_INVALID','柱面浮雕刀具不是有效实体');
   const before=volume(copy,oc),direction=p.mode==='engrave'?-1:1;
   const builder=hold(direction===1?new oc.BRepAlgoAPI_Fuse(copy.wrapped,tool.wrapped):new oc.BRepAlgoAPI_Cut(copy.wrapped,tool.wrapped));
   builder.SetFuzzyValue(1e-7);builder.SetNonDestructive(true);builder.Build();
   if(builder.HasErrors())fail('RELIEF_INVALID','柱面浮雕布尔失败，请减小图案或调整位置');
   result=cad.cast(builder.Shape());if(!valid(result,oc))fail('RELIEF_INVALID','柱面浮雕结果未保持一个有效实体');
   const delta=(volume(result,oc)-before)*direction;if(!(delta>1e-7))fail('RELIEF_NO_CHANGE','柱面浮雕没有可测量的材料变化');
   result.reliefReport={...built.report,mode:p.mode??'emboss',faceId:p.faceId,rows,columns:cols,widthMm:p.widthMm,heightMm:p.heightMm,controlHeightMm:p.depthMm,offsetX:p.offsetX??0,offsetY:p.offsetY??0,angleDeg:0,addedMm3:direction===1?delta:0,removedMm3:direction===-1?delta:0,sourceName:p.source?.name??null,sourceHash:p.source?.sha256??null,valid:true,solidCount:1,smoothing:'approximating-control-grid'};
   const out=result;result=null;return out;
  }
  const center=hold(face.center).toTuple(),normal=unit(hold(face.normalAt(center)).toTuple());
  const seed=Math.abs(normal[0])<.9?[1,0,0]:[0,1,0],x=unit(seed.map((v,i)=>v-dot(seed,normal)*normal[i])),y=cross(normal,x);
  const angle=(p.angleDeg??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),direction=p.mode==='engrave'?-1:1;
  const origin=center.map((v,i)=>v+(p.offsetX??0)*x[i]+(p.offsetY??0)*y[i]);
  const point=(u,v,h)=>origin.map((n,i)=>(n+(u*c-v*s)*x[i]+(u*s+v*c)*y[i]+direction*h*normal[i]));
  const embed=.001,grid=p.values.map((row,j)=>row.map((h,i)=>point((i/(cols-1)-.5)*p.widthMm,(j/(rows-1)-.5)*p.heightMm,h*p.depthMm)));
  const bottom=pt=>{const h=dot(pt.map((v,i)=>v-origin[i]),normal);return pt.map((v,i)=>v-(h+direction*embed)*normal[i]);};
  const top=hold(splineFace(grid,oc,cad));
  const boundaries=[grid[0],grid.map(r=>r[cols-1]),[...grid[rows-1]].reverse(),grid.map(r=>r[0]).reverse()];
  const sides=boundaries.map(b=>hold(splineFace([b,b.map(bottom)],oc,cad)));
  const floor=hold(cad.makePolygon([grid[0][0],grid[0][cols-1],grid[rows-1][cols-1],grid[rows-1][0]].map(bottom)));
  const tool=hold(cad.makeSolid([top,...sides,floor]));
  if(!valid(tool,oc))fail('RELIEF_INVALID','图案无法构成有效封闭浮雕');
  // Check the entire image rectangle, including zero-height margins, against
  // the finite selected face and its holes. Never silently clip the pattern.
  const supportFace=hold(face.clone().translate(normal.map(v=>-direction*embed*2)));
  const vector=hold(new cad.Vector(normal.map(v=>direction*(p.depthMm+embed*4))));
  const support=hold(cad.basicFaceExtrusion(supportFace,vector));
  // Rectangle orientation must use the rotated face axes, including engraving.
  const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>point(u*p.widthMm,v*p.heightMm,-embed));
  const footprint=hold(cad.makePolygon(corners)),span=hold(new cad.Vector(normal.map(v=>direction*(p.depthMm+embed))));
  const envelope=hold(cad.basicFaceExtrusion(footprint,span)),outside=hold(envelope.cut(support));
  if(Math.abs(cad.measureVolume(outside))>Math.max(1e-7,p.widthMm*p.heightMm*p.depthMm*1e-9))fail('RELIEF_OUTSIDE_FACE','图案矩形超出选面或覆盖了孔，请缩小或移动图案');
  const before=volume(copy,oc);
  result=direction===1?copy.fuse(tool):copy.cut(tool);
  if(!valid(result,oc))fail('RELIEF_INVALID','浮雕结果未能保持一个有效封闭实体');
  const after=volume(result,oc),delta=(after-before)*direction;
  if(!(delta>Math.max(1e-7,before*1e-10)))fail('RELIEF_NO_CHANGE','图案没有产生可测量的材料变化，请检查目标与高度');
  result.reliefReport={kind:'cubic-bspline-heightfield',mode:p.mode??'emboss',faceId:p.faceId,rows,columns:cols,widthMm:p.widthMm,heightMm:p.heightMm,controlHeightMm:p.depthMm,origin,normal,offsetX:p.offsetX??0,offsetY:p.offsetY??0,angleDeg:p.angleDeg??0,addedMm3:direction===1?delta:0,removedMm3:direction===-1?delta:0,sourceName:p.source?.name??null,sourceHash:p.source?.sha256??null,valid:true,solidCount:1,smoothing:'approximating-control-grid',limitations:['planar-face-only','image-brightness-is-not-photo-depth','full-rectangle-within-face']};
  const out=result;result=null;return out;
 }finally{dispose(result);owned.reverse().forEach(dispose);}
}
