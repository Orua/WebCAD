import { validateRegions } from './logo-model.js';
import { parseLocalLogoSvg } from './svg-logo-input.js';
import {getServicesConfig} from './services/settings.js';
import {servicesClient} from './services/client.js';
import {binaryHash} from './contracts/operation-schema.js';
import {validateLogoRasterOptions} from './logo-raster-options.js';

const inputError=(message,code='SIZE_LIMIT')=>Object.assign(new Error(message),{code});
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
 return {...logo,sizeMm:[targetWidthMm,(maxY-minY)*factor],regions:logo.regions.map(r=>({outer:r.outer.map(p=>p.map(v=>v*factor)),holes:(r.holes||[]).map(h=>h.map(p=>p.map(v=>v*factor)))})),source:{...(typeof logo.source==='object'?logo.source:{original:logo.source}),widthNormalization:{basis:'contour-bounds',convertedWidthMm:width,requestedWidthMm:targetWidthMm,scale:factor}}};
}
export async function readBrowserLogo(file,validate,{targetWidthMm,page,sizeConfirmed=false,allowUpload=false,raster,client=servicesClient}={}){
  if(!file)throw inputError('请选择 LOGO 文件','INVALID_INPUT');
  const name=file.name.toLowerCase();
  if(name.endsWith('.logo.json')){
    if(file.size>2*1024*1024)throw inputError('LOGO JSON 必须不超过 2 MiB。');
    const logo=validate(JSON.parse(await file.text()));validateRegions(logo);return fitLogoWidth(logo,targetWidthMm);
  }
  if(name.endsWith('.svg')){
    if(file.size>20*1024*1024)throw inputError('SVG 必须不超过 20 MiB。');
    const text=await file.text(),logo=validate(parseLocalLogoSvg(text,{name:file.name,targetWidthMm}));logo.source.sha256=await sourceHash(text);validateRegions(logo);return fitLogoWidth(logo,targetWidthMm);
  }
  if(/\.(pdf|ai|dxf|png|jpe?g|bmp)$/.test(name)){
    if(file.size>20*1024*1024)throw inputError('LOGO 源文件必须不超过 20 MiB。');
    if(client===servicesClient&&!getServicesConfig().configured)throw inputError('请在“计算设置”启用后台计算，然后重新识别图片。','CAPABILITY_UNAVAILABLE');
    if(!allowUpload)throw inputError('识别此文件需要上传到已配置的后台计算，请明确允许上传。','UPLOAD_AUTH_REQUIRED');
    const isRaster=/\.(png|jpe?g|bmp)$/.test(name);
    if(raster!==undefined&&!isRaster)throw inputError('raster 选项只用于 PNG、JPG、BMP 位图。','PARAM_SCHEMA_INVALID');
    validateLogoRasterOptions(raster);
    if(!sizeConfirmed||isRaster&&!(Number.isFinite(targetWidthMm)&&targetWidthMm>0))throw inputError('请填写图案实际宽度（mm）；图片像素不能作为毫米尺寸。','SIZE_REQUIRED');
    if(targetWidthMm!==undefined&&!(Number.isFinite(targetWidthMm)&&targetWidthMm>0))throw inputError('图案宽度必须大于 0 mm。','SIZE_REQUIRED');
    const capabilities=await client.capabilities();if(!capabilities.logo?.enabled)throw inputError('后台未启用图片轮廓转换。','CAPABILITY_UNAVAILABLE');
    const asset=await client.upload(file),requestId=crypto.randomUUID();
    const inspected=await client.wait(await client.submit('logo/inspect',{assetId:asset.assetId,options:page?{page}:{}},`${requestId}-inspect`));
    if(inspected.result.pageCount>1&&!page)throw inputError(`源文件有 ${inspected.result.pageCount} 页，请指定页码。`,'PAGE_REQUIRED');
    const options={mode:isRaster?'raster':'vector',sizeMode:targetWidthMm?'targetWidth':'sourceUnits',sizeConfirmed:true,toleranceMm:0.005,pdfJoinToleranceMm:0,...(page?{page}:{}),...(targetWidthMm?{targetWidthMm}:{}),...(isRaster&&raster?{raster}:{})};
    let converted;
    try{converted=await client.wait(await client.submit('logo/convert',{assetId:asset.assetId,options},`${requestId}-convert`));}
    catch(error){
      if(isRaster)error.details={...(error.details||{}),rasterOptions:{threshold:raster?.threshold??128,invert:raster?.invert??false,alphaThreshold:raster?.alphaThreshold??1},rasterOptionsSupplied:raster!==undefined};
      throw error;
    }
    const {result,manifest}=converted;
    if(!result.geometryValid||!result.logoDocument||!['ready','needsReview'].includes(result.status))throw inputError('后台没有返回有效的闭合轮廓。','CONVERSION_FAILED');
    const logo=validate(result.logoDocument);validateRegions(logo);
    logo.source={...logo.source,reviewed:false,reviewRequired:result.reviewRequired,conversionReport:result.conversionReport,servicesEvidence:{jobId:manifest.jobId,inputFingerprint:manifest.inputFingerprint,artifactSha256:manifest.artifactSha256}};
    return fitLogoWidth(logo,targetWidthMm);
  }
  throw inputError('LOGO 支持 SVG、LOGO JSON、PDF、AI、DXF、PNG、JPG、BMP。照片或明暗参考图不能直接当作精确雕刻轮廓。','CAPABILITY_UNAVAILABLE');
}
export function createLogoImportUI({onLogo,onInvalidate,validateLogoDocument,logoSummary,initialLogo=null}){
 const el=(tag,attrs={},text)=>{const node=document.createElement(tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text)node.textContent=text;return node;};
 const host=el('section',{class:'logo-import-ui'}),input=el('input',{type:'file',accept:'.logo.json,.svg,.pdf,.ai,.dxf,.png,.jpg,.jpeg,.bmp','aria-label':'选择 LOGO 文件'}),label=el('label',{},'选择图片或矢量文件'),error=el('p',{class:'form-error',role:'alert'}),summary=el('div'),route=el('p',{class:'property-footnote',role:'status'});
 label.append(input);
 const width=el('input',{type:'number',min:'0.000001',step:'any','aria-label':'图案实际宽度 mm',placeholder:'图案实际宽度（mm）'}),page=el('input',{type:'number',min:'1',step:'1',value:'1','aria-label':'PDF 或 AI 页码'}),pageField=el('label',{},'页码');pageField.append(page);pageField.hidden=true;
 const read=el('button',{type:'button',class:'primary'},'识别轮廓'),confirm=el('button',{type:'button',class:'primary'},'轮廓和尺寸正确，下一步'),change=el('button',{type:'button',class:'secondary'},'更换图片或尺寸');read.disabled=true;confirm.hidden=change.hidden=true;
 const advanced=el('details'),paste=el('textarea',{rows:'3','aria-label':'SVG 或闭合路径',placeholder:'粘贴 SVG 或闭合 path d'}),pasteRead=el('button',{type:'button',class:'secondary'},'读取矢量文字');
 advanced.append(el('summary',{},'粘贴矢量文字'),paste,pasteRead);
 host.append(label,route,change,width,pageField,read,error,summary,confirm,advanced);
 let generation=0,pending=null,busy=false;
 const showConfirmed=value=>{for(const control of [label,width,pageField,read,summary,advanced])control.hidden=value;change.hidden=!value;if(!value)pageField.hidden=logoInputKind(input.files?.[0]?.name)!=='paged-vector';};
 const showSummary=logo=>{const full=logoSummary(logo),preview=full.querySelector('svg'),details=el('details'),holes=logo.regions.reduce((n,r)=>n+(r.holes?.length||0),0);summary.replaceChildren();if(preview)summary.append(preview);summary.append(el('p',{class:'property-footnote'},logo.sizeMm.map(v=>Number(v).toFixed(3)).join(' × ')+' mm · '+logo.regions.length+' 个填充区域 · '+holes+' 个孔洞'));details.append(el('summary',{},'来源与转换说明'),full);summary.append(details);};
 const invalidate=async()=>{++generation;pending=null;confirm.hidden=true;summary.replaceChildren();error.textContent='';showConfirmed(false);onLogo(null);await onInvalidate?.();};
 const selectedWidth=()=>width.value.trim()?Number(width.value):undefined;
 const inspect=async loader=>{
  if(busy)return;busy=true;const token=++generation;pending=null;confirm.hidden=true;summary.replaceChildren();error.textContent='';onLogo(null);read.disabled=pasteRead.disabled=true;input.disabled=width.disabled=page.disabled=paste.disabled=true;route.textContent='正在识别轮廓…';
  try{await onInvalidate?.();const logo=await loader();if(token!==generation||!host.isConnected)return;pending=logo;showSummary(logo);confirm.hidden=false;route.textContent='请核对字形、孔洞和毫米尺寸。照片、阴影图不能据明暗推断立体深度。';}
  catch(value){if(token===generation){error.textContent=value.message;route.textContent='本次未导入轮廓；请按提示修改后重新识别。';}}
  finally{busy=false;input.disabled=width.disabled=page.disabled=paste.disabled=false;read.disabled=!input.files?.[0];pasteRead.disabled=false;}
 };
 const readSelected=()=>{const file=input.files?.[0];if(!file)return;return inspect(()=>readBrowserLogo(file,validateLogoDocument,{targetWidthMm:selectedWidth(),page:logoInputKind(file.name)==='paged-vector'?Number(page.value):undefined,sizeConfirmed:Number.isFinite(selectedWidth())&&selectedWidth()>0,allowUpload:true}));};
 input.addEventListener('change',async()=>{await invalidate();const file=input.files?.[0];read.disabled=!file;const kind=logoInputKind(file?.name);pageField.hidden=kind!=='paged-vector';if(!file)return;if(kind==='local'||kind==='unsupported'){route.textContent='正在读取文件…';await readSelected();}else route.textContent=kind==='raster'?'黑白图：填写实际宽度后识别闭合轮廓。点击识别会上传此文件到已配置的后台。':'矢量文档：填写宽度后在后台提取轮廓，保留字形和孔洞。';});
 read.addEventListener('click',readSelected);
 for(const control of [width,page,paste])control.addEventListener('input',invalidate);
 pasteRead.addEventListener('click',()=>inspect(async()=>{if(!paste.value.trim())throw new Error('请粘贴 SVG 或闭合路径文字。');const logo=validateLogoDocument(parseLocalLogoSvg(paste.value,{name:'pasted.svg',targetWidthMm:selectedWidth()}));logo.source.sha256=await sourceHash(paste.value);validateRegions(logo);return fitLogoWidth(logo,selectedWidth());}));
 confirm.addEventListener('click',()=>{if(!pending)return;const logo={...pending,source:{...pending.source,kind:'reviewed-contours',original:pending.source,reviewed:true}};onLogo(logo);confirm.hidden=true;showConfirmed(true);route.textContent='已确认 '+logo.sizeMm.map(v=>Number(v).toFixed(3)).join(' × ')+' mm；请选择目标面并设置雕刻深度。';});
 change.addEventListener('click',async()=>{await invalidate();route.textContent='选择新图片，或修改宽度后重新识别。';});
 if(initialLogo){showConfirmed(true);route.textContent='已保留确认过的 '+initialLogo.sizeMm.map(v=>Number(v).toFixed(3)).join(' × ')+' mm 轮廓。';}
 return host;
}
