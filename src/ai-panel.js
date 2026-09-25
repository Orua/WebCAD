// A transport adapter, not an evaluator. JSON cannot access globals or execute JS.
let draft='',textDraft='add box width=30 depth=20 height=2.5 name="牌子"\nmeasure $last',fitDraft='{"kind":"circle","plane":"XY","points":[[10,0],[0,10],[-10,0],[0,-10]]}',lastResult=null,working=false,activeShow=null,activeRun=null;
export function mountAIPanel(dialog,api){
  dialog.classList.add('ai-command-dialog');
  const help=document.createElement('p');help.textContent='仅供手工调试。AI 应后台调用公开 API，不使用本面板自动执行。读取状态或工具文档后，提交 JSON 批量指令。失败即停，已成功步骤保留；重复提交相同 key 返回原回执。';
  const link=document.createElement('a');link.href='./automation/quickstart.md';link.target='_blank';link.rel='noopener';link.textContent='AI 速读文档';
  const docLinks=document.createElement('div');docLinks.className='ai-doc-links';docLinks.append(link);
  for(const [path,label] of [['manifest.json','按需工具目录'],['knowledge.md','下载完整知识库 MD'],['index.json','下载完整知识库 JSON']]){
    const a=document.createElement('a');a.href='./automation/'+path;a.textContent=label;if(path!=='manifest.json')a.download='webcad-'+path;else{a.target='_blank';a.rel='noopener';}docLinks.append(a);
  }
  const controls=document.createElement('div');controls.className='ai-command-controls';
  const input=document.createElement('textarea');input.setAttribute('aria-label','AI JSON 指令');input.spellcheck=false;input.rows=10;input.maxLength=3*1024*1024;
  input.value=draft;input.addEventListener('input',()=>{draft=input.value;});
  const output=document.createElement('pre');output.setAttribute('aria-label','AI 执行结果');output.setAttribute('role','status');output.dataset.noTranslate='';
  const downloads=document.createElement('div');downloads.className='ai-command-controls';
  const show=result=>{
    lastResult=result;
    output.textContent=JSON.stringify(result,null,2);downloads.replaceChildren();
    for(const item of result.results||[]){const file=item.result;if(file?.status!=='generated')continue;
      const b=document.createElement('button');b.type='button';b.textContent=`下载 ${file.name}`;
      b.addEventListener('click',async()=>{try{const receipt=await api.files.download({resourceId:file.resourceId});output.textContent+='\n'+JSON.stringify(receipt,null,2);}catch(e){output.textContent+='\n'+JSON.stringify({status:'failed',error:{code:e.code,message:e.message}});}});downloads.append(b);
    }
  };
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);controls.append(b);return b;};
  button('读取当前状态',()=>show(api.getState()));
  button('读取速读文档',()=>show(api.readDocs({docId:'api.run'})));
  button('填入圆环示例',()=>{
    const {revision,...c}=api.getState().context;
    input.value=JSON.stringify({context:{...c,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[
      {id:'ring',method:'add',args:{op:'torus',params:{majorRadius:15,minorRadius:2.5},name:'线径5 内径25圆环'}},
      {id:'size',method:'measure',args:{bodyId:{$ref:'ring.createdBodyIds.0'}}},
      {id:'view',method:'setView',args:{direction:'top',fit:true}},
      {id:'step',method:'files.export',args:{format:'step',ids:{$ref:'ring.createdBodyIds'},name:'ring-25-5.step'}}]},null,2);draft=input.value;
  });
  const run=button('执行 JSON',async()=>{
    if(working)return;working=true;run.disabled=true;draft=input.value;
    try{const request=JSON.parse(input.value);activeShow({status:'running'});activeShow(await api.run(request));}
    catch(e){activeShow({status:'failed',error:{code:'JSON_INVALID',message:e.message}});}
    finally{working=false;run.disabled=false;activeRun.disabled=false;}
  });
  const textLabel=document.createElement('label');textLabel.textContent='纯文本命令';
  const textInput=document.createElement('textarea');textInput.setAttribute('aria-label','纯文本命令');textInput.rows=4;textInput.maxLength=16384;textInput.value=textDraft;textInput.addEventListener('input',()=>{textDraft=textInput.value;});
  const textButtons=document.createElement('div');textButtons.className='ai-command-controls';
  for(const [label,dryRun] of [['预检文本',true],['执行文本',false]]){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.addEventListener('click',async()=>{if(working)return;working=true;b.disabled=true;textDraft=textInput.value;
      try{const {revision,...identity}=api.getState().context;show(await api.executeText({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),text:textInput.value,dryRun}));}
      catch(e){show({status:'failed',error:{code:e.code||'TEXT_COMMAND_FAILED',message:e.message}});}
      finally{working=false;b.disabled=false;}});
    textButtons.append(b);
  }
  const fitLabel=document.createElement('label');fitLabel.textContent='拟合计算输入 JSON';
  const fitInput=document.createElement('textarea');fitInput.setAttribute('aria-label','拟合计算输入 JSON');fitInput.rows=4;fitInput.value=fitDraft;fitInput.addEventListener('input',()=>{fitDraft=fitInput.value;});
  const fitButton=document.createElement('button');fitButton.type='button';fitButton.textContent='计算拟合';fitButton.addEventListener('click',async()=>{
    if(working)return;working=true;fitButton.disabled=true;fitDraft=fitInput.value;
    try{const values=JSON.parse(fitInput.value),{revision,...identity}=api.getState().context;show(await api.fitProfile({context:{...identity,expectedRevision:revision},...values}));}
    catch(e){show({status:'failed',error:{code:e.code||'FIT_INPUT_INVALID',message:e.message}});}
    finally{working=false;fitButton.disabled=false;}
  });
  activeShow=show;activeRun=run;run.className='primary';run.disabled=working;dialog.append(help,docLinks,controls,input,textLabel,textInput,textButtons,fitLabel,fitInput,fitButton,output,downloads);show(lastResult||api.getState());
}
