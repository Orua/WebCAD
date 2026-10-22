import {humanError} from '../../error-recovery.js';
import {validateReliefDesign} from '../../relief-design-drafts.js';
import {DESIGN_EDIT_LABELS,changeDesignEdit,designEditSummary} from './relief-design-edits-ui.js';
import {createReliefBrepPanel} from './relief-design-brep-panel.js';
import {reliefServicesReady} from '../../services/relief-pipeline.js';
import {createReliefHeightPanel} from './relief-design-height-panel.js';

export function showReliefDesignDialog({getState,openDialog,element,button,onSave,onGenerate,onPreview,close}){
 let initial=getState(),loaded=null,busy=false,dirty=false,fieldResult=null,referenceUrl=null,referenceGeneration=0,selectedEdit=-1,editInputsDirty=false,resolutionTouched=false,fitRunning=false,fitBaselineMm=NaN,brep=null;
 const d=openDialog('浮雕设计约束','保存毫米约束 → 求解数值场 → 预览并生成支持范围内的网格。');
 d.dataset.taskPanel='true';
 d.style.cssText='width:min(840px,96vw);max-width:96vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden';
 const scroller=element('div',{});scroller.style.cssText='min-height:0;overflow:auto';
 const selector=element('select',{'aria-label':'选择设计草稿'});
 const status=element('p',{'aria-live':'polite',class:'property-callout'});
 const top=element('div',{});top.style.cssText='display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap';
 const create=button('新建草稿',()=>load(null),'secondary');top.append(selector,create);
 const form=element('div',{class:'parameter-form'});form.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px';
 // 高级配置: everything beyond the essentials (image, size/depth, emboss/engrave, placement, preview/apply)
 // lives in one collapsed section with working defaults; the common case never needs to open it.
 const advanced=element('details',{class:'relief-advanced','data-relief-advanced':'true'});
 advanced.append(element('summary',{},'高级配置（已按默认值填好；常规使用无需展开）'),element('p',{class:'property-footnote'},'设计约束：数值场采样、加工精度、网格底厚、高度点/孔/保护区、局部编辑、拟合控制点与误差、原始参考图，以及精确 BRep 的 X方向/基线确认/加工意图。'));
 const advancedForm=element('div',{class:'parameter-form'});advancedForm.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px';advanced.append(advancedForm);
 function field(label,el,parent=form){const row=element('label',{class:'form-field'});row.append(element('span',{},label),el);parent.append(row);return el;}
 const name=field('草稿名称',element('input',{type:'text',maxlength:120}));
 const kind=field('支撑范围',element('select',{}));for(const [value,label]of [['circle','圆形'],['rect','矩形']])kind.append(element('option',{value},label));
 const numeric=(label,min,max,parent=form)=>field(label,element('input',{type:'number',step:'any',min,max}),parent);
 const cx=numeric('中心 X mm',-10000,10000),cy=numeric('中心 Y mm',-10000,10000);
 const width=numeric('直径 / 宽度 mm',.002,10000),height=numeric('矩形高度 mm',.001,10000);
 const low=numeric('最低高度 mm',-100,100),high=numeric('最高高度 mm',-100,100);
 const resolution=numeric('数值场每轴采样（9–129）',9,129,advancedForm);resolution.value=33;
 const precision=numeric('加工精度 mm（0.01–0.5，小于此值的起伏、噪声和台阶被平滑）',.01,.5,advancedForm);precision.value=.05;
 const base=numeric('网格底厚 mm',.001,100,advancedForm);base.value=1;
 function section(title,hint,rows=4){
  const wrap=element('details',{}),summary=element('summary',{},title),help=element('p',{class:'property-footnote'},hint);
  wrap.append(summary,help);const area=field(title,element('textarea',{rows,'aria-label':title}),wrap);area.style.cssText='width:100%;box-sizing:border-box;resize:vertical;min-height:72px';
  advanced.append(wrap);return {wrap,area};
 }
 scroller.append(top,form);
 const referencePanel=element('details',{}),referenceSummary=element('summary',{},'原始参考图（随工程保存）');
 const referenceInfo=element('p',{class:'property-footnote'},'原图仅作设计参考，不从亮度推断实际高度。');
 const referencePicker=element('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'选择浮雕原始参考图'});
 const referencePreview=element('img',{alt:'浮雕原始参考图'});referencePreview.style.cssText='display:none;max-width:100%;height:150px;object-fit:contain;opacity:.65';
 const referenceAttach=button('保存原图',()=>changeReference(false),'secondary'),referenceDetach=button('移除原图',()=>changeReference(true),'secondary');
 const referenceButtons=element('div',{});referenceButtons.style.cssText='display:flex;gap:8px;flex-wrap:wrap';referenceButtons.append(referencePicker,referenceAttach,referenceDetach);
 referencePanel.append(referenceSummary,referenceInfo,referencePreview,referenceButtons);
 // Imported height map: undefined = keep the loaded draft's, null = remove, object = replace.
 let pendingHeight;
 const heightPanel=createReliefHeightPanel({element,button,field,getPrecision:()=>{const v=Number(precision.value);return v>=.01&&v<=.5?v:.05;},getCurrent:()=>pendingHeight===undefined?loaded?.draft.heightSource:pendingHeight,onApply:value=>{pendingHeight=value;name.dispatchEvent(new Event('input',{bubbles:true}));}});
 scroller.append(heightPanel.panel);
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
 editButtons.append(editNew,editRemove,editSave);editsPanel.append(editsSummary,editsHint,editList,editForm,editButtons);advanced.append(editsPanel);
 const fitPanel=element('details',{}),fitSummary=element('summary',{},'数值 B 样条拟合');
 const fitHint=element('p',{class:'property-footnote'},'先将草稿和笔画保存到工程，再求解当前数值场。以下为明确起值，失败不会自动增加控制点或放宽误差；拟合不生成 BRep，也不代表可加工。');
 const fitForm=element('div',{});fitForm.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:8px 12px';
 const fitMode=field('拟合模式',element('select',{'aria-label':'拟合模式'}),fitForm);for(const [value,label]of [['emboss','凸起（基准以上）'],['engrave','凹刻（基准以下）'],['engraveDepth','凹刻（设计高度=下刻深度）']])fitMode.append(element('option',{value},label));fitMode.value='emboss';
 const advancedFit=element('div',{});advancedFit.style.cssText=fitForm.style.cssText;advanced.append(element('p',{class:'property-footnote'},'拟合控制点与误差'),advancedFit);
 const fitNumber=(label,min,max,value,step='any')=>{const n=field(label,element('input',{type:'number',min,max,step,'aria-label':label}),advancedFit);n.value=value;return n;};
 const fitColumns=fitNumber('控制列数',4,65,9,1),fitRows=fitNumber('控制行数',4,65,9,1),fitMax=fitNumber('控制高度上限 mm',0,20,3),fitTolerance=fitNumber('接受的采样误差 mm',.000001,20,.05);
 const fitControls=[fitMode,fitColumns,fitRows,fitMax,fitTolerance];for(const control of fitControls)control.dataset.designFit='true';
 const fitResult=element('p',{class:'property-footnote','aria-live':'polite'},'尚未拟合；需当前草稿的已求解数值场。');fitResult.style.cssText='white-space:pre-line;overflow-wrap:anywhere';
 const fitStart=button('拟合当前数值场',()=>computeFit(),'secondary'),fitStop=button('停止拟合',()=>stopFit(),'secondary');fitStop.disabled=true;
 const fitButtons=element('div',{});fitButtons.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:10px';fitButtons.append(fitStart,fitStop);fitPanel.append(fitSummary,fitHint,fitForm,fitButtons,fitResult);fitPanel.open=true;fitSummary.textContent='拟合（凸起 / 凹刻）';scroller.append(fitPanel);
 let servicesFirstOK=false;reliefServicesReady('reliefDesign').then(v=>{servicesFirstOK=v;brep?.sync?.();});
 brep=createReliefBrepPanel({element,button,runPreview:onPreview,request:()=>({context:window.webcad.api.getState().context,designId:loaded?.id,expectedDraftRevision:loaded?.revision}),isBusy:()=>busy||dirty||editInputsDirty||!loaded||!Number.isFinite(fitBaselineMm)&&!servicesFirstOK,ensureFit:()=>ensureFit(),setBusy:value=>{busy=value;},getFitBaseline:()=>fitBaselineMm});scroller.append(brep.panel);
 const canvas=element('canvas',{width:640,height:240,'aria-label':'支撑范围和人工高度点示意'});
 canvas.style.cssText='width:100%;height:auto;max-height:240px;border:1px solid var(--border);margin-top:12px';
 advanced.append(referencePanel);brep.moveAdvanced?.(advanced);scroller.append(advanced);
 scroller.append(canvas);
 const footer=element('div',{class:'dialog-footer'});footer.style.cssText='flex-shrink:0;display:flex;flex-wrap:wrap;gap:8px;margin-top:10px';
 const save=button('保存草稿到工程',()=>commit(false),'primary'),remove=button('删除当前草稿',()=>commit(true),'secondary');
 const solve=button('求解数值场',()=>compute(),'secondary'),cancel=button('停止求解',()=>window.webcad.api.reliefDesignField(request('cancel')),'secondary');
 const generate=button('生成网格',()=>generateMesh(),'primary');generate.disabled=true;cancel.disabled=true;
 footer.append(remove,button('关闭',()=>{if(!busy)close();},'secondary'),save,solve,cancel,generate);d.append(scroller,status,footer);
 d._onClose=()=>{if(brep.hasPreview())brep.cancelPreview();clearReferencePreview();if(loaded){window.webcad.api.reliefDesignField(request('cancel'));if(fitRunning)window.webcad.api.reliefDesignFit(request('cancel'));}};
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
  selector.disabled=create.disabled=busy||dirty||editInputsDirty;syncFitControls();
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
 function syncFitControls(){brep?.sync();fitStart.disabled=busy||dirty||editInputsDirty||!loaded||!fieldResult;fitStop.disabled=!fitRunning;}
 function showFitReport(result){
  const report=result.fit?.report||result.error?.details?.metrics&&{metrics:result.error.details.metrics},metric=(label,m)=>m?`${label}：最大 ${m.maxMm} mm，RMS ${m.rmsMm} mm（${m.count} 点）`:'';
  const lines=[metric('训练采样',report?.metrics?.training),metric('独立采样',report?.metrics?.independent),metric('保护采样',report?.metrics?.protection)].filter(Boolean);
  if(report?.controlPoints!==undefined)lines.push(`锁定控制点 ${report.lockedControlPoints} / ${report.controlPoints}；投影残差 ${report.projectedResidualMm} mm。`);
  if(report?.protectionCertificate)lines.push(`保护证据：相交基函数支撑锁定到基准；固定单元 ${report.protectionCertificate.fixedCellCount}，检查舍入界 ${report.protectionCertificate.roundoffCheckMm} mm。`);
  const pr=result.fit?.precision;if(pr)lines.push(`加工精度 ${pr.machiningPrecisionMm} mm：独立采样最大偏差 ${(+pr.independentMaxMm).toFixed(3)} mm，${pr.withinPrecision?'在精度内':'超过精度——小于精度的细节已在数值场中平滑，建议接受误差不大于加工精度'}。`);
  lines.push('偏差仅针对采样，非全局公差。尚未生成 BRep、未提交几何，不代表加工验收。');fitResult.textContent=lines.join('\n');
 }
 async function computeFit(){
  if(busy)return;if(!loaded||dirty||editInputsDirty||!fieldResult){fitResult.textContent='请先保存草稿和笔画到工程，再求解当前数值场；不会自动求解。';return;}
  let controls=[],wasGenerateDisabled=generate.disabled;
  try{
   const options=readFitOptions();
   if(!['emboss','engrave'].includes(options.mode)||![options.controlColumns,options.controlRows].every(n=>Number.isSafeInteger(n)&&n>=4&&n<=65)||!Number.isFinite(options.controlMaxMm)||options.controlMaxMm<0||options.controlMaxMm>20||!Number.isFinite(options.acceptanceToleranceMm)||options.acceptanceToleranceMm<=0||options.acceptanceToleranceMm>20)throw new Error('请填写4–65整数控制列/行、0–20 mm高度上限和大于0且不超过20 mm的采样误差。');
   busy=fitRunning=true;controls=[...scroller.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);for(const [el]of controls)el.disabled=true;save.disabled=solve.disabled=remove.disabled=generate.disabled=true;fitStop.disabled=false;fitResult.textContent='正在拟合当前数值场；可停止，不自动重试或调整参数。';
   const result=await window.webcad.api.reliefDesignFit(request('fit',{options}));
   fitBaselineMm=result.status==='fitted'?result.fit?.baselineMm:NaN;brep.reset();if(result.status!=='fitted'){if(result.error?.details?.metrics){showFitReport(result);fitResult.textContent=humanError({code:result.error.code,message:result.error.message})+'\n'+fitResult.textContent;}else{fitResult.textContent=humanError({code:result.error?.code,message:result.error?.message});const g=result.error?.details;if(result.error?.code==='FIT_CONSTRAINT_CONFLICT'&&Number.isFinite(g?.suggestedMarginMm))fitResult.textContent+=`\n建议：位置 (${(+g.xMm).toFixed(2)}, ${(+g.yMm).toFixed(2)}) mm 的高度贴近支撑边缘、孔或保护区，被锁定的边界控制点无法表达。请把该处高度向内移动，使其距边缘/孔/保护区至少 ${g.suggestedMarginMm.toFixed(2)} mm（约 2 个控制间距，当前间距 ${g.controlSpacingMm.toFixed(2)} mm）；或增加控制点数，或在图片导入中加大“边缘留空”。`;}return;}showFitReport(result);
  }catch(error){fitResult.textContent=humanError(error);}
  finally{busy=fitRunning=false;for(const [el,disabled]of controls)el.disabled=disabled;save.disabled=solve.disabled=false;remove.disabled=!loaded;generate.disabled=wasGenerateDisabled||dirty||editInputsDirty||!fieldResult;syncEditControls();}
 }
 function readFitOptions(){const number=n=>n.value.trim()===''?NaN:Number(n.value);return {...(fitMode.value==='engraveDepth'?{mode:'engrave',heightInterpretation:'engraveDepth'}:{mode:fitMode.value}),controlColumns:number(fitColumns),controlRows:number(fitRows),controlMaxMm:number(fitMax),acceptanceToleranceMm:number(fitTolerance)};}
 // Services-first (261022-05): with Services ready, 准备 needs no browser fit — a provisional net is retained and
 // the first full (high-res) fit runs on Services at preview; the browser fit is only the fallback.
 async function ensureFit(){
  if(Number.isFinite(fitBaselineMm))return true;
  if(!servicesFirstOK)return false;
  const r=await window.webcad.api.reliefDesignFit(request('servicesFirst',{options:readFitOptions()}));
  if(r.status!=='fitted')throw Object.assign(new Error(r.error?.message??'Services 首次拟合准备失败'),{code:r.error?.code});
  fitBaselineMm=r.fit.baselineMm;fitResult.textContent='浏览器未拟合：首次完整拟合将在 Services 以高分辨率完成（预览时），浏览器复核结果；Services 不可用时请先用浏览器拟合（回退）。';return true;
 }
 async function stopFit(){if(!fitRunning)return;fitStop.disabled=true;try{await window.webcad.api.reliefDesignFit(request('cancel'));fitResult.textContent='拟合已停止；已求解数值场仍保留。';}catch(error){fitResult.textContent=humanError(error);}}
 async function compute(){
  if(busy)return;
  if(!loaded||dirty||editInputsDirty){status.textContent='请先保存当前设计和笔画修改，再求解同工程草稿。';return;}
  busy=true;solve.disabled=save.disabled=true;cancel.disabled=false;generate.disabled=true;status.textContent='正在有界 Worker 中求解…';
  try{const result=await window.webcad.api.reliefDesignField(request('solve'));if(result.status!=='solved')throw new Error(result.error?.message||'未得到数值场');fieldResult=result;drawField(result);const r=result.report.solver;status.textContent=`数值场 ${result.field.columns}×${result.field.rows}；实际投影残差 ${r.projectedResidualMm} mm；${r.iterations} 次迭代。孔为保守排除单元，保护区保持初始高度。`;const c=await window.webcad.api.reliefDesignField(request('candidate',{baseMm:Number(base.value)}));generate.disabled=c.status!=='candidate';if(c.blockers?.length)status.textContent+=' '+c.blockers.map(code=>humanError({code})).join(' ');else if(c.domainReport)status.textContent+=` 边界为采样折线，近似界 ${c.domainReport.boundaryApproximationBoundMm.toFixed(3)} mm；保留 ${c.domainReport.holeCount} 个贯穿孔。`;}
  catch(e){status.textContent=humanError(e);}finally{busy=false;solve.disabled=save.disabled=false;cancel.disabled=true;syncEditControls();}
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
  const heightSource=pendingHeight===undefined?loaded?.draft.heightSource:pendingHeight;
  return validateReliefDesign({...(loaded?.draft.reference?{reference:loaded.draft.reference}:{}),...(heightSource?{heightSource}:{}),schemaVersion:1,name:name.value,support,throughHoles:regions(holes.area),protectedZones:regions(zones.area),heightRangeMm:[number(low),number(high)],points:authored,fieldSettings:{...loaded?.draft.fieldSettings,columns:number(resolution),machiningPrecisionMm:number(precision),rows:resolutionTouched?number(resolution):(loaded?.draft.fieldSettings?.rows??number(resolution))}});
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
 function load(entry){fitBaselineMm=NaN;precision.value=.05;brep?.reset();pendingHeight=undefined;heightPanel?.reset();
  dirty=false;resolutionTouched=false;fieldResult=null;generate.disabled=true;fitResult.textContent='尚未拟合；需当前草稿的已求解数值场。';
  loaded=entry?structuredClone(entry):null;
  const draft=entry?.draft||{name:'新设计草稿',support:{kind:'circle',centerMm:[0,0],radiusMm:30},heightRangeMm:[0,3],throughHoles:[],protectedZones:[],points:[]},s=draft.support;
  name.value=draft.name;kind.value=s.kind;cx.value=s.centerMm[0];cy.value=s.centerMm[1];width.value=s.kind==='circle'?s.radiusMm*2:s.widthMm;height.value=s.kind==='rect'?s.heightMm:s.radiusMm*2;
  low.value=draft.heightRangeMm[0];high.value=draft.heightRangeMm[1];resolution.value=draft.fieldSettings?.columns??33;precision.value=draft.fieldSettings?.machiningPrecisionMm??.05;points.area.value=draft.points.map(p=>[...p.pointMm,p.heightMm].join(' ')).join('\n');
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
 scroller.addEventListener('input',event=>{if(busy||event.target===referencePicker||event.target===editList)return;if(event.target.dataset.designFit){fitResult.textContent='拟合参数已改变；上次报告不对应当前输入。参数不会自动保存为设计高度。';return;}fitResult.textContent='设计或笔画输入已改变；请先保存并求解后重新拟合。';if(event.target.dataset.designEdit){editInputsDirty=true;generate.disabled=true;syncEditControls();try{draw(read());status.textContent='笔画参数尚未保存；保存此笔将一起保存当前表单修改。';}catch(e){status.textContent=humanError(e);}return;}if(event.target===resolution)resolutionTouched=true;dirty=true;fieldResult=null;generate.disabled=true;height.disabled=kind.value==='circle';syncEditControls();try{draw(read());status.textContent='有未保存的设计修改；旧数值场不能生成几何。';}catch(e){status.textContent=humanError(e);}});
 load(initial.document.reliefDesigns?.[0]||null);
}
