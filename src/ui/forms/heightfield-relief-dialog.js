// Grayscale height map -> closed mesh relief. Decoding/resampling happens here
// (canvas); the recipe stores the resampled samples so rebuilds are deterministic.
import {HEIGHTFIELD_LIMITS} from '../../mesh/heightfield-relief.js';
export async function grayscaleSamples(blob,columns){
 const bitmap=await createImageBitmap(blob),aspect=bitmap.width/bitmap.height,rows=Math.max(2,Math.round(columns*bitmap.height/bitmap.width));
 if(columns*rows>HEIGHTFIELD_LIMITS.maxSamples||rows>HEIGHTFIELD_LIMITS.maxSide)throw Error(`分辨率过高：${columns}×${rows} 超过 ${HEIGHTFIELD_LIMITS.maxSamples} 采样点。`);
 const canvas=new OffscreenCanvas(columns,rows),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,columns,rows);bitmap.close?.();
 const rgba=ctx.getImageData(0,0,columns,rows).data,bytes=new Uint8Array(columns*rows);
 for(let i=0;i<bytes.length;i++){const a=rgba[i*4+3]/255;bytes[i]=Math.round((.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2])*a);}
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return {columns,rows,aspect,heights:{encoding:'u8',data:btoa(binary)}};
}
export function showHeightfieldReliefDialog({openDialog,element,button,emit,close}){
 const d=openDialog('高度图浮雕','用作者制作的灰度高度图（白高黑低）生成封闭网格浮雕，可导出 STL 打印。',{returnToSelect:true}),form=element('div',{class:'parameter-form'}),status=element('p',{'aria-live':'polite'},'选择 PNG/JPG 高度图。');let ready=false,busy=false,file=null;
 const field=(label,attrs)=>{const row=element('label',{class:'form-field wide'}),el=element('input',{'aria-label':label,...attrs});row.append(element('span',{},label),el);form.append(row);return el;};
 const picker=field('高度图文件',{type:'file',accept:'image/png,image/jpeg,image/webp'});
 const width=field('宽度 X（mm）',{type:'number',step:'any',value:50}),base=field('底板厚（mm）',{type:'number',step:'any',value:2}),height=field('浮雕高度（mm）',{type:'number',step:'any',value:3});
 const resolution=field('横向采样数（2–2049）',{type:'number',step:1,value:512}),smoothing=field('平滑次数（0–8）',{type:'number',step:1,value:1}),gamma=field('高度曲线 gamma（0.2–5）',{type:'number',step:'any',value:1}),fade=field('边缘渐隐（mm）',{type:'number',step:'any',value:0});
 const invertRow=element('label',{class:'checkbox-field'}),invert=element('input',{type:'checkbox','aria-label':'反相（黑高白低）'});invertRow.append(invert,document.createTextNode('反相（黑高白低 / 凹雕）'));form.append(invertRow);
 picker.addEventListener('change',()=>{file=picker.files?.[0]||null;});
 const read=async()=>{if(!file)throw Error('请先选择高度图。');const n=Number(resolution.value);if(!Number.isInteger(n)||n<2||n>HEIGHTFIELD_LIMITS.maxSide)throw Error('横向采样数须为 2–2049 的整数。');
  const samples=await grayscaleSamples(file,n),w=Number(width.value);
  return {version:1,widthMm:w,depthMm:+(w/samples.aspect).toFixed(4),baseMm:Number(base.value),heightMm:Number(height.value),columns:samples.columns,rows:samples.rows,heights:samples.heights,invert:invert.checked,gamma:Number(gamma.value),smoothing:Number(smoothing.value),edgeFadeMm:Number(fade.value)};};
 const apply=button('应用浮雕',async()=>{if(!ready||busy)return;busy=true;try{if(await emit('commitPreview',{})===true){ready=false;close();}}finally{busy=false;}},'primary');
 const preview=button('预览浮雕',async()=>{if(busy)return;busy=true;ready=false;apply.disabled=true;try{status.textContent='正在采样并生成网格…';await emit('cancelPreview',{});const params=await read();ready=!!await emit('preview',{op:'meshHeightfieldRelief',params});status.textContent=ready?`预览完成：${params.columns}×${params.rows} 采样，约 ${(2*(params.columns-1)*(params.rows-1)).toLocaleString()} 个顶面三角形。`:'未能生成，请检查参数。';}catch(e){status.textContent=e.message;}finally{busy=false;apply.disabled=!ready;}},'secondary');
 form.addEventListener('input',()=>{ready=false;apply.disabled=true;emit('cancelPreview',{});});d.dataset.previewCapable='true';d._onClose=()=>{if(ready)emit('cancelPreview',{});};
 const foot=element('div',{class:'dialog-footer'});foot.append(button('取消',()=>{emit('cancelPreview',{});close();},'secondary'),preview,apply);
 d.append(form,status,element('p',{class:'property-footnote'},'灰度只按“作者制作的高度图”解释，照片的光影不等于深度。结果是封闭三角网格（STL），不是精确曲面。'),foot);apply.disabled=true;
}
