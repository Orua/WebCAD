import {planContour} from './relief-curves.js';
import {contourPlanIntersections} from './relief-plan-intersections.js';

// Report identity only: fitting/protection and the geometry wire format are unchanged.
export const CONTOUR_TOPOLOGY_REPORT_VERSION='relief-contour-topology-report-1';

const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const pointSegment=(p,a,b)=>{const d=sub(b,a),length=dot(d,d),t=length?Math.max(0,Math.min(1,dot(sub(p,a),d)/length)):0;return Math.hypot(...p.map((v,i)=>v-a[i]-t*d[i]));};
function segmentDistance(a,b,c,d){
 // Ring points are planar. Endpoint distances suffice for disjoint segments;
 // intersection is checked in a stable local 2D frame independently below.
 const u=sub(b,a),v=sub(d,c),w=sub(c,a),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],square=dot(normal,normal);
 if(square>1e-24){const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],s=dot(cross(w,v),normal)/square,t=dot(cross(w,u),normal)/square;if(s>=0&&s<=1&&t>=0&&t<=1&&Math.abs(dot(w,normal))<1e-9*Math.sqrt(square))return 0;}
 return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
export function planRegionContours(rings,normal,tolerance=0,curvePolicy='fitWithinTolerance'){
 if(!['fitWithinTolerance','preserveTopology'].includes(curvePolicy))throw Object.assign(new Error('未知浮雕曲线策略'),{code:'RELIEF_INVALID'});
 const critical=new Set(),contacts=[];let comparisons=0;
 if(curvePolicy==='preserveTopology'&&tolerance>0){
  // Two independently fitted boundaries can move towards each other by twice
  // the declared tolerance. Preserve their exact supplied segments before
  // fitting when this clearance is unavailable; no failed-solid retry occurs.
  for(let i=0;i<rings.length;i++)for(let j=i+1;j<rings.length;j++){
   let minimum=Infinity;const a=rings[i],b=rings[j];
   for(let k=0;k<a.length;k++)for(let l=0;l<b.length;l++){if(++comparisons>2000000)throw Object.assign(new Error('近接轮廓检查超出规划预算；未合并孔或降低精度'),{code:'RELIEF_PLAN_LIMIT'});minimum=Math.min(minimum,segmentDistance(a[k],a[(k+1)%a.length],b[l],b[(l+1)%b.length]));}
   if(minimum<=2*tolerance+1e-7){critical.add(i);critical.add(j);contacts.push({ringIndices:[i,j],sourceClearanceMm:minimum,requiredFitClearanceMm:2*tolerance+1e-7});}
  }
 }
 let plans=rings.map((points,index)=>planContour(points,normal,critical.has(index)?0:tolerance,true));
 const collisions=curvePolicy==='preserveTopology'?contourPlanIntersections(plans,normal):[];
 for(const collision of collisions)for(const index of collision.ringIndices)critical.add(index);
 if(collisions.length)plans=plans.map((plan,index)=>critical.has(index)?planContour(rings[index],normal,0,true):plan);
 const unresolved=curvePolicy==='preserveTopology'?contourPlanIntersections(plans,normal):[];
 if(unresolved.length)throw Object.assign(new Error('来源线段或拟合轮廓仍有拓扑相交；未改孔或切换策略'),{code:'RELIEF_CURVE_TOPOLOGY_INVALID',stage:'contour-plan',report:{version:CONTOUR_TOPOLOGY_REPORT_VERSION,collisions:unresolved,curvePolicy,toleranceMm:tolerance,sourceCoordinatesChanged:false,sourceSplineDeviation:'unknown'}});
 plans=plans.map((plan,index)=>{
  const ringCollisions=collisions.filter(c=>c.ringIndices.includes(index)),ringContacts=contacts.filter(c=>c.ringIndices.includes(index)),reasons=[];
  if(ringContacts.length)reasons.push('source-clearance-within-fit-budget');
  if(ringCollisions.some(c=>c.ringIndices[0]===c.ringIndices[1]))reasons.push('fitted-self-intersection');
  if(ringCollisions.some(c=>c.ringIndices[0]!==c.ringIndices[1]))reasons.push('fitted-ring-intersection');
  if(!reasons.length)reasons.push(tolerance===0?'explicit-zero-tolerance':'bounded-fit-within-supplied-polyline-tolerance');
  return {...plan,report:{...plan.report,version:CONTOUR_TOPOLOGY_REPORT_VERSION,ringIndex:index,role:index?'hole':'outer',fitToleranceMm:plan.report.toleranceMm,toleranceMm:tolerance,curvePolicy,construction:critical.has(index)?'source-segments-preserved-for-topology':tolerance===0?'source-segments-explicit-zero-tolerance':'bounded-fit',reasons,suppliedSegmentsPreserved:critical.has(index)||tolerance===0,topologyCheck:curvePolicy==='preserveTopology'?'no-plan-intersections':'not-requested',sourceCoordinatesChanged:false,sourceSplineDeviation:'unknown',avoidedFitIntersections:ringCollisions,sourceClearanceContacts:ringContacts}};
 });
 return {plans,reportVersion:CONTOUR_TOPOLOGY_REPORT_VERSION,curvePolicy,contacts,avoidedFitIntersections:collisions,preservedRingIndices:[...critical],sourceCoordinatesChanged:false,sourceSplineDeviation:'unknown'};
}
