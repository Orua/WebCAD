// Product adapter for the Pro numerical core. Coordinates and samples remain mm.
import {validateReliefDesign} from './relief-design-drafts.js';
import {compileDesignField} from './relief-design-core/pipeline.mjs';
import {analyzeDesignMask} from './relief-design-core/closed-mesh.mjs';
import {binaryHash} from './contracts/operation-schema.js';
import {LIMITS} from './limits.js';
import {decodeHeightGrid,sampleHeightGrid} from './relief-source/convert.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function solveReliefDesign(draft,options={}){
 draft=validateReliefDesign(draft);
 if(!options||typeof options!=='object'||Array.isArray(options))fail('PARAM_SCHEMA_INVALID','options must be an object');
 options={...draft.fieldSettings,...options};
 for(const k of Object.keys(options))if(!['columns','rows','smoothWeight','maxIterations','toleranceMm','edits','machiningPrecisionMm'].includes(k))fail('PARAM_SCHEMA_INVALID','Unknown field option: '+k);
 const columns=options.columns??33,rows=options.rows??33;
 if(![columns,rows].every(v=>Number.isInteger(v)&&v>=9&&v<=129))fail('FIELD_CAPACITY','columns/rows must be integers 9–129');
 if(options.maxIterations!==undefined&&(!Number.isInteger(options.maxIterations)||options.maxIterations<1||options.maxIterations>20000))fail('FIELD_CAPACITY','maxIterations must be 1–20000');
 const s=draft.support,[cx,cy]=s.centerMm,widthMm=s.kind==='circle'?s.radiusMm*2:s.widthMm,heightMm=s.kind==='circle'?s.radiusMm*2:s.heightMm;
 const shift=r=>({...r,centerMm:[r.centerMm[0]-cx,r.centerMm[1]-cy]});
 // The authored lower level is the baseline; protected/rim nodes stay exactly there.
 const initialMm=new Float64Array(columns*rows).fill(draft.heightRangeMm[0]);
 const edits=(options.edits??[]).map(e=>({...e,centerMm:e.centerMm?.map((v,i)=>v-s.centerMm[i])}));
 const solved=compileDesignField({domain:{grid:{columns,rows,widthMm,heightMm},support:shift(s),throughHoles:draft.throughHoles.map(shift),protectedZones:draft.protectedZones.map(shift),initialMm,lowerMm:draft.heightRangeMm[0],upperMm:draft.heightRangeMm[1]},points:[...draft.points.map(p=>({id:p.id,xMm:p.pointMm[0]-cx,yMm:p.pointMm[1]-cy,valueMm:p.heightMm,weight:100})),...heightSourcePoints(draft,columns,rows,widthMm,heightMm)],solver:{smoothWeight:options.smoothWeight??1,maxIterations:options.maxIterations??10000,toleranceMm:options.toleranceMm??1e-4},edits});
 const f=solved.field,precision=applyMachiningPrecision(f,{columns,rows,lowerMm:draft.heightRangeMm[0],upperMm:draft.heightRangeMm[1],precisionMm:options.machiningPrecisionMm??MACHINING_PRECISION_DEFAULT_MM});
 return {field:{columns,rows,widthMm,heightMm,centerMm:[cx,cy],heightsMm:Array.from(f.heightsMm),active:Array.from(f.active),fixedMask:Array.from(f.fixedMask),previewTriangles:Array.from(f.previewTriangles)},report:{...solved.report,precision,coordinateConvention:'row-zero-minus-Y; authored-mm-heights',protectionBaselineMm:draft.heightRangeMm[0],sourceKind:draft.heightSource?'authored-heightmap-observations':'authored-design-not-image-depth',...(draft.heightSource?{heightSource:{gridSha256:draft.heightSource.source.grid.sha256,settingsHash:draft.heightSource.source.settingsHash,derived:!!draft.heightSource.source.derivedFrom}}:{}),designFingerprint:JSON.stringify(draft)}};
}
export function reliefDesignCandidate(result,draft,baseMm=1){
 draft=validateReliefDesign(draft);
 if(!Number.isFinite(baseMm)||baseMm<=0)fail('PARAM_RANGE_INVALID','baseMm must be positive');
 const blockers=[];
 if(result.report.designFingerprint!==JSON.stringify(draft))fail('RELIEF_DESIGN_STALE','Design changed; solve again');
 const f=result.field,min=Math.min(...f.heightsMm),max=Math.max(...f.heightsMm),span=max-min,dx=f.widthMm/(f.columns-1),dy=f.heightMm/(f.rows-1);
 if(baseMm+min<=0)blockers.push('RELIEF_DESIGN_BASE_INTERSECTION');
 if(span>LIMITS.heightfield.maxHeightMm)blockers.push('RELIEF_DESIGN_HEIGHT_RANGE_UNSUPPORTED');
 if(draft.throughHoles.some(s=>(s.kind==='circle'?s.radiusMm*2:Math.min(s.widthMm,s.heightMm))<Math.max(dx,dy)))blockers.push('RELIEF_DESIGN_FEATURE_UNRESOLVED');
 // Samples and domain share the existing mesh convention (+Y first); never fill inactive cells.
 const bytes=new Uint8Array(f.heightsMm.length*2),mask=new Uint8Array(f.heightsMm.length);
 for(let j=0;j<f.rows;j++)for(let i=0;i<f.columns;i++){const k=j*f.columns+i,source=(f.rows-1-j)*f.columns+i,v=span?Math.round((f.heightsMm[source]-min)/span*65535):0;bytes[k*2]=v&255;bytes[k*2+1]=v>>8;mask[k]=f.active[source];}
 let topology;
 try{topology=analyzeDesignMask({columns:f.columns,rows:f.rows,widthMm:f.widthMm,depthMm:f.heightMm},mask);}catch(e){if(e.code?.startsWith('RELIEF_DESIGN_DOMAIN_'))blockers.push(e.code);else throw e;}
 const inside=(point,loop)=>{let yes=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=loop[i],b=loop[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 if(topology){
  const holes=topology.loops.filter(l=>l.signedAreaMm2<0),matches=draft.throughHoles.map(h=>holes.findIndex(l=>inside(h.centerMm.map((v,i)=>v-f.centerMm[i]),l.pointsMm)));
  if(holes.length!==draft.throughHoles.length||matches.some(i=>i<0)||new Set(matches).size!==matches.length)blockers.push('RELIEF_DESIGN_HOLE_TOPOLOGY_CHANGED');
 }
 let triangulationBoundMm=0;
 for(let j=0;j<f.rows-1;j++)for(let i=0;i<f.columns-1;i++){const a=j*f.columns+i,b=a+1,c=a+f.columns,d=c+1;if([a,b,c,d].every(k=>f.active[k]))triangulationBoundMm=Math.max(triangulationBoundMm,Math.abs(f.heightsMm[a]-f.heightsMm[b]-f.heightsMm[c]+f.heightsMm[d])/4);}
 const report={...topology?.report,declaredSupport:draft.support,analyticSupportAreaMm2:draft.support.kind==='circle'?Math.PI*draft.support.radiusMm**2:draft.support.widthMm*draft.support.heightMm,declaredHoleCount:draft.throughHoles.length,protectedZoneCount:draft.protectedZones.length,protectionSemantics:'fixed-authored-initial-baseline-not-freeze-of-existing-geometry',protectionBaselineMm:draft.heightRangeMm[0],baselineOffsetMm:min,triangulationBoundMm,heightApproximationBoundMm:triangulationBoundMm+span/65535/2,heightBoundRelativeTo:'solved-bilinear-design-interpolant-on-retained-cells-only',maskSource:{designSha256:binaryHash(new TextEncoder().encode(JSON.stringify(draft))),maskSha256:binaryHash(mask),rowOrder:'plus-Y-first',centerMm:f.centerMm},boundaryGuarantee:'conservative-grid-cells; boundary approximation <= 2 cell diagonals, topology separately checked'};
 if(blockers.length)return {status:'blocked',blockers:[...new Set(blockers)],geometryKind:'design-height-field',notCommitted:true,domainReport:report};
 const encode=values=>typeof Buffer!=='undefined'?Buffer.from(values).toString('base64'):btoa(String.fromCharCode(...values));
 return {status:'candidate',geometryKind:'closed-triangle-mesh',notCommitted:true,needsGeometryValidation:true,domainReport:report,quantizationBoundMm:span/65535/2,args:{op:'meshHeightfieldRelief',refs:[],params:{version:1,widthMm:f.widthMm,depthMm:f.heightMm,baseMm:baseMm+min,heightMm:span||1,columns:f.columns,rows:f.rows,heights:{encoding:'u16le',data:encode(bytes)},domainMask:{encoding:'u8',data:encode(mask)},gamma:1,smoothing:0,edgeFadeMm:0,invert:false},placement:{version:1,frame:{kind:'snapshot',origin:[...f.centerMm,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'}}}};
}

// Imported height map -> one weighted observation per grid node inside the support and outside holes
// and protected zones (those stay at the authored baseline). Image top is +Y; support bbox = image.
function heightSourcePoints(draft,columns,rows,widthMm,heightMm){
 const h=draft.heightSource;if(!h)return [];
 const grid=h.source.grid,values=decodeHeightGrid(grid),[cx,cy]=draft.support.centerMm,base=draft.heightRangeMm[0],w=h.weight??100;
 const inside=(s,x,y)=>{const dx=Math.abs(x-s.centerMm[0]),dy=Math.abs(y-s.centerMm[1]);return s.kind==='circle'?Math.hypot(dx,dy)<s.radiusMm:dx<s.widthMm/2&&dy<s.heightMm/2;};
 // Edge keep-out/fade: the relief must return to the locked baseline at support rims, holes and protected zones.
 const keep=h.edgeKeepoutMm??0,fade=h.edgeFadeMm??0;
 const gap=(s,x,y,outside)=>{const dx=x-s.centerMm[0],dy=y-s.centerMm[1];if(s.kind==='circle'){const r=Math.hypot(dx,dy);return outside?r-s.radiusMm:s.radiusMm-r;}const ex=Math.abs(dx)-s.widthMm/2,ey=Math.abs(dy)-s.heightMm/2;return outside?(ex>0||ey>0?Math.hypot(Math.max(ex,0),Math.max(ey,0)):Math.max(ex,ey)):Math.min(-ex,-ey);};
 const edgeFactor=(x,y)=>{if(!keep&&!fade)return 1;const d=Math.min(gap(draft.support,x,y,false),...draft.throughHoles.map(s=>gap(s,x,y,true)),...draft.protectedZones.map(s=>gap(s,x,y,true)));if(d<=keep)return 0;if(!fade)return 1;const t=Math.min(1,(d-keep)/fade);return t*t*(3-2*t);};
 const out=[];
 for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
  const x=cx-widthMm/2+i*widthMm/(columns-1),y=cy-heightMm/2+j*heightMm/(rows-1);
  if(!inside(draft.support,x,y)||draft.throughHoles.some(s=>inside(s,x,y))||draft.protectedZones.some(s=>inside(s,x,y)))continue;
  const u=(x-(cx-widthMm/2))/widthMm,v=((cy+heightMm/2)-y)/heightMm;
  out.push({id:`hs:${i}:${j}`,xMm:x-cx,yMm:y-cy,valueMm:base+h.depthMm*edgeFactor(x,y)*sampleHeightGrid(grid,values,u,v),weight:w});
 }
 if(out.length>65536)fail('FIELD_CAPACITY','导入高度图观测点过多');
 return out;
}

// Machining precision (default 0.05 mm): height detail below the cutter's precision must not
// appear. Two C1 soft knees (no new steps): (1) ripples whose amplitude relative to a local
// 5-point average is below ~precision are faded out; (2) heights within 2×precision of the
// baseline fade smoothly to it, so the retained-domain edge meets the face flush.
export const MACHINING_PRECISION_DEFAULT_MM=.05;
const smoothstep=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
export function softKnee(d,p){const a=Math.abs(d);return d*smoothstep(a/(2*p));}
export function applyMachiningPrecision(f,{columns,rows,lowerMm,upperMm,precisionMm}){
 const p=precisionMm,h=f.heightsMm,n=columns*rows,before=Float64Array.from(h);
 if(!(p>0))return {machiningPrecisionMm:p,changedNodeCount:0,maxChangeMm:0};
 const free=k=>f.active[k]&&!f.fixedMask[k];
 const average=src=>{const out=Float64Array.from(src);for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const k=j*columns+i;if(!free(k))continue;let s=src[k],c=1;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=i+di,y=j+dj;if(x<0||y<0||x>=columns||y>=rows)continue;const q=y*columns+x;if(!f.active[q])continue;s+=src[q];c++;}out[k]=s/c;}return out;};
 const s=average(average(before));
 let changed=0,maxChange=0;
 for(let k=0;k<n;k++){if(!free(k))continue;
  let v=s[k]+softKnee(before[k]-s[k],p);
  v=lowerMm+softKnee(v-lowerMm,p);
  v=Math.min(upperMm,Math.max(lowerMm,v));
  const c=Math.abs(v-before[k]);if(c>1e-12){changed++;maxChange=Math.max(maxChange,c);}h[k]=v;}
 return {machiningPrecisionMm:p,method:'detail-soft-knee+baseline-dead-band-C1',changedNodeCount:changed,maxChangeMm:maxChange};
}
