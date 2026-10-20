import {humanError} from '../../error-recovery.js';
import {validateReliefDesign} from '../../relief-design-drafts.js';
import {DESIGN_EDIT_LABELS,changeDesignEdit,designEditSummary} from './relief-design-edits-ui.js';

export function showReliefDesignDialog({getState,openDialog,element,button,onSave,onGenerate,close}){
 let initial=getState(),loaded=null,busy=false,dirty=false,fieldResult=null,referenceUrl=null,referenceGeneration=0,selectedEdit=-1,editInputsDirty=false,resolutionTouched=false;
 const d=openDialog('浮雕设计约束','保存毫米约束 → 求解数值场 → 预览并生成支持范围内的网格。');
 d.dataset.taskPanel='true';
 d.style.cssText='width:min(840px,96vw);max-width:96vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden';
 const scroller=element('div',{});scroller.style.cssText='min-height:0;overflow:auto';
 const selector=element('select',{'aria-label':'选择设计草稿'});
 const status=element('p',{'aria-live':'polite',class:'property-callout'});
 const top=element('div',{});top.style.cssText='display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap';
 const create=button('新建草稿',()=>load(null),'secondary');top.append(selector,create);
 const form=element('div',{class:'parameter-form'});form.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px';
 function field(label,el,parent=form){const row=element('label',{class:'form-field'});row.append(element('span',{},label),el);parent.append(row);return el;}
 const name=field('草稿名称',element('input',{type:'text',maxlength:120}));
 const kind=field('支撑范围',element('select',{}));for(const [value,label]of [['circle','圆形'],['rect','矩形']])kind.append(element('option',{value},label));
 const numeric=(label,min,max)=>field(label,element('input',{type:'number',step:'any',min,max}));
 const cx=numeric('中心 X mm',-10000,10000),cy=numeric('中心 Y mm',-10000,10000);
 const width=numeric('直径 / 宽度 mm',.002,10000),height=numeric('矩形高度 mm',.001,10000);
 const low=numeric('最低高度 mm',-100,100),high=numeric('最高高度 mm',-100,100);
 const resolution=numeric('数值场每轴采样（9–129）',9,129);resolution.value=33;
 const base=numeric('网格底厚 mm',.001,100);base.value=1;
 function section(title,hint,rows=4){
  const wrap=element('details',{}),summary=element('summary',{},title),help=element('p',{class:'property-footnote'},hint);
  wrap.append(summary,help);const area=field(title,element('textarea',{rows,'aria-label':title}),wrap);area.style.cssText='width:100%;box-sizing:border-box;resize:vertical;min-height:72px';
  scroller.append(wrap);return {wrap,area};
 }
 scroller.append(top,form);
 const referencePanel=element('details',{}),referenceSummary=element('summary',{},'原始参考图（随工程保存）');
 const referenceInfo=element('p',{class:'property-footnote'},'原图仅作设计参考，不从亮度推断实际高度。');
 const referencePicker=element('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'选择浮雕原始参考图'});
 const referencePreview=element('img',{alt:'浮雕原始参考图'});referencePreview.style.cssText='display:none;max-width:100%;height:150px;object-fit:contain;opacity:.65';
 const referenceAttach=button('保存原图',()=>changeReference(false),'secondary'),referenceDetach=button('移除原图',()=>changeReference(true),'secondary');
 const referenceButtons=element('div',{});referenceButtons.style.cssText='display:flex;gap:8px;flex-wrap:wrap';referenceButtons.append(referencePicker,referenceAttach,referenceDetach);
 referencePanel.append(referenceSummary,referenceInfo,referencePreview,referenceButtons);scroller.append(referencePanel);
 const points=section('高度点','每行：X Y 高度（mm），用空格或逗号分隔。点必须避开孔和保护区。');points.wrap.open=true;
 const holes=section('贯穿孔','每行：圆 X Y 半径，或 矩形 X Y 宽 高（mm）。留空表示没有孔。',3);
 const zones=section('保护区','使用与孔相同的格式。区域保持本草稿最低设计高度；不是冻结已有模型的曲面。',3);
 const editsPanel=element('details',{}),editsSummary=element('summary',{},'局部毫米编辑（0笔）');
 const editsHint=element('p',{class:'property-footnote'},'按列表顺序编辑设计场，保留孔和作者保护基线；越界整笔拒绝。保存或移除一笔会同时保存当前表单的有效修改。圈线仅示意半径，保存后重新求解才计算结果；不修改任意 STEP 曲面。');
 const editList=element('select',{size:3,'aria-label':'局部编辑笔画列表'});editList.style.cssText='width:100%;min-width:0;max-height:100px';
 const editForm=element('div',{});editForm.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:8px 12px;margin-top:10px';
 const editMode=field('笔画方式',element('select',{'aria-label':'局部编辑方式'}),editForm);
 for(const [value,label]of Object.entries(DESIGN_EDIT_LABELS))editMode.append(element('option',{value},label));
 const editNumber=(label,min,max)=>field(label,element('input',{type:'number',step:'any',min,max,'aria-label':label}),editForm);
 const editX=editNumber('笔画中心 X mm',-10000,10000),editY=editNumber('笔画中心 Y mm',-10000,10000),editRadius=editNumber('笔画半径 mm',.001,10000),editAmount=editNumber('笔画增减量 mm',0,100),editTarget=editNumber('笔画目标高度 mm',-100,100),editStrength=editNumber('笔画强度 0–1',0,1);
 const editControls=[editMode,editX,editY,editRadius,editAmount,editTarget,editStrength];for(const control of editControls)control.dataset.designEdit='true';
 const editButtons=element('div',{});editButtons.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:10px';
 const editSave=button('加入并保存当前修改',()=>saveEdit(false),'primary'),editRemove=button('移除此笔并保存',()=>saveEdit(true),'secondary'),editNew=button('放弃本笔输入 / 新笔',()=>{resetEditEditor();status.textContent='仅重置笔画输入；其他未保存设计修改仍保留。';try{draw(read());}catch{ /* Preserve invalid form input for correction. */ }},'secondary');
 editButtons.append(editNew,editRemove,editSave);editsPanel.append(editsSummary,editsHint,editList,editForm,editButtons);scroller.append(editsPanel);
 const canvas=element('canvas',{width:640,height:240,'aria-label':'支撑范围和人工高度点示意'});
 canvas.style.cssText='width:100%;height:auto;max-height:240px;border:1px solid var(--border);margin-top:12px';
 scroller.append(canvas);
 const footer=element('div',{class:'dialog-footer'});footer.style.cssText='flex-shrink:0;display:flex;flex-wrap:wrap;gap:8px;margin-top:10px';
 const save=button('保存草稿到工程',()=>commit(false),'primary'),remove=button('删除当前草稿',()=>commit(true),'secondary');
 const solve=button('求解数值场',()=>compute(),'secondary'),cancel=button('停止求解',()=>window.webcad.api.reliefDesignField(request('cancel')),'secondary');
 const generate=button('生成网格',()=>generateMesh(),'primary');generate.disabled=true;cancel.disabled=true;
 footer.append(remove,button('关闭',()=>{if(!busy)close();},'secondary'),save,solve,cancel,generate);d.append(scroller,status,footer);
 d._onClose=()=>{clearReferencePreview();if(loaded)window.webcad.api.reliefDesignField(request('cancel'));};
 function clearReferencePreview(){referenceGeneration++;if(referenceUrl)URL.revokeObjectURL(referenceUrl);referenceUrl=null;referencePreview.removeAttribute('src');referencePreview.style.display='none';}
 async function showReference(){
  clearReferencePreview();const generation=referenceGeneration,ref=loaded?.draft.reference;
  referenceAttach.disabled=!loaded;referenceDetach.disabled=!ref;referencePicker.value='';
  referenceInfo.textContent=ref?`${ref.name} · ${(ref.sizeBytes/1024).toFixed(1)} KB · 原始字节随工程保存。原图仅供参考，不自动变成高度。`:'尚未绑定原图。保存设计草稿后，可加入 PNG、JPEG 或 WebP；上限20 MiB。';
  if(!ref)return;let resourceId=null;
  try{const api=window.webcad.api,r=await api.reliefDesignReference({...request('resource')});if(r.status==='failed')throw Object.assign(new Error(r.error?.message),{code:r.error?.code});resourceId=r.resourceId;if(generation!==referenceGeneration)return;const bytes=await api.files.read({resourceId,as:'bytes'});if(generation!==referenceGeneration)return;referenceUrl=URL.createObjectURL(new Blob([bytes],{type:ref.mime}));referencePreview.src=referenceUrl;referencePreview.style.display='block';}
  catch(error){if(generation===referenceGeneration)referenceInfo.textContent=humanError(error);}
  finally{if(resourceId)try{await window.webcad.api.files.release({resourceId});}catch{ /* Expired preview resources need no further work. */ }}
 }
 async function changeReference(removing){
  if(busy)return;if(!loaded||dirty||editInputsDirty){status.textContent='请先保存当前设计和笔画修改，再绑定或移除原图。';return;}
  const api=window.webcad.api,file=referencePicker.files?.[0];if(!removing&&!file){status.textContent='请先选择原始参考图。';return;}
  if(file&&file.size>20*1024*1024){status.textContent='原始参考图需在20 MiB以内；请保留原件，选择符合大小限制的图片。';return;}
  const controls=[...scroller.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);for(const [el]of controls)el.disabled=true;
  let resourceId=null;busy=true;referenceAttach.disabled=referenceDetach.disabled=save.disabled=solve.disabled=true;
  try{let extra={};if(!removing){const r=await api.files.register({name:file.name,mime:file.type,data:file});resourceId=r.resourceId;extra={resourceId,expectedSha256:r.sha256,expectedSize:r.size};}
   const result=await api.reliefDesignReference({...request(removing?'detach':'attach'),...extra});if(!['committed','no_change'].includes(result.status))throw Object.assign(new Error(result.error?.message||'原图未保存'),{code:result.error?.code});initial=getState();load(initial.document.reliefDesigns?.find(item=>item.id===loaded.id));status.textContent=removing?'原图引用已移除；工程撤销仍可恢复。':'原始字节已加入当前工程；请保存工程文件以便下次使用。';
  }catch(error){status.textContent=humanError(error);}finally{if(resourceId)try{await api.files.release({resourceId});}catch{ /* Registered input can expire after use. */ }busy=false;for(const [el,disabled]of controls)el.disabled=disabled;save.disabled=solve.disabled=false;referenceAttach.disabled=!loaded;referenceDetach.disabled=!loaded?.draft.reference;}
 }
 function request(action,extra={}){return {context:window.webcad.api.getState().context,action,designId:loaded?.id,expectedDraftRevision:loaded?.revision,...extra};}
 function syncEditControls(){
  const additive=['raise','lower'].includes(editMode.value);editAmount.disabled=busy||!additive;editTarget.disabled=busy||editMode.value!=='flatten';editRemove.disabled=busy||selectedEdit<0;editSave.disabled=busy;editNew.disabled=busy;
  editSave.textContent=selectedEdit<0?'加入并保存当前修改':`更新第${selectedEdit+1}笔并保存`;
  selector.disabled=create.disabled=busy||dirty||editInputsDirty;
 }
 function resetEditEditor(){
  selectedEdit=-1;editInputsDirty=false;editList.value='';editMode.value='raise';editX.value=cx.value;editY.value=cy.value;editRadius.value=1;editAmount.value=.1;editTarget.value=low.value;editStrength.value=1;generate.disabled=busy||dirty||!fieldResult;syncEditControls();
 }
 function loadEdit(index){
  const edit=loaded?.draft.fieldSettings?.edits?.[index];if(!edit)return;selectedEdit=index;editInputsDirty=false;editList.value=String(index);editMode.value=edit.mode;editX.value=edit.centerMm[0];editY.value=edit.centerMm[1];editRadius.value=edit.radiusMm;editAmount.value=edit.amountMm??'';editTarget.value=edit.targetMm??'';editStrength.value=edit.strength??1;syncEditControls();try{draw(read());}catch{ /* A list selection never clears other unfinished fields. */ }
 }
 editList.onchange=()=>{if(busy)return;if(editInputsDirty){editList.value=selectedEdit<0?'':String(selectedEdit);status.textContent='当前笔画输入尚未保存；请先保存此笔，或明确放弃本笔输入。';return;}if(editList.value==='')resetEditEditor();else loadEdit(Number(editList.value));};
 editMode.addEventListener('change',syncEditControls);
 async function saveEdit(removing){
  if(busy)return;
  try{const number=el=>el.value.trim()===''?NaN:Number(el.value),operation=removing?'remove':selectedEdit<0?'append':'replace';
   const draft=changeDesignEdit(read(),{operation,index:selectedEdit,...(removing?{}:{edit:{mode:editMode.value,centerMm:[number(editX),number(editY)],radiusMm:number(editRadius),amountMm:number(editAmount),targetMm:number(editTarget),strength:number(editStrength)}})});
   const index=removing?-1:operation==='append'?draft.fieldSettings.edits.length-1:selectedEdit;
   await commit(false,{draft,selectEdit:index,message:removing?'已移除此笔，并保存当前设计修改；可用工程撤销恢复。':'笔画和当前设计修改已一起保存；重新求解后查看局部编辑结果。'});
  }catch(error){status.textContent=humanError(error);}
 }
 async function compute(){
  if(busy)return;
  if(!loaded||dirty||editInputsDirty){status.textContent='请先保存当前设计和笔画修改，再求解同工程草稿。';return;}
  busy=true;solve.disabled=save.disabled=true;cancel.disabled=false;generate.disabled=true;status.textContent='正在有界 Worker 中求解…';
  try{const result=await window.webcad.api.reliefDesignField(request('solve'));if(result.status!=='solved')throw new Error(result.error?.message||'未得到数值场');fieldResult=result;drawField(result);const r=result.report.solver;status.textContent=`数值场 ${result.field.columns}×${result.field.rows}；实际投影残差 ${r.projectedResidualMm} mm；${r.iterations} 次迭代。孔为保守排除单元，保护区保持初始高度。`;const c=await window.webcad.api.reliefDesignField(request('candidate',{baseMm:Number(base.value)}));generate.disabled=c.status!=='candidate';if(c.blockers?.length)status.textContent+=' '+c.blockers.map(code=>humanError({code})).join(' ');else if(c.domainReport)status.textContent+=` 边界为采样折线，近似界 ${c.domainReport.boundaryApproximationBoundMm.toFixed(3)} mm；保留 ${c.domainReport.holeCount} 个贯穿孔。`;}
  catch(e){status.textContent=humanError(e);}finally{busy=false;solve.disabled=save.disabled=false;cancel.disabled=true;}
 }
 function drawField(result){
  const f=result.field,ctx=canvas.getContext('2d'),min=Math.min(...f.heightsMm),max=Math.max(...f.heightsMm),scale=Math.min(580/f.widthMm,180/f.heightMm);ctx.clearRect(0,0,640,240);
  const point=k=>[320+((k%f.columns)/(f.columns-1)-.5)*f.widthMm*scale,120-(Math.floor(k/f.columns)/(f.rows-1)-.5)*f.heightMm*scale];
  for(let i=0;i<f.previewTriangles.length;i+=3){const nodes=f.previewTriangles.slice(i,i+3),z=nodes.reduce((s,k)=>s+f.heightsMm[k],0)/3,t=(z-min)/(max-min||1);ctx.fillStyle=nodes.every(k=>f.fixedMask[k])?'#89919d':`hsl(${220-t*200} 65% 48%)`;ctx.beginPath();nodes.forEach((k,j)=>{const [x,y]=point(k);if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.fill();}
  ctx.fillStyle=getComputedStyle(d).color;ctx.font='12px sans-serif';ctx.fillText(`蓝→红：${min.toFixed(3)}→${max.toFixed(3)} mm；空白为范围外/孔排除单元`,12,230);
 }
 async function generateMesh(){
  if(busy||dirty||editInputsDirty||!fieldResult)return;busy=true;generate.disabled=true;
  try{const api=window.webcad.api,c=await api.reliefDesignField(request('candidate',{baseMm:Number(base.value)}));if(c.status!=='candidate')throw Object.assign(new Error('请重新核对设计候选'),{code:c.blockers?.[0]||c.error?.code||'RELIEF_DESIGN_STALE'});const result=await onGenerate(c.args);if(result.status!=='committed')throw new Error(result.error?.message||'网格未提交');initial=getState();status.textContent='已生成真实封闭三角网格；可导出 STL。不是精确 BRep/STEP；保存工程保留实际高度样本与设计草稿。';fieldResult=null;}
  catch(e){status.textContent=humanError(e);}finally{busy=false;}
 }
 function values(line){return line.trim().split(/[\s,，]+/);}
 function regions(area){
  return area.value.split(/\r?\n/).filter(s=>s.trim()).map((line,i)=>{
   const [type,...rest]=values(line),numbers=rest.map(Number);
   if((type!=='圆'&&type!=='矩形')||rest.length!==(type==='圆'?3:4)||numbers.some(v=>!Number.isFinite(v)))throw new Error(`区域第${i+1}行：请用“圆 X Y 半径”或“矩形 X Y 宽 高”。`);
   return {kind:type==='圆'?'circle':'rect',centerMm:numbers.slice(0,2),...(type==='圆'?{radiusMm:numbers[2]}:{widthMm:numbers[2],heightMm:numbers[3]})};
  });
 }
 function read(){
  const number=el=>el.value.trim()===''?NaN:Number(el.value),support={kind:kind.value,centerMm:[number(cx),number(cy)],...(kind.value==='circle'?{radiusMm:number(width)/2}:{widthMm:number(width),heightMm:number(height)})};
  const authored=points.area.value.split(/\r?\n/).filter(s=>s.trim()).map((line,i)=>{
   const fields=values(line);if(fields.length!==3)throw new Error(`高度点第${i+1}行：需要 X Y 高度三个数值。`);
   const [x,y,z]=fields.map(Number);return {id:loaded?.draft.points[i]?.id||'point-'+(i+1),pointMm:[x,y],heightMm:z};
  });
  return validateReliefDesign({...(loaded?.draft.reference?{reference:loaded.draft.reference}:{}),schemaVersion:1,name:name.value,support,throughHoles:regions(holes.area),protectedZones:regions(zones.area),heightRangeMm:[number(low),number(high)],points:authored,fieldSettings:{...loaded?.draft.fieldSettings,columns:number(resolution),rows:resolutionTouched?number(resolution):(loaded?.draft.fieldSettings?.rows??number(resolution))}});
 }
 function draw(draft){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,640,240);
  const s=draft.support,w=s.kind==='circle'?s.radiusMm*2:s.widthMm,h=s.kind==='circle'?s.radiusMm*2:s.heightMm,scale=Math.min(580/w,180/h);
  const point=([x,y])=>[320+(x-s.centerMm[0])*scale,120-(y-s.centerMm[1])*scale];
  const shape=(r,color,dashed=false)=>{const [x,y]=point(r.centerMm);ctx.beginPath();ctx.setLineDash(dashed?[5,3]:[]);ctx.strokeStyle=color;ctx.lineWidth=2;if(r.kind==='circle')ctx.arc(x,y,r.radiusMm*scale,0,Math.PI*2);else ctx.rect(x-r.widthMm*scale/2,y-r.heightMm*scale/2,r.widthMm*scale,r.heightMm*scale);ctx.stroke();};
  shape(s,'#599bd8');draft.throughHoles.forEach(r=>shape(r,'#d66f60'));draft.protectedZones.forEach(r=>shape(r,'#ae8bc5',true));ctx.setLineDash([]);ctx.fillStyle=getComputedStyle(d).color;ctx.font='13px sans-serif';
  draft.points.forEach(p=>{const [x,y]=point(p.pointMm);ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.fillText(p.heightMm+' mm',x+5,y-5);});
  if(selectedEdit>=0||editInputsDirty){const x=Number(editX.value),y=Number(editY.value),radius=Number(editRadius.value);if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(radius)&&radius>0)shape({kind:'circle',centerMm:[x,y],radiusMm:radius},'#d89a45',true);}
 }
 const regionText=rs=>rs.map(s=>(s.kind==='circle'?['圆',...s.centerMm,s.radiusMm]:['矩形',...s.centerMm,s.widthMm,s.heightMm]).join(' ')).join('\n');
 function load(entry){
  dirty=false;resolutionTouched=false;fieldResult=null;generate.disabled=true;
  loaded=entry?structuredClone(entry):null;
  const draft=entry?.draft||{name:'新设计草稿',support:{kind:'circle',centerMm:[0,0],radiusMm:30},heightRangeMm:[0,3],throughHoles:[],protectedZones:[],points:[]},s=draft.support;
  name.value=draft.name;kind.value=s.kind;cx.value=s.centerMm[0];cy.value=s.centerMm[1];width.value=s.kind==='circle'?s.radiusMm*2:s.widthMm;height.value=s.kind==='rect'?s.heightMm:s.radiusMm*2;
  low.value=draft.heightRangeMm[0];high.value=draft.heightRangeMm[1];resolution.value=draft.fieldSettings?.columns??33;points.area.value=draft.points.map(p=>[...p.pointMm,p.heightMm].join(' ')).join('\n');
  holes.area.value=regionText(draft.throughHoles);zones.area.value=regionText(draft.protectedZones);height.disabled=kind.value==='circle';
  selector.replaceChildren(element('option',{value:''},'未保存的新草稿'));
  for(const item of initial.document.reliefDesigns||[])selector.append(element('option',{value:item.id},item.draft.name+' · r'+item.revision));
  selector.value=entry?.id||'';selector.disabled=false;create.disabled=false;remove.disabled=!entry;
  const edits=draft.fieldSettings?.edits??[];editsSummary.textContent=`局部毫米编辑（${edits.length}笔）`;editList.replaceChildren(element('option',{value:''},'新笔（尚未加入）'));edits.forEach((edit,i)=>{const option=element('option',{value:String(i)},designEditSummary(edit,i));option.title=designEditSummary(edit,i);editList.append(option);});resetEditEditor();
  status.textContent=entry?'已读取工程草稿。':'新建示例范围为直径60 mm；请按实际设计填写。';draw(draft);showReference();
 }
 async function commit(deleting,{draft:prepared,selectEdit=-1,message}={}){
  if(busy)return false;
  if(!deleting&&!prepared&&editInputsDirty){status.textContent='笔画参数尚未保存；请先保存此笔以合并当前修改，或明确放弃本笔输入。';return false;}
  let controls=[];
  try{
   const state=getState();if(state.document.documentId!==initial.document.documentId||state.revision!==initial.revision)throw new Error('工程已改变，请关闭后重新读取设计草稿。');
   const draft=deleting?undefined:prepared??read(),id=loaded?.id||crypto.randomUUID();busy=true;save.disabled=remove.disabled=solve.disabled=generate.disabled=true;
   controls=[...scroller.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);for(const [el]of controls)el.disabled=true;
   const result=await onSave({id,expectedDraftRevision:loaded?.revision??0,...(deleting?{remove:true}:{draft})});
   if(!result||!['committed','no_change'].includes(result.status))throw new Error(result?.error?.message||'草稿未保存。');
   initial=getState();const current=initial.document.reliefDesigns?.find(item=>item.id===id);load(current||null);
   if(selectEdit>=0)loadEdit(selectEdit);
   status.textContent=message||(deleting?'已删除；可用工程撤销恢复。':'草稿已写入当前工程；保存工程文件后可重新打开。');return true;
  }catch(error){status.textContent=humanError(error);}
  finally{busy=false;for(const [el,disabled]of controls)el.disabled=disabled;save.disabled=solve.disabled=false;remove.disabled=!loaded;height.disabled=kind.value==='circle';referenceAttach.disabled=!loaded;referenceDetach.disabled=!loaded?.draft.reference;syncEditControls();}
 }
 selector.onchange=()=>load(initial.document.reliefDesigns?.find(item=>item.id===selector.value)||null);
 scroller.addEventListener('input',event=>{if(busy||event.target===referencePicker||event.target===editList)return;if(event.target.dataset.designEdit){editInputsDirty=true;generate.disabled=true;syncEditControls();try{draw(read());status.textContent='笔画参数尚未保存；保存此笔将一起保存当前表单修改。';}catch(e){status.textContent=humanError(e);}return;}if(event.target===resolution)resolutionTouched=true;dirty=true;fieldResult=null;generate.disabled=true;height.disabled=kind.value==='circle';syncEditControls();try{draw(read());status.textContent='有未保存的设计修改；旧数值场不能生成几何。';}catch(e){status.textContent=humanError(e);}});
 load(initial.document.reliefDesigns?.[0]||null);
}
