// UI for fit → exact relief BRep: current face selection, explicit placement and
// baseline, then preview/cancel/apply through the ordinary preview routes.
// Nothing is guessed: face centre / default X are only filled by explicit clicks.
import {humanError} from '../../error-recovery.js';
import {reliefFaceAxes} from '../../modeling/manufacturing/relief-design-binding.js';

// Pure: current selection -> target, or a Chinese reason.
export function selectedPlanarTarget(selection){
 const t=selection?.topology;
 if(!t||t.type!=='face'||!Array.isArray(t.ids)||t.ids.length!==1||typeof t.bodyId!=='string'||!Number.isInteger(t.ids[0]))return {error:'请在模型上只选中一个面（面选择模式），作为浮雕支撑平面。'};
 return {target:{bodyId:t.bodyId,faceId:t.ids[0]}};
}
// Pure: form values -> prepareReliefDesignRelief request fields. Empty fields stay undefined (=> blocked server-side).
export function brepRequestFields({target,support,origin,xDirection,baselineConfirmed,baselineMm,evidence}){
 const vec=v=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='string'?x.trim()!==''&&Number.isFinite(Number(x)):Number.isFinite(x))?v.map(Number):undefined;
 const o=vec(origin),x=vec(xDirection);
 return {target:{...target,...(support?.sourceSha256?{expectedSourceSha256:support.sourceSha256}:{})},
  ...(o&&x?{placement:{originMm:o,xDirection:x}}:{}),
  ...(baselineConfirmed&&Number.isFinite(baselineMm)?{datum:{kind:'authoredBaselineOnSelectedFace',baselineMm}}:{}),
  ...(typeof evidence==='string'&&evidence.trim()?{machiningIntent:{version:1,requestedGeometry:'continuousRelief',sourceInterpretation:'authoredHeightMap',userIntentEvidence:evidence.trim()}}:{})};
}
export function defaultFaceXDirection(normal){return reliefFaceAxes(normal).x;}
// Pure: Services routing snapshot -> Chinese execution receipt (side, reason, control net, error).
export function brepExecutionSummary(routing,{elapsedMs,done=false}={}){
 const d=routing?.lastDecision,rd=routing?.lastReliefDesign,w=routing?.pendingWait,lines=[];
 const side=d?.executor==='remote'?'Services（后台）':d?.executor==='local'?'浏览器（本地回退）':'判定中';
 lines.push(`执行端：${side}${d?.reason?` — ${d.reason}`:''}`);
 if(!done)lines.push(`阶段：${w?`Services 作业 ${w.jobId} 运行中（${Math.round((w.elapsedMs??0)/1000)} s，等待结果）`:d?.executor==='remote'?'Services 拟合/裁剪中':d?'浏览器计算中':'路由判定中'}${Number.isFinite(elapsedMs)?`，已用 ${(elapsedMs/1000).toFixed(1)} s`:''}`);
 if(done&&rd&&d?.executor==='remote'){const f=v=>Number.isFinite(v)?v.toFixed(4):'—';const over=Number.isFinite(rd.maxErrorMm)&&Number.isFinite(rd.machiningPrecisionMm)&&rd.maxErrorMm>rd.machiningPrecisionMm+1e-9;lines.push(`最终控制网：${rd.controlNet?.[0]??'—'}×${rd.controlNet?.[1]??'—'}${rd.qualityCapacityRetry?`（容量重试 ${rd.qualityCapacityRetry.fromMaxControlSide}→${rd.qualityCapacityRetry.toMaxControlSide}）`:''}；拟合误差 max ${f(rd.maxErrorMm)} mm，RMS ${f(rd.rmsErrorMm)} mm${rd.jobId?`；作业 ${rd.jobId}`:''}${over?'；超过目标精度，可应用后按效果决定是否保留':''}`);}
 else if(done&&d?.executor==='local')lines.push('最终控制网：使用“拟合”中已有的浏览器控制网（见准备信息）');
 if(done&&Number.isFinite(elapsedMs))lines.push(`总用时 ${(elapsedMs/1000).toFixed(1)} s`);
 if(done&&rd?.volumeReview?.consistent===false)lines.push(`⚠ 近似候选（体积未验证）${Number.isFinite(rd.volumeReview.relativeError)?` 体积差 ${(rd.volumeReview.relativeError*100).toFixed(2)}%`:''}：可按预览效果应用、调整或撤销。`);
 return lines.join('\n');
}

export function createReliefBrepPanel({element,button,request,isBusy,setBusy,getFitBaseline,runPreview,ensureFit=async()=>true,draftGate=()=>({saved:true,reason:''})}){
 // Preview routes: the host's UI path (fromUI) when provided, so the open design dialog is not an "active task" blocker.
 const route=async(action,args)=>{if(runPreview)return runPreview(action,args);return api().execute({context:api().getState().requestContext,idempotencyKey:crypto.randomUUID(),action,args});};
 const panel=element('details',{});panel.style.cssText='margin-top:12px;border:1px solid var(--border);padding:8px';
 panel.append(element('summary',{},'生成浮雕实体（B样条 BRep）'));
 // Placement/baseline/evidence inputs are not design edits: keep them from marking the draft dirty.
 for(const type of ['input','change'])panel.addEventListener(type,event=>event.stopPropagation());
 const hint=element('p',{class:'property-footnote'},'选中模型平面后读取选面，默认放在面中心。预览满意后应用，随时可撤销。');
 const grid=element('div',{class:'parameter-form'});grid.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 10px';
 const advGrid=element('div',{class:'parameter-form'});advGrid.style.cssText=grid.style.cssText;
 const num=(label,parent=grid)=>{const row=element('label',{class:'form-field'}),input=element('input',{type:'number',step:'any'});row.append(element('span',{},label),input);parent.append(row);return input;};
 const ox=num('中心 X mm'),oy=num('中心 Y mm'),oz=num('中心 Z mm'),xx=num('X方向 x',advGrid),xy=num('X方向 y',advGrid),xz=num('X方向 z',advGrid);
 const baseRow=element('label',{class:'form-field'}),baseCheck=element('input',{type:'checkbox'}),baseText=element('span',{},'确认所选平面即设计基线');baseRow.append(baseCheck,baseText);
 const evidence=element('textarea',{rows:2,maxlength:1200,placeholder:'加工意图说明（必填，例如：按当前设计在此平面上做连续浮雕）'});evidence.value='按当前设计在所选平面上做连续浮雕（默认说明，可在高级配置中修改）';baseCheck.checked=true;evidence.style.cssText='width:100%';
 const info=element('p',{class:'property-footnote','aria-live':'polite'},'尚未读取选面。');info.style.cssText='white-space:pre-line;overflow-wrap:anywhere';
 let target=null,support=null,prepared=null,preview=null;
 const read=button('读取当前选面',()=>readFace(),'secondary'),useCenter=button('以面心为图案中心',()=>{if(!support)return;[ox.value,oy.value,oz.value]=support.centerMm;},'secondary'),holeSel=element('select',{'aria-label':'圆形边'}),useHole=button('对齐到圆孔/圆边中心',()=>{const e=support?.circularEdges?.find(c=>String(c.edgeIndex)===holeSel.value);if(!e)return;[ox.value,oy.value,oz.value]=e.centerMm;prepared=null;sync();},'secondary'),useX=button('使用面默认X方向',()=>{if(!support)return;[xx.value,xy.value,xz.value]=defaultFaceXDirection(support.normal);},'secondary');
 const prep=button('准备',()=>prepare(),'secondary'),start=button('生成预览',async()=>{if(!prepared)await prepare();if(prepared)await startPreview();},'primary'),cancel=button('取消预览',()=>cancelPreview(),'secondary'),apply=button('应用',()=>applyPreview(),'primary');
 const row1=element('div',{}),row2=element('div',{});for(const r of [row1,row2])r.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
 row1.append(read,useCenter,holeSel,useHole,useX);row2.append(prep,start,cancel,apply);
 // 高级配置: X direction, baseline confirmation and intent note sit in the dialog's collapsed section
 // (defaults: face-default X, baseline confirmed, default intent note). Centre/alignment stay essential.
 const advBox=element('details',{'data-relief-advanced-brep':'true'});advBox.append(element('summary',{},'精确 BRep：X方向 / 基线确认 / 加工意图'),advGrid,baseRow,evidence);
 advBox.append(prep);
 for(const input of [ox,oy,oz])advGrid.append(input.closest('label'));
 advBox.append(useX);row1.removeChild(useCenter);advBox.append(useCenter);
 for(const type of ['input','change'])advBox.addEventListener(type,event=>event.stopPropagation());
 panel.append(hint,row1,grid,row2,info);
 const sync=()=>{const busy=isBusy(),gate=draftGate(),needSave=!gate.saved;read.disabled=busy||!!preview||needSave;useCenter.disabled=useX.disabled=busy||!support||!!preview;holeSel.disabled=useHole.disabled=busy||!support?.circularEdges?.length||!!preview;prep.disabled=busy||!target||!!preview||needSave;start.disabled=busy||!target||!!preview||needSave;cancel.disabled=apply.disabled=!preview;read.title=needSave?(gate.reason||'请先保存草稿到工程'):'读取当前模型选中的支撑平面';prep.title=needSave?(gate.reason||'请先保存草稿到工程'):(!target?'请先读取选面':'准备精确浮雕绑定');const b=getFitBaseline();baseText.textContent=`确认所选平面即设计基线${Number.isFinite(b)?`（${b} mm）`:''}`;if(needSave&&!preview)info.dataset.gateHint='1';else delete info.dataset.gateHint;};
 for(const el of [ox,oy,oz,xx,xy,xz,baseCheck,evidence])el.addEventListener('input',()=>{prepared=null;sync();});
 const api=()=>window.webcad.api;
 function fields(){return brepRequestFields({target,support,origin:[ox.value,oy.value,oz.value],xDirection:[xx.value,xy.value,xz.value],baselineConfirmed:baseCheck.checked,baselineMm:getFitBaseline(),evidence:evidence.value});}
 async function call(extra){const r=await api().prepareReliefDesignRelief({...request(),...extra});if(r.status==='failed')throw Object.assign(new Error(r.error?.message),{code:r.error?.code});return r;}
 async function readFace(){
  const gate=draftGate();if(!gate.saved){info.textContent=gate.reason||'请先保存草稿到工程，再读取选面。';sync();return;}
  prepared=null;const picked=selectedPlanarTarget(api().getState({include:['selection']}).selection);
  if(picked.error){target=support=null;info.textContent=picked.error;sync();return;}
  target=picked.target;
  try{const r=await call({target});support=r.support;holeSel.replaceChildren(...(support?.circularEdges??[]).map(e=>element('option',{value:String(e.edgeIndex)},`边 ${e.edgeIndex}：R${+e.radiusMm.toFixed(3)} 中心 [${e.centerMm.map(v=>+v.toFixed(3)).join(', ')}]`)));info.textContent=support?.planar?`已读取：实体 ${target.bodyId} 面 ${target.faceId}，面心 [${support.centerMm.map(v=>+v.toFixed(4)).join(', ')}]，法向 [${support.normal.map(v=>+v.toFixed(4)).join(', ')}]。请明确填写或确认图案中心与X方向。${support.circularEdges?.length?`面上有 ${support.circularEdges.length} 条圆形边；带孔面的面心会偏离孔/圆心，可用“对齐到圆孔/圆边中心”。`:''}`:'所选面不是平面，不能作为拟合浮雕支撑面。';}
  catch(error){support=null;info.textContent=humanError(error);}
  // Sensible defaults so the common case needs no advanced fields: face centre and face-default X when empty.
  if(support?.planar){if([ox,oy,oz].every(i=>i.value===''))[ox.value,oy.value,oz.value]=support.centerMm;if([xx,xy,xz].every(i=>i.value===''))[xx.value,xy.value,xz.value]=defaultFaceXDirection(support.normal);}
  sync();
 }
 async function prepare(){
  const gate=draftGate();if(!gate.saved){info.textContent=gate.reason||'请先保存草稿到工程，再准备。';sync();return;}
  try{if(!(await ensureFit())){prepared=null;info.textContent='请先在“拟合”中拟合当前数值场（Services 不可用，使用浏览器拟合）。';sync();return;}
   const r=await call(fields());prepared=r.status==='prepared'?r:null;
   info.textContent=prepared?`已准备：控制网格 ${prepared.previewArgs.params.values[0].length}×${prepared.previewArgs.params.values.length}，深度 ${prepared.previewArgs.params.depthMm} mm，偏移 (${prepared.previewArgs.params.offsetX.toFixed(4)}, ${prepared.previewArgs.params.offsetY.toFixed(4)}) mm，旋转 ${prepared.previewArgs.params.angleDeg.toFixed(3)}°。尚未计算几何，请预览。`:'未能准备：\n'+r.blockers.map(b=>'· '+b.message).join('\n');}
  catch(error){prepared=null;info.textContent=humanError(error);}sync();
 }
 async function startPreview(){
  if(!prepared)return;setBusy(true);sync();info.textContent='正在计算精确浮雕预览…';
  const t0=performance.now(),routing=()=>{try{return api().getServicesRouting?.()??null;}catch{return null;}};
  // Poll the routing snapshot so the panel shows which side is executing and the current stage.
  const timer=setInterval(()=>{info.textContent='正在计算精确浮雕预览…\n'+brepExecutionSummary(routing(),{elapsedMs:performance.now()-t0});},1000);
  try{const r=await route('preview.start',prepared.previewArgs);
   if(r.status!=='previewing')throw Object.assign(new Error(r.error?.message||'预览未生成'),{code:r.error?.code});preview=r.preview??{};info.textContent='浮雕预览已生成。可以应用并保存，效果不满意可撤销。偏差与体积估算供参考，可在高级配置调整细节精度。\n'+brepExecutionSummary(routing(),{elapsedMs:performance.now()-t0,done:true});}
  catch(error){preview=null;info.textContent=humanError(error)+'\n'+brepExecutionSummary(routing(),{elapsedMs:performance.now()-t0,done:true});}finally{clearInterval(timer);setBusy(false);sync();}
 }
 const identity=()=>preview?.previewId?{previewId:preview.previewId,expectedGeneration:preview.generation}:{};
 async function finish(action){
  setBusy(true);sync();
  try{const r=await route(action,identity());if(r.status==='failed')throw Object.assign(new Error(r.error?.message),{code:r.error?.code});
   preview=null;prepared=null;info.textContent=action==='preview.commit'?'已应用：精确浮雕已加入工程历史，可撤销；绑定随工程保存。':'预览已取消，工程未改变。';}
  catch(error){info.textContent=humanError(error);}finally{setBusy(false);sync();}
 }
 function cancelPreview(){return finish('preview.cancel');}
 function applyPreview(){return finish('preview.commit');}
 sync();
 function moveAdvanced(advanced){advanced.append(advBox);}
 // Selected-face placement for the mesh candidate (same face / centre / X as the BRep path), or null.
 function facePlacement(){const v=a=>a.every(i=>i.value.trim()!==''&&Number.isFinite(Number(i.value)))?a.map(i=>Number(i.value)):null,o=v([ox,oy,oz]),x=v([xx,xy,xz]);return support?.planar&&o&&x?{originMm:o,normal:[...support.normal],xDirection:x}:null;}
 return {panel,sync,moveAdvanced,facePlacement,readFace,reset(){target=support=prepared=null;if(!preview)info.textContent='尚未读取选面。';sync();},hasPreview:()=>!!preview,cancelPreview};
}
