import { contractHash } from './contracts/operation-schema.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const q=value=>{if(!Number.isFinite(value))throw new Error('目标面几何量无效');return Math.round(value*1e5)/1e5;};
const tuple=value=>{try{return value.toTuple().map(q);}finally{dispose(value);}};
function bounds(shape){const box=shape.boundingBox;try{return box.bounds.map(row=>row.map(q));}finally{dispose(box);}}

// Stable across kernel reloads: transient BRep serialization bytes are not.
// Boundary metrics and surface samples catch a changed face without relying on
// transient OCCT handles or a nearest-face fallback.
export function logoFaceSignature(face,cad){
  const edges=face.edges;
  try{
    const boundary=edges.map(edge=>({type:edge.geomType,length:q(cad.measureLength(edge)),bounds:bounds(edge)}))
      .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const samples=[];
    for(const u of [.2,.5,.8])for(const v of [.2,.5,.8])samples.push(tuple(face.pointOnSurface(u,v)));
    return contractHash({type:face.geomType,area:q(cad.measureArea(face)),center:tuple(face.center),bounds:bounds(face),boundary,samples});
  }finally{edges.forEach(dispose);}
}
