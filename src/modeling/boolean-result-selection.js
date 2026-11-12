const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function validSolidSelection(p={}){
 if(p.keepSolidAt===undefined)return p.maxDiscardedVolumeMm3===undefined&&p.toolExecution===undefined;
 return (p.toolExecution===undefined||p.toolExecution==='sequential')&&Array.isArray(p.keepSolidAt)&&p.keepSolidAt.length===3&&p.keepSolidAt.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)&&Number.isFinite(p.maxDiscardedVolumeMm3)&&p.maxDiscardedVolumeMm3>=0&&p.maxDiscardedVolumeMm3<=1e9;
}
// Select by explicit interior material, never by size or a topology index.
export function selectBooleanSolid(shape,p,cad){
 if(!validSolidSelection(p))fail('PARAM_SCHEMA_INVALID','keepSolidAt 需要有限世界毫米坐标和显式 maxDiscardedVolumeMm3。');
 if(p.keepSolidAt===undefined)return shape;
 const solids=shape.solids,vertex=cad.makeVertex(p.keepSolidAt),matches=[];
 try{
  if(solids.length>128)fail('BOOLEAN_RESULT_LIMIT','主体选择最多检查128个分离实体。');
  for(let i=0;i<solids.length;i++){
   const query=new cad.DistanceQuery(solids[i]);let inside;
   try{inside=query.distanceTo(vertex)<1e-8;}finally{query.delete();}
   if(!inside)continue;
   const faces=solids[i].faces;
   try{for(const face of faces){const q=new cad.DistanceQuery(face);try{if(q.distanceTo(vertex)<=1e-7){inside=false;break;}}finally{q.delete();}}}finally{faces.forEach(f=>f.delete());}
   if(inside)matches.push(i);
  }
  if(matches.length!==1)fail('BOOLEAN_RESULT_POINT_INVALID','keepSolidAt 必须严格位于唯一结果实体内部，不能在孔、边界或空域。');
  const kept=matches[0],discarded=solids.filter((_,i)=>i!==kept).map(s=>{const box=s.boundingBox;try{return {volumeMm3:Math.abs(cad.measureVolume(s)),bounds:{min:box.bounds[0],max:box.bounds[1]}};}finally{box.delete();}}),discardedVolumeMm3=discarded.reduce((sum,s)=>sum+s.volumeMm3,0);
  if(discardedVolumeMm3>p.maxDiscardedVolumeMm3+1e-7)fail('BOOLEAN_DISCARD_LIMIT','分离材料体积超过显式允许值；原模型保持。');
  const out=solids[kept].clone();out.booleanSelectionReport={keepSolidAt:[...p.keepSolidAt],inputSolidCount:solids.length,discardedVolumeMm3,discarded};out.booleanReport={strategy:'point-selected-cut',selection:out.booleanSelectionReport};return out;
 }finally{vertex.delete();solids.forEach(s=>s.delete());}
}
