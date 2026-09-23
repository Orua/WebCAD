// Native reviewed contour packets remain local; converter-backed formats are unavailable.
export async function readBrowserLogo(file,validate){
  if(!file?.name?.toLowerCase().endsWith('.logo.json'))throw Object.assign(new Error('CAPABILITY_UNAVAILABLE：静态版只读取 .logo.json 标准轮廓；不提供 SVG/DXF/DWG/PDF/AI 转换。'),{code:'CAPABILITY_UNAVAILABLE'});
  if(file.size>2*1024*1024)throw Object.assign(new Error('LOGO JSON 必须不超过 2 MiB。'),{code:'SIZE_LIMIT'});
  return validate(JSON.parse(await file.text()));
}
export function createLogoImportUI({onLogo,onInvalidate,validateLogoDocument,logoSummary}){
  const host=document.createElement('section'),input=document.createElement('input'),label=document.createElement('label'),error=document.createElement('p'),summary=document.createElement('div'),note=document.createElement('p');
  host.className='logo-import-ui';input.type='file';input.accept='.logo.json';label.textContent='选择 .logo.json 标准轮廓';label.append(input);error.className='form-error';error.setAttribute('role','alert');
  note.textContent='纯浏览器读取标准轮廓；SVG 粘贴和 SVG / DXF / DWG / PDF / AI 转换在静态版不可用。';host.append(label,note,error,summary);let generation=0;
  input.onchange=async()=>{
    const token=++generation,file=input.files?.[0];error.textContent='';summary.replaceChildren();onLogo(null);await onInvalidate?.();if(!file)return;
    try{const logo=await readBrowserLogo(file,validateLogoDocument);if(token!==generation||!host.isConnected)return;onLogo(logo);summary.replaceChildren(logoSummary(logo));}
    catch(e){if(token===generation)error.textContent=e.message;}
  };
  return host;
}
