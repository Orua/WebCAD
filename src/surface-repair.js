const dispose=value=>{try{value?.delete();}catch{}};
const requireThat=(ok,message)=>{if(!ok)throw new Error(message);};
function count(shape,key){const items=shape[key];try{return items.length;}finally{items.forEach(dispose);}}
function validate(shape,cad){
  const check=new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false);
  try{requireThat(check.IsValid(),'结果几何无效，请减小公差或检查自交');}finally{dispose(check);}
}
// A fixed-tolerance sewing trial, not a mutation of the caller's shape.
export function diagnoseSurface(shape,cad){
  const faces=shape.faces,sewing=new (cad.getOC().BRepBuilderAPI_Sewing)(1e-6,true,false,false,false);
  try{
    faces.forEach(face=>sewing.Add(face.wrapped));sewing.Perform();
    return {faces:faces.length,edges:count(shape,'edges'),solids:count(shape,'solids'),freeEdges:sewing.NbFreeEdges(),multipleEdges:sewing.NbMultipleEdges(),tolerance:1e-6};
  }finally{dispose(sewing);faces.forEach(dispose);}
}
export function sewFaces({refs,faces,tolerance=1e-6,makeSolid=false}={},cad){
  requireThat(typeof tolerance==='number'&&Number.isFinite(tolerance)&&tolerance>0&&tolerance<=.5,'缝合容差必须在 (0, 0.5] mm');
  requireThat(typeof makeSolid==='boolean','makeSolid 必须为布尔值');
  const borrowed=Array.isArray(faces),list=borrowed?faces:(refs||[]).flatMap(shape=>shape.faces);
  let sewing,result,maker;
  try{
    requireThat(list.length>0,'至少需要一个面');
    sewing=new (cad.getOC().BRepBuilderAPI_Sewing)(tolerance,true,false,false,false);
    list.forEach(face=>sewing.Add(face.wrapped));sewing.Perform();
    result=cad.cast(sewing.SewedShape());
    requireThat(result&&!result.isNull&&count(result,'faces')>0,'缝合结果为空');
    if(makeSolid){
      requireThat(sewing.NbFreeEdges()===0&&sewing.NbMultipleEdges()===0,'存在自由边或非流形边，不能创建封闭实体');
      const shells=Array.from(cad.iterTopo(result.wrapped,'shell'),item=>cad.cast(item));
      try{
        requireThat(shells.length===1,'目前只支持单个封闭壳转实体，请先分组处理');
        maker=new (cad.getOC().BRepBuilderAPI_MakeSolid)(shells[0].wrapped);
        requireThat(maker.IsDone(),'封闭壳转实体失败');
        const solid=cad.cast(maker.Shape());dispose(result);result=solid;
      }finally{shells.forEach(dispose);}
      requireThat(result instanceof cad.Solid&&cad.getOC().BRepLib.OrientClosedSolid(result.wrapped),'无法确定封闭实体方向');
      requireThat(count(result,'solids')===1&&cad.measureVolume(result)>1e-8,'结果不是有正体积的单一实体');
    }
    validate(result,cad);const output=result;result=null;return output;
  }finally{dispose(result);dispose(maker);dispose(sewing);if(!borrowed)list.forEach(dispose);}
}
export function surfaceTrim({face,tool,mode='common'}={},cad){
  requireThat(face?.wrapped&&tool?.wrapped,'需要源面和实体刀具');
  requireThat(count(tool,'solids')===1,'刀具必须是单个实体');
  requireThat(mode==='common'||mode==='cut','修剪模式必须是 common 或 cut');
  let builder,result;
  try{
    const Type=cad.getOC()[mode==='common'?'BRepAlgoAPI_Common':'BRepAlgoAPI_Cut'];
    builder=new Type(face.wrapped,tool.wrapped);builder.Build();
    requireThat(builder.IsDone(),'修剪运算未完成');result=cad.cast(builder.Shape());
    requireThat(result&&!result.isNull&&count(result,'faces')>0,'修剪结果为空');
    validate(result,cad);const output=result;result=null;return output;
  }finally{dispose(result);dispose(builder);}
}
