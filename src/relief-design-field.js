// Product adapter for the Pro numerical core. Coordinates and samples remain mm.
import {validateReliefDesign} from './relief-design-drafts.js';
import {compileDesignField} from './relief-design-core/pipeline.mjs';
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
 if(draft.support.kind!=='rect')blockers.push('CIRCULAR_SUPPORT_GEOMETRY_NOT_IMPLEMENTED');
 if(draft.throughHoles.length)blockers.push('THROUGH_HOLE_GEOMETRY_NOT_IMPLEMENTED');
 if(draft.protectedZones.length)blockers.push('PROTECTED_GEOMETRY_NOT_CERTIFIED');
 if(draft.heightRangeMm[0]!==0)blockers.push('NONZERO_BASELINE_GEOMETRY_NOT_IMPLEMENTED');
 if(result.report.designFingerprint!==JSON.stringify(draft))fail('RELIEF_DESIGN_STALE','Design changed; solve again');
 const f=result.field,max=Math.max(...f.heightsMm);
 if(max<=0)blockers.push('POSITIVE_EMBOSS_FIELD_REQUIRED');
 if(blockers.length)return {status:'blocked',blockers,geometryKind:'design-height-field',notCommitted:true};
 // u16 quantization is explicit. Reverse rows because meshHeightfieldRelief uses +Y first.
 const bytes=new Uint8Array(f.heightsMm.length*2);
 for(let j=0;j<f.rows;j++)for(let i=0;i<f.columns;i++){const k=j*f.columns+i,v=Math.round(f.heightsMm[(f.rows-1-j)*f.columns+i]/max*65535);bytes[k*2]=v&255;bytes[k*2+1]=v>>8;}
 const data=typeof Buffer!=='undefined'?Buffer.from(bytes).toString('base64'):btoa(String.fromCharCode(...bytes));
 return {status:'candidate',geometryKind:'closed-triangle-mesh',notCommitted:true,needsGeometryValidation:true,quantizationBoundMm:max/65535/2,args:{op:'meshHeightfieldRelief',refs:[],params:{version:1,widthMm:f.widthMm,depthMm:f.heightMm,baseMm,heightMm:max,columns:f.columns,rows:f.rows,heights:{encoding:'u16le',data},gamma:1,smoothing:0,edgeFadeMm:0,invert:false},placement:{version:1,frame:{kind:'snapshot',origin:[...f.centerMm,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'}}}};
}
