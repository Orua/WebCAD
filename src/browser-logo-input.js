import {fitLogoWidth} from './logo-width.js';
export {fitLogoWidth} from './logo-width.js';
import {validateLogoMachining,fitLogoToMachining} from './logo-machining-optimization.js';
import {humanError} from './error-recovery.js';
import { validateRegions,inspectLogoMachiningCapacity } from './logo-model.js';
import { parseLocalLogoSvg } from './svg-logo-input.js';
import {getServicesConfig} from './services/settings.js';
import {servicesClient} from './services/client.js';
import {binaryHash} from './contracts/operation-schema.js';
import {validateLogoRasterOptions} from './logo-raster-options.js';
import {logoDXF} from './logo-dxf.js';
import {createLogoReviewSession,renderedLogoRaster} from './logo-vector-review.js';
import {createLogoVectorReview} from './ui/logo-vector-review.js';
import {parseLocalLogoDxf} from './dxf-logo-input.js';
import {setLogoButtonIcon} from './ui/logo-icons.js';

const inputError=(message,code='SIZE_LIMIT')=>Object.assign(new Error(message),{code});
function logoConversionError(error,{isRaster,raster}){
 if(isRaster){
  const reasons={RASTER_TOPOLOGY_AMBIGUOUS:'这张位图的像素边界存在分叉，未能生成有效闭合轮廓。',CONTOUR_TOO_COMPLEX:'这张位图的轮廓数量、顶点或交叉检查量超过当前识别范围，无法完整识别。',NO_VECTOR_CONTENT:'当前黑白阈值下没有识别到图案。',MALFORMED_FILE:'这张位图无法解码，文件可能损坏或格式不符。',TYPE_MISMATCH:'文件实际格式与扩展名不符，无法读取此位图。',SELF_INTERSECTION:'这张位图生成的轮廓发生自交或自身接触，无法用于雕刻。',REGIONS_TOUCH_OR_OVERLAP:'这张位图生成的轮廓相交或重叠，无法用于雕刻。',INVALID_HOLE:'这张位图的孔洞与外轮廓冲突，无法用于雕刻。'};
  const reason=reasons[error.code]??'这张位图暂未识别成功。';
  const next=['SERVICES_CONNECTION_UNKNOWN','OBSERVATION_CANCELLED','KNOWN_INPUT_FAILED'].includes(error.code)?'请先查询原任务状态和具体错误，再继续操作。':error.code==='NO_VECTOR_CONTENT'?'请检查黑白阈值或反转前景后重新识别。':'请使用轮廓更清晰的原图或 SVG／DXF 矢量文件。';
  const effectiveRaster=raster===undefined||raster?.mode==='auto'?{mode:'auto'}:{mode:'manual',threshold:raster?.threshold??128,invert:raster?.invert??false,alphaThreshold:raster?.alphaThreshold??1,smoothingPx:raster?.smoothingPx??0};
  error.details={...(error.details||{}),logoFailure:{reason,next},rasterOptions:effectiveRaster,rasterOptionsSupplied:raster!==undefined};
 }
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
export async function readBrowserLogo(file,validate,{targetWidthMm,page,sizeConfirmed=false,allowUpload=false,raster,machining,pdfJoinToleranceMm,client=servicesClient,onProgress}={}){
  if(!file)throw inputError('请选择 LOGO 文件','INVALID_INPUT');
  validateLogoMachining(machining);
  const name=file.name.toLowerCase();
  const prepare=logo=>{onProgress?.('preparing');return fitLogoToMachining(fitLogoWidth(logo,targetWidthMm),machining);};
  const isPaged=/\.(pdf|ai)$/.test(name);
  if(pdfJoinToleranceMm!==undefined&&(!Number.isFinite(pdfJoinToleranceMm)||pdfJoinToleranceMm<0||pdfJoinToleranceMm>0.1))throw inputError('pdfJoinToleranceMm 须为 0–0.1 mm 数值；PDF / AI 的 0 使用源宽度 × 0.0025 自动线接合规则，其他格式不应用。','PARAM_SCHEMA_INVALID');
  if(name.endsWith('.logo.json')){
    if(file.size>2*1024*1024)throw inputError('LOGO JSON 必须不超过 2 MiB。');
    const logo=validate(JSON.parse(await file.text()));validateRegions(logo);return inspectLogoMachiningCapacity(logo).supported?fitLogoWidth(logo,targetWidthMm):prepare(logo);
  }
  if(name.endsWith('.svg')){
    if(file.size>20*1024*1024)throw inputError('SVG 必须不超过 20 MiB。');
    const text=await file.text();try{const logo=validate(parseLocalLogoSvg(text,{name:file.name,targetWidthMm}));logo.source.sha256=await sourceHash(text);validateRegions(logo);return prepare(logo);}catch(error){if(!allowUpload)throw inputError(`本地未能读取此 SVG：${error.message}。如需后台转换，请点击“识别轮廓”明确上传。`,'UPLOAD_AUTH_REQUIRED');}
  }
  if(name.endsWith('.dxf')){
    if(file.size>20*1024*1024)throw inputError('DXF 必须不超过 20 MiB。');
    const text=await file.text();try{const logo=validate(parseLocalLogoDxf(text,{name:file.name,targetWidthMm}));logo.source.sha256=await sourceHash(text);return prepare(logo);}catch(error){if(error.code!=='LOCAL_VECTOR_UNSUPPORTED')throw error;}
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
    onProgress?.('uploading');
    const asset=await client.upload(file),requestId=crypto.randomUUID();onProgress?.('processing');
    const inspectOptions={...(page?{page}:{}),...(isPaged?{pdfJoinToleranceMm:pdfJoinToleranceMm??0,...(targetWidthMm?{targetWidthMm}:{})}:{})};
    let inspected={result:{pageCount:1},manifest:null};if(!isRaster)try{inspected=await client.wait(await client.submit('logo/inspect',{assetId:asset.assetId,options:inspectOptions},`${requestId}-inspect`));}catch(error){throw logoConversionError(error,{isRaster,raster});}
    if(inspected.result.pageCount>1&&!page)throw inputError(`源文件有 ${inspected.result.pageCount} 页，请指定页码。`,'PAGE_REQUIRED');
    const options={mode:isRaster?'raster':'vector',sizeMode:targetWidthMm?'targetWidth':'sourceUnits',sizeConfirmed:true,toleranceMm:0.005,pdfJoinToleranceMm:isPaged?pdfJoinToleranceMm??0:0,...(page?{page}:{}),...(targetWidthMm?{targetWidthMm}:{}),...((isRaster||isPaged)&&raster?{raster}:{})};
    let converted;
    try{converted=await client.wait(await client.submit('logo/convert',{assetId:asset.assetId,options},`${requestId}-convert`));}
    catch(error){throw logoConversionError(error,{isRaster,raster});}
    const {result,manifest}=converted;
    if(!result.geometryValid||!result.logoDocument||!['ready','needsReview'].includes(result.status))throw inputError('后台没有返回有效的闭合轮廓。','CONVERSION_FAILED');
    const logo=validate(result.logoDocument);validateRegions(logo);renderedLogoRaster(logo);
    logo.source={...logo.source,reviewed:false,reviewRequired:result.reviewRequired,conversionReport:result.conversionReport,inspectionReport:inspected.result,servicesEvidence:{jobId:manifest.jobId,inputFingerprint:manifest.inputFingerprint,artifactSha256:manifest.artifactSha256,artifactId:manifest.artifactId,assetId:asset.assetId,sourceSha256:asset.sha256,...(inspected.manifest?.jobId?{inspectionJobId:inspected.manifest.jobId}:{})}};
    return prepare(logo);
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
 const rasterDetails=el('details'),rasterFields=el('div',{class:'logo-raster-settings'}),rasterMode=el('select',{'aria-label':'位图识别模式'}),threshold=el('input',{type:'number',min:'0',max:'255',step:'1',value:'128','aria-label':'位图灰度阈值'}),alpha=el('input',{type:'number',min:'0',max:'255',step:'1',value:'1','aria-label':'透明度阈值'}),invert=el('input',{type:'checkbox','aria-label':'反转前景'}),smoothing=el('input',{type:'number',min:'0',max:'0.5',step:'0.05',value:'0','aria-label':'轮廓平滑源像素'});
 rasterMode.append(el('option',{value:'auto'},'自动识别'),el('option',{value:'manual'},'手动参数'));rasterMode.value='auto';const rasterModeLabel=el('label',{class:'form-field'},'识别方式');rasterModeLabel.append(rasterMode);
 for(const [text,control]of [['灰度阈值 · 0–255',threshold],['透明度阈值 · 0–255',alpha],['轮廓平滑 · 0–0.5 源像素',smoothing],['反转前景',invert]]){const field=el('label',control===invert?{class:'checkbox-field'}:{});field.append(el('span',{},text),control);rasterFields.append(field);}
 rasterDetails.append(el('summary',{},'位图识别参数'),rasterModeLabel,rasterFields,el('p',{class:'property-footnote'},'默认自动识别前景并拟合轮廓；选择手动后可设置阈值和平滑。原轮廓与孔洞保留，候选不安全时保留原轮廓。修改后须重新识别。'));rasterDetails.hidden=true;
 const machiningPanel=el('div',{class:'logo-raster-settings'}),machiningEnabled=el('input',{type:'checkbox','aria-label':'按加工精度优化'}),machiningTolerance=el('input',{type:'number',min:'0',max:'0.1',step:'0.01',value:'0.05','aria-label':'轮廓允许偏差 mm'}),minDetail=el('input',{type:'number',min:'0',max:'1',step:'0.05',value:'0.2','aria-label':'微小细节阈值 mm'});machiningEnabled.checked=true;
 for(const [text,control]of [['按加工精度优化',machiningEnabled],['轮廓允许偏差 · mm',machiningTolerance],['舍弃微小区域/孔洞 · mm',minDetail]]){const field=el('label',{});field.append(el('span',{},text),control);machiningPanel.append(field);}
 machiningPanel.append(el('p',{class:'property-footnote'},'偏差上限默认 0.05 mm；位图按短边的 2% 限制实际误差，在误差内将直边拉直、曲边拟合顺滑。舍弃整体尺寸小于 0.20 mm 的小区域和小孔；长而细的笔画保留。请按刀具和实物调整，关闭优化可保留全部轮廓。'));machiningPanel.hidden=true;
 const back=el('button',{type:'button',class:'secondary'},'返回来源与识别参数');
 const pdfDetails=el('details'),pdfJoin=el('input',{type:'number',min:'0',max:'0.1',step:'0.001',value:'0','aria-label':'PDF 线接合公差 mm'}),pdfLabel=el('label',{class:'form-field'},'线接合公差 · mm');pdfLabel.append(pdfJoin);pdfDetails.append(el('summary',{},'PDF / AI 线接合参数'),pdfLabel,el('p',{class:'property-footnote'},'0：完整源宽度 × 0.0025 自动接合；正数：毫米覆盖（最大 0.1）。仅整理描边闭环和短折返，不是位图平滑；修复后仍须校对。'));pdfDetails.hidden=true;
 const reviewContent=el('div',{class:'logo-review-content'}),reviewFooter=el('div',{class:'logo-review-footer'});reviewContent.append(editorHost,summary);reviewFooter.append(confirm,back);
 sourcePanel.append(label,width,pageField,pdfDetails,rasterDetails,machiningPanel,read,advanced);reviewPanel.hidden=true;
 const thumbnail=el('div',{class:'logo-wizard-thumbnail','aria-label':'LOGO 预览'}),enlarge=el('button',{type:'button',class:'secondary'});
 setLogoButtonIcon(enlarge,'expand','打开大窗编辑矢量');setLogoButtonIcon(download,'save','保存轮廓 DXF');setLogoButtonIcon(back,'back','重新选择图片');setLogoButtonIcon(change,'image','更换图片');
 const reviewActions=el('div',{class:'logo-review-header-actions','aria-label':'轮廓操作'});reviewActions.append(enlarge,download);reviewPanel.append(reviewContent,reviewFooter);reviewActions.hidden=true;const wizardHeader=el('div',{class:'logo-wizard-header'});wizardHeader.append(progress,reviewActions);
 const transferStatus=el('div',{class:'logo-transfer-status',role:'status','aria-live':'polite',hidden:''});
 editorHost.hidden=true;route.hidden=true;summary.hidden=true;read.hidden=true;
 for(const control of [width,pageField,pdfDetails,rasterDetails,machiningPanel,advanced])control.hidden=true;
 width.value='';width.title='画布定位时可缩放的初始宽度（mm）';
 host.append(wizardHeader,thumbnail,transferStatus,route,change,sourcePanel,error,reviewPanel);
 let transferStage='idle';const showTransferStage=stage=>{transferStage=stage;transferStatus.hidden=stage==='idle';transferStatus.textContent=({reading:'正在读取图片…',uploading:'正在上传图片…',processing:'图片已上传，正在计算轮廓…',preparing:'轮廓已返回，正在优化…'})[stage]??'';};
 let generation=0,pending=null,busy=false,session=null,editor=null,imageUrl=null,wizardRevision=0,lastError=null,reviewBinding=null,largeEditor=null,machiningOverride,placementController=null;
 const syncRasterMode=()=>{for(const control of [threshold,alpha,invert,smoothing])control.disabled=busy||rasterMode.value!=='manual';};syncRasterMode();
 const markStep=index=>steps.forEach((step,i)=>{if(i===index)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});markStep(0);
 const showConfirmed=value=>{for(const control of [label,read])control.hidden=value;change.hidden=!value;for(const control of [width,pageField,summary,advanced])control.hidden=true;read.hidden=true;};
 const showSummary=logo=>{reviewActions.hidden=false;const full=logoSummary(logo),svg=full.querySelector('svg');if(svg)thumbnail.replaceChildren(svg);thumbnail.title=logo.sizeMm?.map(v=>Number(v).toFixed(2)).join(' × ')+' mm';summary.replaceChildren();};
 const closeLargeEditor=()=>{if(!largeEditor)return;editorHost.append(editor.element);reviewActions.append(enlarge,download);largeEditor.close();largeEditor.remove();largeEditor=null;showSummary(session.get().logo);};
 const openLargeEditor=()=>{if(!session||!editor)return;if(largeEditor)return;largeEditor=el('dialog',{class:'logo-editor-dialog','aria-label':'编辑 LOGO 矢量'});const header=el('div',{class:'logo-editor-header'}),close=el('button',{type:'button',class:'secondary'});setLogoButtonIcon(close,'check','完成编辑');close.addEventListener('click',closeLargeEditor);const actions=el('div',{class:'logo-editor-header-actions'});actions.append(download,close);header.append(el('h3',{},'编辑矢量'),actions);largeEditor.append(header,editor.element);largeEditor.addEventListener('cancel',event=>{event.preventDefault();closeLargeEditor();});document.body.append(largeEditor);largeEditor.showModal();editor.render();};
 enlarge.addEventListener('click',openLargeEditor);
 steps.forEach((step,index)=>{const tab=el('button',{type:'button',class:'logo-step-tab'},['选择图片','校对轮廓','定位雕刻'][index]);step.replaceChildren(tab);tab.addEventListener('click',()=>{if(busy||index>0&&!pending||index===2&&session?.get().reviewRequired)return;sourcePanel.hidden=index!==0;reviewPanel.hidden=index!==1;confirm.hidden=false;markStep(index);onLogo(index===2?pending:null);++wizardRevision;});});
 const clearImage=()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;};
 const detachReview=()=>{if(reviewBinding)reviewBinding.valid=false;reviewBinding=null;};
 const invalidate=async()=>{closeLargeEditor();reviewActions.hidden=true;thumbnail.replaceChildren();++generation;++wizardRevision;detachReview();pending=null;session=editor=null;clearImage();editorHost.replaceChildren();confirm.hidden=download.hidden=true;summary.replaceChildren();error.textContent='';lastError=null;showConfirmed(false);sourcePanel.hidden=false;reviewPanel.hidden=true;markStep(0);onLogo(null);await onInvalidate?.();};
 const reviewChanged=state=>{pending=state.logo;++wizardRevision;if(state.reviewRequired){onLogo(null);sourcePanel.hidden=true;reviewPanel.hidden=false;markStep(1);confirm.hidden=false;onInvalidate?.();}else{onLogo(pending);confirm.hidden=true;showConfirmed(true);sourcePanel.hidden=reviewPanel.hidden=true;markStep(2);}showSummary(pending);};
 const installReview=(logo,file,sharedSession)=>{
  const rendered=renderedLogoRaster(logo);
  detachReview();pending=logo;session=sharedSession??createLogoReviewSession(logo);reviewBinding={session,sourceFile:file??null,valid:true,info:null};clearImage();if(rendered)imageUrl=URL.createObjectURL(new Blob([rendered],{type:'image/png'}));else if(file&&logoInputKind(file.name)==='raster')imageUrl=URL.createObjectURL(file);
  editor=createLogoVectorReview({session,imageUrl,onChange:reviewChanged});editorHost.replaceChildren(editor.element);showSummary(logo);sourcePanel.hidden=true;reviewPanel.hidden=false;confirm.hidden=download.hidden=false;markStep(1);++wizardRevision;
 };
 const selectedWidth=()=>width.value.trim()?Number(width.value):undefined;
 const inspect=async(loader,{propagate=false,sourceFile=input.files?.[0]??null}={})=>{
  if(busy){if(propagate)throw inputError('正在读取来源，请等待原任务完成。','LOGO_WIZARD_BUSY');return;}
  busy=true;reviewActions.hidden=true;showTransferStage('reading');const token=++generation;detachReview();pending=null;session=editor=null;clearImage();editorHost.replaceChildren();thumbnail.replaceChildren();if(sourceFile instanceof Blob&&logoInputKind(sourceFile.name)==='raster'){imageUrl=URL.createObjectURL(sourceFile);thumbnail.append(el('img',{src:imageUrl,alt:'原始 LOGO 图片'}));}confirm.hidden=download.hidden=true;summary.replaceChildren();error.textContent='';lastError=null;onLogo(null);read.disabled=pasteRead.disabled=true;for(const control of [input,width,page,paste,rasterMode,threshold,alpha,invert,pdfJoin,smoothing,back,change,machiningEnabled,machiningTolerance,minDetail])control.disabled=true;read.textContent='正在识别…';host.setAttribute('aria-busy','true');route.textContent='正在识别轮廓，请等待完成后再上传或修改参数。';
  try{await onInvalidate?.();const logo=await loader();if(token!==generation||!host.isConnected){if(propagate)throw inputError('向导已关闭或来源已更换；未导入此结果。','LOGO_READ_CANCELLED');return;}installReview(logo,sourceFile);route.textContent='请核对字形、孔洞和毫米尺寸。照片、阴影图不能据明暗推断立体深度。';}
  catch(value){const failure=value instanceof Error?value:inputError(String(value),'LOGO_READ_FAILED');if(!failure.code)failure.code='LOGO_READ_FAILED';if(token===generation){error.textContent=humanError(failure)+(failure.jobId?` 任务编号：${failure.jobId}；错误代码：${failure.code}。`:'');lastError={code:failure.code,message:failure.message,...Object.fromEntries(['jobId','idempotencyKey','details','stage','commitState'].filter(key=>failure[key]!==undefined).map(key=>[key,failure[key]]))};route.textContent='本次未导入轮廓；可查看具体错误后重新识别，或选择其他文件。';}if(propagate)throw failure;}
  finally{busy=false;showTransferStage('idle');for(const control of [input,width,page,paste,rasterMode,threshold,alpha,invert,pdfJoin,smoothing,back,change,machiningEnabled,machiningTolerance,minDetail])control.disabled=false;syncRasterMode();read.textContent='识别轮廓';host.setAttribute('aria-busy','false');read.disabled=!input.files?.[0];pasteRead.disabled=false;}
 };
 const machiningOptions=()=>({enabled:machiningEnabled.checked,toleranceMm:Number(machiningTolerance.value),minDetailMm:Number(minDetail.value)});
 const rasterOptions=()=>rasterMode.value==='auto'?{mode:'auto'}:{mode:'manual',threshold:Number(threshold.value),alphaThreshold:Number(alpha.value),invert:invert.checked,smoothingPx:smoothing.value.trim()===""?NaN:Number(smoothing.value)};
 const readSelected=(allowUpload=false,options)=>{const file=input.files?.[0];if(!file){if(options?.propagate)throw inputError('请先选择来源文件，或用 readLogo 资源载入轮廓。','LOGO_SOURCE_REQUIRED');return;}const kind=logoInputKind(file.name);return inspect(()=>readBrowserLogo(file,validateLogoDocument,{onProgress:showTransferStage,targetWidthMm:selectedWidth()??(kind==='raster'?35:undefined),...(kind==='paged-vector'?{page:Number(page.value),pdfJoinToleranceMm:Number(pdfJoin.value)}:{}),sizeConfirmed:true,allowUpload:allowUpload===true,...(kind==='raster'?{machining:machiningOverride}:{}),...(kind==='raster'||kind==='paged-vector'&&rasterMode.value==='manual'?{raster:rasterOptions()}:{})}),options);};
 input.addEventListener('change',async()=>{await invalidate();const file=input.files?.[0];read.disabled=!file;for(const control of [width,pageField,pdfDetails,rasterDetails,machiningPanel,advanced])control.hidden=true;if(!file)return;await readSelected(true);});
 read.addEventListener('click',()=>readSelected(true));
 download.addEventListener('click',()=>{if(!pending)return;try{const url=URL.createObjectURL(new Blob([logoDXF(pending)],{type:'application/dxf'})),link=document.createElement('a');link.href=url;link.download='logo.dxf';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}catch(value){error.textContent=humanError(value);}});
 for(const control of [width,page,paste,threshold,alpha,invert,pdfJoin,smoothing,machiningEnabled,machiningTolerance,minDetail])control.addEventListener('input',invalidate);
 rasterMode.addEventListener('change',()=>{syncRasterMode();invalidate();});
 pasteRead.addEventListener('click',()=>{const text=paste.value;return inspect(async()=>{if(!text.trim())throw new Error('请粘贴 SVG 或闭合路径文字。');const logo=validateLogoDocument(parseLocalLogoSvg(text,{name:'pasted.svg',targetWidthMm:selectedWidth()}));logo.source.sha256=await sourceHash(text);validateRegions(logo);return fitLogoWidth(logo,selectedWidth());},{sourceFile:new File([text],'pasted.svg',{type:'image/svg+xml'})});});
 const accept=()=>{if(!session)throw inputError('请先读取并校对轮廓。','LOGO_REVIEW_REQUIRED');const state=session.act({action:'confirm',expectedRevision:session.get().revision,confirmed:true});pending=state.logo;onLogo(pending);confirm.hidden=true;showConfirmed(true);sourcePanel.hidden=reviewPanel.hidden=true;markStep(2);++wizardRevision;route.textContent='已确认 '+pending.sizeMm.map(v=>Number(v).toFixed(3)).join(' × ')+' mm；请选择目标面并设置雕刻深度。';return state;};
 confirm.addEventListener('click',()=>{try{accept();}catch(e){error.textContent=humanError(e);}});
 back.addEventListener('click',async()=>{await invalidate();route.textContent='修改来源或参数后，重新识别。';});
 change.addEventListener('click',async()=>{await invalidate();route.textContent='选择新图片，或修改宽度后重新识别。';});
 const get=()=>({open:true,editorOpen:!!largeEditor,placement:placementController?.get()??null,revision:wizardRevision,transferStage,step:busy?'reading':sourcePanel.hidden?reviewPanel.hidden?'target':'review':'source',busy,machiningReadiness:pending?inspectLogoMachiningCapacity(pending):null,error:error.textContent||null,errorDetails:lastError?structuredClone(lastError):null,name:reviewBinding?.sourceFile?.name??input.files?.[0]?.name??null,logoId:reviewBinding?.info?.logoId??null,sourceResourceId:reviewBinding?.info?.sourceResourceId??null,sourceStatus:reviewBinding?.info?.sourceStatus??(reviewBinding?.sourceFile?'not-registered':'unavailable-original'),parameters:{targetWidthMm:selectedWidth()??null,page:Number(page.value),pdfJoinToleranceMm:Number(pdfJoin.value),raster:rasterOptions(),machining:machiningOverride},review:session?.get()??null});
 activeWizard={element:host,get,binding:()=>reviewBinding,refresh:shared=>{if(shared===session){if(!editor){editor=createLogoVectorReview({session,imageUrl,onChange:reviewChanged});editorHost.replaceChildren(editor.element);}editor.render();reviewChanged(session.get());}},act:async request=>{
  if(request.action==='get')return get();if(request.expectedRevision!==wizardRevision)throw inputError('LOGO 向导已变化，请读取最新 revision。','LOGO_REVIEW_STALE');
  if(busy)throw inputError('正在读取来源，请等待原任务完成。','LOGO_WIZARD_BUSY');
  if(['place','position','align','fold','unfold'].includes(request.action)){if(!placementController)throw inputError('当前向导尚未提供画布定位。','CAPABILITY_UNAVAILABLE');await placementController.act(request);++wizardRevision;return get();}
  if(request.action==='edit'){openLargeEditor();return get();}
  if(request.action==='closeEditor'){closeLargeEditor();return get();}
  if(request.action==='parameters'){
   const p=request.parameters||{};if(Object.keys(p).some(k=>!['targetWidthMm','page','raster','pdfJoinToleranceMm','machining'].includes(k)))throw inputError('未知 LOGO 识别参数。','PARAM_SCHEMA_INVALID');
   if(p.targetWidthMm!==undefined&&!(Number.isFinite(p.targetWidthMm)&&p.targetWidthMm>0))throw inputError('图案宽度须大于0。','PARAM_SCHEMA_INVALID');if(p.page!==undefined&&(!Number.isInteger(p.page)||p.page<1))throw inputError('页码须为正整数。','PARAM_SCHEMA_INVALID');validateLogoRasterOptions(p.raster);validateLogoMachining(p.machining);
   if(p.pdfJoinToleranceMm!==undefined&&(!Number.isFinite(p.pdfJoinToleranceMm)||p.pdfJoinToleranceMm<0||p.pdfJoinToleranceMm>0.1))throw inputError('PDF 线接合公差须为 0–0.1 mm；0 为自动。','PARAM_SCHEMA_INVALID');
   await invalidate();if(p.machining){machiningOverride=structuredClone(p.machining);if(p.machining.enabled!==undefined)machiningEnabled.checked=p.machining.enabled;if(p.machining.toleranceMm!==undefined)machiningTolerance.value=String(p.machining.toleranceMm);if(p.machining.minDetailMm!==undefined)minDetail.value=String(p.machining.minDetailMm);}if(p.targetWidthMm!==undefined)width.value=String(p.targetWidthMm);if(p.page!==undefined)page.value=String(p.page);if(p.pdfJoinToleranceMm!==undefined)pdfJoin.value=String(p.pdfJoinToleranceMm);if(p.raster){rasterMode.value=p.raster.mode==='auto'?'auto':'manual';if(p.raster.threshold!==undefined)threshold.value=String(p.raster.threshold);if(p.raster.alphaThreshold!==undefined)alpha.value=String(p.raster.alphaThreshold);if(p.raster.invert!==undefined)invert.checked=p.raster.invert;if(p.raster.smoothingPx!==undefined)smoothing.value=String(p.raster.smoothingPx);syncRasterMode();}return get();
  }
  if(request.action==='read'){if(request.allowUpload!==undefined&&typeof request.allowUpload!=='boolean')throw inputError('allowUpload 必须为布尔值；后台上传须明确 true。','PARAM_SCHEMA_INVALID');await readSelected(request.allowUpload===true,{propagate:true});return get();}
  if(request.action==='back'){await invalidate();return get();}
  if(request.action==='load'){validateRegions(request.logo);const before=wizardRevision;await onInvalidate?.();if(wizardRevision!==before||!host.isConnected)throw inputError('向导在载入期间已变化，请读取当前草稿。','LOGO_REVIEW_STALE');onLogo(null);installReview(request.reviewSession?.get().logo??request.logo,request.sourceFile,request.reviewSession);return get();}
  if(request.action==='confirm'){if(request.confirmed!==true)throw inputError('须明确 confirmed:true 后导入雕刻。','LOGO_REVIEW_REQUIRED');accept();return get();}
  if(!editor||!session)throw inputError('请先读取轮廓。','LOGO_REVIEW_REQUIRED');
  editor.act({...request,expectedRevision:session.get().revision});return get();
 }};
 if(initialLogo){showSummary(initialLogo);pending=initialLogo;session=createLogoReviewSession(initialLogo);editor=createLogoVectorReview({session,imageUrl:null,onChange:reviewChanged});editorHost.replaceChildren(editor.element);reviewBinding={session,sourceFile:null,valid:true,info:null};showConfirmed(true);sourcePanel.hidden=reviewPanel.hidden=true;markStep(2);route.textContent='已保留确认过的 '+initialLogo.sizeMm.map(v=>Number(v).toFixed(3)).join(' × ')+' mm 轮廓。';}
 let mounted=host.isConnected;const dispose=()=>{closeLargeEditor();++generation;clearImage();cleanup.disconnect();if(activeWizard?.element===host)activeWizard=null;};
 const cleanup=new MutationObserver(()=>{if(host.isConnected)mounted=true;else if(mounted)dispose();});cleanup.observe(document.body,{childList:true,subtree:true});host.disposeLogoImporter=dispose;host.setLogoPlacementController=value=>{placementController=value;};host.notifyLogoPlacement=()=>{++wizardRevision;};
 return host;
}
