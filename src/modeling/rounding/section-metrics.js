import {extractPlaneSection} from '../../reference-curves.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const sub=(a,b)=>a.map((value,i)=>value-b[i]);
const norm=v=>Math.hypot(...v);

export function measureBlendSectionRadius(shape,{plane,offset,frame,faceId,faceType,curveNear,sampleCount=17},cad){
  if(!Number.isInteger(sampleCount)||sampleCount<7)throw new Error('at least seven section samples required');
  const faces=shape.faces;
  let selected,section,edges;
  try{
    const candidates=faceId===undefined?faces.filter(face=>faceType?face.geomType===faceType:face.geomType!=='PLANE'):[faces[faceId]];
    if(candidates.length!==1||!candidates[0]||candidates[0].geomType==='PLANE')throw new Error('one generated blend face required');
    selected=candidates[0];
    section=extractPlaneSection(selected,{plane,offset,frame},cad);
    edges=section.edges;
    const curves=edges.filter(edge=>edge.geomType!=='LINE');
    let edge;
    if(curveNear){
      if(curves.length<1)throw new Error('no curved blend-face section');
      const ranked=curves.map(candidate=>{const point=candidate.pointAt(.5);try{return {candidate,distance:norm(sub(point.toTuple(),curveNear))};}finally{dispose(point);}}).sort((a,b)=>a.distance-b.distance);
      if(ranked.length>1&&Math.abs(ranked[0].distance-ranked[1].distance)<1e-6)throw new Error('ambiguous blend-face section');
      edge=ranked[0].candidate;
    }else{
      if(curves.length!==1||edges.length!==1)throw new Error(`one blend-face section required; found ${edges.length} edges and ${curves.length} curves`);
      edge=curves[0];
    }
    const points=Array.from({length:sampleCount},(_,i)=>{
      const p=edge.pointAt((i+.5)/sampleCount);try{return p.toTuple();}finally{dispose(p);}
    });
    const origin=points[0],first=sub(points[Math.floor(sampleCount/2)],origin),last=sub(points[sampleCount-1],origin);
    const fl=norm(first),u=first.map(value=>value/fl),orth=last.map((value,i)=>value-dot(last,u)*u[i]),ol=norm(orth);
    if(fl<1e-10||ol<1e-10)throw new Error('degenerate blend-face section');
    const v=orth.map(value=>value/ol),w=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const xy=points.map(point=>{const delta=sub(point,origin);return [dot(delta,u),dot(delta,v)];});
    const mx=xy.reduce((sum,p)=>sum+p[0],0)/sampleCount,my=xy.reduce((sum,p)=>sum+p[1],0)/sampleCount;
    let aa=0,ab=0,bb=0,ac=0,bc=0;
    for(const [px,py] of xy){const x=px-mx,y=py-my,z=x*x+y*y;aa+=x*x;ab+=x*y;bb+=y*y;ac+=x*z;bc+=y*z;}
    const det=aa*bb-ab*ab;if(Math.abs(det)<1e-20)throw new Error('circle fit singular');
    const cx=(ac*bb-bc*ab)/(2*det)+mx,cy=(bc*aa-ac*ab)/(2*det)+my;
    const distances=xy.map(([x,y])=>Math.hypot(x-cx,y-cy)),radiusMm=distances.reduce((sum,value)=>sum+value,0)/sampleCount;
    return {radiusMm,sectionFitResidualMm:Math.max(...distances.map(d=>Math.abs(d-radiusMm))),planeResidualMm:Math.max(...points.map(point=>Math.abs(dot(sub(point,origin),w)))),sampleCount,curveType:edge.geomType,blendFaceType:selected.geomType};
  }finally{edges?.forEach(dispose);dispose(section);faces.forEach(dispose);}
}
