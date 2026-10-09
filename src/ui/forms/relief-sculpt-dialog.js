import {layeredReliefProperties} from './relief-layer-properties.js';
import {createReliefStroke,sculptState} from '../../relief-sculpt.js';
import {createReliefSculptView} from './relief-sculpt-view.js';
import {assertHistoryEditSafe} from '../../history-edit-safety.js';

const draftCache=new Map();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const signature=f=>JSON.stringify([f.params,f.refs,f.placement]);
export function showReliefSculptDialog({featureId,getState,openDialog,element,button,onEdit,close}){
 let initial=getState();const features=initial.document.features.filter(f=>f.op==='relief'&&(!f.params?.layers||f.id===featureId));
 const d=openDialog('浮雕精修','左侧涂刷，右侧旋转查看；应用当前图层后写入工程。');
 d.style.cssText='width:min(1040px,96vw);max-width:96vw;max-height:94vh;overflow:auto;padding:18px';
 if(!features.length){d.append(element('p',{},'此工程没有可编辑的浮雕步骤。请打开保留浮雕历史的 .webcad 工程；单独导入的 STP 没有高度场。'));return;}
 const layered=features.find(f=>f.id===featureId&&f.params?.layers);if(layered){d.append(layeredReliefProperties({feature:layered,element,button,onEdit,getBusy:()=>getState().busy}));return;}
 const storageKey='webcad.reliefSculptDrafts.v1:'+initial.document.documentId;
 let saved=draftCache.get(storageKey)||{},storageWarning='';
 try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null')||saved;}catch{storageWarning='草稿暂存仅在当前页面有效。';}
 for(const id of Object.keys(saved)){const source=features.find(f=>f.id===id);if(!source||saved[id].signature!==signature(source))delete saved[id];}
 let f,params,draft,undo=[],redo=[],active=null,live=true,busy=false,showOriginal=false,frame=0,hover=null;
 const histories=new Map(),status=element('p',{'aria-live':'polite',class:'property-callout'});
 status.style.cssText='margin:8px 0;min-height:20px';
 const controls=element('div',{class:'parameter-form'});controls.style.cssText='display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 10px';
 function field(label,el){const row=element('label',{class:'form-field'});row.style.margin='0';row.append(element('span',{},label),el);controls.append(row);return el;}
 function choice(label,options){const el=field(label,element('select',{'aria-label':label}));for(const [value,title]of options)el.append(element('option',{value},title));return el;}
 function number(label,value,min,max,step){return field(label,element('input',{type:'number',value,min,max,step,'aria-label':label}));}
 const feature=choice('浮雕图层',features.map(f=>[f.id,f.name||'浮雕']));feature.value=features.some(f=>f.id===featureId)?featureId:features[0].id;
 const mode=choice('精修笔刷',[['raise','抬高'],['lower','压低'],['smooth','平滑'],['flatten','定高压平'],['fill','填洼'],['scrape','削峰'],['sharpen','锐化'],['restore','恢复原形'],['mask','涂保护区'],['unmask','擦保护区']]);
 const radius=number('笔刷半径 mm',3,.1,1000,.1),strength=number('强度',.5,.01,1,.05),amount=number('每笔高度 mm',.15,.001,20,.05),target=number('目标控制高度 mm',1,0,20,.1),hardness=number('硬度（0软—1硬）',0,0,1,.1);
 const symmetry=choice('对称雕刻',[['none','不对称'],['x','左右对称'],['y','上下对称'],['xy','左右＋上下']]);
 const canvases=element('div',{});canvases.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:12px';
 const canvas=element('canvas',{'aria-label':'浮雕精修画布',tabindex:0}),preview=element('canvas',{'aria-label':'浮雕起伏预览'});
 for(const [c,title]of [[canvas,'涂刷区 · 蓝色为保护区'],[preview,'高度草稿 · 拖动旋转 / 滚轮缩放']]){const cell=element('div',{});const heading=element('p',{class:'property-footnote'},title);heading.style.margin='4px 0';cell.append(heading,c);c.style.cssText='display:block;width:100%;aspect-ratio:2/1;border:1px solid var(--border);border-radius:8px;touch-action:none;background:#20242a';canvases.append(cell);}
 const bar=element('div',{class:'dialog-footer'});bar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:10px';
 const back=button('撤销笔画',()=>{if(busy||active||!undo.length)return;redo.push(draft);draft=undo.pop();stash();update();},'secondary');
 const forward=button('重做笔画',()=>{if(busy||active||!redo.length)return;undo.push(draft);draft=redo.pop();stash();update();},'secondary');
 const compare=button('查看原形',()=>{showOriginal=!showOriginal;update();},'secondary');
 const clearMask=button('清除保护区',()=>{remember();draft={...draft,mask:draft.mask.map(r=>r.map(()=>0))};stash();update();},'secondary');
 const fit=button('预览归位',()=>view.fit(),'secondary');
 const discard=button('放弃本层修改',()=>{draft=sculptState(params);undo=[];redo=[];showOriginal=false;stash();update();},'secondary');
 const apply=button('应用当前图层',async()=>{
  if(busy||active)return;
  try{
   const current=getState();
   if(current.document.documentId!==initial.document.documentId||current.revision!==initial.revision)throw new Error('工程已改变，草稿已保留，请关闭精修后重新打开。');
   busy=true;update();status.textContent='正在重建浮雕…';
   const result=await onEdit(f.id,{sculpt:structuredClone(draft)},f.name);
   if(result===false)throw new Error('应用未完成，草稿已保留。');
   initial=getState();const committed=initial.document.features.find(x=>x.id===f.id);
   if(!same(committed?.params.sculpt,draft))throw new Error('未确认精修提交，草稿已保留。');
   f=committed;params=structuredClone(f.params);draft=sculptState(params);undo=[];redo=[];stash();
   if(live){busy=false;update();status.textContent='当前图层已应用，可以继续精修或切换图层。';}
  }catch(e){if(live)status.textContent=e.message;}
  finally{busy=false;if(live)update(false);}
 },'primary');
 const cancel=button('关闭（保留草稿）',close,'secondary');
 bar.append(back,forward,compare,clearMask,fit,discard,cancel,apply);
 d.addEventListener('cancel',e=>{if(busy){e.preventDefault();e.stopImmediatePropagation();}},true);
 d.addEventListener('click',e=>{if(busy&&(e.target===d||e.target.closest('.close-button'))){e.preventDefault();e.stopImmediatePropagation();}},true);
 const info=element('p',{class:'property-footnote'});info.style.margin='6px 0';
 d.append(controls,status,canvases,info,bar);
 const view=createReliefSculptView(canvas,preview);
 function persist(){draftCache.set(storageKey,saved);try{const data=JSON.stringify(saved);if(data.length>2*1024*1024)throw new Error();sessionStorage.setItem(storageKey,data);storageWarning='';}catch{storageWarning='草稿暂存仅在当前页面有效，请应用并保存工程。';}}
 function stash(){if(!f)return;if(same(draft,sculptState(params)))delete saved[f.id];else saved[f.id]={signature:signature(f),sculpt:structuredClone(draft)};histories.set(f.id,{undo,redo});persist();for(const opt of feature.options)opt.textContent=(features.find(x=>x.id===opt.value)?.name||'浮雕')+(saved[opt.value]?' · 草稿':'');}
 function remember(){undo.push(structuredClone(draft));if(undo.length>40)undo.shift();redo=[];}
 function load(){
  f=initial.document.features.find(f=>f.id===feature.value);params=structuredClone(f.params);
  try{draft=sculptState(saved[f.id]?.signature===signature(f)?{...params,sculpt:saved[f.id].sculpt}:params);}catch{delete saved[f.id];draft=sculptState(params);}
  ({undo=[],redo=[]}=histories.get(f.id)||{});showOriginal=false;
  const step=Math.max(params.widthMm/(params.values[0].length-1),params.heightMm/(params.values.length-1));radius.min=String(step);radius.value=String(Math.max(step*2,Math.min(params.widthMm,params.heightMm)/10));target.value=String(params.depthMm/2);hover=null;update();
 }
 function update(message=true){
  const locked=busy||!!active,changed=!same(draft,sculptState(params));
  back.disabled=locked||!undo.length;forward.disabled=locked||!redo.length;apply.disabled=locked||!changed;discard.disabled=locked||!changed;cancel.disabled=busy;
  const exit=d.querySelector('.close-button');if(exit)exit.disabled=busy;
  for(const c of [...controls.querySelectorAll('input,select'),compare,clearMask,fit])c.disabled=locked;
  target.disabled=locked||mode.value!=='flatten';amount.disabled=locked||!['raise','lower'].includes(mode.value);
  compare.textContent=showOriginal?'返回精修':'查看原形';clearMask.disabled=locked||showOriginal;
  if(message)status.textContent=showOriginal?'正在查看本层修改前形状。':`${f.name||'浮雕'} · ${changed?'有未应用草稿':'已与工程同步'}${params.mode==='engrave'?' · 凹雕：抬高变浅、压低加深':''} ${storageWarning}`;
  try{assertHistoryEditSafe(initial.document,{...initial.document,features:initial.document.features.map(x=>x.id===f.id?{...x,params:{...x.params,sculpt:draft}}:x)});}catch(e){apply.disabled=true;if(message)status.textContent=e.message+' 请在这些加工步骤之前精修。';}
  target.previousElementSibling.textContent=params.mode==='engrave'?'目标控制深度 mm':'目标控制高度 mm';
  info.textContent=`Shift 平滑 · Ctrl 反向 · Alt 点击吸取控制高度 · [ ] 调半径 · Ctrl+Z/Y 撤销/重做。网格 ${params.values[0].length}×${params.values.length}，最小半径 ${Number(radius.min).toFixed(2)} mm；轮廓不变。草稿保留在本标签页，应用后请保存工程。`;
  view.update(params,showOriginal?sculptState(params):draft);drawCursor();
 }
 function drawCursor(){view.cursor(hover,Number(radius.value),symmetry.value,Number(hardness.value));}
 const valid=p=>p.every(v=>Number.isFinite(v)&&v>=-.5&&v<=.5);
 function flush(){frame=0;if(!live)return;if(active?.pending.length){try{draft=active.engine.append(active.pending.splice(0));view.update(params,draft);}catch(e){active.error=e.message;status.textContent=e.message;}}drawCursor();}
 function schedule(){if(!frame)frame=requestAnimationFrame(flush);}
 function flushNow(){if(frame)cancelAnimationFrame(frame);flush();}
 canvas.addEventListener('pointerdown',e=>{
  if(busy||active||showOriginal||e.button!==0)return;e.preventDefault();canvas.focus();
  try{
   const pt=view.point(e);if(!valid(pt))return;hover=pt;
   if(e.altKey){target.value=String(view.sample(pt));mode.value='flatten';update();status.textContent=`已吸取控制${params.mode==='engrave'?'深度':'高度'} ${target.value} mm，使用定高笔刷涂刷。`;return;}
   const inverse={raise:'lower',lower:'raise',mask:'unmask',unmask:'mask'};
   const chosen=e.shiftKey?'smooth':e.ctrlKey?(inverse[mode.value]||mode.value):mode.value;
   const engine=createReliefStroke({...params,sculpt:draft},{mode:chosen,radiusMm:Number(radius.value),strength:Number(strength.value),amountMm:Number(amount.value),targetMm:Number(target.value),hardness:Number(hardness.value),symmetry:symmetry.value});
   active={before:structuredClone(draft),engine,pending:[pt],pointerId:e.pointerId};canvas.setPointerCapture(e.pointerId);update(false);schedule();
  }catch(error){status.textContent=error.message;}
 });
 canvas.addEventListener('pointermove',e=>{
  const pt=view.point(e);hover=valid(pt)?pt:null;
  if(active&&active.pointerId===e.pointerId&&!active.error){const events=e.getCoalescedEvents?.();for(const event of events?.length?events:[e]){const p=view.point(event);if(valid(p))active.pending.push(p);}}
  if(!busy)schedule();
 });
 function finish(cancelled=false){
  if(!active)return;flushNow();const {before,error}=active;active=null;
  if(cancelled)draft=before;else if(!same(before,draft)){undo.push(before);if(undo.length>40)undo.shift();redo=[];}
  stash();update();if(error)status.textContent=error+' 已保留此前笔画，可继续另起一笔。';
 }
 canvas.addEventListener('pointerup',e=>{if(active?.pointerId!==e.pointerId)return;const p=view.point(e);if(valid(p)&&!active.error)active.pending.push(p);finish();});
 canvas.addEventListener('pointercancel',()=>finish(true));canvas.addEventListener('lostpointercapture',()=>finish());canvas.addEventListener('pointerleave',()=>{hover=null;if(!active)schedule();});
 d.addEventListener('keydown',e=>{
  if(busy||active||e.target.matches('input,select,textarea'))return;
  if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();if(e.key.toLowerCase()==='y'||e.shiftKey)forward.click();else back.click();}
  if(e.key==='['||e.key===']'){e.preventDefault();radius.value=String(Math.max(Number(radius.min),Math.min(1000,Number(radius.value)*(e.key==='['?.85:1/.85))));drawCursor();}
 });
 feature.addEventListener('change',()=>{stash();load();});mode.addEventListener('change',()=>update());
 for(const input of [radius,hardness,symmetry])input.addEventListener('input',drawCursor);
 d._onClose=()=>{finish();stash();live=false;if(frame)cancelAnimationFrame(frame);view.dispose();};load();stash();
}

