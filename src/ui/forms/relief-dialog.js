import {readReliefImage} from '../../relief-image.js';

export function showReliefDialog({getState,openDialog,element,button,emit,close}){
 const selected=getState().selectedTopology;
 if(selected?.type!=='face'||selected.ids?.length!==1)return;
 const target=selected.bodyId,faceId=selected.ids[0],d=openDialog('浮雕','导入图案，在选中平面上生成有高低层次的曲面。',{returnToSelect:true});
 let live=true,busy=false,generation=0,ready=false,data=null,file=null,processed=false;
 const status=element('p',{'aria-live':'polite',class:'property-callout'},'请选择 JPG、PNG 或 SVG；图片在本地处理。');
 const form=element('div',{class:'parameter-form'});
 const field=(label,input)=>{const row=element('label',{class:'form-field wide'});row.append(element('span',{},label),input);form.append(row);return input;};
 const number=(label,value)=>field(label,element('input',{type:'number',step:'any',value,'aria-label':label}));
 const select=(label,items)=>{const input=field(label,element('select',{'aria-label':label}));for(const [value,text]of items)input.append(element('option',{value},text));return input;};
 const input=field('图案文件',element('input',{type:'file',accept:'.jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml','aria-label':'浮雕图案文件'}));
 const style=select('起伏方式',[['grayscale','灰度层次'],['rounded','图形柔和鼓起']]);
 const whiteHigh=field('亮色更高（默认暗色更高）',element('input',{type:'checkbox','aria-label':'亮色更高'}));
 const samples=select('图案精度',[['17','快速 · 17'],['33','标准 · 33'],['49','精细 · 49'],['65','高精 · 65']]);samples.value='33';
 const threshold=number('图形阈值（0–1）',.5);threshold.min='0';threshold.max='1';threshold.parentElement.hidden=true;
 const width=number('图案宽 mm',20),height=number('图案高 mm',20),lock=field('保持图案比例',element('input',{type:'checkbox',checked:true,'aria-label':'保持图案比例'}));
 const depth=number('起伏高度 mm',1),mode=select('方向',[['emboss','浮雕 · 向外起伏'],['engrave','凹雕 · 向内起伏']]);
 const advanced=element('details',{});advanced.append(element('summary',{},'位置与旋转'));
 const placement=element('div',{}),offsetX=element('input',{type:'number',step:'any',value:0,'aria-label':'浮雕水平偏移 mm'}),offsetY=element('input',{type:'number',step:'any',value:0,'aria-label':'浮雕垂直偏移 mm'}),angle=element('input',{type:'number',step:'any',value:0,'aria-label':'浮雕旋转 °'});
 for(const [label,control]of [['水平偏移 mm',offsetX],['垂直偏移 mm',offsetY],['旋转 °',angle]]){const row=element('label',{class:'form-field wide'});row.append(element('span',{},label),control);placement.append(row);}advanced.append(placement);form.append(advanced);
 const canvas=element('canvas',{'aria-label':'浮雕高度图'});canvas.style.cssText='display:none;width:100%;max-height:180px;object-fit:contain;border:1px solid var(--border);background:#111';
 const hint=element('p',{class:'property-footnote'},'白色表示较高，黑色表示较低。灰度是高度依据，不代表照片的真实深度。SVG 支持灰度填充和渐变；单色图案可选“图形柔和鼓起”。');
 const apply=button('应用浮雕',async()=>{if(busy||!ready)return;setBusy(true);try{const r=await emit('commitPreview',{});ready=false;if(r===true)close();else status.textContent='应用未完成，请重新预览后再应用。';}finally{if(live)setBusy(false);}},'primary');apply.disabled=true;
 const preview=button('预览曲面',async()=>{if(busy||!file)return;setBusy(true);const ticket=generation;ready=false;
  try{
   await emit('cancelPreview',{});
   if(!processed)await process();
   if(!live||ticket!==generation)return;
   const p=read();status.textContent='正在生成曲面并检查封闭实体…';
   const result=await emit('preview',{op:'relief',params:{...p,_targetRefs:[target]}});
   if(!live||ticket!==generation)return;
   if(!result||result===false){status.textContent='未能生成浮雕；请查看错误，调整大小、位置或高度。';return;}
   ready=true;const report=result.reliefReport;
   status.textContent=report?`预览完成 · ${report.rows}×${report.columns} 高度网格 · ${report.mode==='engrave'?'去除':'增加'} ${(report.removedMm3||report.addedMm3).toFixed(3)} mm³。核对曲面后应用。`:'预览完成，核对曲面后应用。';
  }catch(e){if(live)status.textContent=e.message;}finally{if(live)setBusy(false);}
 },'secondary');preview.disabled=true;
 const foot=element('div',{class:'dialog-footer'});foot.append(button('取消',()=>{d._onClose();emit('cancelPreview',{});close();},'secondary'),preview,apply);
 d.append(status,form,canvas,hint,element('p',{class:'property-footnote'},'当前仅支持平面。图案完整矩形须在选面内并避开孔；位置相对该面的中心。凹雕过深可能穿透，请核对预览。'),foot);
 const controls=[...form.querySelectorAll('input,select')];
 function setBusy(value){busy=value;controls.forEach(el=>el.disabled=value);preview.disabled=value||!file;apply.disabled=value||!ready;}
 function dirty(reprocess=false){generation++;ready=false;apply.disabled=true;if(reprocess)processed=false;status.textContent='参数已改变，请重新预览曲面。';}
 function read(){if(!data)throw new Error('请先读取图片');const n=input=>{if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw new Error('尺寸和位置必须填写有效数值');return Number(input.value);};return {faceId,widthMm:n(width),heightMm:n(height),depthMm:n(depth),mode:mode.value,offsetX:n(offsetX),offsetY:n(offsetY),angleDeg:n(angle),values:data.values,source:data.source};}
 function draw(){canvas.width=data.columns;canvas.height=data.rows;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(canvas.width,canvas.height);for(let j=0;j<data.rows;j++)for(let i=0;i<data.columns;i++){const k=((data.rows-1-j)*data.columns+i)*4,v=Math.round(data.values[j][i]*255);pixels.data.set([v,v,v,255],k);}ctx.putImageData(pixels,0,0);canvas.style.display='block';}
 async function process(){data=await readReliefImage(file,{name:file.name,samples:Number(samples.value),whiteHigh:whiteHigh.checked,style:style.value,threshold:Number(threshold.value)});if(!live)return;processed=true;if(lock.checked)height.value=String(Number(width.value)/data.aspectRatio);draw();}
 input.addEventListener('change',async()=>{if(busy)return;file=input.files?.[0]??null;data=null;dirty(true);if(!file){canvas.style.display='none';preview.disabled=true;return;}setBusy(true);try{await emit('cancelPreview',{});await process();if(live)status.textContent=`已读取 ${file.name} · ${data.columns}×${data.rows} · ${data.interpretation}。点击预览曲面。`;}catch(e){processed=false;status.textContent=e.message;}finally{if(live)setBusy(false);}});
 for(const el of [style,whiteHigh,samples,threshold])el.addEventListener('change',()=>{threshold.parentElement.hidden=style.value!=='rounded';dirty(true);});
 width.addEventListener('input',()=>{if(lock.checked&&data)height.value=String(Number(width.value)/data.aspectRatio);dirty();});
 height.addEventListener('input',()=>{if(lock.checked&&data)width.value=String(Number(height.value)*data.aspectRatio);dirty();});
 for(const el of [depth,mode,offsetX,offsetY,angle,lock])el.addEventListener('input',()=>dirty());
 d._onClose=()=>{live=false;generation++;};
}
