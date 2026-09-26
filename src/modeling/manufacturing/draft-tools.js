const dispose=value=>{try{value?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const normalized=value=>{if(!Array.isArray(value)||value.length!==3||value.some(v=>!Number.isFinite(v)))throw new Error('拉出方向须为三个有限数字');const length=Math.hypot(...value);if(length<1e-9)throw new Error('拉出方向不可为零');return value.map(v=>v/length);};

export function inspectDraftExact(shape,input){
  const direction=normalized(input.pullDirection),threshold=input.thresholdDeg;
  if(!Number.isFinite(threshold)||threshold<0||threshold>=90)throw new Error('拔模阈值须在 0–90° 之间');
  const faces=shape.faces;
  try{return {method:'exactPlanarNormal',scope:'仅解析平面；封口面与侧壁分开报告，不判断完整脱模可达性',pullDirection:direction,thresholdDeg:threshold,faces:faces.map((face,faceId)=>{if(face.geomType!=='PLANE')return {faceId,geomType:face.geomType,status:'unsupported',reason:'非平面需要曲面采样，本次未提供整面证明'};const normal=face.normalAt();try{const signed=dot(normal.toTuple(),direction),angleDeg=Math.asin(Math.max(-1,Math.min(1,signed)))*180/Math.PI;return {faceId,geomType:'PLANE',signedAngleDeg:angleDeg,classification:Math.abs(signed)>1-1e-6?'cap':angleDeg>=threshold?'positive':angleDeg<=-threshold?'negative':'belowThreshold',note:'负倾角不是已证明倒扣'};}finally{dispose(normal);}})};}
  finally{faces.forEach(dispose);}
}

export function buildDraftFaces(shape,p,oc,cad){
  const direction=normalized(p.pullDirection),angle=p.angleDeg;
  if(!Number.isFinite(angle)||angle<=0||angle>=45)throw new Error('受限拔模角度须大于 0 且小于 45°');
  const faces=shape.faces,edges=shape.edges,solids=shape.solids;
  let draft,pull,neutralPoint,neutralNormal,neutralPlane,result;
  try{
    if(solids.length!==1||faces.length!==6||edges.length!==12||faces.some(face=>face.geomType!=='PLANE'))throw new Error('首版拔模只支持六个解析平面、十二条直边的单一棱柱；曲面、圆柱和圆角体暂不支持');
    const ids=p.faceIds,neutralId=p.neutralFaceId;
    if(!Array.isArray(ids)||ids.length!==4||new Set(ids).size!==4||ids.some(id=>!Number.isInteger(id)||id<0||id>=faces.length)||!Number.isInteger(neutralId)||neutralId<0||neutralId>=faces.length||ids.includes(neutralId))throw new Error('须显式指定四个侧面 ID 和一个固定底面 ID');
    const normals=faces.map(face=>{const n=face.normalAt();try{return n.toTuple();}finally{dispose(n);}});
    if(dot(normals[neutralId],direction)>-1+1e-6||ids.some(id=>Math.abs(dot(normals[id],direction))>1e-6))throw new Error('固定面必须朝向拉出方向的反向，四个侧面必须与拉出方向平行');
    const other=[0,1,2,3,4,5].filter(id=>id!==neutralId&&!ids.includes(id));
    if(other.length!==1||dot(normals[other[0]],direction)<1-1e-6)throw new Error('选定范围不是一个棱柱的完整四侧面');
    const center=faces[neutralId].center,origin=center.toTuple();dispose(center);
    pull=new oc.gp_Dir(...direction);neutralPoint=new oc.gp_Pnt(...origin);neutralNormal=new oc.gp_Dir(...direction);neutralPlane=new oc.gp_Pln(neutralPoint,neutralNormal);
    draft=new oc.BRepOffsetAPI_DraftAngle(shape.wrapped);
    for(const id of ids){draft.Add(faces[id].wrapped,pull,angle*Math.PI/180,neutralPlane);if(!draft.AddDone())throw new Error(`侧面 ${id} 无法加入受限拔模；原实体保持不变`);}
    draft.Build();if(!draft.IsDone())throw new Error('精确拔模求解失败；原实体保持不变');
    result=cad.cast(draft.Shape());const resultSolids=result.solids;
    try{if(result.isNull||resultSolids.length!==1||!Number.isFinite(cad.measureVolume(result))||cad.measureVolume(result)<=1e-8)throw new Error('拔模结果不是有效单一实体');}finally{resultSolids.forEach(dispose);}
    const before=cad.measureVolume(shape),after=cad.measureVolume(result);if(Math.abs(before-after)<1e-8)throw new Error('拔模未改变实体');
    const ready=result;result=null;return ready;
  }catch(error){dispose(result);throw error;}
  finally{[draft,neutralPlane,neutralNormal,neutralPoint,pull].forEach(dispose);faces.forEach(dispose);edges.forEach(dispose);solids.forEach(dispose);}
}
