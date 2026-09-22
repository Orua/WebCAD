// Turn a selected open face into a solid using an actual normal offset.
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
    const complete=result;result=null;return complete;
  }finally{dispose(result);dispose(checker);dispose(builder);faces.forEach(dispose);}
}
