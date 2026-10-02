// A single task panel; exact geometry runs only after selection/change/release.
export function showRoundTool({getState,openDialog,element,button,emit,close,setTaskTargetRefresh,setGuide}){
 const d=openDialog('圆润','点选边缘或端部，自动预览；确认蓝色范围后应用。',{returnToSelect:true});
 d.dataset.commandId='round';d.dataset.previewCapable='true';d._acceptSelection=true;
 let live=true,working=false,target=null,ids=[],lastPick='',choosing=false,directionPicking=false,report=null,ready=false,original=false,queued=false,generation=0,timer;
 let overrides={},strength=.5;
 const status=element('p',{class:'property-callout','aria-live':'polite'},'请在模型上点选一条边。');
 const targetText=element('p',{class:'task-target'}),form=element('div',{class:'parameter-form'}),label=element('label',{class:'form-field wide'}),caption=element('span',{},'圆润程度'),value=element('output',{}),range=element('input',{type:'range',min:.1,max:1,step:.05,value:.5,'aria-label':'圆润程度'});
 range.style.width='100%';label.append(caption,value,range);label.hidden=true;
 const hint=element('p',{class:'property-footnote'},'拖动时只调整范围，松开后计算。'),advanced=element('details',{});advanced.append(element('summary',{},'高级设置'));
 const field=(name,text,type='number')=>{const row=element('label',{class:'form-field wide'}),input=element(type==='select'?'select':'input',{'aria-label':text,...(type==='select'?{}:{type,min:.00001,step:'any'})});row.append(element('span',{},text),input);advanced.append(row);return input;};
 const mode=field('mode','处理方式','select');for(const [v,t]of [['auto','自动识别'],['edge','只磨边缘'],['end','重建圆头']])mode.append(element('option',{value:v},t));
 const radius=field('radius','精确半径 mm（留空自动）'),depth=field('depth','端头范围 mm（留空自动）');
 const axis=field('axis','杆身方向','select');for(const v of ['auto','X','Y','Z'])axis.append(element('option',{value:v},v==='auto'?'自动':v));
 const pickDirection=button('在模型上点一条杆身直边',async()=>{if(working)return;stopPending();working=true;await emit('cancelPreview',{});working=false;setGuide?.(null);directionPicking=true;d._acceptSelection=true;status.textContent='请点同一实体的杆身直边，只用于确认方向。';await emit('selectMode',{mode:'edge'});},'secondary');advanced.append(pickDirection);
 const apply=button('应用',async()=>{if(working||!ready||original)return;working=true;apply.disabled=true;const r=await emit('commitPreview',{});working=false;if(r===true){live=false;setGuide?.(null);close();}else{ready=false;status.textContent='应用未完成，请重新预览后再应用。';}},'primary');apply.disabled=true;
 const compare=button('查看原形',async()=>{if(working||!report)return;if(!original){stopPending();working=true;await emit('cancelPreview',{});setGuide?.(null);working=false;original=true;compare.textContent='返回预览';status.textContent='正在查看原形。';}else{original=false;compare.textContent='查看原形';schedule();}},'secondary');compare.disabled=true;
 const retry=button('恢复推荐',()=>{if(working)return;overrides={};strength=.5;mode.value='auto';axis.value='auto';radius.value='';depth.value='';dirty();schedule();},'secondary');
 const change=button('更换位置',async()=>{if(working)return;stopPending();working=true;await emit('cancelPreview',{});working=false;setGuide?.(null);choosing=true;d._acceptSelection=true;target=null;ids=[];report=null;lastPick='';label.hidden=true;overrides={};depth.value='';radius.value='';compare.disabled=true;status.textContent='请重新点选要圆润的边。';await emit('selectMode',{mode:'edge'});},'secondary');
 const foot=element('div',{class:'dialog-footer'});foot.append(compare,retry,button('取消',()=>{d._onClose();emit('cancelPreview',{});close();},'secondary'),apply);
 d.append(targetText,change,status);form.append(label,hint,advanced,foot);d.append(form);
 function dirty(){generation++;ready=false;apply.disabled=true;original=false;compare.textContent='查看原形';status.textContent='范围已调整，松开后预览。';}
 function stopPending(){clearTimeout(timer);queued=false;generation++;ready=false;apply.disabled=true;}
 function read(){const p={edgeIds:[...ids],mode:mode.value,strength,...overrides};if(radius.value.trim())p.radiusMm=Number(radius.value);if(depth.value.trim())p.depthMm=Number(depth.value);if(axis.value!=='auto')p.axis=axis.value;return p;}
 function guide(r){setGuide?.(r,r?.mode==='end'?{onInput:v=>{depth.value=String(v);range.value=String(v);value.textContent=v.toFixed(2)+' mm';dirty();},onRelease:()=>schedule()}:null);}
 async function preview(){
  if(!live||!target||!ids.length)return;if(working){queued=true;return;}
  working=true;queued=false;ready=false;apply.disabled=true;range.disabled=true;const ticket=generation;status.textContent='正在生成预览…';
  try{
   const r=await emit('preview',{op:'round',params:{...read(),_targetRefs:[target]}});
   if(!live)return;if(r===false||!r?.roundReport){status.textContent='此范围未能生成圆润结果，原件保留。可调整范围或在高级设置选择处理方式。';advanced.open=true;setGuide?.(null);return;}
   report=r.roundReport;
   radius.parentElement.hidden=report.mode==='end';depth.parentElement.hidden=report.mode!=='end';axis.parentElement.hidden=report.mode!=='end';pickDirection.hidden=report.mode!=='end';
   if(ticket!==generation){queued=true;return;}
   original=false;ready=true;label.hidden=false;const c=report.control;
   range.min=c.min;range.max=c.max;range.step=c.step??.05;range.value=c.value;
   caption.textContent=report.mode==='end'?'处理范围':'圆润程度';range.setAttribute('aria-label',caption.textContent);
   value.textContent=report.mode==='end'?c.value.toFixed(2)+' mm':'轻微 ← '+Math.round(c.value*100)+'% → 明显';
   const residual=report.endRoundingReport?.residualSeams?.length;
   status.textContent=report.mode==='end'?'已识别端头；蓝色区域整体重建。'+(residual?'保留原截面微折痕 '+report.endRoundingReport.maxHeadAngleDeg.toFixed(3)+'°。':'新接缝检查通过。'):'已识别边缘；仅圆润所选边，实际 R '+report.radiusMm.toFixed(3)+' mm。';
   guide(report);compare.disabled=false;
  }finally{working=false;range.disabled=false;if(live)apply.disabled=!ready||original;if(queued&&live){queued=false;schedule();}}
 }
 function schedule(){clearTimeout(timer);if(!live)return;ready=false;apply.disabled=true;timer=setTimeout(preview,120);}
 range.addEventListener('input',()=>{dirty();if(report?.mode==='end'){depth.value=range.value;value.textContent=Number(range.value).toFixed(2)+' mm';guide({...report,control:{...report.control,value:Number(range.value)},scope:{...report.scope,depthMm:Number(range.value),center:report.scope.center.map((v,i)=>i==='XYZ'.indexOf(report.scope.axis)?report.scope.end-report.scope.direction*Number(range.value):v)}});}else{strength=Number(range.value);radius.value='';value.textContent=Math.round(strength*100)+'%';}});
 range.addEventListener('change',schedule);
 for(const input of [radius,depth,axis,mode])input.addEventListener('change',()=>{if(input===mode){radius.value='';depth.value='';overrides={};for(const el of [radius,depth,axis])el.parentElement.hidden=false;pickDirection.hidden=false;}dirty();schedule();});
 function selection(){if(!live||working)return;const s=getState(),t=s.selectedTopology,key=JSON.stringify(t);if(!t||t.type!=='edge'||!t.ids?.length)return;
  if(directionPicking){if(t.bodyId!==target||t.ids.length!==1){status.textContent='方向边必须来自同一个实体。';return;}directionPicking=false;d._acceptSelection=false;overrides.directionEdgeId=t.ids[0];mode.value='end';axis.value='auto';lastPick=key;dirty();schedule();return;}
  if(target&&!choosing&&t.bodyId!==target)return;if(key===lastPick)return;lastPick=key;target=t.bodyId;ids=[...t.ids];choosing=false;d._acceptSelection=false;targetText.textContent='已选 '+ids.length+' 条边 · '+(s.bodies.find(b=>b.id===target)?.name||'实体');dirty();schedule();
 }
 d._onClose=()=>{live=false;generation++;clearTimeout(timer);setGuide?.(null);};
 setTaskTargetRefresh(selection);selection();if(!target)emit('selectMode',{mode:'edge'});
}
