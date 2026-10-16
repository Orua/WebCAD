import definition from './definition.js';
const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=message=>{throw new Error(`方线拱桥：${message}`);};
export function build(params,cad){
  if(Object.keys(params||{}).some(key=>key!=='kind'&&!Object.hasOwn(definition.defaults,key)))fail('存在未知参数');
  const p={...definition.defaults,...params};
  for(const field of definition.fields){const value=p[field.key];if(typeof value!=='number'||!Number.isFinite(value)||value<field.min||value>field.max)fail(`${field.label} 超出范围 ${field.min}–${field.max} mm`);}
  const {outerWidthMm:w,outerHeightMm:h,innerWidthMm:iw,innerHeightMm:ih,depthMm:d,outerRadiusMm:ro,innerRadiusMm:ri,edgeRadiusMm:er,holeDiameterMm:hd,holeDepthMm:hl}=p;
  const leg=(w-iw)/2,top=h-ih;
  if(!(leg>0&&top>0))fail('外宽、外高须分别大于内宽、内高');
  if(ro>=Math.min(w/2,h)||ro>Math.min(leg,top))fail('外转角 R 不得超过腿宽或顶梁厚度，且须保留平顶和直腿');
  if(ri>=Math.min(iw/2,ih))fail('内转角 R 须小于内宽的一半和内高');
  if(er>=Math.min(leg,top,d)/2)fail('棱边 R 须小于最小截面尺寸的一半');
  if((hd===0)!==(hl===0))fail('底孔直径和深度须同时为零或同时为正');
  if(hd>0&&(hd>=Math.min(leg,d)-2*er||hl>ih-ri))fail('底孔须位于平底端面内，且深度不得越过直腿段');
  const held=[],hold=x=>(held.push(x),x);let result;
  try{
    const a=w/2,b=iw/2,q=Math.SQRT1_2;
    let path=cad.draw([-a,0]).lineTo([-a,h-ro]);
    if(ro)path=path.threePointsArcTo([-a+ro,h],[-a+ro-ro*q,h-ro+ro*q]);
    path=path.lineTo([a-ro,h]);
    if(ro)path=path.threePointsArcTo([a,h-ro],[a-ro+ro*q,h-ro+ro*q]);
    path=path.lineTo([a,0]).lineTo([b,0]).lineTo([b,ih-ri]);
    if(ri)path=path.threePointsArcTo([b-ri,ih],[b-ri+ri*q,ih-ri+ri*q]);
    path=path.lineTo([-b+ri,ih]);
    if(ri)path=path.threePointsArcTo([-b,ih-ri],[-b+ri-ri*q,ih-ri+ri*q]);
    const sketch=hold(path.lineTo([-b,0]).close().sketchOnPlane('XY',-d/2));
    result=hold(sketch.extrude(d));
    if(er)result=hold(result.fillet(er,edges=>edges.either([e=>e.inPlane('XY',-d/2),e=>e.inPlane('XY',d/2)])));
    if(hd){for(const x of [-(w+iw)/4,(w+iw)/4]){const hole=hold(cad.makeCylinder(hd/2,hl,[x,0,0],[0,1,0]));result=hold(result.cut(hole));}}
    const solids=result.solids;
    try{if(solids.length!==1)fail('结果不是单一实体');}finally{solids.forEach(dispose);}
    const check=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false));
    if(!check.IsValid()||cad.measureVolume(result)<=0)fail('实体校验失败');
    held.splice(held.indexOf(result),1);return result;
  }catch(error){if(String(error?.message).startsWith('方线拱桥：'))throw error;fail(`建模失败：${error?.message||error}`);}
  finally{held.reverse().forEach(dispose);}
}
