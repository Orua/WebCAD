// "从图片导入高度" panel for the relief design dialog. Decodes the image in the browser, converts it
// with explicit settings, and (for photos) requires the exact confirmation sentence before the result
// may become this draft's authored height map. Nothing is saved until the draft itself is saved.
import {convertRgbaToHeightGrid,encodeHeightGrid,RELIEF_CONVERT_LIMITS} from '../../relief-source/convert.js';
import {createReliefHeightSource,PHOTO_HEIGHTMAP_CONFIRMATION} from '../../relief-source/source.js';
import {humanError} from '../../error-recovery.js';
import {sourceConvertWorkerParams,sourceConvertLocal,convertSourceOnServices,reliefServicesReady} from '../../services/relief-pipeline.js';

export async function decodeImageFile(file){
 if(!(file instanceof Blob)||!file.size||file.size>20*1024*1024)throw Object.assign(new Error('图片须为非空文件且不超过 20 MiB'),{code:'RELIEF_LIMIT'});
 const bytes=new Uint8Array(await file.arrayBuffer()),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 let bitmap;try{bitmap=await createImageBitmap(new Blob([bytes],{type:file.type||'image/png'}),{imageOrientation:'from-image'});}catch{throw Object.assign(new Error('无法解码图片；请使用有效的 PNG、JPG 或 WebP'),{code:'RELIEF_IMAGE_INVALID'});}
 try{
  if(bitmap.width*bitmap.height>RELIEF_CONVERT_LIMITS.maxSourcePixels)throw Object.assign(new Error('图片超过 16M 像素'),{code:'RELIEF_LIMIT'});
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
  return {sha256,name:file.name||'image',width:bitmap.width,height:bitmap.height,rgba:ctx.getImageData(0,0,bitmap.width,bitmap.height).data};
 }finally{bitmap.close?.();}
}
/** Pure: panel form values -> {settings, depth/edge options}. Exported for tests. */
export function heightPanelRequest(v){
 const n=(x,label)=>{const y=Number(x);if(String(x).trim()===''||!Number.isFinite(y))throw new Error(label+' 需要数值');return y;};
 return {settings:{columns:n(v.columns,'网格'),rows:n(v.columns,'网格'),levels:{black:n(v.black,'黑点'),white:n(v.white,'白点')},gamma:n(v.gamma,'Gamma'),blurPx:n(v.blur,'模糊'),invert:!!v.invert},
  depthMm:n(v.depth,'深度'),edgeKeepoutMm:n(v.keepout,'边缘留空'),edgeFadeMm:n(v.fade,'边缘过渡')};
}
export function createReliefHeightPanel({element,button,field,onApply,getCurrent,getPrecision=()=>.05,servicesReady=()=>reliefServicesReady('reliefSourceConvert'),convertRemote=convertSourceOnServices}){
 const panel=element('details',{}),summary=element('summary',{},'从图片导入高度');
 const hint=element('p',{class:'property-footnote'},'图片覆盖支撑范围的外接矩形，亮色更高（可反相）。照片只代表光影，必须由您确认转换结果是自己制作的高度图后才能使用。');
 const why=element('p',{class:'property-footnote','aria-live':'polite'});why.style.cssText='color:var(--warning,#b45309)';
 const form=element('div',{});form.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr));gap:6px 10px';
 const picker=element('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'选择高度图片'});
 const use=element('select',{'aria-label':'图像用途'});for(const [v,t] of [['authoredHeightMap','作者制作的高度图'],['shadedReference','照片 / 光影参考']])use.append(element('option',{value:v},t));
 const num=(label,value,step='any')=>{const i=element('input',{type:'number',step,value,'aria-label':label});field(label,i,form);return i;};
 field('图像用途',use,form);
 const columns=num('网格（列=行，2–2049）',129,'1'),black=num('黑点 0–1',0),white=num('白点 0–1',1),gamma=num('Gamma',1),blur=num('模糊（网格像素）',2),depth=num('最大高度 mm',1),keepout=num('边缘留空 mm',2),fade=num('边缘过渡 mm',2);
 const invert=element('input',{type:'checkbox','aria-label':'反相'});field('反相（暗色更高）',invert,form);
 const confirmRow=element('label',{class:'form-field wide'}),confirm=element('input',{type:'checkbox','aria-label':PHOTO_HEIGHTMAP_CONFIRMATION});confirmRow.append(confirm,element('span',{},PHOTO_HEIGHTMAP_CONFIRMATION));
 const canvas=element('canvas',{width:192,height:192,'aria-label':'高度图预览'});canvas.style.cssText='width:192px;height:192px;border:1px solid var(--border);background:#111';
 const info=element('p',{class:'property-footnote','aria-live':'polite'},'尚未选择图片。');
 const apply=button('应用到草稿',()=>run(),'primary'),remove=button('移除导入高度',()=>{onApply(null);info.textContent='已从草稿移除导入高度；保存草稿后生效。';},'secondary');
 const row=element('div',{});row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';row.append(picker,apply,remove);
 panel.append(summary,hint,form,confirmRow,why,canvas,row,info);
 let image=null;
 const sync=()=>{confirmRow.hidden=use.value!=='shadedReference';const needConfirm=use.value==='shadedReference'&&!confirm.checked;apply.disabled=!image||needConfirm;remove.disabled=!getCurrent();
  why.textContent=!image?'':needConfirm?'“应用到草稿”不可用：照片只记录光影，不是高度。请先核对预览，并勾选“'+PHOTO_HEIGHTMAP_CONFIRMATION+'”，确认后才可作为您制作的高度图使用（未确认会被拒绝：MACHINING_SOURCE_CONFLICT）。':'';why.hidden=!why.textContent;};
 // Panel inputs are not draft inputs until applied; keep them out of the dialog's dirty tracking.
 panel.addEventListener('input',e=>{e.stopPropagation();if(e.target!==picker){confirm.checked=e.target===confirm?confirm.checked:false;preview();}sync();});
 panel.addEventListener('change',e=>{if(e.target===use){confirm.checked=false;sync();}});
 picker.addEventListener('change',async()=>{image=null;sync();const f=picker.files?.[0];if(!f)return;info.textContent='正在解码…';try{image=await decodeImageFile(f);info.textContent=`已读取 ${image.name} · ${image.width}×${image.height}`;preview();}catch(e){info.textContent=humanError(e);}sync();});
 function convert(maxSide=Infinity){const r=heightPanelRequest({columns:columns.value,black:black.value,white:white.value,gamma:gamma.value,blur:blur.value,invert:invert.checked,depth:depth.value,keepout:keepout.value,fade:fade.value});const s=maxSide<r.settings.columns||maxSide<r.settings.rows?{...r.settings,columns:Math.min(maxSide,r.settings.columns),rows:Math.min(maxSide,r.settings.rows)}:r.settings;return {r,g:convertRgbaToHeightGrid(image.rgba,image.width,image.height,s)};}
 function preview(){if(!image)return;try{const {g}=convert(128),ctx=canvas.getContext('2d'),d=ctx.createImageData(192,192);for(let y=0;y<192;y++)for(let x=0;x<192;x++){const v=Math.round(255*g.values[Math.floor(y*g.rows/192)*g.columns+Math.floor(x*g.columns/192)]),k=(y*192+x)*4;d.data[k]=d.data[k+1]=d.data[k+2]=v;d.data[k+3]=255;}ctx.putImageData(d,0,0);}catch(e){info.textContent=humanError(e);}}
 // Full-resolution conversion: Services relief.source-convert-1 when advertised (browser re-verifies the grid
 // encoding hash), otherwise the identical browser module. The live preview above stays low-res (≤128).
 let running=false;
 async function run(){
  if(running)return;running=true;apply.disabled=true;
  try{const r=heightPanelRequest({columns:columns.value,black:black.value,white:white.value,gamma:gamma.value,blur:blur.value,invert:invert.checked,depth:depth.value,keepout:keepout.value,fade:fade.value}),interpretation=use.value;
   const params=sourceConvertWorkerParams({width:image.width,height:image.height,settings:r.settings,depthMm:r.depthMm,machiningPrecisionMm:getPrecision()});
   let grid,where='浏览器';
   if(await servicesReady()){info.textContent='正在 Services 转换高度图…';try{const out=await convertRemote({rgba:image.rgba,params,context:window.webcad.api.getState().context,imageSha256:image.sha256});grid=out.grid;where='Services';}catch(e){info.textContent='Services 转换失败，改用浏览器：'+humanError(e);}}
   if(!grid)grid=sourceConvertLocal(image.rgba,params).grid;
   const source=createReliefHeightSource({original:{sha256:image.sha256,name:image.name.slice(0,255)},interpretation,settings:params.settings,grid,...(interpretation==='shadedReference'?{confirmation:confirm.checked?{text:PHOTO_HEIGHTMAP_CONFIRMATION,confirmedAt:new Date().toISOString()}:undefined}:{})});
   onApply({source,depthMm:r.depthMm,edgeKeepoutMm:r.edgeKeepoutMm,edgeFadeMm:r.edgeFadeMm});
   info.textContent=`已应用到草稿（${grid.columns}×${grid.rows}，${where}转换，加工精度 ${params.machiningPrecisionMm} mm${source.derivedFrom?'，照片已确认转换':''}）；保存草稿并重新求解后生效。`;
  }catch(e){info.textContent=humanError(e);}
  finally{running=false;}
  sync();
 }
 sync();
 return {panel,sync,reset(){image=null;picker.value='';confirm.checked=false;info.textContent='尚未选择图片。';sync();}};
}
