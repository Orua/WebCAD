// When a later whole-body fillet asks for a larger radius than blends already
// on the solid, recover the underlying sharp supports and re-fillet at the new R.
import * as cad from 'replicad';

const dispose=value=>{try{value?.delete?.();}catch{}};
const unit=v=>{const n=Math.hypot(...v);return n>1e-15?v.map(a=>a/n):null;};
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);

function cylinderSectorFraction(face,oc){
  let adaptor;
  try{
    adaptor=new oc.BRepAdaptor_Surface(face.wrapped,false);
    const c=adaptor.Cylinder(),loc=c.Location(),dir=c.Axis().Direction(),r=c.Radius();
    const origin=[loc.X(),loc.Y(),loc.Z()],axis=unit([dir.X(),dir.Y(),dir.Z()]);
    if(!axis||!(r>0))return null;
    let min=Infinity,max=-Infinity;
    for(const vertex of cad.iterTopo(face.wrapped,'vertex')){
      let pnt;
      try{
        pnt=oc.BRep_Tool.Pnt(vertex);
        const along=(pnt.X()-origin[0])*axis[0]+(pnt.Y()-origin[1])*axis[1]+(pnt.Z()-origin[2])*axis[2];
        if(along<min)min=along;if(along>max)max=along;
      }finally{dispose(pnt);dispose(vertex);}
    }
    const length=max-min;
    if(!(length>1e-9))return null;
    return cad.measureArea(face)/(2*Math.PI*r*length);
  }catch{return null;}
  finally{dispose(adaptor);}
}

function surfaceRadius(face,oc){
  if(!['CYLINDRE','SPHERE','TORUS'].includes(face.geomType))return null;
  let adaptor;
  try{
    adaptor=new oc.BRepAdaptor_Surface(face.wrapped,false);
    if(face.geomType==='CYLINDRE'){
      // Underlying U/V spans are the infinite surface (0..2π × ±∞). Use the
      // trimmed face area: edge-blend sectors are well under a half-cylinder.
      const fraction=cylinderSectorFraction(face,oc);
      if(fraction==null||fraction>=.45)return null;
      return adaptor.Cylinder().Radius();
    }
    if(face.geomType==='SPHERE')return adaptor.Sphere().Radius();
    const torus=adaptor.Torus();
    return Math.min(torus.MajorRadius(),torus.MinorRadius());
  }catch{return null;}
  finally{dispose(adaptor);}
}

export function smallerBlendRadii(shape,requestedRadius){
  const oc=cad.getOC(),faces=shape.faces,radii=[];
  try{
    for(const face of faces){
      const radius=surfaceRadius(face,oc);
      if(radius!=null&&radius>1e-9&&radius<requestedRadius-1e-6)radii.push(radius);
    }
    return radii;
  }finally{faces.forEach(dispose);}
}

function recoverHalfspaces(shape){
  const faces=shape.faces,planes=[];
  try{
    for(const face of faces){
      if(face.geomType!=='PLANE')continue;
      const c=face.center.toTuple();
      const nRaw=face.normalAt(c),n=unit(nRaw.toTuple());
      dispose(nRaw);
      if(!n)continue;
      planes.push({p:c,n});
    }
  }finally{faces.forEach(dispose);}
  if(planes.length<4)return null;
  const bb=shape.boundingBox,b=bb.bounds;dispose(bb);
  const pad=20,span=Math.max(b[1][0]-b[0][0],b[1][1]-b[0][1],b[1][2]-b[0][2],1),d=span+2*pad+50;
  let solid=cad.makeBox([b[0][0]-pad,b[0][1]-pad,b[0][2]-pad],[b[1][0]+pad,b[1][1]+pad,b[1][2]+pad]);
  try{
    for(const pl of planes){
      const seed=Math.abs(pl.n[0])<.9?[1,0,0]:[0,1,0],x=unit(sub(seed,mul(pl.n,dot(seed,pl.n))));
      if(!x)throw new Error('plane frame');
      const plane=new cad.Plane(pl.p,x,pl.n);
      const drawing=cad.drawRectangle(d*2,d*2);
      const sketch=drawing.sketchOnPlane(plane);
      const cutter=sketch.extrude(d,{extrusionDirection:pl.n});
      const next=solid.cut(cutter);
      [solid,cutter,sketch,drawing,plane].forEach(dispose);
      solid=next;
    }
    return solid;
  }catch(error){dispose(solid);return null;}
}

function aabbVolume(shape){
  const box=shape.boundingBox;
  try{
    const [lo,hi]=box.bounds;
    return Math.abs((hi[0]-lo[0])*(hi[1]-lo[1])*(hi[2]-lo[2]));
  }finally{dispose(box);}
}

function validRecovered(source,recovered){
  if(!recovered)return false;
  const oc=cad.getOC();
  const analyzer=new oc.BRepCheck_Analyzer(recovered.wrapped,true,false,false),solids=recovered.solids;
  try{
    if(!analyzer.IsValid()||solids.length!==1)return false;
    const before=cad.measureVolume(source),after=cad.measureVolume(recovered),room=aabbVolume(source);
    if(!(after>1e-6))return false;
    // Convex unfillet adds material back and must stay inside the current AABB.
    if(!(after>before+1e-6&&after<=room+Math.max(1,room*1e-6)))return false;
    return true;
  }finally{dispose(analyzer);solids.forEach(dispose);}
}

// Whole-body (allEdges) requests: if the solid already has smaller constant-radius
// blends and the remaining supports are planes, recover the sharp polyhedron so
// the later fillet can apply a uniform larger R. Returns null when this is not
// safe (curved supports, concave hull, nothing smaller to upgrade).
export function tryUpgradeSmallerBlends(shape,requestedRadius){
  if(!(requestedRadius>0))return null;
  const radii=smallerBlendRadii(shape,requestedRadius);
  if(!radii.length)return null;
  const faces=shape.faces;
  let curvedSupport=false,planeCount=0;
  try{
    const oc=cad.getOC();
    for(const face of faces){
      if(face.geomType==='PLANE'){planeCount++;continue;}
      const radius=surfaceRadius(face,oc);
      if(radius==null||radius>=requestedRadius-1e-6)curvedSupport=true;
    }
  }finally{faces.forEach(dispose);}
  if(curvedSupport||planeCount<4)return null;
  const recovered=recoverHalfspaces(shape);
  if(!validRecovered(shape,recovered)){dispose(recovered);return null;}
  return {shape:recovered,report:{strategy:'recover-planar-supports',priorBlendCount:radii.length,priorBlendRadiusMm:Math.min(...radii),requestedRadiusMm:requestedRadius,recoveredVolumeMm3:cad.measureVolume(recovered)}};
}
