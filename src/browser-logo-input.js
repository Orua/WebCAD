import {humanError} from './error-recovery.js';
import { validateRegions } from './logo-model.js';
import { parseLocalLogoSvg } from './svg-logo-input.js';
import {getServicesConfig} from './services/settings.js';
import {servicesClient} from './services/client.js';
import {binaryHash} from './contracts/operation-schema.js';
import {validateLogoRasterOptions} from './logo-raster-options.js';
import {logoDXF} from './logo-dxf.js';
import {createLogoReviewSession,renderedLogoRaster} from './logo-vector-review.js';
import {createLogoVectorReview} from './ui/logo-vector-review.js';
import {parseLocalLogoDxf} from './dxf-logo-input.js';

const inputError=(message,code='SIZE_LIMIT')=>Object.assign(new Error(message),{code});
function logoConversionError(error,{isRaster,raster}){
 if(isRaster)error.details={...(error.details||{}),rasterOptions:{threshold:raster?.threshold??128,invert:raster?.invert??false,alphaThreshold:raster?.alphaThreshold??1,smoothingPx:raster?.smoothingPx??0},rasterOptionsSupplied:raster!==undefined};
 else if(['UNSUPPORTED_RENDER_FEATURE','NO_VECTOR_CONTENT','FORMAT_VARIANT_UNSUPPORTED'].includes(error.code)){
  error.details={...(error.details||{}),rasterFallback:{enabled:false,code:'CAPABILITY_UNAVAILABLE',reason:'No controlled source-faithful vector-to-raster renderer is configured; original size, text, clipping and image placement cannot be guessed.'}};
  error.message+='；当前后台未提供保留原尺寸、文字和排版的受控栅格化能力，未自动改成位图。请从源软件按实际尺寸导出 PNG / BMP 后识别轮廓。';
 }
 return error;
}
async function sourceHash(text){return binaryHash(typeof text==='string'?new TextEncoder().encode(text):text).slice(7);}
export function logoInputKind(name){
 const value=String(name||'').toLowerCase(),ext=value.slice(value.lastIndexOf('.')+1);
 if(value.endsWith('.logo.json')||ext==='svg')return 'local';
 if(['png','jpg','jpeg','bmp'].includes(ext))return 'raster';
 if(['pdf','ai'].includes(ext))return 'paged-vector';
 return ext==='dxf'?'vector':'unsupported';
}
export function fitLogoWidth(logo,targetWidthMm){
 if(targetWidthMm===undefined)return logo;
 if(!(Number.isFinite(targetWidthMm)&&targetWidthMm>0))throw inputError('图案宽度必须大于 0 mm。','SIZE_REQUIRED');
 const points=logo.regions.flatMap(r=>r.outer),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(let i=0;i<xs.length;i++){minX=Math.min(minX,xs[i]);maxX=Math.max(maxX,xs[i]);minY=Math.min(minY,ys[i]);maxY=Math.max(maxY,ys[i]);}
 const width=maxX-minX,factor=targetWidthMm/width;if(!(width>0&&Number.isFinite(factor)))throw inputError('没有可缩放的有效 LOGO 轮廓。','INVALID_CONTOUR');
 const frame=logo.source?.rasterFrame,rasterFrame=frame?{...frame,...Object.fromEntries(['xMm','yMm','widthMm','heightMm','mmPerPixel'].map(key=>[key,frame[key]*factor]))}:undefined;
 const scaledReport=(report,keys)=>report?{...report,...Object.fromEntries(keys.filter(key=>Number.isFinite(report[key])).map(key=>[key,report[key]*factor]))}:report;
 const rasterSmoothing=scaledReport(logo.source?.rasterSmoothing,['requestedToleranceMm','effectiveToleranceMm','curveDistanceUpperBoundMm','coordinateRoundingMm']);
 const conversionReport=scaledReport(logo.source?.conversionReport,['requestedToleranceMm','approximationBoundMm']);
 const conversion=scaledReport(logo.source?.conversion,['requestedToleranceMm','approximationBoundMm']);
 // Preserve the converter's original contour bytes/frame and hash. Record its
 // explicit transform into the fitted logo instead of silently rewriting proof.
 const rasterOriginalContoursToLogo=logo.source?.rasterOriginalContours?{scale:(logo.source.rasterOriginalContoursToLogo?.scale??1)*factor,translationMm:[0,0],from:'converter-original-mm',to:'logo-mm'}:undefined;
 return {...logo,sizeMm:[targetWidthMm,(maxY-minY)*factor],regions:logo.regions.map(r=>({outer:r.outer.map(p=>p.map(v=>v*factor)),holes:(r.holes||[]).map(h=>h.map(p=>p.map(v=>v*factor)))})),source:{...(typeof logo.source==='object'?logo.source:{original:logo.source}),...(rasterFrame?{rasterFrame}:{}),...(rasterSmoothing?{rasterSmoothing}:{}),...(conversionReport?{conversionReport}:{}),...(conversion?{conversion}:{}),...(rasterOriginalContoursToLogo?{rasterOriginalContoursToLogo}:{}),widthNormalization:{basis:'contour-bounds',convertedWidthMm:width,requestedWidthMm:targetWidthMm,scale:factor}}};
}
export async function readBrowserLogo(file,validate,{targetWidthMm,page,sizeConfirmed=false,allowUpload=false,raster,pdfJoinToleranceMm,client=servicesClient}={}){
  if(!file)throw inputError('请选择 LOGO 文件','INVALID_INPUT');
  const name=file.name.toLowerCase();
  const isPaged=/\.(pdf|ai)$/.test(name);
  if(pdfJoinToleranceMm!==undefined&&(!Number.isFinite(pdfJoinToleranceMm)||pdfJoinToleranceMm<0||pdfJoinToleranceMm>0.1))throw inputError('pdfJoinToleranceMm 须为 0–0.1 mm 数值；PDF / AI 的 0 使用源宽度 × 0.0025 自动线接合规则，其他格式不应用。','PARAM_SCHEMA_INVALID');
  if(name.endsWith('.logo.json')){
    if(file.size>2*1024*1024)throw inputError('LOGO JSON 必须不超过 2 MiB。');
    const logo=validate(JSON.parse(await file.text()));validateRegions(logo);return fitLogoWidth(logo,targetWidthMm);
  }
  if(name.endsWith('.svg')){
    if(file.size>20*1024*1024)throw inputError('SVG 必须不超过 20 MiB。');
    const text=await file.text();try{const logo=validate(parseLocalLogoSvg(text,{name:file.name,targetWidthMm}));logo.source.sha256=await sourceHash(text);validateRegions(logo);return fitLogoWidth(logo,targetWidthMm);}catch(error){if(!allowUpload)throw inputError(`本地未能读取此 SVG：${error.message}。如需后台转换，请点击“识别轮廓”明确上传。`,'UPLOAD_AUTH_REQUIRED');}
  }
  if(name.endsWith('.dxf')){
    if(file.size>20*1024*1024)throw inputError('DXF 必须不超过 20 MiB。');
    const text=await file.text();try{const logo=validate(parseLocalLogoDxf(text,{name:file.name,targetWidthMm}));logo.source.sha256=await sourceHash(text);return fitLogoWidth(logo,targetWidthMm);}catch(error){if(error.code!=='LOCAL_VECTOR_UNSUPPORTED')throw error;}
  }
  if(/\.(svg|pdf|ai|dxf|png|jpe?g|bmp)$/.test(name)){
    if(file.size>20*1024*1024)throw inputError('LOGO 源文件必须不超过 20 MiB。');
    if(client===servicesClient&&!getServicesConfig().configured)throw inputError('请在“计算设置”启用后台计算，然后重新识别图片。','CAPABILITY_UNAVAILABLE');
    if(!allowUpload)throw inputError('识别此文件需要上传到已配置的后台计算，请明确允许上传。','UPLOAD_AUTH_REQUIRED');
    const isRaster=/\.(png|jpe?g|bmp)$/.test(name);
    if(raster!==undefined&&!isRaster&&!isPaged)throw inputError('raster 选项只用于位图或 PDF／AI 栅格回退。','PARAM_SCHEMA_INVALID');
    validateLogoRasterOptions(raster);
    if(!sizeConfirmed||isRaster&&!(Number.isFinite(targetWidthMm)&&targetWidthMm>0))throw inputError('请填写图案实际宽度（mm）；图片像素不能作为毫米尺寸。','SIZE_REQUIRED');
    if(targetWidthMm!==undefined&&!(Number.isFinite(targetWidthMm)&&targetWidthMm>0))throw inputError('图案宽度必须大于 0 mm。','SIZE_REQUIRED');
    const capabilities=await client.capabilities();if(!capabilities.logo?.enabled)throw inputError('后台未启用图片轮廓转换。','CAPABILITY_UNAVAILABLE');
    const asset=await client.upload(file),requestId=crypto.randomUUID();
    const inspectOptions={...(page?{page}:{}),...(isPaged?{pdfJoinToleranceMm:pdfJoinToleranceMm??0,...(targetWidthMm?{targetWidthMm}:{})}:{})};
    let inspected;try{inspected=await client.wait(await client.submit('logo/inspect',{assetId:asset.assetId,options:inspectOptions},`${requestId}-inspect`));}catch(error){throw logoConversionError(error,{isRaster,raster});}
    if(inspected.result.pageCount>1&&!page)throw inputError(`源文件有 ${inspected.result.pageCount} 页，请指定页码。`,'PAGE_REQUIRED');
    const options={mode:isRaster?'raster':'vector',sizeMode:targetWidthMm?'targetWidth':'sourceUnits',sizeConfirmed:true,toleranceMm:0.005,pdfJoinToleranceMm:isPaged?pdfJoinToleranceMm??0:0,...(page?{page}:{}),...(targetWidthMm?{targetWidthMm}:{}),...((isRaster||isPaged)&&raster?{raster}:{})};
    let converted;
    try{converted=await client.wait(await client.submit('logo/convert',{assetId:asset.assetId,options},`${requestId}-convert`));}
    catch(error){throw logoConversionError(error,{isRaster,raster});}
    const {result,manifest}=converted;
    if(!result.geometryValid||!result.logoDocument||!['ready','needsReview'].includes(result.status))throw inputError('后台没有返回有效的闭合轮廓。','CONVERSION_FAILED');
    const logo=validate(result.logoDocument);validateRegions(logo);renderedLogoRaster(logo);
    logo.source={...logo.source,reviewed:false,reviewRequired:result.reviewRequired,conversionReport:result.conversionReport,inspectionReport:inspected.result,servicesEvidence:{jobId:manifest.jobId,inputFingerprint:manifest.inputFingerprint,artifactSha256:manifest.artifactSha256,artifactId:manifest.artifactId,assetId:asset.assetId,sourceSha256:asset.sha256,inspectionJobId:inspected.manifest?.jobId}};
    return fitLogoWidth(logo,targetWidthMm);
  }
  throw inputError('LOGO 支持 SVG、LOGO JSON、PDF、AI、DXF、PNG、JPG、BMP。照片或明暗参考图不能直接当作精确雕刻轮廓。','CAPABILITY_UNAVAILABLE');
}
let activeWizard=null;
export function getLogoWizardState(){return activeWizard?.element.isConnected?activeWizard.get():{open:false};}
// Trusted page adapter only: File/session references never enter public JSON state.
export function getLogoWizardReviewBinding(){return activeWizard?.element.isConnected?activeWizard.binding():null;}
export function refreshLogoWizardReview(reviewSession){if(activeWizard?.element.isConnected)activeWizard.refresh(reviewSession);}
export async function actLogoWizard(input){
 if(!activeWizard?.element.isConnected)throw inputError('请先打开 LOGO 雕刻向导。','LOGO_WIZARD_CLOSED');
 return activeWizard.act(input);
}
export function createLogoImportUI({onLogo,onInvalidate,validateLogoDocument,logoSummary,initialLogo=null}){
 if(typeof window!=='undefined')import('./ui/logo-vector-review.css');
 const el=(tag,attrs={},text)=>{const node=document.createElement(tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text)node.textContent=text;return node;};
 const host=el('section',{class:'logo-import-ui'}),input=el('input',{type:'file',accept:'.logo.json,.svg,.pdf,.ai,.dxf,.png,.jpg,.jpeg,.bmp','aria-label':'选择 LOGO 文件'}),label=el('label',{},'选择图片或矢量文件'),error=el('p',{class:'form-error',role:'alert'}),summary=el('div'),route=el('p',{class:'property-footnote',role:'status'});
 label.append(input);
 const width=el('input',{type:'number',min:'0.000001',step:'any','aria-label':'图案实际宽度 mm',placeholder:'图案实际宽度（mm）'}),page=el('input',{type:'number',min:'1',step:'1',value:'1','aria-label':'PDF 或 AI 页码'}),pageField=el('label',{},'页码');pageField.append(page);pageField.hidden=true;
 const read=el('button',{type:'button',class:'primary'},'识别轮廓'),confirm=el('button',{type:'button',class:'primary'},'轮廓和尺寸正确，下一步'),change=el('button',{type:'button',class:'secondary'},'更换图片或尺寸'),download=el('button',{type:'button',class:'secondary','data-ui-action':'logoExport'},'下载轮廓 DXF');read.disabled=true;confirm.hidden=change.hidden=download.hidden=true;
 const advanced=el('details'),paste=el('textarea',{rows:'3','aria-label':'SVG 或闭合路径',placeholder:'粘贴 SVG 或闭合 path d'}),pasteRead=el('button',{type:'button',class:'secondary'},'读取矢量文字');
 advanced.append(el('summary',{},'粘贴矢量文字'),paste,pasteRead);
 const progress=el('ol',{class:'logo-wizard-progress','aria-label':'LOGO 向导步骤'}),steps=['选择来源','校对轮廓','选面雕刻'].map(text=>el('li',{},text));progress.append(...steps);
 const sourcePanel=el('div',{class:'logo-source-step'}),reviewPanel=el('div',{class:'logo-review-step'}),editorHost=el('div');
 const rasterDetails=el('details'),rasterFields=el('div',{class:'logo-raster-settings'}),threshold=el('input',{type:'number',min:'0',max:'255',step:'1',value:'128','aria-label':'位图灰度阈值'}),alpha=el('input',{type:'number',min:'0',max:'255',step:'1',value:'1','aria-label':'透明度阈值'}),invert=el('input',{type:'checkbox','aria-label':'反转前景'}),smoothing=el('input',{type:'number',min:'0',max:'0.5',step:'0.05',value:'0','aria-label':'轮廓平滑源像素'});
 for(const [text,control]of [['灰度阈值 · 0–255',threshold],['透明度阈值 · 0–255',alpha],['轮廓平滑 · 0–0.5 源像素',smoothing],['反转前景',invert]]){const field=el('label',control===invert?{class:'checkbox-field'}:{});field.append(el('span',{},text),control);rasterFields.append(field);}
 rasterDetails.append(el('summary',{},'位图识别参数'),rasterFields,el('p',{class:'property-footnote'},'平滑默认关闭；显式设置后保留孔和原轮廓，不删除小岛，拓扑检查失败则保留原稿。偏差上界相对二值像素轮廓，不代表原图重建误差。修改后须重新识别。'));rasterDetails.hidden=true;
 const back=el('button',{type:'button',class:'secondary'},'返回来源与识别参数');
 const pdfDetails=el('details'),pdfJoin=el('input',{type:'number',min:'0',max:'0.1',step:'0.001',value:'0','aria-label':'PDF 线接合公差 mm'}),pdfLabel=el('label',{class:'form-field'},'线接合公差 · mm');pdfLabel.append(pdfJoin);pdfDetails.append(el('summary',{},'PDF / AI 线接合参数'),pdfLabel,el('p',{class:'property-footnote'},'0：完整源宽度 × 0.0025 自动接合；正数：毫米覆盖（最大 0.1）。仅整理描边闭环和短折返，不是位图平滑；修复后仍须校对。'));pdfDetails.hidden=true;
 const reviewContent=el('div',{class:'logo-review-content'}),reviewFooter=el('div',{class:'logo-review-footer'});reviewContent.append(editorHost,summary);reviewFooter.append(confirm,download,back);
 sourcePanel.append(label,width,pageField,pdfDetails,rasterDetails,read,advanced);reviewPanel.append(reviewContent,reviewFooter);reviewPanel.hidden=true;
 host.append(progress,route,change,sourcePanel,error,reviewPanel);
 let generation=0,pending=null,busy=false,session=null,editor=null,imageUrl=null,wizardRevision=0,lastError=null,reviewBinding=null;
 const markStep=index=>steps.forEach((step,i)=>{if(i===index)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});markStep(0);
 const showConfirmed=value=>{for(const control of [label,width,pageField,read,summary,advanced])control.hidden=value;change.hidden=!value;if(!value)pageField.hidden=logoInputKind(input.files?.[0]?.name)!=='paged-vector';};
 const showSummary=logo=>{const full=logoSummary(logo),details=el('details');full.querySelector('svg')?.remove();summary.replaceChildren();const smoothing=logo.source?.rasterSmoothing;if(smoothing?.requestedTolerancePx>0){const rejected=smoothing.status==='rejected-topology';summary.append(el('p',{class:rejected?'error-text':'property-callout','aria-live':'polite'},rejected?'平滑未应用：候选会破坏轮廓拓扑，已保留原始像素轮廓。请校对原稿或返回修改。':smoothing.status==='unchanged'?'源转换已检查平滑参数，轮廓未发生变化；保留原始像素轮廓。':`源转换已按 ${smoothing.requestedTolerancePx} 像素平滑；相对二值边界偏差上界 ${Number(smoothing.curveDistanceUpperBoundMm).toPrecision(4)} mm。原始轮廓可读取，仍须校对。`));}details.append(el('summary',{},'来源与转换说明'),full);summary.append(details);};
 const clearImage=()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;};
 const detachReview=()=>{if(reviewBinding)reviewBinding.valid=false;reviewBinding=null;};
 const invalidate=async()=>{++generation;++wizardRevision;detachReview();pending=null;session=editor=null;clearImage();editorHost.replaceChildren();confirm.hidden=download.hidden=true;summary.replaceChildren();error.textContent='';lastError=null;showConfirmed(false);sourcePanel.hidden=false;reviewPanel.hidden=true;markStep(0);onLogo(null);await onInvalidate?.();};
 const reviewChanged=state=>{pending=state.logo;++wizardRevision;if(state.reviewRequired){onLogo(null);sourcePanel.hidden=true;reviewPanel.hidden=false;markStep(1);confirm.hidden=false;onInvalidate?.();}else{onLogo(pending);confirm.hidden=true;showConfirmed(true);sourcePanel.hidden=reviewPanel.hidden=true;markStep(2);}showSummary(pending);};
 const installReview=(logo,file,sharedSession)=>{
  const rendered=renderedLogoRaster(logo);
  detachReview();pending=logo;session=sharedSession??createLogoReviewSession(logo);reviewBinding={session,sourceFile:file??null,valid:true,info:null};clearImage();if(rendered)imageUrl=URL.createObjectURL(new Blob([rendered],{type:'image/png'}));else if(file&&logoInputKind(file.name)==='raster')imageUrl=URL.createObjectURL(file);
  editor=createLogoVectorReview({session,imageUrl,onChange:reviewChanged});editorHost.replaceChildren(editor.element);showSummary(logo);sourcePanel.hidden=true;reviewPanel.hidden=false;confirm.hidden=download.hidden=false;markStep(1);++wizardRevision;
 };
 const selectedWidth=()=>width.value.trim()?Number(width.value):undefined;
 const inspect=async(loader,{propagate=false,sourceFile=input.files?.[0]??null}={})=>{
  if(busy){if(propagate)throw inputError('正在读取来源，请等待原任务完成。','LOGO_WIZARD_BUSY');return;}
  busy=true;const token=++generation;detachReview();pending=null;session=editor=null;clearImage();editorHost.replaceChildren();confirm.hidden=download.hidden=true;summary.replaceChildren();error.textContent='';lastError=null;onLogo(null);read.disabled=pasteRead.disabled=true;input.disabled=width.disabled=page.disabled=paste.disabled=true;route.textContent='正在识别轮廓…';
  try{await onInvalidate?.();const logo=await loader();if(token!==generation||!host.isConnected){if(propagate)throw inputError('向导已关闭或来源已更换；未导入此结果。','LOGO_READ_CANCELLED');return;}installReview(logo,sourceFile);route.textContent='请核对字形、孔洞和毫米尺寸。照片、阴影图不能据明暗推断立体深度。';}
  catch(value){const failure=value instanceof Error?value:inputError(String(value),'LOGO_READ_FAILED');if(!failure.code)failure.code='LOGO_READ_FAILED';if(token===generation){error.textContent=humanError(failure);lastError={code:failure.code,message:failure.message,...Object.fromEntries(['jobId','idempotencyKey','details','stage','commitState'].filter(key=>failure[key]!==undefined).map(key=>[key,failure[key]]))};route.textContent='本次未导入轮廓；请按提示修改后重新识别。';}if(propagate)throw failure;}
  finally{busy=false;input.disabled=width.disabled=page.disabled=paste.disabled=false;read.disabled=!input.files?.[0];pasteRead.disabled=false;}
 };
 const rasterOptions=()=>({threshold:Number(threshold.value),alphaThreshold:Number(alpha.value),invert:invert.checked,smoothingPx:smoothing.value.trim()===""?NaN:Number(smoothing.value)});
 const readSelected=(allowUpload=false,options)=>{const file=input.files?.[0];if(!file){if(options?.propagate)throw inputError('请先选择来源文件，或用 readLogo 资源载入轮廓。','LOGO_SOURCE_REQUIRED');return;}return inspect(()=>readBrowserLogo(file,validateLogoDocument,{targetWidthMm:selectedWidth(),...(logoInputKind(file.name)==='paged-vector'?{page:Number(page.value),pdfJoinToleranceMm:Number(pdfJoin.value)}:{}),sizeConfirmed:Number.isFinite(selectedWidth())&&selectedWidth()>0,allowUpload:allowUpload===true,...(['raster','paged-vector'].includes(logoInputKind(file.name))?{raster:rasterOptions()}:{})}),options);};
 input.addEventListener('change',async()=>{await invalidate();const file=input.files?.[0];read.disabled=!file;const kind=logoInputKind(file?.name);pageField.hidden=pdfDetails.hidden=kind!=='paged-vector';rasterDetails.hidden=!['raster','paged-vector'].includes(kind);if(!file)return;if(kind==='local'||kind==='unsupported'){route.textContent='正在本地读取文件…';await readSelected(false);}else route.textContent=kind==='raster'?'黑白图：填写实际宽度后识别闭合轮廓。点击识别会上传此文件到已配置的后台。':kind==='paged-vector'?'优先提取矢量；含文字、图片或复杂绘制的页面自动转成底图识别，再校对轮廓。点击识别会上传到已配置后台。':'先尝试本地矢量读取；点击识别允许上传到已配置后台。';});
 read.addEventListener('click',()=>readSelected(true));
 download.addEventListener('click',()=>{if(!pending)return;try{const url=URL.createObjectURL(new Blob([logoDXF(pending)],{type:'application/dxf'})),link=document.createElement('a');link.href=url;link.download='logo.dxf';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}catch(value){error.textContent=humanError(value);}});
 for(const control of [width,page,paste,threshold,alpha,invert,pdfJoin,smoothing])control.addEventListener('input',invalidate);
 pasteRead.addEventListener('click',()=>{const text=paste.value;return inspect(async()=>{if(!text.trim())throw new Error('请粘贴 SVG 或闭合路径文字。');const logo=validateLogoDocument(parseLocalLogoSvg(text,{name:'pasted.svg',targetWidthMm:selectedWidth()}));logo.source.sha256=await sourceHash(text);validateRegions(logo);return fitLogoWidth(logo,selectedWidth());},{sourceFile:new File([text],'pasted.svg',{type:'image/svg+xml'})});});
 const accept=()=>{if(!session)throw inputError('请先读取并校对轮廓。','LOGO_REVIEW_REQUIRED');const state=session.act({action:'confirm',expectedRevision:session.get().revision,confirmed:true});pending=state.logo;onLogo(pending);confirm.hidden=true;showConfirmed(true);sourcePanel.hidden=reviewPanel.hidden=true;markStep(2);++wizardRevision;route.textContent='已确认 '+pending.sizeMm.map(v=>Number(v).toFixed(3)).join(' × ')+' mm；请选择目标面并设置雕刻深度。';return state;};
 confirm.addEventListener('click',()=>{try{accept();}catch(e){error.textContent=humanError(e);}});
 back.addEventListener('click',async()=>{await invalidate();route.textContent='修改来源或参数后，重新识别。';});
 change.addEventListener('click',async()=>{await invalidate();route.textContent='选择新图片，或修改宽度后重新识别。';});
 const get=()=>({open:true,revision:wizardRevision,step:busy?'reading':sourcePanel.hidden?reviewPanel.hidden?'target':'review':'source',busy,error:error.textContent||null,errorDetails:lastError?structuredClone(lastError):null,name:reviewBinding?.sourceFile?.name??input.files?.[0]?.name??null,logoId:reviewBinding?.info?.logoId??null,sourceResourceId:reviewBinding?.info?.sourceResourceId??null,sourceStatus:reviewBinding?.info?.sourceStatus??(reviewBinding?.sourceFile?'not-registered':'unavailable-original'),parameters:{targetWidthMm:selectedWidth()??null,page:Number(page.value),pdfJoinToleranceMm:Number(pdfJoin.value),raster:rasterOptions()},review:session?.get()??null});
 activeWizard={element:host,get,binding:()=>reviewBinding,refresh:shared=>{if(shared===session){if(!editor){editor=createLogoVectorReview({session,imageUrl,onChange:reviewChanged});editorHost.replaceChildren(editor.element);}editor.render();reviewChanged(session.get());}},act:async request=>{
  if(request.action==='get')return get();if(request.expectedRevision!==wizardRevision)throw inputError('LOGO 向导已变化，请读取最新 revision。','LOGO_REVIEW_STALE');
  if(busy)throw inputError('正在读取来源，请等待原任务完成。','LOGO_WIZARD_BUSY');
  if(request.action==='parameters'){
   const p=request.parameters||{};if(Object.keys(p).some(k=>!['targetWidthMm','page','raster','pdfJoinToleranceMm'].includes(k)))throw inputError('未知 LOGO 识别参数。','PARAM_SCHEMA_INVALID');
   if(p.targetWidthMm!==undefined&&!(Number.isFinite(p.targetWidthMm)&&p.targetWidthMm>0))throw inputError('图案宽度须大于0。','PARAM_SCHEMA_INVALID');if(p.page!==undefined&&(!Number.isInteger(p.page)||p.page<1))throw inputError('页码须为正整数。','PARAM_SCHEMA_INVALID');validateLogoRasterOptions(p.raster);
   if(p.pdfJoinToleranceMm!==undefined&&(!Number.isFinite(p.pdfJoinToleranceMm)||p.pdfJoinToleranceMm<0||p.pdfJoinToleranceMm>0.1))throw inputError('PDF 线接合公差须为 0–0.1 mm；0 为自动。','PARAM_SCHEMA_INVALID');
   await invalidate();if(p.targetWidthMm!==undefined)width.value=String(p.targetWidthMm);if(p.page!==undefined)page.value=String(p.page);if(p.pdfJoinToleranceMm!==undefined)pdfJoin.value=String(p.pdfJoinToleranceMm);if(p.raster){if(p.raster.threshold!==undefined)threshold.value=String(p.raster.threshold);if(p.raster.alphaThreshold!==undefined)alpha.value=String(p.raster.alphaThreshold);if(p.raster.invert!==undefined)invert.checked=p.raster.invert;if(p.raster.smoothingPx!==undefined)smoothing.value=String(p.raster.smoothingPx);}return get();
  }
  if(request.action==='read'){if(request.allowUpload!==undefined&&typeof request.allowUpload!=='boolean')throw inputError('allowUpload 必须为布尔值；后台上传须明确 true。','PARAM_SCHEMA_INVALID');await readSelected(request.allowUpload===true,{propagate:true});return get();}
  if(request.action==='back'){await invalidate();return get();}
  if(request.action==='load'){validateRegions(request.logo);const before=wizardRevision;await onInvalidate?.();if(wizardRevision!==before||!host.isConnected)throw inputError('向导在载入期间已变化，请读取当前草稿。','LOGO_REVIEW_STALE');onLogo(null);installReview(request.reviewSession?.get().logo??request.logo,request.sourceFile,request.reviewSession);return get();}
  if(request.action==='confirm'){if(request.confirmed!==true)throw inputError('须明确 confirmed:true 后导入雕刻。','LOGO_REVIEW_REQUIRED');accept();return get();}
  if(!editor||!session)throw inputError('请先读取轮廓。','LOGO_REVIEW_REQUIRED');
  editor.act({...request,expectedRevision:session.get().revision});return get();
 }};
 if(initialLogo){pending=initialLogo;session=createLogoReviewSession(initialLogo);reviewBinding={session,sourceFile:null,valid:true,info:null};showConfirmed(true);sourcePanel.hidden=reviewPanel.hidden=true;markStep(2);route.textContent='已保留确认过的 '+initialLogo.sizeMm.map(v=>Number(v).toFixed(3)).join(' × ')+' mm 轮廓。';}
 let mounted=host.isConnected;const dispose=()=>{++generation;clearImage();cleanup.disconnect();if(activeWizard?.element===host)activeWizard=null;};
 const cleanup=new MutationObserver(()=>{if(host.isConnected)mounted=true;else if(mounted)dispose();});cleanup.observe(document.body,{childList:true,subtree:true});host.disposeLogoImporter=dispose;
 return host;
}
