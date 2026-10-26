import {debugJournal,debugAIText} from '../../debug-journal.js';
let active=null;
export function debugPanelOpen(){return !!(active?.isConnected&&active.open);}
export function closeDebugPanel(){active?.close();}
export function showDebugPanel({getReport}){
 if(debugPanelOpen()){active.focus();return;}
 import('./debug-panel.css');
 const el=(tag,attrs={},text)=>{const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
 const d=el('dialog',{class:'cad-dialog debug-panel','aria-label':'Debug 诊断','data-host-control-allowed':'true'});active=d;
 const header=el('header',{class:'debug-header'}),actions=el('div',{class:'debug-actions'}),status=el('p',{class:'debug-status',role:'status'});
 const button=(text,fn,attrs={})=>{const b=el('button',{type:'button',class:'secondary','data-ui-action':'debugReport',...attrs},text);b.addEventListener('click',fn);return b;};
 const fail=e=>{status.textContent='诊断操作未完成：'+String(e.message||e);};
 let report=null,tab='logs',timer=null,disposed=false,refreshing=false;
 const source=el('select',{'aria-label':'日志来源'}),level=el('select',{'aria-label':'日志级别'}),search=el('input',{type:'search',maxlength:'160',placeholder:'搜索操作、字段、错误码','aria-label':'搜索日志'});
 for(const [value,label]of [['all','全部来源'],['ui','人工操作'],['api','页面 API'],['agent','Agent 连接 / 命令'],['kernel','本机内核'],['services','Services'],['runtime','页面运行']])source.append(el('option',{value},label));
 for(const [value,label]of [['all','全部级别'],['error','错误'],['warn','提醒'],['info','过程']])level.append(el('option',{value},label));
 const format=el('select',{'aria-label':'下载日志类型'});for(const [value,label]of [['report','完整诊断 JSON'],['logs','操作日志 JSONL'],['errors','错误日志 JSONL'],['state','当前状态 JSON']])format.append(el('option',{value},label));
 const output=el('textarea',{'aria-label':'可复制的诊断数据',readonly:'',rows:'12'});output.hidden=true;
 const full=()=>Promise.resolve(getReport({limit:1500,includeState:true}));
 const copy=button('复制给 AI',async()=>{try{const data=debugAIText(await full());try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(data);output.hidden=true;status.textContent='已复制当前状态、最近操作和错误详情。';}catch{output.value=data;output.hidden=false;output.focus();output.select();status.textContent='浏览器未允许直接复制，已选中诊断数据，请按 Ctrl+C。';}}catch(e){fail(e);}},{class:'primary'});
 const showText=button('查看文本',async()=>{try{output.value=debugAIText(await full());output.hidden=false;output.focus();output.select();status.textContent='诊断文本已选中，可按 Ctrl+C 复制。';}catch(e){fail(e);}});
 const download=button('下载',async()=>{try{const r=await full(),kind=format.value,value=kind==='logs'||kind==='errors'?(kind==='errors'?r.events.filter(e=>e.level==='error'):r.events).map(e=>JSON.stringify(e)).join('\n'):JSON.stringify(kind==='state'?{capturedAt:r.capturedAt,state:r.state,redaction:r.redaction}:r,null,2),url=URL.createObjectURL(new Blob([value],{type:kind==='logs'||kind==='errors'?'application/x-ndjson':'application/json'})),a=el('a',{href:url,download:`webcad-debug-${kind}-${new Date().toISOString().replace(/[:.]/g,'-')}.${kind==='logs'||kind==='errors'?'jsonl':'json'}`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已生成所选诊断文件。';}catch(e){fail(e);}});
 const close=button('关闭',()=>d.close(),{'aria-label':'关闭 Debug'}),refresh=button('刷新',()=>load(true));actions.append(copy,showText,format,download,close);header.append(el('h2',{},'Debug'),actions);
 const tabs=el('div',{class:'debug-tabs',role:'tablist'}),tabButtons=new Map(),filters=el('div',{class:'debug-filters'}),body=el('div',{class:'debug-body'}),coverage=el('p',{class:'debug-coverage'});
 for(const [key,label]of [['logs','操作日志'],['errors','错误详情'],['state','当前状态']]){const b=button(label,()=>{tab=key;render();},{role:'tab'});tabButtons.set(key,b);tabs.append(b);}
 filters.append(source,level,search,refresh);
 function render(){
  if(!report)return;for(const [key,b]of tabButtons)b.setAttribute('aria-selected',String(key===tab));filters.hidden=tab==='state';body.replaceChildren();
  const c=report.coverage;coverage.textContent=`当前标签页 · 保留 ${c.retained}/${c.maxEvents} 条 · ${Math.ceil(c.retainedBytes/1024)}/${c.maxBytes/1024} KiB · 显示 ${report.events.length}/${report.matching} 条${c.restored?' · 含刷新前记录':''}${c.dropped?' · 已淘汰 '+c.dropped+' 条':''}${c.storageError?' · '+c.storageError:''} · 不含服务器磁盘日志`;
  if(tab==='state'){body.append(el('pre',{},JSON.stringify(report.state??{},null,2)));return;}
  const events=tab==='errors'?report.events.filter(e=>e.level==='error'):report.events;
  if(!events.length){body.append(el('p',{class:'debug-empty'},'当前筛选下没有日志。'));return;}
  for(const e of [...events].reverse()){
   const item=el('details',{class:'debug-event','data-level':e.level}),summary=el('summary'),time=new Date(e.at).toLocaleTimeString();
   const error=e.data?.error,description=error?.message||e.data?.status||e.data?.phase||'';
   summary.textContent=`${time}  ${e.source} · ${e.action}  ${description}`;
   item.append(summary,el('pre',{},JSON.stringify(e,null,2)));body.append(item);
  }
 }
 async function load(includeState=false){
  if(refreshing||disposed)return;refreshing=true;
  try{const r=await getReport({source:source.value,level:tab==='errors'?'error':level.value,query:search.value,limit:200,includeState});if(disposed)return;report={...r,state:includeState?r.state:report?.state};render();}catch(e){fail(e);}finally{refreshing=false;}
 }
 for(const control of [source,level,search])control.addEventListener('input',()=>load(false));
 for(const b of tabButtons.values())b.addEventListener('click',()=>load(tab==='state'));
 const unsubscribe=debugJournal.subscribe(()=>{if(!timer)timer=setTimeout(()=>{timer=null;load(false);},300);});
 d.append(header,tabs,filters,coverage,body,status,output);d.addEventListener('keydown',e=>e.stopPropagation());d.addEventListener('close',()=>{disposed=true;unsubscribe();clearTimeout(timer);if(active===d)active=null;d.remove();});document.body.append(d);d.showModal();load(true);
}
