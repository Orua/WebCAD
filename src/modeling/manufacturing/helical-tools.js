// Exact helix, round-wire coil and explicit V-groove thread; no cosmetic mesh.
const dispose = value => { try { value?.delete?.(); } catch {} };
const fail = message => { throw new Error(`螺旋特征：${message}`); };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = a => { const n=Math.hypot(...a); if(!Number.isFinite(n)||n<1e-9)fail('方向不能为零'); return a.map(v=>v/n); };
const xyz = p => [p.X(),p.Y(),p.Z()];
function positive(value,name) { if(!Number.isFinite(value)||value<=0)fail(`${name} 必须为正毫米数`); return value; }
function helicalParams(p) {
  const radius=positive(p.radiusMm,'中心线半径'),pitch=positive(p.pitchMm,'螺距'),turns=positive(p.turns,'圈数');
  if(turns>100)fail('圈数最大 100');
  if(p.leftHanded!==undefined&&typeof p.leftHanded!=='boolean')fail('leftHanded 须为布尔值');
  return {radius,pitch,height:pitch*turns,leftHanded:p.leftHanded??false};
}
function assertSolid(shape,oc,cad) {
  const solids=shape.solids; try { if(solids.length!==1)fail('结果必须为单一实体'); } finally { solids.forEach(dispose); }
  const check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);
  try { if(!check.IsValid()||!(cad.measureVolume(shape)>1e-9))fail('结果无效或体积为零'); } finally { dispose(check); }
}
export function buildHelix(p,cad) {
  const {radius,pitch,height,leftHanded}=helicalParams(p);
  return cad.makeHelix(pitch,height,radius,[0,0,0],[0,0,1],leftHanded);
}
export function buildCoil(p,oc,cad) {
  const {radius,pitch,height,leftHanded}=helicalParams(p),diameter=positive(p.wireDiameterMm,'线径');
  if(radius<=diameter/2)fail('中心线半径须大于线径的一半');
  // Conservative clearance is explicit. Adjacent turns must not fuse or overlap.
  if(pitch<=diameter)fail('螺距须大于线径，避免相邻圈自交');
  let spine,circle,profile,result;let edges=[];
  try {
    spine=cad.makeHelix(pitch,height,radius,[0,0,0],[0,0,1],leftHanded);edges=spine.edges;
    circle=cad.makeCircle(diameter/2,edges[0].startPoint.toTuple(),edges[0].tangentAt(0).toTuple());
    profile=cad.assembleWire([circle]);
    result=cad.genericSweep(profile,spine,{frenet:true,forceProfileSpineOthogonality:true});assertSolid(result,oc,cad);
    const out=result;result=null;return out;
  } catch(e) { if(String(e.message).startsWith('螺旋特征'))throw e; fail('弹簧扫掠失败，请增大半径或螺距'); }
  finally { [result,profile,circle,...edges,spine].forEach(dispose); }
}

// The selected exact cylindrical face supplies axis, surface radius and extent.
// The profile is an explicit symmetric V groove, not an ISO thread library.
export function buildThread(source,p,oc,cad) {
  if(!Number.isInteger(p.faceId)||p.faceId<0)fail('须明确选择当前圆柱面 faceId');
  if(!['external','internal'].includes(p.kind))fail('kind 须为 external 或 internal');
  const pitch=positive(p.pitchMm,'螺距'),depth=positive(p.depthMm,'牙深'),length=positive(p.lengthMm,'螺纹轴向长度');
  const start=p.startOffsetMm??0,angle=p.includedAngleDeg??60;
  if(!Number.isFinite(start)||start<0)fail('起始轴向偏移不能为负');
  if(!Number.isFinite(angle)||angle<20||angle>120)fail('V槽包含角须在 20–120° 内');
  if(length/pitch>100)fail('最多 100 圈');
  if(p.leftHanded!==undefined&&typeof p.leftHanded!=='boolean')fail('leftHanded 须为布尔值');
  const halfWidth=depth*Math.tan(angle*Math.PI/360);
  if(pitch<=2*halfWidth)fail('螺距须大于 V 槽的轴向牙宽');
  let copy,adaptor,cylinder,axis,location,direction,point,normal,spine,plane,sketch,cutter,clip,trimmed,result;let faces=[],edges=[];
  try {
    copy=cad.deserializeShape(source.serialize());assertSolid(copy,oc,cad);faces=copy.faces;
    const face=faces[p.faceId];if(!face||face.geomType!=='CYLINDRE')fail('选定面必须是解析圆柱面');
    adaptor=new oc.BRepAdaptor_Surface(face.wrapped,true);cylinder=adaptor.Cylinder();axis=cylinder.Axis();location=axis.Location();direction=axis.Direction();
    const origin=xyz(location),dir=unit(xyz(direction)),radius=cylinder.Radius(),v0=adaptor.FirstVParameter(),v1=adaptor.LastVParameter();
    if(![v0,v1,radius].every(Number.isFinite)||v1<=v0)fail('圆柱面无有限轴向范围');
    if(start+length>v1-v0+1e-6)fail('螺纹区间超出所选圆柱面的轴向范围');
    if(p.kind==='external'&&depth>=radius)fail('外螺纹牙深须小于圆柱半径');
    const u=(adaptor.FirstUParameter()+adaptor.LastUParameter())/2,v=(v0+v1)/2;
    point=adaptor.Value(u,v);const surfacePoint=xyz(point),axisPoint=origin.map((x,i)=>x+dir[i]*v),radial=unit(surfacePoint.map((x,i)=>x-axisPoint[i]));
    normal=face.normalAt(surfacePoint);const n=normal.toTuple(),outward=n.reduce((sum,x,i)=>sum+x*radial[i],0);
    if(p.kind==='external'?outward<0.9:outward>-.9)fail('内／外螺纹类型与圆柱面的材料侧不匹配');
    const base=origin.map((x,i)=>x+dir[i]*(v0+start));
    spine=cad.makeHelix(pitch,length,radius,base,dir,p.leftHanded??false);edges=spine.edges;
    const first=edges[0].startPoint.toTuple(),xDir=unit(first.map((x,i)=>x-base[i]));
    plane=new cad.Plane(base,xDir,cross(xDir,dir));
    const margin=Math.max(1e-4,depth*.05),tip=p.kind==='external'?radius-depth:radius+depth,outer=p.kind==='external'?radius+margin:radius-margin;
    // Slightly wider base keeps the specified angle of the material-side V.
    const width=(depth+margin)*Math.tan(angle*Math.PI/360);
    sketch=cad.draw([outer,-width]).lineTo([tip,0]).lineTo([outer,width]).close().sketchOnPlane(plane);
    cutter=cad.genericSweep(sketch.wire,spine,{frenet:true,forceProfileSpineOthogonality:false});assertSolid(cutter,oc,cad);
    clip=cad.makeCylinder(radius+depth+margin+1,length,base,dir);trimmed=cutter.intersect(clip);
    const before=cad.measureVolume(copy);result=copy.cut(trimmed);assertSolid(result,oc,cad);
    const after=cad.measureVolume(result);if(before-after<=Math.max(1e-7,before*1e-9))fail('刀具未实际去除材料');
    result.threadReport={profile:'explicit-symmetric-V-groove',standard:'none',faceId:p.faceId,kind:p.kind,radiusMm:radius,axisOrigin:base,axisDirection:dir,pitchMm:pitch,depthMm:depth,lengthMm:length,turns:length/pitch,includedAngleDeg:angle,leftHanded:p.leftHanded??false};
    const out=result;result=null;return out;
  } catch(e) { if(String(e.message).startsWith('螺旋特征'))throw e; fail('螺纹切除失败，请检查面、牙深、螺距与长度'); }
  finally { [result,trimmed,clip,cutter,sketch,plane,...edges,spine,normal,point,direction,location,axis,cylinder,adaptor,...faces,copy].forEach(dispose); }
}
