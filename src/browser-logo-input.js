import { validateRegions } from './logo-model.js';
import { parseLocalLogoSvg } from './svg-logo-input.js';
import {getServicesConfig} from './services/settings.js';
import {servicesClient} from './services/client.js';

const inputError=(message,code='SIZE_LIMIT')=>Object.assign(new Error(message),{code});
async function sourceHash(text){const bytes=typeof text==='string'?new TextEncoder().encode(text):text,digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
export async function readBrowserLogo(file,validate,{targetWidthMm,page,sizeConfirmed=false,allowUpload=false,client=servicesClient}={}){
  if(!file)throw inputError('请选择 LOGO 文件','INVALID_INPUT');
  const name=file.name.toLowerCase();
  if(name.endsWith('.logo.json')){
    if(file.size>2*1024*1024)throw inputError('LOGO JSON 必须不超过 2 MiB。');
    const logo=validate(JSON.parse(await file.text()));validateRegions(logo);return logo;
  }
  if(name.endsWith('.svg')){
    if(file.size>20*1024*1024)throw inputError('SVG 必须不超过 20 MiB。');
    const text=await file.text(),logo=validate(parseLocalLogoSvg(text,{name:file.name,targetWidthMm}));logo.source.sha256=await sourceHash(text);validateRegions(logo);return logo;
  }
  if(/\.(pdf|ai|dxf|png|jpe?g|bmp)$/.test(name)){
    if(file.size>20*1024*1024)throw inputError('LOGO 源文件必须不超过 20 MiB。');
    if(client===servicesClient&&!getServicesConfig().configured)throw inputError('请先配置唯一 Services 服务。','CAPABILITY_UNAVAILABLE');
    if(!allowUpload)throw inputError('请明确允许将源文件上传到当前 Services。','UPLOAD_AUTH_REQUIRED');
    if(!sizeConfirmed)throw inputError('请先确认物理尺寸，必要时填写目标宽度。','SIZE_REQUIRED');
    const capabilities=await client.capabilities();if(!capabilities.logo?.enabled)throw inputError('Services 未启用 Logo 转换。','CAPABILITY_UNAVAILABLE');
    const asset=await client.upload(file),requestId=crypto.randomUUID();
    const inspected=await client.wait(await client.submit('logo/inspect',{assetId:asset.assetId,options:page?{page}:{}},`${requestId}-inspect`));
    if(inspected.result.pageCount>1&&!page)throw inputError(`源文件有 ${inspected.result.pageCount} 页，请指定页码。`,'PAGE_REQUIRED');
    const raster=/\.(png|jpe?g|bmp)$/.test(name),options={mode:raster?'raster':'vector',sizeMode:targetWidthMm?'targetWidth':'sourceUnits',sizeConfirmed:true,toleranceMm:0.005,pdfJoinToleranceMm:0,...(page?{page}:{}),...(targetWidthMm?{targetWidthMm}:{})};
    const {result,manifest}=await client.wait(await client.submit('logo/convert',{assetId:asset.assetId,options},`${requestId}-convert`));
    if(!result.geometryValid||!result.logoDocument||!['ready','needsReview'].includes(result.status))throw inputError('Services 未返回已验证轮廓。','CONVERSION_FAILED');
    const logo=validate(result.logoDocument);validateRegions(logo);
    logo.source={...logo.source,reviewed:false,reviewRequired:result.reviewRequired,conversionReport:result.conversionReport,servicesEvidence:{jobId:manifest.jobId,inputFingerprint:manifest.inputFingerprint,artifactSha256:manifest.artifactSha256}};
    return logo;
  }
  throw inputError('当前浏览器支持 .logo.json 和受限 SVG；其他格式须使用可用的转换服务。','CAPABILITY_UNAVAILABLE');
}
export function createLogoImportUI({onError,onWarning,onLogo,onInvalidate,validateLogoDocument,logoSummary,initialLogo=null}){
  const host=document.createElement('section'),input=document.createElement('input'),label=document.createElement('label'),error=document.createElement('p'),summary=document.createElement('div'),note=document.createElement('p'),paste=document.createElement('textarea'),width=document.createElement('input'),convert=document.createElement('button'),confirm=document.createElement('button'),status=document.createElement('p');
  host.className='logo-import-ui';input.type='file';input.accept='.logo.json,.svg,.pdf,.ai,.dxf,.png,.jpg,.jpeg,.bmp';label.textContent='选择 LOGO JSON、SVG、PDF、AI、DXF 或位图';label.append(input);error.className='form-error';error.setAttribute('role','alert');
  note.textContent='SVG 在本地解析；其他格式须明确授权上传到唯一 Services。请核对转换后的字形、尺寸与闭合轮廓。';
  paste.rows=3;paste.spellcheck=false;paste.placeholder='粘贴完整 SVG 或闭合 path d';paste.setAttribute('aria-label','粘贴 SVG 或闭合路径');
  width.type='number';width.step='any';width.min='0.000001';width.placeholder='缺少物理尺寸时填写目标宽度 mm';width.setAttribute('aria-label','目标宽度 mm');
  convert.type='button';convert.textContent='解析粘贴内容';confirm.type='button';confirm.textContent='确认轮廓和尺寸';confirm.hidden=true;status.className='property-footnote';
  const page=document.createElement('input'),sizeConfirmed=document.createElement('input'),allowUpload=document.createElement('input');page.type='number';page.min='1';page.step='1';page.placeholder='多页源文件页码';page.setAttribute('aria-label','LOGO 页码');sizeConfirmed.type=allowUpload.type='checkbox';const sizeLabel=document.createElement('label'),uploadLabel=document.createElement('label');sizeLabel.textContent='确认实际毫米尺寸（无目标宽度时使用源单位）';uploadLabel.textContent='允许上传所选源文件到当前 Services';sizeLabel.append(sizeConfirmed);uploadLabel.append(allowUpload);host.append(label,note,paste,width,page,sizeLabel,uploadLabel,convert,error,summary,confirm,status);let generation=0,pending=null;
  if(initialLogo){summary.append(logoSummary(initialLogo));status.textContent='已确认轮廓，选面期间保留了尺寸与来源。';}
  const invalidate=async()=>{++generation;pending=null;confirm.hidden=true;summary.replaceChildren();status.textContent='';error.textContent='';onLogo(null);await onInvalidate?.();};
  const selectedWidth=()=>width.value.trim()?Number(width.value):undefined;
  async function inspect(read){const token=++generation;pending=null;confirm.hidden=true;summary.replaceChildren();error.textContent='';onLogo(null);await onInvalidate?.();try{const logo=await read();if(token!==generation||!host.isConnected)return;pending=logo;summary.append(logoSummary(logo));status.textContent=`请核对 ${logo.name} 的尺寸、填充区域与来源，再点击确认。`;confirm.hidden=false;}catch(e){if(token===generation){if(onError)onError(e.message);else error.textContent=e.message;}}}
  const readSelected=()=>{const file=input.files?.[0];if(!file){invalidate();return;}return inspect(()=>readBrowserLogo(file,validateLogoDocument,{targetWidthMm:selectedWidth(),page:page.value?Number(page.value):undefined,sizeConfirmed:sizeConfirmed.checked,allowUpload:allowUpload.checked}));};
  const readFile=document.createElement('button');readFile.type='button';readFile.textContent='读取所选文件';readFile.addEventListener('click',readSelected);label.after(readFile);
  input.addEventListener('change',()=>{if(/\.(logo\.json|svg)$/i.test(input.files?.[0]?.name||''))readSelected();else invalidate();});
  convert.addEventListener('click',()=>inspect(async()=>{if(!paste.value.trim())throw new Error('请先粘贴完整 SVG 或闭合 path d。');const text=paste.value,logo=validateLogoDocument(parseLocalLogoSvg(text,{name:'pasted.svg',targetWidthMm:selectedWidth()}));logo.source.sha256=await sourceHash(text);validateRegions(logo);return logo;}));
  paste.addEventListener('input',invalidate);width.addEventListener('input',invalidate);page.addEventListener('input',invalidate);sizeConfirmed.addEventListener('change',invalidate);allowUpload.addEventListener('change',invalidate);
  confirm.addEventListener('click',()=>{if(!pending)return;onLogo({...pending,source:{kind:'reviewed-contours',original:pending.source,reviewed:true}});confirm.hidden=true;status.textContent='已确认轮廓；现在可预览并应用。';});
  return host;
}
