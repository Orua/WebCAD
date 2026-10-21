import {validateRegions,inspectLogoMachiningCapacity} from './logo-model.js';

export const LOGO_MACHINING_SCHEMA={type:'object',additionalProperties:false,properties:{enabled:{type:'boolean',default:false},toleranceMm:{type:'number',minimum:0,maximum:0.1,default:0.05},minDetailMm:{type:'number',minimum:0,maximum:1,default:0.2}}};
export function validateLogoMachining(options){
 if(options===undefined)return;
 const fail=message=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID',path:'machining'});};
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!Object.hasOwn(LOGO_MACHINING_SCHEMA.properties,k)))fail('加工优化参数无效。');
 if(options.enabled!==undefined&&typeof options.enabled!=='boolean')fail('machining.enabled 必须为布尔值。');
 for(const [key,max]of [['toleranceMm',.1],['minDetailMm',1]])if(options[key]!==undefined&&(!Number.isFinite(options[key])||options[key]<0||options[key]>max))fail(`${key} 须为 0–${max} mm。`);
}
const rings=regions=>regions.flatMap(r=>[r.outer,...(r.holes??[])]);
const count=regions=>({regions:regions.length,holes:regions.reduce((s,r)=>s+(r.holes?.length??0),0),vertices:rings(regions).reduce((s,r)=>s+r.length,0)});
const span=ring=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y]of ring){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return Math.max(x1-x0,y1-y0);};
function distance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function simplify(ring,tolerance){
 if(!tolerance||ring.length<4)return {ring,bound:0};
 // Pin all four extrema so physical bounds and the raster overlay stay fixed.
 const anchors=new Set([0]);for(let axis=0;axis<2;axis++){let lo=0,hi=0;for(let i=1;i<ring.length;i++){if(ring[i][axis]<ring[lo][axis])lo=i;if(ring[i][axis]>ring[hi][axis])hi=i;}anchors.add(lo);anchors.add(hi);}
 const indices=[...anchors].sort((a,b)=>a-b),keep=new Set(indices);let bound=0;
 for(let k=0;k<indices.length;k++){
  const begin=indices[k],end=k+1<indices.length?indices[k+1]:indices[0]+ring.length,stack=[[begin,end]];
  while(stack.length){const [a,b]=stack.pop();let max=0,furthest=-1;for(let i=a+1;i<b;i++){const d=distance(ring[i%ring.length],ring[a%ring.length],ring[b%ring.length]);if(d>max){max=d;furthest=i;}}
   if(max>tolerance){keep.add(furthest%ring.length);stack.push([a,furthest],[furthest,b]);}else bound=Math.max(bound,max);
  }
 }
 return {ring:ring.filter((_,i)=>keep.has(i)),bound};
}
export function optimizeLogoForMachining(logo,options){
 validateLogoMachining(options);if(options?.enabled!==true)return logo;
 if(logo.source?.machiningOptimization)throw Object.assign(new Error('请从原始来源重新优化，避免累积近似。'),{code:'LOGO_REVIEW_STALE'});
 const toleranceMm=options.toleranceMm??.05,minDetailMm=options.minDetailMm??.2;
 validateRegions(logo);const original=structuredClone(logo.regions),before=count(original);
 let removedRegions=0,removedHoles=0,removedMaxSpanMm=0;
 const regions=original.filter(r=>{if(minDetailMm>0&&span(r.outer)<minDetailMm){removedRegions++;removedMaxSpanMm=Math.max(removedMaxSpanMm,span(r.outer));removedHoles+=(r.holes??[]).length;return false;}return true;}).map(r=>({...r,holes:(r.holes??[]).filter(h=>{if(minDetailMm>0&&span(h)<minDetailMm){removedHoles++;removedMaxSpanMm=Math.max(removedMaxSpanMm,span(h));return false;}return true;})}));
 if(!regions.length)throw Object.assign(new Error('图案所有区域均小于微小细节阈值，请减小阈值。'),{code:'NO_VECTOR_CONTENT',details:{logoFailure:{reason:'图案所有区域均小于设定的微小细节尺寸，未生成加工轮廓。',next:'请减小微小细节阈值后重新识别。'}}});
 validateRegions({regions});let maxDeviationMm=0,rejectedRings=0;
 const proposals=regions.map(region=>({outer:simplify(region.outer,toleranceMm),holes:region.holes.map(h=>simplify(h,toleranceMm))}));
 const batch=proposals.map(r=>({outer:r.outer.ring,holes:r.holes.map(h=>h.ring)}));
 let batchAccepted=false;
 try{validateRegions({regions:batch});batchAccepted=true;maxDeviationMm=Math.max(0,...proposals.flatMap(r=>[r.outer.bound,...r.holes.map(h=>h.bound)]));}catch{}
 // Accept a ring only after the complete current arrangement is validated.
 // A topology conflict retains that original ring; no hidden tolerance retries.
 if(batchAccepted)regions.splice(0,regions.length,...batch);
 else for(const region of regions)for(let h=-1;h<region.holes.length;h++){
  const old=h<0?region.outer:region.holes[h],candidate=simplify(old,toleranceMm);if(candidate.ring.length===old.length)continue;
  if(h<0)region.outer=candidate.ring;else region.holes[h]=candidate.ring;
  try{validateRegions({regions:[region]});for(const other of regions)if(other!==region)validateRegions({regions:[region,other]});maxDeviationMm=Math.max(maxDeviationMm,candidate.bound);}catch{if(h<0)region.outer=old;else region.holes[h]=old;rejectedRings++;}
 }
 const after=count(regions),report={algorithm:'mm-rdp-extrema-topology-v1',toleranceMm,minDetailMm,maxDeviationMm,before,after,removedRegions,removedHoles,removedMaxSpanMm,rejectedRings,deviationAppliesTo:'retained contours only; removed compact features use minDetailMm',detailRemovalRule:'remove only whole regions/holes whose longest bounding-box dimension is below minDetailMm; retain long narrow strokes',machineCapability:'user-adjustable approximation; not verified machine/tool/depth capability',reviewRequired:true};
 const source={...(typeof logo.source==='object'?logo.source:{}),reviewed:false,reviewRequired:true,machiningOriginalContours:{type:'webcad-logo',version:1,units:'mm',name:logo.name,sizeMm:logo.sizeMm,regions:original},machiningOptimization:report};
 const points=regions.flatMap(r=>r.outer);let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y]of points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 const result={...logo,sizeMm:[x1-x0,y1-y0],regions,source};result.source.machiningOptimization.machiningReadiness=inspectLogoMachiningCapacity(result);return result;
}
