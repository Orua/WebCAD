// Profile-preserving free-end reconstruction. Inherited small creases are
// explicitly reported; this operation never claims whole-body G1 continuity.
import * as cad from 'replicad';
const dispose=x=>{try{x?.delete?.();}catch{}};
const vec=x=>[x.X(),x.Y(),x.Z()];
const tuple=x=>{try{return x.toTuple();}finally{dispose(x);}};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),length=a=>Math.hypot(...a);
const unit=a=>a.map(x=>x/length(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const angle=(a,b)=>Math.acos(Math.min(1,Math.max(-1,dot(unit(a),unit(b)))))*180/Math.PI;
const gap=(a,b)=>length(a.map((x,i)=>x-b[i]));
function fail(message,code='END_ROUNDING_UNSUPPORTED',details={}){throw Object.assign(new Error(message),{code,report:details});}
export function buildEndRounding(input,params){
 const {axis='Y',direction=1,profileAxis='Z',depthMm,edgeIds}=params;
 if(!['X','Y','Z'].includes(axis)||!['X','Y','Z'].includes(profileAxis)||axis===profileAxis||![1,-1].includes(direction)||!(depthMm>0)||!Number.isFinite(depthMm)||!Array.isArray(edgeIds)||!edgeIds.length||edgeIds.length>32||new Set(edgeIds).size!==edgeIds.length)fail('请选择端部边、两个不同方向和正数重建深度。','PARAM_SCHEMA_INVALID');
 const oc=cad.getOC(),owned=[],keep=x=>(owned.push(x),x),tol=1e-5;
 const exactBounds=shape=>{const box=keep(new oc.Bnd_Box());oc.BRepBndLib.AddOptimal(shape.wrapped,box,false,false);const a=keep(box.CornerMin()),b=keep(box.CornerMax());return[vec(a),vec(b)];};
 const volume=shape=>{const solids=shape.solids;owned.push(...solids);if(!solids.length)return 0;const p=keep(new oc.GProp_GProps());const e=oc.BRepGProp.VolumePropertiesGK(shape.wrapped,p,1e-10,true,true,false,false,false);if(e<0||!Number.isFinite(p.Mass()))fail('体积量测失败','GEOMETRY_INVALID');return Math.abs(p.Mass());};
 function boolean(type,a,b){const builder=keep(new oc[type]()),args=keep(new oc.NCollection_List_TopoDS_Shape()),tools=keep(new oc.NCollection_List_TopoDS_Shape());args.Append(a.wrapped);tools.Append(b.wrapped);builder.SetArguments(args);builder.SetTools(tools);builder.SetNonDestructive(true);builder.SetRunParallel(false);builder.Build(keep(new oc.Message_ProgressRange()));if(!builder.IsDone()||builder.HasErrors())fail('端头组装失败，原模型保留','KERNEL_BUILD_FAILED');return keep(cad.cast(builder.Shape()));}
 try{
  const original=cad.deserializeShape(input.serialize()).asShape3D();keep(original);
  const originalSolids=original.solids;owned.push(...originalSolids);if(originalSolids.length!==1)fail('端头圆润需要单一实体');
  const basis={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]},y=basis[axis].map(v=>v*direction),z=basis[profileAxis],x=cross(y,z);
  const tr=new oc.gp_Trsf();tr.SetValues(...x,0,...y,0,...z,0);
  const transform=keep(new cad.Transformation(tr)),inverse=keep(transform.inverted());
  const source=keep(cad.cast(transform.transform(original.wrapped)).asShape3D()),bounds=exactBounds(source);
  const vertices=[...cad.iterTopo(source.wrapped,'vertex')];owned.push(...vertices);
  const vertexEnd=Math.max(...vertices.map(v=>{const p=keep(oc.BRep_Tool.Pnt(v));return p.Y();}));
  if(Math.abs(vertexEnd-bounds[1][1])>tol)fail('端点不能由当前端部边界可靠确定');
  const s0=vertexEnd-depthMm;
  if(s0<=bounds[0][1]+tol)fail('重建深度超出针身');
  const sourceEdges=source.edges;owned.push(...sourceEdges);
  const targetPoints=[];
  for(const id of edgeIds){if(!Number.isInteger(id)||!sourceEdges[id])fail('当前实体边号无效','PARAM_SCHEMA_INVALID');const b=exactBounds(sourceEdges[id]);if(b[0][1]<s0-tol)fail('选中的边超出端头重建区，请调整方向或深度');targetPoints.push(tuple(sourceEdges[id].pointAt(.5)));}
  function section(s,withFace=true){const p=keep(new oc.gp_Pnt(0,s,0)),n=keep(new oc.gp_Dir(0,1,0)),plane=keep(new oc.gp_Pln(p,n)),b=keep(new oc.BRepAlgoAPI_Section());b.Init1(source.wrapped);b.Init2(plane);b.SetNonDestructive(true);b.Build(keep(new oc.Message_ProgressRange()));if(!b.IsDone()||b.HasErrors())fail('无法提取端头截面');const shape=keep(cad.cast(b.Shape())),edges=shape.edges;owned.push(...edges);if(!edges.length||edges.length>64)fail('截面过于复杂');let wire=shape,face=null;if(withFace){wire=keep(cad.assembleWire(edges));const used=wire.edges;owned.push(...used);if(used.length!==edges.length)fail('截面边未完整连接，不能忽略缺边');face=keep(cad.makeFace(wire));const check=keep(new oc.BRepCheck_Analyzer(face.wrapped,true,false));if(!check.IsValid())fail('截面不是一个有效闭合外环');}return{wire,face,edges,bounds:exactBounds(shape)};}
  const profile=section(s0),sb=profile.bounds,centerX=(sb[0][0]+sb[1][0])/2,width=sb[1][0]-sb[0][0],height=sb[1][2]-sb[0][2],radius=width/2;
  if(profile.edges.some(e=>!['LINE','CIRCLE'].includes(e.geomType)))fail('首版端头圆润支持直线与圆弧截面；椭圆或样条截面暂不支持');
  if(Math.min(width,height)<=tol||radius>depthMm+tol)fail(`重建深度须至少为半宽 ${radius.toFixed(6)} mm，避免加长零件`);
  const probe=Math.min(width,height,depthMm)*.05;
  if(s0-2*probe<=bounds[0][1]+tol)fail('没有足够的直杆截面用于连接');
  const neighborProfiles=[section(s0-probe,false),section(s0-2*probe,false)];
  let sectionDeviation=0,symmetryDeviation=0,profileAngle=0;
  const endpoints=[];
  for(const edge of profile.edges){for(let i=0;i<=8;i++){const p=tuple(edge.pointAt(i/8));const mirror=keep(cad.makeVertex([2*centerX-p[0],s0,p[2]]));symmetryDeviation=Math.max(symmetryDeviation,cad.measureDistanceBetween(mirror,profile.wire));for(let j=0;j<2;j++){const v=keep(cad.makeVertex([p[0],s0-(j+1)*probe,p[2]]));sectionDeviation=Math.max(sectionDeviation,cad.measureDistanceBetween(v,neighborProfiles[j].wire));}}
   endpoints.push({p:tuple(edge.startPoint),t:tuple(edge.tangentAt(0))},{p:tuple(edge.endPoint),t:tuple(edge.tangentAt(1)).map(v=>-v)});
  }
  if(symmetryDeviation>tol||sectionDeviation>tol)fail('当前端部不是对称、稳定的直杆截面','END_ROUNDING_UNSUPPORTED',{symmetryDeviation,sectionDeviation,s0,bounds,profileBounds:sb,neighborBounds:neighborProfiles.map(p=>p.bounds),probe});
  for(let i=0;i<endpoints.length;i++){const matches=endpoints.filter((q,j)=>i!==j&&gap(q.p,endpoints[i].p)<=tol);if(matches.length!==1)fail('截面连接存在歧义或孔环');profileAngle=Math.max(profileAngle,angle(endpoints[i].t,matches[0].t.map(v=>-v)));}
  if(profileAngle>1)fail('截面自身有明显尖角；此工具保留截面，先将截面圆润后再重建端头',undefined,{profileAngleDeg:profileAngle});
  const margin=Math.max(width,height,depthMm,1),halfBox=keep(cad.makeBox([centerX,s0-margin,sb[0][2]-margin],[sb[1][0]+margin,s0+margin,sb[1][2]+margin]));
  const half=boolean('BRepAlgoAPI_Common',profile.face,halfBox),halfFaces=half.faces;owned.push(...halfFaces);if(halfFaces.length!==1)fail('半截面不是一个面');
  const rotationAxis=keep(new oc.gp_Ax1(keep(new oc.gp_Pnt(centerX,s0,0)),keep(new oc.gp_Dir(0,0,1))));
  const revol=keep(new oc.BRepPrimAPI_MakeRevol(halfFaces[0].wrapped,rotationAxis,Math.PI,true));if(!revol.IsDone())fail('端头旋转未完成','KERNEL_BUILD_FAILED');
  const head=keep(cad.cast(revol.Shape()).asShape3D()),tool=keep(cad.makeBox([bounds[0][0]-margin,s0,bounds[0][2]-margin],[bounds[1][0]+margin,bounds[1][1]+margin,bounds[1][2]+margin]));
  const retained=boolean('BRepAlgoAPI_Cut',source,tool),candidate=boolean('BRepAlgoAPI_Fuse',retained,head).asShape3D();keep(candidate);
  const solids=candidate.solids;owned.push(...solids);const checker=keep(new oc.BRepCheck_Analyzer(candidate.wrapped,true,false));if(solids.length!==1||!checker.IsValid())fail('端头重建没有形成有效单实体','GEOMETRY_INVALID');
  const cb=exactBounds(candidate);if(cb[1][1]>bounds[1][1]+tol)fail('结果超出原长度','GEOMETRY_INVALID');
  const changedDistances=targetPoints.map(p=>{const v=keep(cad.makeVertex(p));const faces=candidate.faces;owned.push(...faces);return Math.min(...faces.map(f=>cad.measureDistanceBetween(v,f)));});
  if(changedDistances.some(d=>d<=tol))fail('有选边未发生可测量的圆润变化，可能已经处理过或选错位置','NO_CHANGE');
  function normal(edge,face,t){const curve=keep(new oc.BRepAdaptor_Curve2d(edge.wrapped,face.wrapped)),u=curve.FirstParameter()+t*(curve.LastParameter()-curve.FirstParameter()),uv=keep(curve.Value(u)),surface=keep(new oc.BRepAdaptor_Surface(face.wrapped,false)),props=keep(new oc.BRepGProp_Face(face.wrapped,false)),p=keep(new oc.gp_Pnt()),n=keep(new oc.gp_Vec());surface.D0(uv.X(),uv.Y(),p);props.Normal(uv.X(),uv.Y(),p,n);let value=vec(n);if(face.geomType==='SPHERE'){const sp=keep(surface.Sphere()),c=keep(sp.Location()),wu=keep(curve.Value(curve.FirstParameter()+.37*(curve.LastParameter()-curve.FirstParameter()))),wp=keep(new oc.gp_Pnt()),wn=keep(new oc.gp_Vec());props.Normal(wu.X(),wu.Y(),wp,wn);const outward=dot(vec(wp).map((v,i)=>v-vec(c)[i]),vec(wn))>0?1:-1;value=vec(p).map((v,i)=>(v-vec(c)[i])*outward);}
   if(length(value)<=1e-20)fail('接缝法向不可测','GEOMETRY_INVALID',{type:face.geomType,t,point:vec(p)});return{n:unit(value),gap:gap(vec(p),tuple(edge.pointAt(t)))};}
  const faces=candidate.faces,edges=candidate.edges;owned.push(...faces,...edges);const faceEdges=faces.map(f=>{const e=f.edges;owned.push(...e);return e;});
  let joinMax=0,headMax=0,maxGap=0,seamCount=0;const residualSeams=[];
  for(let ei=0;ei<edges.length;ei++){const e=edges[ei],b=exactBounds(e);if(b[0][1]<s0-tol||oc.BRep_Tool.Degenerated(e.wrapped))continue;const ids=faceEdges.flatMap((list,i)=>list.some(v=>v.wrapped.IsSame(e.wrapped))?[i]:[]);if(ids.length!==2)continue;let max=0;for(let j=0;j<=16;j++){const [a,b]=ids.map(id=>normal(e,faces[id],j/16));max=Math.max(max,angle(a.n,b.n));maxGap=Math.max(maxGap,a.gap,b.gap);}const join=b[1][1]<=s0+tol;if(join)joinMax=Math.max(joinMax,max);else headMax=Math.max(headMax,max);if(max>.1)residualSeams.push({edgeId:ei,angleDeg:max,kind:join?'body-join':'inherited-profile'});seamCount++;}
  if(maxGap>tol||joinMax>.1||headMax>Math.max(.1,profileAngle+.01))fail('重建新增了未允许的接缝折角','GEOMETRY_INVALID',{joinMax,headMax,maxGap});
  const added=boolean('BRepAlgoAPI_Cut',candidate,source),removed=boolean('BRepAlgoAPI_Cut',source,candidate);
  const addedVolume=volume(added),removedVolume=volume(removed),beforeVolume=volume(source),afterVolume=volume(candidate);
  for(const [diff,v]of [[added,addedVolume],[removed,removedVolume]])if(v>1e-8){const b=exactBounds(diff);if(b[0][1]<s0-tol||b[1][1]>bounds[1][1]+tol)fail('材料变化超出声明端头范围','GEOMETRY_INVALID');}
  if(Math.abs(afterVolume-beforeVolume-addedVolume+removedVolume)>1e-5)fail('材料差集不闭合','GEOMETRY_INVALID');
  const result=cad.cast(inverse.transform(candidate.wrapped)).asShape3D();
  result.endRoundingReport={version:1,strategy:'half-profile-revolution',status:residualSeams.length?'rounded-with-inherited-creases':'rounded',requestedEdgeIds:[...edgeIds],axis,direction,profileAxis,depthMm,
   connectionPositionMm:s0,sectionWidthMm:width,sectionHeightMm:height,sectionDeviationMm:sectionDeviation,symmetryDeviationMm:symmetryDeviation,sourceProfileAngleDeg:profileAngle,
   maxJoinAngleDeg:joinMax,maxHeadAngleDeg:headMax,maxGapMm:maxGap,residualSeams,seamCount,stationsPerSeam:17,
   sourceVolumeMm3:beforeVolume,resultVolumeMm3:afterVolume,addedVolumeMm3:addedVolume,removedVolumeMm3:removedVolume,lengthChangeMm:cb[1][1]-bounds[1][1],targetDisplacementsMm:changedDistances,
   limitations:['规则对称恒截面端头；首版支持线段、圆弧截面，不支持椭圆或样条。','原截面不超过1度的折痕会保留并报告；不宣称整件G1/G2。','世界主轴方向；局部替换可加减料，必须先看预览。']};
  return result;
 }finally{owned.reverse().forEach(dispose);}
}
