// Relief first-pass pipeline contracts (261022-03).
// Architecture: the first full computation (image conversion, machining-precision smoothing,
// field -> fit -> BRep) belongs on the Services server; the browser only fine-tunes/previews.
// The server code is not in this repository yet, so this module defines the request/response
// contracts, a routing decision and a browser fallback built from the SAME pure modules the
// server must run (convert.js, relief-design-field.js, relief-design-fit.js). Nothing here does I/O
// unless a caller injects a Services `submit` function.
import {contractHash} from '../contracts/operation-schema.js';
import {convertRgbaToHeightGrid,normalizeConvertSettings,RELIEF_CONVERT_VERSION} from '../relief-source/convert.js';
import {solveReliefDesign,MACHINING_PRECISION_DEFAULT_MM} from '../relief-design-field.js';
import {fitReliefDesignField} from '../relief-design-fit.js';
import {validateReliefDesign} from '../relief-design-drafts.js';

export const RELIEF_PIPELINE_CONTRACTS=Object.freeze({
 sourceConvert:'relief.source-convert-1',
 designFitBrep:'relief.design-fit-brep-1'
});
export const RELIEF_PRECISION_LIMITS=Object.freeze({minMm:.01,maxMm:.5,defaultMm:MACHINING_PRECISION_DEFAULT_MM});
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};

// relief.source-convert-1 request: {contract,version,source:{sha256,width,height,encoding:'rgba8',bytesBase64?|resourceId?},settings}
export function sourceConvertRequest({sha256,width,height,settings,resourceId}){
 if(!/^[a-f0-9]{64}$/.test(sha256??''))fail('PARAM_SCHEMA_INVALID','source.sha256 必须是 64 位十六进制');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)fail('PARAM_SCHEMA_INVALID','source 尺寸无效');
 const s=normalizeConvertSettings(settings);
 const body={contract:RELIEF_PIPELINE_CONTRACTS.sourceConvert,convertVersion:RELIEF_CONVERT_VERSION,source:{sha256,width,height,encoding:'rgba8',...(resourceId?{resourceId}:{})},settings:s};
 return {...body,requestHash:contractHash(body)};
}
// relief.design-fit-brep-1 request: draft (incl. fieldSettings.machiningPrecisionMm), fit options, target/placement/datum/intent.
export function designFitBrepRequest({draft,fitOptions,target,placement,datum,machiningIntent}){
 const d=validateReliefDesign(draft),p=d.fieldSettings?.machiningPrecisionMm??RELIEF_PRECISION_LIMITS.defaultMm;
 if(!(p>=RELIEF_PRECISION_LIMITS.minMm&&p<=RELIEF_PRECISION_LIMITS.maxMm))fail('PARAM_SCHEMA_INVALID','machiningPrecisionMm 须在 0.01–0.5 mm');
 const body={contract:RELIEF_PIPELINE_CONTRACTS.designFitBrep,draft:d,machiningPrecisionMm:p,fitOptions,...(target?{target}:{}),...(placement?{placement}:{}),...(datum?{datum}:{}),...(machiningIntent?{machiningIntent}:{})};
 return {...body,requestHash:contractHash(body)};
}
// Response contract (both contracts): {contract,requestHash,status:'completed'|'failed',executedOn:'services'|'browser-fallback',result?,error?}
export function validatePipelineResponse(request,response){
 if(!response||response.contract!==request.contract||response.requestHash!==request.requestHash)fail('SERVICES_RESPONSE_INVALID','Services 响应与请求不对应（contract/requestHash）');
 if(!['completed','failed'].includes(response.status))fail('SERVICES_RESPONSE_INVALID','Services 响应状态无效');
 if(response.status==='completed'&&!response.result)fail('SERVICES_RESPONSE_INVALID','Services 完成响应缺少 result');
 return response;
}
// Routing: Services first for the first full computation; browser only as an explicit fallback.
export function routeReliefPipeline({servicesAvailable,stage='first-pass'}={}){
 if(stage==='fine-tune')return {target:'browser',reason:'浏览器只做微调和预览'};
 return servicesAvailable?{target:'services',reason:'首次完整计算在 Services 服务器执行'}:{target:'browser-fallback',reason:'Services 尚不可用（服务器代码未接入），使用相同纯函数在浏览器小尺寸回退计算'};
}
// Local executor = the reference implementation the server must reproduce bit-for-bit (same modules).
export function runSourceConvertLocally(request,rgba){
 const g=convertRgbaToHeightGrid(rgba,request.source.width,request.source.height,request.settings);
 return {contract:request.contract,requestHash:request.requestHash,status:'completed',executedOn:'browser-fallback',result:{columns:g.columns,rows:g.rows,values:g.values,settingsHash:g.settingsHash}};
}
export function runDesignFitLocally(request){
 const solved=solveReliefDesign(request.draft),fit=fitReliefDesignField(request.draft,solved,request.fitOptions);
 return {contract:request.contract,requestHash:request.requestHash,status:'completed',executedOn:'browser-fallback',result:{solved,fit}};
}
export async function runReliefPipeline(request,{submit,servicesAvailable=!!submit,local}){
 const route=routeReliefPipeline({servicesAvailable});
 if(route.target==='services'){try{return validatePipelineResponse(request,await submit(request));}catch(error){if(error?.code==='SERVICES_RESPONSE_INVALID')throw error;return {...await local(request),fallbackReason:'Services 失败：'+(error?.message??error)};}}
 return {...await local(request),fallbackReason:route.reason};
}

// ---- 261022-04: Services worker payloads (native occt-worker operations) ----
// relief.design-fit-brep-1 worker params = exactly the numerical input the browser fit consumes
// (prepareReliefDesignFit) + the geometric binding. The server fits at its larger capacity
// (field ≤257², controls ≤129²) and replaces the selected face with the fitted surface.
import {prepareReliefDesignFit as prepareFitInput} from '../relief-design-fit.js';
import {binaryHash as rawHash} from '../contracts/operation-schema.js';
export const RELIEF_SERVICES_OPERATIONS=Object.freeze({
 designFitBrep:{operation:'reliefDesign',semanticVersion:'relief.design-fit-brep-1',strategy:'masked-bspline-face-replacement'},
 sourceConvert:{operation:'reliefSourceConvert',semanticVersion:'relief.source-convert-1',strategy:'rgba-area-average'}
});
export function designFitWorkerParams({draft,solved,fitOptions,placement,faceIntent}){
 const prepared=prepareFitInput(draft,solved,fitOptions),{field,domain,baselineMm,maxControlPoints,maxWork,...fit}=prepared.input; // server applies its own work budget
 if(!placement||!Array.isArray(placement.originMm)||!Array.isArray(placement.xDirection))fail('RELIEF_DESIGN_PLACEMENT_REQUIRED','请明确给出图案中心和X方向');
 if(!faceIntent||faceIntent.kind!=='planar-face-geometric-intent')fail('RELIEF_DESIGN_TARGET_REQUIRED','需要平面选面意图（point+normal）');
 const params={field:{...field,heightsMm:Array.from(field.heightsMm),active:Array.from(field.active),fixedMask:Array.from(field.fixedMask)},domain,baselineMm,fit,placement:{originMm:[...placement.originMm],xDirection:[...placement.xDirection]}};
 // faceIntent is non-enumerable: the public Services request carries it as selectionIntent (C# injects it
 // into the worker params); direct worker runs read it from here.
 Object.defineProperty(params,'faceIntent',{value:faceIntent,enumerable:false});
 return {params,source:prepared.source,options:prepared.options};
}
// Browser re-verification of a Services fit result (never trusts the server blindly):
// 1) control hash recomputed from returned deltas, 2) locked controls exactly zero,
// 3) the returned controls re-sampled at every active field node reproduce the field within tolerance.
import {sampleMaskedReliefBSpline} from '../relief-design-core/masked-bspline-fit.mjs';
export function controlDeltasSha256(deltas){const f=Float64Array.from(deltas);return rawHash(new Uint8Array(f.buffer)).slice(7);}
export function verifyServicesFit(params,report){
 const r=report?.reliefDesign?.fit;if(!r)fail('SERVICES_RESPONSE_INVALID','Services 结果缺少拟合数据');
 // Binary controls survive .NET Framework JSON floating-point parse/serialization exactly.
 // Keep the numeric array for legacy clients; verify and sample the authoritative f64le payload.
 let deltas=r.controlDeltasMm;
 if(r.controlDeltasF64LE!==undefined){
  if(typeof r.controlDeltasF64LE!=='string'||r.controlDeltasF64LE.length>129*129*12)fail('SERVICES_RESPONSE_INVALID','Services 控制网格二进制大小无效');
  let bytes;try{bytes=Uint8Array.from(atob(r.controlDeltasF64LE),c=>c.charCodeAt(0));}catch{fail('SERVICES_RESPONSE_INVALID','Services 控制网格二进制编码无效');}
  if(bytes.length!==params.fit.controlColumns*params.fit.controlRows*8)fail('SERVICES_RESPONSE_INVALID','Services 控制网格二进制长度无效');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);deltas=Array.from({length:bytes.length/8},(_,i)=>view.getFloat64(i*8,true));
 }
 if(!Array.isArray(deltas)||deltas.length!==params.fit.controlColumns*params.fit.controlRows||deltas.some(v=>!Number.isFinite(v)))fail('SERVICES_RESPONSE_INVALID','Services 控制网格数值无效');
 if(controlDeltasSha256(deltas)!==r.controlDeltasSha256)fail('SERVICES_RESPONSE_INVALID','Services 拟合控制哈希与数据不符');
 if(r.columns!==params.fit.controlColumns||r.rows!==params.fit.controlRows||r.widthMm!==params.field.widthMm||r.heightMm!==params.field.heightMm)fail('SERVICES_RESPONSE_INVALID','Services 拟合网格与请求不符');
 r.lockedControlMask.forEach((l,k)=>{if(l&&deltas[k]!==0)fail('SERVICES_RESPONSE_INVALID','Services 锁定控制点不为零');});
 const f=params.field,sign=params.fit.mode==='emboss'?1:-1,fit={kind:'webcad-masked-baseline-bspline-v1',columns:r.columns,rows:r.rows,widthMm:r.widthMm,heightMm:r.heightMm,controlHeightsMm:deltas.map(d=>params.baselineMm+d)};
 let maxMm=0;const step=Math.max(1,Math.floor(f.columns/33));
 for(let j=0;j<f.rows;j+=step)for(let i=0;i<f.columns;i+=step){const k=j*f.columns+i;if(!f.active[k])continue;const x=(i/(f.columns-1)-.5)*f.widthMm,y=(j/(f.rows-1)-.5)*f.heightMm;maxMm=Math.max(maxMm,Math.abs(sampleMaskedReliefBSpline(fit,x,y)-f.heightsMm[k]));}
 if(maxMm>params.fit.acceptanceToleranceMm+1e-9)fail('SERVICES_RESPONSE_INVALID',`Services 拟合复核偏差 ${maxMm.toFixed(4)} mm 超过容差`);
 return {verified:true,controlDeltasSha256:r.controlDeltasSha256,resampledMaxMm:maxMm,sign};
}
// relief.source-convert-1 worker params (raw RGBA8 asset + normalized settings + optional mm precision).
import {applyMachiningPrecision as precisionSmooth} from '../relief-design-field.js';
import {encodeHeightGrid} from '../relief-source/convert.js';
export function sourceConvertWorkerParams({width,height,settings,depthMm,machiningPrecisionMm}){
 const s=normalizeConvertSettings(settings),params={width,height,settings:s};
 if(depthMm!==undefined){if(!(depthMm>0&&depthMm<=20))fail('PARAM_RANGE_INVALID','depthMm 需要 0–20');params.depthMm=depthMm;const p=machiningPrecisionMm??RELIEF_PRECISION_LIMITS.defaultMm;if(!(p>=RELIEF_PRECISION_LIMITS.minMm&&p<=RELIEF_PRECISION_LIMITS.maxMm))fail('PARAM_SCHEMA_INVALID','machiningPrecisionMm 须在 0.01–0.5 mm');params.machiningPrecisionMm=p;}
 return params;
}
// Browser reference for relief.source-convert-1 (same modules; the golden test compares grid sha256).
export function sourceConvertLocal(rgba,params){
 const g=convertRgbaToHeightGrid(rgba,params.width,params.height,params.settings);let values=g.values,precision=null;
 if(params.depthMm!==undefined){const d=params.depthMm,n=g.columns*g.rows,f={heightsMm:Float64Array.from(values,v=>v*d),active:new Uint8Array(n).fill(1),fixedMask:new Uint8Array(n)};
  precision=precisionSmooth(f,{columns:g.columns,rows:g.rows,lowerMm:0,upperMm:d,precisionMm:params.machiningPrecisionMm});values=Float64Array.from(f.heightsMm,v=>v/d);}
 return {grid:encodeHeightGrid({columns:g.columns,rows:g.rows,values}),precision};
}
// Acceptance tolerance: never stricter than what the user accepted in the browser fit (the server, with at
// least as many controls, must match or beat it), never below 0.1 mm or 2× machining precision.
// Services plan for a committed relief feature carrying a designBinding (261022-04 client wiring).
// The authored draft is the recipe: it is re-solved here (cheap, same modules) and the solved field
// goes to Services, which fits at a higher control resolution and replaces the face exactly.
import {contractHash as recipeHash} from '../contracts/operation-schema.js';
import {decodeU8} from '../modeling/manufacturing/relief-design-binding.js';
// A point guaranteed on the support face's material: the active, unfixed field cell (all 8 neighbours active)
// nearest the pattern centre. The placement origin itself may sit in a real hole (hole-aligned designs).
export function faceIntentPoint(binding){
 const f=binding.field,n=f.columns*f.rows,active=decodeU8(f.active,n,'active'),fixed=decodeU8(f.fixedMask,n,'fixedMask');
 const o=binding.placement.originMm,x=binding.placement.xDirection,nz=binding.support.normal,y=[nz[1]*x[2]-nz[2]*x[1],nz[2]*x[0]-nz[0]*x[2],nz[0]*x[1]-nz[1]*x[0]];
 let best=null;
 for(let j=1;j<f.rows-1;j++)for(let i=1;i<f.columns-1;i++){const k=j*f.columns+i;if(!active[k]||fixed[k])continue;let ok=true;for(let dj=-1;dj<=1&&ok;dj++)for(let di=-1;di<=1;di++)if(!active[k+dj*f.columns+di]){ok=false;break;}if(!ok)continue;
  const u=(i/(f.columns-1)-.5)*f.widthMm,v=(j/(f.rows-1)-.5)*f.heightMm,d=u*u+v*v;if(!best||d<best.d)best={d,u,v};}
 if(!best)fail('RELIEF_DESIGN_BINDING_INVALID','拟合绑定没有可用于定位选面的内部单元');
 return o.map((c,a)=>c+best.u*x[a]+best.v*y[a]);
}
export function servicesControlResolution(fieldSide,browserControls=0){return Math.min(129,fieldSide,Math.max(4,browserControls,Math.ceil((fieldSide+1)/2)));}
export function reliefDesignServicesPlan(document,feature){
 const b=feature?.params?.designBinding;if(!b)fail('RELIEF_DESIGN_BINDING_INVALID','缺少拟合绑定');
 const entry=(document.reliefDesigns||[]).find(d=>d.id===b.audit?.designId);
 if(!entry)fail('RELIEF_DESIGN_STALE','拟合绑定引用的设计草稿不存在；请重新拟合');
 const draft=validateReliefDesign(entry.draft);if(recipeHash(draft)!==b.audit.draftFingerprint)fail('RELIEF_DESIGN_STALE','设计草稿已修改，拟合绑定失效；请重新求解并拟合');
 const solved=solveReliefDesign(draft),f=solved.field,first=b.audit.servicesFirstFit,n=first?Math.min(129,f.columns,f.rows):servicesControlResolution(Math.min(f.columns,f.rows),Math.max(b.controls.columns??0,b.controls.rows??0)),range=draft.heightRangeMm[1]-draft.heightRangeMm[0];
 const precision=draft.fieldSettings?.machiningPrecisionMm??RELIEF_PRECISION_LIMITS.defaultMm;
 const fitOptions={mode:b.controls.mode,controlColumns:n,controlRows:n,controlMaxMm:Math.min(20,Math.abs(range)),acceptanceToleranceMm:Math.min(20,first?Math.max(.1,2*precision,first.acceptanceToleranceMm):Math.max(.1,2*precision,Math.ceil(1.05*Math.max(b.audit.metrics?.trainingMaxMm??0,b.audit.metrics?.independentMaxMm??0)*100)/100)),maxIterations:50000};
 const {params}=designFitWorkerParams({draft,solved,fitOptions,placement:b.placement,faceIntent:{kind:'planar-face-geometric-intent',point:faceIntentPoint(b),normal:[...b.support.normal]}});
 return {semanticVersion:RELIEF_SERVICES_OPERATIONS.designFitBrep.semanticVersion,paramsFingerprint:recipeHash(feature.params),params,faceIntent:params.faceIntent,controls:n,field:{columns:f.columns,rows:f.rows}};
}
// ---- 261022-05: Services-first helpers (browser side) ----
import {getServicesConfig} from './settings.js';
import {servicesClient} from './client.js';
import {VERIFIED_NATIVE_KERNELS,LOCAL_KERNEL_BUILD_ID} from './geometry-exchange.js';
import {binaryHash as gridHash} from '../contracts/operation-schema.js';
// True only when Services is configured AND advertises the exact operation (and, for BRep results, a verified
// producer/consumer kernel pair). Any error means "not ready" -> browser fallback.
export async function reliefServicesReady(operation,{client=servicesClient,config=null}={}){
 try{const c=config??getServicesConfig();if(!c.configured)return false;
  const caps=await client.capabilities(),op=caps.operations?.find(o=>o.operation===operation&&o.enabled!==false);if(!op)return false;
  if(operation==='reliefSourceConvert')return true;
  return VERIFIED_NATIVE_KERNELS.has(op.kernelBuildId)&&!!caps.geometryExchange?.testedKernelPairs?.some(p=>p.producerKernelBuildId===op.kernelBuildId&&p.consumerKernelBuildId===LOCAL_KERNEL_BUILD_ID);
 }catch{return false;}
}
// relief.source-convert-1 on Services: upload RGBA as a raster asset, run the native conversion (with machining
// precision smoothing), fetch the grid artifact and re-verify its encoding hash + dimensions in the browser.
export async function convertSourceOnServices({rgba,params,context,imageSha256,client=servicesClient,signal}){
 const S=RELIEF_SERVICES_OPERATIONS.sourceConvert,asset=await client.upload(new File([rgba],'image.rgba'),{kind:'raster'});
 const requestId=crypto.randomUUID(),payload={requestId,documentId:context.documentId,documentInstanceId:context.documentInstanceId,expectedRevision:context.revision??context.expectedRevision,featureId:'relief-source-'+imageSha256.slice(0,16),
  operation:S.operation,schemaVersion:'1.0',semanticVersion:S.semanticVersion,strategy:S.strategy,inputs:[{assetId:asset.assetId,sha256:asset.sha256,role:'source',sourceFeatureId:'image-'+imageSha256.slice(0,16)}],
  placementSnapshot:null,selectionIntent:{kind:'whole-source'},params,requiredResultFormat:'relief-height-grid-u16le-v1',recipeFingerprint:'relief-source:'+contractHashOf({imageSha256,params})};
 const job=await client.submit('compute/jobs',payload,requestId),done=await client.wait(job,{signal});
 const grid=done.result?.grid;
 if(!grid||grid.columns!==params.settings.columns||grid.rows!==params.settings.rows)fail('SERVICES_RESPONSE_INVALID','Services 高度网格尺寸与请求不一致');
 const bytes=Uint8Array.from(atob(grid.data),c=>c.charCodeAt(0));if(bytes.length!==grid.columns*grid.rows*2||gridHash(bytes).slice(7)!==grid.sha256.replace(/^sha256:/,''))fail('SERVICES_RESPONSE_INVALID','Services 高度网格编码哈希不一致');
 return {grid,precision:done.result.precision??null,jobId:job.jobId,timings:done.manifest?.timings??null};
}
function contractHashOf(v){return recipeHash(v).replace(/^sha256:/,'');}
