import * as cad from 'replicad';
import {topologyDetails} from './topology.js';
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
    // A valid explicit chamfer can intentionally remove most of the material.
    // Volume ratio alone does not prove collapse; validity and positive volume
    // above are geometric checks, while requested edge/radius checks stay with
    // the executing operation.
    return {solid:'passed',material:'changed',volumeMethod:'BRepGProp.VolumePropertiesGK',sourceVolumeMm3:sourceVolume,resultVolumeMm3:resultVolume,deltaVolumeMm3:resultVolume-sourceVolume,radius:'not_yet_verified',seams:'not_yet_verified',endpoints:'not_yet_verified'};
  }finally{dispose(analyzer);solids.forEach(dispose);}
}

const reject=(message,code,details)=>{throw Object.assign(new Error(message),{code,recoveryAction:'CORRECT_PARAMETERS',acceptance:details});};
// Fillet acceptance (R9): a valid solid with changed volume is not yet a fillet.
// Every requested sharp source edge must be gone, whole-body scope must leave
// no sharp edge at all, and face count / volume change must stay plausible.
// Used by every fillet strategy (native, mill fallback, ladder retries).
export function verifyBlendAcceptance(source,result,oc,{targetEdgeIds,scope,operation='fillet',base=null}={}){
  base=base??validateRoundingResult(source,result,oc);
  const sourceFaces=source.faces,resultFaces=result.faces,targets=[...new Set(targetEdgeIds||[])];
  const sourceFaceCount=sourceFaces.length,resultFaceCount=resultFaces.length;
  sourceFaces.forEach(dispose);resultFaces.forEach(dispose);
  const faceBudget=sourceFaceCount+targets.length*4+16;
  if(resultFaceCount>faceBudget)reject(`圆角结果面数异常（${resultFaceCount} 面，上限 ${faceBudget}），疑似铣削碎面或自交，未提交。`,'GEOMETRY_INVALID',{resultFaceCount,faceBudget});
  if(operation==='fillet'&&Math.abs(base.deltaVolumeMm3)>base.sourceVolumeMm3*.7)reject('圆角去除/增加的材料超过原体积的 70%，结果不可信，未提交。','GEOMETRY_INVALID',{deltaVolumeMm3:base.deltaVolumeMm3});
  if(operation!=='fillet')return {...base,resultFaceCount,faceBudget};
  const before=topologyDetails(source),after=topologyDetails(result),targetRows=before.filter(row=>targets.includes(row.edgeId));
  const sharpAfter=after.filter(row=>row.sharp),unknownAfter=after.filter(row=>row.sharp===null);
  const edges=source.edges,tolerance=1e-5,notRounded=new Set();
  try{
    for(const row of sharpAfter){
      const mid=row.midpoint;if(!mid)continue;
      for(const old of targetRows){
        if(mid.some((v,i)=>v<old.bounds[0][i]-tolerance||v>old.bounds[1][i]+tolerance))continue;
        const vertex=cad.makeVertex(mid);
        try{if(cad.measureDistanceBetween(vertex,edges[old.edgeId])<=tolerance)notRounded.add(old.edgeId);}finally{dispose(vertex);}
      }
    }
  }finally{edges.forEach(dispose);}
  const remainingSharpEdgeIds=sharpAfter.map(row=>row.edgeId);
  const details={notRoundedEdgeIds:[...notRounded],remainingSharpEdgeIds,remainingSharpEdgeCount:remainingSharpEdgeIds.length,resultFaceCount};
  if(notRounded.size)reject(`选中的边 ${[...notRounded].join(', ')} 在结果中仍是锐边，圆角未真正完成，未提交。`,'GEOMETRY_INVALID',details);
  if(scope==='body'&&(sharpAfter.length||unknownAfter.length))reject(`整件圆角后仍有 ${sharpAfter.length} 条锐边${unknownAfter.length?`、${unknownAfter.length} 条无法核对的边`:''}（多为圆角交汇处留棱），未提交。`,'GEOMETRY_INVALID',details);
  return {...base,radius:'selected-edges-rounded',selectedEdgesRounded:'passed',...details,faceBudget};
}
