import {contractError,validateSchema} from '../../contracts/operation-schema.js';
import {directModelingOperations} from './direct-modeling-contracts.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const OFFSET_SURFACES=new Set(['PLANE','CYLINDRE','CONE','SPHERE','TORUS']);
const DRAFT_SURFACES=new Set(['PLANE','CYLINDRE','CONE']);
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const fail=(message,path='params')=>contractError('GEOMETRY_INVALID',path,message,'READ_STATE_AND_REPLAN');
const unsupported=message=>contractError('CAPABILITY_UNAVAILABLE','refs.0',message,'READ_TOOL_CONTRACT');

function paramsFor(id,p){validateSchema(directModelingOperations[id].paramsSchema,p);return p;}
function direction(value,path){const length=Math.hypot(...value);if(!Number.isFinite(length)||length<1e-12)contractError('PARAM_RANGE_INVALID',path,'方向向量须可归一化且不可为零');return value.map(component=>component/length);}
function exactMeasures(shape,oc,solid=false){
  let checker,areaProps,volumeProps;
  try{
    if(!shape||shape.isNull)fail('内核返回了空几何；原对象保持不变');
    checker=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);
    if(!checker.IsValid())fail('精确几何无效；请减小距离或角度并检查源件边界');
    areaProps=new oc.GProp_GProps();
    const areaError=oc.BRepGProp.SurfaceProperties(shape.wrapped,areaProps,1e-8,false),area=areaProps.Mass();
    if(!Number.isFinite(area)||area<=1e-10||!Number.isFinite(areaError)||areaError<0||areaError>1e-5)fail('精确面积或积分精度检查失败');
    if(!solid)return {area};
    volumeProps=new oc.GProp_GProps();
    const volumeError=oc.BRepGProp.VolumePropertiesGK(shape.wrapped,volumeProps,1e-8,true,true,false,false,false),volume=volumeProps.Mass();
    if(!Number.isFinite(volume)||volume<=1e-10||!Number.isFinite(volumeError)||volumeError<0||volumeError>1e-5)fail('精确体积或积分精度检查失败');
    return {area,volume};
  }finally{[checker,areaProps,volumeProps].forEach(dispose);}
}
function requireOneSolid(shape,oc){
  const solids=shape.solids,faces=shape.faces;let solidFaces;
  try{
    if(solids.length!==1)unsupported('仅支持一个封闭实体；请先显式提取所需实体');
    solidFaces=solids[0].faces;
    if(faces.length!==solidFaces.length)unsupported('来源含实体之外的散面；请先显式提取单一实体');
    return exactMeasures(shape,oc,true);
  }finally{[...solids,...faces,...(solidFaces||[])].forEach(dispose);}
}
function supportedFaces(faces,types){if(faces.some(face=>!types.has(face.geomType)))unsupported('首版只支持契约列出的解析曲面；样条或其他曲面未通过本工具验证');}
function checkOffsetCurvature(face,distance,oc){
  if(face.geomType==='PLANE')return;
  // The installed bindings do not expose gp_Cone/gp_Sphere/gp_Torus or
  // BRepLProp_SLProps. Use exact analytic D2 derivatives and fundamental forms.
  // BRepCheck alone accepts negative-radius rebound and spindle tori.
  const uv=face.UVBounds,u=(uv.uMin+uv.uMax)/2;
  const vs=face.geomType==='CONE'?[uv.vMin,(uv.vMin+uv.vMax)/2,uv.vMax]:[(uv.vMin+uv.vMax)/2];
  if(face.geomType==='TORUS'){
    vs.push(uv.vMin,uv.vMax);
    for(let index=Math.ceil(uv.vMin/Math.PI);index<=Math.floor(uv.vMax/Math.PI);index++)vs.push(index*Math.PI);
  }
  let adaptor,point,du,dv,duu,dvv,duv;
  try{
    adaptor=new oc.BRepAdaptor_Surface(face.wrapped,true);point=new oc.gp_Pnt();du=new oc.gp_Vec();dv=new oc.gp_Vec();duu=new oc.gp_Vec();dvv=new oc.gp_Vec();duv=new oc.gp_Vec();
    const tuple=value=>[value.X(),value.Y(),value.Z()],sign=face.wrapped.Orientation()===oc.TopAbs_Orientation.TopAbs_REVERSED?-1:1;
    for(const v of vs){
      adaptor.D2(u,v,point,du,dv,duu,dvv,duv);
      const a=tuple(du),b=tuple(dv),n=cross(a,b),normalLength=Math.hypot(...n),E=dot(a,a),F=dot(a,b),G=dot(b,b),det=E*G-F*F;
      if(!Number.isFinite(det)||det<=0||normalLength<=1e-12)unsupported('解析源面含退化点；首版偏置不支持尖锥顶点或退化参数域');
      const normal=n.map(value=>value/normalLength*sign),e=dot(normal,tuple(duu)),f=dot(normal,tuple(duv)),g=dot(normal,tuple(dvv)),B=e*G+g*E-2*f*F,C=e*g-f*f,root=Math.sqrt(Math.max(0,B*B-4*det*C));
      const curvatures=[(B-root)/(2*det),(B+root)/(2*det)];
      if(curvatures.some(curvature=>!Number.isFinite(curvature)||1-distance*curvature<=1e-9))fail('偏置距离跨过解析曲面的曲率半径，发生塌陷或局部自交；拒绝零半径后的反弹结果');
    }
  }finally{[adaptor,point,du,dv,duu,dvv,duv].forEach(dispose);}
}
function deepCopy(source,oc,cad){
  // Shape.clone only creates a wrapper around the same TShape. Copy geometry
  // explicitly so even a failed OCCT builder cannot modify source tolerances.
  let transform,copier;
  try{transform=new oc.gp_Trsf();copier=new oc.BRepBuilderAPI_Transform(source.wrapped,transform,true,false);return cad.cast(copier.Shape());}
  finally{[copier,transform].forEach(dispose);}
}
function orientedResult(raw,oc,cad){
  const solids=raw.solids,faces=raw.faces;let solidFaces,result;
  try{
    if(solids.length!==1)fail('结果不是单一封闭实体；不提交分裂、塌陷或散面结果');
    solidFaces=solids[0].faces;
    if(faces.length!==solidFaces.length)fail('结果包含实体之外的散面');
    result=solids[0].clone();
    if(!oc.BRepLib.OrientClosedSolid(result.wrapped))fail('无法确定结果的封闭实体方向');
    exactMeasures(result,oc,true);
    const ready=result;result=null;return ready;
  }finally{[result,...solids,...faces,...(solidFaces||[])].forEach(dispose);}
}
function wrapKernelFailure(error,message){if(error?.code)throw error;fail(message);}

/** Replace one solid with a true equidistant B-Rep offset; never scale it. */
export function buildOffsetSolid(source,p,oc,cad){
  paramsFor('offsetSolid',p);
  let copy,builder,raw,result;let faces=[];
  try{
    const before=requireOneSolid(source,oc);faces=source.faces;supportedFaces(faces,OFFSET_SURFACES);faces.forEach(face=>checkOffsetCurvature(face,p.distanceMm,oc));
    copy=deepCopy(source,oc,cad);builder=new oc.BRepOffsetAPI_MakeOffsetShape();
    builder.PerformByJoin(copy.wrapped,p.distanceMm,1e-7,oc.BRepOffset_Mode.BRepOffset_Skin,false,false,p.join==='round'?oc.GeomAbs_JoinType.GeomAbs_Arc:oc.GeomAbs_JoinType.GeomAbs_Intersection,false);
    if(!builder.IsDone())fail('实体偏置求解失败；未自动减小距离或改变连接方式');
    raw=cad.cast(builder.Shape());result=orientedResult(raw,oc,cad);
    const after=exactMeasures(result,oc,true),delta=after.volume-before.volume;
    if(delta*Math.sign(p.distanceMm)<=Math.max(1e-9,before.volume*1e-12))fail('偏置未产生符合方向的体积变化；拒绝塌陷或未改变的结果');
    const ready=result;result=null;return ready;
  }catch(error){wrapKernelFailure(error,'实体偏置失败；可能发生塌陷、自交或不支持的曲面交角，原对象保持不变');}
  finally{[result,raw,builder,copy,...faces].forEach(dispose);}
}

/** Preserve the source and return one independent oriented normal-offset face. */
export function buildOffsetSurface(source,p,oc,cad){
  paramsFor('offsetSurface',p);
  let copy,builder,raw,result;let faces=[],outputFaces=[];
  try{
    copy=deepCopy(source,oc,cad);faces=copy.faces;
    if(!faces[p.faceId])contractError('STALE_REFERENCE','params.faceId','所选面不在当前对象中','READ_STATE_AND_REPLAN');
    const face=faces[p.faceId];supportedFaces([face],OFFSET_SURFACES);checkOffsetCurvature(face,p.distanceMm,oc);
    const before=exactMeasures(face,oc);
    builder=new oc.BRepOffsetAPI_MakeOffsetShape();
    builder.PerformByJoin(face.wrapped,p.distanceMm,1e-7,oc.BRepOffset_Mode.BRepOffset_Skin,false,false,oc.GeomAbs_JoinType.GeomAbs_Intersection,false);
    if(!builder.IsDone())fail('单面偏置求解失败');
    raw=cad.cast(builder.Shape());outputFaces=raw.faces;
    const solids=raw.solids;
    try{if(solids.length||outputFaces.length!==1)fail('单面偏置未产生一张独立面；不提交成体或分裂结果');}finally{solids.forEach(dispose);}
    result=outputFaces[0].clone();const after=exactMeasures(result,oc);
    if(face.geomType==='PLANE'&&Math.abs(after.area-before.area)>Math.max(1e-7,before.area*1e-6))fail('平面偏置改变了源面边界面积；源件边界可能不一致');
    const ready=result;result=null;return ready;
  }catch(error){wrapKernelFailure(error,'单面偏置失败；可能发生曲面塌陷或不支持的边界，原对象保持不变');}
  finally{[result,raw,builder,copy,...outputFaces,...faces].forEach(dispose);}
}

function modifiedFaceIds(builder,faces,oc){
  let list,copy;const ids=[];
  try{
    list=builder.ModifiedFaces();copy=new oc.NCollection_List_TopoDS_Shape();copy.Assign(list);
    while(!copy.IsEmpty()){
      const raw=copy.First();let id;
      try{id=faces.findIndex(face=>raw.IsSame(face.wrapped));}finally{dispose(raw);}
      if(id<0)fail('无法映射拔模联动面；拒绝不明确的修改范围');
      ids.push(id);copy.RemoveFirst();
    }
    return ids;
  }finally{[copy,list].forEach(dispose);}
}

/** Draft analytic side faces about a fixed world plane, with explicit scope. */
export function buildDraftByPlane(source,p,oc,cad){
  paramsFor('draftByPlane',p);
  const pullValues=direction(p.pullDirection,'params.pullDirection'),normalValues=direction(p.neutralNormal,'params.neutralNormal');
  if(Math.abs(dot(pullValues,normalValues))<1-1e-8)contractError('PARAM_RANGE_INVALID','params.neutralNormal','中性平面法线须与拉出方向平行或反平行');
  let copy,builder,pull,point,normal,plane,raw,result;let faces=[];
  try{
    const before=requireOneSolid(source,oc);copy=deepCopy(source,oc,cad);faces=copy.faces;
    if(p.faceIds.some(id=>!faces[id]))contractError('STALE_REFERENCE','params.faceIds','选定面不在当前对象中','READ_STATE_AND_REPLAN');
    supportedFaces(p.faceIds.map(id=>faces[id]),DRAFT_SURFACES);
    pull=new oc.gp_Dir(...pullValues);point=new oc.gp_Pnt(...p.neutralPoint);normal=new oc.gp_Dir(...normalValues);plane=new oc.gp_Pln(point,normal);
    builder=new oc.BRepOffsetAPI_DraftAngle(copy.wrapped);
    const selected=new Set(p.faceIds),modified=new Set();
    for(const id of p.faceIds){
      if(modified.has(id))continue;
      builder.Add(faces[id].wrapped,pull,p.angleDeg*Math.PI/180,plane);
      if(!builder.AddDone())fail(`面 ${id} 无法完成拔模；请检查角度、中性平面和相邻面`);
      for(const actual of modifiedFaceIds(builder,faces,oc)){
        if(!selected.has(actual))contractError('SELECTION_CONFLICT','params.faceIds',`相切联动还需显式选择面 ${actual}；整步未提交`,'READ_STATE_AND_REPLAN');
        modified.add(actual);
      }
    }
    if(modified.size!==selected.size)fail('内核未接受全部指定拔模面');
    builder.Build();if(!builder.IsDone())fail('拔模无法重建有效的相邻边界；不支持改变拓扑的拔模');
    raw=cad.cast(builder.Shape());result=orientedResult(raw,oc,cad);
    const after=exactMeasures(result,oc,true);
    if(Math.abs(after.volume-before.volume)<=Math.max(1e-9,before.volume*1e-12))fail('拔模未产生可验证的体积变化');
    const ready=result;result=null;return ready;
  }catch(error){wrapKernelFailure(error,'精确拔模失败；请检查解析面、相切联动范围、中性平面与角度，原对象保持不变');}
  finally{[result,raw,builder,plane,normal,point,pull,copy,...faces].forEach(dispose);}
}
