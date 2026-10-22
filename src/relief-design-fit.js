// Thin product adapter: authored field -> numerical fit, never CAD parameters.
import {validateReliefDesign} from './relief-design-drafts.js';
import {fitMaskedReliefBSpline} from './relief-design-core/masked-bspline-fit.mjs';
import {contractHash} from './contracts/operation-schema.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function normalizeReliefDesignFitOptions(options,{maxControlSide=65}={}){
 if(!options||typeof options!=='object'||Array.isArray(options))fail('PARAM_SCHEMA_INVALID','Explicit numerical fit options are required');
 const allowed=['mode','heightInterpretation','controlColumns','controlRows','acceptanceToleranceMm','controlMaxMm','maxIterations','toleranceMm','maxWork','deviationPolicy'];
 for(const key of Object.keys(options))if(!allowed.includes(key))fail('PARAM_SCHEMA_INVALID','Unknown numerical fit option: '+key);
 if(!['emboss','engrave'].includes(options.mode))fail('PARAM_SCHEMA_INVALID','Choose explicit emboss/engrave relative to the authored baseline');
 const integer=(key,value,min,max)=>{if(!Number.isInteger(value)||value<min||value>max)fail('PARAM_RANGE_INVALID',key+' is outside its integer capacity');return value;};
 const positive=(key,value,max)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>max)fail('PARAM_RANGE_INVALID',key+' must be positive and within capacity');return value;};
 const deviationPolicy=options.deviationPolicy??'candidate';if(!['candidate','strict'].includes(deviationPolicy))fail('PARAM_SCHEMA_INVALID','deviationPolicy must be candidate or strict');
 const result={deviationPolicy,mode:options.mode,controlColumns:integer('controlColumns',options.controlColumns,4,maxControlSide),controlRows:integer('controlRows',options.controlRows,4,maxControlSide),
  acceptanceToleranceMm:positive('acceptanceToleranceMm',options.acceptanceToleranceMm,20),maxIterations:integer('maxIterations',options.maxIterations??12000,1,50000),
  toleranceMm:positive('toleranceMm',options.toleranceMm??1e-9,1),maxWork:integer('maxWork',options.maxWork??200000000,1,200000000)};
 // heightInterpretation 'engraveDepth': authored heights above the (lowest, boundary-pinned) baseline are cut depths.
 // Only emitted when explicit, so existing emboss/engrave fingerprints are unchanged.
 if(options.heightInterpretation!==undefined&&options.heightInterpretation!=='signed'){if(options.heightInterpretation!=='engraveDepth')fail('PARAM_SCHEMA_INVALID','heightInterpretation must be signed or engraveDepth');if(options.mode!=='engrave')fail('PARAM_SCHEMA_INVALID','engraveDepth requires mode engrave');result.heightInterpretation='engraveDepth';}
 if(options.controlMaxMm!==undefined){if(typeof options.controlMaxMm!=='number'||!Number.isFinite(options.controlMaxMm)||options.controlMaxMm<0||options.controlMaxMm>20)fail('PARAM_RANGE_INVALID','controlMaxMm must be 0–20 mm');result.controlMaxMm=options.controlMaxMm;}
 return result;
}
export function prepareReliefDesignFit(draft,solved,options,capacity){
 const canonical=validateReliefDesign(draft),effective=normalizeReliefDesignFitOptions(options,capacity),f=solved?.field;
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
 // Fingerprints keep the authored field; only the numerical input is mirrored about the baseline.
 const {heightInterpretation,...coreOptions}=effective,fitField=heightInterpretation==='engraveDepth'?{...field,heightsMm:field.heightsMm.map(h=>2*baselineMm-h)}:field;
 return {input:{...coreOptions,field:fitField,domain,baselineMm,maxControlPoints:4225},options:effective,
  source:{draftFingerprint:contractHash(canonical),fieldFingerprint:contractHash({field,domain,baselineMm,centerMm:[cx,cy]}),optionsFingerprint:contractHash(effective),centerMm:[cx,cy],baselineMm}};
}
export function fitReliefDesignField(draft,solved,options){
 const prepared=prepareReliefDesignFit(draft,solved,options),raw=fitMaskedReliefBSpline(prepared.input);
 // Public readback must survive JSON serialization without typed-array objects.
 const fit={...raw,controlHeightsMm:Array.from(raw.controlHeightsMm),controlDeltasMm:Array.from(raw.controlDeltasMm),lockedControlMask:Array.from(raw.lockedControlMask),sourceMasks:{active:Array.from(raw.sourceMasks.active),fixedMask:Array.from(raw.sourceMasks.fixedMask)}};
 const precisionMm=solved?.report?.precision?.machiningPrecisionMm??draft?.fieldSettings?.machiningPrecisionMm??.05,worst=raw.report?.metrics?.independent?.maxMm??raw.metrics?.independent?.maxMm;
 fit.precision={machiningPrecisionMm:precisionMm,independentMaxMm:worst,withinPrecision:Number.isFinite(worst)&&worst<=precisionMm,guidance:'acceptanceToleranceMm 建议不大于加工精度；超出时细节将按精度被平滑'};
 return {fit,options:prepared.options,source:prepared.source,geometryReady:false,brepComputed:false,commitState:'notCommitted'};
}
// Services-first fit (261022-05): when Services advertises relief.design-fit-brep-1 the first full fit runs
// there (high resolution) at preview; the browser does NOT have to fit first. This provisional control net
// only drives the binding/low-res browser preview: control deltas are the solved field sampled at uniform
// control positions, and every control whose (±2 spans) support touches an inactive or fixed field node is
// locked to zero. It is never installed as geometry on its own — if Services is unavailable or fails, the
// route blocks and asks for a browser fit (fallback) instead of applying this net.
export function provisionalServicesFit(draft,solved,options){
 const prepared=prepareReliefDesignFit(draft,solved,options),F=prepared.input.field,nx=Math.min(65,F.columns,Math.max(prepared.options.controlColumns,F.columns)),ny=Math.min(65,F.rows,Math.max(prepared.options.controlRows,F.rows));
 const sign=prepared.options.mode==='engrave'?-1:1,base=prepared.input.baselineMm,w=F.widthMm,h=F.heightMm,C=F.columns,R=F.rows;
 const hx=w/Math.max(1,nx-3),hy=h/Math.max(1,ny-3),deltas=new Array(nx*ny).fill(0),locked=new Array(nx*ny).fill(0);
 const at=(x,y)=>{const u=Math.min(C-1,Math.max(0,(x/w+.5)*(C-1))),v=Math.min(R-1,Math.max(0,(y/h+.5)*(R-1))),i=Math.min(C-2,Math.floor(u)),j=Math.min(R-2,Math.floor(v)),a=u-i,b=v-j,H=F.heightsMm;
  return (1-b)*((1-a)*H[j*C+i]+a*H[j*C+i+1])+b*((1-a)*H[(j+1)*C+i]+a*H[(j+1)*C+i+1]);};
 let worst=0;
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i,x=-w/2+i*w/(nx-1),y=-h/2+j*h/(ny-1);
  let lock=false;for(let q=0;q<R&&!lock;q++){const fy=-h/2+q*h/(R-1);if(Math.abs(fy-y)>2*hy)continue;for(let p=0;p<C;p++){const fx=-w/2+p*w/(C-1);if(Math.abs(fx-x)<=2*hx&&(!F.active[q*C+p]||F.fixedMask[q*C+p])){lock=true;break;}}}
  if(lock){locked[k]=1;continue;}
  const d=Math.max(0,sign*(at(x,y)-base));deltas[k]=sign*Math.min(prepared.options.controlMaxMm??20,d);}
 for(let k=0;k<C*R;k++)if(F.active[k]&&!F.fixedMask[k])worst=Math.max(worst,Math.abs(F.heightsMm[k]-base));
 const fit={kind:'webcad-masked-baseline-bspline-v1',columns:nx,rows:ny,widthMm:w,heightMm:h,baselineMm:base,mode:prepared.options.mode,
  controlHeightsMm:deltas.map(d=>base+d),controlDeltasMm:deltas,domain:prepared.input.domain,sourceMasks:{active:Array.from(F.active),fixedMask:Array.from(F.fixedMask)},lockedControlMask:locked,
  report:{status:'services-first-provisional',provisional:true,acceptanceToleranceMm:prepared.options.acceptanceToleranceMm,
   // Not a fit: deviation bound of the provisional net is the authored peak; Services reports the real metrics.
   metrics:{training:{maxMm:worst},independent:{maxMm:worst},protection:{maxMm:0}},deviationKind:'sampled-not-global',brepComputed:false,commitState:'notCommitted'}};
 return {fit,options:prepared.options,source:prepared.source,provisional:true,geometryReady:false,brepComputed:false,commitState:'notCommitted'};
}
