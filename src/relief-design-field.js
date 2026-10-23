// Product adapter for the Pro numerical core. Coordinates and samples remain mm.
import {validateReliefDesign} from './relief-design-drafts.js';
import {compileDesignField} from './relief-design-core/pipeline.mjs';
import {analyzeDesignMask} from './relief-design-core/closed-mesh.mjs';
import {binaryHash} from './contracts/operation-schema.js';
import {LIMITS} from './limits.js';
import {decodeHeightGrid,sampleHeightGrid} from './relief-source/convert.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
// Browser field cap for the automatic resolution (solver + observation budget stay bounded).
export const RELIEF_FIELD_AUTO_MAX_SIDE=129,RELIEF_FIELD_DEFAULT_SIDE=33;
// Pure: automatic numerical-field resolution. Without an image height source the design default (33²) holds;
// with one, the field follows the height grid: one node per machining-precision step, capped by the grid's own
// resolution and RELIEF_FIELD_AUTO_MAX_SIDE, aspect taken from the support.
export function adaptiveFieldResolution(draft,precisionMm=MACHINING_PRECISION_DEFAULT_MM){
 const s=draft.support,W=s.kind==='circle'?s.radiusMm*2:s.widthMm,H=s.kind==='circle'?s.radiusMm*2:s.heightMm,g=draft.heightSource?.source?.grid;
 if(!g)return {columns:RELIEF_FIELD_DEFAULT_SIDE,rows:RELIEF_FIELD_DEFAULT_SIDE,auto:false};
 const p=Number.isFinite(precisionMm)&&precisionMm>0?precisionMm:MACHINING_PRECISION_DEFAULT_MM,long=Math.max(W,H),short=Math.min(W,H);
 const cap=Math.max(RELIEF_FIELD_DEFAULT_SIDE,Math.min(RELIEF_FIELD_AUTO_MAX_SIDE,Math.max(g.columns,g.rows)));
 const L=Math.max(RELIEF_FIELD_DEFAULT_SIDE,Math.min(cap,Math.ceil(long/p)+1)),S=Math.max(9,Math.min(RELIEF_FIELD_AUTO_MAX_SIDE,Math.round((L-1)*short/long)+1));
 return W>=H?{columns:L,rows:S,auto:true}:{columns:S,rows:L,auto:true};
}
// Pure: automatic browser control net for a solved field (aspect kept, 9..max per side; 9 = former default).
export const RELIEF_BROWSER_FIT_AUTO_MAX=33;
export function adaptiveBrowserControlNet(columns,rows,max=RELIEF_BROWSER_FIT_AUTO_MAX){
 const k=Math.min(1,(max-1)/(Math.max(columns,rows)-1)),side=n=>Math.max(9,Math.min(max,Math.round((n-1)*k)+1));
 return {columns:side(columns),rows:side(rows)};
}
// Edge keep-out/fade are authored in mm. When the support is resized smaller (e.g. 60→18 mm) fixed mm margins
// would lock most of the domain. Their sum is capped at RELIEF_EDGE_MARGIN_MAX_FRACTION of the support's
// smallest half-size, scaling both proportionally, so at least half of the half-size stays free.
export const RELIEF_EDGE_MARGIN_MAX_FRACTION=.5;
export function effectiveEdgeMargins(draft){
 const h=draft?.heightSource,s=draft?.support,keep=h?.edgeKeepoutMm??0,fade=h?.edgeFadeMm??0;
 const half=s?(s.kind==='circle'?s.radiusMm:Math.min(s.widthMm,s.heightMm)/2):Infinity,limit=RELIEF_EDGE_MARGIN_MAX_FRACTION*half,sum=keep+fade;
 if(!(sum>limit))return {keepMm:keep,fadeMm:fade,scaled:false,requestedMm:[keep,fade],limitMm:limit};
 const k=limit/sum;return {keepMm:keep*k,fadeMm:fade*k,scaled:true,factor:k,requestedMm:[keep,fade],limitMm:limit};
}
export function solveReliefDesign(draft,options={}){
 draft=validateReliefDesign(draft);
 if(!options||typeof options!=='object'||Array.isArray(options))fail('PARAM_SCHEMA_INVALID','options must be an object');
 options={...draft.fieldSettings,...options};
 for(const k of Object.keys(options))if(!['columns','rows','smoothWeight','maxIterations','toleranceMm','edits','machiningPrecisionMm','servicesQuality'].includes(k))fail('PARAM_SCHEMA_INVALID','Unknown field option: '+k);
 const auto=adaptiveFieldResolution(draft,options.machiningPrecisionMm??MACHINING_PRECISION_DEFAULT_MM),columns=options.columns??auto.columns,rows=options.rows??(options.columns!==undefined?RELIEF_FIELD_DEFAULT_SIDE:auto.rows);
 if(![columns,rows].every(v=>Number.isInteger(v)&&v>=9&&v<=129))fail('FIELD_CAPACITY','columns/rows must be integers 9–129');
 if(options.maxIterations!==undefined&&(!Number.isInteger(options.maxIterations)||options.maxIterations<1||options.maxIterations>20000))fail('FIELD_CAPACITY','maxIterations must be 1–20000');
 const s=draft.support,[cx,cy]=s.centerMm,widthMm=s.kind==='circle'?s.radiusMm*2:s.widthMm,heightMm=s.kind==='circle'?s.radiusMm*2:s.heightMm;
 const shift=r=>({...r,centerMm:[r.centerMm[0]-cx,r.centerMm[1]-cy]});
 // The authored lower level is the baseline; protected/rim nodes stay exactly there.
 const initialMm=new Float64Array(columns*rows).fill(draft.heightRangeMm[0]);
 const edits=(options.edits??[]).map(e=>({...e,centerMm:e.centerMm?.map((v,i)=>v-s.centerMm[i])}));
 const solved=compileDesignField({domain:{grid:{columns,rows,widthMm,heightMm},support:shift(s),throughHoles:draft.throughHoles.map(shift),protectedZones:draft.protectedZones.map(shift),initialMm,lowerMm:draft.heightRangeMm[0],upperMm:draft.heightRangeMm[1]},points:[...draft.points.map(p=>({id:p.id,xMm:p.pointMm[0]-cx,yMm:p.pointMm[1]-cy,valueMm:p.heightMm,weight:100})),...heightSourcePoints(draft,columns,rows,widthMm,heightMm)],solver:{smoothWeight:options.smoothWeight??1,maxIterations:options.maxIterations??10000,toleranceMm:options.toleranceMm??1e-4},edits});
 const f=solved.field,precision=applyMachiningPrecision(f,{columns,rows,lowerMm:draft.heightRangeMm[0],upperMm:draft.heightRangeMm[1],precisionMm:options.machiningPrecisionMm??MACHINING_PRECISION_DEFAULT_MM});
 return {field:{columns,rows,widthMm,heightMm,centerMm:[cx,cy],heightsMm:Array.from(f.heightsMm),active:Array.from(f.active),fixedMask:Array.from(f.fixedMask),previewTriangles:Array.from(f.previewTriangles)},report:{...solved.report,precision,coordinateConvention:'row-zero-minus-Y; authored-mm-heights',protectionBaselineMm:draft.heightRangeMm[0],sourceKind:draft.heightSource?'authored-heightmap-observations':'authored-design-not-image-depth',...(draft.heightSource?{heightSource:{gridSha256:draft.heightSource.source.grid.sha256,settingsHash:draft.heightSource.source.settingsHash,derived:!!draft.heightSource.source.derivedFrom}}:{}),...(draft.heightSource?{edgeMargins:effectiveEdgeMargins(draft)}:{}),designFingerprint:JSON.stringify(draft)}};
}
// Pure: selected planar face placement (pattern centre on the face, face normal, X direction) -> snapshot frame.
// Mesh local XY = face plane (X = xDirection), local +Z = face normal, origin = pattern centre on the face.
export function facePlacementFrame(placement){
 const v=(a,n)=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)?a.map(Number):fail('PARAM_SCHEMA_INVALID',n+' must be 3 finite numbers');
 const o=v(placement?.originMm,'placement.originMm'),n0=v(placement?.normal,'placement.normal'),x0=v(placement?.xDirection,'placement.xDirection');
 const unit=a=>{const l=Math.hypot(...a);if(!(l>1e-12))fail('PARAM_SCHEMA_INVALID','zero-length direction');return a.map(c=>c/l);};
 const z=unit(n0),d=x0[0]*z[0]+x0[1]*z[1]+x0[2]*z[2],x=unit(x0.map((c,i)=>c-d*z[i])),y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
 // Rotation matrix columns x,y,z -> quaternion [x,y,z,w].
 const m00=x[0],m11=y[1],m22=z[2],t=m00+m11+m22;let q;
 if(t>0){const S=Math.sqrt(t+1)*2;q=[(y[2]-z[1])/S,(z[0]-x[2])/S,(x[1]-y[0])/S,S/4];}
 else if(m00>m11&&m00>m22){const S=Math.sqrt(1+m00-m11-m22)*2;q=[S/4,(y[0]+x[1])/S,(z[0]+x[2])/S,(y[2]-z[1])/S];}
 else if(m11>m22){const S=Math.sqrt(1+m11-m00-m22)*2;q=[(y[0]+x[1])/S,S/4,(z[1]+y[2])/S,(z[0]-x[2])/S];}
 else{const S=Math.sqrt(1+m22-m00-m11)*2;q=[(z[0]+x[2])/S,(z[1]+y[2])/S,S/4,(x[1]-y[0])/S];}
 const l=Math.hypot(...q);return {kind:'snapshot',origin:o,quaternion:q.map(c=>c/l)};
}
export function reliefDesignCandidate(result,draft,baseMm=1,placement=null){
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
 return {status:'candidate',geometryKind:'closed-triangle-mesh',notCommitted:true,needsGeometryValidation:true,domainReport:report,quantizationBoundMm:span/65535/2,args:{op:'meshHeightfieldRelief',refs:[],params:{version:1,widthMm:f.widthMm,depthMm:f.heightMm,baseMm:baseMm+min,heightMm:span||1,columns:f.columns,rows:f.rows,heights:{encoding:'u16le',data:encode(bytes)},domainMask:{encoding:'u8',data:encode(mask)},gamma:1,smoothing:0,edgeFadeMm:0,invert:false},placement:{version:1,frame:placement?facePlacementFrame(placement):{kind:'snapshot',origin:[...f.centerMm,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'}}},placementKind:placement?'selected-face':'draft-centre-world-xy'};
}

// Imported height map -> one weighted observation per grid node inside the support and outside holes
// and protected zones (those stay at the authored baseline). Image top is +Y; support bbox = image.
function heightSourcePoints(draft,columns,rows,widthMm,heightMm){
 const h=draft.heightSource;if(!h)return [];
 const grid=h.source.grid,values=decodeHeightGrid(grid),[cx,cy]=draft.support.centerMm,base=draft.heightRangeMm[0],w=h.weight??100;
 const inside=(s,x,y)=>{const dx=Math.abs(x-s.centerMm[0]),dy=Math.abs(y-s.centerMm[1]);return s.kind==='circle'?Math.hypot(dx,dy)<s.radiusMm:dx<s.widthMm/2&&dy<s.heightMm/2;};
 // Edge keep-out/fade: the relief must return to the locked baseline at support rims, holes and protected zones.
 const margins=effectiveEdgeMargins(draft),keep=margins.keepMm,fade=margins.fadeMm;
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
