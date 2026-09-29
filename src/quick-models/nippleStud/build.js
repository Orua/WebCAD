const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=message=>{throw new Error(`奶嘴钉：${message}`);};

function profileRevolve(cad,segments){
  const owned=[],hold=value=>{owned.push(value);return value;},pt=([r,z])=>[r,0,z];
  let wire,face,result;
  try{
    const edges=segments.map(s=>hold(s.length===2?cad.makeLine(pt(s[0]),pt(s[1])):cad.makeThreePointArc(pt(s[0]),pt(s[1]),pt(s[2]))));
    wire=hold(cad.assembleWire(edges));face=hold(cad.makeFace(wire));
    result=cad.revolution(face,[0,0,0],[0,0,1],360);const done=result;result=null;return done;
  }finally{dispose(result);owned.reverse().forEach(dispose);}
}
function prism(cad,face,height){
  const vector=new (cad.getOC().gp_Vec)(0,0,height),maker=new (cad.getOC().BRepPrimAPI_MakePrism)(face.wrapped,vector,false,true);
  try{return cad.cast(maker.Shape());}finally{dispose(vector);dispose(maker);}
}
function assertCompound(shape,cad){
  const solids=shape.solids;let checker;
  try{
    if(solids.length!==2)fail(`结果必须保留A件和配件两个实体（当前${solids.length}个）`);
    checker=new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false);
    if(!checker.IsValid()||!(cad.measureVolume(shape)>1e-9))fail('结果无效或体积为零');
  }finally{solids.forEach(dispose);dispose(checker);}
}
function sixLobeTool(cad,radius,depth,topZ){
  const owned=[],hold=value=>{owned.push(value);return value;};let wire,face,result;
  try{
    const points=Array.from({length:72},(_,i)=>{const t=2*Math.PI*i/72,r=radius*(1+.13*Math.cos(6*t));return [r*Math.cos(t),r*Math.sin(t),topZ];});
    points.push(points[0]);wire=hold(cad.assembleWire(points.slice(0,-1).map((p,i)=>hold(cad.makeLine(p,points[i+1])))));
    face=hold(cad.makeFace(wire));result=prism(cad,face,depth);const done=result;result=null;return done;
  }finally{dispose(result);owned.reverse().forEach(dispose);}
}

export function build(params,cad,_options,{definitions}){
  const definition=definitions.nippleStud;
  if(Object.keys(params||{}).some(key=>key!=='kind'&&!Object.hasOwn(definition.defaults,key)))fail('参数存在未知字段');
  const p={...definition.defaults,...params};
  for(const key of Object.keys(definition.defaults))if(!Number.isFinite(Number(p[key])))fail(`${key} 必须为有限数`);
  const n=key=>Number(p[key]),headD=n('headDiameterMm'),totalH=n('overallHeightMm'),neckD=n('neckDiameterMm'),neckH=n('neckHeightMm');
  const baseD=n('flangeDiameterMm'),baseH=n('flangeThicknessMm'),oldCollarH=n('undersideCollarHeightMm');
  const boreD=n('boreDiameterMm'),boreH=n('boreDepthMm'),entry=n('entryChamferMm'),edgeR=n('baseEdgeRadiusMm');
  const screwD=n('screwHeadDiameterMm'),screwH=n('screwHeadThicknessMm'),stemD=n('screwDiameterMm'),stemH=n('screwLengthMm');
  const crown=n('screwCrownRiseMm'),screwEdge=n('screwEdgeRadiusMm'),driveD=n('driveDiameterMm'),driveH=n('driveDepthMm');
  const gap=n('assemblyGapMm'),offset=n('explodedOffsetMm');
  if(oldCollarH!==0)fail('undersideCollarHeightMm 已弃用；旧底部小台简化值必须设为 0，底部入口倒角由 entryChamferMm 表示');
  if(![headD,totalH,neckD,neckH,baseD,baseH,boreD,boreH,screwD,screwH,stemD,stemH,crown,driveD].every(v=>v>0)||driveH<0||entry<0||edgeR<0||screwEdge<0||gap<0||offset<0)fail('实体尺寸须为正，槽深、圆角、倒角、间隙及分开展示距离不得为负');
  if(!(baseD>neckD&&headD>neckD&&screwD>stemD&&neckH>0&&totalH>baseH+neckH))fail('头部、颈部、底座和配件直径/高度关系无效');
  if(!(edgeR<Math.min(baseH,(baseD-neckD)/2)&&entry<boreD/2&&boreD<neckD&&boreH<totalH&&entry<boreH))fail('底座圆角、入口倒角、孔径或盲孔深度超出可用材料');
  if(!(crown>screwEdge&&crown<screwH&&driveD<screwD&&driveH<screwH))fail('螺钉拱高、槽径或槽深超过头部尺寸');
  const topZ=baseH+neckH,headR=headD/2,centerZ=topZ+Math.sqrt(headR*headR-neckD*neckD/4);
  const capTop=totalH-centerZ;if(!(capTop>0&&capTop<headR))fail('A件总高无法形成圆弧头和平顶');
  if(offset>0&&offset<baseD/2+screwD/2+.2)fail('分开展示中心距为 0，或须足以避免两件重叠');
  const held=[],hold=value=>{held.push(value);return value;};let result=null,stage='A件母线';
  try{
    const q=Math.SQRT1_2,outer=baseD/2;
    let a=hold(profileRevolve(cad,[
      [[0,0],[outer,0]],[[outer,0],[outer,baseH-edgeR]],[[outer,baseH-edgeR],[outer-edgeR+edgeR*q,baseH-edgeR+edgeR*q],[outer-edgeR,baseH]],[[outer-edgeR,baseH],[neckD/2,baseH]],[[neckD/2,baseH],[neckD/2,topZ]],
      [[neckD/2,topZ],[headR,centerZ],[Math.sqrt(headR*headR-capTop*capTop),totalH]],[[Math.sqrt(headR*headR-capTop*capTop),totalH],[0,totalH]],[[0,totalH],[0,0]],
    ]));
    let bore=hold(cad.makeCylinder(boreD/2,boreH-entry,[0,0,entry]));let next=hold(a.cut(bore));a=next;
    if(entry>0){const chamfer=hold(profileRevolve(cad,[[[0,0],[boreD/2+entry,0]],[[boreD/2+entry,0],[boreD/2,entry]],[[boreD/2,entry],[0,entry]],[[0,entry],[0,0]]]));next=hold(a.cut(chamfer));a=next;}
    stage='Z件球冠母线';const rim=screwD/2,x=rim-screwEdge;
    const R=(x*x+crown*crown-screwEdge*screwEdge)/(2*(crown-screwEdge));
    if(!(R>screwEdge&&x>0))fail('螺钉边缘圆角与球冠不相切');
    const tangent=[x+x*screwEdge/(R-screwEdge),crown+(crown-R)*screwEdge/(R-screwEdge)];
    const smallStart=0,smallEnd=Math.atan2(tangent[1]-crown,tangent[0]-x),smallMid=(smallStart+smallEnd)/2;
    const sphereStart=Math.atan2(tangent[1]-R,tangent[0]),sphereMid=(sphereStart-Math.PI/2)/2;
    let screw=hold(profileRevolve(cad,[
      [[rim,screwH],[rim,crown]],
      [[rim,crown],[x+screwEdge*Math.cos(smallMid),crown+screwEdge*Math.sin(smallMid)],tangent],
      [tangent,[R*Math.cos(sphereMid),R+R*Math.sin(sphereMid)],[0,0]],
      [[0,0],[0,screwH]],[[0,screwH],[rim,screwH]],
    ]));
    if(driveH>0){stage='Z件六瓣槽';const cutter=hold(sixLobeTool(cad,driveD/2,driveH+.02,-.02));next=hold(screw.cut(cutter));screw=next;}
    const stem=hold(cad.makeCylinder(stemD/2,stemH,[0,0,screwH]));next=hold(screw.fuse(stem));screw=next;
    const placed=offset>0?hold(screw.translate([offset,0,0])):hold(screw.translate([0,0,-(screwH+gap)]));
    result=cad.makeCompound([a,placed]);assertCompound(result,cad);
    result.nippleStudReport={headDiameterMm:headD,flatTopDiameterMm:2*Math.sqrt(headR*headR-capTop*capTop),overallHeightMm:totalH,neckDiameterMm:neckD,neckHeightMm:neckH,flangeDiameterMm:baseD,flangeThicknessMm:baseH,boreDiameterMm:boreD,boreDepthMm:boreH,entryChamferMm:entry,baseEdgeRadiusMm:edgeR,screwHeadDiameterMm:screwD,screwHeadThicknessMm:screwH,screwCrownRiseMm:crown,screwEdgeRadiusMm:screwEdge,screwSphereRadiusMm:R,screwDiameterMm:stemD,screwLengthMm:stemH,driveDiameterMm:driveD,driveDepthMm:driveH,driveProfile:'parameterized six-lobe approximation; not a specified standard size',assemblyGapMm:gap,explodedOffsetMm:offset};
    const complete=result;result=null;return complete;
  }catch(error){if(String(error?.message||'').startsWith('奶嘴钉：'))throw error;fail(`${stage}失败：${error?.message||'内核运算失败'}`);}
  finally{dispose(result);held.reverse().forEach(dispose);}
}
