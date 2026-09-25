// Turn a selected open face into a solid using an actual normal offset.
import { planarFace } from './reference-profile-wires.js';

// A planar normal offset must preserve its footprint. Imported trimmed faces can
// pass BRepCheck while their 3D curves and surface trimming disagree. Validate a
// geometric invariant using adaptive integration before committing that result.
export function checkPlanarThickness(face,solid,thickness,cad) {
  if(!planarFace(face,cad))return;
  const oc=cad.getOC(),areaProps=new oc.GProp_GProps(),volumeProps=new oc.GProp_GProps();
  try {
    const areaError=oc.BRepGProp.SurfaceProperties(face.wrapped,areaProps,1e-8,false);
    const volumeError=oc.BRepGProp.VolumePropertiesGK(solid.wrapped,volumeProps,1e-8,true,true,false,false,false);
    const expected=Math.abs(areaProps.Mass()*thickness),actual=Math.abs(volumeProps.Mass());
    if(!Number.isFinite(expected)||!Number.isFinite(actual)||!(expected>0)||
      !Number.isFinite(areaError)||!Number.isFinite(volumeError)||areaError<0||volumeError<0||areaError>1e-6||volumeError>1e-6)
      throw new Error('平面增厚的面积/体积精度检查失败，未提交结果；请检查源面边界');
    // This is an integration consistency allowance, not a shape-healing tolerance.
    if(Math.abs(actual-expected)>Math.max(1e-7,expected*1e-5))
      throw new Error(`平面增厚改变了轮廓或源面边界不一致：面积×厚度应为 ${expected.toFixed(6)} mm³，结果为 ${actual.toFixed(6)} mm³；未提交结果，请先修复源面`);
  } finally {areaProps.delete();volumeProps.delete();}
}
export function buildFaceThickness(source,params,cad) {
  const thickness=params.thickness;
  if(typeof thickness!=='number'||!Number.isFinite(thickness)||!thickness)throw new Error('法向厚度必须是非零有限数值');
  const faces=source.faces,dispose=o=>{try{o?.delete();}catch{}};
  let builder,result,checker;
  try {
    if(!Number.isInteger(params.faceId)||!faces[params.faceId])throw new Error('请选择一张有效面');
    builder=new (cad.getOC().BRepOffsetAPI_MakeThickSolid)();
    builder.MakeThickSolidBySimple(faces[params.faceId].wrapped,thickness);
    result=cad.cast(builder.Shape());
    if(result instanceof cad.Solid && !cad.getOC().BRepLib.OrientClosedSolid(result.wrapped))throw new Error('增厚结果无法确定封闭实体方向');
    checker=new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false);
    const solids=result.solids;
    try{if(!checker.IsValid()||solids.length!==1||Math.abs(cad.measureVolume(result))<1e-8)throw new Error('增厚未生成有效单一实体；请减小厚度或检查自交');}
    finally{solids.forEach(dispose);}
    checkPlanarThickness(faces[params.faceId],result,thickness,cad);
    const complete=result;result=null;return complete;
  }finally{dispose(result);dispose(checker);dispose(builder);faces.forEach(dispose);}
}
