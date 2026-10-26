import {validateRegions,inspectLogoMachiningCapacity} from './logo-model.js';
import {fitRasterRing,contourDeviationBound} from './logo-contour-fit.js';

export const LOGO_MACHINING_SCHEMA={type:'object',additionalProperties:false,properties:{enabled:{type:'boolean',default:true},toleranceMm:{type:'number',minimum:0,maximum:0.1,description:'Optional explicit deviation ceiling in mm. Omitted: automatically fit to the machining endpoint within min(0.25 mm, 1% of artwork short side).'},minDetailMm:{type:'number',minimum:0,maximum:1,description:'Legacy explicit-optimizer field; automatic endpoint fitting preserves all regions and holes.'}}};
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
/** Fit from the original contours, never from the preceding approximation.
 * RDP's source vertices lie in the convex capsule of each retained segment.
 * Continuity between its pinned endpoints also covers the reverse distance.
 * The complete candidate arrangement is independently checked for topology.
 */
export function fitLogoToMachining(logo,options){
 validateLogoMachining(options);
 const originalCapacity=inspectLogoMachiningCapacity(logo);
 if(options?.enabled===false)return logo;
 const original=logo.source?.machiningOriginalContours??logo;
 validateRegions(original);
 const originalRegions=structuredClone(original.regions),shortSide=Math.min(...(logo.sizeMm??[35,35]).filter(v=>v>0));
 const ceiling=options?.toleranceMm??Math.min(.25,shortSide*.01);
 if(!(ceiling>0))return logo;
 if((logo.source?.kind==='raster'||logo.source?.rasterFrame)&&originalCapacity.counts.vertices>3000){
  try{
   const source={...(typeof logo.source==='object'?logo.source:{})};delete source.machiningOptimization;delete source.endpointAdaptation;
   const fitted=optimizeLogoForMachining({...original,source},{enabled:true,toleranceMm:Math.min(.05,ceiling),minDetailMm:0}),capacity=inspectLogoMachiningCapacity(fitted),report=fitted.source.machiningOptimization;
   if(capacity.supported)return{...fitted,source:{...fitted.source,endpointAdaptation:{algorithm:'bounded-line-arc-topology-v2',automatic:true,before:inspectLogoMachiningCapacity(original).counts,after:capacity.counts,limits:originalCapacity.limits,maxDeviationMm:report.maxDeviationMm,allowedDeviationMm:report.toleranceMm,ceilingMm:ceiling,regionsPreserved:true,holesPreserved:true,boundsPreserved:false,nominalSizeMm:logo.sizeMm}}};
  }catch{/* Keep the already validated, source-preserving RDP candidate. */}
 }
 let accepted=null;
 // A finite data-only budget. No new conversion or geometry jobs are submitted.
 for(let i=0;i<6;i++){
  const tolerance=ceiling/2**(5-i),proposals=originalRegions.map(r=>({outer:simplify(r.outer,tolerance),holes:(r.holes??[]).map(h=>simplify(h,tolerance))}));
  const candidate={...logo,regions:proposals.map(r=>({outer:r.outer.ring,holes:r.holes.map(h=>h.ring)}))};
  if(!inspectLogoMachiningCapacity(candidate).supported)continue;
  try{validateRegions(candidate);}catch{continue;}
  const bound=Math.max(0,...proposals.flatMap(r=>[r.outer.bound,...r.holes.map(h=>h.bound)]));
  accepted={...candidate,source:{...(typeof logo.source==='object'?logo.source:{}),reviewed:false,reviewRequired:true,machiningOriginalContours:{type:'webcad-logo',version:1,units:'mm',name:logo.name,sizeMm:logo.sizeMm,regions:originalRegions},endpointAdaptation:{algorithm:'bounded-rdp-extrema-topology-v1',automatic:true,before:inspectLogoMachiningCapacity(original).counts,after:inspectLogoMachiningCapacity(candidate).counts,limits:originalCapacity.limits,maxDeviationMm:bound,allowedDeviationMm:tolerance,ceilingMm:ceiling,regionsPreserved:true,holesPreserved:true,boundsPreserved:true}}};
  break;
 }
 if(accepted)return accepted;
 if(originalCapacity.supported)return logo;
 return {...logo,source:{...(typeof logo.source==='object'?logo.source:{}),endpointAdaptation:{automatic:true,status:'unavailable-with-preserved-topology',limits:originalCapacity.limits,counts:originalCapacity.counts,ceilingMm:ceiling}}};
}
export function optimizeLogoForMachining(logo,options){
 validateLogoMachining(options);if(options?.enabled!==true)return logo;
 if(logo.source?.machiningOptimization)throw Object.assign(new Error('请从原始来源重新优化，避免累积近似。'),{code:'LOGO_REVIEW_STALE'});
 const requestedToleranceMm=options.toleranceMm??.05,minDetailMm=options.minDetailMm??.2;
 const raster=logo.source?.kind==='raster',shortSideMm=Math.min(...(logo.sizeMm??[]).filter(v=>v>0));
 const toleranceMm=raster&&Number.isFinite(shortSideMm)?Math.min(requestedToleranceMm,shortSideMm*.02):requestedToleranceMm;
 const propose=ring=>{
  if(!raster)return simplify(ring,toleranceMm);
  const fit=fitRasterRing(ring,toleranceMm);
  try{validateRegions({regions:[{outer:fit.ring,holes:[]}]});if(!fit.rejected)return fit;}catch{}
  // Dense artwork can fold a fitted arc across a neighbouring segment. Use
  // conservative source-vertex reduction at the SAME tolerance, never raw
  // overflow or a larger hidden tolerance. The full arrangement is checked below.
  const conservative=simplify(ring,toleranceMm),bound=contourDeviationBound(ring,conservative.ring,toleranceMm);
  return bound===null?{ring,bound:0,lines:0,arcs:0,rejected:true}:{...conservative,bound,lines:0,arcs:0,rejected:false,conservativeFallback:true};
 };
 validateRegions(logo);const original=structuredClone(logo.regions),before=count(original);
 let removedRegions=0,removedHoles=0,removedMaxSpanMm=0;
 const regions=original.filter(r=>{if(minDetailMm>0&&span(r.outer)<minDetailMm){removedRegions++;removedMaxSpanMm=Math.max(removedMaxSpanMm,span(r.outer));removedHoles+=(r.holes??[]).length;return false;}return true;}).map(r=>({...r,holes:(r.holes??[]).filter(h=>{if(minDetailMm>0&&span(h)<minDetailMm){removedHoles++;removedMaxSpanMm=Math.max(removedMaxSpanMm,span(h));return false;}return true;})}));
 if(!regions.length)throw Object.assign(new Error('图案所有区域均小于微小细节阈值，请减小阈值。'),{code:'NO_VECTOR_CONTENT',details:{logoFailure:{reason:'图案所有区域均小于设定的微小细节尺寸，未生成加工轮廓。',next:'请减小微小细节阈值后重新识别。'}}});
 validateRegions({regions});let maxDeviationMm=0,rejectedRings=0;
 const proposals=regions.map(region=>({outer:propose(region.outer),holes:region.holes.map(h=>propose(h))}));
 const batch=proposals.map(r=>({outer:r.outer.ring,holes:r.holes.map(h=>h.ring)}));
 let batchAccepted=false;
 try{validateRegions({regions:batch});batchAccepted=true;maxDeviationMm=Math.max(0,...proposals.flatMap(r=>[r.outer.bound,...r.holes.map(h=>h.bound)]));}catch{}
 // Accept a ring only after the complete current arrangement is validated.
 // A topology conflict retains that original ring; no hidden tolerance retries.
 if(batchAccepted)regions.splice(0,regions.length,...batch);
 else for(const region of regions)for(let h=-1;h<region.holes.length;h++){
  const old=h<0?region.outer:region.holes[h],candidate=propose(old);if(candidate.ring===old)continue;
  if(h<0)region.outer=candidate.ring;else region.holes[h]=candidate.ring;
  try{validateRegions({regions:[region]});for(const other of regions)if(other!==region)validateRegions({regions:[region,other]});maxDeviationMm=Math.max(maxDeviationMm,candidate.bound);}catch{if(h<0)region.outer=old;else region.holes[h]=old;rejectedRings++;}
 }
 const fits=proposals.flatMap(r=>[r.outer,...r.holes]);
 const after=count(regions),report={algorithm:raster?'mm-line-arc-topology-v2':'mm-rdp-extrema-topology-v1',requestedToleranceMm,toleranceMm,shortSideMm:Number.isFinite(shortSideMm)?shortSideMm:null,tolerancePolicy:raster?'min(requested tolerance, artwork short side * 0.02)':'explicit-mm',minDetailMm,maxDeviationMm,before,after,removedRegions,removedHoles,removedMaxSpanMm,rejectedRings,fitting:raster?{lineCandidates:fits.reduce((s,f)=>s+(f.lines??0),0),arcCandidates:fits.reduce((s,f)=>s+(f.arcs??0),0),rejectedDeviationRings:fits.filter(f=>f.rejected).length,conservativeFallbackRings:fits.filter(f=>f.conservativeFallback).length,acceptedAllCandidates:batchAccepted,curveOutput:'polyline sampled from circular arcs, then bounded join cleanup; final symmetric deviation <= toleranceMm',deviationCheck:'certified symmetric distance between complete input and output polylines'}:null,deviationAppliesTo:'retained contours only; removed compact features use minDetailMm',detailRemovalRule:'remove only whole regions/holes whose longest bounding-box dimension is below minDetailMm; retain long narrow strokes',machineCapability:'user-adjustable approximation; not verified machine/tool/depth capability',reviewRequired:true};
 const source={...(typeof logo.source==='object'?logo.source:{}),reviewed:false,reviewRequired:true,machiningOriginalContours:{type:'webcad-logo',version:1,units:'mm',name:logo.name,sizeMm:logo.sizeMm,regions:original},machiningOptimization:report};
 const points=regions.flatMap(r=>r.outer);let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y]of points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 const result={...logo,sizeMm:[x1-x0,y1-y0],regions,source};result.source.machiningOptimization.machiningReadiness=inspectLogoMachiningCapacity(result);return result;
}
