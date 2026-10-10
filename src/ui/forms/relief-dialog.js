import {readReliefImage} from '../../relief-image.js';

export function showReliefDialog({getState,openDialog,element,button,emit,close}){
 const selected=getState().selectedTopology;
 if(selected?.type!=='face'||selected.ids?.length!==1)return;
 const target=selected.bodyId,faceId=selected.ids[0],point=selected.point?[...selected.point]:undefined,d=openDialog('浮雕','导入图案，在选中的平面或外凸圆柱面上生成高低起伏。',{returnToSelect:true});
 d.dataset.previewCapable='true';
 let live=true,busy=false,generation=0,ready=false,data=null,file=null,processed=false;
 const status=element('p',{'aria-live':'polite',class:'property-callout'},'请选择 JPG、PNG、SVG 或分层 .relief.json；文件在本地处理。');
 const form=element('div',{class:'parameter-form'});
 const field=(label,input)=>{const row=element('label',{class:'form-field wide'});row.append(element('span',{},label),input);form.append(row);return input;};
 const number=(label,value)=>field(label,element('input',{type:'number',step:'any',value,'aria-label':label}));
 const select=(label,items)=>{const input=field(label,element('select',{'aria-label':label}));for(const [value,text]of items)input.append(element('option',{value},text));return input;};
 const input=field('图案文件',element('input',{type:'file',accept:'.jpg,.jpeg,.png,.svg,.json,image/jpeg,image/png,image/svg+xml,application/json','aria-label':'浮雕图案文件'}));
 const style=select('起伏方式',[['flat','清晰平顶 · 文字/标志'],['rounded','图形柔和鼓起'],['grayscale','灰度层次']]);
 const whiteHigh=field('亮色更高（默认暗色更高）',element('input',{type:'checkbox','aria-label':'亮色更高'}));
 const samples=select('图案精度',[['17','快速 · 17'],['33','标准 · 33'],['49','精细 · 49'],['65','高精 · 65']]);samples.value='33';
 const threshold=number('图形阈值（0–1）',.5);threshold.min='.001';threshold.max='.999';
 const width=number('图案宽 mm',20),height=number('图案高 mm',20),lock=field('保持图案比例',element('input',{type:'checkbox',checked:true,'aria-label':'保持图案比例'}));
 const depth=number('起伏高度 mm',1),mode=select('方向',[['emboss','浮雕 · 向外起伏'],['engrave','凹雕 · 向内起伏']]);
 const curveTolerance=number('曲线拟合公差 mm（0 保留折线）',.005);curveTolerance.min='0';curveTolerance.max='.05';
 const curvePolicy=select('轮廓精修',[['preserveTopology','保留孔和细窄边界'],['fitWithinTolerance','按公差拟合（兼容旧配方）']]);
 const contourSnap=number('轮廓清理精度 mm（0 关闭）',0);contourSnap.min='0';contourSnap.max='.05';
 const layerPanel=element('div',{'aria-label':'矢量浮雕分层'});layerPanel.hidden=true;form.append(layerPanel);let layerControls=[];
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
   status.textContent=report?.layerCount?`预览完成 · ${report.layerCount} 个矢量层。核对层次、刻线及原表面后应用。`:report?`预览完成 · ${report.rows}×${report.columns} 高度网格 · ${report.mode==='engrave'?'去除':'增加'} ${(report.removedMm3||report.addedMm3).toFixed(3)} mm³。核对曲面后应用。`:'预览完成，核对曲面后应用。';
  }catch(e){if(live)status.textContent=e.message;}finally{if(live)setBusy(false);}
 },'secondary');preview.disabled=true;
 const foot=element('div',{class:'dialog-footer'});foot.append(button('取消',()=>{d._onClose();emit('cancelPreview',{});close();},'secondary'),preview,apply);
 d.append(status,form,canvas,hint,element('p',{class:'property-footnote'},'空白区域保持原表面，不生成矩形底层。平顶高度从放置中心的切平面计算；圆润模式保留图案内起伏。平面位置相对面中心；柱面相对点击处，水平沿圆周、垂直沿轴线，角宽≤90°、旋转为0°。图案须避开边界、孔和接缝。凹雕过深可能穿透，请核对预览。'),foot);
 function setBusy(value){busy=value;form.querySelectorAll('input,select').forEach(el=>el.disabled=value);preview.disabled=value||!file;apply.disabled=value||!ready;}
 function dirty(reprocess=false){generation++;ready=false;apply.disabled=true;if(reprocess)processed=false;status.textContent='参数已改变，请重新预览曲面。';}
 function read(){if(!data)throw new Error('请先读取图案');const n=input=>{if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw new Error('尺寸和位置必须填写有效数值');return Number(input.value);};return {faceId,...(point?{point}:{}),widthMm:n(width),heightMm:n(height),depthMm:n(depth),curveToleranceMm:n(curveTolerance),curvePolicy:curvePolicy.value,maskStrategy:'faceWithHolesExtrude',compileLayers:'groupCompatible',contourSnapMm:n(contourSnap),mode:mode.value,offsetX:n(offsetX),offsetY:n(offsetY),angleDeg:n(angle),...(data.layers?{layers:data.layers.map((layer,i)=>({...layer,heightMm:n(layerControls[i].height),startHeightMm:n(layerControls[i].start),mode:layerControls[i].mode.value}))}:{values:data.values,regions:data.regions,surfaceMode:data.surfaceMode}),source:data.source};}
 function draw(){const ctx=canvas.getContext('2d');if(data.layers){canvas.width=700;canvas.height=Math.round(700/data.aspectRatio);ctx.fillStyle='#202a33';ctx.fillRect(0,0,canvas.width,canvas.height);for(const [i,layer]of data.layers.entries()){ctx.fillStyle=`hsl(${(i*67+32)%360} 55% 65%)`;for(const r of layer.regions??[]){ctx.beginPath();for(const ring of [r.outer,...r.holes??[]]){ring.forEach(([x,y],k)=>ctx[k?'lineTo':'moveTo']((x+.5)*canvas.width,(.5-y)*canvas.height));ctx.closePath();}ctx.fill('evenodd');}ctx.strokeStyle=ctx.fillStyle;ctx.lineCap='round';ctx.lineJoin='round';for(const stroke of layer.strokes??[]){ctx.lineWidth=stroke.widthMm/Number(width.value)*canvas.width;ctx.beginPath();stroke.points.forEach(([x,y],k)=>ctx[k?'lineTo':'moveTo']((x+.5)*canvas.width,(.5-y)*canvas.height));ctx.stroke();}}}else{canvas.width=data.columns;canvas.height=data.rows;const pixels=ctx.createImageData(canvas.width,canvas.height);for(let j=0;j<data.rows;j++)for(let i=0;i<data.columns;i++){const k=((data.rows-1-j)*data.columns+i)*4,v=Math.round(data.values[j][i]*255);pixels.data.set([v,v,v,255],k);}ctx.putImageData(pixels,0,0);}canvas.style.display='block';}
 function showLayers(){layerPanel.replaceChildren();layerControls=[];layerPanel.hidden=!data.layers;for(const el of [style,whiteHigh,samples,threshold,depth,mode])el.parentElement.hidden=!!data.layers;if(!data.layers)return;for(const [i,layer]of data.layers.entries()){const row=element('label',{class:'form-field wide'}),heightInput=element('input',{type:'number',step:'any',min:'.01',max:'20',value:layer.heightMm,'aria-label':`第${i+1}层高度 mm`}),startInput=element('input',{type:'number',step:'any',min:'0',value:layer.startHeightMm??0,'aria-label':`第${i+1}层起点 mm`}),modeInput=element('select',{'aria-label':`第${i+1}层方向`});for(const [value,label]of [['emboss','凸起'],['engrave','凹刻']])modeInput.append(element('option',{value},label));modeInput.value=layer.mode??'emboss';row.append(element('span',{},layer.name??`第 ${i+1} 层`),heightInput,startInput,modeInput);layerPanel.append(row);layerControls.push({height:heightInput,start:startInput,mode:modeInput});heightInput.addEventListener('input',()=>dirty());startInput.addEventListener('input',()=>dirty());modeInput.addEventListener('change',()=>dirty());}}
 async function process(){data=await readReliefImage(file,{name:file.name,samples:Number(samples.value),whiteHigh:whiteHigh.checked,style:style.value,threshold:Number(threshold.value)});if(!live)return;processed=true;if(data.layers){width.value=String(data.widthMm);height.value=String(data.heightMm);curveTolerance.value=String(data.curveToleranceMm);contourSnap.value=String(data.contourSnapMm??0);}else if(lock.checked)height.value=String(Number(width.value)/data.aspectRatio);showLayers();draw();}
 input.addEventListener('change',async()=>{if(busy)return;file=input.files?.[0]??null;data=null;dirty(true);if(!file){canvas.style.display='none';preview.disabled=true;return;}setBusy(true);try{await emit('cancelPreview',{});await process();if(live)status.textContent=`已读取 ${file.name} · ${data.columns}×${data.rows} · ${data.interpretation}。点击预览曲面。`;}catch(e){processed=false;status.textContent=e.message;}finally{if(live)setBusy(false);}});
 for(const el of [style,whiteHigh,samples,threshold])el.addEventListener('change',()=>{threshold.parentElement.hidden=style.value==='grayscale';dirty(true);});
 width.addEventListener('input',()=>{if(lock.checked&&data)height.value=String(Number(width.value)/data.aspectRatio);dirty();});
 height.addEventListener('input',()=>{if(lock.checked&&data)width.value=String(Number(height.value)*data.aspectRatio);dirty();});
 for(const el of [depth,mode,curveTolerance,curvePolicy,contourSnap,offsetX,offsetY,angle,lock])el.addEventListener('input',()=>dirty());
 d._onClose=()=>{live=false;generation++;};
}
