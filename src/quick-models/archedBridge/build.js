const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=message=>{throw new Error(`拱桥：${message}`);};

function assertSolid(shape,cad){
  const solids=shape.solids;
  try{if(solids.length!==1)fail('结果必须为单一实体');}
  finally{solids.forEach(dispose);}
  const checker=new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false);
  try{if(!checker.IsValid()||!(cad.measureVolume(shape)>1e-9))fail('结果无效或体积为零');}
  finally{dispose(checker);}
}

export function build(params,cad,_options,{definitions}){
  const definition=definitions.archedBridge;
  if(Object.keys(params||{}).some(key=>key!=='kind'&&!Object.hasOwn(definition.defaults,key)))fail('参数存在未知字段');
  const p={...definition.defaults,...params};
  const keys=['outerWidthMm','outerHeightMm','sectionDiameterMm','holeDiameterMm','holeDepthMm'];
  for(const key of keys)if(!Number.isFinite(Number(p[key])))fail(`${key} 必须为有限数`);
  const [outerWidth,outerHeight,diameter,holeDiameter,holeDepth]=keys.map(key=>Number(p[key]));
  if(!(outerWidth>0&&outerHeight>0&&diameter>0))fail('外宽、外高和桥身直径须为正');
  if(holeDiameter<0||holeDepth<0||(holeDiameter===0)!==(holeDepth===0))fail('底孔直径和深度须同时为零或同时为正');
  if(outerWidth<=2*diameter)fail('外宽须大于两倍桥身直径，保证内孔为正');
  const wireRadius=diameter/2;
  const centerRadius=(outerWidth-diameter)/2;
  const arcCenterY=outerHeight-wireRadius-centerRadius;
  if(!(arcCenterY>0))fail('外高不足以形成直腿与半圆顶');
  if(holeDiameter>0&&holeDiameter>=diameter)fail('底孔直径须小于桥身直径');
  if(holeDepth>outerHeight)fail('底孔深度不得超过外高');

  const held=[];
  const hold=value=>{held.push(value);return value;};
  let result,spine,profile,blank;
  try{
    const pathEdges=[
      hold(cad.makeLine([-centerRadius,0,0],[-centerRadius,arcCenterY,0])),
      hold(cad.makeThreePointArc([-centerRadius,arcCenterY,0],[0,arcCenterY+centerRadius,0],[centerRadius,arcCenterY,0])),
      hold(cad.makeLine([centerRadius,arcCenterY,0],[centerRadius,0,0])),
    ];
    spine=hold(cad.assembleWire(pathEdges));
    const circle=hold(cad.makeCircle(wireRadius,[-centerRadius,0,0],[0,1,0]));
    profile=hold(cad.assembleWire([circle]));
    blank=hold(cad.genericSweep(profile,spine,{frenet:false,transitionMode:'transformed'}));
    result=blank;
    if(holeDiameter>0){
      const holeRadius=holeDiameter/2;
      const left=hold(cad.makeCylinder(holeRadius,holeDepth,[-centerRadius,0,0],[0,1,0]));
      const cutLeft=hold(result.cut(left));
      const right=hold(cad.makeCylinder(holeRadius,holeDepth,[centerRadius,0,0],[0,1,0]));
      const cutBoth=cutLeft.cut(right);
      result=cutBoth;
    }
    assertSolid(result,cad);
    result.archedBridgeReport={outerWidthMm:outerWidth,outerHeightMm:outerHeight,sectionDiameterMm:diameter,holeDiameterMm:holeDiameter,holeDepthMm:holeDepth};
    const complete=result;
    const heldIndex=held.indexOf(complete);
    if(heldIndex>=0)held.splice(heldIndex,1);
    result=null;return complete;
  }catch(error){
    if(String(error?.message||'').startsWith('拱桥：'))throw error;
    fail(`建模失败：${error?.message||'内核运算失败'}`);
  }finally{
    dispose(result);
    held.reverse().forEach(dispose);
  }
}
