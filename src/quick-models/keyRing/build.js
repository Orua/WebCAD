const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=message=>{throw new Error(`匙圈：${message}`);};
const TAU=2*Math.PI;
const pointOn=(r,a,z)=>[r*Math.cos(a),r*Math.sin(a),z];
const tangentAt=(a,direction)=>[-Math.sin(a)*direction,Math.cos(a)*direction,0];

function assertSolid(shape,cad){
  const solids=shape.solids;
  try{if(solids.length!==1)fail(`结果必须为单一实体，实际 ${solids.length} 个`);}
  finally{solids.forEach(dispose);}
  const checker=new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false);
  try{if(!checker.IsValid()||!(cad.measureVolume(shape)>1e-9))fail('结果无效或体积为零');}
  finally{dispose(checker);}
}

function sectionAt(cad,hold,radius,angle,z,direction,width,depth,normal,cornerRadius){
  const center=pointOn(radius,angle,z),radial=[Math.cos(angle),Math.sin(angle),0];
  const plane=hold(new cad.Plane(center,radial,normal));
  const drawing=hold(cad.drawRoundedRectangle(width,depth,cornerRadius));
  const sketch=hold(drawing.sketchOnPlane(plane));
  return sketch.wire;
}

function arc(cad,hold,radius,start,end,z,direction){
  const middle=(start+end)/2;
  const edge=hold(cad.makeThreePointArc(pointOn(radius,start,z),pointOn(radius,middle,z),pointOn(radius,end,z)));
  return hold(cad.assembleWire([edge]));
}

function sweepLayer(cad,hold,radius,start,end,z,direction,width,depth,cornerRadius){
  const profile=sectionAt(cad,hold,radius,start,z,direction,width,depth,tangentAt(start,direction),cornerRadius);
  const path=arc(cad,hold,radius,start,end,z,direction);
  return hold(cad.genericSweep(profile,path,{frenet:false,forceProfileSpineOthogonality:true}));
}

function transition(cad,hold,radius,start,end,lowZ,highZ,direction,width,depth,cornerRadius){
  const stations=[];
  const count=8;
  for(let i=0;i<=count;i++){
    const t=i/count, eased=t*t*(3-2*t),angle=start+(end-start)*t;
    const normal=tangentAt(angle,direction);
    stations.push({centerMm:pointOn(radius,angle,lowZ+(highZ-lowZ)*eased),normal,widthDirection:[Math.cos(angle),Math.sin(angle),0]});
  }
  const wires=stations.map(s=>{
    const plane=hold(new cad.Plane(s.centerMm,s.widthDirection,s.normal));
    const drawing=hold(cad.drawRoundedRectangle(width,depth,cornerRadius));
    return hold(drawing.sketchOnPlane(plane)).wire;
  });
  const builder=hold(new (cad.getOC().BRepOffsetAPI_ThruSections)(true,false,1e-6));
  builder.SetMaxDegree(3);wires.forEach(w=>builder.AddWire(w.wrapped));builder.Build();
  return hold(cad.cast(builder.Shape()));
}

export function build(params,cad,_options,{definitions}){
  const definition=definitions.keyRing;
  if(Object.keys(params||{}).some(key=>key!=='kind'&&!Object.hasOwn(definition.defaults,key)))fail('参数存在未知字段');
  const p={...definition.defaults,...params};
  const numeric=['innerDiameterMm','outerDiameterMm','totalDepthMm','turns','layerGapMm','sectionCornerRadiusMm','transitionAngleDeg'];
  for(const key of numeric)if(!Number.isFinite(Number(p[key])))fail(`${key} 必须为有限数`);
  const inner=Number(p.innerDiameterMm),outer=Number(p.outerDiameterMm),totalDepth=Number(p.totalDepthMm),turns=Number(p.turns),gap=Number(p.layerGapMm);
  if(!(inner>0&&outer>inner&&totalDepth>0))fail('须满足外径大于内径，且直径与总厚为正');
  if(!(turns>1&&turns<2))fail('连续双层匙圈的绕卷圈数须大于 1 且小于 2');
  if(!(gap>=0))fail('层间隙不能为负');
  if(p.leftHanded!==undefined&&typeof p.leftHanded!=='boolean')fail('leftHanded 须为布尔值');
  const width=(outer-inner)/2,depth=(totalDepth-gap)/2,radius=(inner+outer)/4,corner=Number(p.sectionCornerRadiusMm);
  if(!(depth>0&&width>depth&&inner>2*width&&corner>0&&corner<Math.min(width,depth)/2))fail('料宽、单层厚度、圆角或内径比例不适合圆角矩形双层绕制');
  const handed=p.leftHanded??false,direction=handed?-1:1;
  const transitionDegrees=Number(p.transitionAngleDeg);
  if(!(transitionDegrees>0&&transitionDegrees<=360*(2-turns)+1e-8))fail('跨层角须为正且不得大于两端错开的角度，避免上层尾段穿入过渡区');
  const transitionAngle=transitionDegrees*Math.PI/180,lowZ=-(depth+gap)/2,highZ=(depth+gap)/2;
  const lowEnd=direction*(TAU-transitionAngle),highStart=direction*TAU,highEnd=direction*TAU*turns;
  const held=[],hold=value=>(held.push(value),value);let low,bridge,high,result;
  try{
    low=sweepLayer(cad,hold,radius,0,lowEnd,lowZ,direction,width,depth,corner);
    bridge=transition(cad,hold,radius,lowEnd,highStart,lowZ,highZ,direction,width,depth,corner);
    high=sweepLayer(cad,hold,radius,highStart,highEnd,highZ,direction,width,depth,corner);
    const joined=hold(low.fuse(bridge));
    result=joined.fuse(high);
    assertSolid(result,cad);
    result.keyRingReport={innerDiameterMm:inner,outerDiameterMm:outer,totalDepthMm:totalDepth,turns,layerGapMm:gap,stripDepthMm:depth,transitionAngleDeg:transitionDegrees,leftHanded:handed,section:'roundedRectangle',sectionCornerRadiusMm:corner};
    const complete=result;result=null;return complete;
  }catch(error){
    if(String(error?.message||'').startsWith('匙圈：'))throw error;
    fail(`连续双层圆角矩形建模失败：${error?.message||'CAD 内核拒绝几何'}`);
  }finally{dispose(result);held.reverse().forEach(dispose);}
}
