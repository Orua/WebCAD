import {meshError} from './mesh-contract.js';
const point={type:'array',items:{type:'number'},minItems:2,maxItems:2};
const positive={type:'number',exclusiveMinimum:0};
export const reliefProfileSchema={type:'object',additionalProperties:false,required:['segments','stations','endTaperMm','baseHeightMm','curveToleranceMm','maxSourceSpacingMm'],properties:{
 segments:{type:'array',minItems:1,maxItems:32,items:{type:'array',minItems:4,maxItems:4,items:point}},
 stations:{type:'array',minItems:2,maxItems:64,items:{type:'object',additionalProperties:false,required:['at','sectionMm'],properties:{at:{type:'number',minimum:0,maximum:1},sectionMm:{type:'array',minItems:3,maxItems:64,items:point}}}},
 endTaperMm:{type:'array',minItems:2,maxItems:2,items:{type:'number',minimum:0}},baseHeightMm:{type:'number'},curveToleranceMm:positive,maxSourceSpacingMm:positive
}};
const fail=message=>{throw meshError('RELIEF_PROFILE_INVALID',message);};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const mix=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
function nearest(p,a,b){const d=[b[0]-a[0],b[1]-a[1]],t=Math.max(0,Math.min(1,dot([p[0]-a[0],p[1]-a[1]],d)/dot(d,d))),q=[a[0]+t*d[0],a[1]+t*d[1]];return {t,distance:dist(p,q),signed:cross(a,b,p)/Math.hypot(...d)};}
function flatten(c,tolerance,out,depth=0){
 if(depth>16||out.length>4096)throw meshError('RELIEF_EDIT_CAPACITY','Profile curve exceeds bounded subdivision.');
 const length=dist(c[0],c[3]);if(length<1e-10)fail('Curve endpoints must differ.');
 // Distance to the finite chord bounds the convex Bezier hull. Backtracking
 // controls force subdivision instead of accepting a collinear folded curve.
 if(Math.max(nearest(c[1],c[0],c[3]).distance,nearest(c[2],c[0],c[3]).distance)<=tolerance){out.push(c[3]);return;}
 const a=mix(c[0],c[1]),b=mix(c[1],c[2]),d=mix(c[2],c[3]),e=mix(a,b),f=mix(b,d),m=mix(e,f);flatten([c[0],a,e,m],tolerance,out,depth+1);flatten([m,f,d,c[3]],tolerance,out,depth+1);
}
function sectionHeight(section,u){
 if(u<=section[0][0]||u>=section.at(-1)[0])return 0;
 const i=section.findIndex(p=>p[0]>=u),a=section[i-1],b=section[i],t=(u-a[0])/(b[0]-a[0]);return a[1]*(1-t)+b[1]*t;
}
export function prepareReliefProfile(p){
 const validPoint=q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite);
 if(!p||!Array.isArray(p.segments)||!p.segments.length||p.segments.length>32||p.segments.some(c=>!Array.isArray(c)||c.length!==4||!c.every(validPoint))||!Number.isFinite(p.baseHeightMm)||!Number.isFinite(p.curveToleranceMm)||p.curveToleranceMm<=0||!Number.isFinite(p.maxSourceSpacingMm)||p.maxSourceSpacingMm<=0)fail('Explicit cubic paths, physical section coordinates and finite sampling controls required.');
 const s=p.stations;
 if(!Array.isArray(s)||s.length<2||s.length>64||s[0].at!==0||s.at(-1).at!==1||s.some((q,i)=>!Number.isFinite(q.at)||i&&q.at<=s[i-1].at||!Array.isArray(q.sectionMm)||q.sectionMm.length<3||q.sectionMm.length>64||!q.sectionMm.every(validPoint)||q.sectionMm[0][0]>=0||q.sectionMm.at(-1)[0]<=0||q.sectionMm[0][1]!==0||q.sectionMm.at(-1)[1]!==0||q.sectionMm.some((v,k)=>k&&v[0]<=q.sectionMm[k-1][0])))fail('Stations must increase from 0 to 1. Each cross-section has increasing signed mm offsets spanning zero, with zero-height outer endpoints.');
 if(!Array.isArray(p.endTaperMm)||p.endTaperMm.length!==2||p.endTaperMm.some(v=>!Number.isFinite(v)||v<0))fail('Two nonnegative taper lengths in mm required.');
 const path=[p.segments[0][0]];
 p.segments.forEach((c,i)=>{if(i){const before=p.segments[i-1],a=[before[3][0]-before[2][0],before[3][1]-before[2][1]],b=[c[1][0]-c[0][0],c[1][1]-c[0][1]];if(dist(before[3],c[0])>1e-9||dot(a,b)/(Math.hypot(...a)*Math.hypot(...b))<.999999)fail('Joined cubic paths require coincident endpoints and matching tangent direction.');}if(dist(c[0],c[1])<1e-9||dist(c[2],c[3])<1e-9)fail('Explicit nonzero endpoint tangents required.');flatten(c,p.curveToleranceMm,path);});
 const lengths=[0];for(let i=1;i<path.length;i++){if(dist(path[i-1],path[i])<1e-10)fail('Zero-length path interval.');lengths.push(lengths.at(-1)+dist(path[i-1],path[i]));}
 for(let i=1;i<path.length;i++)for(let j=i+2;j<path.length;j++){const a=path[i-1],b=path[i],c=path[j-1],d=path[j];if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1])))fail('Path intersects itself.');}
 const total=lengths.at(-1);if(p.endTaperMm[0]+p.endTaperMm[1]>total)fail('End taper lengths overlap.');
 let queries=0;
 const smooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
 return {spacingMm:[p.maxSourceSpacingMm,p.maxSourceSpacingMm],report:{pathLengthMm:total,curveChordToleranceMm:p.curveToleranceMm,pathIntervals:path.length-1,composition:'absolute-replacement',sectionInterpolation:'piecewise-linear-without-height-overshoot',endTaperMm:p.endTaperMm},sample(u,v){
  const point=[u,v];let best=null;
  for(let i=1;i<path.length;i++){if(++queries>12000000)throw meshError('RELIEF_EDIT_CAPACITY','Path sampling exceeds the bounded edit budget.');const q=nearest(point,path[i-1],path[i]);if(!best||q.distance<best.distance)best={...q,i,distanceAlong:lengths[i-1]+q.t*(lengths[i]-lengths[i-1])};}
  // Outside end planes no extrapolated spur is created.
  const first=[path[1][0]-path[0][0],path[1][1]-path[0][1]],last=[path.at(-1)[0]-path.at(-2)[0],path.at(-1)[1]-path.at(-2)[1]];
  if(best.i===1&&best.t===0&&dot([u-path[0][0],v-path[0][1]],first)<0||best.i===path.length-1&&best.t===1&&dot([u-path.at(-1)[0],v-path.at(-1)[1]],last)>0)return p.baseHeightMm;
  const at=best.distanceAlong/total,j=Math.max(1,s.findIndex(q=>q.at>=at)),a=s[j-1],b=s[j],t=(at-a.at)/(b.at-a.at),height=sectionHeight(a.sectionMm,best.signed)*(1-t)+sectionHeight(b.sectionMm,best.signed)*t;
  const taper=Math.min(p.endTaperMm[0]?smooth(best.distanceAlong/p.endTaperMm[0]):1,p.endTaperMm[1]?smooth((total-best.distanceAlong)/p.endTaperMm[1]):1);
  return p.baseHeightMm+height*taper;
 }};
}
