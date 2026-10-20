import {getServicesConfig,saveServicesConfig,clearServicesCredential,defaultServicesConfig} from '../../services/settings.js';
import {createServicesClient,servicesClient} from '../../services/client.js';
export function showServicesSettings({openDialog,element,button,closeDialog}){
 const dialog=openDialog('计算设置'),saved=getServicesConfig(),defaults=defaultServicesConfig(),status=element('p',{class:'property-footnote',role:'status'});
 const enabled=element('input',{type:'checkbox'}),automatic=element('input',{type:'checkbox'});
 enabled.checked=saved.enabled;automatic.checked=saved.authMode==='siteSession'||!saved.url;
 const field=(label,input)=>{const row=element('label',{class:'form-field'},label);row.append(input);return row;};
 dialog.append(field('启用后台复杂计算',enabled),element('p',{class:'dialog-description'},'普通建模和快捷模型在本机完成；已支持的复杂几何与图片轮廓转换由后台处理。是否支持以实际能力检查为准。本站连接沿用当前登录，无需填写密钥。'),field('使用网站默认连接',automatic));
 const currentAddress=element('p',{class:'property-footnote'});dialog.append(currentAddress);
 status.textContent='当前设置尚未在此窗口验证；验证成功后才会保存。';
 if(defaults.url){const login=element('a',{href:new URL('/default.aspx',defaults.url).href,target:'_blank',rel:'noopener'},'登录后台计算');dialog.append(login);}
 const advanced=element('details');advanced.append(element('summary',{},'高级设置'));
 const custom=element('div'),url=element('input',{type:'text',inputmode:'url',placeholder:'/cadservices/api.ashx','aria-label':'自定义计算地址'}),secret=element('input',{type:'password',autocomplete:'new-password','aria-label':'专用计算授权'});
 url.value=saved.url;custom.append(field('自定义地址',url),field('专用授权（留空保留当前标签页授权）',secret));advanced.append(custom);
 const local=element('input',{type:'number',min:1,max:600,step:1,'aria-label':'本机等待提醒秒数'}),server=element('input',{type:'number',min:1,max:900,step:1,'aria-label':'后台等待提醒秒数'});
 local.value=saved.localTimeoutMs/1000;server.value=saved.serverWaitMs/1000;
 advanced.append(field('本机等待提醒（秒）',local),field('后台等待提醒（秒）',server),element('p',{class:'property-footnote'},'到时提醒，不会自动重算。关闭后台计算后，支持的操作使用本机。'));
 const clear=button('清除自定义授权',()=>{clearServicesCredential();secret.value='';status.textContent='已清除本标签页的自定义授权。';},'secondary');advanced.append(clear);
 const refresh=()=>{custom.hidden=clear.hidden=automatic.checked;currentAddress.textContent='当前计算接口：'+(automatic.checked?defaults.url||'当前站点未配置默认入口':url.value.trim()||'尚未填写')+(automatic.checked?'（跟随本站应用路径）':'（自定义专用连接）');};automatic.addEventListener('change',refresh);url.addEventListener('input',refresh);refresh();
 const save=button('验证并保存',async()=>{
  save.disabled=true;status.textContent='正在检查连接…';
  try{
   const config={enabled:enabled.checked,url:automatic.checked?defaults.url:url.value.trim(),authMode:automatic.checked?'siteSession':'bearer',localTimeoutMs:Number(local.value)*1000,serverWaitMs:Number(server.value)*1000};
   if(config.enabled)await createServicesClient({config,credential:automatic.checked?undefined:secret.value||undefined}).capabilities();
   saveServicesConfig({...config,...(!automatic.checked&&secret.value?{credential:secret.value}:{})});secret.value='';
   status.textContent=config.enabled?'连接正常。复杂计算已启用，普通建模仍在本机执行。':'已关闭后台复杂计算。';
  }catch(error){status.textContent='设置未保存。'+(error.httpStatus===401?'请先登录当前网站，再检查连接。':error.message);}finally{save.disabled=false;}
 },'primary');
 dialog.append(advanced,status,save,button('关闭',closeDialog,'secondary'));
 const recovery=element('details');recovery.append(element('summary',{},'排查中断任务'));
 const job=element('input',{'aria-label':'旧任务编号'}),reason=element('input',{'aria-label':'环境恢复原因',maxLength:240}),approve=element('input',{type:'checkbox'});let reviewed=null;
 const recover=button('恢复已核对的任务',async()=>{if(!reviewed||!approve.checked||!reason.value.trim())return;recover.disabled=true;try{const old=await servicesClient.getJob(reviewed.jobId);if(old.execution!=='interrupted')throw new Error('旧任务状态已改变，请重新核对。');const result=await servicesClient.recoverJob(old.jobId,{approved:true,acknowledgedState:'interrupted',reason:reason.value.trim()},crypto.randomUUID());status.textContent='已受理恢复任务 '+result.jobId+'，尚未安装到工程。';reviewed=null;approve.checked=false;}catch(error){status.textContent=error.message;}},'secondary');recover.disabled=true;
 const update=()=>{recover.disabled=!reviewed||!approve.checked||!reason.value.trim();};approve.addEventListener('change',update);reason.addEventListener('input',update);job.addEventListener('input',()=>{reviewed=null;update();});
 recovery.append(field('旧任务编号',job),button('核对任务',async()=>{reviewed=null;update();try{const value=await servicesClient.getJob(job.value.trim());status.textContent='任务 '+value.jobId+'：'+value.execution+'。';if(value.execution==='interrupted')reviewed=value;update();}catch(error){status.textContent=error.message;}},'secondary'),field('恢复原因',reason),field('已核对是环境中断，允许恢复一次',approve),recover);advanced.append(recovery);
}
