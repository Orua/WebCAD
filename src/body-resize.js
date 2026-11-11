const fail=(code,message)=>{throw Object.assign(new Error(message),{code,path:'params.sizeMm'});};
export function assertBodyResizeParams(params){
 if(params.sizeMm===undefined){if(params.resizeAnchor!==undefined)fail('PARAM_SCHEMA_INVALID','resizeAnchor 需要同时提供 sizeMm。');return;}
 if(!Array.isArray(params.sizeMm)||params.sizeMm.length!==3||!params.sizeMm.every(v=>Number.isFinite(v)&&v>0&&v<=1000000))fail('PARAM_SCHEMA_INVALID','sizeMm 必须明确给出 X/Y/Z 三个正毫米尺寸。');
 if(!['min','center','max'].includes(params.resizeAnchor??'center'))fail('PARAM_SCHEMA_INVALID','resizeAnchor 须为 min、center 或 max。');
 if(params.mode!==undefined||params.align!==undefined||params.positionMode==='absolute'||['x','y','z','rx','ry','rz'].some(k=>(params[k]??0)!==0)||(params.scale??1)!==1)fail('PARAM_SCHEMA_INVALID','实体尺寸须作为独立变形步骤，不能同时指定平移、旋转或其他缩放。');
}
export function bodyResizePlan(bounds,params){
 assertBodyResizeParams(params);const [min,max]=bounds,size=max.map((v,i)=>v-min[i]);
 if(size.some(v=>!Number.isFinite(v)||v<=1e-8))fail('GEOMETRY_INVALID','来源需要沿三个轴均有非零尺寸；平面不能变成实体厚度。');
 const factors=params.sizeMm.map((v,i)=>v/size[i]);if(factors.some(v=>v<.001||v>1000))fail('PARAM_RANGE_INVALID','各轴变形比例须在 0.001–1000 内。');
 const anchor=params.resizeAnchor??'center',pivot=anchor==='min'?[...min]:anchor==='max'?[...max]:min.map((v,i)=>(v+max[i])/2);
 return {sourceSizeMm:size,requestedSizeMm:[...params.sizeMm],factors,pivotMm:pivot,anchor,coordinateSystem:'world'};
}
export function applyBodyResize(source,params,oc,cast){
 const bbox=source.boundingBox;let plan;try{plan=bodyResizePlan(bbox.bounds,params);}finally{bbox.delete();}
 let result,matrix,builder;
 try{
  if(source.geometryType==='mesh')result=source.clone().scaleXYZ(plan.factors,plan.pivotMm);
  else{
   if(!oc.BRepBuilderAPI_GTransform)fail('CAPABILITY_UNAVAILABLE','当前内核尚未载入精确实体分轴变换能力。');
   matrix=new oc.gp_GTrsf();
   for(let row=1;row<=3;row++)for(let col=1;col<=4;col++)matrix.SetValue(row,col,col===4?(1-plan.factors[row-1])*plan.pivotMm[row-1]:row===col?plan.factors[row-1]:0);
   matrix.SetForm();builder=new oc.BRepBuilderAPI_GTransform(source.wrapped,matrix,true);
   if(!builder.IsDone())fail('GEOMETRY_INVALID','内核未能完成实体分轴变形，原实体保留。');
   result=cast(builder.Shape());
  }
  const box=result.boundingBox;let actual;try{actual=box.bounds[1].map((v,i)=>v-box.bounds[0][i]);}finally{box.delete();}
  if(actual.some((v,i)=>!Number.isFinite(v)||Math.abs(v-plan.requestedSizeMm[i])>Math.max(.0001,plan.requestedSizeMm[i]*.000001)))fail('GEOMETRY_INVALID','变形后的实体范围不符合目标尺寸，原实体保留。');
  result.resizeReport={...plan,actualSizeMm:actual,method:source.geometryType==='mesh'?'affine-float64-mesh':'occt-affine-brep',holesAndRadii:'scaled-with-the-body',sourcePreserved:true};
  const out=result;result=null;return out;
 }finally{result?.delete();builder?.delete();matrix?.delete();}
}
