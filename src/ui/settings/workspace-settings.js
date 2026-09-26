export function applyWorkspaceTheme(app,color='#2563eb'){
  if(!/^#[0-9a-f]{6}$/i.test(color))color='#2563eb';
  app.style.setProperty('--accent',color);
  app.style.setProperty('--accent-soft',`color-mix(in srgb, ${color} 10%, white)`);
}
export function showWorkspaceSettings(action,{openDialog,element,button,state,emit,closeDialog,getLanguage,setLanguage,translator,api}){
  const titles={precisionSettings:'尺寸与角度精度',themeSettings:'风格',snapSettings:'拖动与吸附',languageSettings:'语言',agentGuide:'AGENT 快速连接'};
  const d=openDialog(titles[action]),form=element('form',{class:'parameter-form'});
  const note=text=>form.append(element('p',{class:'property-footnote wide'},text));
  if(action==='precisionSettings'){
    const inputs={};for(const [key,label,def,max]of [['dimensionPrecisionMm','尺寸精度 mm',0.01,10],['anglePrecisionDeg','角度精度 °',0.1,90]]){const row=element('label',{class:'form-field'}),input=element('input',{type:'number',name:key,min:'0.000001',max:String(max),step:'any',required:'','aria-label':label});input.value=String(state.displayPreferences?.[key]??def);inputs[key]=input;row.append(element('span',{},label),input);form.append(row);}
    note('按步长四舍五入：默认尺寸 0.01 mm、角度 0.1°。影响新输入、移动和旋转；不重算已有模型或导入几何。');
    const apply=element('button',{type:'submit',class:'primary'},'应用并记住');form.append(button('关闭',closeDialog,'secondary'),apply);form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;apply.disabled=true;try{await emit('displayPreferences',Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,Number(v.value)])));closeDialog();}finally{apply.disabled=false;}});d.append(form);return;
  }
  if(action==='agentGuide'){
    d.style.width='min(760px, calc(100vw - 32px))';d.style.maxWidth='760px';
    const rootUrl=new URL('./',document.baseURI),assetUrl=path=>new URL(path,rootUrl).href;
    const firstConnect='window.webcad.api.connect({\n  queries: ["本次任务能力"],\n  limit: 3, includeContracts: true\n})';
    const quote=value=>"'"+value.replace(/'/g,"''")+"'";
    const installCommand=[
      '$webcadBase = '+quote(rootUrl.href),
      "$installerPath = Join-Path $env:TEMP 'webcad-install-agent.ps1'",
      'Invoke-WebRequest -Uri '+quote(assetUrl('automation/install-agent.ps1'))+' -OutFile $installerPath',
      'Get-Content -LiteralPath $installerPath',
      '# 查看并审核脚本后，再执行下一行：',
      '& $installerPath -BaseUrl $webcadBase'
    ].join('\n');
    note('Agent 与你操作同一个页面工程。先确认宿主能执行页面脚本，再读取当前工具与状态；静态网页不需要后台服务。');
    const links=element('div',{class:'profile-editor-toolbar wide','aria-label':'Agent 起步资料'});
    for(const [path,label] of [['automation/agent-start.html','打开 Agent 起步页'],['automation/install-agent.ps1','查看 / 下载本地安装器'],['automation/index.html','搜索工具与参数'],['automation/docs/api.connection.md','宿主连接说明']])links.append(element('a',{href:assetUrl(path),target:'_blank',rel:'noopener noreferrer'},label));
    form.append(links);
    const steps=element('ol',{class:'wide'});
    for(const text of [
      '绑定当前 WebCAD 标签页，核对地址。先读取宿主的 capabilities；若提供 CDP，先读 CDP 文档，再按宿主授权使用 Runtime.evaluate。只有只读 DOM 能力时不能执行建模脚本。',
      '通过已确认的页面脚本通道执行下方 connect 表达式。把「本次任务能力」替换为任务关键词；检查 canExecute 与 blockers，然后读取所需工具卡。',
      '需要宿主长期复用时，可先下载并查看下方安装脚本。有磁盘和 PowerShell 能力的宿主可安装 webcad-page-api 技能；没有这些能力时仍可按起步页连接。',
      '每次操作重新读取 requestContext、实体与拓扑引用。只缓存完整工具卡及其哈希；提交后分别核对几何回执、当前状态和渲染结果。'
    ]){const item=element('li',{},text);item.style.lineHeight='1.5';item.style.marginBottom='8px';steps.append(item);}
    form.append(steps);
    const addCopyBlock=(label,text,rows)=>{
      const heading=element('strong',{class:'wide'},label),input=element('textarea',{class:'wide',readonly:'',rows:String(rows),'aria-label':label,'data-no-translate':''});input.value=text;input.style.width='100%';input.style.boxSizing='border-box';input.style.fontFamily='monospace';input.style.resize='vertical';
      const feedback=element('span',{'aria-live':'polite'}),copy=button('复制'+label,async()=>{try{await navigator.clipboard.writeText(text);feedback.textContent='已复制';}catch{input.focus();input.select();feedback.textContent='内容已选中，请按 Ctrl+C 复制';}},'secondary'),line=element('div',{class:'profile-editor-toolbar wide'});line.append(copy,feedback);form.append(heading,input,line);
    };
    addCopyBlock('首次连接表达式',firstConnect,4);
    addCopyBlock('本地安装命令',installCommand,8);
    note('上面的命令先下载、显示脚本，再由你或有权限的宿主审核执行。安装目标默认是宿主 ~/.codex/skills/webcad-page-api，可用 -Destination 指定；网页不会自动安装，也不执行 JSON 指令。');
    const status=element('dl',{class:'wide','aria-label':'当前页面接口状态','aria-live':'polite'});status.style.display='grid';status.style.gridTemplateColumns='minmax(100px, auto) minmax(0, 1fr)';status.style.gap='4px 10px';status.style.margin='0';
    const statusLabels={canExecute:'canExecute',blockers:'blockers',buildId:'构建 buildId',apiVersion:'API 版本',pageApiVersion:'页面 API 版本',catalogHash:'工具目录哈希',docsHash:'文档哈希'};
    const renderStatus=()=>{
      status.replaceChildren();try{
        const pageAPI=window.webcad?.api;if(typeof pageAPI?.connect!=='function')throw new Error('页面 API 尚未公开，请等待初始化后刷新状态');
        const connected=pageAPI.connect();
        for(const [key,label] of Object.entries(statusLabels)){const value=connected[key],content=key==='blockers'?Array.isArray(value)?value.length?value.join(', '):'无': '未报告':typeof value==='boolean'?String(value):value??'未报告';const cell=element('dd',{'data-no-translate':'','data-agent-status':key},String(content));cell.style.margin='0';cell.style.overflowWrap='anywhere';status.append(element('dt',{},label),cell);}
      }catch(error){status.append(element('dt',{},'页面状态'),element('dd',{},error.message));}
    };
    form.append(element('strong',{class:'wide'},'当前页面接口状态'),status,button('刷新页面状态',renderStatus,'secondary'));
    note('此处是当前页面的只读状态，不能证明外部 Agent 已绑定或获得脚本权限。canExecute=false 时先处理 blockers，再重新连接。');
    form.append(button('关闭',closeDialog,'secondary'));form.addEventListener('submit',event=>event.preventDefault());d.append(form);renderStatus();return;
  }
  const label=element('label',{class:'form-field'}),input=action==='languageSettings'?element('select',{'aria-label':'界面语言'}):element('input',{type:action==='themeSettings'?'color':'number','aria-label':action==='themeSettings'?'主要颜色':'吸附阈值 mm'});
  if(action==='languageSettings'){for(const [value,text]of [['zh','中文'],['en','English']])input.append(element('option',{value},text));input.value=getLanguage();label.append(element('span',{},'界面语言'));}
  else if(action==='themeSettings'){input.value=state.displayPreferences?.themeColor||'#2563eb';label.append(element('span',{},'主要颜色'));note('默认蓝色。主要颜色统一用于菜单、按钮、选中状态与参考锚点。');const presets=element('div',{class:'theme-presets wide'});for(const [name,color]of [['绿色','#0c827d'],['灰度','#666666'],['蓝','#2563eb'],['靛蓝','#4f46e5'],['紫','#9333ea'],['橙','#ea580c'],['灰蓝','#475569']]){const b=button(name,()=>{input.value=color;},'secondary');b.style.borderColor=color;presets.append(b);}form.append(presets);}
  else {input.min='0';input.max='10';input.step='0.01';input.value=String(state.displayPreferences?.snapThresholdMm??0.2);label.append(element('span',{},'吸附阈值 mm'));note('20 丝 = 0.2 mm。0 关闭拖动吸附。松手时寻找最近的精确点、边或有限面；受拖动轴约束，隐藏对象不参与。成功吸附后的下一次拖动跳过吸附，便于微调。');}
  label.append(input);form.append(label);const foot=element('div',{class:'dialog-footer wide'}),apply=element('button',{type:'submit',class:'primary'},'应用并记住');foot.append(button('关闭',closeDialog,'secondary'),apply);form.append(foot);
  form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;apply.disabled=true;try{if(action==='languageSettings'){setLanguage(input.value);translator.translate();await emit('language',{language:getLanguage()});}else {const result=await emit('displayPreferences',action==='themeSettings'?{themeColor:input.value}:{snapThresholdMm:Number(input.value)});if(result?.persisted===false)api.showWarning('已应用，浏览器没有保存设置。');}closeDialog();}catch(error){api.showError(error.message);}finally{apply.disabled=false;}});d.append(form);
}
