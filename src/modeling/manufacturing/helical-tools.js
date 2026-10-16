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
  let copy,adaptor,cylinder,axis,location,direction,point,framePoint,normal,cutter,clip,trimmed,result,localSource,localResult;let faces=[];
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
    // Differential normals have length equal to the cylinder radius in OCCT.
    // Compare directions after normalizing, including small tapped bores.
    normal=face.normalAt(surfacePoint);const n=unit(normal.toTuple()),outward=n.reduce((sum,x,i)=>sum+x*radial[i],0);
    if(p.kind==='external'?outward<0.9:outward>-.9)fail('内／外螺纹类型与圆柱面的材料侧不匹配');
    const base=origin.map((x,i)=>x+dir[i]*(v0+start));
    // Normalize the full cylinder frame, including its angular seam. Building
    // the cutter in world axes (or moving it only after sweeping) can produce
    // a valid-looking boolean that removes no material on small rotated pins.
    const lower=origin.map((x,i)=>x+dir[i]*v0),rotationAxis=cross(dir,[0,0,1]);
    const rotationNorm=Math.hypot(...rotationAxis),cos=Math.max(-1,Math.min(1,dir[2]));
    const rotateAngle=Math.acos(cos)*180/Math.PI;
    const rotateAxis=rotationNorm>1e-12?rotationAxis.map(x=>x/rotationNorm):[1,0,0];
    framePoint=adaptor.Value(0,v);
    const frameRadial=unit(xyz(framePoint).map((x,i)=>x-axisPoint[i]));
    const theta=rotateAngle*Math.PI/180,radialCross=cross(rotateAxis,frameRadial);
    const radialDot=rotateAxis.reduce((sum,x,i)=>sum+x*frameRadial[i],0);
    const alignedRadial=frameRadial.map((x,i)=>x*Math.cos(theta)+radialCross[i]*Math.sin(theta)+rotateAxis[i]*radialDot*(1-Math.cos(theta)));
    const yaw=-Math.atan2(alignedRadial[1],alignedRadial[0])*180/Math.PI;
    localSource=copy.clone().translate(lower.map(x=>-x));
    if(rotateAngle>1e-10)localSource=localSource.rotate(rotateAngle,[0,0,0],rotateAxis);
    if(Math.abs(yaw)>1e-10)localSource=localSource.rotate(yaw,[0,0,0],[0,0,1]);
    const localBase=[0,0,start],localDir=[0,0,1];
    const margin=Math.max(1e-4,depth*.05),tip=p.kind==='external'?radius-depth:radius+depth,outer=p.kind==='external'?radius+margin:radius-margin;
    const width=(depth+margin)*Math.tan(angle*Math.PI/360);
    // OCCT can classify a long internal helical cutter wholly inside the pilot
    // bore (M2, 0.4 pitch, 3 mm depth). Limit each internal sweep to one turn.
    // Clip to the GLOBAL interval, preserving profile-cap overlap between turns.
    const makeCutter=span=>{
      let path,sectionPlane,section,tool;let pathEdges=[];
      try{
        path=cad.makeHelix(pitch,span,radius,localBase,localDir,p.leftHanded??false);pathEdges=path.edges;
        const first=pathEdges[0].startPoint.toTuple(),xDir=unit(first.map((x,i)=>x-localBase[i]));
        sectionPlane=new cad.Plane(localBase,xDir,cross(xDir,localDir));
        section=cad.draw([outer,-width]).lineTo([tip,0]).lineTo([outer,width]).close().sketchOnPlane(sectionPlane);
        tool=cad.genericSweep(section.wire,path,{frenet:true,forceProfileSpineOthogonality:false});assertSolid(tool,oc,cad);
        const out=tool;tool=null;return out;
      }finally{[tool,section,sectionPlane,...pathEdges,path].forEach(dispose);}
    };
    const before=cad.measureVolume(copy),segmentLength=p.kind==='internal'?Math.min(pitch,length):length;
    cutter=makeCutter(segmentLength);clip=cad.makeCylinder(radius+depth+margin+1,length,localBase,localDir);
    localResult=localSource.clone();
    const count=p.kind==='internal'?Math.ceil(length/pitch-1e-12):1;
    for(let i=0;i<count;i++){
      const offset=i*pitch,span=Math.min(segmentLength,length-offset);let shifted,partial,next;
      try{
        partial=span<segmentLength-1e-9?makeCutter(span):null;
        shifted=(partial??cutter).clone().translate([0,0,offset]);trimmed=shifted.intersect(clip);
        next=localResult.cut(trimmed);assertSolid(next,oc,cad);
        dispose(localResult);localResult=next;next=null;
      }finally{[next,trimmed,shifted,partial].forEach(dispose);trimmed=null;}
    }
    if(Math.abs(yaw)>1e-10)localResult=localResult.rotate(-yaw,[0,0,0],[0,0,1]);
    if(rotateAngle>1e-10)localResult=localResult.rotate(-rotateAngle,[0,0,0],rotateAxis);
    result=localResult.translate(lower);localResult=null;assertSolid(result,oc,cad);
    const after=cad.measureVolume(result);if(before-after<=Math.max(1e-7,before*1e-9))fail('刀具未实际去除材料');
    result.threadReport={profile:'explicit-symmetric-V-groove',standard:'none',faceId:p.faceId,kind:p.kind,radiusMm:radius,axisOrigin:base,axisDirection:dir,pitchMm:pitch,depthMm:depth,lengthMm:length,turns:length/pitch,includedAngleDeg:angle,leftHanded:p.leftHanded??false};
    const out=result;result=null;return out;
  } catch(e) { if(String(e.message).startsWith('螺旋特征'))throw e; fail('螺纹切除失败，请检查面、牙深、螺距与长度'); }
  finally { [result,localResult,localSource,trimmed,clip,cutter,normal,framePoint,point,direction,location,axis,cylinder,adaptor,...faces,copy].forEach(dispose); }
}
