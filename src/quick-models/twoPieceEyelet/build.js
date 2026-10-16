const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=message=>{throw new Error(`双件鸡眼：${message}`);};

function assertCompound(shape,cad){
  const solids=shape.solids;let checker;
  try{
    if(solids.length!==2)fail('结果必须保留A件和B件两个实体');
    checker=new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false);
    if(!checker.IsValid()||!(cad.measureVolume(shape)>1e-9))fail('结果无效或体积为零');
  }finally{solids.forEach(dispose);dispose(checker);}
}

function buildEyelet(cad,{bore,wall,flangeRadius,bendRadius,flangeDepth,length},rise=0){
  const h=bendRadius,t=wall,k=h-t,ri=bore+h,ro=flangeRadius-h;
  const pt=(r,z)=>[r,0,z],line=(a,b)=>cad.makeLine(pt(...a),pt(...b));
  const arc=(a,m,b)=>cad.makeThreePointArc(pt(...a),pt(...m),pt(...b));
  const q=Math.SQRT1_2,edges=[];let wire,face,result;
  try{
    edges.push(line([bore,length],[bore,h]));
    edges.push(arc([bore,h],[ri-h*q,h-h*q],[ri,0]));
    edges.push(rise>0?arc([ri,0],[(ri+ro)/2,-rise],[ro,0]):line([ri,0],[ro,0]));
    edges.push(arc([ro,0],[ro+h*q,h-h*q],[flangeRadius,h]));
    edges.push(line([flangeRadius,h],[flangeRadius,flangeDepth]));
    edges.push(line([flangeRadius,flangeDepth],[flangeRadius-t,flangeDepth]));
    edges.push(line([flangeRadius-t,flangeDepth],[ro+k,h]));
    edges.push(arc([ro+k,h],[ro+k*q,h-k*q],[ro,t]));
    edges.push(rise>0?arc([ro,t],[(ri+ro)/2,t-rise],[ri,t]):line([ro,t],[ri,t]));
    edges.push(arc([ri,t],[ri-k*q,h-k*q],[bore+t,h]));
    edges.push(line([bore+t,h],[bore+t,length]));
    edges.push(line([bore+t,length],[bore,length]));
    wire=cad.assembleWire(edges);face=cad.makeFace(wire);
    result=cad.revolution(face,[0,0,0],[0,0,1],360);
    const complete=result;result=null;return complete;
  }finally{dispose(result);dispose(face);dispose(wire);edges.forEach(dispose);}
}

export function build(params,cad,options,{definitions}){
  const definition=definitions.twoPieceEyelet;
  if(Object.keys(params||{}).some(key=>key!=='kind'&&!Object.hasOwn(definition.defaults,key)))fail('参数存在未知字段');
  const p={...definition.defaults,...params};
  // Recipes created before face controls used a 24 mm lateral display offset.
  if(!Object.hasOwn(params,'faceStyle')&&!Object.hasOwn(params,'explodedOffsetMm'))p.explodedOffsetMm=24;
  for(const field of definition.fields)if(field.type==='number'&&(typeof p[field.key]!=='number'||!Number.isFinite(p[field.key])))fail(`${field.key} 必须为有限数`);
  if(!['flat','curved'].includes(p.faceStyle))fail('鸡眼面必须为平面或弧面');
  if(p.faceRiseMm<0||p.assemblyGapMm<0)fail('拱高和轴向距离不能为负');
  const rise=p.faceStyle==='curved'?p.faceRiseMm:0;
  const a={bore:Number(p.aBoreDiameterMm)/2,wall:(Number(p.aTubeOuterDiameterMm)-Number(p.aBoreDiameterMm))/2,flangeRadius:Number(p.aFlangeDiameterMm)/2,bendRadius:Number(p.aBendRadiusMm),flangeDepth:Number(p.aFlangeDepthMm),length:Number(p.aTubeLengthMm)+Number(p.aFlangeDepthMm)};
  const b={bore:Number(p.bBoreDiameterMm)/2,wall:(Number(p.bTubeOuterDiameterMm)-Number(p.bBoreDiameterMm))/2,flangeRadius:Number(p.bFlangeDiameterMm)/2,bendRadius:Number(p.bBendRadiusMm),flangeDepth:Number(p.bFlangeDepthMm),length:Number(p.bOverallDepthMm)};
  const explodedOffset=Number(p.explodedOffsetMm);
  for(const [label,spec,depth] of [['A件',a,Number(p.aTubeLengthMm)],['B件',b,Number(p.bOverallDepthMm)-Number(p.bFlangeDepthMm)]]){
    const {bore,wall,flangeRadius,bendRadius:h,flangeDepth,length}=spec,t=wall,k=h-t,ri=bore+h,ro=flangeRadius-h;
    if(!(bore>0&&wall>0&&h>wall&&depth>0&&flangeDepth>=h&&length>=flangeDepth))fail(`${label}须满足孔径、壁厚、弯曲半径、法兰深度和总长为有效正尺寸`);
    if(!(ro>=ri&&ro+k>=ri-k))fail(`${label}法兰径不足以容纳内外弯曲及中间平面`);
    if(!(bore+wall<flangeRadius))fail(`${label}筒外径必须小于法兰外径`);
    if(rise>0&&!(rise<(ro-ri)/2))fail(`${label}弧面拱高须小于面环径向宽度的一半`);
  }
  const minimumExploded=a.flangeRadius+b.flangeRadius+.2;
  if(explodedOffset<0||(explodedOffset>0&&explodedOffset<minimumExploded))fail('分开展示中心距为 0，或须足以避免两件重叠');
  if(explodedOffset===0){
    if(!(b.bore>a.bore+a.wall))fail('同轴静态配合要求B件孔半径大于A件筒外半径');
    if(!(a.length+b.bendRadius-b.length>=a.flangeDepth))fail('同轴静态配合要求B件短脚末端不伸入A件法兰');
  }
  let partA=null,partB=null,rotatedB=null,placedB=null,result=null;
  try{
    partA=buildEyelet(cad,a,rise);
    partB=buildEyelet(cad,b,rise);
    if(explodedOffset===0||Object.hasOwn(params,'faceStyle')){
      rotatedB=partB.rotate(180,[0,0,0],[1,0,0]);
      placedB=rotatedB.translate([explodedOffset,0,a.length+b.bendRadius+p.assemblyGapMm]);
    }else placedB=partB.translate([explodedOffset,0,0]);
    result=cad.makeCompound([partA,placedB]);
    if(rise>0){const old=result;result=old.translate([0,0,rise]);dispose(old);}
    if(Object.hasOwn(params,'faceStyle')){
      // A is the upper long-shank face; B is the lower backplate.
      const old=result,turned=old.rotate(180,[0,0,0],[1,0,0]);
      try{result=turned.translate([0,0,a.length+b.bendRadius+p.assemblyGapMm+2*rise]);}
      finally{if(turned!==old)dispose(turned);dispose(old);}
    }
    assertCompound(result,cad);
    result.twoPieceEyeletReport={
      aFlangeDiameterMm:a.flangeRadius*2,aBoreDiameterMm:a.bore*2,aTubeOuterDiameterMm:(a.bore+a.wall)*2,aTubeLengthMm:Number(p.aTubeLengthMm),aFlangeDepthMm:a.flangeDepth,aBendRadiusMm:a.bendRadius,aOverallLengthMm:a.length,
      bFlangeDiameterMm:b.flangeRadius*2,bBoreDiameterMm:b.bore*2,bTubeOuterDiameterMm:(b.bore+b.wall)*2,bOverallDepthMm:b.length,bFlangeDepthMm:b.flangeDepth,bBendRadiusMm:b.bendRadius,
      aWallThicknessMm:a.wall,bWallThicknessMm:b.wall,explodedOffsetMm:explodedOffset,
    };
    const complete=result;result=null;return complete;
  }catch(error){if(String(error?.message||'').startsWith('双件鸡眼：'))throw error;fail(`建模失败：${error?.message||'内核运算失败'}`);}
  finally{dispose(result);if(placedB&&placedB!==partB)dispose(placedB);if(rotatedB&&rotatedB!==placedB&&rotatedB!==partB)dispose(rotatedB);dispose(partB);dispose(partA);}
}
