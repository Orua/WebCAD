const dispose=shape=>{try{shape?.delete?.();}catch{}};
const mirror=point=>[-point[0],point[1]];
const shortArcMid=(center,start,end)=>{
  const a=[start[0]-center[0],start[1]-center[1]];
  const b=[end[0]-center[0],end[1]-center[1]];
  const al=Math.hypot(...a),bl=Math.hypot(...b);
  const direction=[a[0]/al+b[0]/bl,a[1]/al+b[1]/bl];
  const dl=Math.hypot(...direction);
  if(!(al>0&&bl>0&&dl>1e-9))throw new Error('相切过渡圆弧退化');
  return [center[0]+al*direction[0]/dl,center[1]+al*direction[1]/dl];
};
const transition=(centerX,radius,barZ,transitionRadius)=>{
  const center=[centerX,0];
  const arcCenterZ=barZ+transitionRadius;
  const q=(transitionRadius+radius)**2-arcCenterZ**2;
  if(!(q>0))throw new Error('过渡半径与扁带高度不能形成相切圆弧');
  const arcCenter=[centerX-Math.sqrt(q),arcCenterZ];
  if(!(arcCenter[0]>0&&arcCenter[0]<centerX))throw new Error('过渡圆心必须位于中央带与卷眼之间');
  const ratio=radius/(transitionRadius+radius);
  const tangent=[center[0]+ratio*(arcCenter[0]-center[0]),center[1]+ratio*(arcCenter[1]-center[1])];
  const stripEnd=[arcCenter[0],barZ];
  return {arcCenter,tangent,stripEnd,mid:shortArcMid(arcCenter,stripEnd,tangent)};
};

export function build(params,cad,_options,{definitions}) {
  const definition=definitions.pullCoreBar;
  if(Object.keys(params||{}).some(key=>key!=='kind'&&!Object.hasOwn(definition.defaults,key)))throw new Error('拉心扣活动芯参数存在未知字段');
  const p={...definition.defaults,...params};
  const keys=['eyePitchMm','eyeInnerDiameterMm','widthMm','eyeWallMm','barThicknessMm','barCenterHeightMm','outerTransitionRadiusMm','innerTransitionRadiusMm','tailLengthMm','tailAngleDeg'];
  for(const key of keys)if(!Number.isFinite(Number(p[key])))throw new Error(key+' 必须为有限数');
  const [pitch,innerDiameter,width,eyeWall,barThickness,barHeight,outerRadiusT,innerRadiusT,tailLength,tailAngle]=keys.map(key=>Number(p[key]));
  if(!(pitch>0&&innerDiameter>0&&width>0&&eyeWall>0&&barThickness>0&&outerRadiusT>0&&innerRadiusT>0&&tailLength>0))throw new Error('轴距、内径、宽度、壁厚、扁带厚、过渡半径和尾舌长度须为正');
  if(!(tailAngle>=0&&tailAngle<=60))throw new Error('尾舌角须在 0–60°');
  const innerRadius=innerDiameter/2;
  const outerRadius=innerRadius+eyeWall;
  if(pitch<=2*outerRadius)throw new Error('两眼轴心距须大于卷眼外径');
  const centerX=pitch/2;
  const topZ=barHeight+barThickness/2;
  const bottomZ=barHeight-barThickness/2;
  const outer=transition(centerX,outerRadius,topZ,outerRadiusT);
  const inner=transition(centerX,innerRadius,bottomZ,innerRadiusT);
  const beta=tailAngle*Math.PI/180;
  const normal=[-Math.sin(beta),-Math.cos(beta)];
  const inward=[-Math.cos(beta),Math.sin(beta)];
  const point=(radius,length=0)=>[centerX+radius*normal[0]+length*inward[0],radius*normal[1]+length*inward[1]];
  const qo=point(outerRadius),qi=point(innerRadius),eo=point(outerRadius,tailLength),ei=point(innerRadius,tailLength);
  if(eo[0]<=0||ei[0]<=0)throw new Error('尾舌过长并越过模型中心');

  const held=[];
  const hold=shape=>{held.push(shape);return shape;};
  let result;
  try{
    let drawing=cad.draw(mirror(outer.stripEnd)).lineTo(outer.stripEnd);
    drawing=drawing.threePointsArcTo(outer.tangent,outer.mid);
    drawing=drawing.threePointsArcTo(qo,[centerX+outerRadius,0]);
    drawing=drawing.lineTo(eo).lineTo(ei).lineTo(qi);
    drawing=drawing.threePointsArcTo(inner.tangent,[centerX+innerRadius,0]);
    drawing=drawing.threePointsArcTo(inner.stripEnd,inner.mid);
    drawing=drawing.lineTo(mirror(inner.stripEnd));
    drawing=drawing.threePointsArcTo(mirror(inner.tangent),mirror(inner.mid));
    drawing=drawing.threePointsArcTo(mirror(qi),[-centerX-innerRadius,0]);
    drawing=drawing.lineTo(mirror(ei)).lineTo(mirror(eo)).lineTo(mirror(qo));
    drawing=drawing.threePointsArcTo(mirror(outer.tangent),[-centerX-outerRadius,0]);
    drawing=drawing.threePointsArcTo(mirror(outer.stripEnd),mirror(outer.mid)).close();
    const sketch=hold(drawing.sketchOnPlane('XY'));
    const raw=hold(sketch.extrude(width));
    const rotated=hold(raw.rotate(90,[0,0,0],[1,0,0]));
    result=rotated.translate([0,width/2,0]);
    const complete=result;
    result=null;
    return complete;
  }finally{
    dispose(result);
    held.reverse().forEach(dispose);
  }
}
