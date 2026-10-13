// Display-only exact coordinate indexing: all triangles stay, no nearest weld,
// simplification, formal measurements or export uses this buffer.
export function indexedDisplayMesh(mesh){
 const p=mesh.positions,unique=new Map(),positions=[],indices=new Uint32Array(mesh.indices.length);
 for(let k=0;k<mesh.indices.length;k++){
  const at=mesh.indices[k]*3,key=`${p[at]},${p[at+1]},${p[at+2]}`;let index=unique.get(key);
  if(index===undefined){index=positions.length/3;unique.set(key,index);positions.push(p[at],p[at+1],p[at+2]);}indices[k]=index;
 }
 return {positions:new Float64Array(positions),indices};
}
