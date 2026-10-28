// "从图片导入高度" panel for the relief design dialog.
// Flow: pick image → set 最大凸起高度 → convert (photoRelief auto for shaded photos) → apply to draft (heightmap→fit→BRep).
// Photo / shaded images use mode=photoRelief (no confirmation checkbox). Authored height maps stay luminance.
import {convertRgbaToHeightGrid,encodeHeightGrid,RELIEF_CONVERT_LIMITS,autoGridSize,detectPhotoLikeImage,normalizePhotoReliefParams,PHOTO_RELIEF_DEFAULTS} from '../../relief-source/convert.js';
import {createReliefHeightSource,PHOTO_HEIGHTMAP_CONFIRMATION} from '../../relief-source/source.js';
import {humanError} from '../../error-recovery.js';
import {sourceConvertWorkerParams,sourceConvertLocal,convertSourceOnServices,reliefServicesReady} from '../../services/relief-pipeline.js';

/** Default max protrusion for high-relief feel (several mm relative to a typical plate). */
export const DEFAULT_RELIEF_DEPTH_MM=3;

export async function decodeImageFile(file){
 if(!(file instanceof Blob)||!file.size||file.size>20*1024*1024)throw Object.assign(new Error('图片须为非空文件且不超过 20 MiB'),{code:'RELIEF_LIMIT'});
 const bytes=new Uint8Array(await file.arrayBuffer()),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 let bitmap;try{bitmap=await createImageBitmap(new Blob([bytes],{type:file.type||'image/png'}),{imageOrientation:'from-image'});}catch{throw Object.assign(new Error('无法解码图片；请使用有效的 PNG、JPG 或 WebP'),{code:'RELIEF_IMAGE_INVALID'});}
 try{
  if(bitmap.width*bitmap.height>RELIEF_CONVERT_LIMITS.maxSourcePixels)throw Object.assign(new Error('图片超过 16M 像素'),{code:'RELIEF_LIMIT'});
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
  return {sha256,name:file.name||'image',width:bitmap.width,height:bitmap.height,rgba:ctx.getImageData(0,0,bitmap.width,bitmap.height).data,fileBytes:bytes,mime:file.type||'image/png'};
 }finally{bitmap.close?.();}
}
/** Pure: panel form values -> {settings, depth/edge options}. Exported for tests.
 *  columns blank/'auto' -> autoGridSize(image,sizeMm,precision); an explicit value is the long side (square when no image).
 *  mode: 'luminance' | 'photoRelief' (auto when use=shadedReference). */
export function heightPanelRequest(v,{image,sizeMm,precisionMm}={}){
 const n=(x,label)=>{const y=Number(x);if(String(x).trim()===''||!Number.isFinite(y))throw new Error(label+' 需要数值');return y;};
 const auto=v.columns===undefined||String(v.columns).trim()===''||String(v.columns).trim()==='auto';
 if(auto&&!image)throw new Error('自动网格需要先选择图片');
 const grid=auto?autoGridSize({width:image.width,height:image.height,sizeMm,precisionMm}):image?(()=>{const L=n(v.columns,'网格'),k=L/Math.max(image.width,image.height);return image.width>=image.height?{columns:L,rows:Math.max(2,Math.round(image.height*k))}:{columns:Math.max(2,Math.round(image.width*k)),rows:L};})():{columns:n(v.columns,'网格'),rows:n(v.columns,'网格')};
 const usePhoto=v.mode==='photoRelief'||v.use==='shadedReference'||v.interpretation==='shadedReference';
 const settings={columns:grid.columns,rows:grid.rows,levels:{black:n(v.black??0,'黑点'),white:n(v.white??1,'白点')},gamma:n(v.gamma??1,'Gamma'),blurPx:n(v.blur??0,'模糊'),invert:!!v.invert};
 if(usePhoto){settings.mode='photoRelief';settings.photo=normalizePhotoReliefParams(v.photo??{});}
 return {settings,depthMm:n(v.depth,'最大凸起高度'),edgeKeepoutMm:n(v.keepout??0,'边缘留空'),edgeFadeMm:n(v.fade??0,'边缘过渡'),interpretation:usePhoto?'shadedReference':'authoredHeightMap'};
}
export function createReliefHeightPanel({element,button,field,onApply,getCurrent,getPrecision=()=>.05,getSizeMm=()=>null,servicesReady=()=>reliefServicesReady('reliefSourceConvert'),convertRemote=convertSourceOnServices}){
 const panel=element('details',{}),summary=element('summary',{},'从图片导入高度');
 const hint=element('p',{class:'property-footnote'},'设置最大凸起高度后选图即可：高度图按灰度；照片 / 光影图自动用照片浮雕转换，直接生成可预览的高度场（再求解得 BRep 曲面）。默认偏高浮雕。');
 const why=element('p',{class:'property-footnote','aria-live':'polite'});why.style.cssText='color:var(--warning,#b45309)';
 const form=element('div',{});form.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr));gap:6px 10px';
 const picker=element('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'选择高度图片'});
 const use=element('select',{'aria-label':'图像用途'});
 for(const [v,t] of [['auto','自动（推荐）'],['authoredHeightMap','作者制作的高度图'],['shadedReference','照片 / 高浮雕光影']])use.append(element('option',{value:v},t));
 use.value='auto';
 const num=(label,value,step='any')=>{const i=element('input',{type:'number',step,value,'aria-label':label});field(label,i,form);return i;};
 field('图像用途',use,form);
 const depth=num('最大凸起高度 mm',DEFAULT_RELIEF_DEPTH_MM);
 const columns=num('网格长边（留空=自动：按图像像素与尺寸/精度取 129–1025）','','1'),black=num('黑点 0–1',0),white=num('白点 0–1',1),gamma=num('Gamma',1),blur=num('模糊（网格像素）',0),keepout=num('边缘留空 mm',0),fade=num('边缘过渡 mm',0);
 const invert=element('input',{type:'checkbox','aria-label':'反相'});field('反相（暗色更高）',invert,form);
 // Photo-relief advanced knobs (only meaningful in photo mode)
 const photoFields={};
 for(const [k,label,step] of [
  ['lightingFrac','光照抑制尺度（相对长边）','0.01'],
  ['bodyFrac','形体层尺度','0.01'],
  ['midFrac','中层尺度','0.001'],
  ['fineFrac','细层（鳞片等）尺度','0.001'],
  ['bodyWeight','形体权重','0.05'],
  ['midWeight','中层权重','0.05'],
  ['fineWeight','细层权重','0.05'],
  ['massWeight','体量包络权重','0.05'],
  ['denoisePx','去噪 px','0.1'],
 ]){photoFields[k]=num(label,PHOTO_RELIEF_DEFAULTS[k],step);}
 const tuning=element('details',{'data-relief-image-advanced':'true'}),tuningForm=element('div',{});tuningForm.style.cssText=form.style.cssText;
 tuning.append(element('summary',{},'高级配置'),tuningForm);
 for(const input of [columns,black,white,gamma,blur,keepout,fade,invert,...Object.values(photoFields)])tuningForm.append(input.closest('label'));
 // Legacy confirmation only when forcing luminance on a photo (hidden by default; photoRelief path needs none)
 const confirmRow=element('label',{class:'form-field wide'}),confirm=element('input',{type:'checkbox','aria-label':PHOTO_HEIGHTMAP_CONFIRMATION});confirmRow.append(confirm,element('span',{},'（旧路径）'+PHOTO_HEIGHTMAP_CONFIRMATION));confirmRow.hidden=true;
 const canvas=element('canvas',{width:192,height:192,'aria-label':'高度图预览'});canvas.style.cssText='width:192px;height:192px;border:1px solid var(--border);background:#111';
 const info=element('p',{class:'property-footnote','aria-live':'polite'},'尚未选择图片。');
 const apply=button('应用到草稿',()=>run(),'primary'),remove=button('移除导入高度',()=>{onApply(null);info.textContent='已从草稿移除导入高度；保存草稿后生效。';},'secondary');
 const row=element('div',{});row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';row.append(picker,apply,remove);
 panel.append(summary,hint,form,tuning,confirmRow,why,canvas,row,info);panel.open=true;
 let image=null,detectedPhoto=false;
 const ctx=()=>({image,sizeMm:getSizeMm(),precisionMm:getPrecision()});
 const resolveUse=()=>{
  if(use.value==='authoredHeightMap')return 'authoredHeightMap';
  if(use.value==='shadedReference')return 'shadedReference';
  return detectedPhoto?'shadedReference':'authoredHeightMap';
 };
 const photoParams=()=>{const o={};for(const k of Object.keys(photoFields))o[k]=Number(photoFields[k].value);return o;};
 const sync=()=>{
  const interpretation=resolveUse();
  const needLegacyConfirm=false;// photoRelief path — no checkbox
  confirmRow.hidden=true;
  apply.disabled=!image||needLegacyConfirm;remove.disabled=!getCurrent();
  why.textContent=image&&interpretation==='shadedReference'?'将用照片浮雕（多层高度）转换：深形体 + 中层云雾/褶皱 + 细鳞片纹理，再按最大凸起高度生成曲面。':'';
  why.hidden=!why.textContent;
 };
 panel.addEventListener('input',e=>{e.stopPropagation();if(e.target!==picker)preview();sync();});
 panel.addEventListener('change',e=>{if(e.target===use){confirm.checked=false;preview();sync();}});
 picker.addEventListener('change',async()=>{
  image=null;detectedPhoto=false;sync();const f=picker.files?.[0];if(!f)return;info.textContent='正在解码…';
  try{
   image=await decodeImageFile(f);
   const det=detectPhotoLikeImage(image.rgba,image.width,image.height);
   detectedPhoto=!!det.photoLike;
   if(use.value==='auto')info.textContent=`已读取 ${image.name} · ${image.width}×${image.height}${detectedPhoto?` · 已判为照片/光影（score ${det.score.toFixed(2)}），使用照片浮雕`:' · 按作者高度图'}`;
   else info.textContent=`已读取 ${image.name} · ${image.width}×${image.height}`;
   preview();
   // Straight to convert+apply (toward BRep): no wizard steps.
   await run();
  }catch(e){info.textContent=humanError(e);}sync();
 });
 function convert(maxSide=Infinity){
  const interpretation=resolveUse();
  const r=heightPanelRequest({columns:columns.value,black:black.value,white:white.value,gamma:gamma.value,blur:blur.value,invert:invert.checked,depth:depth.value,keepout:keepout.value,fade:fade.value,use:interpretation,photo:photoParams()},ctx());
  const s=maxSide<r.settings.columns||maxSide<r.settings.rows?{...r.settings,columns:Math.min(maxSide,r.settings.columns),rows:Math.min(maxSide,r.settings.rows)}:r.settings;
  return {r,g:convertRgbaToHeightGrid(image.rgba,image.width,image.height,s)};
 }
 function preview(){if(!image)return;try{const {g}=convert(128),ctx=canvas.getContext('2d'),d=ctx.createImageData(192,192);for(let y=0;y<192;y++)for(let x=0;x<192;x++){const v=Math.round(255*g.values[Math.floor(y*g.rows/192)*g.columns+Math.floor(x*g.columns/192)]),k=(y*192+x)*4;d.data[k]=d.data[k+1]=d.data[k+2]=v;d.data[k+3]=255;}ctx.putImageData(d,0,0);}catch(e){info.textContent=humanError(e);}}
 let running=false;
 async function run(){
  if(running||!image)return;running=true;apply.disabled=true;
  try{
   const interpretation=resolveUse();
   const r=heightPanelRequest({columns:columns.value,black:black.value,white:white.value,gamma:gamma.value,blur:blur.value,invert:invert.checked,depth:depth.value,keepout:keepout.value,fade:fade.value,use:interpretation,photo:photoParams()},ctx());
   const params=sourceConvertWorkerParams({width:image.width,height:image.height,settings:r.settings,depthMm:r.depthMm,machiningPrecisionMm:getPrecision()});
   let grid,settings=params.settings,where='浏览器转换（Services 不可用）';
   let servicesReason='';
   if(await servicesReady()){info.textContent='正在 Services 转换高度图…';try{const out=await convertRemote({rgba:image.rgba,params,context:window.webcad.api.getState().context,imageSha256:image.sha256,fileBytes:image.fileBytes,mime:image.mime,fileName:image.name});grid=out.grid;settings=out.settings??params.settings;where='Services 转换';}catch(e){if(e.code==='SERVICES_CONNECTION_UNKNOWN')throw e;servicesReason=humanError(e);where='已改用浏览器转换';info.textContent=`已改用浏览器转换\nServices 原因：${servicesReason}`;}}
   if(!grid)grid=sourceConvertLocal(image.rgba,params).grid;
   const asked=r.settings,note=asked.columns!==grid.columns||asked.rows!==grid.rows?`，已按节点上限由 ${asked.columns}×${asked.rows} 降采样`:'';
   const source=createReliefHeightSource({original:{sha256:image.sha256,name:image.name.slice(0,255)},interpretation:r.interpretation,settings,grid});
   onApply({source,depthMm:r.depthMm,edgeKeepoutMm:r.edgeKeepoutMm,edgeFadeMm:r.edgeFadeMm});
   const fallbackLine=servicesReason?`\n已改用浏览器转换\nServices 原因：${servicesReason}`:'';
   const modeNote=settings.mode==='photoRelief'?'，照片浮雕':'';
   info.textContent=`已应用到草稿（${grid.columns}×${grid.rows}${String(columns.value).trim()===''?' 自动':''}${note}，最大凸起 ${r.depthMm} mm${modeNote}，${where}，加工精度 ${params.machiningPrecisionMm} mm）；保存草稿并重新求解后生成 BRep 曲面。${fallbackLine}`;
   preview();
  }catch(e){info.textContent=humanError(e);}
  finally{running=false;}
  sync();
 }
 sync();
 function paintFromGrid(g){const c=canvas.getContext('2d'),d=c.createImageData(192,192);for(let y=0;y<192;y++)for(let x=0;x<192;x++){const v=Math.round(255*(g.values?g.values[Math.floor(y*g.rows/192)*g.columns+Math.floor(x*g.columns/192)]:0)),k=(y*192+x)*4;d.data[k]=d.data[k+1]=d.data[k+2]=v;d.data[k+3]=255;}c.putImageData(d,0,0);}
 return {panel,sync,reset(){image=null;detectedPhoto=false;picker.value='';confirm.checked=false;info.textContent='尚未选择图片。';sync();},
  showFromDraft(heightSource){try{const g=heightSource?.source?.grid;if(!g)return;const cols=g.columns,rows=g.rows;let values;
   if(g.encoding==='u16le'&&typeof g.data==='string'){const bytes=Uint8Array.from(atob(g.data),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);values=Float64Array.from({length:cols*rows},(_,i)=>view.getUint16(i*2,true)/65535);}
   else if(Array.isArray(g.values))values=g.values;else return;
   const settings=heightSource.source.settings;invert.checked=settings.invert;black.value=settings.levels.black;white.value=settings.levels.white;gamma.value=settings.gamma;blur.value=settings.blurPx;
   if(settings.mode==='photoRelief'){use.value='shadedReference';if(settings.photo)for(const k of Object.keys(photoFields))if(settings.photo[k]!=null)photoFields[k].value=settings.photo[k];}
   else if(heightSource.source.derivedFrom?.kind==='shadedReference')use.value='shadedReference';
   else use.value='authoredHeightMap';
   paintFromGrid({columns:cols,rows,values});depth.value=heightSource.depthMm??depth.value;keepout.value=heightSource.edgeKeepoutMm??keepout.value;fade.value=heightSource.edgeFadeMm??fade.value;
   info.textContent=`已保留草稿高度预览 ${cols}×${rows}（同草稿重开不清除图像面板）。`;sync();}catch(e){info.textContent=humanError(e);}}};
}
