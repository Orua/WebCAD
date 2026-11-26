import {uniformSurfaceGrid} from '../../uniform-surface-grid.js';
import {add,curveReader,distance,fail,lerp,readShape,scale,scope,sub,tuple,validShape} from './exact-input.js';

function intersection(a,b,oc,tolerance) {
  const query=new oc.BRepExtrema_DistShapeShape();
  const points=[];
  try {
    query.LoadS1(a.edge.wrapped);
    query.LoadS2(b.edge.wrapped);
    query.Perform();
    if (!query.IsDone() || !(query.Value()<=tolerance)) fail('FREEFORM_NETWORK','纵横曲线之间有未相交的边，请检查交点或公差。');
    for (let i=1;i<=query.NbSolution();i++) {
      const pa=query.PointOnShape1(i), pb=query.PointOnShape2(i);
      try {
        const p=tuple(pa), q=tuple(pb), middle=lerp(p,q,.5);
        if (points.some(item=>distance(item.point,middle)<=tolerance)) continue;
        const parameter=(reader,xyz,side)=>{
          if (distance(reader.at(0),xyz)<=tolerance) return reader.first;
          if (distance(reader.at(1),xyz)<=tolerance) return reader.last;
          return side===1?query.ParOnEdgeS1(i).t:query.ParOnEdgeS2(i).t;
        };
        points.push({point:middle,onA:parameter(a,p,1),onB:parameter(b,q,2)});
      } finally {pa.delete();pb.delete();}
    }
    if (points.length!==1) fail('FREEFORM_NETWORK','每条纵边与每条横边之间须有一个明确交点。');
    return points[0];
  } finally {query.delete();}
}

function traversal(reader, parameters, tolerance) {
  const sign=Math.sign(parameters.at(-1)-parameters[0]);
  if (!sign || parameters.slice(1).some((p,i)=>sign*(p-parameters[i])<=1e-10) ||
      distance(reader.atParameter(parameters[0]),reader.at(sign>0?0:1))>tolerance ||
      distance(reader.atParameter(parameters.at(-1)),reader.at(sign>0?1:0))>tolerance) {
    fail('FREEFORM_NETWORK','边的交点顺序不一致，或首尾交点没有到达两端。请按横向位置排序两组边。');
  }
  const spans=parameters.slice(1).map((p,i)=>p-parameters[i]);
  const slopes=parameters.map((_,i)=>i===0?spans[0]:i===spans.length?spans.at(-1):
    2*spans[i-1]*spans[i]/(spans[i-1]+spans[i]));
  return t=>{
    const x=t*spans.length, i=Math.min(spans.length-1,Math.floor(x)), a=x-i;
    const s=a*a*(3-2*a), p=parameters[i]*(1-s)+parameters[i+1]*s+
      a*(1-a)*((1-a)*slopes[i]-a*slopes[i+1]);
    return reader.atParameter(p);
  };
}

function blend(points,t) {
  const x=t*(points.length-1), i=Math.min(points.length-2,Math.floor(x)), a=x-i;
  if (points.length===2) return lerp(points[0],points[1],a);
  const previous=points[Math.max(0,i-1)], following=points[Math.min(points.length-1,i+2)];
  const m0=scale(sub(points[i+1],previous),i===0?1:.5);
  const m1=scale(sub(following,points[i]),i+2===points.length?1:.5);
  return add(lerp(points[i],points[i+1],a*a*(3-2*a)),
    scale(sub(scale(m0,1-a),scale(m1,a)),a*(1-a)));
}

function splineSurface(points,oc,hold) {
  const grid=uniformSurfaceGrid(points);
  const data=hold(new oc.NCollection_Array2_gp_Pnt(1,points.length,1,points[0].length));
  grid.poles.forEach((row,i)=>row.forEach((point,j)=>data.SetValue(i+1,j+1,hold(new oc.gp_Pnt(...point)))));
  function array(Type,values) {
    const a=hold(new Type(1,values.length));
    values.forEach((v,i)=>a.SetValue(i+1,v));return a;
  }
  return hold(new oc.Geom_BSplineSurface(data,array(oc.NCollection_Array1_double,grid.u.knots),
    array(oc.NCollection_Array1_double,grid.v.knots),array(oc.NCollection_Array1_int,grid.u.multiplicities),
    array(oc.NCollection_Array1_int,grid.v.multiplicities),grid.u.degree,grid.v.degree,false,false));
}

export function buildNetworkSurface(sources,params,cad) {
  const {hold,close}=scope(), oc=cad.getOC(), toleranceMm=params.toleranceMm??.01, cache=new Map();
  try {
    const used=[];
    const read=item=>{
      const edge=readShape(sources,item,'edges',hold,cache), reader=curveReader(edge,oc,hold);
      if (used.some(other=>other.wrapped.IsSame(edge.wrapped)) || distance(reader.at(0),reader.at(1))<=toleranceMm) {
        fail('FREEFORM_NETWORK','曲线网格需要独立且不重复的开放边。');
      }
      used.push(edge);return {...reader,edge};
    };
    const u=params.uEdges.map(read), v=params.vEdges.map(read);
    const crossings=u.map(a=>v.map(b=>intersection(a,b,oc,toleranceMm)));
    const alongU=u.map((a,i)=>traversal(a,crossings[i].map(item=>item.onA),toleranceMm));
    const alongV=v.map((b,j)=>traversal(b,crossings.map(row=>row[j].onB),toleranceMm));
    const crossingPoints=crossings.map(row=>row.map(item=>item.point));
    const evaluate=(s,t)=>sub(add(blend(alongU.map(readPoint=>readPoint(s)),t),blend(alongV.map(readPoint=>readPoint(t)),s)),
      blend(crossingPoints.map(row=>blend(row,s)),t));
    const uSteps=Math.max(12,4*(v.length-1)), vSteps=Math.max(12,4*(u.length-1));
    const points=Array.from({length:uSteps+1},(_,i)=>Array.from({length:vSteps+1},(_,j)=>evaluate(i/uSteps,j/vSteps)));
    const surface=splineSurface(points,oc,hold), p=hold(new oc.gp_Pnt());
    let uDeviationMm=0, vDeviationMm=0;
    alongU.forEach((reader,i)=>{
      for(let j=0;j<=32;j++){const t=j/32;surface.D0(t,i/(u.length-1),p);uDeviationMm=Math.max(uDeviationMm,distance(reader(t),tuple(p)));}
    });
    alongV.forEach((reader,i)=>{
      for(let j=0;j<=32;j++){const t=j/32;surface.D0(i/(v.length-1),t,p);vDeviationMm=Math.max(vDeviationMm,distance(reader(t),tuple(p)));}
    });
    if (!(Math.max(uDeviationMm,vDeviationMm)<=toleranceMm)) {
      fail('FREEFORM_TOLERANCE','样条面偏离网格边超过公差，请检查过急转折或错位的网格交点。');
    }
    const maker=hold(new oc.BRepBuilderAPI_MakeFace(surface,1e-6));
    if (!maker.IsDone()) fail('FREEFORM_NETWORK','曲线网格无法形成曲面。');
    const face=hold(cad.cast(maker.Face()));
    if (!validShape(face,oc) || !(cad.measureArea(face)>1e-8)) fail('FREEFORM_NETWORK','曲线网格生成的面无效或退化。');
    const result=face.clone();
    result.freeformReport={uCurves:u.length,vCurves:v.length,toleranceMm,uDeviationMm,vDeviationMm};
    return result;
  } finally {close();}
}
