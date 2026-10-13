// Disposable display-only spatial patches. This never changes a formal/source asset.
// Shared patch-boundary vertices remain exact at every level to prevent LOD seams.
export function createDisplayPatches(positions,indices,{threshold=200000}={}){
 if(indices.length/3<threshold)return null;
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i++){const a=i%3;min[a]=Math.min(min[a],positions[i]);max[a]=Math.max(max[a],positions[i]);}
 const span=Math.max(...max.map((v,a)=>v-min[a]));if(!span)return null;
 const partition=span/4,counts=max.map((v,a)=>Math.max(1,Math.ceil((v-min[a])/partition))),bins=new Map(),owner=new Int32Array(positions.length/3).fill(-1);
 const chunkOf=(a,b,c)=>{const grid=[0,1,2].map(d=>Math.min(counts[d]-1,Math.max(0,Math.floor(((positions[a*3+d]+positions[b*3+d]+positions[c*3+d])/3-min[d])/partition))));return grid[0]+counts[0]*(grid[1]+counts[1]*grid[2]);};
 for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2],key=chunkOf(a,b,c);let bin=bins.get(key);if(!bin)bins.set(key,bin=[]);bin.push(a,b,c);for(const v of [a,b,c]){if(owner[v]===-1)owner[v]=key;else if(owner[v]!==key)owner[v]=-2;}}
 const levels=[span/640,span/160];
 return [...bins.values()].map(bin=>{
  const full=new Uint32Array(bin),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const v of new Set(bin))for(let a=0;a<3;a++){bounds.min[a]=Math.min(bounds.min[a],positions[v*3+a]);bounds.max[a]=Math.max(bounds.max[a],positions[v*3+a]);}
  const lods=levels.map(cell=>{
   const mapping=new Map(),vertices=[],triangles=[],unique=new Set();let maxDisplacementMm=0;
   const map=v=>{const p=Array.from(positions.subarray(v*3,v*3+3)),protectedVertex=owner[v]===-2,q=protectedVertex?p:p.map((x,a)=>Math.fround(min[a]+(Math.floor((x-min[a])/cell)+.5)*cell)),key=protectedVertex?'v'+v:q.join(',');maxDisplacementMm=Math.max(maxDisplacementMm,Math.hypot(...p.map((x,a)=>x-q[a])));let id=mapping.get(key);if(id===undefined){id=vertices.length/3;mapping.set(key,id);vertices.push(...q);}return id;};
   for(let i=0;i<bin.length;i+=3){const a=map(bin[i]),b=map(bin[i+1]),c=map(bin[i+2]);if(a===b||b===c||c===a)continue;const cycle=a<b&&a<c?[a,b,c]:b<c?[b,c,a]:[c,a,b],key=cycle.join(',');if(unique.has(key))continue;unique.add(key);triangles.push(a,b,c);}
   return {positions:new Float32Array(vertices),indices:new Uint32Array(triangles),maxDisplacementMm};
  });
  return {indices:full,bounds,lods};
 });
}

export function chooseDisplayLevel(lods,mmPerPixel,active){
 if(!active||!Number.isFinite(mmPerPixel)||mmPerPixel<=0)return -1;
 let selected=-1;for(let i=0;i<lods.length;i++)if(lods[i].maxDisplacementMm/mmPerPixel<=8)selected=i;return selected;
}
