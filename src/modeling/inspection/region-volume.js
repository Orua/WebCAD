import {releaseNativeBoolean} from '../io/native-boolean-lifetime.js';
// Read-only AABB ∩ solid volume. Isolates a BREP copy so inspection cannot
// mutate the authoritative shape the way a live intersect can.
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
function point(value,name){
  if(!Array.isArray(value)||value.length!==3||value.some(v=>!Number.isFinite(v)))fail('PARAM_SCHEMA_INVALID',`${name} 须为三个有限毫米坐标`);
  return value.map(Number);
}
export function assertRegionBox(minMm,maxMm){
  const min=point(minMm,'minMm'),max=point(maxMm,'maxMm');
  for(let i=0;i<3;i++){
    const span=max[i]-min[i];
    if(!(span>0))fail('PARAM_RANGE_INVALID','minMm 每个轴必须严格小于 maxMm');
    if(span>1e6)fail('PARAM_RANGE_INVALID','测量区域边长不能超过 1e6 mm');
  }
  return {minMm:min,maxMm:max};
}
export function measureRegionVolume(shape,minMm,maxMm,cad,{geometryType,isAssembly=false}={}){
  if(isAssembly||geometryType==='mesh')fail('CAPABILITY_UNAVAILABLE','区域体积目前只支持单一精确实体，不支持网格或装配整体');
  const box=assertRegionBox(minMm,maxMm);
  let work,probe,common,bounds,builder,raw,solids=[];
  try{
    work=cad.deserializeShape(shape.serialize());
    probe=cad.makeBox(box.minMm,box.maxMm);
    const empty=()=>({kind:'region',...box,volume:0,solidCount:0,empty:true,overlap:false,bounds:null,method:'exact-brep-aabb-intersection',source:'exact-brep-aabb-intersection'});
    // replicad.intersect hides a native Common builder behind deferred JS GC.
    // Dense material audits must own/release that large BOP DS synchronously.
    builder=new (cad.getOC().BRepAlgoAPI_Common)(work.wrapped,probe.wrapped);builder.Build();
    if(!builder.IsDone())fail('GEOMETRY_INVALID','区域交集内核计算未完成，不能作为零材料');
    raw=builder.Shape();if(raw.IsNull())return empty();raw.delete();raw=null;
    builder.SimplifyResult(true,true,.001);raw=builder.Shape();
    if(raw.IsNull())fail('GEOMETRY_INVALID','区域交集简化产生空形状，不能作为零材料');
    common=cad.cast(raw);raw=null;
    solids=common.solids||[];
    if(!solids.length)return {kind:'region',...box,volume:0,solidCount:0,empty:true,overlap:false,bounds:null,method:'exact-brep-aabb-intersection',source:'exact-brep-aabb-intersection'};
    const volume=cad.measureVolume(common);
    if(!Number.isFinite(volume)||volume<0)fail('GEOMETRY_INVALID','区域交集体积不是有限的非负值');
    bounds=common.boundingBox;
    const [bmin,bmax]=bounds.bounds;
    return {kind:'region',...box,volume,solidCount:solids.length,empty:false,overlap:true,bounds:{min:bmin,max:bmax},method:'exact-brep-aabb-intersection',source:'exact-brep-aabb-intersection'};
  }finally{try{releaseNativeBoolean(builder);}finally{[bounds,...solids,common,raw,probe,work].forEach(shape=>{try{shape?.delete?.();}catch{}});}}
}
