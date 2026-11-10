// R7-015: extrude with inner holes. Each hole is a closed profile in the same
// plane coordinates as the outer profile, centred at `center` (polygon points
// are absolute, so polygon holes take no center).
export const EXTRUDE_HOLE_PROFILES=['rectangle','circle','polygon','roundedRectangle'];
export const EXTRUDE_HOLES_MAX=64;
const fail=(message,path,details)=>{throw Object.assign(new Error(message),{code:'EXTRUDE_HOLE_INVALID',path,details});};
export function normalizeExtrudeHoles(holes){
 if(holes===undefined)return [];
 if(!Array.isArray(holes)||holes.length<1||holes.length>EXTRUDE_HOLES_MAX)fail(`holes 须为 1–${EXTRUDE_HOLES_MAX} 个闭合轮廓`,'params.holes');
 return holes.map((h,i)=>{
  const path=`params.holes[${i}]`;
  if(!h||typeof h!=='object'||Array.isArray(h))fail('孔轮廓须为对象',path);
  const profile=h.profile??'circle';if(!EXTRUDE_HOLE_PROFILES.includes(profile))fail(`孔轮廓类型须为 ${EXTRUDE_HOLE_PROFILES.join('、')}`,`${path}.profile`);
  const center=h.center??[0,0];
  if(profile==='polygon'&&h.center!==undefined)fail('多边形孔直接用绝对平面坐标 points，不接受 center',`${path}.center`);
  if(!Array.isArray(center)||center.length!==2||!center.every(Number.isFinite))fail('孔 center 须为平面坐标 [x,y]',`${path}.center`);
  return {...h,profile,center};
 });
}
// The cut drawing must be one outer boundary with exactly one inner loop per
// hole. A hole that touches/crosses the outer edge or another hole would give
// a notch or merged loop; refuse rather than build a different part.
export function holeTopologyOk(inner,holeCount,CompoundBlueprint){
 const isCompound=CompoundBlueprint?inner instanceof CompoundBlueprint:inner?.constructor?.name==='CompoundBlueprint';
 return holeCount===0||(isCompound&&Array.isArray(inner.blueprints)&&inner.blueprints.length===1+holeCount);
}
