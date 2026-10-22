// Display-only tessellation budget for imported / heavy exact BReps.
// Face count alone misses single huge B-spline faces (e.g. a 628x503-pole relief
// in 6 faces), which made BRepMesh exhaust the 32-bit wasm heap at .08 mm.
const dispose=v=>{try{v?.delete?.();}catch{}};
export const DISPLAY_BUDGET=Object.freeze({heavyFacePoles:20000,heavyShapePoles:60000,heavySourceBytes:8*1024*1024,
  // Display chord targets as a fraction of the bounding-box diagonal.
  heavyDiagonalFraction:1/128,maxTolerance:5,coarsenFactor:4,streamTriangleBatch:60000});
function splinePoles(face,oc){
  if(!['BSPLINE_SURFACE','BEZIER_SURFACE'].includes(face.geomType))return 0;
  let adaptor,surface;
  try{adaptor=new oc.BRepAdaptor_Surface(face.wrapped,false);surface=face.geomType==='BSPLINE_SURFACE'?adaptor.BSpline():adaptor.Bezier();return surface.NbUPoles()*surface.NbVPoles();}
  catch{return 0;}finally{[surface,adaptor].forEach(dispose);}
}
// Returns per-face pole counts, heavy faces and the initial display tolerance.
export function displayComplexity(shape,faces,oc,{sourceBytes=0,coarsen=1,faceThreshold=200,requested}={}){
  const poles=faces.map(face=>splinePoles(face,oc)),totalPoles=poles.reduce((a,b)=>a+b,0);
  const heavyFaces=new Set(poles.flatMap((n,i)=>n>=DISPLAY_BUDGET.heavyFacePoles?[i]:[]));
  const heavy=heavyFaces.size>0||totalPoles>=DISPLAY_BUDGET.heavyShapePoles||sourceBytes>=DISPLAY_BUDGET.heavySourceBytes||coarsen>1;
  // Dense relief faces need streamed faces and direct edge polylines; meshEdges would tessellate the same surface again.
  const adaptive=heavy||totalPoles>=4096||faces.length>=faceThreshold;
  let diagonal=0;
  if(heavy){const box=shape.boundingBox;try{const [a,b]=box.bounds;diagonal=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);}finally{dispose(box);}}
  const base=heavy?Math.max(requested.tolerance,diagonal*DISPLAY_BUDGET.heavyDiagonalFraction):requested.tolerance;
  const tolerance=Math.min(DISPLAY_BUDGET.maxTolerance,base*coarsen);
  return {adaptive,heavy,heavyFaces,poles,totalPoles,diagonal,tolerance,angularTolerance:heavy?Math.max(.5,requested.angularTolerance):requested.angularTolerance};
}
// Mesh face by face so progress and partial geometry can be streamed while only
// one face's triangulation grows at a time. Returns the same shape as
// replicad's shape.mesh() (faceGroups keyed by face hashCode, index-unit ranges).
const concat=(parts,key,Type,offsetKey)=>{const out=new Type(parts.reduce((n,m)=>n+m[key].length,0));let k=0,base=0;
  for(const m of parts){if(offsetKey){for(let i=0;i<m[key].length;i++)out[k+i]=m[key][i]+base;base+=m[offsetKey].length/3;}else out.set(m[key],k);k+=m[key].length;}return out;};

// Complete rectangular dense spline faces: seed every knot interval so a mesher
// cannot miss a narrow relief between otherwise flat boundary/midpoint samples.
// Four straight edges and matching full-surface corners exclude trimmed holes.
export function meshDenseRectangle(face,oc){
 if(!oc||face.geomType!=='BSPLINE_SURFACE')return null;
 const edges=face.edges;let a,s;
 try{
  if(edges.length!==4||edges.some(e=>e.geomType!=='LINE'))return null;
  a=new oc.BRepAdaptor_Surface(face.wrapped,false);s=a.BSpline();
  const nu=s.NbUPoles(),nv=s.NbVPoles();if(nu*nv<4096)return null;
  const u0=a.FirstUParameter(),u1=a.LastUParameter(),v0=a.FirstVParameter(),v1=a.LastVParameter();
  const point=(u,v)=>{const p=a.Value(u,v);try{return [p.X(),p.Y(),p.Z()];}finally{dispose(p);}};
  const ends=edges.flatMap(e=>{const p=e.startPoint,q=e.endPoint;try{return [p.toTuple(),q.toTuple()];}finally{dispose(p);dispose(q);}});
  if([[u0,v0],[u1,v0],[u0,v1],[u1,v1]].some(([u,v])=>{const p=point(u,v);return !ends.some(q=>Math.hypot(...p.map((x,k)=>x-q[k]))<1e-6);}))return null;
  const knots=(count,get,lo,hi)=>{const out=[lo];for(let k=1;k<count;k++){const x=get(k),y=get(k+1);if(x<lo||y>hi)continue;out.push((x+y)/2,y);}return out;};
  const us=knots(s.NbUKnots(),k=>s.UKnot(k),u0,u1),vs=knots(s.NbVKnots(),k=>s.VKnot(k),v0,v1);
  if(us.length*vs.length>300000)return null;
  const vertices=new Float64Array(us.length*vs.length*3),normals=new Float64Array(vertices.length),triangles=[];
  for(let j=0;j<vs.length;j++)for(let i=0;i<us.length;i++)vertices.set(point(us[i],vs[j]),3*(j*us.length+i));
  const triangle=(a,b,c)=>{if(face.orientation==='backward')[b,c]=[c,b];triangles.push(a,b,c);const p=a*3,q=b*3,r=c*3,x=vertices[q]-vertices[p],y=vertices[q+1]-vertices[p+1],z=vertices[q+2]-vertices[p+2],X=vertices[r]-vertices[p],Y=vertices[r+1]-vertices[p+1],Z=vertices[r+2]-vertices[p+2],n=[y*Z-z*Y,z*X-x*Z,x*Y-y*X];for(const k of [p,q,r])for(let d=0;d<3;d++)normals[k+d]+=n[d];};
  for(let j=0;j<vs.length-1;j++)for(let i=0;i<us.length-1;i++){const k=j*us.length+i;triangle(k,k+1,k+us.length+1);triangle(k,k+us.length+1,k+us.length);}
  for(let k=0;k<normals.length;k+=3){const length=Math.hypot(normals[k],normals[k+1],normals[k+2])||1;for(let d=0;d<3;d++)normals[k+d]/=length;}
  return {vertices,normals,triangles};
 }finally{edges.forEach(dispose);dispose(s);dispose(a);}
}

export function meshFacesProgressively(faces,settings,onBatch,oc){
  const parts=[],faceGroups=[];let batchStart=0,batchTriangles=0,indexCount=0;
  faces.forEach((face,i)=>{
    const m=meshDenseRectangle(face,oc)??face.mesh(settings),count=m.triangles.length;
    parts.push(m);faceGroups.push({start:indexCount,count,faceId:face.hashCode});indexCount+=count;batchTriangles+=count/3;
    if(onBatch&&(batchTriangles>=DISPLAY_BUDGET.streamTriangleBatch||i===faces.length-1)){
      const batch=parts.slice(batchStart);batchStart=parts.length;batchTriangles=0;
      onBatch({completed:i+1,total:faces.length,triangles:indexCount/3,positions:concat(batch,'vertices',Float32Array),normals:concat(batch,'normals',Float32Array),indices:concat(batch,'triangles',Uint32Array,'vertices')});
    }
  });
  return {vertices:concat(parts,'vertices',Float32Array),normals:concat(parts,'normals',Float32Array),triangles:concat(parts,'triangles',Uint32Array,'vertices'),faceGroups};
}
