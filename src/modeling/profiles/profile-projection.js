import {localPoint,rotateVector,validateFrame} from '../../work-frame.js';

const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const error=(code,message)=>Object.assign(new Error(message),{code});
const local=(frame,p)=>localPoint(frame,p).slice(0,2);
export function projectEdgeToProfile(edge,frame,source){
  validateFrame(frame);
  if(!edge||!Number.isSafeInteger(edge.edgeId)||!source?.bodyId||!source.geometryFingerprint)throw error('PROJECTION_INVALID','投影需要当前精确边和来源几何指纹');
  const projectionSource={bodyId:source.bodyId,edgeId:edge.edgeId,geometryFingerprint:source.geometryFingerprint,sourceSnapshot:{geomType:edge.geomType,startPoint:edge.startPoint,endPoint:edge.endPoint,lengthMidpoint:edge.lengthMidpoint,center:edge.center,axis:edge.axis,radiusMm:edge.radiusMm},association:'snapshot-only'};
  if(edge.geomType==='LINE'){
    if(!point(edge.startPoint)||!point(edge.endPoint))throw error('PROJECTION_INVALID','直线端点无效');
    const startMm=local(frame,edge.startPoint),endMm=local(frame,edge.endPoint);
    if(distance(startMm,endMm)<1e-8)throw error('DEGENERATE_PROJECTION','直线投影到此平面后长度为零');
    return {type:'line',startMm,endMm,projectionSource};
  }
  if(edge.geomType==='CIRCLE'){
    if(!point(edge.center)||!point(edge.axis)||!Number.isFinite(edge.radiusMm)||edge.radiusMm<=0)throw error('PROJECTION_INVALID','圆/圆弧几何无效');
    const normal=rotateVector(frame.quaternion,[0,0,1]),axisLength=Math.hypot(...edge.axis);
    if(axisLength<1e-10||Math.abs(dot(normal,edge.axis)/axisLength)<1-1e-7)throw error('UNSUPPORTED_CURVE_PROJECTION','圆所在平面与轮廓平面不平行；投影是椭圆，本版不假冒圆');
    const startMm=local(frame,edge.startPoint),endMm=local(frame,edge.endPoint),midMm=local(frame,edge.lengthMidpoint),centerMm=local(frame,edge.center),full=Math.abs(edge.lengthMm-2*Math.PI*edge.radiusMm)<1e-5&&distance(startMm,endMm)<1e-6;
    return full?{type:'circle',centerMm,diameterMm:2*edge.radiusMm,projectionSource}:{type:'arc3',startMm,midMm,endMm,projectionSource};
  }
  throw error('UNSUPPORTED_CURVE_PROJECTION',`暂不能把 ${edge.geomType} 边转成可编辑解析轮廓`);
}
export function projectPointToProfile(pointWorld,frame){
  validateFrame(frame);if(!point(pointWorld))throw error('PROJECTION_INVALID','投影点需要世界 XYZ');return {pointMm:local(frame,pointWorld),projectedFrom:[...pointWorld],status:'read'};
}
