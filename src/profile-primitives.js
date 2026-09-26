export const PROFILE_PRIMITIVES=['rectangle','roundedRectangle','capsule'];
export function primitiveEntities(entity){
  if(typeof entity.id!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(entity.id))throw new Error('基础轮廓 ID 须为 1–60 个安全字符');
  const origin=entity.originMm;if(!Array.isArray(origin)||origin.length!==2||origin.some(value=>!Number.isFinite(value)||Math.abs(value)>1e6))throw new Error('基础轮廓原点无效');
  const width=entity.widthMm,height=entity.heightMm;if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>1e6||height>1e6)throw new Error('基础轮廓宽、高须为有效正毫米数');
  const [x,y]=origin,result=[],point=(u,v)=>[x+u,y+v],line=(a,b)=>result.push({id:`${entity.id}_${result.length}`,type:'line',startMm:point(...a),endMm:point(...b)}),arc=(a,m,b)=>result.push({id:`${entity.id}_${result.length}`,type:'arc3',startMm:point(...a),midMm:point(...m),endMm:point(...b)});
  if(entity.type==='rectangle'){line([0,0],[width,0]);line([width,0],[width,height]);line([width,height],[0,height]);line([0,height],[0,0]);}
  else if(entity.type==='roundedRectangle'){
    const r=entity.cornerRadiusMm;if(!Number.isFinite(r)||r<=0||r>=Math.min(width,height)/2)throw new Error('圆角矩形 R 须大于零且小于短边一半');const q=r*(1-Math.SQRT1_2);
    line([r,0],[width-r,0]);arc([width-r,0],[width-q,q],[width,r]);line([width,r],[width,height-r]);arc([width,height-r],[width-q,height-q],[width-r,height]);line([width-r,height],[r,height]);arc([r,height],[q,height-q],[0,height-r]);line([0,height-r],[0,r]);arc([0,r],[q,q],[r,0]);
  }else if(entity.type==='capsule'){
    if(width<=height)throw new Error('长圆总长须大于宽度');const r=height/2;
    line([r,0],[width-r,0]);arc([width-r,0],[width,r],[width-r,height]);line([width-r,height],[r,height]);arc([r,height],[0,r],[r,0]);
  }else throw new Error('未知基础轮廓类型');
  return result.map(item=>({...item,...(entity.construction?{construction:true}:{})}));
}
export function expandProfilePrimitives(profile){
  if(!profile?.entities?.some(entity=>PROFILE_PRIMITIVES.includes(entity.type)))return profile;
  const expanded=new Map(),entities=[];for(const entity of profile.entities){const parts=PROFILE_PRIMITIVES.includes(entity.type)?primitiveEntities(entity):[entity];expanded.set(entity.id,parts.map(part=>part.id));entities.push(...parts);}
  const paths=list=>(list||[]).map(path=>({...path,edges:path.edges.flatMap(ref=>{const ids=expanded.get(ref.entityId)||[ref.entityId];return (ref.reversed?[...ids].reverse():ids).map(entityId=>({entityId,reversed:ref.reversed}));})}));
  return {...profile,entities,loops:paths(profile.loops),chains:paths(profile.chains)};
}
