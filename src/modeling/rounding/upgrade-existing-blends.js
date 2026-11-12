// When a later whole-body fillet asks for a larger radius than blends already
// on the solid, recover the underlying sharp supports and re-fillet at the new R.
import * as cad from 'replicad';
import {topologyDetails} from './topology.js';
import {sectionAt,extrudeSection} from './mill-fillet-fallback.js';
import {robustUnion} from '../robust-union.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const unit=v=>{const n=Math.hypot(...v);return n>1e-15?v.map(a=>a/n):null;};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

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
    // Half-space intersection is always convex. Only use it when the source is
    // already box-like; an L (or any concave solid) can share its AABB with the
    // convex hull and must not be "recovered" into that hull.
    if(!(before>=room*0.9))return false;
    return true;
  }finally{dispose(analyzer);solids.forEach(dispose);}
}

function planeIntersection(p1,n1,p2,n2){
  const dir=unit(cross(n1,n2));
  if(!dir)return null;
  const n1n2=dot(n1,n2),den=1-n1n2*n1n2;
  if(Math.abs(den)<1e-12)return null;
  const d1=dot(n1,p1),d2=dot(n2,p2);
  const c1=(d1-d2*n1n2)/den,c2=(d2-d1*n1n2)/den;
  return {point:add(mul(n1,c1),mul(n2,c2)),dir};
}

function planeOfFace(face){
  const c=face.center.toTuple();
  const nRaw=face.normalAt(c),n=unit(nRaw.toTuple());
  dispose(nRaw);
  return n?{point:c,normal:n}:null;
}

function cylinderGeom(face,oc){
  if(face.geomType!=='CYLINDRE')return null;
  let adaptor;
  try{
    adaptor=new oc.BRepAdaptor_Surface(face.wrapped,false);
    const c=adaptor.Cylinder(),loc=c.Location(),ax=c.Axis().Direction();
    const axis=unit([ax.X(),ax.Y(),ax.Z()]);
    if(!axis)return null;
    return {radiusMm:c.Radius(),origin:[loc.X(),loc.Y(),loc.Z()],axis};
  }catch{return null;}
  finally{dispose(adaptor);}
}

function torusGeom(face,oc){
  if(face.geomType!=='TORUS')return null;
  let adaptor;
  try{
    adaptor=new oc.BRepAdaptor_Surface(face.wrapped,false);
    const t=adaptor.Torus(),loc=t.Location(),ax=t.Axis().Direction();
    const axis=unit([ax.X(),ax.Y(),ax.Z()]);
    if(!axis)return null;
    return {majorMm:t.MajorRadius(),minorMm:t.MinorRadius(),origin:[loc.X(),loc.Y(),loc.Z()],axis};
  }catch{return null;}
  finally{dispose(adaptor);}
}

function projectAlong(origin,dir,point){
  return dot(sub(point,origin),dir);
}

function faceVertexRange(face,origin,dir,oc){
  let min=Infinity,max=-Infinity;
  for(const vertex of cad.iterTopo(face.wrapped,'vertex')){
    let pnt;
    try{
      pnt=oc.BRep_Tool.Pnt(vertex);
      const along=projectAlong(origin,dir,[pnt.X(),pnt.Y(),pnt.Z()]);
      if(along<min)min=along;if(along>max)max=along;
    }finally{dispose(pnt);dispose(vertex);}
  }
  return Number.isFinite(min)?{min,max}:null;
}

function isValidSolid(shape){
  if(!shape)return false;
  const oc=cad.getOC();
  const analyzer=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false),solids=shape.solids;
  try{return analyzer.IsValid()&&solids.length===1&&cad.measureVolume(shape)>1e-6;}
  finally{dispose(analyzer);solids.forEach(dispose);}
}

function unfilletPlanarCylinder(shape,requestedRadius,skipKeys){
  const oc=cad.getOC(),faces=shape.faces,rows=topologyDetails(shape);
  try{
    for(let i=0;i<faces.length;i++){
      const face=faces[i];
      const radius=surfaceRadius(face,oc);
      if(radius==null||radius>=requestedRadius-1e-6)continue;
      if(face.geomType!=='CYLINDRE')continue;
      const geom=cylinderGeom(face,oc);
      if(!geom)continue;
      const key=`cyl:${geom.radiusMm.toFixed(5)}:${geom.origin.map(v=>v.toFixed(4)).join(',')}:${geom.axis.map(v=>v.toFixed(4)).join(',')}`;
      if(skipKeys.has(key))continue;
      const edges=shape.edges;
      const planeIds=[];
      try{
        for(const row of rows){
          if(!row.adjacentFaceIds.includes(i))continue;
          const edge=edges[row.edgeId];
          // End-cap arcs also touch the blend; only the straight rails are the
          // original plane-plane supports.
          if(edge?.geomType!=='LINE')continue;
          for(const id of row.adjacentFaceIds){
            if(id!==i&&faces[id]?.geomType==='PLANE'&&!planeIds.includes(id))planeIds.push(id);
          }
        }
      }finally{edges.forEach(dispose);}
      if(planeIds.length!==2){skipKeys.add(key);continue;}
      const plA=planeOfFace(faces[planeIds[0]]),plB=planeOfFace(faces[planeIds[1]]);
      if(!plA||!plB){skipKeys.add(key);continue;}
      const hit=planeIntersection(plA.point,plA.normal,plB.point,plB.normal);
      if(!hit){skipKeys.add(key);continue;}
      const range=faceVertexRange(face,hit.point,hit.dir,oc);
      if(!range||!(range.max-range.min>1e-6)){skipKeys.add(key);continue;}
      const pad=1e-3,start=add(hit.point,mul(hit.dir,range.min-pad)),length=range.max-range.min+2*pad;
      const mid=add(hit.point,mul(hit.dir,(range.min+range.max)/2));
      let sec,tool,next;
      try{
        sec=sectionAt(faces[planeIds[0]],faces[planeIds[1]],mid,hit.dir,radius);
        tool=extrudeSection(start,hit.dir,sec,length);
        next=sec.material==='remove'?shape.fuse(tool):shape.cut(tool);
      }catch{skipKeys.add(key);dispose(tool);dispose(next);continue;}
      finally{dispose(tool);}
      const before=cad.measureVolume(shape),after=cad.measureVolume(next);
      const expectedDir=sec.material==='remove'?after>before+1e-8:after<before-1e-8;
      const room=aabbVolume(shape);
      if(!isValidSolid(next)||!expectedDir||after>room+Math.max(1,room*1e-4)||after<=1e-6){
        skipKeys.add(key);dispose(next);continue;
      }
      // The restored blend should have disappeared (or at least shrunk in count).
      const beforeCount=smallerBlendRadii(shape,requestedRadius).length;
      const afterCount=smallerBlendRadii(next,requestedRadius).length;
      if(!(afterCount<beforeCount)){skipKeys.add(key);dispose(next);continue;}
      return {shape:next,key,radiusMm:radius,material:sec.material,kind:'planar-cylinder'};
    }
    return null;
  }finally{faces.forEach(dispose);}
}

function rimWedge(origin,axis,rCyl,rFil,capPoint,capNormal,opts={}){
  const bite=opts.bite||0.02,pad=opts.pad||0.05;
  const zDir=dot(capNormal,axis)>=0?1:-1;
  const ax=zDir>0?axis:mul(axis,-1);
  const capAlong=projectAlong(origin,ax,capPoint);
  const r1=rCyl-rFil,arcR=Math.max(rFil-bite,rFil*0.5);
  // Sketch in a plane containing the axis: origin at `origin`, X = radial, "Y" (2d) = along axis.
  const seed=Math.abs(ax[0])<.9?[1,0,0]:[0,1,0],radial=unit(sub(seed,mul(ax,dot(seed,ax))));
  if(!radial)return null;
  const plane=new cad.Plane(origin,radial,unit(cross(radial,ax)));
  const zCap=capAlong,z1=capAlong-zDir*zDir*rFil;
  // zDir in this frame: we used ax pointing toward / consistent with +cap side.
  // With ax pointing so cap is on the +ax side of the torus center, zCap > torus along.
  const alongCap=capAlong;
  const alongInner=alongCap-rFil; // toward the body
  const midAlong=alongInner+arcR*Math.SQRT1_2;
  const midR=r1+arcR*Math.SQRT1_2;
  const drawing=cad.draw([rCyl+pad,alongCap+pad]).lineTo([rCyl+pad,alongInner]).threePointsArcTo([r1,alongCap+pad],[midR,midAlong]).close();
  const sketch=drawing.sketchOnPlane(plane);
  const face=cad.makeFace(sketch.wire);
  const solid=cad.revolution(face,origin,ax,360);
  [face,sketch,drawing,plane].forEach(dispose);
  void z1;
  return solid;
}

function unfilletTorusRim(shape,requestedRadius,skipKeys){
  const oc=cad.getOC(),faces=shape.faces,rows=topologyDetails(shape);
  try{
    for(let i=0;i<faces.length;i++){
      const face=faces[i];
      const radius=surfaceRadius(face,oc);
      if(radius==null||radius>=requestedRadius-1e-6||face.geomType!=='TORUS')continue;
      const geom=torusGeom(face,oc);
      if(!geom)continue;
      const key=`tor:${geom.minorMm.toFixed(5)}:${geom.origin.map(v=>v.toFixed(4)).join(',')}:${geom.axis.map(v=>v.toFixed(4)).join(',')}`;
      if(skipKeys.has(key))continue;
      let planeId=-1,cylId=-1;
      for(const row of rows){
        if(!row.adjacentFaceIds.includes(i))continue;
        for(const id of row.adjacentFaceIds){
          if(id===i)continue;
          if(faces[id]?.geomType==='PLANE'&&planeId<0)planeId=id;
          if(faces[id]?.geomType==='CYLINDRE'&&cylId<0)cylId=id;
        }
      }
      if(planeId<0||cylId<0){skipKeys.add(key);continue;}
      const cyl=cylinderGeom(faces[cylId],oc),pl=planeOfFace(faces[planeId]);
      if(!cyl||!pl){skipKeys.add(key);continue;}
      // Convex exterior rim: major ≈ rCyl − rFil. Do not treat a pipe/tube as a fillet.
      if(Math.abs(geom.majorMm-(cyl.radiusMm-geom.minorMm))>Math.max(0.05,geom.minorMm*0.05)){skipKeys.add(key);continue;}
      const bodyFraction=cylinderSectorFraction(faces[cylId],oc);
      if(bodyFraction!=null&&bodyFraction<.45){skipKeys.add(key);continue;}
      let tool,next;
      try{
        tool=rimWedge(cyl.origin,cyl.axis,cyl.radiusMm,geom.minorMm,pl.point,pl.normal);
        if(!tool||!isValidSolid(tool)){skipKeys.add(key);dispose(tool);continue;}
        try{next=shape.fuse(tool);}catch{next=null;}
        if(!next||!isValidSolid(next)){
          dispose(next);next=null;
          try{
            const fused=robustUnion([shape,tool]);
            if(isValidSolid(fused))next=fused;else dispose(fused);
          }catch{dispose(next);next=null;}
        }
      }catch{skipKeys.add(key);dispose(tool);dispose(next);continue;}
      finally{dispose(tool);}
      if(!next){skipKeys.add(key);continue;}
      const before=cad.measureVolume(shape),after=cad.measureVolume(next),room=aabbVolume(shape);
      if(!(after>before+1e-8)||after>room+Math.max(1,room*1e-4)){skipKeys.add(key);dispose(next);continue;}
      const beforeCount=smallerBlendRadii(shape,requestedRadius).length;
      const afterCount=smallerBlendRadii(next,requestedRadius).length;
      if(!(afterCount<beforeCount)){skipKeys.add(key);dispose(next);continue;}
      return {shape:next,key,radiusMm:geom.minorMm,material:'remove',kind:'cylinder-rim-torus'};
    }
    return null;
  }finally{faces.forEach(dispose);}
}

function restoreLocalBlends(shape,requestedRadius){
  const skipKeys=new Set();
  let current=shape,restored=0,kinds=[],priorRadii=[];
  try{
    for(let pass=0;pass<32;pass++){
      const one=unfilletPlanarCylinder(current,requestedRadius,skipKeys)||unfilletTorusRim(current,requestedRadius,skipKeys);
      if(!one)break;
      if(current!==shape)dispose(current);
      current=one.shape;
      restored++;
      kinds.push(one.kind);
      priorRadii.push(one.radiusMm);
      skipKeys.delete(one.key);
    }
    if(!restored||current===shape){if(current!==shape)dispose(current);return null;}
    const leftover=smallerBlendRadii(current,requestedRadius);
    const out=current;current=null;
    return {shape:out,report:{
      strategy:'recover-local-blends',
      priorBlendCount:restored,
      priorBlendRadiusMm:Math.min(...priorRadii),
      requestedRadiusMm:requestedRadius,
      recoveredVolumeMm3:cad.measureVolume(out),
      restoredKinds:kinds,
      leftoverSmallerBlendCount:leftover.length,
      leftoverSmallerRadiusMm:leftover.length?Math.min(...leftover):null
    }};
  }catch(error){
    if(current!==shape)dispose(current);
    return null;
  }
}

// Whole-body (allEdges) requests: recover existing smaller blends so a later
// fillet can apply a uniform larger R. Half-spaces are used only for box-like
// convex solids. Otherwise each planar-planar cylindrical blend (convex or
// concave) is locally unfilleted, and convex cylinder-rim tori are restored
// when the complementary revolve fuses cleanly. Returns a recovered shape
// even if some blends could not be upgraded, with an honest leftover count.
// Returns null when nothing could be safely restored.
export function tryUpgradeSmallerBlends(shape,requestedRadius){
  if(!(requestedRadius>0))return null;
  const radii=smallerBlendRadii(shape,requestedRadius);
  if(!radii.length)return null;
  const recovered=recoverHalfspaces(shape);
  if(validRecovered(shape,recovered)){
    return {shape:recovered,report:{strategy:'recover-planar-supports',priorBlendCount:radii.length,priorBlendRadiusMm:Math.min(...radii),requestedRadiusMm:requestedRadius,recoveredVolumeMm3:cad.measureVolume(recovered)}};
  }
  dispose(recovered);
  return restoreLocalBlends(shape,requestedRadius);
}
