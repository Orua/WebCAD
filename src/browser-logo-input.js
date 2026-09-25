import { validateRegions } from './logo-model.js';
import { parseLocalLogoSvg } from './svg-logo-input.js';
import { getLogoConverterConfig } from './logo-converter-settings.js';

const inputError=(message,code='SIZE_LIMIT')=>Object.assign(new Error(message),{code});
async function sourceHash(text){const bytes=typeof text==='string'?new TextEncoder().encode(text):text,digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
export async function readBrowserLogo(file,validate,{targetWidthMm}={}){
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
  if(name.endsWith('.pdf')){
    if(file.size>20*1024*1024)throw inputError('PDF 必须不超过 20 MiB。');
    const config=getLogoConverterConfig();
    if(!config.configured)throw inputError('请先在全局设置中保存 LOGO 转换 URL 和 Key。','CAPABILITY_UNAVAILABLE');
    const form=new FormData();form.append('file',file,file.name);
    let response;
    try{response=await fetch(config.url,{method:'POST',headers:{'X-Key':config.key},body:form});}
    catch{throw inputError('浏览器无法直连转换服务；请检查服务是否允许 WebCAD 页面的跨域请求（CORS）。','CAPABILITY_UNAVAILABLE');}
    const result=await response.text();
    if(!response.ok){let message=`PDF 转换失败（HTTP ${response.status}）`;try{const data=JSON.parse(result);message=data.message||data.error||message;}catch{}throw inputError(message,'CONVERSION_FAILED');}
    const svg=result.trimStart().startsWith('<svg')||result.includes('<svg ')?result:(()=>{try{return JSON.parse(result).svg;}catch{return null;}})();
    if(typeof svg!=='string'||!svg.includes('<svg'))throw inputError('转换服务未返回 SVG。','CONVERSION_FAILED');
    const logo=validate(parseLocalLogoSvg(svg,{name:file.name,targetWidthMm}));
    logo.source={kind:'pdf-converted-svg',name:file.name,fillColor:logo.source.fillColor,sha256:await sourceHash(await file.arrayBuffer()),approximationToleranceMm:0.005,reviewed:false};
    validateRegions(logo);return logo;
  }
  throw inputError('当前浏览器支持 .logo.json 和受限 SVG；其他格式须使用可用的转换服务。','CAPABILITY_UNAVAILABLE');
}
export function createLogoImportUI({onError,onWarning,onLogo,onInvalidate,validateLogoDocument,logoSummary,initialLogo=null}){
  const host=document.createElement('section'),input=document.createElement('input'),label=document.createElement('label'),error=document.createElement('p'),summary=document.createElement('div'),note=document.createElement('p'),paste=document.createElement('textarea'),width=document.createElement('input'),convert=document.createElement('button'),confirm=document.createElement('button'),status=document.createElement('p');
  host.className='logo-import-ui';input.type='file';input.accept='.logo.json,.svg,.pdf,application/pdf';label.textContent='选择 .logo.json、SVG 或 PDF';label.append(input);error.className='form-error';error.setAttribute('role','alert');
  note.textContent='SVG 在本地解析；PDF 将上传到全局设置中的内网转换服务。请核对转换后的字形、尺寸与闭合轮廓。';
  paste.rows=3;paste.spellcheck=false;paste.placeholder='粘贴完整 SVG 或闭合 path d';paste.setAttribute('aria-label','粘贴 SVG 或闭合路径');
  width.type='number';width.step='any';width.min='0.000001';width.placeholder='缺少物理尺寸时填写目标宽度 mm';width.setAttribute('aria-label','目标宽度 mm');
  convert.type='button';convert.textContent='解析粘贴内容';confirm.type='button';confirm.textContent='确认轮廓和尺寸';confirm.hidden=true;status.className='property-footnote';
  host.append(label,note,paste,width,convert,error,summary,confirm,status);let generation=0,pending=null;
  if(initialLogo){summary.append(logoSummary(initialLogo));status.textContent='已确认轮廓，选面期间保留了尺寸与来源。';}
  const invalidate=async()=>{++generation;pending=null;confirm.hidden=true;summary.replaceChildren();status.textContent='';error.textContent='';onLogo(null);await onInvalidate?.();};
  const selectedWidth=()=>width.value.trim()?Number(width.value):undefined;
  async function inspect(read){const token=++generation;pending=null;confirm.hidden=true;summary.replaceChildren();error.textContent='';onLogo(null);await onInvalidate?.();try{const logo=await read();if(token!==generation||!host.isConnected)return;pending=logo;summary.append(logoSummary(logo));status.textContent=`请核对 ${logo.name} 的尺寸、填充区域与来源，再点击确认。`;confirm.hidden=false;}catch(e){if(token===generation){if(onError)onError(e.message);else error.textContent=e.message;}}}
  input.addEventListener('change',()=>{const file=input.files?.[0];if(!file){invalidate();return;}inspect(()=>readBrowserLogo(file,validateLogoDocument,{targetWidthMm:selectedWidth()}));});
  convert.addEventListener('click',()=>inspect(async()=>{if(!paste.value.trim())throw new Error('请先粘贴完整 SVG 或闭合 path d。');const text=paste.value,logo=validateLogoDocument(parseLocalLogoSvg(text,{name:'pasted.svg',targetWidthMm:selectedWidth()}));logo.source.sha256=await sourceHash(text);validateRegions(logo);return logo;}));
  paste.addEventListener('input',invalidate);width.addEventListener('input',invalidate);
  confirm.addEventListener('click',()=>{if(!pending)return;onLogo({...pending,source:{kind:'reviewed-contours',original:pending.source,reviewed:true}});confirm.hidden=true;status.textContent='已确认轮廓；现在可预览并应用。';});
  return host;
}
