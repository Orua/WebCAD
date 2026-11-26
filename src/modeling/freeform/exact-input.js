export const joinMm = 1e-6;
export const tuple = value => [value.X(),value.Y(),value.Z()];
export const add = (a,b) => a.map((x,i)=>x+b[i]);
export const sub = (a,b) => a.map((x,i)=>x-b[i]);
export const scale = (a,k) => a.map(x=>x*k);
export const dot = (a,b) => a.reduce((n,x,i)=>n+x*b[i],0);
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm = a => Math.hypot(...a);
export const distance = (a,b) => norm(sub(a,b));
export const unit = a => norm(a)>1e-12?scale(a,1/norm(a)):null;
export const lerp = (a,b,t) => add(a,scale(sub(b,a),t));

export function fail(code,message) {
  throw Object.assign(new Error(message),{code});
}

export function scope() {
  const items=[];
  return {hold(value){items.push(value);return value;},close(){for(const value of items.reverse())value?.delete();}};
}

export function readShape(sources, item, key, own, cache=new Map()) {
  const id=key==='edges'?item.edgeId:item.faceId, shape=sources[item.refIndex];
  if (!shape?.wrapped) fail('FREEFORM_REFERENCE','请选择当前工程中含精确几何的来源对象。');
  const tag=item.refIndex+':'+key;
  if (!cache.has(tag)) cache.set(tag,shape[key].map(own));
  const result=cache.get(tag)[id];
  if (!result) fail('FREEFORM_REFERENCE',`来源 ${item.refIndex+1} 的拓扑编号 ${id} 已失效，请重选。`);
  return result;
}

export function curveReader(edge, oc, own) {
  const curve=own(new oc.BRepAdaptor_Curve(edge.wrapped)), p=own(new oc.gp_Pnt());
  const first=curve.FirstParameter(), last=curve.LastParameter();
  function atParameter(parameter){curve.D0(parameter,p);return tuple(p);}
  return {curve,first,last,atParameter,at(t){return atParameter(first+(last-first)*t);}};
}

export function resolvePoint(sources, item, oc, own, cache) {
  if (Array.isArray(item)) return item;
  const reader=curveReader(readShape(sources,item,'edges',own,cache),oc,own);
  const a=reader.at(0), b=reader.at(1), da=distance(a,item.nearMm), db=distance(b,item.nearMm);
  if(Math.min(da,db)>0.05 || Math.abs(da-db)<=joinMm && distance(a,b)>joinMm) {
    fail('FREEFORM_REFERENCE','定位点无法唯一吸附到真实边端点。');
  }
  return da<=db?a:b;
}

export function maxDistance(points, shape, cad) {
  const query=new cad.DistanceQuery(shape);
  try {
    return points.reduce((max,point)=>{
      const vertex = cad.makeVertex(point);
      try{return Math.max(max,query.distanceTo(vertex));}
      finally{vertex.delete();}
    },0);
  } finally {query.delete();}
}

export function splineEdge(points,{closed,fitTolerance},cad,own) {
  const oc=cad.getOC(), data=own(new oc.NCollection_Array1_gp_Pnt(1,points.length));
  points.forEach((point,i)=>data.SetValue(i+1,own(new oc.gp_Pnt(...point))));
  const builder=fitTolerance?
    own(new oc.GeomAPI_PointsToBSpline(data,1,3,oc.GeomAbs_Shape.GeomAbs_C2,fitTolerance)):
    own(new oc.GeomAPI_Interpolate(own(new oc.NCollection_HArray1_gp_Pnt(data)),closed,joinMm/10));
  if (!fitTolerance) builder.Perform();
  if (!builder.IsDone()) fail('FREEFORM_CURVE','这些点无法构造样条，请检查是否重复或距离过近。');
  const curve=own(builder.Curve()), maker=own(new oc.BRepBuilderAPI_MakeEdge(curve));
  if (!maker.IsDone()) fail('FREEFORM_CURVE','样条未能生成精确边。');
  return own(cad.cast(maker.Edge()));
}

export function validShape(shape,oc) {
  const check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);
  try{return check.IsValid();}finally{check.delete();}
}
