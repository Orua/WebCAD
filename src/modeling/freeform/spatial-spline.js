import {distance,fail,joinMm,maxDistance,resolvePoint,scope,splineEdge,validShape} from './exact-input.js';

export function buildSpatialSpline(sources,params,cad) {
  const {hold,close}=scope(), oc=cad.getOC();
  try {
    const {closed,method}=params, toleranceMm=params.toleranceMm??0.01, cache=new Map();
    const points=params.points.map(point=>resolvePoint(sources,point,oc,hold,cache));
    if (points.length<(closed?3:2) || points.some((p,i)=>points.slice(0,i).some(q=>distance(p,q)<=joinMm))) {
      fail('FREEFORM_CURVE','请输入有顺序且互不重复的点，闭合曲线请省略重复的首点。');
    }
    if (closed && method==='fit') fail('FREEFORM_CURVE','闭合样条请选择过点插值。');
    const edge=splineEdge(points,{closed,fitTolerance:method==='fit'?toleranceMm/2:undefined},cad,hold);
    const deviationMm=maxDistance(points,edge,cad);
    if (!validShape(edge,oc) || !(deviationMm<=(method==='fit'?toleranceMm:joinMm))) {
      fail('FREEFORM_TOLERANCE','样条未通过有效性或距离检查。');
    }
    const result=edge.clone();
    result.freeformReport={method,closed,pointCount:points.length,deviationMm,toleranceMm};
    return result;
  } finally {close();}
}
