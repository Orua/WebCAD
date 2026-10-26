import {humanError} from '../../error-recovery.js';
import {getServicesConfig,saveServicesConfig,clearServicesCredential,defaultServicesConfig} from '../../services/settings.js';
import {createServicesClient,servicesClient} from '../../services/client.js';
export function showServicesSettings({openDialog,element,button,closeDialog}){
 const dialog=openDialog('计算设置'),saved=getServicesConfig(),defaults=defaultServicesConfig(),status=element('p',{class:'property-footnote',role:'status'});
 const field=(label,input)=>{const row=element('label',{class:'form-field'},label);row.append(input);return row;};
 const addressValue=value=>{try{const parsed=new URL(value,globalThis.location?.href);return parsed.origin===globalThis.location?.origin?parsed.pathname+parsed.search:parsed.href;}catch{return value||'';}};
 const url=element('input',{type:'text',inputmode:'url',placeholder:'/cadservices/api.ashx','aria-label':'计算接口地址'});url.value=addressValue(saved.url||defaults.url);
 const address=field('计算接口地址',url),help=button('',()=>{},'secondary services-help');
 const addressRow=element('div');addressRow.style.cssText='display:flex;gap:6px;align-items:center';url.style.cssText='flex:1;min-width:0';help.style.cssText='flex:none;width:28px;min-width:28px;min-height:28px;padding:4px;border:0;background:transparent';
 help.title='填写地址即启用。相对路径自动使用本站连接；跨域地址在高级设置填写专用授权。留空并保存可停用。验证仅检查连接、授权和协议，具体计算能力在使用时读取。';help.setAttribute('aria-label','计算连接说明');
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('width','18');icon.setAttribute('height','18');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.6');icon.setAttribute('aria-hidden','true');icon.innerHTML='<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 16v1"/>';help.append(icon);addressRow.append(url,help);address.append(addressRow);dialog.append(address);
 status.hidden=true;
 const advanced=element('details');advanced.append(element('summary',{},'高级设置'));
 const custom=element('div'),secret=element('input',{type:'password',autocomplete:'new-password','aria-label':'专用计算授权'});
 secret.title='仅用于跨域计算端。留空保留当前标签页已有授权。';custom.append(field('专用授权',secret));advanced.append(custom);
 const local=element('input',{type:'number',min:1,max:600,step:1,'aria-label':'本机等待提醒秒数'}),server=element('input',{type:'number',min:1,max:900,step:1,'aria-label':'后台等待提醒秒数'});
 local.value=saved.localTimeoutMs/1000;server.value=saved.serverWaitMs/1000;
 local.title='到时提醒并继续原计算。';server.title='到时可继续等待同一任务或停止，不自动重算。';advanced.append(field('本机提醒（秒）',local),field('后台提醒（秒）',server));
 const clear=button('清除自定义授权',()=>{clearServicesCredential();secret.value='';status.textContent='已清除本标签页的自定义授权。';},'secondary');advanced.append(clear);
 const sameOrigin=()=>{try{return new URL(url.value.trim(),globalThis.location?.href).origin===globalThis.location?.origin;}catch{return false;}};
 const refresh=()=>{custom.hidden=clear.hidden=sameOrigin();status.hidden=true;};url.addEventListener('input',refresh);refresh();
 const save=button('验证并保存',async()=>{
  save.disabled=true;status.hidden=false;status.style.color='';status.textContent='正在连接…';
  for(const input of [url,secret,local,server])input.disabled=true;
  try{
   const config={enabled:!!url.value.trim(),url:url.value.trim(),authMode:sameOrigin()?'siteSession':'bearer',localTimeoutMs:Number(local.value)*1000,serverWaitMs:Number(server.value)*1000};
   const connection=config.enabled?await createServicesClient({config,credential:sameOrigin()?undefined:secret.value||undefined}).handshake():null;
   if(!dialog.isConnected)return;
   saveServicesConfig({...config,...(!sameOrigin()&&secret.value?{credential:secret.value}:{})});secret.value='';
   if(connection){const check=icon.cloneNode();check.innerHTML='<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/>';status.replaceChildren(check,document.createTextNode('连接成功'));status.style.cssText='color:#187341;display:flex;align-items:center;gap:6px';status.title=`设置已保存 · ${connection.elapsedMs} ms`;}else status.textContent='已停用';
  }catch(error){status.textContent='设置未保存。'+(error.httpStatus===401?(sameOrigin()?'同域计算入口未通过授权检查。':'请检查高级设置中的专用授权。'):error.code==='SERVICES_CONNECTION_UNKNOWN'?'连接未在 5 秒内返回，请检查地址或服务。':humanError(error));}finally{save.disabled=false;for(const input of [url,secret,local,server])input.disabled=false;}
 },'primary');
 dialog.append(advanced,status,save,button('关闭',closeDialog,'secondary'));
 const recovery=element('details');recovery.append(element('summary',{},'排查中断任务'));
 const job=element('input',{'aria-label':'旧任务编号'}),reason=element('input',{'aria-label':'环境恢复原因',maxLength:240}),approve=element('input',{type:'checkbox'});let reviewed=null;
 const recover=button('恢复已核对的任务',async()=>{if(!reviewed||!approve.checked||!reason.value.trim())return;recover.disabled=true;try{const old=await servicesClient.getJob(reviewed.jobId);if(old.execution!=='interrupted')throw new Error('旧任务状态已改变，请重新核对。');const result=await servicesClient.recoverJob(old.jobId,{approved:true,acknowledgedState:'interrupted',reason:reason.value.trim()},crypto.randomUUID());status.textContent='已受理恢复任务 '+result.jobId+'，尚未安装到工程。';reviewed=null;approve.checked=false;}catch(error){status.textContent=humanError(error);}},'secondary');recover.disabled=true;
 const update=()=>{recover.disabled=!reviewed||!approve.checked||!reason.value.trim();};approve.addEventListener('change',update);reason.addEventListener('input',update);job.addEventListener('input',()=>{reviewed=null;update();});
 recovery.append(field('旧任务编号',job),button('核对任务',async()=>{reviewed=null;update();try{const value=await servicesClient.getJob(job.value.trim());status.textContent='任务 '+value.jobId+'：'+value.execution+'。';if(value.execution==='interrupted')reviewed=value;update();}catch(error){status.textContent=humanError(error);}},'secondary'),field('恢复原因',reason),field('已核对是环境中断，允许恢复一次',approve),recover);advanced.append(recovery);
}
