// Product adapter for the Pro numerical core. Coordinates and samples remain mm.
import {validateReliefDesign} from './relief-design-drafts.js';
import {compileDesignField} from './relief-design-core/pipeline.mjs';
import {analyzeDesignMask} from './relief-design-core/closed-mesh.mjs';
import {binaryHash} from './contracts/operation-schema.js';
import {LIMITS} from './limits.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function solveReliefDesign(draft,options={}){
 draft=validateReliefDesign(draft);
 if(!options||typeof options!=='object'||Array.isArray(options))fail('PARAM_SCHEMA_INVALID','options must be an object');
 options={...draft.fieldSettings,...options};
 for(const k of Object.keys(options))if(!['columns','rows','smoothWeight','maxIterations','toleranceMm','edits'].includes(k))fail('PARAM_SCHEMA_INVALID','Unknown field option: '+k);
 const columns=options.columns??33,rows=options.rows??33;
 if(![columns,rows].every(v=>Number.isInteger(v)&&v>=9&&v<=129))fail('FIELD_CAPACITY','columns/rows must be integers 9–129');
 if(options.maxIterations!==undefined&&(!Number.isInteger(options.maxIterations)||options.maxIterations<1||options.maxIterations>20000))fail('FIELD_CAPACITY','maxIterations must be 1–20000');
 const s=draft.support,[cx,cy]=s.centerMm,widthMm=s.kind==='circle'?s.radiusMm*2:s.widthMm,heightMm=s.kind==='circle'?s.radiusMm*2:s.heightMm;
 const shift=r=>({...r,centerMm:[r.centerMm[0]-cx,r.centerMm[1]-cy]});
 // The authored lower level is the baseline; protected/rim nodes stay exactly there.
 const initialMm=new Float64Array(columns*rows).fill(draft.heightRangeMm[0]);
 const edits=(options.edits??[]).map(e=>({...e,centerMm:e.centerMm?.map((v,i)=>v-s.centerMm[i])}));
 const solved=compileDesignField({domain:{grid:{columns,rows,widthMm,heightMm},support:shift(s),throughHoles:draft.throughHoles.map(shift),protectedZones:draft.protectedZones.map(shift),initialMm,lowerMm:draft.heightRangeMm[0],upperMm:draft.heightRangeMm[1]},points:draft.points.map(p=>({id:p.id,xMm:p.pointMm[0]-cx,yMm:p.pointMm[1]-cy,valueMm:p.heightMm,weight:100})),solver:{smoothWeight:options.smoothWeight??1,maxIterations:options.maxIterations??10000,toleranceMm:options.toleranceMm??1e-4},edits});
 const f=solved.field;
 return {field:{columns,rows,widthMm,heightMm,centerMm:[cx,cy],heightsMm:Array.from(f.heightsMm),active:Array.from(f.active),fixedMask:Array.from(f.fixedMask),previewTriangles:Array.from(f.previewTriangles)},report:{...solved.report,coordinateConvention:'row-zero-minus-Y; authored-mm-heights',protectionBaselineMm:draft.heightRangeMm[0],sourceKind:'authored-design-not-image-depth',designFingerprint:JSON.stringify(draft)}};
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
