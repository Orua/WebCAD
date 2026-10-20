// Close the actual retained sampling cells. No analytic circle/trim claim.
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function analyzeDesignMask({columns:c,rows:r,widthMm,depthMm},active){
 if(![c,r].every(v=>Number.isInteger(v)&&v>=2&&v<=129)||c*r>16641||![widthMm,depthMm].every(v=>Number.isFinite(v)&&v>0)||active?.length!==c*r||Array.from(active).some(v=>v!==0&&v!==1))fail('RELIEF_DESIGN_MASK_INVALID','Expected bounded grid and exact 0/1 mask');
 const triangles=[],edges=new Map(),used=new Set(),dx=widthMm/(c-1),dy=depthMm/(r-1);
 const edge=(a,b)=>{const key=a<b?a+'/'+b:b+'/'+a,old=edges.get(key);if(old){if(old.count!==1||old.a!==b||old.b!==a)fail('RELIEF_DESIGN_DOMAIN_NONMANIFOLD','A sampling edge has incompatible incident cells');old.count++;}else edges.set(key,{a,b,count:1});};
 for(let j=0;j<r-1;j++)for(let i=0;i<c-1;i++){
  const a=j*c+i,b=a+1,d=a+c,e=d+1;if(![a,b,d,e].every(k=>active[k]))continue;
  // Same physical diagonal as Pro previewTriangles after reversing the row order.
  for(const t of [[a,d,b],[b,d,e]]){triangles.push(...t);t.forEach(k=>used.add(k));edge(t[0],t[1]);edge(t[1],t[2]);edge(t[2],t[0]);}
 }
 if(!triangles.length)fail('RELIEF_DESIGN_DOMAIN_EMPTY','No complete retained sampling cell');
 const boundary=[...edges.values()].filter(e=>e.count===1),next=new Map(),incoming=new Map();
 for(const e of boundary){if(next.has(e.a)||incoming.has(e.b))fail('RELIEF_DESIGN_DOMAIN_NONMANIFOLD','Touching boundaries or diagonal-only cell contact; refine or change explicit design');next.set(e.a,e.b);incoming.set(e.b,e.a);}
 const point=k=>[-widthMm/2+(k%c)*dx,depthMm/2-Math.floor(k/c)*dy],seen=new Set(),loops=[];
 for(const first of next.keys()){
  if(seen.has(first))continue;const loop=[];let k=first;
  do{if(k===undefined||seen.has(k))fail('RELIEF_DESIGN_DOMAIN_NONMANIFOLD','Sampling boundary is not a simple closed cycle');seen.add(k);loop.push(point(k));k=next.get(k);}while(k!==first);
  let twiceArea=0;for(let n=0;n<loop.length;n++){const a=loop[n],b=loop[(n+1)%loop.length];twiceArea+=a[0]*b[1]-a[1]*b[0];}
  if(!twiceArea)fail('RELIEF_DESIGN_DOMAIN_NONMANIFOLD','Degenerate sampling boundary');loops.push({pointsMm:loop,signedAreaMm2:twiceArea/2});
 }
 const outerCount=loops.filter(l=>l.signedAreaMm2>0).length,holeCount=loops.length-outerCount;
 if(outerCount!==1)fail('RELIEF_DESIGN_DOMAIN_TOPOLOGY_CHANGED','Expected one connected support; sampled domain has disconnected or lost material');
 return {triangles,boundary,used,loops,report:{retainedCellCount:triangles.length/6,footprintAreaMm2:triangles.length/6*dx*dy,holeCount,outerBoundaryCount:outerCount,boundaryEdgeCount:boundary.length,columns:c,rows:r,spacingMm:[dx,dy],boundaryApproximationBoundMm:2*Math.hypot(dx,dy),boundaryKind:'retained-grid-cell-boundary',analyticCircularBoundary:false}};
}
export function maskedDesignMesh(p,heightsMm,active){
 const a=analyzeDesignMask(p,active),n=a.used.size,ids=[...a.used],remap=new Map(ids.map((k,i)=>[k,i]));
 if(heightsMm?.length!==p.columns*p.rows||!Number.isFinite(p.baseMm)||p.baseMm<=0)fail('RELIEF_DESIGN_MASK_INVALID','Invalid physical height samples or base');
 const positions=new Float64Array(n*6),indices=[];
 for(let i=0;i<n;i++){
  const k=ids[i],x=-p.widthMm/2+(k%p.columns)*p.widthMm/(p.columns-1),y=p.depthMm/2-Math.floor(k/p.columns)*p.depthMm/(p.rows-1),z=p.baseMm+heightsMm[k];
  if(!Number.isFinite(z)||z<=0)fail('RELIEF_DESIGN_BASE_INTERSECTION','Every retained height must stay strictly above the flat back');
  positions.set([x,y,z],i*3);positions.set([x,y,0],(i+n)*3);
 }
 for(let k=0;k<a.triangles.length;k+=3){const [u,v,w]=a.triangles.slice(k,k+3).map(id=>remap.get(id));indices.push(u,v,w,u+n,w+n,v+n);}
 for(const e of a.boundary){const u=remap.get(e.a),v=remap.get(e.b);indices.push(v,u,u+n,v,u+n,v+n);}
 return {positions,indices:Uint32Array.from(indices),domainReport:{...a.report,closedConstruction:'paired-top-bottom-triangles-and-every-boundary-wall',backPlaneMm:0,geometryKind:'rawMesh',precisionClaim:'sampled-boundary-not-exact-BRep'}};
}
export function makeMaskedHeightfieldMesh({heightsMm,active,...grid}){
 const result=maskedDesignMesh(grid,heightsMm,active);
 return {positions:result.positions,indices:result.indices,report:result.domainReport};
}
