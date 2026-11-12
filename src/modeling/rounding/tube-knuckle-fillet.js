// Polyline circular-tube knuckles: OCCT MakeFillet cannot build a transition
// on the elliptical cylinder-cylinder miters at any tried radius. Recover the
// spine, replace each miter with a torus elbow of major radius (tube R +
// requested fillet R, clipped to what the segments allow), then fillet the
// end caps natively.
import * as cad from 'replicad';
import {robustUnion} from '../robust-union.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const unit=v=>{const n=Math.hypot(...v);return n>1e-15?v.map(a=>a/n):null;};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dist=(a,b)=>Math.hypot(...sub(a,b));

function cylinderOf(face,oc){
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

function planeOf(face){
  if(face.geomType!=='PLANE')return null;
  const c=face.center.toTuple();
  const nRaw=face.normalAt(c),n=unit(nRaw.toTuple());
  dispose(nRaw);
  return n?{point:c,normal:n}:null;
}

function sameAxis(a,b){
  if(Math.abs(Math.abs(dot(a.axis,b.axis))-1)>1e-5)return false;
  const d=sub(b.origin,a.origin),rej=sub(d,mul(a.axis,dot(d,a.axis)));
  return Math.hypot(...rej)<1e-3;
}

function closestPointOnLine(origin,axis,point){
  return add(origin,mul(axis,dot(sub(point,origin),axis)));
}

function lineIntersection(p1,d1,p2,d2){
  const w0=sub(p1,p2),b=dot(d1,d2),dd=1-b*b;
  if(Math.abs(dd)<1e-12)return null;
  const dv=dot(d1,w0),e=dot(d2,w0);
  const t=(b*e-dv)/dd,s=(e-b*dv)/dd;
  const q1=add(p1,mul(d1,t)),q2=add(p2,mul(d2,s));
  if(dist(q1,q2)>1e-3)return null;
  return mul(add(q1,q2),.5);
}

function planeLineHit(plane,origin,axis){
  const den=dot(axis,plane.normal);
  if(Math.abs(den)<1e-10)return null;
  const t=dot(sub(plane.point,origin),plane.normal)/den;
  return add(origin,mul(axis,t));
}

function uniqueAxes(cylinders){
  const groups=[];
  for(const c of cylinders){
    const g=groups.find(item=>Math.abs(item.radiusMm-c.radiusMm)<1e-6&&sameAxis(item,c));
    if(g)g.members.push(c);
    else groups.push({radiusMm:c.radiusMm,origin:c.origin,axis:c.axis,members:[c]});
  }
  return groups;
}

// A circular polyline tube: only same-radius cylinders plus two planar caps,
// at least two segments, axes meeting at corners.
export function detectPolylineTube(shape){
  const oc=cad.getOC(),faces=shape.faces;
  try{
    const cylinders=[],planes=[];
    for(const face of faces){
      const cyl=cylinderOf(face,oc);if(cyl){cylinders.push(cyl);continue;}
      const pl=planeOf(face);if(pl){planes.push(pl);continue;}
      return null;
    }
    if(planes.length!==2||cylinders.length<2)return null;
    const radius=cylinders[0].radiusMm;
    if(!cylinders.every(c=>Math.abs(c.radiusMm-radius)<1e-6)||!(radius>0))return null;
    const segments=uniqueAxes(cylinders);
    if(segments.length<2)return null;
    // Cap centers: each cap plane should intersect exactly one segment axis near an end.
    const capHits=planes.map(pl=>{
      const hits=segments.map((seg,i)=>{const p=planeLineHit(pl,seg.origin,seg.axis);return p?{i,p,d:dist(p,closestPointOnLine(seg.origin,seg.axis,p))}:null;}).filter(Boolean);
      hits.sort((a,b)=>a.d-b.d);
      return hits[0]&&hits[0].d<1e-3?hits[0]:null;
    });
    if(capHits.some(h=>!h)||capHits[0].i===capHits[1].i)return null;
    // Chain segments from the first cap by nearest unused axis intersection.
    const used=new Set(),order=[],corners=[];
    let current=capHits[0].i;used.add(current);order.push(current);
    while(used.size<segments.length){
      let best=null;
      for(let j=0;j<segments.length;j++){
        if(used.has(j))continue;
        const p=lineIntersection(segments[current].origin,segments[current].axis,segments[j].origin,segments[j].axis);
        if(!p)continue;
        const score=dist(p,capHits[0].p);
        if(!best||score<best.score)best={j,p,score};
      }
      if(!best)return null;
      corners.push(best.p);used.add(best.j);order.push(best.j);current=best.j;
    }
    if(order.at(-1)!==capHits[1].i)return null;
    const points=[capHits[0].p,...corners,capHits[1].p];
    if(points.some((p,i)=>i&&dist(p,points[i-1])<1e-3))return null;
    return {radiusMm:radius,points,segmentCount:segments.length};
  }finally{faces.forEach(dispose);}
}

function filletCorner(a,p,c,radius){
  const uu=unit(sub(p,a)),ww=unit(sub(c,p));
  if(!uu||!ww)throw new Error('degenerate corner');
  const ang=Math.acos(Math.max(-1,Math.min(1,dot(uu,ww))));
  const t=radius*Math.tan(ang/2);
  if(!(t>1e-9)||t>dist(a,p)-1e-6||t>dist(p,c)-1e-6)throw new Error('path radius does not fit corner');
  const p1=sub(p,mul(uu,t)),p2=add(p,mul(ww,t));
  const planeN=cross(uu,ww);
  let left=unit(cross(planeN,uu));
  if(!left)throw new Error('corner plane');
  if(dot(left,ww)<0)left=mul(left,-1);
  const center=add(p1,mul(left,radius));
  if(Math.abs(dist(center,p2)-radius)>1e-4)throw new Error('arc centre is not equidistant');
  return {p1,p2,center,axis:unit(planeN),ang,t,radius,uu,ww};
}

function maxBendRadius(points,tubeRadius){
  const n=points.length,tanHalf=[];
  for(let i=1;i<n-1;i++){
    const uu=unit(sub(points[i],points[i-1])),ww=unit(sub(points[i+1],points[i]));
    const ang=Math.acos(Math.max(-1,Math.min(1,dot(uu,ww))));
    if(!(ang>1e-6&&ang<Math.PI-1e-6))return null;
    tanHalf[i]=Math.tan(ang/2);
  }
  let max=Infinity;
  const lengths=points.slice(0,-1).map((p,i)=>dist(p,points[i+1]));
  max=Math.min(max,(lengths[0]-1e-3)/tanHalf[1],(lengths[n-2]-1e-3)/tanHalf[n-2]);
  for(let i=1;i<n-2;i++)max=Math.min(max,(lengths[i]-1e-3)/(tanHalf[i]+tanHalf[i+1]));
  if(!(max>tubeRadius+1e-3))return null;
  return max;
}

function rebuildRoundedTube(points,tubeRadius,bendRadius){
  const corners=points.slice(1,-1).map((p,i)=>filletCorner(points[i],p,points[i+2],bendRadius));
  const parts=[];
  try{
    const dirs=points.slice(0,-1).map((p,i)=>unit(sub(points[i+1],p)));
    const starts=[points[0],...corners.map(c=>c.p2)];
    const ends=[...corners.map(c=>c.p1),points.at(-1)];
    for(let i=0;i<starts.length;i++){
      const L=dist(starts[i],ends[i]);
      if(!(L>1e-4))throw new Error('straight segment too short');
      parts.push(cad.makeCylinder(tubeRadius,L,starts[i],dirs[i]));
    }
    for(const c of corners){
      const circle=cad.makeCircle(tubeRadius,c.p1,c.uu);
      const wire=cad.assembleWire([circle]);
      const face=cad.makeFace(wire);
      let axis=c.axis;
      if(dot(cross(sub(c.p1,c.center),sub(c.p2,c.center)),axis)<0)axis=mul(axis,-1);
      const elbow=cad.revolution(face,c.center,axis,c.ang*180/Math.PI);
      [face,wire,circle].forEach(dispose);
      parts.push(elbow);
    }
    const fused=robustUnion(parts);
    const solids=fused.solids;
    try{
      if((fused.booleanReport?.fused===false)||solids.length!==1){dispose(fused);throw new Error('tube elbows did not fuse');}
    }finally{solids.forEach(dispose);}
    return fused;
  }finally{parts.forEach(dispose);}
}

// Returns a rebuilt tube with rounded spine corners, or null if this body is
// not a polyline circular tube / the corner cannot be constructed honestly.
export function tryTubeKnuckleRebuild(shape,requestedRadius){
  const detected=detectPolylineTube(shape);
  if(!detected)return null;
  const maxB=maxBendRadius(detected.points,detected.radiusMm);
  if(maxB==null)return null;
  const wanted=detected.radiusMm+requestedRadius;
  const bend=Math.min(wanted,maxB-1e-3);
  if(!(bend>detected.radiusMm+1e-3))return null;
  const rebuilt=rebuildRoundedTube(detected.points,detected.radiusMm,bend);
  const oc=cad.getOC();
  const analyzer=new oc.BRepCheck_Analyzer(rebuilt.wrapped,true,false,false),solids=rebuilt.solids;
  try{
    const volume=cad.measureVolume(rebuilt),sourceVolume=cad.measureVolume(shape);
    if(!analyzer.IsValid()||solids.length!==1||!(volume>1e-6)){dispose(rebuilt);return null;}
    // Replacing miters with elbows should stay close to the original tube volume.
    if(volume>sourceVolume*1.15||volume<sourceVolume*0.7){dispose(rebuilt);return null;}
    return {shape:rebuilt,report:{strategy:'tube-spine-corner-rebuild',tubeRadiusMm:detected.radiusMm,pathBendRadiusMm:bend,requestedRadiusMm:requestedRadius,bendRadiusReduced:bend+1e-9<wanted,segmentCount:detected.segmentCount,sourceVolumeMm3:sourceVolume,rebuiltVolumeMm3:volume}};
  }catch{dispose(rebuilt);return null;}
  finally{dispose(analyzer);solids.forEach(dispose);}
}
