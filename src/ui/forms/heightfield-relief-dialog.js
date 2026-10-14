// Grayscale height map -> closed mesh relief. Decoding/resampling happens here
// (canvas); the recipe stores the resampled samples so rebuilds are deterministic.
import {HEIGHTFIELD_LIMITS} from '../../mesh/heightfield-relief.js';
const UI_CANVAS=360;
export async function grayscaleSamples(blob,columns){
 const bitmap=await createImageBitmap(blob),aspect=bitmap.width/bitmap.height,rows=Math.max(2,Math.round(columns*bitmap.height/bitmap.width));
 if(columns*rows>HEIGHTFIELD_LIMITS.maxSamples||rows>HEIGHTFIELD_LIMITS.maxSide)throw Error(`分辨率过高：${columns}×${rows} 超过 ${HEIGHTFIELD_LIMITS.maxSamples} 采样点。`);
 const canvas=new OffscreenCanvas(columns,rows),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,columns,rows);bitmap.close?.();
 const rgba=ctx.getImageData(0,0,columns,rows).data,bytes=new Uint8Array(columns*rows);
 for(let i=0;i<bytes.length;i++){const a=rgba[i*4+3]/255;bytes[i]=Math.round((.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2])*a);}
 return {columns,rows,aspect,bytes};
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
  return {version:1,widthMm:w,depthMm:+(w/samples.aspect).toFixed(4),baseMm:Number(base.value),heightMm:Number(height.value),columns:samples.columns,rows:samples.rows,heights:{encoding:'u8'},bytes:samples.bytes,name:file.name,invert:invert.checked,gamma:Number(gamma.value),smoothing:Number(smoothing.value),edgeFadeMm:Number(fade.value)};};
 const apply=button('应用浮雕',async()=>{if(!ready||busy)return;busy=true;try{if(await emit('commitPreview',{})===true){ready=false;close();}}finally{busy=false;}},'primary');
 const preview=button('预览浮雕',async()=>{if(busy)return;busy=true;ready=false;apply.disabled=true;try{status.textContent='正在采样并生成网格…';await emit('cancelPreview',{});const {bytes,name,...params}=await read();ready=!!await emit('preview',{op:'meshHeightfieldRelief',params,heightmapAsset:{bytes,name}});status.textContent=ready?`预览完成：${params.columns}×${params.rows} 采样，约 ${(2*(params.columns-1)*(params.rows-1)).toLocaleString()} 个顶面三角形。`:'未能生成，请检查参数。';}catch(e){status.textContent=e.message;}finally{busy=false;apply.disabled=!ready;}},'secondary');
 form.addEventListener('input',()=>{ready=false;apply.disabled=true;emit('cancelPreview',{});});d.dataset.previewCapable='true';d._onClose=()=>{if(ready)emit('cancelPreview',{});};
 const foot=element('div',{class:'dialog-footer'});foot.append(button('取消',()=>{emit('cancelPreview',{});close();},'secondary'),preview,apply);
 d.append(form,status,element('p',{class:'property-footnote'},'灰度只按“作者制作的高度图”解释，照片的光影不等于深度。结果是封闭三角网格（STL），不是精确曲面。'),foot);apply.disabled=true;
}

// Brush sculpting on the heightfield grid: paint on a top-view height image,
// strokes are appended to params.sculpt (one history step per apply).
export function showHeightfieldSculptDialog({openDialog,element,button,emit,state,preview,close}){
 const id=state.selectedIds?.length===1?state.selectedIds[0]:null,data=id?preview(id):null;
 const d=openDialog('高度图精修','在俯视高度图上拖动绘制笔画，应用后重建浮雕。',{returnToSelect:true});
 if(!data){d.append(element('p',{},'请先只选择一个“高度图浮雕”实体。'));const foot=element('div',{class:'dialog-footer'});foot.append(button('关闭',close,'secondary'));d.append(foot);return;}
 const {params,heights}=data,form=element('div',{class:'parameter-form'}),status=element('p',{'aria-live':'polite'},`已有 ${params.sculpt?.length||0} 笔。`);
 const field=(label,attrs)=>{const row=element('label',{class:'form-field wide'}),el=element(attrs.tag||'input',{'aria-label':label,...attrs});row.append(element('span',{},label),el);form.append(row);return el;};
 const mode=field('笔刷',{tag:'select'});for(const [v,t] of [['raise','抬高'],['lower','压低'],['smooth','平滑'],['flatten','压平到目标高度']]){const o=element('option',{value:v},t);mode.append(o);}
 const radius=field('半径（mm）',{type:'number',step:'any',value:Math.max(params.widthMm,params.depthMm)/20}),strength=field('强度（抬高/压低为每点 mm；平滑/压平为 0–1）',{type:'number',step:'any',value:.2}),target=field('压平目标高度（mm，相对底板顶面）',{type:'number',step:'any',value:0});
 const aspect=params.widthMm/params.depthMm,cw=aspect>=1?UI_CANVAS:Math.round(UI_CANVAS*aspect),ch=aspect>=1?Math.round(UI_CANVAS/aspect):UI_CANVAS;
 const canvas=element('canvas',{width:cw,height:ch,'aria-label':'高度图画布',style:'cursor:crosshair;border:1px solid #c8d0da;max-width:100%;touch-action:none'}),ctx=canvas.getContext('2d');
 let maxH=0,minH=0;for(const v of heights){if(v>maxH)maxH=v;if(v<minH)minH=v;}
 const img=ctx.createImageData(cw,ch);for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const i=Math.min(params.columns-1,Math.round(x/(cw-1)*(params.columns-1))),j=Math.min(params.rows-1,Math.round(y/(ch-1)*(params.rows-1))),g=Math.round(255*(heights[j*params.columns+i]-minH)/((maxH-minH)||1)),k=(y*cw+x)*4;img.data.set([g,g,g,255],k);}
 ctx.putImageData(img,0,0);
 const strokes=[];let current=null;
 const toMm=e=>{const r=canvas.getBoundingClientRect();return [+((((e.clientX-r.left)/r.width)-.5)*params.widthMm).toFixed(3),+((.5-(e.clientY-r.top)/r.height)*params.depthMm).toFixed(3)];};
 const dot=([x,y])=>{ctx.fillStyle={raise:'rgba(220,60,40,.35)',lower:'rgba(40,90,220,.35)',smooth:'rgba(40,170,90,.35)',flatten:'rgba(200,160,30,.35)'}[mode.value];ctx.beginPath();ctx.arc((x/params.widthMm+.5)*cw,(.5-y/params.depthMm)*ch,Number(radius.value)/params.widthMm*cw,0,7);ctx.fill();};
 canvas.addEventListener('pointerdown',e=>{const r=Number(radius.value),s=Number(strength.value);if(!(r>0)||!(s>=0&&s<=10)){status.textContent='半径须为正，强度 0–10。';return;}canvas.setPointerCapture(e.pointerId);current={mode:mode.value,radiusMm:r,strength:s,...(mode.value==='flatten'?{targetMm:Number(target.value)}:{}),points:[]};const p=toMm(e);current.points.push(...p);dot(p);});
 canvas.addEventListener('pointermove',e=>{if(!current)return;const p=toMm(e),n=current.points.length,last=[current.points[n-2],current.points[n-1]];if(Math.hypot(p[0]-last[0],p[1]-last[1])<current.radiusMm/3)return;current.points.push(...p);dot(p);});
 canvas.addEventListener('pointerup',()=>{if(current?.points.length){strokes.push(current);status.textContent=`待应用 ${strokes.length} 笔（已有 ${params.sculpt?.length||0} 笔）。`;}current=null;});
 const apply=button('应用笔画',async()=>{if(!strokes.length)return;status.textContent='正在重建…';await emit('heightfieldSculpt',{featureId:id,strokes});close();},'primary');
 const undo=button('撤销上一笔',async()=>{if(!params.sculpt?.length)return;await emit('heightfieldSculpt',{featureId:id,undo:true});close();},'secondary');
 const foot=element('div',{class:'dialog-footer'});foot.append(button('取消',close,'secondary'),undo,apply);
 d.append(form,canvas,status,element('p',{class:'property-footnote'},'笔画按顺序记录在工程里，重建结果确定；也可用全局撤销。'),foot);
}
export function showMeshBooleanDialog({openDialog,element,button,emit,state,close}){
 const d=openDialog('网格布尔合并','按选择顺序合并实体为封闭网格（manifold-3d）；精确实体先细分。',{returnToSelect:true}),form=element('div',{class:'parameter-form'}),status=element('p',{'aria-live':'polite'},`已选 ${state.selectedIds?.length||0} 个实体（需 2–16 个）。`);let ready=false;
 const row=element('label',{class:'form-field wide'}),op=element('select',{'aria-label':'运算'});for(const [v,t] of [['union','并集'],['subtract','差集（第一个减其余）'],['intersect','交集']])op.append(element('option',{value:v},t));row.append(element('span',{},'运算'),op);form.append(row);
 const trow=element('label',{class:'form-field wide'}),tol=element('input',{'aria-label':'精确实体细分精度（mm）',type:'number',step:'any',value:.05});trow.append(element('span',{},'精确实体细分精度（mm）'),tol);form.append(trow);
 const apply=button('应用合并',async()=>{if(!ready)return;if(await emit('commitPreview',{})===true){ready=false;close();}},'primary');
 const preview=button('预览合并',async()=>{ready=false;apply.disabled=true;status.textContent='正在计算…';await emit('cancelPreview',{});ready=!!await emit('preview',{op:'meshBoolean',params:{version:1,operation:op.value,toleranceMm:Number(tol.value)}});status.textContent=ready?'预览完成。':'未能生成，请检查输入是否为封闭实体。';apply.disabled=!ready;},'secondary');
 d.dataset.previewCapable='true';d._onClose=()=>{if(ready)emit('cancelPreview',{});};const foot=element('div',{class:'dialog-footer'});foot.append(button('取消',()=>{emit('cancelPreview',{});close();},'secondary'),preview,apply);d.append(form,status,element('p',{class:'property-footnote'},'结果为三角网格，可导出 STL；不生成 STEP 精确曲面。'),foot);apply.disabled=true;
}
