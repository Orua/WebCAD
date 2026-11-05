const dispose=value=>{try{value?.delete?.();}catch{}};
function invalid(message){throw Object.assign(new Error(message),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS'});}
function preciseVolume(shape,oc){
  const properties=new oc.GProp_GProps();
  try{
    const error=oc.BRepGProp.VolumePropertiesGK(shape.wrapped,properties,1e-9,true,true,false,false,false);
    const volume=Math.abs(properties.Mass());
    if(!Number.isFinite(error)||error<0||!Number.isFinite(volume))invalid('抽壳体积自适应积分失败');
    return volume;
  }finally{dispose(properties);}
}
export function buildShell(shape,params,oc,cad){
  const thickness=Number(params?.thickness);
  if(!Number.isFinite(thickness))invalid('thickness 必须是有限数值');
  if(!thickness)invalid('抽壳厚度不能为 0');
  const before=preciseVolume(shape,oc),box=shape.boundingBox;
  let sourceExtents;
  try{
    const [lo,hi]=box.bounds;
    sourceExtents=[0,1,2].map(index=>hi[index]-lo[index]);
    if(!sourceExtents.every(value=>Number.isFinite(value)&&value>1e-9))invalid('抽壳无法读取实体包围盒');
  }finally{dispose(box);}
  // An open face removes the opposite wall along that direction. A thin plate
  // can therefore retain a bottom thicker than half its height. Validate the
  // actual offset result instead of inferring cavity collapse from its AABB.
  const faces=shape.faces;
  if(!Array.isArray(params.faceIds)||params.faceIds.some(id=>!Number.isInteger(id)||id<0||id>=faces.length)){faces.forEach(dispose);invalid('请选择有效的面');}
  const selected=new Set(params.faceIds),keep=[];
  faces.forEach((face,index)=>selected.has(index)?keep.push(face):dispose(face));
  const finder=new cad.FaceFinder().inList(keep);
  let result;
  try{result=shape.shell({thickness,filter:finder});}
  finally{dispose(finder);keep.forEach(dispose);}
  let check,solids=[];
  try{
    check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);solids=result.solids;
    const volume=preciseVolume(result,oc),resultBox=result.boundingBox;
    let grew=false;
    try{const [lo,hi]=resultBox.bounds;grew=[0,1,2].some(index=>hi[index]-lo[index]>sourceExtents[index]+1e-6);}
    finally{dispose(resultBox);}
    const valid=check.IsValid()&&solids.length===1&&volume>1e-9;
    const epsilon=Math.max(1e-8,before*1e-9);
    // Outward shelling hollows the original solid, so material volume can fall while the bounds grow.
    const inward=thickness>0&&volume<before-epsilon,outward=thickness<0&&(volume>before+epsilon||grew);
    if(!valid||!(inward||outward))invalid(thickness>0?'向内抽壳未生成有效单实体，或壁厚没有减少体积。请减小正厚度。':'向外抽壳未生成有效单实体，或外形没有变大。');
    const accepted=result;result=null;return accepted;
  }finally{dispose(check);solids.forEach(dispose);dispose(result);}
}
