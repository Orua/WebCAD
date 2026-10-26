import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {timingTotals,createTurnTimeline} from '../host/Goldenluck.WebCADHost/site/AI/WebCAD/turn-timing.js';
import {ensureCanvasResources} from '../host/Goldenluck.WebCADHost/site/AI/WebCAD/attachment-bytes.js';
const source=await readFile(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/workspace-transport.js',import.meta.url),'utf8');
const {readGatewayJson,gatewayFetch,createRecoveryLoop,publicProgressText,toolActivityText,cadOutcomeText,uploadHostArtifact,durationText,historyUserText,modelCatalogPlan,isModelSelectionError,modelSelectionMessage}=await import(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/workspace-transport.js',import.meta.url));
const modelWorkspace=await readFile(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/webcad-workspace.js',import.meta.url),'utf8');
const {createNativeStateView}=await import(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/native-state.js',import.meta.url));
const sendSource=workspace=>workspace.slice(workspace.indexOf('async function sendChat('),workspace.indexOf("prompt.addEventListener('keydown'"));

test('authentication failure stops original-task polling and retains the handle for explicit reconnect',async()=>{
 const text=modelWorkspace.slice(modelWorkspace.indexOf('async function followTask('),modelWorkspace.indexOf('async function prepareTaskBinding('));
 for(const status of [401,403]){
  let requests=0,scheduled=0;
  const invoke=new Function('rpc','recoverLater','createReply','finishProgress','recovery',`let watchingTask=null,taskId='original-task',disposed=false,activeReply=null;${text};return {run:()=>followTask(taskId),read:()=>({taskId,watchingTask})};`);
  const fixture=invoke(async()=>{requests++;throw Object.assign(Error('auth expired'),{status,code:'login_required'});},()=>scheduled++,()=>({}),()=>{},{exhausted:()=>false});
  await fixture.run();assert.equal(requests,2);assert.equal(scheduled,1);assert.deepEqual(fixture.read(),{taskId:'original-task',watchingTask:null});
 }
});

test('project handoff authentication failure cannot overwrite the login recovery notice',async()=>{
 const {createProjectOpenController}=await import('../host/Goldenluck.WebCADHost/site/AI/WebCAD/project-open.js');
 let auth=0,notices=0;
 const controller=createProjectOpenController({rpc:async()=>{throw Object.assign(Error('sign in'),{status:401,code:'login_required'});},journal:{read:()=>null},notice:()=>notices++,onAuthRequired:()=>auth++});
 await controller.poll('original-session');assert.equal(auth,1);assert.equal(notices,0);
});

test('explicit canvas reconnect resumes observation of the original task without sending another task',async()=>{
 const text=modelWorkspace.slice(modelWorkspace.indexOf('let canvasConnection=null;'),modelWorkspace.indexOf('async function restoreConnection('));
 let listens=0;const followed=[],rpcCalls=[];
 const context={sessionId:'page',documentId:'doc',documentInstanceId:'instance',revision:3};
 const factory=new Function('deps',`const {rpc,api,followTask,listen}=deps;let session={cadSessionId:'cad',leaseEpoch:1,binding:deps.context},disposed=false,manualControl=false,adapter={state:()=>({accepting:true,pending:[]})},adapterLeaseEpoch=1,taskId='original-task',watchingTask=null,knowledgeReady=false,conversationDocument=null;const restoreKernelIfNeeded=async()=>{},documentChanged=()=>false,retryReports=async()=>{},rejectedCommands=new Map(),syncNativePush=()=>{},controls=()=>{},documentKey=()=> 'doc',recoverLater=e=>{throw e;};${text};return connectCanvas;`);
 const reconnect=factory({context,api:()=>({getState:async()=>({context}),connect:async()=>({canExecute:true})}),rpc:async action=>{rpcCalls.push(action);return action==='prepare'?{knowledgeReady:true}:{leaseEpoch:1};},listen:async()=>listens++,followTask:async id=>followed.push(id)});
 await reconnect();assert.equal(listens,1);assert.deepEqual(followed,['original-task']);assert.deepEqual(rpcCalls,['heartbeat','prepare']);
});

test('catalog refresh retains a still-available selection and never substitutes a missing model',()=>{
 const data={models:[{id:'a'},{id:'b'}],defaultModel:'b'};
 assert.equal(modelCatalogPlan(data,'a').selected,'a');
 const missing=modelCatalogPlan(data,'old');assert.equal(missing.selected,'');assert.match(missing.placeholder,/重新选择/);
 assert.equal(modelCatalogPlan(data,'').selected,'');assert.equal(modelCatalogPlan(data,'',{initial:true}).selected,'b');
 assert.equal(modelCatalogPlan({...data,defaultModel:'absent'},'',{initial:true}).selected,'');
 assert.equal(modelCatalogPlan({models:[]},'a').selected,'');
 assert.throws(()=>modelCatalogPlan({}),{code:'models_unavailable'});
});

test('model-specific errors retain their audit identity and do not claim a network failure',async()=>{
 for(const [code,status,reason]of [['model_unavailable',400,/当前不可用/],['model_forbidden',403,/无权/]]){
  let error;try{await readGatewayJson({ok:false,status,text:async()=>JSON.stringify({error:{code,message:'原始模型诊断',requestId:'original-request'}})});}catch(value){error=value;}
  assert.equal(error.code,code);assert.equal(error.status,status);assert.equal(error.requestId,'original-request');assert.equal(error.message,'原始模型诊断');
  assert.equal(isModelSelectionError(error),true);const message=modelSelectionMessage(error);assert.match(message,reason);assert.match(message,/尚未创建任务/);assert.doesNotMatch(message,/断线|连接暂时不可用/);
  assert.match(modelSelectionMessage(error,{taskKnown:true}),/原任务已创建/);assert.doesNotMatch(modelSelectionMessage(error,{taskKnown:true}),/尚未创建/);
 }
});

function modelUI(fetchModels){
 const select={value:'a',dataset:{ready:'true'},options:[],replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';},append(option){this.options.push(option);}};
 const notice={hidden:true},text={textContent:''},refresh={disabled:false};
 const Option=class{constructor(text,value){this.text=text;this.value=value;}};
 const functions=modelWorkspace.slice(modelWorkspace.indexOf('function modelSendReady(){'),modelWorkspace.indexOf("modelRefresh.addEventListener('click'"));
 return Function('rpc','modelCatalogPlan','modelSelect','modelNotice','modelNoticeText','modelRefresh','Option',`
  let modelIds=new Set(['a']),modelChoice='a',modelListLoading=false,modelListOperation=null,pendingSend=null;
  function controls(){};
  ${functions}
  return {refreshModels,modelSendReady,select:modelSelect,notice:modelNotice,text:modelNoticeText,setPending(value){pendingSend=value;}};
 `)(async action=>{assert.equal(action,'models');return fetchModels();},modelCatalogPlan,select,notice,text,refresh,Option);
}

test('actual refresh path blocks absent/failed choices and only reads the model list',async()=>{
 let calls=0,fail=false;const ui=modelUI(async()=>{calls++;if(fail)throw Error('list offline');return {models:[{id:'b'}],defaultModel:'b'};});
 await ui.refreshModels();assert.equal(calls,1);assert.equal(ui.select.value,'');assert.equal(ui.modelSendReady(),false);assert.match(ui.text.textContent,/重新选择/);
 fail=true;await ui.refreshModels();assert.equal(calls,2);assert.equal(ui.modelSendReady(),false);assert.equal(ui.select.dataset.ready,'false');assert.match(ui.text.textContent,/读取失败/);assert.equal(ui.notice.hidden,false);
 const original={key:'original-key',model:'a',draftTaskId:'known-task'};ui.setPending(original);assert.equal(ui.modelSendReady(),true);assert.deepEqual(original,{key:'original-key',model:'a',draftTaskId:'known-task'});
});

function sendHarness(error,{pending=null,ready=true}={}){
 let submit,refreshes=0,recoveries=0,sendCalls=0;
 const handlerSource=sendSource(modelWorkspace);
 const run=Function('document','rpc','isModelSelectionError','modelSelectionMessage','isTransportError','initialPending','ready','ensureCanvasResources',`
  let taskId=null,sending=false,connecting=false,projectOpening=false,attaching=false,disposed=false,manualControl=false,knowledgeReady=true,pendingSend=initialPending,attachments=[];
  const session={agentMode:'native',binding:{},leaseEpoch:1},adapter={state:()=>({pending:[]})},modelSelect={value:'a'},prompt={value:'测量现有模型',focus(){}},notices=[],modelNotice={},modelNoticeText={};
  const attachmentPicker={ready:async()=>{},clear(){}},api=()=>({getState:async()=>({context:{}})});
  const composer={intercept:()=>false},handleChatCommand=()=>false,appendLocationDraft={resolve:async text=>text,clear(){}};let preparedSendState=null;
  async function prepareTaskBinding(){await rpc('heartbeat');return session;}
  function controls(){};function documentChanged(){return false};function syncNativePush(){};let lastHeartbeatAt=0;
  function modelSendReady(){return pendingSend?Boolean(pendingSend.model):ready};function refreshModels(){rpc('models')};function recoverLater(){rpc('recover')};
  function message(role,text){notices.push(text)};function attachmentIdentity(a){return a};function showAttachmentFailure(){throw Error('unexpected attachment')};
  ${handlerSource}
  return {send:sendChat,get pending(){return pendingSend},get input(){return prompt.value},notices,get knowledgeReady(){return knowledgeReady}};
 `);
 const state=run({getElementById:id=>id==='chat'?{addEventListener:(_,handler)=>submit=handler}:{value:'1'}},async action=>{
  if(action==='heartbeat')return {};if(action==='send'){sendCalls++;throw error;}if(action==='models'){refreshes++;return {};}if(action==='recover'){recoveries++;return {};}
  throw Error('unexpected action '+action);
 },isModelSelectionError,modelSelectionMessage,()=>true,pending,ready,ensureCanvasResources);
 assert.equal(typeof submit,'function','the real form listener remains registered');
 return {state,submit:()=>state.send(),counts:()=>({refreshes,recoveries,sendCalls})};
}

test('actual send rejects unavailable/forbidden models without clearing input, reconnecting or replaying',async()=>{
 for(const code of ['model_unavailable','model_forbidden']){
  const h=sendHarness(Object.assign(Error('model failed'),{code,status:code==='model_unavailable'?400:403}));await h.submit();
  assert.deepEqual(h.counts(),{refreshes:1,recoveries:0,sendCalls:1});assert.equal(h.state.input,'测量现有模型');assert.equal(h.state.pending,null);assert.equal(h.state.knowledgeReady,true);
  assert.match(h.state.notices[0],code==='model_unavailable'?/当前不可用/:/无权/);
 }
 const h=sendHarness(Error('must not send'),{ready:false});await h.submit();assert.equal(h.counts().sendCalls,0);assert.equal(h.state.input,'测量现有模型');
});

test('existing draft and uncertain request keep their original send identity',async()=>{
 const original={key:'same-key',model:'a',message:'测量现有模型',wireMessage:'original',draftTaskId:'known-task'};
 const h=sendHarness(Object.assign(Error('forbidden'),{code:'model_forbidden',status:403}),{pending:original});await h.submit();
 assert.equal(h.state.pending,original);assert.equal(original.key,'same-key');assert.equal(original.model,'a');assert.match(h.state.notices[0],/原任务已创建/);
 const unknown={key:'unknown-key',model:'a',message:'测量现有模型',wireMessage:'original'};
 const u=sendHarness(Object.assign(Error('timeout'),{code:'request_timeout'}),{pending:unknown});await u.submit();assert.equal(u.state.pending,unknown);assert.equal(unknown.key,'unknown-key');assert.equal(u.counts().sendCalls,1);
});

test('UP-11 history hides only known native transport instructions and preserves literal user content',()=>{
  const prefix='原生宿主模式：页面已绑定，不要调用 webcad_connect（仅恢复时调用）。\n内部规则\n\n【当前用户请求】\n';
  assert.equal(historyUserText(prefix+'测量体积。'),'测量体积。');
  const literal='请保留这段文字：\n\n【当前用户请求】\n原样显示';assert.equal(historyUserText(literal),literal);
  assert.equal(historyUserText('测量体积。'),'测量体积。');
  assert.equal(historyUserText('外部模式规则\n\n【当前用户请求】\n测量体积。'),'外部模式规则\n\n【当前用户请求】\n测量体积。');
});

test('UP-04 step duration format uses decimal seconds, seconds, and minutes',()=>{
  assert.equal(durationText(2400),'2.4 秒');assert.equal(durationText(12300),'12 秒');assert.equal(durationText(65000),'1 分 05 秒');assert.equal(durationText(-10),'0.0 秒');
});

test('UP-11 asynchronous embedded bridge advertises native mode and pushes current revision snapshots',{timeout:2000},async()=>{
 const workspace=await readFile(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/webcad-workspace.js',import.meta.url),'utf8');
 const chunk=workspace.slice(workspace.indexOf('let nativeWatchStop='),workspace.indexOf('async function restoreKernelIfNeeded('));
 let revision=4,watcher,unsubscribed=false;const sent=[];
 const api=()=>({getState:async()=>({context:{revision},summary:{kernelReady:true}}),watchRevision:callback=>{watcher=callback;return ()=>{unsubscribed=true;};}});
 const harness=new Function('api','rpc','recoverLater','session','disposed','manualControl','createNativeStateView',"const status={},controls=()=>{},isTransportError=()=>false;"+chunk+';return {supported:nativeSupported(api()),sync:syncNativePush,push:pushNativeSnapshot,stop:stopNativePush};')(api,async(action,payload)=>{sent.push({action,payload});},()=>{throw Error('unexpected recovery');},{agentMode:'native',knowledgeReady:true,leaseEpoch:3},false,false,createNativeStateView);
 assert.equal(harness.supported,true);harness.sync();await new Promise(setImmediate);await harness.push();assert.equal(sent[0].action,'snapshot');assert.equal(sent[0].payload.snapshot.context.revision,4);assert.equal(sent[0].payload.leaseEpoch,3);
 revision=5;watcher();await new Promise(setImmediate);await harness.push();assert.equal(sent.at(-1).payload.snapshot.context.revision,5);harness.stop();assert.equal(unsubscribed,true);
});

test('UP-04 history renders persisted durations and never starts a new clock',async()=>{
  const workspace=await readFile(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/webcad-workspace.js',import.meta.url),'utf8');
  const createElement=()=>({children:[],style:{},dataset:{},setAttribute(key,value){this[key]=value;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});
  const render=new Function('document','durationText','timingTotals',workspace.slice(workspace.indexOf('function createTurnAudit('),workspace.indexOf('const stepClock='))+';return renderHistoricalTiming;')({createElement},durationText,timingTotals);
  const row=createElement();render(row,{stepTimings:[{label:'截图',ms:2400,status:'failed'},{label:'导出',ms:12000,status:'canceled'}],turnDurationMs:102000});
    const steps=row.children[0].children[1].children[2];
  assert.equal(steps.children[0].children[1].textContent,' 失败 · 2.4 秒');
  assert.equal(steps.children[0].children[1].style.color,'#b91c1c');
  assert.equal(steps.children[1].children[1].textContent,' 已停止 · 12 秒');
  assert.equal(row.children[0].children[0].children[0].textContent,'1 分 42 秒');
  assert.equal(row.children[0].children[1].children[0].children[0].textContent,'模型 未记录');
  assert.equal(row.children[0].children[1].children[0].children[2].textContent,'其他 1 分 42 秒');
  assert.equal(row.children[0].children[0]['aria-label'],'总耗时');
  assert.equal(steps.children[0].children[2].children[0].textContent,'回执详情');
});

test('UP-12 completed controls release before stalled attachment lists, without clearing a newer watcher',async()=>{
  const workspace=await readFile(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/webcad-workspace.js',import.meta.url),'utf8');
  const follow=workspace.slice(workspace.indexOf('async function followTask(id){'),workspace.indexOf("document.getElementById('chat').addEventListener"));
  const robotHelpers=workspace.slice(workspace.indexOf('function robotActivityDetail(){'),workspace.indexOf('function syncHostControl('));
  const createHarness=new Function('loadTaskFiles','createTurnTimeline',`
    let watchingTask=null,taskId='finished',disposed=false,activeReply=null,pendingSend={},stopping=true,idleStatus,steeringDelivery=null;
    let robotProgress={entries:[]},sending=false;
    ${robotHelpers}
    const continuationText=(text,prefix)=>text;
    const controlsSeen=[],status={},messages={scrollHeight:0,scrollTop:0,clientHeight:0};
    const document={createElement:()=>({})},reply={stepItems:new Map(),row:{append(){}},body:{},activity:{}};
    const createReply=()=>reply,renderStep=()=>{},renderReply=()=>{},durationText=()=>'',cadOutcomeText=()=>'已完成',finishProgress=()=>{},updateTurnDuration=()=>{},updateRunningTurn=()=>{};
    const adapter={endTask:id=>{if(id!=='finished')throw Error('wrong task');}},controls=()=>controlsSeen.push({taskId,stopping});
    const rpc=async action=>action==='task-events'?{events:[],nextAfter:0}:{status:'completed',startedAt:'2026-10-18T00:00:00Z',completedAt:'2026-10-18T00:00:01Z',finalResponse:'已完成'};
    const message=()=>{throw Error('unexpected attachment error');};
    const composer={finished(){}},projectOpener={poll:()=>{}},openJournal={read:()=>null},session=null,projectStorage={checkpoint:async()=>{}};
    ${follow}
    return {run:()=>followTask('finished'),seen:controlsSeen,progress:()=>robotProgress,setNewWatcher:()=>{watchingTask='newer';},watcher:()=>watchingTask};
  `);
  for(let iteration=0;iteration<100;iteration++){
    let releaseFiles,startedFiles;const filesStarted=new Promise(resolve=>{startedFiles=resolve;});
    const harness=createHarness(()=>{startedFiles();return new Promise(resolve=>{releaseFiles=resolve;});},createTurnTimeline);
    const running=harness.run();await filesStarted;
    assert.deepEqual(harness.seen,[{taskId:null,stopping:false}]);
    assert.equal(harness.progress().status,'completed');assert.equal(harness.progress().finishedAt,'2026-10-18T00:00:01Z');
    harness.setNewWatcher();releaseFiles();await running;assert.equal(harness.watcher(),'newer');
  }
});

test('UP-11 empty requests start once immediately; attached requests upload before start and unknown sends keep their key',async()=>{
  const workspace=await readFile(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/webcad-workspace.js',import.meta.url),'utf8');
  const submit=sendSource(workspace);
  const makeFactory=new Function('isModelSelectionError','modelSelectionMessage','ensureCanvasResources',`return function(attachments,failFirstSend,agentMode){
    let taskId=null,sending=false,connecting=false,projectOpening=false,session={leaseEpoch:1,agentMode:agentMode||'native'},manualControl=false,disposed=false,pendingSend=null,overlayDismissed=false,lastHeartbeatAt=0,knowledgeReady=true;
    let handler;const actions=[],sendKeys=[],sendPayloads=[],prompt={value:'测试请求',focus(){}},modelSelect={value:'test-model'};
    const modelSendReady=()=>true,modelNotice={},modelNoticeText={},refreshModels=()=>{},adapter={state:()=>({pending:[]})},documentChanged=()=>false,attachmentIdentity=item=>item.resourceId;
    const document={getElementById:id=>id==='chat'?{addEventListener:(_,callback)=>{handler=callback;}}:{value:'1'}};
    const controls=()=>{},attachmentPicker={ready:async()=>{},clear(){}},api=()=>({getState:async()=>({context:{revision:1}})}),syncNativePush=()=>{},recoverLater=()=>{},isTransportError=()=>true;
    const composer={intercept:()=>false},handleChatCommand=()=>false,appendLocationDraft={resolve:async text=>text,clear(){}};let preparedSendState=null;
    async function prepareTaskBinding(){await rpc('heartbeat');return session;}
    const guidanceFor=()=>'外部模式连接指令',message=()=>({}),config={csrf:'test-csrf'},window={fetch(){}},endpoint=()=>'/test-upload';
    const rpc=async(action,body,extra,headers)=>{actions.push(action);if(action==='heartbeat')return {leaseEpoch:1};if(action==='send'){sendKeys.push(headers['Idempotency-Key']);sendPayloads.push(body);if(failFirstSend&&sendKeys.length===1)throw Error('unknown send');return {taskId:'same-original-task',status:body.autoStart?'queued':'draft'};}if(action==='files')return {uploads:[]};if(action==='task')return {status:'draft'};return {};};
    const gatewayFetch=async()=>{actions.push('upload');},loadTaskFiles=async()=>{actions.push('loadTaskFiles');},followTask=async()=>{actions.push('follow');};
    ${submit}
    return {run:()=>sendChat(),actions,sendKeys,sendPayloads};
  };`);
  const factory=makeFactory(isModelSelectionError,modelSelectionMessage,ensureCanvasResources);
  const empty=factory([],false);await empty.run();assert.deepEqual(empty.actions,['heartbeat','send','follow']);assert.equal(empty.sendPayloads[0].autoStart,true);assert.equal(empty.sendPayloads[0].message,'测试请求');
  const external=factory([],false,'external');await external.run();assert.equal(external.sendPayloads[0].message,'外部模式连接指令\n\n【当前用户请求】\n测试请求');
  const attached=factory([{name:'原图.svg',resourceId:'vector-test',kind:'vector',size:17,file:new Uint8Array(17)}],false);await attached.run();
  assert.equal(attached.sendPayloads[0].autoStart,false);assert.deepEqual(attached.actions,['heartbeat','send','files','upload','task','start','loadTaskFiles','follow']);
  const unknown=factory([],true);await unknown.run();await unknown.run();assert.equal(unknown.sendKeys.length,2);assert.equal(unknown.sendKeys[0],unknown.sendKeys[1]);assert.equal(unknown.actions.filter(x=>x==='start').length,0);
});

test('UP-02 2.9 MB STL and 118 KB PDF each reach attachment persistence ten times',async()=>{
  let delivered=0;
  for(const [name,size] of [['case.stl',2899184],['case.pdf',118995]]){
    const bytes=new Uint8Array(size).fill(7),sha256=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
    for(let run=0;run<10;run++)await uploadHostArtifact({bytes,descriptor:{name,sha256},post:async(action,meta,data)=>{assert.equal(action,'artifact');assert.equal(data.length,size);assert.equal(meta.sha256,sha256);delivered++;return {status:'agent_write_verified'};}});
  }
  assert.equal(delivered,20);
});

test('UP-02 first POST 503 is retried, four 503s remain actionable, 10 MB uses three chunks',async()=>{
  const bytes=new Uint8Array(10*1024*1024).fill(3),sha256=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  const chunks=[];
  const result=await uploadHostArtifact({bytes,descriptor:{name:'case.stl',sha256},wait:async()=>{},post:async(action,meta,data)=>{if(action==='artifact-upload-start')return {uploadId:'x',received:[]};if(action==='artifact-upload-chunk'){chunks.push([meta.index,data.length]);return {};}return {status:'agent_write_verified'};}});
  assert.equal(result.status,'agent_write_verified');assert.equal(chunks.length,3);assert.equal(chunks.reduce((sum,row)=>sum+row[1],0),bytes.length);
  const small=new Uint8Array(100),hash=Buffer.from(await crypto.subtle.digest('SHA-256',small)).toString('hex');let calls=0;
  await uploadHostArtifact({bytes:small,descriptor:{name:'x.pdf',sha256:hash},wait:async()=>{},post:async()=>{if(++calls===1)throw Object.assign(new Error('503'),{status:503});return {};}});assert.equal(calls,2);
  await assert.rejects(uploadHostArtifact({bytes:small,descriptor:{name:'x.pdf',sha256:hash},wait:async()=>{},post:async()=>{throw Object.assign(new Error('503'),{status:503});}}),error=>error.status===503&&error.attempts===4);
});

test('HTML login/502 responses produce actionable errors without leaking response HTML',async()=>{
  const response=(status,url)=>({status,url,ok:false,text:async()=>'<html>private proxy detail</html>'});
  await assert.rejects(readGatewayJson(response(200,'https://example.test/Login.aspx?ReturnUrl=x')),e=>e.code==='login_required'&&!e.message.includes('private'));
  await assert.rejects(readGatewayJson(response(502,'')),e=>e.code==='gateway_response_invalid'&&e.status===502);
  await assert.rejects(readGatewayJson({ok:false,status:409,text:async()=>JSON.stringify({error:{code:'REVISION_CONFLICT',message:'changed'}})}),e=>e.code==='REVISION_CONFLICT');
});
test('a timed-out send is reported as unknown transport; it is never retried by fetch',async()=>{
  let calls=0;
  await assert.rejects(gatewayFetch((url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));},'test',{},1),e=>e.code==='request_timeout');
  assert.equal(calls,1);
});
test('recovery continues after the first ticket fails and coalesces concurrent requests',async()=>{
  const pending=new Map(),delays=[];let sequence=0,calls=0;
  const loop=createRecoveryLoop({recover:async()=>{calls++;if(calls<3)throw new Error('offline');},setTimer:(fn,ms)=>{delays.push(ms);pending.set(++sequence,fn);return sequence;},clearTimer:id=>pending.delete(id)});
  const tick=async()=>{const [id,fn]=pending.entries().next().value;pending.delete(id);await fn();};
  loop.schedule(new Error('closed'));loop.schedule(new Error('closed again'));
  assert.equal(pending.size,1);await tick();await tick();await tick();
  assert.equal(calls,3);assert.deepEqual(delays,[1500,3000,6000]);assert.equal(pending.size,0);
  loop.schedule(new Error('closed'));loop.reset();assert.equal(pending.size,0);
});

test('QA authentication recovery stops immediately and preserves the error until explicit reconnect',async()=>{
  for(const status of [401,403]){
    let attempts=0,scheduled=0,stopped;
    const error=Object.assign(Error('expired'),{status,code:status===401?'login_required':'cad_gateway_denied'});
    const loop=createRecoveryLoop({recover:async()=>{attempts++;},setTimer:()=>{scheduled++;},onExhausted:value=>{stopped=value;}});
    loop.schedule(error);loop.schedule(Error('heartbeat'));assert.equal(loop.exhausted(),true);assert.equal(stopped,error);assert.equal(attempts,0);assert.equal(scheduled,0);
    loop.reset();assert.equal(loop.exhausted(),false);
  }
  await assert.rejects(readGatewayJson({ok:false,status:401,text:async()=>JSON.stringify({error:{code:'cad_gateway_denied',message:'Please sign in'}})}),{code:'login_required'});
});

test('QA an authentication failure inside recovery cannot schedule another attempt',async()=>{
  let tick,calls=0,stopped;
  const loop=createRecoveryLoop({recover:async()=>{calls++;throw Object.assign(Error('expired'),{status:401,code:'login_required'});},setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{},onExhausted:error=>{stopped=error;}});
  loop.schedule(Error('network'));await tick();loop.schedule(Error('heartbeat'));
  assert.equal(calls,1);assert.equal(loop.exhausted(),true);assert.equal(stopped.code,'login_required');loop.reset();
});
test('takeover cancels recovery even if an in-flight attempt fails later',async()=>{
  let tick,reject;let scheduled=0;
  const loop=createRecoveryLoop({recover:()=>new Promise((resolve,no)=>{reject=no;}),setTimer:fn=>{scheduled++;tick=fn;return 1;},clearTimer:()=>{}});
  loop.schedule(new Error('closed'));const attempt=tick();loop.reset();reject(new Error('late failure'));await attempt;
  assert.equal(scheduled,1);
});

test('UP-01 recovery stops after six actual attempts and can be explicitly reset',async()=>{
  const pending=new Map();let id=0,calls=0,failed=0;
  const loop=createRecoveryLoop({recover:async()=>{calls++;throw new Error('offline');},onExhausted:error=>{assert.equal(error.code,'recover_timeout');failed++;},setTimer:fn=>{pending.set(++id,fn);return id;},clearTimer:id=>pending.delete(id)});
  loop.schedule(new Error('closed'));
  for(let i=0;i<6;i++){const [id,fn]=pending.entries().next().value;pending.delete(id);await fn();}
  assert.equal(calls,6);assert.equal(failed,1);assert.equal(loop.exhausted(),true);assert.equal(pending.size,0);
  loop.schedule(new Error('late'));assert.equal(pending.size,0);
  loop.reset();loop.schedule(new Error('retry'));assert.equal(pending.size,1);loop.reset();
});

test('UP-01 deadline marks a stalled in-flight recovery offline',async()=>{
  let failed=0,run;
  const loop=createRecoveryLoop({recover:()=>new Promise(()=>{}),onExhausted:()=>failed++,maxMs:20,setTimer:fn=>{run=fn;return 1;},clearTimer:()=>{}});
  loop.schedule(new Error('offline'));void run();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(failed,1);assert.equal(loop.exhausted(),true);loop.reset();
});
test('published commentary is shown; raw reasoning remains hidden',()=>{
  assert.equal(publicProgressText({type:'reasoning',itemType:'commentary',text:'读取当前选边'}),'读取当前选边');
  assert.equal(publicProgressText({type:'reasoning',itemType:'reasoning',sdkEventType:'item/reasoning/textDelta',text:'private'}),'');
  assert.equal(publicProgressText({type:'reasoning',itemType:'reasoning',sdkEventType:'item/reasoning/summaryTextDelta',text:'检查尺寸'}),'检查尺寸');
});

test('local tool activity shows only bounded details from the current task',()=>{
  const activity={type:'tool-activity',taskId:'current',method:'getTools',target:'fillet, booleanCut',status:'completed'};
  assert.equal(toolActivityText(activity,'current'),'读取工具：fillet, booleanCut\n');
  assert.equal(toolActivityText(activity,'other'),'');
  assert.equal(toolActivityText({...activity,method:'private-operation'},'current'),'');
  assert.equal(toolActivityText({...activity,method:'toString'},'current'),'');
  assert.equal(toolActivityText({...activity,status:'failed'},'current'),'读取工具：fillet, booleanCut（未完成）\n');
  assert.ok(toolActivityText({...activity,target:'x'.repeat(1000)},'current').length<180);
});

test('a completed model turn does not turn pending or partial CAD work into success',()=>{
  assert.match(cadOutcomeText({status:'completed',cadOutcome:{status:'unknown'}}),/待确认/);
  assert.match(cadOutcomeText({status:'completed',cadOutcome:{status:'partial'}}),/部分完成/);
  assert.match(cadOutcomeText({status:'canceled',cadOutcome:{status:'completed'}}),/已停止.*回执已确认/);
  assert.match(cadOutcomeText({status:'completed',cadOutcome:{status:'not_executed'}}),/未执行/);
  assert.match(cadOutcomeText({status:'failed'}),/核对/);
});

test('a stalled receipt report does not block the next page heartbeat',async()=>{
  const workspace=await readFile(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/webcad-workspace.js',import.meta.url),'utf8');
  const start=workspace.indexOf('async function heartbeatTick()');
  const tick=workspace.slice(start,workspace.indexOf('\nfunction message(',start));
  const calls=[];
  const run=new Function('rpc','retryReports',`
    let heartbeatRunning=false,disposed=false,manualControl=false,projectHandoffClaimed=false,taskId=null,adapterLeaseEpoch=1;
    const projectOpener={poll:()=>{}},openJournal={read:()=>null};
    let session={leaseEpoch:1},lastHeartbeatAt=0,transportReady=true,idleStatus='就绪';
    const stream={readyState:1},status={},recovery={reset(){},exhausted:()=>false},controls=()=>{},recoverLater=()=>{};
    const api=()=>({getState:()=>({context:{revision:1}})});
    const listen=async()=>{},syncNativePush=()=>{};
    ${tick}
    return heartbeatTick;
  `)(async action=>{calls.push(action);return {leaseEpoch:1};},()=>{calls.push('report');return new Promise(()=>{});});
  await Promise.race([run(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Heartbeat blocked by receipt')),100))]);
  await run();
  assert.deepEqual(calls,['heartbeat','report','heartbeat','report']);
});
