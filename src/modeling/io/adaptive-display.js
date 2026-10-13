import * as cad from 'replicad';
import {EXACT_DISPLAY} from '../../viewport/exact-display-policy.js';
const dispose=v=>{try{v?.delete?.();}catch{}};
export function isPlanarPolygon(face){
  if(face.geomType!=='PLANE')return false;
  const edges=face.edges;try{return edges.every(edge=>edge.geomType==='LINE');}finally{edges.forEach(dispose);}
}
// Bounded chord sampling avoids global EdgeMeshExtractor work on dense spline
// surfaces. These polylines are visual only; edge IDs still address exact BRep.
export function displayEdges(edges,tolerance,oc){
  return edges.map((edge,edgeId)=>{
    if(oc.BRep_Tool.Degenerated(edge.wrapped))return {edgeId,positions:[]};
    const curve=new oc.BRepAdaptor_Curve(edge.wrapped),first=curve.FirstParameter(),last=curve.LastParameter();
    try{
    const point=t=>{const p=curve.Value(first+(last-first)*t);try{return [p.X(),p.Y(),p.Z()];}finally{dispose(p);}};
    const positions=[];let segments=0;
    const split=(a,b,pa,pb,depth)=>{
      const m=(a+b)/2,pm=point(m),chord=pa.map((v,k)=>(v+pb[k])/2);
      const error=Math.hypot(...pm.map((v,k)=>v-chord[k]));
      if(depth<7&&segments<127&&error>tolerance){split(a,m,pa,pm,depth+1);split(m,b,pm,pb,depth+1);}
      else{positions.push(...pa,...pb);segments++;}
    };
    // Seed multiple intervals so periodic curves and inflected splines do not
    // vanish just because their midpoint happens to lie on the endpoint chord.
    let pa=point(0);
    for(let i=1;i<=8;i++){const pb=point(i/8);split((i-1)/8,i/8,pa,pb,0);pa=pb;}
    return {edgeId,positions};
    }finally{dispose(curve);}
  });
}
export function displayMetadata(shape,faces,edges,oc){
  // AddOptimal(false) solves extrema on every spline and can dominate import.
  // Cached triangulation + deflection gives a conservative display box instead.
  const box=new cad.BoundingBox(),solids=shape.solids,shells=Array.from(cad.iterTopo(shape.wrapped,'shell'));
  oc.BRepBndLib.Add(shape.wrapped,box.wrapped,true);
  try{const [min,max]=box.bounds;return {faceCount:faces.length,edgeCount:edges.length,bounds:{min,max},
    solidCount:solids.length,shellCount:shells.length,volume:null,area:null,snapPoints:[],
    metricsDeferred:true,boundsSource:'conservative-display-box',measurementStatus:'on-demand-exact-brep'};
  }finally{[box,...solids,...shells].forEach(dispose);}
}
export function refineExactDisplay(engine,{bodyId,renderVersion,faceIds,tolerance}){
  const cached=engine.renderCache.get(bodyId)?.body,shape=engine.shapes.get(bodyId);
  if(!shape||!cached?.adaptiveDisplay||cached.renderVersion!==renderVersion)
    throw Object.assign(new Error('Display source changed'),{code:'STALE_DISPLAY'});
  if(!Array.isArray(faceIds)||faceIds.length>EXACT_DISPLAY.maxFacesPerRequest||!faceIds.length||
    !Number.isFinite(tolerance)||tolerance<EXACT_DISPLAY.minTolerance||tolerance>EXACT_DISPLAY.initialTolerance)
    throw new Error('Invalid display refinement request');
  const faces=shape.faces;
  try{return {bodyId,renderVersion,tolerance,patches:faceIds.map(faceId=>{
    if(!Number.isInteger(faceId)||!faces[faceId])throw new Error('Invalid display face');
    try{
      const mesh=faces[faceId].mesh({tolerance,angularTolerance:.45});
      if(mesh.triangles.length/3>250000)return {faceId,limited:true};
      return {faceId,positions:new Float32Array(mesh.vertices),normals:new Float32Array(mesh.normals),indices:new Uint32Array(mesh.triangles)};
    }finally{engine.oc.BRepTools.Clean(faces[faceId].wrapped,false);}
  })};}finally{faces.forEach(dispose);}
}
