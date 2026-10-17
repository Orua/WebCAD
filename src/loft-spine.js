import {buildSectionCurveLoft} from './section-curve-loft.js';

const norm=v=>Math.hypot(...v), dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=norm(v);if(n<1e-10)throw new Error('脊线包含零长度切线');return v.map(x=>x/n)};
const dist=(a,b)=>norm(a.map((x,i)=>x-b[i]));
const dispose=v=>{try{v?.delete?.()}catch{}};
const rotate=(v,axis,angle)=>{const c=Math.cos(angle),s=Math.sin(angle),d=dot(axis,v),cx=cross(axis,v);return v.map((x,i)=>x*c+cx[i]*s+axis[i]*d*(1-c));};
function law(value,t,fallback,name){
 if(value===undefined)return fallback;
 if(typeof value==='number')return value;
 const samples=value?.samples;if(value?.kind!=='spline'||!Array.isArray(samples)||samples.length<2||samples.some(s=>!Array.isArray(s)||s.length!==2||!s.every(Number.isFinite)||s[0]<0||s[0]>1))throw new Error(`${name} 须为数字或含 [t,value] 的 spline.samples`);
 const ordered=samples.toSorted((a,b)=>a[0]-b[0]);if(ordered.some((s,i)=>i&&s[0]<=ordered[i-1][0]))throw new Error(`${name}.samples 的 t 必须严格递增`);
 if(t<=ordered[0][0])return ordered[0][1];if(t>=ordered.at(-1)[0])return ordered.at(-1)[1];
 let i=1;while(ordered[i][0]<t)i++;const a=ordered[i-1],b=ordered[i],f=(t-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*f;
}
function interpolate(points,t,kind){const scaled=t*(points.length-1),i=Math.min(points.length-2,Math.floor(scaled)),f=scaled-i;
 if(kind!=='bspline')return points[i].map((v,j)=>v*(1-f)+points[i+1][j]*f);
 const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
 return p1.map((_,j)=>.5*((2*p1[j])+(-p0[j]+p2[j])*f+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*f*f+(-p0[j]+3*p1[j]-3*p2[j]+p3[j])*f*f*f));
}
function parameters(count,distribution,points){
 if(!Number.isInteger(count)||count<2||count>64)throw new Error('脊线 stations.count 须为 2–64');
 if(distribution==='uniform')return Array.from({length:count},(_,i)=>i/(count-1));
 if(distribution!=='curvature')throw new Error('stations.distribution 须为 uniform 或 curvature');
 const seg=points.slice(1).map((p,i)=>dist(p,points[i]));let cumulative=[0];for(const d of seg)cumulative.push(cumulative.at(-1)+d);
 const curv=[0];for(let i=1;i<points.length-1;i++){const a=unit(points[i].map((v,j)=>v-points[i-1][j])),b=unit(points[i+1].map((v,j)=>v-points[i][j]));curv.push(Math.acos(Math.max(-1,Math.min(1,dot(a,b))))); }curv.push(0);
 const density=cumulative.map((d,i)=>d+curv.slice(0,i+1).reduce((s,x)=>s+x,0)*Math.max(cumulative.at(-1),1));const max=density.at(-1);
 return Array.from({length:count},(_,k)=>{const target=max*k/(count-1);let i=1;while(density[i]<target&&i<density.length-1)i++;const f=(target-density[i-1])/(density[i]-density[i-1]||1);return (cumulative[i-1]*(1-f)+cumulative[i]*f)/cumulative.at(-1);});
}
export function buildSpineLoft(params,cad){
 const spine=params.spine,points=spine?.pointsMm;if(!Array.isArray(points)||points.length<2||points.length>128||!points.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)))throw new Error('spine.pointsMm 须为 2–128 个有限 XYZ 点');
 if(spine.kind!==undefined&&!['polyline','bspline'].includes(spine.kind))throw new Error('spine.kind 须为 polyline 或 bspline');
 for(let i=1;i<points.length;i++)if(dist(points[i],points[i-1])<1e-8)throw new Error('脊线相邻点不得重合');
 const count=params.stations?.count??32,ts=parameters(count,params.stations?.distribution??'uniform',points),up=params.upHint??[0,0,1];if(!Array.isArray(up)||up.length!==3||!up.every(Number.isFinite)||norm(up)<1e-9)throw new Error('upHint 须为非零有限 XYZ');
 let spineEdge=null;
 if(spine.kind==='bspline'&&points.length>2)spineEdge=cad.makeBSplineApproximation(points,{tolerance:params.tolerance??.01});
 const centerAt=t=>{if(!spineEdge)return interpolate(points,t,'polyline');const p=spineEdge.pointAt(t);try{return typeof p?.toTuple==='function'?p.toTuple():[p.x,p.y,p.z]}finally{dispose(p)}};
 try{
 const stations=[];let previousTangent=null,previousWidth=null;
 for(const t of ts){const centerMm=centerAt(t),eps=Math.min(1e-4,Math.max(1e-7,.25/(points.length-1))),a=centerAt(Math.max(0,t-eps)),b=centerAt(Math.min(1,t+eps)),normal=unit(b.map((v,i)=>v-a[i]));
  let width;if(!previousTangent){width=cross(up,normal);if(norm(width)<1e-8){const axes=[[1,0,0],[0,1,0],[0,0,1]].toSorted((a,b)=>Math.abs(dot(a,normal))-Math.abs(dot(b,normal)));width=cross(axes[0],normal);}width=unit(width);}else{const axis=cross(previousTangent,normal),s=norm(axis),c=Math.max(-1,Math.min(1,dot(previousTangent,normal)));width=s<1e-9?(c<0?previousWidth.map(v=>-v):previousWidth):rotate(previousWidth,axis.map(v=>v/s),Math.atan2(s,c));
   width=unit(width.map((v,i)=>v-normal[i]*dot(width,normal)));if(norm(width)<1e-8)throw new Error('脊线转折处无法构造稳定的旋转最小标架');}
  const roll=law(params.rollLawDeg,t,0,'rollLawDeg');width=unit(rotate(width,normal,roll*Math.PI/180));
  const widthMm=law(params.widthLaw,t,10,'widthLaw'),depthMm=law(params.depthLaw,t,widthMm,'depthLaw');if(widthMm<=0||depthMm<=0)throw new Error('widthLaw/depthLaw 必须始终为正');
  const profileLaw=params.profileLaw;if(profileLaw!==undefined&&(!Array.isArray(profileLaw)||profileLaw.length<2||profileLaw.length>64||profileLaw.some((item,i)=>!Array.isArray(item)||item.length!==2||!Number.isFinite(item[0])||item[0]<0||item[0]>1||!item[1]||typeof item[1]!=='object'||(i&&item[0]<=profileLaw[i-1][0]))))throw new Error('profileLaw 须为 t 严格递增且位于 0..1 的 [[t,profile], ...]');let profile;
  if(profileLaw){const nearest=profileLaw.reduce((best,item)=>Math.abs(item[0]-t)<Math.abs(best[0]-t)?item:best,profileLaw[0]);profile=nearest[1];}
  stations.push({centerMm,normal,widthDirection:width,widthMm,depthMm,...(profile?{profile}:{})});previousTangent=normal;previousWidth=width;
 }
 const result=buildSectionCurveLoft({...params,pathType:'sections',stations},cad);result.loftReport={...result.loftReport,spineFrames:stations.map((s,i)=>({i,t:ts[i],normal:s.normal,widthDirection:s.widthDirection})),spineKind:spineEdge?'bspline':'polyline'};return result;
 }finally{dispose(spineEdge)}
}
