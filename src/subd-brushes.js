import {validateSubdCage} from './subd-catmark.js';
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function protectIds(ids,vertexCount,brushIndex){
  if(ids===undefined)return [];
  if(!Array.isArray(ids)||ids.length>256||ids.some((id,i)=>!Number.isInteger(id)||id<0||id>=vertexCount||ids.indexOf(id)!==i))throw Object.assign(new Error(`笔刷 ${brushIndex} 的 protectVertexIds 须为本控制笼中互不重复的顶点序号`),{code:'PARAM_SCHEMA_INVALID'});
  return ids;
}
export function assertSubdBrushProtection(params){
  const count=params?.cage?.vertices?.length;
  if(!Number.isInteger(count)||!Array.isArray(params.brushes))return params;
  for(const [i,brush] of params.brushes.entries())protectIds(brush?.protectVertexIds,count,i);
  return params;
}
export function applySubdBrushes(input,brushes=[]){
  if(!Array.isArray(brushes)||brushes.length>64)throw new Error('细分体笔刷最多64笔');
  let cage={vertices:input.vertices.map(v=>[...v]),faces:input.faces.map(f=>[...f]),creases:structuredClone(input.creases||[])};validateSubdCage(cage);
  const brushReport=[];
  for(const [brushIndex,brush] of brushes.entries()){
    const {centerMm,radiusMm,strength,deltaMm,mode='push',falloff='smooth',protectVertexIds}=brush;
    if(!['push','smooth','inflate','move'].includes(mode)||!['smooth','linear'].includes(falloff)||!Array.isArray(centerMm)||centerMm.length!==3||centerMm.some(v=>!Number.isFinite(v))||!Number.isFinite(radiusMm)||radiusMm<=0)throw new Error('笔刷需要有效中心、半径和模式');
    if(mode==='move'){
      if(strength!==undefined||!Array.isArray(deltaMm)||deltaMm.length!==3||!deltaMm.every(Number.isFinite))throw new Error('拖拽笔刷须提供三维 deltaMm，不能同时指定 strength');
    }else if(deltaMm!==undefined||!Number.isFinite(strength))throw new Error('法向及平滑笔刷须提供 strength，不能指定 deltaMm');
    if(mode==='smooth'&&(strength<0||strength>1))throw new Error('平滑强度须在0–1之间');
    const protectedList=protectIds(protectVertexIds,cage.vertices.length,brushIndex),protectedSet=new Set(protectedList);
    let affectedControlPoints=0,protectedInRange=0,maxDisplacementMm=0;
    const current=validateSubdCage(cage);
    const normals=['push','inflate'].includes(mode)?current.vertices.map(()=>[0,0,0]):null;
    if(normals){
      for(const face of current.faces){const [a,b,c]=face.map(i=>current.vertices[i]),n=cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i]));for(const id of face)normals[id]=normals[id].map((v,i)=>v+n[i]);}
    }
    const vertices=current.vertices.map((point,id)=>{
      const t=Math.max(0,1-Math.hypot(...point.map((v,i)=>v-centerMm[i]))/radiusMm),weight=falloff==='smooth'?t*t*(3-2*t):t;if(!weight)return [...point];
      if(protectedSet.has(id)){protectedInRange++;return [...point];}
      affectedControlPoints++;
      let moved;
      if(mode==='smooth'){
        const neighbors=[...new Set([...current.vertexEdges[id]].flatMap(edge=>edge.split(':').map(Number)).filter(i=>i!==id))],mean=[0,1,2].map(i=>neighbors.reduce((sum,j)=>sum+current.vertices[j][i],0)/neighbors.length);
        moved=point.map((v,i)=>v+(mean[i]-v)*weight*strength);
      }else if(mode==='move'){
        moved=point.map((v,i)=>v+deltaMm[i]*weight);
      }else{
        const n=normals[id],length=Math.hypot(...n);if(length<1e-12)throw new Error('笔刷位置法向无法确定');moved=point.map((v,i)=>v+n[i]/length*strength*weight);
      }
      maxDisplacementMm=Math.max(maxDisplacementMm,Math.hypot(...moved.map((v,i)=>v-point[i])));
      return moved;
    });
    cage={...cage,vertices};validateSubdCage(cage);
    const warning=!affectedControlPoints?{warning:{code:protectedInRange?'SUBD_BRUSH_PROTECTED_ONLY':'SUBD_BRUSH_NO_HIT',message:protectedInRange?`笔刷 ${brushIndex} 范围内的控制点全部被 protectVertexIds 固定，控制笼未移动；钉住控制点不会锁定拟合曲面。`:`笔刷 ${brushIndex} 未覆盖任何控制笼顶点；请调整中心、半径或控制笼密度。`}}:{};
    brushReport.push({brushIndex,mode,affectedControlPoints,maxDisplacementMm,...(protectedList.length?{protectVertexIds:[...protectedList],protectedInRange}:{}),...warning});
  }
  cage.brushReport=brushReport;
  return cage;
}
