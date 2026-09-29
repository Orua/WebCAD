const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=message=>{throw new Error(`吊杆：${message}`);};

function assertSolid(shape,cad){
  const solids=shape.solids;
  try{if(solids.length!==1)fail(`结果必须为单一实体，实际 ${solids.length} 个`);}
  finally{solids.forEach(dispose);}
  const checker=new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false);
  try{if(!checker.IsValid()||!(cad.measureVolume(shape)>1e-9))fail('结果无效或体积为零');}
  finally{dispose(checker);}
}

function stationsFor(wireRadius,rootDepth,topDepth,joinY,arcCenterY,arcRadius){
  const stations=[];
  for(let i=0;i<=20;i++){
    let x,y,nx,ny,wx,wy;
    if(i<=4){
      const t=i/4;y=joinY+(arcCenterY-joinY)*t;x=-arcRadius;
      nx=0;ny=1;wx=-1;wy=0;
    }else if(i<16){
      const theta=Math.PI-(i-4)*Math.PI/12;
      x=arcRadius*Math.cos(theta);y=arcCenterY+arcRadius*Math.sin(theta);
      nx=Math.sin(theta);ny=-Math.cos(theta);wx=Math.cos(theta);wy=Math.sin(theta);
    }else{
      const t=(i-16)/4;y=arcCenterY-(arcCenterY-joinY)*t;x=arcRadius;
      nx=0;ny=-1;wx=1;wy=0;
    }
    const topPathY=arcCenterY+arcRadius;
    const transitionStartY=joinY+wireRadius;
    const depth=y<=transitionStartY?rootDepth:rootDepth+(topDepth-rootDepth)*Math.min(1,Math.max(0,(y-transitionStartY)/(topPathY-transitionStartY)));
    stations.push({centerMm:[x,y,0],normal:[nx,ny,0],widthDirection:[wx,wy,0],widthMm:2*wireRadius,depthMm:depth});
  }
  return stations;
}

export function build(params,cad,_options,{definitions}){
  const definition=definitions.hangingRod;
  if(Object.keys(params||{}).some(key=>key!=='kind'&&!Object.hasOwn(definition.defaults,key)))fail('参数存在未知字段');
  const p={...definition.defaults,...params};
  const keys=['barLengthMm','barDiameterMm','endFilletMm','loopInnerWidthMm','loopWireDiameterMm','loopClearHeightMm','loopRootDepthMm','rootBlendRadiusMm'];
  for(const key of keys)if(!Number.isFinite(Number(p[key])))fail(`${key} 必须为有限数`);
  const [length,barDiameter,endFillet,innerWidth,wireDiameter,clearHeight,rootDepth,rootBlend]=keys.map(key=>Number(p[key]));
  if(!(length>0&&barDiameter>0&&innerWidth>0&&wireDiameter>0&&clearHeight>0&&rootDepth>0))fail('杆长、杆径、吊环尺寸及根部深度须为正');
  const barRadius=barDiameter/2,wireRadius=wireDiameter/2,innerRadius=innerWidth/2;
  if(endFillet<0||endFillet>=barRadius)fail('端部圆角须大于等于 0 且小于杆半径');
  if(rootBlend<0)fail('根部圆角不能为负');
  if(length<=innerWidth+2*wireDiameter)fail('圆杆长度须大于吊环外宽');
  if(clearHeight<innerRadius)fail('吊环净高不得小于内圈半径');
  if(wireDiameter>=barDiameter)fail('常规吊杆要求吊环线径小于杆径');
  if(rootDepth<wireDiameter)fail('根部Z深度不得小于吊环料宽');
  const arcRadius=innerRadius+wireRadius;
  const arcCenterY=barRadius+clearHeight-innerRadius;
  const joinY=barRadius-wireRadius;
  if(!(arcCenterY>joinY+wireRadius))fail('吊环直腿高度不足以布置根部深度过渡');

  const held=[];const hold=value=>{held.push(value);return value;};
  let bar,roundedBar,loop,fused,result,finder;let barEdges=[],rootEdges=[];
  try{
    bar=hold(cad.makeCylinder(barRadius,length,[-length/2,0,0],[1,0,0]));
    if(endFillet>0){
      barEdges=bar.edges;
      const ends=barEdges.filter(edge=>edge.geomType==='CIRCLE');
      if(ends.length!==2)fail('未能唯一识别圆杆两端边');
      finder=hold(new cad.EdgeFinder().inList(ends));
      roundedBar=hold(bar.fillet({radius:endFillet,filter:finder}));
    }else roundedBar=bar;

    const stations=stationsFor(wireRadius,rootDepth,wireDiameter,joinY,arcCenterY,arcRadius);
    const wires=stations.map(s=>{
      const plane=hold(new cad.Plane(s.centerMm,s.widthDirection,s.normal));
      const drawing=hold(cad.drawEllipse(s.widthMm/2,s.depthMm/2));
      return hold(drawing.sketchOnPlane(plane)).wire;
    });
    const loft=hold(new (cad.getOC().BRepOffsetAPI_ThruSections)(true,false,1e-6));
    loft.SetMaxDegree(3);wires.forEach(w=>loft.AddWire(w.wrapped));loft.Build();
    loop=hold(cad.cast(loft.Shape()));
    fused=hold(roundedBar.fuse(loop));
    if(rootBlend>0){
      const xLeg=arcRadius;
      const fusedEdges=fused.edges;
      rootEdges=[];
      for(const edge of fusedEdges){
        const point=edge.pointAt(.5);
        let local;
        try{local=Math.abs(Math.abs(point.x)-xLeg)<1.25&&point.y>=joinY-.15&&point.y<=joinY+2.1&&Math.abs(point.z)<rootDepth/2+.2;}
        finally{dispose(point);}
        if(local)rootEdges.push(edge);else dispose(edge);
      }
      if(rootEdges.length<2)fail(`R${rootBlend} 根部圆角未找到足够的局部交接边（${rootEdges.length}）`);
      finder=hold(new cad.EdgeFinder().inList(rootEdges));
      try{result=hold(fused.fillet({radius:rootBlend,filter:finder}));}
      catch(error){fail(`R${rootBlend} 根部局部圆角失败：${error?.message||'内核拒绝该边组'}`);}
    }else result=fused;
    assertSolid(result,cad);
    result.hangingRodReport={barLengthMm:length,barDiameterMm:barDiameter,endFilletMm:endFillet,loopInnerWidthMm:innerWidth,loopWireDiameterMm:wireDiameter,loopClearHeightMm:clearHeight,loopRootDepthMm:rootDepth,rootBlendRadiusMm:rootBlend,rootBlendEdges:rootEdges.length,sectionStations:stations.length,section:'variableEllipse'};
    const complete=result;result=null;
    const heldIndex=held.indexOf(complete);if(heldIndex>=0)held.splice(heldIndex,1);
    return complete;
  }catch(error){
    if(String(error?.message||'').startsWith('吊杆：'))throw error;
    fail(`建模失败：${error?.message||'内核运算失败'}`);
  }finally{
    dispose(result);barEdges.forEach(dispose);rootEdges.forEach(dispose);held.reverse().forEach(dispose);
  }
}
