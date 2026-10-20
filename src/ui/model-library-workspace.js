import {humanError} from '../error-recovery.js';
import {iconButtonContent} from './vector-icon.js';
import {modelLibrary} from '../model-library.js';
import {QUICK_MODELS} from '../quick-models.js';
import {modelPreview} from './model-preview.js';

export function mountModelLibrary(root,{element,button,onClose,onChoose,getMode,setMode}){
 let selectedId=null,query='',library;
 const header=element('header',{class:'library-heading'}),title=element('div'),controls=element('div',{class:'library-controls'});
 title.append(element('h1',{},'快捷模型'),element('p',{},'选择模型，设置参数后插入当前工程。'));
 const search=element('input',{type:'search',placeholder:'搜索模型名称、类型或说明','aria-label':'搜索模型库'});
 const cards=button('卡片',()=>setMode('cards'),'secondary'),list=button('详细列表',()=>setMode('list'),'secondary');
 for(const [control,kind,label]of [[cards,'libraryCards','卡片'],[list,'libraryList','详细列表']]){iconButtonContent(control,kind);control.title=label;control.setAttribute('aria-label',label);control.classList.add('library-control-icon');}
 const back=button('返回画布',onClose,'secondary library-close');iconButtonContent(back,'close');back.title='关闭快捷模型 · 返回画布';back.setAttribute('aria-label','返回画布');back.dataset.commandId='workspace';back.dataset.workspace='modeling';
 controls.append(search,cards,list,back);header.append(title,controls);
 const error=element('p',{class:'form-error',role:'alert'}),content=element('div',{class:'library-content'}),grid=element('div',{class:'library-grid','aria-label':'可用快捷模型'}),detail=element('aside',{class:'library-detail','aria-label':'模型详情'});
 content.append(grid,detail);root.append(header,error,content);
 search.addEventListener('input',()=>{query=search.value.trim().toLowerCase();render();root.scrollTop=0;});
 async function move(delta){try{const api=window.webcad.api,index=library.entries.findIndex(item=>item.id===selectedId);const result=await api.updateModelLibrary({context:api.createRequestContext(),expectedLibraryRevision:library.revision,operation:'move',id:selectedId,index:index+delta});if(result.status==='failed')throw Error(result.error.message);error.textContent='';render();}catch(exception){error.textContent=humanError(exception);}}
 function renderDetail(entry){
  detail.replaceChildren();if(!entry){detail.append(element('p',{},'选择一个模型查看参数与说明。'));return;}
  detail.append(modelPreview(entry),element('h2',{},entry.label),button('设置参数并创建',()=>onChoose(entry),'primary'),element('p',{},entry.description));
  const fields=element('dl',{class:'library-defaults'});for(const field of QUICK_MODELS[entry.kind].fields)fields.append(element('dt',{},field.label),element('dd',{},String(entry.defaults[field.key])));
  const guide=element('details',{class:'library-dimension-guide'});guide.append(element('summary',{},'尺寸指示图（默认参数）'),modelPreview(entry,{annotated:true}));
  detail.append(guide);
  const defaults=element('details',{class:'library-default-parameters'});defaults.append(element('summary',{},'默认参数'),fields);
  const order=element('div',{class:'library-editor-actions','aria-label':'快捷工具显示顺序'}),index=library.entries.findIndex(item=>item.id===entry.id);
  for(const [label,delta]of [['上移',-1],['下移',1]]){const control=button(label,()=>move(delta),'secondary');control.dataset.commandId='modelLibraryEdit';control.disabled=index+delta<0||index+delta>=library.entries.length;order.append(control);}
  detail.append(defaults,element('p',{class:'property-footnote'},'工具结构固定；创建时可调整参数。这里只调整显示顺序。'),order);
  const contract=element('details',{class:'library-contract'});contract.append(element('summary',{},'Agent 调用契约'),element('pre',{},JSON.stringify({method:'resolveModelLibrary',args:{id:entry.id,expectedLibraryRevision:library.revision,params:{}}},null,2)),element('p',{},'getModelLibrary 读取参数和范围；resolveModelLibrary 返回可交给 run/add 的参数。'));detail.append(contract);
 }
 function render(){
  try{library=modelLibrary.read();}catch(exception){error.textContent=humanError(exception);grid.replaceChildren();detail.replaceChildren();return;}
  const mode=getMode();cards.setAttribute('aria-pressed',String(mode==='cards'));list.setAttribute('aria-pressed',String(mode==='list'));root.dataset.libraryMode=mode;grid.replaceChildren();
  const entries=library.entries.filter(entry=>!query||`${entry.categoryLabel} ${entry.label} ${entry.kind} ${entry.description} ${QUICK_MODELS[entry.kind].labelEn||''}`.toLowerCase().includes(query));
  if(!entries.some(entry=>entry.id===selectedId))selectedId=entries[0]?.id??null;
  let previousCategory;for(const entry of entries){if(previousCategory!==entry.category){grid.append(element('h2',{class:'library-group-heading'},entry.categoryLabel));previousCategory=entry.category;}const tile=button('',()=>{selectedId=entry.id;renderDetail(entry);for(const item of grid.querySelectorAll('[data-library-id]'))item.setAttribute('aria-pressed',String(item.dataset.libraryId===selectedId));},'library-model');tile.dataset.libraryId=entry.id;tile.setAttribute('aria-pressed',String(entry.id===selectedId));const copy=element('div',{class:'library-model-copy'});copy.append(element('strong',{},entry.label),element('span',{},entry.description||QUICK_MODELS[entry.kind].label));const dimensions=QUICK_MODELS[entry.kind].fields.filter(field=>field.type==='number').slice(0,3).map(field=>field.label+' '+entry.defaults[field.key]).join(' · ');tile.append(modelPreview(entry),copy,element('small',{class:'library-model-values'},dimensions));grid.append(tile);}
  if(!entries.length)grid.append(element('p',{class:'library-empty'},'没有匹配的模型。请修改搜索词。'));renderDetail(entries.find(entry=>entry.id===selectedId));
 }
 render();return {render};
}
