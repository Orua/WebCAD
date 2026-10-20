import {validateSubdCage} from './subd-catmark.js';
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function applySubdBrushes(input,brushes=[]){
  if(!Array.isArray(brushes)||brushes.length>64)throw new Error('细分体笔刷最多64笔');
  let cage={vertices:input.vertices.map(v=>[...v]),faces:input.faces.map(f=>[...f]),creases:structuredClone(input.creases||[])};validateSubdCage(cage);
  const brushReport=[];
  for(const [brushIndex,brush] of brushes.entries()){
    const {centerMm,radiusMm,strength,mode='push',falloff='smooth'}=brush;
    if(!['push','smooth','inflate'].includes(mode)||!['smooth','linear'].includes(falloff)||!Array.isArray(centerMm)||centerMm.length!==3||centerMm.some(v=>!Number.isFinite(v))||!Number.isFinite(radiusMm)||radiusMm<=0||!Number.isFinite(strength))throw new Error('笔刷需要有效中心、半径、强度和模式');
    if(mode==='smooth'&&(strength<0||strength>1))throw new Error('平滑强度须在0–1之间');
    let affectedControlPoints=0,maxDisplacementMm=0;
    const current=validateSubdCage(cage),normals=current.vertices.map(()=>[0,0,0]);
    for(const face of current.faces){const [a,b,c]=face.map(i=>current.vertices[i]),n=cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i]));for(const id of face)normals[id]=normals[id].map((v,i)=>v+n[i]);}
    const vertices=current.vertices.map((point,id)=>{
      const t=Math.max(0,1-Math.hypot(...point.map((v,i)=>v-centerMm[i]))/radiusMm),weight=falloff==='smooth'?t*t*(3-2*t):t;if(!weight)return [...point];
      affectedControlPoints++;
      let moved;
      if(mode==='smooth'){
        const neighbors=[...new Set([...current.vertexEdges[id]].flatMap(edge=>edge.split(':').map(Number)).filter(i=>i!==id))],mean=[0,1,2].map(i=>neighbors.reduce((sum,j)=>sum+current.vertices[j][i],0)/neighbors.length);
        moved=point.map((v,i)=>v+(mean[i]-v)*weight*strength);
      }else{
        const n=normals[id],length=Math.hypot(...n);if(length<1e-12)throw new Error('笔刷位置法向无法确定');moved=point.map((v,i)=>v+n[i]/length*strength*weight);
      }
      maxDisplacementMm=Math.max(maxDisplacementMm,Math.hypot(...moved.map((v,i)=>v-point[i])));
      return moved;
    });
    cage={...cage,vertices};validateSubdCage(cage);
    brushReport.push({brushIndex,mode,affectedControlPoints,maxDisplacementMm,...(!affectedControlPoints?{warning:{code:'SUBD_BRUSH_NO_HIT',message:`笔刷 ${brushIndex} 未覆盖任何控制笼顶点；请调整中心、半径或控制笼密度。`}}:{})});
  }
  cage.brushReport=brushReport;
  return cage;
}
