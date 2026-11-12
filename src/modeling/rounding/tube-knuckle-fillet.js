// Polyline circular-tube knuckles: OCCT MakeFillet cannot build a transition
// on the elliptical cylinder-cylinder miters at any tried radius. Recover the
// spine, replace each miter with a torus elbow of major radius (tube R +
// requested fillet R, clipped to what the segments allow), then fillet the
// end caps natively.
import * as cad from 'replicad';
import {robustUnion} from '../robust-union.js';
import {topologyDetails} from './topology.js';

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
  // Allow the elbow to meet a cap or the next elbow (leftover length may be 0).
  if(!(t>1e-9)||t>dist(a,p)+1e-9||t>dist(p,c)+1e-9)throw new Error('path radius does not fit corner');
  const p1=sub(p,mul(uu,t)),p2=add(p,mul(ww,t));
  const planeN=cross(uu,ww);
  let left=unit(cross(planeN,uu));
  if(!left)throw new Error('corner plane');
  if(dot(left,ww)<0)left=mul(left,-1);
  const center=add(p1,mul(left,radius));
  if(Math.abs(dist(center,p2)-radius)>1e-4)throw new Error('arc centre is not equidistant');
  return {p1,p2,center,axis:unit(planeN),ang,t,radius,uu,ww};
}

function cornerAngles(points){
  const angs=[];
  for(let i=1;i<points.length-1;i++){
    const uu=unit(sub(points[i],points[i-1])),ww=unit(sub(points[i+1],points[i]));
    if(!uu||!ww)return null;
    const ang=Math.acos(Math.max(-1,Math.min(1,dot(uu,ww))));
    if(!(ang>1e-6&&ang<Math.PI-1e-6))return null;
    angs.push({index:i,ang,tanHalf:Math.tan(ang/2),deg:ang*180/Math.PI});
  }
  return angs;
}

function segmentLengths(points){
  return points.slice(0,-1).map((p,i)=>dist(p,points[i+1]));
}

// Largest uniform path bend that still fits every corner. Leftover straight
// length may be zero (elbow may meet a cap or the next elbow).
function maxBendRadius(points,tubeRadius){
  const n=points.length,corners=cornerAngles(points);
  if(!corners)return null;
  const tanHalf=[];corners.forEach(c=>{tanHalf[c.index]=c.tanHalf;});
  const lengths=segmentLengths(points);
  let max=Math.min(lengths[0]/tanHalf[1],lengths[n-2]/tanHalf[n-2]);
  for(let i=1;i<n-2;i++)max=Math.min(max,lengths[i]/(tanHalf[i]+tanHalf[i+1]));
  return Number.isFinite(max)&&max>0?max:null;
}

function allocateBendRadii(points,tubeRadius,wanted){
  const n=points.length,corners=cornerAngles(points);
  if(!corners)return null;
  const tanHalf=[];corners.forEach(c=>{tanHalf[c.index]=c.tanHalf;});
  const lengths=segmentLengths(points);
  const B=Array(n).fill(0);
  for(const c of corners)B[c.index]=wanted;
  const clamp=()=>{
    for(let pass=0;pass<8;pass++){
      if(B[1]*tanHalf[1]>lengths[0]+1e-9)B[1]=lengths[0]/tanHalf[1];
      if(B[n-2]*tanHalf[n-2]>lengths[n-2]+1e-9)B[n-2]=lengths[n-2]/tanHalf[n-2];
      for(let i=1;i<n-2;i++){
        const need=B[i]*tanHalf[i]+B[i+1]*tanHalf[i+1];
        if(need>lengths[i]+1e-9){
          const scale=lengths[i]/need;
          B[i]*=scale;B[i+1]*=scale;
        }
      }
    }
  };
  clamp();
  const radii=corners.map(c=>B[c.index]);
  if(radii.some(b=>!(b>tubeRadius+1e-6)))return {ok:false,radii,lengths,corners,wanted};
  return {ok:true,radii,lengths,corners,wanted,reduced:radii.some(b=>b+1e-9<wanted)};
}

function tubeRebuildDiagnostic(detected,requestedRadius,extra={}){
  const corners=cornerAngles(detected.points),lengths=segmentLengths(detected.points);
  const wanted=detected.radiusMm+requestedRadius;
  const maxB=maxBendRadius(detected.points,detected.radiusMm);
  return {
    strategy:'tube-spine-corner-rebuild',
    failed:true,
    tubeRadiusMm:detected.radiusMm,
    requestedRadiusMm:requestedRadius,
    neededBendRadiusMm:wanted,
    maxFeasibleBendRadiusMm:maxB,
    segmentLengthsMm:lengths,
    cornerAnglesDeg:corners?corners.map(c=>Math.round(c.deg*1000)/1000):null,
    reason:extra.reason||(maxB==null||!(maxB>detected.radiusMm+1e-6)
      ?`实心圆环弯头需要弯半径大于管半径 ${detected.radiusMm} mm，但当前段长与夹角最多只能放下弯半径 ${maxB==null?0:Number(maxB.toFixed(4))} mm`
      :'折角重建未得到有效单实体'),
    ...extra
  };
}


function rebuildRoundedTube(points,tubeRadius,bendRadii){
  const radii=Array.isArray(bendRadii)?bendRadii:points.slice(1,-1).map(()=>bendRadii);
  const corners=points.slice(1,-1).map((p,i)=>filletCorner(points[i],p,points[i+2],radii[i]));
  const parts=[];
  try{
    const dirs=points.slice(0,-1).map((p,i)=>unit(sub(points[i+1],p)));
    const starts=[points[0],...corners.map(c=>c.p2)];
    const ends=[...corners.map(c=>c.p1),points.at(-1)];
    for(let i=0;i<starts.length;i++){
      const L=dist(starts[i],ends[i]);
      // Skip near-zero remnants: the elbow may meet a cap or the next elbow.
      if(L<=1e-4)continue;
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

function acceptRebuilt(rebuilt,shape){
  const oc=cad.getOC();
  const analyzer=new oc.BRepCheck_Analyzer(rebuilt.wrapped,true,false,false),solids=rebuilt.solids;
  try{
    const volume=cad.measureVolume(rebuilt),sourceVolume=cad.measureVolume(shape);
    if(!analyzer.IsValid()||solids.length!==1||!(volume>1e-6))return null;
    if(volume>sourceVolume*1.15||volume<sourceVolume*0.7)return null;
    return {volume,sourceVolume};
  }finally{dispose(analyzer);solids.forEach(dispose);}
}

function bendCandidateList(points,tubeRadius,wanted){
  const maxB=maxBendRadius(points,tubeRadius);
  if(maxB==null||!(maxB>tubeRadius+1e-6))return {maxB,candidates:[]};
  const out=[],add=b=>{if(b>tubeRadius+1e-6&&b<=maxB+1e-12&&!out.some(x=>Math.abs(x-b)<1e-7))out.push(b);};
  add(Math.min(wanted,maxB));
  for(const leave of [0.05,0.15,0.3,0.5,1])add(Math.min(wanted,maxB-leave));
  const span=Math.min(wanted,maxB)-tubeRadius;
  for(const f of [0.95,0.85,0.7])add(tubeRadius+span*f);
  out.sort((a,b)=>b-a);
  return {maxB,candidates:out};
}

function filletEndCaps(shape,radius){
  const oc=cad.getOC();
  const rows=topologyDetails(shape).filter(row=>row.sharp);
  if(!rows.length)return {shape,capRadiusMm:0,capsFilleted:false,alreadySmooth:true};
  const edges=shape.edges;
  let builder,progress,result,check;
  try{
    builder=new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
    for(const row of rows)builder.Add(radius,edges[row.edgeId].wrapped);
    progress=new oc.Message_ProgressRange();
    try{builder.Build(progress);}catch(error){let m=error?.message;if(!m)try{m=oc.getExceptionMessage(error);}catch{}throw new Error(m||'端盖圆角构造失败');}
    let faulty=0;try{faulty=builder.NbFaultyContours();}catch{faulty=0;}
    if(!builder.IsDone()||faulty>0)throw new Error(`端盖圆角失败（faulty=${faulty}）`);
    result=cad.cast(builder.Shape());
    check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
    try{if(!check.IsValid())throw new Error('端盖圆角结果无效');}finally{dispose(check);check=null;}
    const out=result;result=null;
    return {shape:out,capRadiusMm:radius,capsFilleted:true,alreadySmooth:false};
  }finally{dispose(result);dispose(check);dispose(progress);dispose(builder);edges.forEach(dispose);}
}

function capRadiusLadder(requested){
  const out=[requested];
  for(const f of [0.8,0.5,0.3,0.2,0.1,0.05]){
    const r=Math.round(requested*f*1000)/1000;
    if(r>=0.05&&!out.some(x=>Math.abs(x-r)<1e-9))out.push(r);
  }
  return out;
}

// Returns a rebuilt tube with rounded spine corners, or null if this body is
// not a polyline circular tube. When the corner cannot be constructed, returns
// {failed:true, diagnostic} so the caller can report needed vs available bend.
// Pass {filletCaps:true} to also fillet the end caps (requested R first, then
// a short descending ladder, trying a few feasible bend radii if needed).
export function tryTubeKnuckleRebuild(shape,requestedRadius,options={}){
  const detected=detectPolylineTube(shape);
  if(!detected)return null;
  const wanted=detected.radiusMm+requestedRadius;
  const allocated=allocateBendRadii(detected.points,detected.radiusMm,wanted);
  const {maxB,candidates}=bendCandidateList(detected.points,detected.radiusMm,wanted);
  if(!allocated?.ok&&!candidates.length){
    return {failed:true,diagnostic:tubeRebuildDiagnostic(detected,requestedRadius)};
  }
  const builds=[];
  if(allocated?.ok)builds.push({kind:'per-corner',radii:allocated.radii});
  for(const b of candidates)builds.push({kind:'uniform',radii:b});
  const tryBuild=spec=>{
    let rebuilt;
    try{rebuilt=rebuildRoundedTube(detected.points,detected.radiusMm,spec.radii);}
    catch{return null;}
    const accepted=acceptRebuilt(rebuilt,shape);
    if(!accepted){dispose(rebuilt);return null;}
    const pathBend=Array.isArray(spec.radii)?Math.min(...spec.radii):spec.radii;
    return {shape:rebuilt,pathBendRadiusMm:pathBend,bendRadiiMm:Array.isArray(spec.radii)?spec.radii:[spec.radii],...accepted};
  };
  if(!options.filletCaps){
    let built=null;
    for(const spec of builds){built=tryBuild(spec);if(built)break;}
    if(!built)return {failed:true,diagnostic:tubeRebuildDiagnostic(detected,requestedRadius,{reason:'折角重建未得到有效单实体'})};
    const {shape:rebuilt,volume,sourceVolume,pathBendRadiusMm,bendRadiiMm}=built;
    return {shape:rebuilt,report:{strategy:'tube-spine-corner-rebuild',tubeRadiusMm:detected.radiusMm,pathBendRadiusMm,bendRadiiMm,requestedRadiusMm:requestedRadius,bendRadiusReduced:pathBendRadiusMm+1e-9<wanted,segmentCount:detected.segmentCount,sourceVolumeMm3:sourceVolume,rebuiltVolumeMm3:volume,maxFeasibleBendRadiusMm:maxB}};
  }
  const capRadii=capRadiusLadder(requestedRadius);
  const builtList=[];
  let kept=null;
  try{
    for(const spec of builds){
      const built=tryBuild(spec);
      if(built)builtList.push(built);
    }
    if(!builtList.length)return {failed:true,diagnostic:tubeRebuildDiagnostic(detected,requestedRadius,{reason:'折角重建未得到有效单实体'})};
    // Prefer the requested cap R on the largest feasible elbow; only then reduce cap R.
    for(const capR of capRadii){
      for(const built of builtList){
        let capped;
        try{capped=filletEndCaps(built.shape,capR);}catch{continue;}
        if(capped.alreadySmooth||capped.capsFilleted){
          kept=capped.shape;
          if(capped.shape!==built.shape){dispose(built.shape);built.shape=null;}
          const volume=cad.measureVolume(capped.shape);
          return {shape:capped.shape,report:{strategy:'tube-spine-corner-rebuild',tubeRadiusMm:detected.radiusMm,pathBendRadiusMm:built.pathBendRadiusMm,bendRadiiMm:built.bendRadiiMm,requestedRadiusMm:requestedRadius,bendRadiusReduced:built.pathBendRadiusMm+1e-9<wanted,capRadiusMm:capped.alreadySmooth?null:capped.capRadiusMm,capRadiusReduced:!capped.alreadySmooth&&capped.capRadiusMm+1e-9<requestedRadius,segmentCount:detected.segmentCount,sourceVolumeMm3:built.sourceVolume,rebuiltVolumeMm3:volume,maxFeasibleBendRadiusMm:maxB}};
        }
        if(capped.shape!==built.shape)dispose(capped.shape);
      }
    }
    const first=builtList[0];
    return {failed:true,diagnostic:tubeRebuildDiagnostic(detected,requestedRadius,{
      reason:`折角已可按弯半径 ${first.pathBendRadiusMm.toFixed(3)} mm 重建，但端盖无法按 R${requestedRadius} 倒圆（弯头内侧余量过紧或端盖处几乎没有直段）`,
      pathBendRadiusMm:first.pathBendRadiusMm,
      capsFailed:true
    })};
  }finally{builtList.forEach(item=>{if(item.shape&&item.shape!==kept)dispose(item.shape);});}
}
