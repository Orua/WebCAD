import * as cad from 'replicad';

const dispose = value => { try { value?.delete(); } catch {} };
const fail = message => { throw Object.assign(new Error(message), {code:'GEOMETRY_INVALID'}); };
const tuple = value => { try { return value.toTuple(); } finally { dispose(value); } };
export const sharpAngleDeg = 1;

// Evaluate the actual edge p-curve on each face. Projecting a 3D edge point
// onto a swept/trimmed surface can fail or choose a different surface branch.
function edgeFaceNormal(edge,face,t) {
  const oc=cad.getOC();let curve,uv,props,point,normal;
  try {
    curve=new oc.BRepAdaptor_Curve2d(edge.wrapped,face.wrapped);
    uv=curve.Value(curve.FirstParameter()+t*(curve.LastParameter()-curve.FirstParameter()));
    props=new oc.BRepGProp_Face(face.wrapped,false);point=new oc.gp_Pnt();normal=new oc.gp_Vec();
    props.Normal(uv.X(),uv.Y(),point,normal);
    const value=[normal.X(),normal.Y(),normal.Z()];
    if(value.some(v=>!Number.isFinite(v))||Math.hypot(...value)<1e-12)throw new Error('undefined p-curve normal');
    return value;
  } catch {
    return tuple(face.normalAt(tuple(edge.pointAt(t))));
  } finally {[curve,uv,props,point,normal].forEach(dispose);}
}

// Exact BRep adjacency with sampled surface normals; rendering normals are never used.
export function topologyDetails(shape, { connectivityOnly = false } = {}) {
  const faces=shape.faces, edges=shape.edges, boundaries=faces.map(face=>face.edges);
  try {
    // Hash buckets avoid comparing every source edge with every face edge.
    // isSame is still authoritative: hash collisions never imply adjacency.
    const buckets = new Map();
    edges.forEach((edge,id)=>{const key=edge.hashCode; if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);});
    const adjacency=edges.map(()=>new Set());
    boundaries.forEach((list,faceId)=>list.forEach(boundary=>{
      for(const id of buckets.get(boundary.hashCode)||[]) if(boundary.isSame(edges[id]))adjacency[id].add(faceId);
    }));
    return edges.map((edge,id)=>{
      const adjacentFaceIds=[...adjacency[id]];
      if(connectivityOnly)return {edgeId:id,adjacentFaceIds};
      const box=edge.boundingBox;
      const bounds=box.bounds;dispose(box);
      const degenerate=cad.getOC().BRep_Tool.Degenerated(edge.wrapped);
      const periodicSeam=adjacentFaceIds.length===1&&cad.getOC().BRep_Tool.IsClosed(edge.wrapped,faces[adjacentFaceIds[0]].wrapped);
      let normalAngleDeg=null;
      if(periodicSeam)normalAngleDeg=0;
      if(adjacentFaceIds.length===2){
        try {
          normalAngleDeg=Math.max(...[.2,.5,.8].map(t=>{
            const normals=adjacentFaceIds.map(i=>edgeFaceNormal(edge,faces[i],t));
            const lengths=normals.map(n=>Math.hypot(...n));
            if(lengths.some(n=>!Number.isFinite(n)||n<1e-12))throw new Error('undefined normal');
            const dot=normals[0].reduce((sum,n,i)=>sum+n*normals[1][i],0)/(lengths[0]*lengths[1]);
            return Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI;
          }));
        } catch { normalAngleDeg=null; }
      }
      return {edgeId:id, startPoint:tuple(edge.startPoint),endPoint:tuple(edge.endPoint),midpoint:tuple(edge.pointAt(.5)),bounds,
        adjacentFaceIds,degenerate,periodicSeam,normalAngleDeg,sharp:degenerate?false:normalAngleDeg===null?null:normalAngleDeg>sharpAngleDeg};
    });
  } finally {boundaries.flat().forEach(dispose);faces.forEach(dispose);edges.forEach(dispose);}
}
