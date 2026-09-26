export function applyWorkspaceTheme(app,color='#2563eb'){
  if(!/^#[0-9a-f]{6}$/i.test(color))color='#2563eb';
  app.style.setProperty('--accent',color);
  app.style.setProperty('--accent-soft',`color-mix(in srgb, ${color} 10%, white)`);
}
export function showWorkspaceSettings(action,{openDialog,element,button,state,emit,closeDialog,getLanguage,setLanguage,translator,api}){
  const titles={themeSettings:'主题',snapSettings:'拖动与吸附',languageSettings:'语言',agentGuide:'AGENT 快速连接'};
  const d=openDialog(titles[action]),form=element('form',{class:'parameter-form'});
  const note=text=>form.append(element('p',{class:'property-footnote wide'},text));
  if(action==='agentGuide'){
    note('前端入口：window.webcad.api。先连接，再按任务加载工具卡；不需要新增后台服务。');
    form.append(element('pre',{class:'info-content'},'const api = window.webcad.api;\nconst session = api.connect({\n  toolIds: ["sketchProfile", "profileExtrude"]\n});\n// 已知工具：按 ID 精确载入，无需搜索完整目录\n// 未知工具：queries:["任务关键词"], limit:1, includeContracts:true\n// 检查 canExecute / blockers，使用新的 requestContext\n// 工具卡可按 docsHash 缓存；实体 ID 与 revision 必须重新读取。'));
    note('快速说明：/automation/quickstart.md；可下载完整知识库：/automation/knowledge.md；工具目录：/automation/index.json。AI 按需加载，避免每次读取完整目录。');
    form.append(button('关闭',closeDialog,'secondary'));d.append(form);return;
  }
  const label=element('label',{class:'form-field'}),input=action==='languageSettings'?element('select',{'aria-label':'界面语言'}):element('input',{type:action==='themeSettings'?'color':'number','aria-label':action==='themeSettings'?'主要颜色':'吸附阈值 mm'});
  if(action==='languageSettings'){for(const [value,text]of [['zh','中文'],['en','English']])input.append(element('option',{value},text));input.value=getLanguage();label.append(element('span',{},'界面语言'));}
  else if(action==='themeSettings'){input.value=state.displayPreferences?.themeColor||'#2563eb';label.append(element('span',{},'主要颜色'));note('默认蓝色。主要颜色统一用于菜单、按钮、选中状态与参考锚点。');const presets=element('div',{class:'theme-presets wide'});for(const [name,color]of [['蓝','#2563eb'],['靛蓝','#4f46e5'],['紫','#9333ea'],['橙','#ea580c'],['灰蓝','#475569']]){const b=button(name,()=>{input.value=color;},'secondary');b.style.borderColor=color;presets.append(b);}form.append(presets);}
  else {input.min='0';input.max='10';input.step='0.01';input.value=String(state.displayPreferences?.snapThresholdMm??0.2);label.append(element('span',{},'吸附阈值 mm'));note('20 丝 = 0.2 mm。0 关闭拖动吸附。松手时寻找最近的精确点、边或有限面；受拖动轴约束，隐藏对象不参与。成功吸附后的下一次拖动跳过吸附，便于微调。');}
  label.append(input);form.append(label);const foot=element('div',{class:'dialog-footer wide'}),apply=element('button',{type:'submit',class:'primary'},'应用并记住');foot.append(button('关闭',closeDialog,'secondary'),apply);form.append(foot);
  form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;apply.disabled=true;try{if(action==='languageSettings'){setLanguage(input.value);translator.translate();await emit('language',{language:getLanguage()});}else {const result=await emit('displayPreferences',action==='themeSettings'?{themeColor:input.value}:{snapThresholdMm:Number(input.value)});if(result?.persisted===false)api.showWarning('已应用，浏览器没有保存设置。');}closeDialog();}catch(error){api.showError(error.message);}finally{apply.disabled=false;}});d.append(form);
}
