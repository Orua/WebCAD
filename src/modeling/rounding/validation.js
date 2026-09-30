const dispose=value=>{try{value?.delete?.();}catch{}};
function preciseVolume(shape,oc){
  const properties=new oc.GProp_GProps();
  try{
    const error=oc.BRepGProp.VolumePropertiesGK(shape.wrapped,properties,1e-9,true,true,false,false,false);
    const volume=Math.abs(properties.Mass());
    if(!Number.isFinite(error)||error<0||!Number.isFinite(volume))throw Object.assign(new Error('圆角体积自适应积分失败'),{code:'GEOMETRY_INVALID'});
    return volume;
  }finally{dispose(properties);}
}
export function validateRoundingResult(source,result,oc){
  const analyzer=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false),solids=result.solids;
  try{
    const sourceVolume=preciseVolume(source,oc),resultVolume=preciseVolume(result,oc);
    const valid=analyzer.IsValid(),singleSolid=solids.length===1&&resultVolume>1e-9;
    if(!valid||!singleSolid)throw Object.assign(new Error('圆角结果不是有效单实体'),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS'});
    if(Math.abs(resultVolume-sourceVolume)<1e-9)throw Object.assign(new Error('圆角未产生可测量的材料变化'),{code:'MATERIAL_CHECK_FAILED',recoveryAction:'CORRECT_PARAMETERS'});
    return {solid:'passed',material:'changed',volumeMethod:'BRepGProp.VolumePropertiesGK',sourceVolumeMm3:sourceVolume,resultVolumeMm3:resultVolume,deltaVolumeMm3:resultVolume-sourceVolume,radius:'not_yet_verified',seams:'not_yet_verified',endpoints:'not_yet_verified'};
  }finally{dispose(analyzer);solids.forEach(dispose);}
}
