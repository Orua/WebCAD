// Complementary-R mill + Boolean fallback when OCCT MakeFillet cannot finish an edge.
// Prefer true fillet; this builds a quarter-circle solid along the edge and cut/fuse.
// General for arbitrary sharp edges (convex/concave, short, near-tangent where native fails).
import * as cad from 'replicad';
import {topologyDetails} from '../../smooth-transition.js';

const EPS=1e-7;
const dispose=v=>{try{v?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,k)=>a.map(x=>x*k);
const norm=a=>Math.hypot(...a);
const unit=a=>{const n=norm(a);if(n<EPS)throw Object.assign(new Error('零长度方向'),{code:'GEOMETRY_INVALID'});return mul(a,1/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const fail=(m,code='GEOMETRY_INVALID')=>{throw Object.assign(new Error(m),{code,recoveryAction:'CORRECT_PARAMETERS'});};

function faceInward(face,point,tangent){
  const center=face.center.toTuple(),toward=sub(center,point),across=sub(toward,mul(tangent,dot(toward,tangent)));
  if(norm(across)<EPS)fail('支撑面中心不能确定边内向');
  return unit(across);
}

function sectionAt(faceA,faceB,P,T,R){
  const dA=faceInward(faceA,P,T),dB=faceInward(faceB,P,T);
  const nA=unit(faceA.normalAt(P).toTuple()),nB=unit(faceB.normalAt(P).toTuple());
  const sideA=dot(dA,nB),sideB=dot(dB,nA);
  if(Math.abs(sideA)<1e-5||Math.abs(sideB)<1e-5||sideA*sideB<=0)fail('材料侧不明确');
  const material=sideA<0?'remove':'add';
  const cos=Math.max(-1,Math.min(1,dot(dA,dB))),theta=Math.acos(cos),sinHalf=Math.sin(theta/2);
  if(theta<Math.PI/36||theta>Math.PI*35/36||sinHalf<1e-6)fail('夹角不适合铣削回退');
  const td=R/Math.tan(theta/2),bisector=unit(add(dA,dB));
  const center=mul(bisector,R/sinHalf),ta=mul(dA,td),tb=mul(dB,td),arcMid=sub(center,mul(bisector,R));
  return {material,dA,ta,tb,arcMid,theta};
}

function extrudeSection(P,T,sec,length){
  const y=unit(cross(T,sec.dA));
  const to2=q=>[dot(q,sec.dA),dot(q,y)];
  const plane=new cad.Plane(P,sec.dA,T);
  return cad.draw([0,0]).lineTo(to2(sec.ta)).threePointsArcTo(to2(sec.tb),to2(sec.arcMid)).close().sketchOnPlane(plane).extrude(length,{extrusionDirection:T});
}

/** Build one complementary-R solid along a single sharp edge and boolean it. */
function localHalfExtent(shape){
  const box=shape.boundingBox;
  try{
    const [lo,hi]=box.bounds;
    const ex=[hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]];
    if(!ex.every(Number.isFinite))fail('无法读取实体包围盒');
    return Math.min(...ex)/2;
  }finally{dispose(box);}
}

function acceptMilled(shape,result,R,material){
  const oc=cad.getOC();
  const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
  try{if(!check.IsValid())fail('铣削回退后实体无效');}finally{dispose(check);}
  const solids=result.solids;
  try{
    if(solids.length!==1||cad.measureVolume(result)<=1e-9)fail('铣削回退未得到单一有效实体');
  }finally{solids.forEach(dispose);}
  // Valid nonempty geometry is a previewable result; the requested R is not vetoed by a box/volume heuristic.
}

function complementaryTool(shape,{edgeId,radiusMm}){
  if(!Number.isFinite(radiusMm)||radiusMm<=0)fail('半径无效','PARAM_SCHEMA_INVALID');
  const rows=topologyDetails(shape),row=rows.find(r=>r.edgeId===edgeId);
  if(!row||!row.sharp)fail(`边 ${edgeId} 不是可铣的锐边`);
  if(row.adjacentFaceIds.length!==2)fail(`边 ${edgeId} 需要恰好两个相邻面`);
  const R=radiusMm;
  const edges=shape.edges,faces=shape.faces;
  let tool,result,parts=[];
  try{
    const edge=edges[edgeId],[faceA,faceB]=row.adjacentFaceIds.map(id=>faces[id]);
    const start=row.startPoint,end=row.endPoint,mid=row.midpoint;
    // Fast exact path: planar LINE → single prism (same geometry as analytic-round).
    if(edge.geomType==='LINE'&&faceA.geomType==='PLANE'&&faceB.geomType==='PLANE'){
      const T=unit(sub(end,start)),sec=sectionAt(faceA,faceB,mid,T,R);
      const length=norm(sub(end,start));
      tool=extrudeSection(start,T,sec,length);
      const out=tool;tool=null;
      return {shape:out,edgeId,strategy:'mill-complementary-r-prism-v1',material:sec.material,radiusMm:R};
    }
    // General: piecewise short prisms along the edge (works for BSpline/ellipse/short/near-tangent).
    const oc=cad.getOC();
    let adaptor;
    const samples=Math.max(6,Math.min(48,Math.ceil(Math.max(edge.length,R*2)/(Math.max(R,.2)*.75))));
    let material=null;
    try{
      adaptor=new oc.BRepAdaptor_Curve(edge.wrapped);
      const u0=adaptor.FirstParameter(),u1=adaptor.LastParameter();
      let prev=null,prevT=null;
      for(let i=0;i<=samples;i++){
        const u=u0+(u1-u0)*i/samples;
        const pnt=adaptor.Value(u),d1=new oc.gp_Vec();adaptor.D1(u,pnt,d1);
        const P=[pnt.X(),pnt.Y(),pnt.Z()],T=unit([d1.X(),d1.Y(),d1.Z()]);
        dispose(d1);
        if(prev){
          const chord=sub(P,prev),len=norm(chord);
          if(len>EPS){
            const Tseg=unit(chord);
            const sec=sectionAt(faceA,faceB,add(prev,mul(chord,.5)),Tseg,R);
            if(material==null)material=sec.material;
            parts.push(extrudeSection(prev,Tseg,sec,len));
          }
        }
        prev=P;prevT=T;
      }
    }finally{dispose(adaptor);}
    if(!parts.length)fail('边过短，无法分段铣削');
    tool=parts[0];
    for(let i=1;i<parts.length;i++){const fused=tool.fuse(parts[i]);dispose(tool);dispose(parts[i]);tool=fused;}
    parts=[];
    const out=tool;tool=null;
    return {shape:out,edgeId,strategy:'mill-complementary-r-piecewise-v1',material,radiusMm:R,segments:samples};
  }finally{
    dispose(result);dispose(tool);parts.forEach(dispose);edges.forEach(dispose);faces.forEach(dispose);
  }
}

export function millComplementaryFilletEdge(shape,{edgeId,radiusMm}){
  const result=millComplementaryFillet(shape,{edgeIds:[edgeId],radiusMm});
  return {...result,edgeId,radiusMm,material:result.reports[0].material,strategy:result.reports[0].strategy};
}

/** Build every cutter on the same original topology, then apply their Boolean groups atomically. */
export function millComplementaryFillet(shape,{edgeIds,radiusMm}){
  if(!Array.isArray(edgeIds)||!edgeIds.length)fail('需要目标边');
  let current=shape;const tools=[],reports=[];
  try{
    for(const edgeId of [...new Set(edgeIds)]){
      const one=complementaryTool(shape,{edgeId,radiusMm});tools.push(one);
      reports.push({edgeId,strategy:one.strategy,material:one.material,radiusMm,sourceBinding:'original-shape',...(one.segments?{segments:one.segments}:{})});
    }
    for(const material of ['remove','add']){
      const selected=tools.filter(t=>t.material===material);if(!selected.length)continue;
      let cutter=selected[0].shape.clone();
      try{
        for(const t of selected.slice(1)){const united=cutter.fuse(t.shape);dispose(cutter);cutter=united;}
        const next=material==='remove'?current.cut(cutter):current.fuse(cutter);
        if(current!==shape)dispose(current);current=next;
      }finally{dispose(cutter);}
    }
    acceptMilled(shape,current,radiusMm,'combined');
    const out=current;current=null;
    return {shape:out,actualEdgeIds:[...edgeIds],strategy:'mill-complementary-r-fallback-v1',reports,contourCount:edgeIds.length};
  }finally{
    if(current&&current!==shape)dispose(current);
    tools.forEach(t=>dispose(t.shape));
  }
}
