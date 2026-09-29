const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=message=>{throw new Error(`蘑菇撞钉：${message}`);};

function assertCompound(shape,cad){
  const solids=shape.solids;let checker;
  try{
    if(solids.length!==2)fail('结果必须保留面盖和钉脚两个实体');
    checker=new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false);
    if(!checker.IsValid()||!(cad.measureVolume(shape)>1e-9))fail('结果无效或体积为零');
  }finally{solids.forEach(dispose);dispose(checker);}
}

function revolveProfile(cad,points,hold){
  const pt=([r,z])=>[r,0,z],edges=[];
  for(const segment of points)edges.push(hold(segment.length===2?cad.makeLine(pt(segment[0]),pt(segment[1])):cad.makeThreePointArc(pt(segment[0]),pt(segment[1]),pt(segment[2]))));
  const wire=hold(cad.assembleWire(edges));
  const face=hold(cad.makeFace(wire));
  return hold(cad.revolution(face,[0,0,0],[0,0,1],360));
}

function circlePoint(center,radius,angle){return [center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle)];}
function arcMidpoint(center,radius,start,end,direction){
  let delta=end-start;
  if(direction==='ccw')while(delta<0)delta+=2*Math.PI;
  else while(delta>0)delta-=2*Math.PI;
  return circlePoint(center,radius,start+delta/2);
}

function capProfile(capDiameter,rise,edgeRadius){
  const rim=capDiameter/2, x=rim-edgeRadius;
  const sphereRadius=(x*x+rise*rise-2*rise*edgeRadius)/(2*(rise-2*edgeRadius));
  if(!(x>0&&rise>2*edgeRadius&&sphereRadius>edgeRadius))fail('面盖尺寸不能构成球面与背缘圆角的内切轮廓');
  const sphereCenter=[0,rise-sphereRadius],edgeCenter=[x,edgeRadius],centerDistance=sphereRadius-edgeRadius;
  const tangent=[sphereCenter[0]+sphereRadius/centerDistance*(edgeCenter[0]-sphereCenter[0]),sphereCenter[1]+sphereRadius/centerDistance*(edgeCenter[1]-sphereCenter[1])];
  const sphereTop=Math.PI/2,sphereTouch=Math.atan2(tangent[1]-sphereCenter[1],tangent[0]);
  const edgeTouch=Math.atan2(tangent[1]-edgeCenter[1],tangent[0]-edgeCenter[0]),edgeRim=-Math.PI/2;
  const sphereMid=arcMidpoint(sphereCenter,sphereRadius,sphereTop,sphereTouch,'cw');
  const edgeMid=arcMidpoint(edgeCenter,edgeRadius,edgeTouch,edgeRim,'cw');
  return {sphereRadius,tangent,edges:[[[0,rise],sphereMid,tangent],[tangent,edgeMid,[x,0]],[[x,0],[0,0]],[[0,0],[0,rise]]]};
}

function postProfile({shaftRadius,length,tipRound,flangeRadius,flangeThickness,shoulderHeight,waistRadius,waistDepth,waistCenterFromTip,waistBlendRadius}){
  const r=shaftRadius,f=waistBlendRadius,R=waistRadius,z0=waistCenterFromTip,mainRadial=r+R-waistDepth,smallRadial=r-f;
  const separation=Math.sqrt((R+f)**2-(mainRadial-smallRadial)**2);
  const zLower=z0-separation,zUpper=z0+separation;
  if(!(smallRadial>0&&R>waistDepth&&separation>0&&zLower>tipRound&&zUpper<length-flangeThickness-shoulderHeight))fail('浅腰、圆角和直杆之间没有有效相切区间');
  const main=[mainRadial,z0],lower=[smallRadial,zLower],upper=[smallRadial,zUpper];
  const lowerMain=[main[0]+R/(R+f)*(lower[0]-main[0]),main[1]+R/(R+f)*(lower[1]-main[1])];
  const upperMain=[main[0]+R/(R+f)*(upper[0]-main[0]),main[1]+R/(R+f)*(upper[1]-main[1])];
  const lowerBlend=[smallRadial,zLower],upperBlend=[smallRadial,zUpper];
  const lowA=0,lowB=Math.atan2(lowerMain[1]-zLower,lowerMain[0]-smallRadial);
  const lowMid=arcMidpoint(lowerBlend,f,lowA,lowB,'ccw');
  const mainA=Math.atan2(lowerMain[1]-z0,lowerMain[0]-mainRadial),mainB=Math.atan2(upperMain[1]-z0,upperMain[0]-mainRadial);
  const mainMid=arcMidpoint(main,R,mainA,mainB,'cw');
  const upA=Math.atan2(upperMain[1]-zUpper,upperMain[0]-smallRadial),upB=0;
  const upMid=arcMidpoint(upperBlend,f,upA,upB,'ccw');
  const tipCenter=[r-tipRound,tipRound],tipA=-Math.PI/2,tipB=0;
  const tipMid=arcMidpoint(tipCenter,tipRound,tipA,tipB,'ccw');
  const shoulderRadius=shoulderHeight,shoulderCenter=[r+shoulderRadius,length-flangeThickness-shoulderHeight];
  const shoulderMid=arcMidpoint(shoulderCenter,shoulderRadius,Math.PI,Math.PI/2,'cw');
  const shoulderTop=[shoulderCenter[0],length-flangeThickness];
  return {
    waistMinimumRadius:mainRadial-R,waistLowerTangentZ:zLower,waistUpperTangentZ:zUpper,
    edges:[
      [[0,0],[r-tipRound,0]],[[r-tipRound,0],tipMid,[r,tipRound]],
      [[r,tipRound],[r,zLower]],[[r,zLower],lowMid,lowerMain],
      [lowerMain,mainMid,upperMain],[upperMain,upMid,[r,zUpper]],
      [[r,zUpper],[r,shoulderCenter[1]]],[[r,shoulderCenter[1]],shoulderMid,shoulderTop],
      [shoulderTop,[flangeRadius,length-flangeThickness]],
      [[flangeRadius,length-flangeThickness],[flangeRadius,length]],
      [[flangeRadius,length],[0,length]],[[0,length],[0,0]],
    ],
  };
}

export function build(params,cad,_options,{definitions}){
  const definition=definitions.mushroomRivet;
  if(Object.keys(params||{}).some(key=>key!=='kind'&&!Object.hasOwn(definition.defaults,key)))fail('参数存在未知字段');
  const p={...definition.defaults,...params};
  for(const key of Object.keys(definition.defaults))if(typeof p[key]!=='boolean'&&!Number.isFinite(Number(p[key])))fail(`${key} 必须为有限数`);
  const n=key=>Number(p[key]);
  const capDiameter=n('capDiameterMm'),capRise=n('capRiseMm'),capEdge=n('capEdgeRadiusMm');
  const collarOuter=n('collarOuterDiameterMm'),collarInner=n('collarInnerDiameterMm'),collarLength=n('collarLengthMm');
  const postOuter=n('postOuterDiameterMm'),postInner=n('postInnerDiameterMm'),postLength=n('postLengthMm');
  const flangeDiameter=n('flangeDiameterMm'),flangeThickness=n('flangeThicknessMm'),shoulderHeight=n('shoulderHeightMm');
  const tipRound=n('tipRoundRadiusMm'),waistRadius=n('waistRadiusMm'),waistDepth=n('waistDepthMm'),waistCenter=n('waistCenterFromTipMm'),waistBlend=n('waistBlendRadiusMm');
  const boreDepth=n('postBoreDepthMm'),offset=n('explodedOffsetMm');
  if(!(capDiameter>0&&capRise>0&&capEdge>0&&collarOuter>0&&collarInner>0&&collarLength>0&&postOuter>0&&postInner>0&&postLength>0&&flangeDiameter>0&&flangeThickness>0&&shoulderHeight>0&&tipRound>0&&waistRadius>0&&waistDepth>0&&waistCenter>0&&waistBlend>0&&boreDepth>=0))fail('尺寸须为有效正值，孔深可为零');
  if(!(capRise>2*capEdge&&capDiameter/2>capEdge))fail('面盖拱高与外径须容纳背缘圆角');
  if(!(capDiameter>collarOuter&&collarOuter>collarInner&&collarInner>postOuter))fail('尺寸须满足 面盖>套筒外径>套筒内径>钉脚外径');
  if(!(postOuter>postInner&&flangeDiameter>postOuter&&postLength>flangeThickness+shoulderHeight&&tipRound<postOuter/2))fail('钉脚壁厚、底盘或肩部尺寸无效');
  if(typeof p.boreFromFlange!=='boolean')fail('boreFromFlange 必须为布尔值');
  if(!(flangeDiameter/2>postOuter/2+shoulderHeight))fail('底盘半径不足以容纳根肩圆角');
  const capGeometry=capProfile(capDiameter,capRise,capEdge);
  const geometry=postProfile({shaftRadius:postOuter/2,length:postLength,tipRound,flangeRadius:flangeDiameter/2,flangeThickness,shoulderHeight,waistRadius,waistDepth,waistCenterFromTip:waistCenter,waistBlendRadius:waistBlend});
  if(boreDepth>postLength)fail('钉脚孔深不能超过总长');
  const boreRadius=postInner/2,boreCrossesWaist=p.boreFromFlange?postLength-boreDepth<=waistCenter:boreDepth>=waistCenter;
  if(boreRadius>=geometry.waistMinimumRadius&&boreCrossesWaist)fail('钉脚盲孔深度会切穿浅腰并破坏实体连续性');
  if(offset<0||(offset>0&&offset<capDiameter/2+flangeDiameter/2+.2))fail('分开展示中心距为 0，或须足以避免两件重叠');
  const held=[];const hold=value=>(held.push(value),value);let result=null;
  try{
    const head=revolveProfile(cad,capGeometry.edges,hold);
    const collarBlank=hold(cad.makeCylinder(collarOuter/2,collarLength,[0,0,-collarLength]));
    const collarBore=hold(cad.makeCylinder(collarInner/2,collarLength+2,[0,0,-collarLength-1]));
    const collarRing=hold(collarBlank.cut(collarBore));
    const cap=hold(head.fuse(collarRing));
    const postBlank=revolveProfile(cad,geometry.edges,hold);
    let post=postBlank;
    if(boreDepth>0){
      const zStart=p.boreFromFlange?postLength-boreDepth:0;
      const bore=p.boreFromFlange?hold(cad.makeCylinder(postInner/2,boreDepth+.002,[0,0,zStart])):hold(cad.makeCylinder(postInner/2,boreDepth+.002,[0,0,zStart-.002]));
      post=hold(postBlank.cut(bore));
    }
    const turnedPost=hold(post.rotate(180,[0,0,0],[1,0,0]));
    const placedPost=offset===0?turnedPost:hold(turnedPost.translate([offset,0,0]));
    result=cad.makeCompound([cap,placedPost]);assertCompound(result,cad);
    result.mushroomRivetReport={
      capDiameterMm:capDiameter,capRiseMm:capRise,capEdgeRadiusMm:capEdge,capSphereRadiusMm:capGeometry.sphereRadius,capActualDiameterMm:2*(capDiameter/2),
      collarOuterDiameterMm:collarOuter,collarInnerDiameterMm:collarInner,collarLengthMm:collarLength,
      postOuterDiameterMm:postOuter,postInnerDiameterMm:postInner,postLengthMm:postLength,flangeDiameterMm:flangeDiameter,flangeThicknessMm:flangeThickness,
      shoulderHeightMm:shoulderHeight,tipRoundRadiusMm:tipRound,waistRadiusMm:waistRadius,waistDepthMm:waistDepth,waistCenterFromTipMm:waistCenter,waistBlendRadiusMm:waistBlend,waistMinimumRadiusMm:geometry.waistMinimumRadius,waistLowerTangentZMm:geometry.waistLowerTangentZ,waistUpperTangentZMm:geometry.waistUpperTangentZ,
      postBoreDepthMm:boreDepth,boreFromFlange:p.boreFromFlange,explodedOffsetMm:offset,diametralClearanceMm:collarInner-postOuter,
    };
    const complete=result;result=null;return complete;
  }catch(error){if(String(error?.message||'').startsWith('蘑菇撞钉：'))throw error;fail(`建模失败：${error?.message||'内核运算失败'}`);}
  finally{dispose(result);held.reverse().forEach(dispose);}
}
