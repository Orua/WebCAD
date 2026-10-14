// Closed-mesh check and signed volume. Vertices are welded by exact position
// (STL facets repeat coordinates), then every directed edge must have exactly
// one opposite twin. Open or non-manifold meshes report volume null.
export function weldIndex(positions){
 const n=positions.length/3,order=new Uint32Array(n).map((_,i)=>i);
 order.sort((a,b)=>positions[a*3]-positions[b*3]||positions[a*3+1]-positions[b*3+1]||positions[a*3+2]-positions[b*3+2]);
 const remap=new Uint32Array(n);let rep=order[0];
 for(let k=0;k<n;k++){const i=order[k];if(k&&(positions[i*3]!==positions[rep*3]||positions[i*3+1]!==positions[rep*3+1]||positions[i*3+2]!==positions[rep*3+2]))rep=i;remap[i]=rep;}
 return remap;
}
export function closedMeshVolume({positions,indices}){
 if(!indices.length)return {closed:false,volume:null};
 const remap=weldIndex(positions),n=positions.length/3,m=indices.length,forward=new Float64Array(m),backward=new Float64Array(m);
 let volume=0;
 for(let t=0;t<m;t+=3){const a=remap[indices[t]],b=remap[indices[t+1]],c=remap[indices[t+2]];
  if(a===b||b===c||a===c)return {closed:false,volume:null,reason:'degenerate-triangle'};
  forward[t]=a*n+b;forward[t+1]=b*n+c;forward[t+2]=c*n+a;backward[t]=b*n+a;backward[t+1]=c*n+b;backward[t+2]=a*n+c;
  const ax=positions[a*3],ay=positions[a*3+1],az=positions[a*3+2],bx=positions[b*3],by=positions[b*3+1],bz=positions[b*3+2],cx=positions[c*3],cy=positions[c*3+1],cz=positions[c*3+2];
  volume+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;}
 forward.sort();backward.sort();
 for(let i=0;i<m;i++){if(forward[i]!==backward[i]||i&&forward[i]===forward[i-1])return {closed:false,volume:null,reason:'open-or-non-manifold'};}
 return {closed:true,volume:Math.abs(volume),inverted:volume<0};
}
