import {humanError} from '../../error-recovery.js';
import {uiPatternIntent} from '../../machining-intent.js';
import {readReliefImage} from '../../relief-image.js';
import {bindReliefEditor} from '../../relief-ui-state.js';
import './relief-dialog.css';

export function showReliefDialog({getState,openDialog,element,button,emit,close,onPlacement,onDesign,setTargetRefresh=()=>{}}){
 const selected=getState().selectedTopology;
 if(selected?.type!=='face'||selected.ids?.length!==1)return;
 let target=selected.bodyId,faceId=selected.ids[0],point=selected.point?[...selected.point]:undefined,targetRevision=getState().revision;
 const d=openDialog('浮雕','导入图案，调整起伏，在模型上定位后预览。',{returnToSelect:true});
 d.dataset.previewCapable='true';d._acceptSelection=true;d.classList.add('relief-wizard');
 let live=true,busy=false,generation=0,ready=false,data=null,file=null,processed=false,guide=null,guideTimer=null,guideSequence=0,large=null,canceling=Promise.resolve();
 const status=element('p',{'aria-live':'polite',class:'property-callout'},'选择图案文件，保留原始轮廓和孔洞。');
 const targetText=element('p',{class:'property-footnote'});
 const form=element('div',{class:'parameter-form relief-form'});
 const field=(label,input,parent=form)=>{const row=element('label',{class:'form-field'});row.append(element('span',{},label),input);parent.append(row);return input;};
 const number=(label,value)=>field(label,element('input',{type:'number',step:'any',value,'aria-label':label,name:label}));
 const select=(label,items)=>{const input=field(label,element('select',{'aria-label':label,name:label}));for(const [value,text]of items)input.append(element('option',{value},text));return input;};
 const input=field('图案文件',element('input',{type:'file',accept:'.jpg,.jpeg,.png,.svg,.json,image/jpeg,image/png,image/svg+xml,application/json','aria-label':'浮雕图案文件'}));input.parentElement.classList.add('wide');
 const sourceInterpretation=select('图像用途',[['rasterArtwork','图案 · 柔和鼓起'],['authoredHeightMap','高度图 · 保留灰度层次'],['shadedReference','照片 / 光影参考']]);sourceInterpretation.parentElement.classList.add('wide');
 const width=number('图案宽 mm',20),height=number('图案高 mm',20),depth=number('起伏高度 mm',1),mode=select('方向',[['emboss','凸起'],['engrave','凹刻']]);
 for(const n of [width,height,depth]){n.min='.001';n.step='.1';}
 const lock=field('保持图案比例',element('input',{type:'checkbox',checked:true,'aria-label':'保持图案比例'}));lock.parentElement.classList.add('wide','relief-check');
 const thumbnail=button('',()=>showLarge(),'secondary relief-thumbnail');thumbnail.setAttribute('aria-label','放大浮雕高度图');thumbnail.hidden=true;
 const canvas=element('canvas',{'aria-label':'浮雕高度图'});thumbnail.append(canvas,element('span',{},'高度图 · 点击放大'));form.append(thumbnail);
 const advanced=element('details',{class:'wide relief-options'}),tuning=element('div',{class:'relief-form'});advanced.append(element('summary',{},'图像与轮廓设置'),tuning);form.append(advanced);
 const style=select('起伏方式',[['rounded','图形柔和鼓起'],['grayscale','灰度层次']]);
 const whiteHigh=field('亮色更高（默认暗色更高）',element('input',{type:'checkbox','aria-label':'亮色更高'}));
 const samples=select('图案精度',[['17','快速'],['33','标准'],['49','精细'],['65','高精']]);samples.value='33';
 const threshold=number('图形阈值（0–1）',.5);threshold.min='.001';threshold.max='.999';
 const curveTolerance=number('曲线拟合公差 mm（0 保留折线）',.005);curveTolerance.min='0';curveTolerance.max='.05';
 const curvePolicy=select('轮廓精修',[['preserveTopology','保留孔和细窄边界'],['fitWithinTolerance','按公差拟合（兼容旧配方）']]);
 const contourSnap=number('轮廓清理精度 mm（0 关闭）',0);contourSnap.min='0';contourSnap.max='.05';
 for(const control of [style,whiteHigh,samples,threshold,curveTolerance,curvePolicy,contourSnap])tuning.append(control.parentElement);
 const layerPanel=element('div',{'aria-label':'矢量浮雕分层',class:'wide'});layerPanel.hidden=true;form.append(layerPanel);let layerControls=[];
 const placement=element('details',{class:'wide relief-options'}),placementForm=element('div',{class:'relief-form'});placement.append(element('summary',{},'精确位置与旋转'),placementForm);form.append(placement);
 const offsetX=field('水平偏移 mm',element('input',{type:'number',step:'.1',value:0,'aria-label':'浮雕水平偏移 mm',name:'offsetX'}),placementForm),offsetY=field('垂直偏移 mm',element('input',{type:'number',step:'.1',value:0,'aria-label':'浮雕垂直偏移 mm',name:'offsetY'}),placementForm),angle=field('旋转 °',element('input',{type:'number',step:'1',value:0,'aria-label':'浮雕旋转 °',name:'angleDeg'}),placementForm);
 const position=button('画布定位',()=>refreshGuide(),'secondary'),chooseFace=button('更换目标面',()=>{stopGuide();emit('selectMode',{mode:'face'});status.textContent='点击模型的新目标面；图案和尺寸会保留。';},'secondary');
 const imageDesign=button('使用图片浮雕',async()=>{if(busy||!file||sourceInterpretation.value!=='authoredHeightMap')return;const p=read(),source=file;close();await onDesign?.({file:source,params:p});},'secondary');imageDesign.hidden=true;
 const placementActions=element('div',{class:'relief-actions wide'});placementActions.append(position,chooseFace,imageDesign);form.append(placementActions);
 const help=element('details',{class:'wide relief-options'});help.append(element('summary',{},'使用说明'),element('p',{class:'property-footnote'},'白色表示较高，黑色表示较低。照片光影不等于几何高度；灰度层次只接受作者制作的高度图。空白区域保持原表面，不生成矩形底层。平面偏移相对面中心；外凸柱面相对点击处，水平沿圆周、垂直沿轴线，角宽≤90°且旋转为0°。画布边距按面的投影外框显示，孔和真实边界以曲面预览检查为准。'));form.append(help);
 const apply=button('应用浮雕',async()=>{if(busy||!ready)return;setBusy(true);try{const r=await emit('commitPreview',{});ready=false;if(r===true)close();else status.textContent='应用未完成，请重新预览后再应用。';}finally{if(live)setBusy(false);}},'primary');apply.disabled=true;
 const preview=button('预览曲面',async()=>{if(busy||!file)return;setBusy(true);const ticket=generation;ready=false;stopGuide();
  try{await canceling;await emit('cancelPreview',{});if(!processed)await process();if(!live||ticket!==generation)return;
   const p=read();status.textContent='正在生成浮雕预览…';const t0=performance.now();
   const timer=setInterval(()=>{const routing=window.webcad?.api?.getServicesRouting?.();const remote=routing?.lastDecision?.executor==='remote';status.textContent=`${remote?'后台服务':'浏览器'}正在计算浮雕 · ${((performance.now()-t0)/1000).toFixed(0)} 秒${routing?.pendingWait?.jobId?' · 同一任务等待中':''}`;},1000);
   let result;try{result=await emit('preview',{op:'relief',params:{...p,_targetRefs:[target]}});}finally{clearInterval(timer);}
   if(!live||ticket!==generation)return;if(!result||result===false){status.textContent='未能生成浮雕；请查看错误，调整大小、位置或高度。';return;}
   ready=true;const report=result.reliefReport,routing=window.webcad?.api?.getServicesRouting?.(),executor=routing?.lastDecision?.executor==='remote'?'后台服务':'浏览器';
   status.textContent=`预览完成 · ${executor} · ${((performance.now()-t0)/1000).toFixed(1)} 秒。`+(report?.layerCount?`${report.layerCount} 个矢量层；核对层次和原表面后应用。`:report?`${report.mode==='engrave'?'去除':'增加'} ${(report.removedMm3||report.addedMm3||0).toFixed(3)} mm³；核对位置和起伏后应用。`:'核对位置和起伏后应用。');
  }catch(e){if(live)status.textContent=humanError(e);}finally{if(live)setBusy(false);}
 },'primary');preview.disabled=true;
 const foot=element('div',{class:'dialog-footer relief-footer'});foot.append(button('取消',()=>{close();},'secondary'),preview,apply);d.append(targetText,form,status,foot);
 function setBusy(value){busy=value;imageDesign.hidden=sourceInterpretation.value!=='authoredHeightMap'||!file;d.setAttribute('aria-busy',String(value));form.querySelectorAll('input,select,button').forEach(el=>el.disabled=value);preview.disabled=value||!file;apply.disabled=value||!ready;apply.hidden=!ready;preview.classList.toggle('secondary',ready);}
 function dirty(reprocess=false){generation++;if(ready)canceling=canceling.then(()=>emit('cancelPreview',{}));ready=false;apply.disabled=true;apply.hidden=true;preview.classList.remove('secondary');if(reprocess){processed=false;stopGuide();}status.textContent='参数已改变，请重新预览曲面。';}
 function read(){if(!data)throw new Error('请先读取图案');const n=input=>{if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw new Error('尺寸和位置必须填写有效数值');return Number(input.value);};return {faceId,...(point?{point}:{}),widthMm:n(width),heightMm:n(height),depthMm:n(depth),curveToleranceMm:n(curveTolerance),curvePolicy:curvePolicy.value,maskStrategy:'faceWithHolesExtrude',compileLayers:'groupCompatible',contourSnapMm:n(contourSnap),mode:mode.value,offsetX:n(offsetX),offsetY:n(offsetY),angleDeg:n(angle),...(data.layers?{layers:data.layers.map((layer,i)=>({...layer,heightMm:n(layerControls[i].height),startHeightMm:n(layerControls[i].start),mode:layerControls[i].mode.value}))}:{values:data.values,regions:data.regions,surfaceMode:data.surfaceMode}),source:data.source,machiningIntent:uiPatternIntent('relief',{...data,source:data.source})};}
 function draw(){const ctx=canvas.getContext('2d');if(data.layers){canvas.width=700;canvas.height=Math.round(700/data.aspectRatio);ctx.fillStyle='#202a33';ctx.fillRect(0,0,canvas.width,canvas.height);for(const [i,layer]of data.layers.entries()){ctx.fillStyle=`hsl(${(i*67+32)%360} 55% 65%)`;for(const r of layer.regions??[]){ctx.beginPath();for(const ring of [r.outer,...r.holes??[]]){ring.forEach(([x,y],k)=>ctx[k?'lineTo':'moveTo']((x+.5)*canvas.width,(.5-y)*canvas.height));ctx.closePath();}ctx.fill('evenodd');}ctx.strokeStyle=ctx.fillStyle;ctx.lineCap='round';ctx.lineJoin='round';for(const stroke of layer.strokes??[]){ctx.lineWidth=stroke.widthMm/Number(width.value)*canvas.width;ctx.beginPath();stroke.points.forEach(([x,y],k)=>ctx[k?'lineTo':'moveTo']((x+.5)*canvas.width,(.5-y)*canvas.height));ctx.stroke();}}}else{canvas.width=data.columns;canvas.height=data.rows;const pixels=ctx.createImageData(canvas.width,canvas.height);for(let j=0;j<data.rows;j++)for(let i=0;i<data.columns;i++){const k=((data.rows-1-j)*data.columns+i)*4,v=Math.round(data.values[j][i]*255);pixels.data.set([v,v,v,255],k);}ctx.putImageData(pixels,0,0);}canvas.style.display='block';}
 function showLayers(){layerPanel.replaceChildren();layerControls=[];layerPanel.hidden=!data.layers;for(const el of [style,whiteHigh,samples,threshold,depth,mode])el.parentElement.hidden=!!data.layers;if(!data.layers)return;for(const [i,layer]of data.layers.entries()){const row=element('label',{class:'form-field wide'}),heightInput=element('input',{type:'number',step:'any',min:'.01',max:'20',value:layer.heightMm,'aria-label':`第${i+1}层高度 mm`}),startInput=element('input',{type:'number',step:'any',min:'0',value:layer.startHeightMm??0,'aria-label':`第${i+1}层起点 mm`}),modeInput=element('select',{'aria-label':`第${i+1}层方向`});for(const [value,label]of [['emboss','凸起'],['engrave','凹刻']])modeInput.append(element('option',{value},label));modeInput.value=layer.mode??'emboss';row.append(element('span',{},layer.name??`第 ${i+1} 层`),heightInput,startInput,modeInput);layerPanel.append(row);layerControls.push({height:heightInput,start:startInput,mode:modeInput});heightInput.addEventListener('input',()=>dirty());startInput.addEventListener('input',()=>dirty());modeInput.addEventListener('change',()=>dirty());}}

 async function process(){data=await readReliefImage(file,{name:file.name,samples:Number(samples.value),whiteHigh:whiteHigh.checked,style:style.value,threshold:Number(threshold.value),sourceInterpretation:file.name.endsWith('.relief.json')?'reviewedVectors':sourceInterpretation.value});if(!live)return;processed=true;if(data.layers){width.value=String(data.widthMm);height.value=String(data.heightMm);curveTolerance.value=String(data.curveToleranceMm);contourSnap.value=String(data.contourSnapMm??0);}else if(lock.checked)height.value=String(Number(width.value)/data.aspectRatio);showLayers();draw();thumbnail.hidden=false;}
 function showLarge(){if(!data)return;if(large)large.remove();large=element('dialog',{class:'cad-dialog relief-large-preview'});const copy=element('canvas',{'aria-label':'浮雕高度图大图'});copy.width=canvas.width;copy.height=canvas.height;copy.getContext('2d').drawImage(canvas,0,0);large.append(element('h2',{},'浮雕高度图'),copy,element('p',{class:'property-footnote'},'白色较高，黑色较低；实际加工效果以模型曲面预览为准。'),button('关闭大图',()=>{large.close();large.remove();large=null;},'secondary'));large.addEventListener('cancel',()=>{large.remove();large=null;});document.body.append(large);large.showModal();}
 function stopGuide(){guideSequence++;clearTimeout(guideTimer);guide=null;onPlacement?.(null);}
 function scheduleGuide(){clearTimeout(guideTimer);guideTimer=setTimeout(()=>refreshGuide(),180);}
 async function refreshGuide(){
  if(!live||busy||!processed||!data||!onPlacement)return;const seq=++guideSequence,at=generation;
  try{const p=read();guide=await onPlacement({bodyId:target,faceId,params:p,canvas},{onChange:value=>{if(!live||seq!==guideSequence)return;for(const [el,v]of [[width,value.widthMm],[height,value.heightMm],[depth,value.depthMm],[offsetX,value.offsetX],[offsetY,value.offsetY],[angle,value.angleDeg]])el.value=String(+v.toFixed(6));if(!busy)dirty();},onPreview:()=>preview.click(),onCancel:()=>stopGuide(),onSelectFace:()=>chooseFace.click()});if(!live||seq!==guideSequence||at!==generation&&busy){stopGuide();return;}}
  catch(e){guide=null;status.textContent=getState().selectedTopology?.geomType&&getState().selectedTopology.geomType!=='PLANE'?'柱面使用精确偏移定位，点击“预览曲面”检查实际位置。':humanError(e);}
 }
 input.addEventListener('change',async()=>{if(busy)return;stopGuide();file=input.files?.[0]??null;data=null;dirty(true);thumbnail.hidden=true;if(!file){preview.disabled=true;return;}setBusy(true);status.textContent='正在读取图案…';try{await canceling;await emit('cancelPreview',{});await process();if(live)status.textContent=`已读取 ${file.name}。拖动画布图案定位，或直接预览曲面。`;}catch(e){processed=false;data=null;status.textContent=humanError(e);}finally{if(live){setBusy(false);await refreshGuide();}}});
 for(const el of [style,whiteHigh,samples,threshold,sourceInterpretation])el.addEventListener('change',()=>{if(el===sourceInterpretation){style.value=sourceInterpretation.value==='authoredHeightMap'?'grayscale':'rounded';}threshold.parentElement.hidden=style.value==='grayscale';dirty(true);imageDesign.hidden=sourceInterpretation.value!=='authoredHeightMap'||!file;});
 width.addEventListener('input',()=>{if(lock.checked&&data)height.value=String(Number(width.value)/data.aspectRatio);dirty();scheduleGuide();});
 height.addEventListener('input',()=>{if(lock.checked&&data)width.value=String(Number(height.value)*data.aspectRatio);dirty();scheduleGuide();});
 for(const el of [depth,mode,curveTolerance,curvePolicy,contourSnap,offsetX,offsetY,angle,lock])el.addEventListener('input',()=>{dirty();scheduleGuide();});
 function refreshTarget(){if(!live||busy)return;const s=getState(),t=s.selectedTopology;if(s.revision!==targetRevision){stopGuide();ready=false;apply.disabled=true;preview.disabled=true;targetText.textContent='模型已变化，请重新选择当前实体上的目标面。';}if(t?.type==='face'&&t.ids?.length===1&&(target!==t.bodyId||faceId!==t.ids[0]||s.revision!==targetRevision)){target=t.bodyId;faceId=t.ids[0];point=t.point?[...t.point]:undefined;targetRevision=s.revision;offsetX.value=offsetY.value='0';dirty();stopGuide();setBusy(false);scheduleGuide();}targetText.textContent=`目标面 ${faceId} · ${target} · 在模型上点击可更换`;}
 const controls={widthMm:width,heightMm:height,depthMm:depth,mode,offsetX,offsetY,angleDeg:angle};
 const unbind=bindReliefEditor({get:()=>({active:live,revision:generation,busy,sourceReady:!!data,previewReady:ready,target:{bodyId:target,faceId},parameters:Object.fromEntries(Object.entries(controls).map(([k,el])=>[k,k==='mode'?el.value:Number(el.value)])),placement:guide?.get()??null}),act:async request=>{
  if(busy)throw Object.assign(new Error('浮雕正在计算，请等待当前任务。'),{code:'BUSY'});
  if(request.expectedRevision!==undefined&&request.expectedRevision!==generation)throw Object.assign(new Error('浮雕草稿已变化，请重新读取。'),{code:'REVISION_CONFLICT'});
  if(request.action==='dismiss'){await canceling;await emit('cancelPreview',{});close();return {status:'closed'};}
  if(request.action==='source'){if(!processed){if(!file)throw new Error('请先导入图案');await process();}const p=read();return {data:{...data,...(p.layers?{layers:p.layers}:{})},params:{...Object.fromEntries(Object.keys(controls).map(k=>[k,k==='mode'?mode.value:Number(controls[k].value)])),faceId,machiningIntent:p.machiningIntent,...(point?{point}:{})},bodyId:target,file};}
  if(request.action==='parameters'){for(const [key,value]of Object.entries(request.parameters??{})){if(!controls[key]||(key==='mode'?!['emboss','engrave'].includes(value):!Number.isFinite(value)))throw Object.assign(new Error('无效浮雕参数：'+key),{code:'PARAM_SCHEMA_INVALID'});}for(const [key,value]of Object.entries(request.parameters??{}))controls[key].value=String(value);dirty();await refreshGuide();}
  if(request.action==='align'){if(!guide)await refreshGuide();if(!guide)throw new Error('画布定位需要有效平面和图案');guide.align(request.alignment??'center');}
  if(request.action==='position'){if(!guide)await refreshGuide();if(!guide)throw new Error('画布定位需要有效平面和图案');guide.update(request.placement??{});}
  return {status:'draft'};
 }});
 setTargetRefresh(refreshTarget);targetText.textContent=`目标面 ${faceId} · ${target}`;setBusy(false);
 d._onClose=()=>{live=false;generation++;stopGuide();large?.remove();unbind();setTargetRefresh(null);};
}
