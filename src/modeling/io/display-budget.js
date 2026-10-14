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
  const adaptive=heavy||faces.length>=faceThreshold;
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
export function meshFacesProgressively(faces,settings,onBatch){
  const parts=[],faceGroups=[];let batchStart=0,batchTriangles=0,indexCount=0;
  faces.forEach((face,i)=>{
    const m=face.mesh(settings),count=m.triangles.length;
    parts.push(m);faceGroups.push({start:indexCount,count,faceId:face.hashCode});indexCount+=count;batchTriangles+=count/3;
    if(onBatch&&(batchTriangles>=DISPLAY_BUDGET.streamTriangleBatch||i===faces.length-1)){
      const batch=parts.slice(batchStart);batchStart=parts.length;batchTriangles=0;
      onBatch({completed:i+1,total:faces.length,triangles:indexCount/3,positions:concat(batch,'vertices',Float32Array),normals:concat(batch,'normals',Float32Array),indices:concat(batch,'triangles',Uint32Array,'vertices')});
    }
  });
  return {vertices:concat(parts,'vertices',Float32Array),normals:concat(parts,'normals',Float32Array),triangles:concat(parts,'triangles',Uint32Array,'vertices'),faceGroups};
}
