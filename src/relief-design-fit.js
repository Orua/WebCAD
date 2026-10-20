// Thin product adapter: authored field -> numerical fit, never CAD parameters.
import {validateReliefDesign} from './relief-design-drafts.js';
import {fitMaskedReliefBSpline} from './relief-design-core/masked-bspline-fit.mjs';
import {contractHash} from './contracts/operation-schema.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function normalizeReliefDesignFitOptions(options){
 if(!options||typeof options!=='object'||Array.isArray(options))fail('PARAM_SCHEMA_INVALID','Explicit numerical fit options are required');
 const allowed=['mode','controlColumns','controlRows','acceptanceToleranceMm','controlMaxMm','maxIterations','toleranceMm','maxWork'];
 for(const key of Object.keys(options))if(!allowed.includes(key))fail('PARAM_SCHEMA_INVALID','Unknown numerical fit option: '+key);
 if(!['emboss','engrave'].includes(options.mode))fail('PARAM_SCHEMA_INVALID','Choose explicit emboss/engrave relative to the authored baseline');
 const integer=(key,value,min,max)=>{if(!Number.isInteger(value)||value<min||value>max)fail('PARAM_RANGE_INVALID',key+' is outside its integer capacity');return value;};
 const positive=(key,value,max)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>max)fail('PARAM_RANGE_INVALID',key+' must be positive and within capacity');return value;};
 const result={mode:options.mode,controlColumns:integer('controlColumns',options.controlColumns,4,65),controlRows:integer('controlRows',options.controlRows,4,65),
  acceptanceToleranceMm:positive('acceptanceToleranceMm',options.acceptanceToleranceMm,20),maxIterations:integer('maxIterations',options.maxIterations??12000,1,50000),
  toleranceMm:positive('toleranceMm',options.toleranceMm??1e-9,1),maxWork:integer('maxWork',options.maxWork??200000000,1,200000000)};
 if(options.controlMaxMm!==undefined){if(typeof options.controlMaxMm!=='number'||!Number.isFinite(options.controlMaxMm)||options.controlMaxMm<0||options.controlMaxMm>20)fail('PARAM_RANGE_INVALID','controlMaxMm must be 0–20 mm');result.controlMaxMm=options.controlMaxMm;}
 return result;
}
export function prepareReliefDesignFit(draft,solved,options){
 const canonical=validateReliefDesign(draft),effective=normalizeReliefDesignFitOptions(options),f=solved?.field;
 if(!f||solved.report?.designFingerprint!==JSON.stringify(canonical))fail('RELIEF_DESIGN_STALE','Read and solve the current authored design before fitting');
 const [cx,cy]=canonical.support.centerMm,baselineMm=canonical.heightRangeMm[0],widthMm=canonical.support.kind==='circle'?canonical.support.radiusMm*2:canonical.support.widthMm,heightMm=canonical.support.kind==='circle'?canonical.support.radiusMm*2:canonical.support.heightMm;
 if(solved.report.protectionBaselineMm!==baselineMm||f.centerMm?.[0]!==cx||f.centerMm?.[1]!==cy||f.widthMm!==widthMm||f.heightMm!==heightMm)fail('FIT_SOURCE_INVALID','Solved field datum or domain does not match the current design');
 if(!Number.isInteger(f.columns)||!Number.isInteger(f.rows)||f.columns<2||f.rows<2||f.columns>129||f.rows>129)fail('FIT_SOURCE_INVALID','Solved field has invalid dimensions');
 const count=f.columns*f.rows,copy=key=>{
  const a=f[key];if(!(Array.isArray(a)||ArrayBuffer.isView(a)&&!(a instanceof DataView))||a.length!==count)fail('FIT_SOURCE_INVALID','Solved field '+key+' has an invalid length');
  return Array.from(a);
 };
 const field={columns:f.columns,rows:f.rows,widthMm,heightMm,heightsMm:copy('heightsMm'),active:copy('active'),fixedMask:copy('fixedMask')};
 const shift=s=>({...s,centerMm:[s.centerMm[0]-cx,s.centerMm[1]-cy]});
 const domain={support:shift(canonical.support),throughHoles:canonical.throughHoles.map(shift),protectedZones:canonical.protectedZones.map(shift)};
 return {input:{...effective,field,domain,baselineMm,maxControlPoints:4225},options:effective,
  source:{draftFingerprint:contractHash(canonical),fieldFingerprint:contractHash({field,domain,baselineMm,centerMm:[cx,cy]}),optionsFingerprint:contractHash(effective),centerMm:[cx,cy],baselineMm}};
}
export function fitReliefDesignField(draft,solved,options){
 const prepared=prepareReliefDesignFit(draft,solved,options),raw=fitMaskedReliefBSpline(prepared.input);
 // Public readback must survive JSON serialization without typed-array objects.
 const fit={...raw,controlHeightsMm:Array.from(raw.controlHeightsMm),controlDeltasMm:Array.from(raw.controlDeltasMm),lockedControlMask:Array.from(raw.lockedControlMask),sourceMasks:{active:Array.from(raw.sourceMasks.active),fixedMask:Array.from(raw.sourceMasks.fixedMask)}};
 return {fit,options:prepared.options,source:prepared.source,geometryReady:false,brepComputed:false,commitState:'notCommitted'};
}
