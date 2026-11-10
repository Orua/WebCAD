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
// Re-find a face after a Boolean renumbers topology. The stored index wins when
// it still matches; otherwise a unique signature match is the new index.
export function remapSignedFace(shape, params, cad) {
  const signature = params?.targetFaceSignature;
  if (typeof signature !== 'string' || !signature) return params?.faceId;
  const faces = shape.faces;
  try {
    const matches = [];
    faces.forEach((face, index) => {
      try { if (logoFaceSignature(face, cad) === signature) matches.push(index); } catch { /* skip faces that cannot be sampled */ }
    });
    if (Number.isInteger(params.faceId) && matches.includes(params.faceId)) return params.faceId;
    if (matches.length === 1) return matches[0];
    throw Object.assign(new Error(matches.length ? '目标面签名不唯一，请重新选面' : '目标面几何已改变，请重新选面'), { code: 'STALE_REFERENCE', recoveryAction: 'RESELECT_TOPOLOGY' });
  } finally { faces.forEach(dispose); }
}
