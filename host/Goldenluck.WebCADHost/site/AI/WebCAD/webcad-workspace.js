// The loaded WebCAD build owns its adapter and contract; no copied CAD scripts.
import {createAssistantBridge,setTheme} from './assistant-bridge.js?v=20261022-state-sync1';
import {createProjectStorage} from './project-storage.js?v=20261025-stability2';
import {createNativeStateView} from './native-state.js?v=20261025-coverage2';
import {timingTotals,createTurnTimeline,timelineLabels} from './turn-timing.js?v=20261023-timeline2';
import {createLocationDraftInserter} from './location-draft.js?v=20261022-location2';
import {renderCadFiles,compactUploadNames} from './compact-files.js?v=20261022-compact1';
import {createPanelLayout,isMobileInput,isMobileLayout} from './panel-layout.js?v=20261019-layout1';
const assistantOnly=new URLSearchParams(location.search).get('assistant')==='1';
const bridge=assistantOnly?createAssistantBridge():null;
if(assistantOnly)document.body.classList.add('assistant-only');
const createHostAdapter=options=>{
  if(bridge)return bridge.createAdapter(options.session);
  const agent=document.getElementById('cad-frame').contentWindow.webcad?.agent;
  if(agent?.contract?.adapterVersion!==2||typeof agent.createHostAdapter!=='function')throw Object.assign(new Error('WebCAD 与宿主接口版本不匹配，请使用同一发布包。工程保留。'),{code:'AGENT_ADAPTER_VERSION_MISMATCH'});
  return agent.createHostAdapter(options);
};

import {gatewayFetch,isTransportError,isModelSelectionError,modelSelectionMessage,modelCatalogPlan,createRecoveryLoop,publicProgressText,toolActivityText,renderReply,cadOutcomeText,uploadHostArtifact,durationText,registerHostAttachments,attachmentIdentity,createHostRecoveryJournal,settleIndependent,historyUserText,documentKey,documentChanged,planConversation,isForeignConversationError,PROJECT_SWITCH_NOTICE,PROJECT_REOPEN_NOTICE,FOREIGN_CONVERSATION_NOTICE} from './workspace-transport.js?v=20261025-bounded-recovery';
import {createProjectOpenController} from './project-open.js?v=20261026-auth-stop';
import {createAttachmentBytesAPI} from './attachment-bytes.js?v=20261021-byte-attach1';
const config=JSON.parse(document.getElementById('webcad-config').textContent);
const editLock=document.getElementById('edit-lock'),dismissLock=document.getElementById('dismiss-lock');
dismissLock.dataset.hostControlAllowed='true';
const projectStorage=createProjectStorage({api,binding:()=>knowledgeReady&&session?.agentMode==='native'?session:null,
  status:()=>{},
  copyBytes:bytes=>bridge?new Uint8Array(bytes):new frame.contentWindow.Uint8Array(bytes),
  settled:()=>!pendingSend&&!adapter?.state().pending.length&&!rejectedCommands.size,
  notice:text=>message('system',text),
  info:conversationId=>rpc('project-info',{conversationId}),
  download:async(conversationId,fileId)=>{const response=await fetch(endpoint('project-download',{conversationId,fileId}),{credentials:'same-origin'});if(!response.ok)throw Error('恢复文件下载失败');return new Uint8Array(await response.arrayBuffer());},
  upload:async(bound,meta,bytes)=>{
    const chunkBytes=4*1024*1024,parts=Math.ceil(bytes.byteLength/chunkBytes);let result;
    if(bytes.byteLength>bound.projectStorage.maxBytes)throw Error('项目文件超过暂存容量上限');
    for(let part=0;part<parts;part++)result=await gatewayFetch(window.fetch.bind(window),endpoint('project-file',{cadSessionId:bound.cadSessionId,leaseEpoch:bound.leaseEpoch,...meta,part,parts}),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-CSRF-Token':config.csrf},body:bytes.subarray(part*chunkBytes,(part+1)*chunkBytes)},120000);
    return result;
  }
});
const frame=document.getElementById('cad-frame'), status=document.getElementById('status');
const messages=document.getElementById('messages'), prompt=document.getElementById('prompt');
const composerTools=document.createElement('div');composerTools.className='composer-tools';
document.getElementById('chat').before(composerTools);
const locationChips=document.createElement('div');locationChips.className='location-chips';locationChips.setAttribute('aria-label','临时位置');locationChips.hidden=true;composerTools.append(locationChips);
const appendLocationDraft=createLocationDraftInserter({input:prompt,getContext:async()=>(await api().getState()).context,onReveal:()=>showAssistant(true),onChange:markers=>{
  locationChips.hidden=!markers.length;locationChips.replaceChildren(...markers.map(marker=>{const chip=document.createElement('button');chip.type='button';chip.className='location-chip';chip.textContent=marker.label;chip.title=marker.tooltip||`${marker.label}：${marker.point.join(', ')} mm`;chip.setAttribute('aria-label',`${marker.label}，点击移除位置`);chip.onclick=()=>appendLocationDraft.remove(marker.label);return chip;}));
}});
async function insertLocationDraft(marker){
  if(!session||session.agentMode!=='native'||!knowledgeReady||!transportReady||agentOffline||manualControl||connecting||projectOpening)throw Object.assign(new Error('请先连接原生 Agent，再标记位置。'),{code:'AGENT_COMPOSER_UNAVAILABLE'});
  return appendLocationDraft(marker);
}
let session=null, adapter=null, stream=null, lastSeq=0, taskId=null, heartbeat=null, disposed=false, pendingSend=null;
let robotProgress={taskId:null,status:'idle',phase:'waiting',startedAt:null,entries:[]};
let projectOpening=false,projectHandoffClaimed=false;
const openJournalKey='webcad-project-open:'+config.userId+':'+config.agentTarget;
const openJournal={read(){try{return JSON.parse(sessionStorage.getItem(openJournalKey)||'null');}catch{return null;}},write(value){sessionStorage.setItem(openJournalKey,JSON.stringify(value));},clear(){sessionStorage.removeItem(openJournalKey);}};
const projectOpener=createProjectOpenController({
  rpc:(id,body)=>rpc('project-open',body,{cadSessionId:id}),api,
  journal:openJournal,notice:text=>{status.textContent=text;},
  onAuthRequired:error=>recoverLater(error),
  onBusy:value=>{projectOpening=value;if(!value)projectHandoffClaimed=false;controls();},
  settled:async()=>{await retryReports();return !taskId&&!pendingSend&&!sending&&!adapter?.state().pending.length&&![...retiredAdapters].some(item=>item.state().pending.length)&&!rejectedCommands.size;},
  quiesce:async()=>{projectHandoffClaimed=true;clearInterval(heartbeat);stream?.close();stopNativePush();await adapter?.release();knowledgeReady=false;transportReady=false;},
  download:async(id,file)=>{const response=await fetch(endpoint('download',{cadSessionId:id,taskId:file.taskId,fileId:file.fileId}),{credentials:'same-origin'});if(!response.ok)throw Object.assign(Error('原工程下载失败，未打开。'),{code:'PROJECT_DOWNLOAD_FAILED'});const TargetBytes=bridge?Uint8Array:frame.contentWindow.Uint8Array;return new TargetBytes(await response.arrayBuffer());},
  rebind:async context=>{const state=await api().getState();if(documentKey(state.context)!==documentKey(context))throw Object.assign(Error('工程在重绑定前已变化。'),{code:'INSTANCE_MISMATCH'});if(session&&knowledgeReady&&documentKey(session.binding)===documentKey(context))return session;desiredConversation=null;startNewConversation=true;explicitConversation=false;try{await connect();return session;}finally{startNewConversation=false;}}
});
let connecting=false, watchingTask=null, sending=false, stopping=false, knowledgeReady=false, overlayDismissed=false, activeReply=null;
let steeringDelivery=null;
let attachments=[],attaching=false;
let desiredConversation=null,historyCursor=null,historyItems=[];
let startNewConversation=false;
let nativeConversationSupported=true;
// Document (documentId + documentInstanceId) the remembered conversation was attached for.
// explicitConversation marks a user-chosen history entry, which is never silently replaced.
let conversationDocument=null,explicitConversation=false;
let recoveryStorage;try{recoveryStorage=sessionStorage;}catch{}
const recoveryJournal=createHostRecoveryJournal(recoveryStorage,'webcad.host-recovery.v1.'+config.userId+'.'+config.agentTarget);
let rememberedRecovery=recoveryJournal.read(),recoveryNoticeShown=false;
function rememberRecovery(){
  if(!session)return;
  if(taskId||pendingSend||adapter?.state().pending.length){rememberedRecovery={cadSessionId:session.cadSessionId,conversationId:session.conversationId,taskId,leaseEpoch:session.leaseEpoch,lastSeq,binding:session.binding,pageSessionId:session.context?.sessionId,pendingSend};recoveryJournal.write(rememberedRecovery);}
  else {rememberedRecovery=null;recoveryJournal.write(null);}
}
async function reconcileRememberedTask(){
  if(session||!rememberedRecovery)return;
  const prior=rememberedRecovery,id=prior.taskId||prior.pendingSend?.draftTaskId;
  if(!id){if(!recoveryNoticeShown){recoveryNoticeShown=true;message('system','原发送尚无任务回执；已保留发送键 '+prior.pendingSend?.key+'。重新连接会查询会话中的原任务，不会自动重发指令。');}desiredConversation=prior.conversationId;return false;}
  const task=await rpc('task',{}, {taskId:id,cadSessionId:prior.cadSessionId});
  if(['completed','failed','canceled'].includes(task.status)){
    message('system','已核对原任务：'+id+'，状态 '+task.status+'。'+(task.finalResponse||''));rememberedRecovery=null;recoveryJournal.write(null);return;
  }
  // An authenticated task handle suffices to observe or stop the original
  // Agent task. Canvas identity is checked only when a CAD tool is requested.
  session={cadSessionId:prior.cadSessionId,conversationId:prior.conversationId,leaseEpoch:prior.leaseEpoch,binding:prior.binding,agentMode:'native',knowledgeReady:false};
  desiredConversation=prior.conversationId;taskId=id;lastSeq=prior.lastSeq||0;pendingSend=null;
  adapter={state:()=>({pending:[],accepting:false,editing:false}),endTask:async()=>{},release:()=>{},retryReports:async()=>{}};
  heartbeat=setInterval(heartbeatTick,10000);
  void listen().catch(recoverLater);void followTask(id).catch(recoverLater);return true;
}
const workbench=window.AgentWorkbench;
const cadIcon=()=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','gl-icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML='<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9ZM4 7.5l8 4.5 8-4.5M12 12v9"/><path d="M20 1v4M18 3h4"/>';return svg;};
document.querySelector('.assistant-heading h1').prepend(cadIcon());
for(const [id,icon] of [['reconnect','link'],['takeover','disconnect']]) {
  const button=document.getElementById(id);button.textContent='';button.append(workbench.createIcon(icon));
}
const attachmentLabel=document.querySelector('.attachment-input');
attachmentLabel.querySelector('svg').replaceWith(workbench.createIcon('attachment'));
const oldEffort=document.getElementById('effort'),effortSelect=document.createElement('select');
effortSelect.id=oldEffort.id;effortSelect.setAttribute('aria-label','思考强度');
for(const [value,label] of [['0','快速响应'],['1','标准推理'],['2','深入推理']]) {
  const option=document.createElement('option');option.value=value;option.textContent=label;effortSelect.append(option);
}
effortSelect.value=oldEffort.value;oldEffort.replaceWith(effortSelect);
document.getElementById('effort-label').classList.add('sr-only');
const modelSelect=document.createElement('select');modelSelect.id='model';modelSelect.ariaLabel='模型';modelSelect.disabled=true;
modelSelect.append(new Option('读取模型…',''));document.querySelector('.effort-control').prepend(modelSelect);
let modelIds=new Set(),modelChoice='',modelListLoading=false,modelListOperation=null;
const inputHint=document.createElement('div');inputHint.className='workbench-input-hint';inputHint.textContent=isMobileInput()?'点击发送 · Enter 换行':'Enter 发送 · Shift + Enter 换行';
document.getElementById('chat').after(inputHint);
const modelNotice=document.createElement('div');modelNotice.className='workbench-input-hint';modelNotice.hidden=true;modelNotice.setAttribute('role','status');
const modelNoticeText=document.createElement('span'),modelRefresh=document.createElement('button');modelRefresh.type='button';modelRefresh.textContent='刷新模型列表';modelRefresh.setAttribute('aria-label','刷新当前账号可用模型列表');modelNotice.append(modelNoticeText,modelRefresh);inputHint.after(modelNotice);
function modelSendReady(){return pendingSend?Boolean(pendingSend.model):modelSelect.dataset.ready==='true'&&modelIds.has(modelSelect.value);}
function refreshModels({initial=false}={}){
  if(modelListOperation)return modelListOperation;
  const previousModel=modelSelect.value||modelChoice;modelListLoading=true;modelSelect.dataset.ready='false';modelRefresh.disabled=true;controls();
  modelListOperation=(async()=>{
    try{
      const plan=modelCatalogPlan(await rpc('models'),previousModel,{initial});modelIds=new Set(plan.models.map(model=>model.id));
      modelSelect.replaceChildren(new Option(plan.placeholder,'',false,!plan.selected));for(const model of plan.models)modelSelect.append(new Option(model.id,model.id,false,model.id===plan.selected));
      modelSelect.value=plan.selected;modelChoice=plan.selected;modelSelect.dataset.ready='true';modelSelect.title='选择当前账号可用模型';
      modelNotice.hidden=Boolean(plan.selected);modelNoticeText.textContent=plan.selected?'':plan.placeholder+'；不会自动更换模型或重新发送。';
    }catch(error){
      modelIds.clear();modelSelect.replaceChildren(new Option('模型列表读取失败，请刷新',''));modelSelect.dataset.ready='false';modelSelect.title='模型列表暂时读取失败';
      modelNotice.hidden=false;modelNoticeText.textContent='模型列表暂时读取失败，输入和工程已保留。请刷新列表后再明确选择；不会自动使用默认模型。';
    }finally{modelListLoading=false;modelListOperation=null;controls();}
  })();return modelListOperation;
}
modelRefresh.addEventListener('click',()=>{void refreshModels();});
modelSelect.addEventListener('change',()=>{modelChoice=modelSelect.value;modelNotice.hidden=modelIds.has(modelChoice);controls();});
let manualControl=false;
let connectionGeneration=0;
let connectOperation=null,listenOperation=null,initializationEpoch=0,transportReady=false,heartbeatRunning=false;
let reportOperation=null,lastHeartbeatAt=0,idleStatus='就绪';
let agentOffline=false,lastAgentSignalAt=Date.now(),lastRecoveryProbeAt=0,adapterLeaseEpoch=null,recoveryOperation=null;
function markAgentOffline(text='助手已断开，请点击重新连接'){
  agentOffline=true;transportReady=false;status.textContent=text;progress('助手已断开');controls();
}
function receiveAgentState(value){
  lastAgentSignalAt=Date.now();
  if(session)session.agentState=value;
  if(recovery.exhausted()){controls();return;}
  if(!value.alive&&value.activeTaskId){markAgentOffline('当前任务暂时无响应，正在核对连接和原回执');return;}
  agentOffline=false;
  if(stream?.readyState===1&&!recovery.exhausted())transportReady=true;
  controls();
}
const agentMonitor=setInterval(()=>{
  if(!session||session.dialogueOnly||disposed||manualControl||recovery.exhausted()||document.visibilityState==='hidden'||navigator.onLine===false)return;
  if(Date.now()-lastAgentSignalAt>=45000&&Date.now()-lastRecoveryProbeAt>=15000){
    lastRecoveryProbeAt=Date.now();status.textContent='连接暂时中断，正在自动恢复并同步画布';progress('正在恢复连接');controls();
    recovery.schedule(Object.assign(new Error('连接心跳需要重新确认'),{code:'stream_unavailable'}));
  }
},1000);
let kernelRecoveryOperation=null;
// 原生宿主 agent 模式：本工作台的 goldenluck.codexagent 默认进入内嵌模式，无需 connect 握手。
// 宿主只声明能力（nativeHost），是否 native 由 CodexAgent 服务端决定（agentMode，用户不可切换）；
// native 时宿主在每次修订变化及回报结果前把精简状态推给 broker，写入仍在页面执行并校验修订。
let nativeWatchStop=null,nativePushing=null,nativeDirty=false,preparedSendState=null;
const nativeState=createNativeStateView({api,protocols:()=>session?.stateProtocols||[],onChange:()=>{void pushNativeSnapshot();},onError:error=>{if(isTransportError(error))recoverLater(error);}});
const nativeSupported=current=>typeof current?.watchRevision==='function';
function stopNativePush(){try{nativeWatchStop?.();}catch(_){}nativeState.disconnect();nativeWatchStop=null;nativeDirty=false;}
function pushNativeSnapshot(){
  const bound=session;
  if(!bound||bound.agentMode!=='native'||disposed)return Promise.resolve();
  if(nativePushing){nativeDirty=true;return nativePushing;}
  nativePushing=(async()=>{
    do{nativeDirty=false;
      const packet=nativeState.read();if(!packet)return;
      const snapshot={...packet.snapshot,stateSeq:packet.stateSeq,stateCoverage:packet.coverage,...(packet.protocol==='goldenluck.webcad.state/2'?{coverageDetails:packet.coverageDetails}:{})};
      if(session!==bound)return;
      await rpc('snapshot',{snapshot,leaseEpoch:bound.leaseEpoch});
    }while(nativeDirty&&session===bound&&!disposed);
  })().catch(error=>{if(isTransportError(error))recoverLater(error);}).finally(()=>{nativePushing=null;});
  return nativePushing;
}
// 按服务端返回的 agentMode 开始或停止推送（attach/prepare/heartbeat 的响应都带 agentMode）。
function syncNativePush(){
  let current=null;try{current=api();}catch(_){}
  const wanted=Boolean(session&&session.agentMode==='native'&&session.knowledgeReady&&!manualControl&&nativeSupported(current));
  if(!wanted){if(nativeWatchStop)stopNativePush();return;}
  if(nativeWatchStop)return;
  nativeWatchStop=()=>nativeState.disconnect();
  void nativeState.connect().then(()=>pushNativeSnapshot()).catch(error=>{nativeWatchStop=null;status.textContent='状态同步未确认：'+error.message;controls();});
}
async function restoreKernelIfNeeded(){
  const current=api(),state=await current.getState();
  if(state.summary?.kernelReady||state.summary?.busy||state.preview?.computing)return;
  if(typeof current.recoverKernel!=='function')throw Object.assign(new Error('当前WebCAD版本缺少内核恢复接口；已提交工程仍应先保存。'),{code:'KERNEL_RECOVERY_UNAVAILABLE'});
  if(!kernelRecoveryOperation){
    const {revision,...identity}=state.context;
    status.textContent='正在从最后已提交工程恢复内核…';
    kernelRecoveryOperation=current.recoverKernel({context:{...identity,expectedRevision:revision},stopRunning:false}).then(result=>{
      if(result.status==='failed')throw Object.assign(new Error(result.error.message),result.error);
      return result;
    }).finally(()=>{kernelRecoveryOperation=null;});
  }
  return kernelRecoveryOperation;
}
const detachedSessions=new Set(), rejectedCommands=new Map(), retiredAdapters=new Set();
const readinessAnnouncements=new Set();
const cadAssistantGuidance=`【CAD 助手操作指引】
公司和绘图共用已发布知识库，CAD模式优先绘图知识。用goldenluck_knowledge读取入口和CAD路由，按需查询产品、材料、工艺及公司资料；实时业务资料使用当前用户权限下的goldenluck_query/goldenluck_stats。画图工具说明按当前页面版本从已校验本地缓存读取，版本变化时由宿主更新。
只读 getState 的准确调用为 webcad_read({method:"getState",args:{}})（默认精简：实体 id/名称/中心/尺寸；需要特征再传 include:["summary","features"]，全量传 detail:true），不要传 context、documentId、documentInstanceId 或 expectedRevision；这些属于其他需要上下文的写入／查询契约。需要完整卡时使用 getTool({id:"getState"}) 或 connect 的 toolIds 精确取卡，不靠模糊搜索猜参数。每个方法分别遵循自己的工具卡。
知识库与工作目录在连接时已经准备。优先 webcad_docs({method:"route",args:{query:"本次能力"}}) 定位，已知ID用getTool/getTools批量读完整卡；readDocs读取工作流。静态文档直接从已校验本地库读取，不要重复下载全库或经网页逐项找工具。
思考和只读阶段用户可以编辑画布。开局 webcad_connect 一次并读取一次精简 getState 确认目标；连续写入直接沿用上一条回执的 nextContext/requestContext（回执已是最新修订），不必每次写入前再读 getState。只有目标不清、用户可能编辑过、长时间等待后或出现 REVISION_CONFLICT 时才补读。REVISION_CONFLICT 时只重读状态并修正尚未执行步骤，不能重跑已完成步骤；结果未知的写入绝不重放。工具卡用一次 getTools 批量读取，同版本已读过的卡不要重复读取。body.align 的 group:true 是整体按联合包围盒平移、保持相对位置，group:false 是每个实体各自对齐；用户要“分别/各自对齐”时用 group:false，回执 bodyBounds 已给出移动后中心与尺寸，可直接核对。截图只在用户要求时做；CAPTURE_TIMEOUT 只说明画面未确认，几何不受影响，不要循环 webcad_job。
空间变换注意：transform 或 copy 只要 params 含 mode（translate/toPoint/rotate/scale/align），必须在 add 的 args 中同时提供 placement，不能把它放进 params。世界坐标模式已验证可用 placement:{version:1,frame:{kind:"world"},sourceAnchor:{kind:"model-origin"}}；其它基准先读 api.references。普通世界坐标相对平移也可用不带 mode 的 params:{positionMode:"relative",x:dx,y:dy,z:dz}，不要混用两套参数。精确装配位置的圆柱等新实体应显式提供 placement；省略可能触发自动堆叠及间隙，参考锚点不保证每个实体的最终位置。写入后核对实际 bounds 和 resolvedPlacement，不要靠假设再加一次位移。FRAME_INVALID 后只修正剩余步骤，保留已经创建的实体。
主体形状要求变更时，先读回当前主体、特征依赖和修订，评估保留现有实体的局部布尔切削、并集或交集修补，不要立即修改早期主体参数、回滚历史或另建替代主体。布尔修补不是强制方案：比较实际几何、影响范围和复杂度，选择能保留孔、挡边、装配位置及已完成特征的最小可靠改动。
例：成型长方板改四角圆角，可用同位置同尺寸的长方形减去圆角长方形得到四角刀具，拉伸贯穿需切削的厚度，再从现有主体减去；确认刀具不切到孔、挡边或其他零件。轮廓大圆角与边缘小倒 R 是不同要求，切削后重新查询边并处理小 R，禁止复用旧修订的边号或把已有 R 自动延续当作事实。未指定半径须询问，不以缩小半径或改变尺寸来掩盖失败。
如果你自行规划的方案需要重建或替换主体、修改早期依赖引发下游重算、删除或重做已有特征，或需要多轮试探和复杂长流程，必须在首次相关几何写入前向用户简述方案、保留项、可能影响、较简单替代方案及需要确认的参数，明确询问是否执行，并结束本次任务等待用户回复；用户沉默不算批准。用户已明确批准同一方案时无需重复询问，普通已授权的简单局部修改可直接执行。
图案加工先明确几何需求：恒深凹线条/凹字使用LOGO，离散层高使用分层浮雕；连续体块不得把普通照片灰度当高度图。保留孔、耳朵、胡须和清晰边界，不靠粗网格、删细节或改变高度掩盖失败。当前库包含api.pattern-machining时读取该工作流并调用planPatternMachining；旧库没有时按现有完整工具卡核对能力，连续雕刻不受支持就明确说明，不臆造接口。files.register由宿主处理，禁止放进run。
操作失败时保留已完成步骤，使用webcad_job核对原commandId回执（可读同一对话、文档的前轮回执），暂时离线也可核对已保存结果。queued/running/unknown不是成功，不重放原操作；结果未确认时停止后续写入。用户已批准同一方案时沿用授权，仅新增破坏性范围或缺失关键尺寸才再问。无法安全继续时说明已完成项、失败项和原因。`;
const nativeGuidanceLine='原生宿主模式：页面已绑定，不要调用 webcad_connect（仅在 page_offline 时用 webcad_connect(args={recover:true}) 恢复）。任务开头已附常驻工具目录、核心工具卡和当前状态快照；webcad_state 在本地读取最新快照，快照过期时自动改读页面。写入用快照或上一条回执的 requestContext；REVISION_CONFLICT 时用 webcad_state summary 重读后只修正未执行步骤。';
const guidanceFor=bound=>bound?.agentMode==='native'?nativeGuidanceLine+'\n当前任务使用已校验工具卡，缺少具体契约时再按需读取。遵守用户本轮及前轮仍有效的授权，普通已批准局部修改不重复确认；不扩大破坏性范围，不编造尺寸、图纸或结果。未知写入先核对原回执。长度mm；寸默认英寸25.4mm并注明假设。产品号先读系统原图；改已有尺寸优先feature.edit；失败回显具体错误码、字段和原因。附件resourceId只用于页面资源API。回复中文，区分几何提交、画面、文件生成与送达。':cadAssistantGuidance;
document.getElementById('connection').textContent='Agent：'+(config.agentTarget||'已配置目标')+' · 连接当前工程后启用';
const endpoint=(action,extra={})=>{const url=action==='project-open'?new URL('WebCADProjectOpen.ashx',new URL(config.bridge,location.href)):new URL(config.bridge,location.href);url.searchParams.set('action',action);if(session)url.searchParams.set('cadSessionId',session.cadSessionId);for(const [key,value]of Object.entries(extra))url.searchParams.set(key,value);return url;};

async function rpc(action,body={},extra={},headers={}) {
  return gatewayFetch(window.fetch.bind(window),endpoint(action,extra),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':config.csrf,...headers},body:JSON.stringify(body)},action==='prepare'?65000:35000);
}
const recovery=createRecoveryLoop({recover:recoverConnection,onExhausted:error=>{
  const auth=error?.code==='login_required'||[401,403].includes(error?.status);
  markAgentOffline(auth?'登录或权限已失效，请在新标签登录后点击重新连接；当前画布和原任务已保留':'连接恢复已达上限，请点击重新连接；当前画布和原任务已保留');
  stream?.close();transportReady=false;rememberRecovery();
},onIssue:error=>{
  if(disposed||manualControl)return;
  transportReady=false;status.textContent=error?.code==='login_required'?'请重新登录':agentOffline?'助手已断开，正在恢复连接…':'正在恢复连接…';
  progress('连接恢复中');controls();
}});
function recoverLater(error){if(!disposed&&!manualControl)recovery.schedule(error);}
function recoverConnection(){
  if(recoveryOperation)return recoveryOperation;
  recoveryOperation=restoreConnection().finally(()=>{recoveryOperation=null;});return recoveryOperation;
}
let canvasConnection=null;
function connectCanvas(){
  if(canvasConnection)return canvasConnection;
  const requestedSession=session;
  canvasConnection=(async()=>{
    if(!session)await connect();
    const bound=session;
    if(!bound||disposed||manualControl)throw Object.assign(Error('Agent 会话已退出'),{code:'lease_revoked'});
    await restoreKernelIfNeeded();
    const current=api(),state=await current.getState();
    if(session!==bound||disposed||manualControl)throw Object.assign(Error('Agent 会话已改变'),{code:'lease_revoked'});
    if(bound.binding&&documentChanged(state.context,bound.binding))throw Object.assign(Error('画布工程已改变；原工具连接没有改绑或重放，请在新对话中连接当前工程。'),{code:'INSTANCE_MISMATCH'});
    const renewed=await rpc('heartbeat',{context:state.context,leaseEpoch:bound.leaseEpoch});
    if(session!==bound||disposed||manualControl)throw Object.assign(Error('Agent 会话已改变'),{code:'lease_revoked'});
    Object.assign(bound,renewed);
    if(!adapter?.state().accepting||adapterLeaseEpoch!==bound.leaseEpoch){
      await retryReports();
      if(adapter?.state().pending.length||rejectedCommands.size)throw Object.assign(Error('原 CAD 回执待核对'),{code:'cad_receipt_pending'});
      adapter=await createSessionAdapter(bound);
    }
    const receipt=await current.connect({toolIds:['getState','resolvePlacement'],includeContracts:true});
    if(!receipt.canExecute)throw Object.assign(Error('当前画布尚不能执行：'+(receipt.blockers||[]).join('、')),{code:'CAD_NOT_READY'});
    const prepared=await rpc('prepare',{leaseEpoch:bound.leaseEpoch,receipt});
    if(session!==bound||disposed||manualControl)throw Object.assign(Error('Agent 会话已改变'),{code:'lease_revoked'});
    Object.assign(bound,prepared);knowledgeReady=Boolean(prepared.knowledgeReady);conversationDocument=documentKey(bound.binding);
    if(!knowledgeReady)throw Object.assign(Error('画布工具契约尚未准备完成'),{code:'knowledge_required'});
    syncNativePush();void listen().catch(recoverLater);
    if(taskId&&watchingTask!==taskId)void followTask(taskId).catch(recoverLater);
    controls();
    return bound;
  })().catch(error=>{
    if(requestedSession&&session===requestedSession)void rpc('heartbeat',{leaseEpoch:requestedSession.leaseEpoch,connectionError:{code:String(error.code||'CAD_UNAVAILABLE'),message:String(error.message||'画布不可用').slice(0,1000)}},{cadSessionId:requestedSession.cadSessionId}).catch(()=>{});
    throw error;
  }).finally(()=>{canvasConnection=null;});
  return canvasConnection;
}
async function restoreConnection(){
  if(disposed||manualControl||projectHandoffClaimed)return;
  if(!session){await connect();return;}
  if(session.agentMode==='native'){
    await listen();
    if(taskId&&watchingTask!==taskId)void followTask(taskId).catch(recoverLater);
    status.textContent='Agent 通道已恢复；画布按工具调用连接';controls();return;
  }
  const bound=session,generation=connectionGeneration;
  const current=()=>session===bound&&!disposed&&!manualControl&&generation===connectionGeneration;
  try{
    await restoreKernelIfNeeded();
    const renewed=await rpc('heartbeat',{context:(await api().getState()).context,leaseEpoch:bound.leaseEpoch});
    if(!current())return;
    Object.assign(bound,renewed);lastHeartbeatAt=Date.now();knowledgeReady=Boolean(renewed.knowledgeReady&&renewed.knowledgeStatus?.workspaceReady);syncNativePush();void retryReports().catch(recoverLater);
    if(renewed.agentState)receiveAgentState(renewed.agentState);
    if(adapterLeaseEpoch!==bound.leaseEpoch){
      await retryReports();if(!current())return;
      if(adapter?.state().pending.length||rejectedCommands.size)throw Object.assign(new Error('原回执仍在同步，稍后会继续恢复'),{code:'cad_receipt_pending'});
      await adapter?.release();if(!current())return;
      adapter=await createSessionAdapter(bound);stream?.close();transportReady=false;
    }
    if(!bound.knowledgeReady){
      const receipt=await api().connect({toolIds:['getState'],includeContracts:true});
      const prepared=await rpc('prepare',{leaseEpoch:bound.leaseEpoch,receipt});
      if(!current())return;
      Object.assign(bound,prepared);knowledgeReady=Boolean(prepared.knowledgeReady);syncNativePush();
    }
    await listen();
    if(!current())return;
    if(bound.agentMode==='native'){
      const snapshot=await api().getState({compact:true});
      if(!current())return;
      await rpc('snapshot',{snapshot,leaseEpoch:bound.leaseEpoch});
    }
    if(!current())return;
    if(!bound.agentState||bound.agentState.alive||!bound.agentState.activeTaskId)agentOffline=false;
    status.textContent=taskId?'连接已恢复，继续处理原任务':'连接已恢复，已同步当前画布';controls();
    if(taskId&&watchingTask!==taskId)void followTask(taskId).catch(recoverLater);
  }catch(error){
    if(!current())return;
    if(['INSTANCE_MISMATCH','lease_revoked','cad_session_not_found'].includes(error.code)&&!taskId&&!pendingSend&&!adapter?.state().pending.length){await connect();return;}
    throw error;
  }
}
async function heartbeatTick(){
  if(heartbeatRunning||disposed||manualControl||!session||projectHandoffClaimed||recovery.exhausted())return;
  if(session.agentMode==='native'){
    // Task polling and the Agent event stream do not depend on the canvas.
    if(!stream||stream.readyState===2)try{await listen();}catch(error){recoverLater(error);}
    return;
  }
  // The authenticated SSE stream already renews the idle lease. Live CAD
  // reads refresh stale snapshots on demand; never poll the page just to think.
  if(session.agentMode==='native'&&!taskId&&!pendingSend&&!adapter?.state().pending.length&&!rejectedCommands.size&&![...retiredAdapters].some(item=>item.state().pending.length)&&knowledgeReady&&transportReady&&stream?.readyState===1)return;
  void projectOpener.poll(openJournal.read()?.sessionId||session.cadSessionId);
  heartbeatRunning=true;
  try{
    const bound=session;
    const renewed=await rpc('heartbeat',{context:(await api().getState()).context,leaseEpoch:bound.leaseEpoch});
    if(session!==bound||disposed||manualControl)return;
    Object.assign(bound,renewed);lastHeartbeatAt=Date.now();syncNativePush();
    if(renewed.agentState)receiveAgentState(renewed.agentState);
    if(adapterLeaseEpoch!==bound.leaseEpoch){await recoverConnection();return;}
    void retryReports().catch(recoverLater);
    if(!stream||stream.readyState===2)await listen();
    else if(stream.readyState===1){transportReady=true;recovery.reset();if(!taskId)status.textContent=idleStatus;controls();}
  }catch(error){recoverLater(error);}finally{heartbeatRunning=false;}
}
function message(role,text){const empty=messages.querySelector('.workbench-empty');if(empty)empty.remove();const element=document.createElement('div');element.className='message '+role;element.textContent=text;messages.append(element);messages.scrollTop=messages.scrollHeight;return element;}
function fileUrl(task,file,inline=false){return endpoint('download',{taskId:task,fileId:file.fileId,inline:String(inline)}).href;}
function renderTaskFiles(row,id,files){renderCadFiles(row,files,(file,inline)=>fileUrl(id,file,inline),workbench.createIcon);}
async function loadTaskFiles(id,userRow,agentRow){
  const files=await rpc('files',{}, {taskId:id});
  if(userRow)renderTaskFiles(userRow,id,files.uploads||[]);
  if(agentRow)renderTaskFiles(agentRow,id,files.outputs||[]);
}
const historyButton=document.createElement('button');historyButton.type='button';historyButton.className='icon-button';historyButton.title=historyButton.ariaLabel='历史对话';
historyButton.append(workbench.createIcon('history'));
document.querySelector('.assistant-heading nav').prepend(historyButton);
const newConversationButton=document.createElement('button');newConversationButton.type='button';newConversationButton.className='icon-button';newConversationButton.title=newConversationButton.ariaLabel='新建对话';
newConversationButton.innerHTML='<svg class="gl-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
document.querySelector('.assistant-heading nav').prepend(newConversationButton);
newConversationButton.addEventListener('click',async()=>{
  if(taskId||sending){message('system','请先完成或停止当前任务，再新建对话。');return;}
  if(pendingSend){
    // Preserve an uncertain send under its original identity; a new conversation
    // neither retries it nor reuses its key against a different conversation.
    try{recoveryStorage?.setItem('webcad.unresolved-send.'+pendingSend.key,JSON.stringify({cadSessionId:session?.cadSessionId,conversationId:session?.conversationId,key:pendingSend.key,taskId:pendingSend.draftTaskId||null}));}
    catch(error){message('system','原发送标识未能保留：'+error.message);return;}
    pendingSend=null;rememberedRecovery=null;recoveryJournal.write(null);
  }
  if(adapter?.state().pending.length){retiredAdapters.add(adapter);}
  try{desiredConversation=null;startNewConversation=true;await connect();messages.textContent='';attachments=[];attachmentPicker.clear();activeReply=null;message('system','已开始新对话（画布保留）');}
  catch(error){message('system','新建对话失败：'+error.message);}finally{startNewConversation=false;controls();}
});
const historyPanel=document.createElement('div');historyPanel.className='workbench-history';historyPanel.hidden=true;
historyPanel.innerHTML='<section class="workbench-history-panel" role="dialog" aria-modal="true" aria-label="CAD 历史对话"><div class="workbench-history-heading"><strong>CAD 历史对话</strong><button type="button" class="icon-button" aria-label="关闭历史对话">×</button></div><div class="workbench-history-list"></div><button type="button" class="workbench-history-more" hidden>加载更多</button></section>';
document.body.append(historyPanel);
historyPanel.querySelector('.icon-button').textContent='';historyPanel.querySelector('.icon-button').append(workbench.createIcon('close'));
const historyList=historyPanel.querySelector('.workbench-history-list'),historyMore=historyPanel.querySelector('.workbench-history-more');
function closeHistory(){historyPanel.hidden=true;historyButton.focus();}
historyPanel.querySelector('.icon-button').addEventListener('click',closeHistory);
historyPanel.addEventListener('click',event=>{if(event.target===historyPanel)closeHistory();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!historyPanel.hidden)closeHistory();});
async function fetchHistory(append=false){
  historyMore.disabled=true;
  try{const result=await rpc('history',{cursor:append?historyCursor:''});historyItems=append?historyItems.concat(result.items||[]):result.items||[];historyCursor=result.nextCursor;
    workbench.renderSessions(historyList,historyItems,item=>void selectHistory(item).catch(error=>message('system',error.message)));historyMore.hidden=!historyCursor;
  }catch(error){historyList.textContent=error.message;}finally{historyMore.disabled=false;}
}
historyButton.addEventListener('click',()=>{historyPanel.hidden=false;historyList.textContent='正在读取…';historyPanel.querySelector('.icon-button').focus();void fetchHistory();});
historyMore.addEventListener('click',()=>void fetchHistory(true));
async function selectHistory(item){
  if(taskId||sending||pendingSend)throw new Error('请先完成或停止当前任务，再载入历史。');
  historyButton.disabled=true;prompt.disabled=true;
  try{
    const pages=[];let cursor='';
    do{const page=await rpc('messages',{clientSessionId:item.clientSessionId,cursor});pages.unshift(page.items||[]);cursor=page.nextCursor||'';}while(cursor);
    // Let an in-flight connection settle first so it cannot bind a different
    // conversation while the chosen history is shown.
    while(connectOperation)await connectOperation.catch(()=>{});
    const chosen=item.clientSessionId.replace(/^webcad-/,'');
    if(session)await rpc('release');
    if(adapter?.state().pending.length)retiredAdapters.add(adapter);
    void Promise.resolve(adapter?.release()).catch(()=>{});stream?.close();clearInterval(heartbeat);stopNativePush();session=null;knowledgeReady=false;transportReady=false;
    desiredConversation=chosen;explicitConversation=true;
    try{await connect();}finally{explicitConversation=false;}
    if(session?.conversationId!==chosen)throw new Error('未能载入所选历史对话，请重试。');
    messages.textContent='';attachments=[];attachmentPicker.clear();activeReply=null;
    for(const entry of pages.flat()){
      const row=message(entry.role==='assistant'?'agent':entry.role,entry.role==='user'?historyUserText(entry.content):entry.content);
      if(entry.role==='assistant')renderReply(row,entry.content);
      if(entry.role==='assistant')renderHistoricalTiming(row,entry);
      const files=(entry.files||[]).filter(file=>(file.kind||'upload')===(entry.role==='user'?'upload':'output'));renderTaskFiles(row,entry.taskId,files);
    }
    message('system','已载入历史对话，当前画布保留。Agent 可按需读取本会话过程文件。');closeHistory();
  }finally{historyButton.disabled=false;controls();}
}
function robotActivityDetail(){
  if(taskId||sending||pendingSend){const id=taskId||pendingSend?.key||'sending';if(robotProgress.taskId!==id)robotProgress={taskId:id,status:'running',phase:'waiting',startedAt:new Date().toISOString(),entries:[]};}
  return {...robotProgress,entries:[...robotProgress.entries]};
}
function recordRobotText(value){
  const text=String(value||'').replace(/\s+/g,' ').trim().slice(0,180);
  if(text&&(taskId||sending||pendingSend)){robotActivityDetail();robotProgress.entries=[...robotProgress.entries.filter(item=>item!==text),text].slice(-4);}
}
function syncHostControl(locked){
  const activityDetail=robotActivityDetail();
  if(bridge){void bridge.setHost({locked,connected:Boolean(!agentOffline&&!manualControl&&session&&knowledgeReady&&transportReady),conversation:Boolean(session&&!agentOffline),agent:agentOffline?'offline':'online',activity:taskId||sending||pendingSend?'thinking':'idle',activityDetail}).catch(()=>{});return true;}
  const host=frame.contentWindow.webcad?.hostControl;
  if(host?.set){host.set({locked,connected:Boolean(!agentOffline&&!manualControl&&session&&knowledgeReady&&transportReady)});frame.contentWindow.webcad.assistantPanel?.sync();return true;}
  return false;
}
const commandMenu=document.createElement('details');commandMenu.className='agent-command-menu';
const commandToggle=document.createElement('summary');commandToggle.title='对话命令';commandToggle.setAttribute('aria-label','对话命令');
commandToggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 6 6 6-6 6M13 18h6"/></svg>';
const commandList=document.createElement('div');commandList.className='agent-command-list';commandList.setAttribute('role','group');commandList.setAttribute('aria-label','选择对话命令');
for(const [command,label] of [['/compact','压缩上下文'],['/status','任务状态'],['/model','选择模型'],['/reasoning','推理强度'],['/new','新建对话'],['/help','命令帮助']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;
  const shortcut=document.createElement('small');shortcut.textContent=command;button.append(shortcut);
  button.dataset.command=command;
  commandList.append(button);
}
commandMenu.append(commandToggle,commandList);composerTools.prepend(commandMenu);
AgentComposer.bindCommands(commandMenu,command=>{prompt.value=command;document.getElementById('chat').requestSubmit();});
const taskControls=document.createElement('div');taskControls.className='task-controls';
document.getElementById('send').before(taskControls);
taskControls.append(document.getElementById('send'));
const composer=AgentComposer.create({
  input:prompt,button:document.getElementById('send'),container:composerTools,
  state:()=>({taskId,stopping,disabled:taskId?stopping:projectOpening||(connecting&&session?.agentMode!=='native')||sending||attaching||!modelSendReady()}),
  stop:stopTask,
  scope:()=>session?.conversationId+':'+documentKey(session?.binding),
  followup:text=>new Promise(resolve=>{if(pendingSend||adapter?.state().pending.length||manualControl||agentOffline){resolve(false);return;}void sendChat(text,resolve).then(()=>resolve(false));}),
  steer:async(text,id)=>{
    if(taskId!==id||stopping)throw Object.assign(new Error('原任务已结束或正在停止，文字已保留。'),{code:'task_not_running'});
    const wireText=await appendLocationDraft.resolve(text);
    if(taskId!==id||stopping)throw Object.assign(new Error('原任务已结束或正在停止，文字已保留。'),{code:'task_not_running'});
    let settle;
    const delivery={taskId:id,done:new Promise(resolve=>{settle=resolve;})};steeringDelivery=delivery;
    try{await rpc('steer',{message:wireText},{taskId:id});continueReplyAfterMessage(id,text);}
    finally{settle();if(steeringDelivery===delivery)steeringDelivery=null;}
  },
  onError:error=>message('system',error.message||'追加失败，文字已保留。')
});
function updateSendControl(){
  composer.refresh();
}
function handleChatCommand(text){
  if(!/^\/[a-z]+(?:\s|$)/i.test(text))return false;
  const command=text.split(/\s/)[0].toLowerCase();
  if(command==='/compact'){if(!taskId)return false;message('system','请先完成或停止当前任务，再压缩上下文。');return true;}
  if(command==='/stop')void stopTask();
  else if(command==='/status')message('system',taskId?'任务运行中：'+taskId:(status.textContent||'当前空闲'));
  else if(command==='/new')newConversationButton.click();
  else if(command==='/model'||command==='/reasoning'){if(taskId)message('system','请在下一次任务开始前调整模型和推理强度。');else(command==='/model'?modelSelect:effortSelect).focus();}
  else message('system','/compact 压缩上下文；/status 任务状态；/stop 停止；/new 新对话；/model 模型；/reasoning 推理强度；/help 帮助。运行中发送文字先暂存，点击上方小箭头追加引导；空输入时点击停止。');
  prompt.value='';updateSendControl();return true;
}
function controls(){
  rememberRecovery();
  const pending=adapter?.state().pending.length || 0, locked=Boolean(taskId||pendingSend||projectOpening);
  const held=Boolean(adapter?.state().editing)&&!manualControl,viewOnly=syncHostControl(held);
  const lockSurface=viewOnly?frame.contentDocument?.querySelector('.canvas-panel'):document.querySelector('.viewport');
  if(lockSurface&&editLock.parentElement!==lockSurface)lockSurface.append(editLock);
  editLock.classList.toggle('agent-control-overlay',viewOnly);
  frame.inert=held&&!viewOnly;editLock.hidden=!held||overlayDismissed;
  if(held&&!viewOnly)frame.contentDocument?.activeElement?.blur();
  document.getElementById('attachments').disabled=locked||attaching;
  modelSelect.disabled=locked||modelSelect.dataset.ready!=='true';effortSelect.disabled=locked;
  modelRefresh.disabled=modelListLoading||sending||Boolean(taskId);
  document.getElementById('attachment-status').setAttribute('aria-busy',String(attaching));
  for(const button of document.querySelectorAll('#attachment-status button'))button.disabled=locked||attaching;
  updateSendControl();
  prompt.placeholder=taskId?'补充要求；发送后可在上方追加到当前任务':'输入工作要求';
  prompt.disabled=false;
  document.getElementById('reconnect').disabled=connecting||Boolean(canvasConnection);
  historyButton.disabled=Boolean(taskId||pendingSend||sending)||connecting||attaching;
  newConversationButton.disabled=connecting||attaching||projectOpening;
  newConversationButton.title=taskId||sending?'请先完成或停止当前任务，再新建对话。':'新建对话';
  dismissLock.disabled=held&&!viewOnly;
  document.getElementById('connection').textContent='Agent：'+(config.agentTarget||'已配置目标')+(agentOffline?' · 助手已断开':connecting?' · 正在准备':session&&transportReady&&!manualControl?' · 已连接':session&&!manualControl?' · 通道恢复中':' · 未连接');
  updateConnectionIndicator();
  if(!held)overlayDismissed=false;
}
function updateConnectionIndicator(){
  const indicator=document.getElementById('connection');
  indicator.title=indicator.ariaLabel=indicator.textContent+'\n'+status.textContent+(lastHeartbeatAt?'\n最近连接确认：'+new Date(lastHeartbeatAt).toLocaleTimeString():'');
  indicator.dataset.state=agentOffline?'error':connecting?'preparing':session&&transportReady&&!manualControl?'ready':session&&!manualControl?'preparing':/失败|未就绪|需要更新/.test(status.textContent)?'error':'offline';
  status.hidden=indicator.dataset.state==='ready'&&!/失败|错误|未就绪|需要更新|无法|超时/.test(status.textContent);
  document.getElementById('reconnect').hidden=indicator.dataset.state==='ready';
  document.getElementById('takeover').hidden=!session||manualControl;
}
if(typeof MutationObserver!=='undefined')new MutationObserver(updateConnectionIndicator).observe(status,{childList:true});
function createReply(){
  const row=message('agent',''),body=document.createElement('div'),activity=document.createElement('div'),label=document.createElement('div'),details=document.createElement('div');
  activity.className='activity';activity.dataset.running='true';label.className='activity-label';label.textContent='等待模型响应';details.className='activity-details';activity.append(label,details);row.append(activity,body);
  const audit=createTurnAudit(row);
  return {row,body,activity,label,details,...audit,stepItems:new Map(),clockSkew:null,turnDurationMs:null,turnStartedAt:null,turnRunning:true,answerPrefix:'',rawText:''};
}
function continuationText(text,prefix){return prefix&&text.startsWith(prefix)?text.slice(prefix.length).trimStart():text===prefix?'':text;}
function continueReplyAfterMessage(id,text){
  const previous=activeReply;
  message('user',text);
  if(taskId!==id||!previous)return;
  previous.turnRunning=false;finishProgress(previous);renderReply(previous.body,previous.rawText||previous.body.textContent);
  const next=createReply();
  next.answerPrefix=previous.answerPrefix+previous.rawText;
  next.taskId=id;next.observedTimeline=previous.observedTimeline;next.turnStartedAt=previous.turnStartedAt;
  previous.nextReply=next;activeReply=next;
}
function createTurnAudit(row){
  const totals=document.createElement('div'),timingFields={};
  totals.className='turn-breakdown-fields';totals.setAttribute('aria-label','本轮耗时拆分');
  for(const [key,label] of Object.entries({totalMs:'总耗时',modelWaitMs:'模型',toolExecutionMs:'工具',unclassifiedMs:'其他'})){
    const field=document.createElement('span');field.dataset.timing=key;field.textContent=key==='totalMs'?'待确认':label+' · 待确认';if(key!=='totalMs')totals.append(field);timingFields[key]={field,label};
  }
  const audit=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('div'),steps=document.createElement('div');
  summary.className='turn-duration';summary.setAttribute('aria-label','总耗时');
  summary.append(timingFields.totalMs.field);
  const timeline=document.createElement('div');timeline.className='turn-timeline';timeline.setAttribute('aria-label','连续运行时间轴');
  audit.className='turn-audit';content.className='turn-audit-content';steps.className='step-timings';content.append(totals,timeline,steps);audit.append(summary,content);row.append(audit);return {audit,summary,content,steps,timeline,timingFields};
}
function updateTurnDuration(reply,ms,breakdown){
  if(breakdown)reply.timingBreakdown=breakdown;
  const spans=reply.observedTimeline?.read(ms);
  const observed=spans?{version:1,complete:true,modelWaitMs:0,toolExecutionMs:0,unclassifiedMs:0}:null;
  if(observed)for(const span of spans)observed[span.phase==='tool'?'toolExecutionMs':['model','summary','reply'].includes(span.phase)?'modelWaitMs':'unclassifiedMs']+=span.endMs-span.startMs;
  const values=timingTotals(ms,reply.timingBreakdown||observed,reply.turnRunning===true);
  for(const [key,{field,label}] of Object.entries(reply.timingFields))field.textContent=key==='totalMs'?(Number.isFinite(values[key])?durationText(values[key]):'待确认'):label+' '+(Number.isFinite(values[key])?durationText(values[key]):'未记录');
  if(reply.observedTimeline){
    reply.timeline.replaceChildren(...reply.observedTimeline.read(values.totalMs).map(span=>{const line=document.createElement('div');line.textContent=(span.startMs/1000).toFixed(1)+'–'+(span.endMs/1000).toFixed(1)+'s '+timelineLabels[span.phase];return line;}));
  }
}
function renderStep(reply,event){
  if(!event.itemId||!event.stepKind)return;
  if(reply.clockSkew===null)reply.clockSkew=Date.now()-Date.parse(event.time);
  let step=reply.stepItems.get(event.itemId);
  if(!step){const row=document.createElement('div'),label=document.createElement('span'),duration=document.createElement('small'),audit=document.createElement('details'),summary=document.createElement('summary'),auditDetail=document.createElement('div');row.className='step-timing';audit.className='step-audit';summary.textContent='回执详情';auditDetail.className='step-audit-detail';audit.append(summary,auditDetail);row.append(label,duration,audit);reply.steps.append(row);step={row,label,duration,auditDetail};reply.stepItems.set(event.itemId,step);}
  Object.assign(step,{startedAt:event.startedAt,status:event.status||'unknown',durationMs:event.durationMs,sdkStatus:event.sdkStatus,commandStatus:event.commandStatus,operationStatus:event.operationStatus,commandId:event.commandId,receiptConfirmed:event.receiptConfirmed,errorCode:event.errorCode,reason:event.reason,recoveryAction:event.recoveryAction,resolutionStatus:event.resolutionStatus,recoveredByItemId:event.recoveredByItemId});step.label.textContent=event.stepLabel||event.text;
  step.row.dataset.itemId=event.itemId;step.row.dataset.commandId=event.commandId||'';
  updateStep(reply,step);
  if(step.commandId&&step.status==='completed'&&step.receiptConfirmed===true){
    for(const prior of reply.stepItems.values())if(prior!==step&&prior.commandId===step.commandId&&['unknown','pending_confirmation','pending','failed'].includes(prior.status)){
      prior.resolutionStatus='recovered';prior.recoveredByItemId=event.itemId;updateStep(reply,prior);
    }
  }
}
function updateStep(reply,step){
  const ms=step.durationMs??(step.startedAt?Date.now()-reply.clockSkew-Date.parse(step.startedAt):0);
  const labels={completed:'完成',failed:'失败',rejected:'已拒绝',canceled:'已停止',unknown:'待确认',pending_confirmation:'待确认',pending:'处理中',running:'处理中',partial:'部分完成'};
  step.duration.textContent=' '+(labels[step.status]||'待确认')+' · '+durationText(ms)+(step.resolutionStatus==='recovered'?' · 后续已恢复':'');
  step.row.dataset.status=step.status;
  const auditText=['记录 '+step.row.dataset.itemId,step.commandId&&'命令 '+step.commandId,step.operationStatus&&'业务回执 '+step.operationStatus,step.commandStatus&&'命令通道 '+step.commandStatus,step.sdkStatus&&'SDK '+step.sdkStatus,step.receiptConfirmed===true?'原回执已核对':step.receiptConfirmed===false?'原回执待核对':null,step.errorCode,step.reason,step.recoveryAction,step.recoveredByItemId&&'恢复记录 '+step.recoveredByItemId].filter(Boolean).join('\n');
  step.auditDetail.textContent=auditText;
  step.duration.style.color=['failed','rejected','partial'].includes(step.status)?'#b91c1c':'';
}
function renderHistoricalTiming(row,entry){
  if(!entry.stepTimings?.length&&!Number.isFinite(entry.turnDurationMs))return;
  const reply={row,...createTurnAudit(row),stepItems:new Map(),clockSkew:0};
  (entry.stepTimings||[]).forEach((step,index)=>renderStep(reply,{...step,itemId:step.itemId||'history-'+index,stepKind:step.stepKind||'tool',stepLabel:step.label,durationMs:step.ms,status:step.status||'unknown'}));
  updateTurnDuration(reply,entry.turnDurationMs,entry.timingBreakdown);
}
function updateRunningTurn(reply,task){
  const breakdown=task?.requestMetadata?.cadMetrics?.timingBreakdown;
  if(breakdown)reply.timingBreakdown=breakdown;
  if(!reply.turnStartedAt&&Number.isFinite(Date.parse(task?.startedAt)))reply.turnStartedAt=task.startedAt;
  if(reply.turnRunning&&reply.turnStartedAt)updateTurnDuration(reply,Math.max(0,Date.now()-Date.parse(reply.turnStartedAt)));
}
const stepClock=setInterval(()=>{if(taskId||sending||pendingSend)syncHostControl(Boolean(adapter?.state().editing)&&!manualControl);if(!activeReply)return;for(const step of activeReply.stepItems.values())if(step.status==='running'||step.status==='pending')updateStep(activeReply,step);updateRunningTurn(activeReply);},1000);
function progress(text,detail=''){
  recordRobotText(detail||text);
  if(!activeReply)return;activeReply.activity.hidden=false;
  if(activeReply.activity.dataset.running==='true')activeReply.label.textContent=text;
  if(detail)activeReply.details.append(document.createTextNode(detail));
}
function finishProgress(reply){
  reply.activity.dataset.running='false';reply.activity.hidden=!reply.details.textContent;
  reply.label.textContent='思考与执行过程';
  // Keep published progress available for review without competing with the answer.
  reply.content.prepend(reply.activity);reply.audit.open=false;
}
async function stopTask(){
  if(!taskId||stopping)return;composer.suppress(taskId);stopping=true;controls();
  try{await rpc('cancel',{}, {taskId});adapter.endTask(taskId);progress('正在停止，等待当前回执');}
  catch(error){message('system',error.message);stopping=false;}controls();
}
function api(){
  if(bridge)return bridge.api;
  const expected=new URL(config.pageUrl,location.href);
  const actual=new URL(frame.contentWindow.location.href);
  if(actual.origin!==location.origin || !actual.pathname.startsWith(expected.pathname))throw new Error('当前页面不是已授权的 WebCAD');
  const current=frame.contentWindow.webcad?.api;
  if(!current?.connect)throw Object.assign(new Error('WebCAD 页面 API 尚未就绪'),{code:'page_offline'});
  return current;
}
function announceReady(prepared){
  const knowledge=prepared.knowledgeStatus;
  if(!knowledge?.workspaceReady)throw new Error('Agent 服务需要升级工作目录准备接口');
  const key=(prepared.conversationId||prepared.cadSessionId)+':'+knowledge.catalogHash+':'+knowledge.docsHash;
  if(readinessAnnouncements.has(key))return;
  readinessAnnouncements.add(key);
  if(!messages.childNodes.length)workbench.renderEmpty(messages,'webcad',prompt);
}

async function upload(command,descriptor,bytes){
  const result=await uploadHostArtifact({bytes,descriptor,onProgress:value=>progress('正在传输附件（'+value.done+'/'+value.total+'）'),post:async(action,meta,data)=>{
    const extra={cadSessionId:command.cadSessionId,commandId:command.commandId,...meta};
    return gatewayFetch(window.fetch.bind(window),endpoint(action,extra),{method:'POST',credentials:'same-origin',headers:{'Content-Type':data?'application/octet-stream':'application/json','X-CSRF-Token':config.csrf,...(action==='artifact-upload-chunk'?{'X-Chunk-Sha256':meta.sha256}:{})},body:data||JSON.stringify({...meta,commandId:command.commandId})},60000);
  }});
  const row=activeReply?.row||message('agent','已生成文件：');
  const list=row._outputFiles||(row._outputFiles=[]);list.push({fileId:result.fileId,originalName:result.name,status:'ready'});renderTaskFiles(row,result.taskId,list);return result;
}

function listen(){
  if(listenOperation)return listenOperation;
  if(stream?.readyState===1&&transportReady)return Promise.resolve();
  listenOperation=openStream().finally(()=>{listenOperation=null;});return listenOperation;
}
async function openStream(){
  if(disposed || manualControl || !session)return;
  const bound=session;
  stream?.close();
  const ticket=await rpc('ticket');
  if(session!==bound||disposed||manualControl)return;
  const source=new EventSource(endpoint('events',{ticket:ticket.ticket,after:lastSeq}));stream=source;
  source.addEventListener('cad-event',event=>{
    if(stream!==source||manualControl)return;
    let value;
    try{value=JSON.parse(event.data);
    if(value.type==='command'){
      progress('使用工具：'+value.payload.method);
      let operation;
      try{operation=adapter.receive(value);}catch(error){
        // receive may throw before returning a Promise. Retain the rejection
        // before advancing the cursor, so the broker can read a real outcome.
        rejectedCommands.set(value.commandId,{command:value,sessionId:session.cadSessionId,result:{status:'failed',commitState:'not_committed',error:{code:error.code||'HOST_RECEIVE_FAILED',message:error.message}}});
        operation=retryReports();
      }
      lastSeq=Math.max(lastSeq,value.seq||0);
      rememberRecovery();
      Promise.resolve(operation).then(controls).catch(error=>{status.textContent='回执等待恢复：'+error.message;if(isTransportError(error))recoverLater(error);controls();});
      return;
    }
    lastSeq=Math.max(lastSeq,value.seq||0);
    rememberRecovery();
    if(value.type==='agent-state'){receiveAgentState(value);}
    else if(value.type==='project-open'){void projectOpener.poll(session.cadSessionId);}
    else if(value.type==='task-ended'){void Promise.resolve(adapter.endTask(value.taskId)).catch(recoverLater);controls();} // Persist a checkpoint once, after followTask observes the terminal task.
    else if(value.type==='tool-activity'){const detail=toolActivityText(value,taskId);if(detail)progress('正在查阅工具',detail);}
    else if(value.type==='recover-connection'){void connectCanvas().catch(error=>{status.textContent='画布工具连接失败：'+(error.code||'CAD_UNAVAILABLE')+' · '+error.message;controls();});}
    else if(value.type==='task-outcome'){idleStatus=cadOutcomeText(value);if(!taskId)status.textContent=idleStatus;controls();}
    else if(value.type==='release'){adapter.release();knowledgeReady=false;transportReady=false;recovery.reset();status.textContent='控制已释放';controls();}
    }catch(error){status.textContent='事件处理失败，可接管编辑：'+error.message;controls();}
  });
  source.addEventListener('agent-state',event=>{if(stream===source&&session===bound&&!manualControl)try{receiveAgentState(JSON.parse(event.data));}catch{}});
  await new Promise((resolve,reject)=>{
    let opened=false;
    const failed=()=>{
      source.close();clearTimeout(timeout);
      const error=Object.assign(new Error('事件连接中断'),{code:'stream_unavailable'});
      if(!opened)reject(error);
      if(!disposed&&stream===source)recoverLater(error);
    };
    const timeout=setTimeout(failed,35000);
    source.onerror=failed;
    source.onopen=()=>{
      clearTimeout(timeout);
      if(session!==bound||disposed||manualControl){source.close();resolve();return;}
      opened=true;lastAgentSignalAt=Date.now();transportReady=true;recovery.reset();
      status.textContent=taskId?'任务进行中':idleStatus;controls();
      retryReports().catch(recoverLater);resolve();
    };
  });
}

function retryReports(){
  if(reportOperation)return reportOperation;
  reportOperation=flushReports().finally(()=>{reportOperation=null;});return reportOperation;
}
async function flushReports(){
  const results=await settleIndependent([
    ()=>adapter?.retryReports(),
    ...[...retiredAdapters].map(previous=>async()=>{await previous.retryReports();if(!previous.state().pending.length)retiredAdapters.delete(previous);}),
    ...[...rejectedCommands].map(([id,entry])=>async()=>{await rpc('result',{requestHash:entry.command.requestHash,result:entry.result},{commandId:id,cadSessionId:entry.sessionId});if(rejectedCommands.get(id)===entry)rejectedCommands.delete(id);})
  ]);
  const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
}

function connect(){
  if(connectOperation)return connectOperation;
  connectOperation=prepareConnection().finally(()=>{connectOperation=null;});return connectOperation;
}
async function createSessionAdapter(bound){
  const created=await createHostAdapter({api:api(),session:bound,onStateChange:controls,report:reportAdapter,artifact:upload});
  adapterLeaseEpoch=bound.leaseEpoch;return created;
}
async function reportAdapter(kind,command,body){
  const packet=nativeState.read(),context=body.result?.context;
  const stateUpdate=kind==='result'&&session?.cadSessionId===command.cadSessionId&&packet&&(session.stateProtocols||[session.stateProtocol]).includes(packet.protocol)&&context&&['sessionId','documentId','documentInstanceId','revision'].every(key=>packet.snapshot.context[key]===context[key])?packet:null;
  const result=await rpc(kind,{requestHash:command.requestHash,...body,...(stateUpdate?{stateUpdate}:{})},{commandId:command.commandId,cadSessionId:command.cadSessionId});
  if(kind==='result'&&session?.cadSessionId===command.cadSessionId&&session.agentMode==='native')void nativeState.refresh().catch(recoverLater);
  return result;
}
async function prepareConnection(){
  const generation=connectionGeneration;
  const stillCurrent=()=>{if(generation!==connectionGeneration||disposed)throw Object.assign(new Error('Agent 已退出，连接已取消'),{code:'lease_revoked'});};
  if(taskId){await listen();await followTask(taskId);return;}
  connecting=true;knowledgeReady=false;controls();
  try{
  if(await reconcileRememberedTask())return;
  if(nativeConversationSupported&&(!session||session.agentMode==='native')){
    if(!session||startNewConversation){
      const previous=session;
      let attached;
      try{attached=await rpc('attach',{dialogueOnly:true,nativeHost:true,conversationId:desiredConversation,...(startNewConversation?{newConversation:true}:{})});}
      catch(error){if(error.code==='invalid_request'&&/Unbound conversations require/.test(error.message)){nativeConversationSupported=false;return await prepareConnection();}throw error;}
      stillCurrent();
      if(previous){void rpc('release',{}, {cadSessionId:previous.cadSessionId}).catch(error=>message('system','原工具通道释放待确认：'+error.message));void Promise.resolve(adapter?.release()).catch(()=>{});}
      stream?.close();clearInterval(heartbeat);stopNativePush();lastSeq=0;
      session=attached;desiredConversation=attached.conversationId;
      adapter={state:()=>({pending:[],accepting:false,editing:false}),endTask:async()=>{},release:()=>{},retryReports:async()=>{}};
      manualControl=false;transportReady=false;
      heartbeat=setInterval(heartbeatTick,10000);
    }
    // Only the Agent service is required to create/continue a conversation.
    // The optional canvas stream must not delay a send either.
    void listen().catch(recoverLater);
    status.textContent='Agent 已就绪；画布按工具调用连接';return;
  }
  await restoreKernelIfNeeded();
  const current=api(), state=await current.getState();
  if(state.summary?.busy || !state.summary?.kernelReady || state.preview?.active || state.preview?.computing)throw new Error('请先完成当前计算或预览');
  if(!startNewConversation&&session&&!manualControl&&(!desiredConversation||desiredConversation===session.conversationId)&&adapter?.state().accepting&&['sessionId','documentId','documentInstanceId'].every(key=>session.binding?.[key]===state.context[key])){
    try{
      const renewed=await rpc('heartbeat',{context:state.context,leaseEpoch:session.leaseEpoch});
      const receipt=await current.connect({toolIds:['getState','resolvePlacement'],includeContracts:true});
      const prepared=await rpc('prepare',{leaseEpoch:session.leaseEpoch,receipt});
      if(!prepared.knowledgeReady)throw new Error('知识库或工具契约尚未校验完成');
      announceReady(prepared);
      Object.assign(session,renewed,prepared);knowledgeReady=true;syncNativePush();
      if(!stream||stream.readyState===2)await listen();
      status.textContent=prepared.knowledgeStatus?.cacheHit?'绘图工具已就绪，已复用本地版本':'绘图工具已就绪，已更新本地版本';return;
    }catch(error){
      if(!['INSTANCE_MISMATCH','lease_revoked','cad_session_not_found'].includes(error.code))throw error;
    }
  }
  if(!manualControl&&(pendingSend || adapter?.state().pending.length))throw new Error('原请求结果未确认，请等待原连接恢复或接管编辑；不会重放原操作');
  if(session){await rpc('release');adapter?.release();}
  for(const id of detachedSessions){await rpc('release',{}, {cadSessionId:id});detachedSessions.delete(id);}
  session=null;transportReady=false;stream?.close();clearInterval(heartbeat);stopNativePush();lastSeq=0;
  // UP-01/06/34: a conversation belongs to the document it was attached for.
  // Opening another project starts a new conversation; the Agent ownership
  // check stays strict and an explicit history choice is never replaced.
  const plan=planConversation({desiredConversation,conversationDocument,context:state.context,explicit:explicitConversation,startNew:startNewConversation});
  const hostFlags=nativeSupported(current)?{nativeHost:true}:{};
  let switchNotice=plan.switched?(plan.reopened?PROJECT_REOPEN_NOTICE:PROJECT_SWITCH_NOTICE):null,attached;
  try{attached=await rpc('attach',{context:state.context,conversationId:plan.conversationId,...(plan.newConversation?{newConversation:true}:{}),...hostFlags});}
  catch(error){
    if(!plan.conversationId||plan.explicit||!isForeignConversationError(error))throw error;
    attached=await rpc('attach',{context:state.context,conversationId:null,newConversation:true,...hostFlags});
    switchNotice=FOREIGN_CONVERSATION_NOTICE;
  }
  if(generation!==connectionGeneration||disposed){await rpc('release',{}, {cadSessionId:attached.cadSessionId});stillCurrent();}
  session=attached;desiredConversation=session.conversationId;conversationDocument=documentKey(state.context);
  if(session.activeTaskId){taskId=session.activeTaskId;pendingSend=null;}
  if(switchNotice){messages.textContent='';attachments=[];attachmentPicker.clear();activeReply=null;idleStatus='就绪';message('system',switchNotice);}
  const attachedSession=session;
  adapter=await createSessionAdapter(attachedSession);
  stillCurrent();manualControl=false;
  heartbeat=setInterval(heartbeatTick,10000);
  status.textContent='握手已完成，正在核对本地绘图工具版本…';controls();
  const receipt=await current.connect({toolIds:['getState','resolvePlacement'],includeContracts:true});
  if(!receipt.canExecute)throw new Error('当前工程尚不能操作：'+(receipt.blockers||[]).join('、'));
  const prepared=await rpc('prepare',{leaseEpoch:session.leaseEpoch,receipt});
  stillCurrent();if(session!==attachedSession)throw new Error('连接已变更，请重新连接');
  if(!prepared.knowledgeReady||prepared.knowledgeStatus?.status!=='ready')throw new Error('知识库或工具契约尚未校验完成');
  Object.assign(session,prepared);
  knowledgeReady=true;
  await listen();syncNativePush();announceReady(prepared);status.textContent=prepared.knowledgeStatus?.cacheHit?'绘图工具已就绪，已复用本地版本':'绘图工具已就绪，已更新本地版本';status.title='WebCAD 构建：'+(receipt.buildId||'当前构建');
  if(taskId&&watchingTask!==taskId)void followTask(taskId).catch(recoverLater);
  }catch(error){
    knowledgeReady=false;
    if(!session&&!rememberedRecovery&&!manualControl&&!disposed&&generation===connectionGeneration&&['page_offline','AGENT_PAGE_TIMEOUT'].includes(error.code)){
      const unbound=await rpc('attach',{dialogueOnly:true,nativeHost:true,newConversation:true});
      stillCurrent();session=unbound;desiredConversation=unbound.conversationId;
      adapter={state:()=>({pending:[],accepting:false,editing:false}),endTask:async()=>{},release:()=>{},retryReports:async()=>{}};
      status.textContent='可以对话；读取或修改工程前请连接 CAD 页面。';return;
    }
    status.textContent='连接未就绪：'+error.message;if(isTransportError(error))recoverLater(error);throw error;
  }
  finally{connecting=false;controls();}
}

async function followTask(id){
  if(watchingTask===id)return;watchingTask=id;
  let after=0,reply=createReply();reply.taskId=id;activeReply=reply;
  try{
  while(taskId===id && !disposed){
    let history,task;
    try{[history,task]=await Promise.all([rpc('task-events',{}, {taskId:id,after}),rpc('task',{}, {taskId:id})]);}
    catch(error){
      if(taskId!==id||disposed)return;
      recoverLater(error);
      // Keep the original task handle, but stop authenticated polling until an
      // explicit reconnect resumes this same task after formal sign-in.
      if(error?.code==='login_required'||[401,403].includes(error?.status))return;
      if(recovery.exhausted())return;
      await new Promise(resolve=>setTimeout(resolve,3000));continue;
    }
    after=history.nextAfter;
    if(taskId!==id||disposed)return;
    if(steeringDelivery?.taskId===id)await steeringDelivery.done;
    if(taskId!==id||disposed)return;
    // A confirmed steering message starts the next visual response segment.
    while(reply.nextReply)reply=reply.nextReply;
    if(!reply.observedTimeline&&task.startedAt)reply.observedTimeline=createTurnTimeline(task.startedAt);
    robotActivityDetail();robotProgress.startedAt=task.startedAt||robotProgress.startedAt;
    for(const event of history.events||[]){
      reply.observedTimeline?.observe(event);
      renderStep(reply,event);
      if(event.stepKind==='tool')recordRobotText(event.stepLabel||'正在使用工具');
      if(event.turnDurationMs!==null&&event.turnDurationMs!==undefined){reply.turnDurationMs=event.turnDurationMs;updateTurnDuration(reply,event.turnDurationMs);}
      if(event.type==='error')reply.error=String(event.text||'');
      if(event.type==='agent'){
        if(event.text&&event.isFinal&&reply.activity.dataset.running==='true')finishProgress(reply);
        reply.rawText=event.isDelta?reply.rawText+event.text:event.isFinal?continuationText(event.text,reply.answerPrefix):reply.rawText;
        reply.body.textContent=reply.rawText;
      }
      else if(event.type==='tool')progress('正在处理');
      else if(event.type==='reasoning'){
        // Show published plans/commentary and summary events, never raw reasoning deltas.
        progress('正在思考',publicProgressText(event));
      }
    }
    if(messages.scrollHeight-messages.scrollTop-messages.clientHeight<180)messages.scrollTop=messages.scrollHeight;
    updateRunningTurn(reply,task);
    robotProgress.phase=reply.observedTimeline?.read(Math.max(0,Date.now()-Date.parse(robotProgress.startedAt))).at(-1)?.phase||'waiting';
    if(['completed','failed','canceled'].includes(task.status)){
      reply.turnRunning=false;
      for(const step of reply.stepItems.values())if(step.status==='running'||step.status==='pending'){if(!step.operationStatus)step.status='unknown';updateStep(reply,step);}
      // Preserve the existing duration source and fallback; concurrent steps are never summed.
      updateTurnDuration(reply,reply.turnDurationMs??Math.max(0,Date.parse(task.completedAt)-Date.parse(task.startedAt)));
      renderReply(reply.body,continuationText(task.finalResponse||'',reply.answerPrefix) || reply.rawText || (task.status==='canceled'?'任务已停止':'任务结束'));finishProgress(reply);
      if(task.status==='failed'&&!task.finalResponse)renderReply(reply.body,task.error||'任务失败，已保留当前工程，请核对原回执后继续。');
      if(['agent_idle_timeout','agent_hard_timeout','agent_disconnected','upstream_stream_disconnected'].includes(task.errorCode)){
        markAgentOffline();
        void Promise.resolve().then(()=>api().getState()).then(state=>{
          reply.row.dataset.observedRevision=String(state.context.revision);
          if(task.cadOutcome?.pendingCommandIds?.length)message('system','原工具回执待核对；当前画布修订 r'+state.context.revision+'。请勿重复提交原操作。');
        }).catch(()=>{});
      }
      const ended=Promise.resolve(adapter.endTask(id));
      robotProgress={...robotProgress,status:task.status,phase:'finished',finishedAt:task.completedAt||new Date().toISOString()};
      taskId=null;pendingSend=null;stopping=false;sending=false;idleStatus=cadOutcomeText(task);status.textContent=idleStatus;controls();
      // Terminal state is persisted by the service before this branch. Optional
      // file presentation and checkpoint transfer must not hold the composer.
      if(activeReply===reply)activeReply=null;
      if(watchingTask===id)watchingTask=null;
      composer.finished(id,task.status);
      if(!session?.dialogueOnly&&task.cadOutcome?.status!=='not_executed')void ended.then(()=>projectStorage.checkpoint(id)).catch(error=>message('system','本轮工程暂存未完成：'+error.message));
      void loadTaskFiles(id,null,reply.row).catch(error=>message('system','附件列表读取失败：'+error.message));
      void projectOpener.poll(openJournal.read()?.sessionId||session?.cadSessionId);
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  }finally{reply.turnRunning=false;if(watchingTask===id)watchingTask=null;if(activeReply===reply){finishProgress(reply);activeReply=null;}}
}

async function prepareTaskBinding(){
  preparedSendState=null;
  if(!session)await connect();
  const original=session;
  if(original?.agentMode==='native'){
    if(disposed||manualControl)throw Object.assign(Error('对话已主动退出'),{code:'lease_revoked'});
    // Reuse only an already-confirmed mirror; never probe or connect a canvas
    // merely to submit a message or let the Agent diagnose an offline tool.
    if(!original.dialogueOnly&&nativeState.confirmed())preparedSendState=nativeState.read();
    return original;
  }
  if(original?.dialogueOnly){if(disposed||manualControl)throw Object.assign(Error('对话已主动退出'),{code:'lease_revoked'});return original;}
  if(original?.agentMode!=='native'){
    if(!pendingSend&&!adapter?.state().pending.length&&documentChanged((await api().getState()).context,session.binding))await connect();
    const bound=session;
    let renewed;
    try{renewed=await rpc('heartbeat',{context:(await api().getState()).context,leaseEpoch:bound.leaseEpoch});}
    catch(error){recoverLater(error);renewed=bound;}
    if(session!==bound||disposed||manualControl)throw new Error('页面连接已改变，请核对当前工程后重试');
    Object.assign(bound,renewed);lastHeartbeatAt=Date.now();syncNativePush();return bound;
  }
}

async function sendChat(override,onAccepted){
  const automatic=typeof override==='string',text=automatic?override:prompt.value.trim();if(!automatic&&handleChatCommand(text))return;
  if(composer.intercept(true))return;
  if(!text||sending||(connecting&&session?.agentMode!=='native')||projectOpening)return;
  sending=true;controls();
  try{
    await attachmentPicker.ready();
    if(!modelSendReady())throw Object.assign(new Error('请先选择当前列表中的可用模型。'),{code:'MODEL_SELECTION_REQUIRED'});
    const bound=await prepareTaskBinding();
    if(pendingSend && pendingSend.message!==text)throw new Error('请先重试原请求，确认原任务结果后再发送新指令');
    const attachmentKeys=attachments.map(attachmentIdentity);
    if(pendingSend?.attachmentKeys&&JSON.stringify(pendingSend.attachmentKeys)!==JSON.stringify(attachmentKeys))throw new Error('附件内容已变化，请先停止或核对原任务，再发送新请求');
    if(!pendingSend&&!modelSendReady())throw Object.assign(new Error('请先选择当前列表中的可用模型。'),{code:'MODEL_SELECTION_REQUIRED'});
    const wireText=pendingSend?null:await appendLocationDraft.resolve(text);
    if(!pendingSend)pendingSend={message:text,wireMessage:(bound.agentMode==='native'?wireText:guidanceFor(bound)+'\n\n【当前用户请求】\n'+wireText)+(attachments.length?'\n\n本轮用户附件（发送后原件在本任务 input 中；resourceId 仅在画布登记成功时存在，不是磁盘路径）：\n'+JSON.stringify(attachments.map(({resourceId,name,size,kind})=>({resourceId,name,size,kind}))):''),reasoningEffort:['low','medium','high'][Number(document.getElementById('effort').value)],key:crypto.randomUUID(),autoStart:attachments.length===0};
    pendingSend.attachmentKeys??=attachmentKeys;
    if(!Object.hasOwn(pendingSend,'cadState'))pendingSend.cadState=preparedSendState&&(bound.stateProtocols||[bound.stateProtocol]).includes(preparedSendState.protocol)?preparedSendState:null;
    controls();if(!pendingSend.model)pendingSend.model=modelSelect.value;const created=await rpc('send',{message:pendingSend.wireMessage,reasoningEffort:pendingSend.reasoningEffort,model:pendingSend.model,autoStart:pendingSend.autoStart===true,...(pendingSend.cadState?{cadState:pendingSend.cadState}:{})},{},{'Idempotency-Key':pendingSend.key});
    pendingSend.draftTaskId=created.taskId;
    const hasAttachments=attachments.length>0;
    const existing=hasAttachments?await rpc('files',{}, {taskId:created.taskId}):{uploads:[]};
    const readyFiles=(existing.uploads||[]).filter(file=>file.status==='ready'),uploaded=new Set(readyFiles.map(attachmentIdentity));
    for(const attachment of attachments){
      if(uploaded.has(attachmentIdentity(attachment)))continue;
      if(readyFiles.some(file=>file.originalName===attachment.name))throw Object.assign(new Error('原任务存在同名不同内容的附件，请先核对原任务'),{code:'ATTACHMENT_CONTENT_CHANGED',attachmentName:attachment.name});
      try{await gatewayFetch(window.fetch.bind(window),endpoint('input',{taskId:created.taskId,name:attachment.name}),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-CSRF-Token':config.csrf},body:attachment.file},35000);}
      catch(error){error.attachmentName=attachment.name;error.code=error.code||'ATTACHMENT_UPLOAD_FAILED';throw error;}
    }
    if(!pendingSend.autoStart||created.status==='draft'){
      const started=await rpc('task',{}, {taskId:created.taskId});
      if(started.status==='draft')await rpc('start',{}, {taskId:created.taskId});
    }
    taskId=created.taskId;pendingSend=null;overlayDismissed=false;controls();const userRow=message('user',text);
    if(onAccepted)onAccepted(true);
    if(hasAttachments)try{await loadTaskFiles(taskId,userRow,null);}catch(error){message('system','附件列表读取失败：'+error.message);}
    attachments=[];attachmentPicker.clear();if(!automatic)prompt.value='';appendLocationDraft.clear();void followTask(taskId).catch(recoverLater);
  }catch(error){
    if(!taskId&&!pendingSend?.draftTaskId&&error.status>=400&&error.status<500&&![408,429].includes(error.status))pendingSend=null;
    if(['knowledge_required','KNOWLEDGE_HASH_DRIFT'].includes(error.code))knowledgeReady=false;
    if(isModelSelectionError(error)){
      message('agent',modelSelectionMessage(error,{taskKnown:Boolean(taskId||pendingSend?.draftTaskId),unresolved:Boolean(pendingSend)}));
      modelNotice.hidden=false;modelNoticeText.textContent=pendingSend||taskId?'请先核对原任务；刷新模型列表不会改变原请求或重发。':'请刷新模型列表并明确选择；当前输入和工程保留，不会自动重发。';
      if(error.code!=='MODEL_SELECTION_REQUIRED')void refreshModels();
    }else if(error.code==='STALE_REFERENCE')message('agent',error.message);
    else if(error.attachmentName)showAttachmentFailure(error);
    else message('agent','消息发送失败：'+(error.code||'SEND_FAILED')+' · '+error.message+'。输入和原请求标识已保留。');
    if(!isModelSelectionError(error)&&(isTransportError(error)||error.code==='page_offline'))recoverLater(error);
  }
  finally{sending=false;controls();if(!taskId)prompt.focus();}
}
document.getElementById('chat').addEventListener('submit',event=>{event.preventDefault();void sendChat();});
prompt.addEventListener('keydown',event=>{
  if(isMobileInput())return; // Native newline, including IME confirmation; only the send button submits.
  workbench.composerKey(event,()=>{if(prompt.value.trim()&&!document.getElementById('send').disabled)document.getElementById('chat').requestSubmit();});
});
prompt.title=isMobileInput()?'Enter 换行；点击发送按钮发送':'Enter 发送；Shift+Enter 换行（也支持 Alt+Enter）';
function showAttachmentFailure(error){
  const container=document.getElementById('attachment-status');container.dataset.state='failed';container.hidden=false;
  for(const chip of container.querySelectorAll('.attachment')){chip.style.borderColor='#b91c1c';chip.style.color='#b91c1c';chip.title=error.message;}
  const hint=document.createElement('div');hint.setAttribute('role','alert');hint.style.color='#b91c1c';hint.textContent='附件失败：'+(error.code||'ATTACHMENT_FAILED')+' · '+error.message+'。请重新选择附件后重试。';container.append(hint);message('system',hint.textContent);
}
async function acceptFiles(files){
  if(taskId||pendingSend||sending||attaching||projectOpening)throw Object.assign(new Error('当前消息正在发送或处理，请稍后添加附件。'),{code:'ATTACHMENT_HOST_BUSY'});
  attaching=true;controls();
  try{
    workbench.validateFiles(files,{mode:'webcad'});
    const bound=session;
    const registered=[];
    for(const file of files){
      if(!file.size)throw Object.assign(Error('附件为空：'+file.name),{code:'EMPTY_ATTACHMENT',attachmentName:file.name});
      const bytes=await file.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      let resourceId;
      if(knowledgeReady){try{const resource=await api().files.register({name:file.name,data:bridge?new Uint8Array(bytes):new frame.contentWindow.Uint8Array(bytes),mime:file.type||'application/octet-stream'});resourceId=resource.resourceId;}catch{/* The original still goes to the Agent; canvas registration is optional. */}}
      registered.push({resourceId,name:file.name,size:file.size,sha256,file,kind:/\.(svg|dxf|logo\.json)$/i.test(file.name)?'vector':'file'});
    }
    if(session!==bound||taskId||pendingSend||projectOpening)throw Object.assign(new Error('对话或消息已变化，请重新添加附件。'),{code:'ATTACHMENT_BINDING_CHANGED'});
    attachments=registered;
    document.getElementById('attachment-status').dataset.state='ready';
  }finally{attaching=false;controls();}
}
const attachmentPicker=workbench.bindAttachments(document.getElementById('attachments'),document.getElementById('attachment-status'),acceptFiles,showAttachmentFailure,{mode:'webcad'});
compactUploadNames(document.getElementById('attachment-status'));
async function attachmentHostSnapshot(){
  return {cadSessionId:session?.cadSessionId,leaseEpoch:session?.leaseEpoch,context:session?.binding||{},
    ready:Boolean(!disposed&&!manualControl&&!connecting),
    active:Boolean(taskId||pendingSend||sending||attaching||projectOpening),busy:false,preview:false};
}
const byteAttachments=createAttachmentBytesAPI({snapshot:attachmentHostSnapshot,validate:files=>workbench.validateFiles(files,{mode:'webcad'}),
  accept:async(file,anchor)=>{
    await attachmentPicker.ready();
    const live=await attachmentHostSnapshot();
    if(!live.ready||live.active||live.busy||live.preview||live.cadSessionId!==anchor.cadSessionId||live.leaseEpoch!==anchor.leaseEpoch||['sessionId','documentId','documentInstanceId','revision'].some(key=>live.context[key]!==anchor[key]))throw Object.assign(new Error('当前工程或任务已变化，请重新读取附件入口状态。'),{code:'ATTACHMENT_BINDING_CHANGED'});
    await attachmentPicker.replace([...attachmentPicker.files(),file]);
    const result=attachments.find(item=>item.file===file);
    if(!result)throw Object.assign(new Error('附件尚未加入发送列表。'),{code:'ATTACHMENT_REGISTER_FAILED'});
    return result;
  }});
window.webcadWorkspace=Object.freeze({version:1,files:byteAttachments});
attachmentPicker.bindPaste(prompt);
document.getElementById('attachments').removeAttribute('accept');
document.getElementById('reconnect').addEventListener('click',async()=>{
  try{
    recovery.reset();
    await connectCanvas();
  }catch(error){recoverLater(error);}finally{controls();}
});
dismissLock.addEventListener('click',()=>{if(frame.contentWindow.webcad?.hostControl?.set){overlayDismissed=true;controls();}});
document.getElementById('effort').addEventListener('input',event=>{document.getElementById('effort-label').textContent=['快速','标准','深入'][Number(event.target.value)];});
async function takeover(){
  connectionGeneration++;
  const oldSession=session,oldTask=taskId,oldAdapter=adapter;
  // The user regains UI control before any network request. The CAD page's
  // own busy/revision checks still guard an uninterruptible kernel operation.
  manualControl=true;taskId=null;pendingSend=null;session=null;knowledgeReady=false;transportReady=false;stopping=false;initializationEpoch++;recovery.reset();
  if(activeReply)activeReply.activity.hidden=true;
  const localRelease=oldAdapter?.release();if(oldAdapter)retiredAdapters.add(oldAdapter);stream?.close();clearInterval(heartbeat);stopNativePush();
  if(oldSession)detachedSessions.add(oldSession.cadSessionId);
  status.textContent='已接管编辑，当前模型保留；原计算若仍运行，请等待内核完成';controls();
  const results=await Promise.allSettled([
    ...(oldTask?[rpc('cancel',{}, {taskId:oldTask,cadSessionId:oldSession?.cadSessionId})]:[]),
    ...(oldSession?[rpc('release',{}, {cadSessionId:oldSession.cadSessionId}).then(()=>detachedSessions.delete(oldSession.cadSessionId))]:[]),
    localRelease,oldAdapter?.retryReports()
  ]);
  if(results.some(x=>x.status==='rejected'))message('system','本地编辑已接管；服务端释放或回执仍待网络恢复。重新连接会核对释放，不会重跑旧步骤。');
  controls();
}
function showAssistant(show){if(show)setAssistantCollapsed(false);document.body.classList.toggle('agent-disconnected',!show);assistantLayout.sync();}
async function exitAssistant(){showAssistant(false);const releasing=takeover();if(bridge)await bridge.close();await releasing;return {status:'released',pendingRelease:detachedSessions.size>0};}
document.getElementById('takeover').addEventListener('click',()=>{if(bridge){void bridge.exit().catch(error=>message('system',error.message));return;}const panel=frame.contentWindow?.webcad?.assistantPanel;if(panel)void panel.exit();else void exitAssistant();});
// A controller-only update may attach to a live iframe without replacing the
// current document. This also exposes an explicit local recovery capability.
window.webcadWorkspaceHost=Object.freeze({takeover:exitAssistant,connect:async()=>{showAssistant(true);await connect();},getState:()=>({manualControl,knowledgeReady,transportReady,connecting,sessionId:session?.cadSessionId,conversationId:session?.conversationId||session?.cadSessionId,taskId,editing:Boolean(adapter?.state().editing),pending:adapter?.state().pending||[]})});
if(bridge)bridge.ready(async(method,args)=>{
  if(method==='project.storageError'){message('system','过程文件暂存失败：'+args.message);return;}
  if(method==='project.artifactReady')return projectStorage.stage(args);
  if(method==='composer.insertLocation')return insertLocationDraft(args);
  if(method==='panel.exit')return exitAssistant();
  if(method==='panel.connect'){showAssistant(true);await connect();return {status:'connected'};}
  if(method==='adapter.stateChanged'){controls();return;}
  if(method==='adapter.report'){const {kind,command,body}=args;return reportAdapter(kind,command,body);}
  if(method==='adapter.artifact')return upload(args.command,args.result,args.bytes);
  throw new Error('未知助手请求');
});
async function initializePage(){
  // Start the Agent independently of iframe loading, WASM and CAD recovery.
  try{if(!session)await connect();}catch(error){status.textContent='Agent 暂不可用：'+error.message;return;}
  const epoch=++initializationEpoch,timeout=Date.now()+60000;
  while(!disposed&&epoch===initializationEpoch&&Date.now()<timeout){
    try{
      const current=api();
      if(!bridge)frame.contentWindow.webcad?.assistantPanel?.bindExternal({enter:async()=>{showAssistant(true);await connect();},exit:exitAssistant,stageArtifact:descriptor=>projectStorage.stage(descriptor).catch(error=>message('system','过程文件暂存失败：'+error.message)),setTheme,insertLocation:insertLocationDraft,getLayout:()=>assistantLayout.get(),setLayout:input=>assistantLayout.set(input),getActivity:()=>taskId||sending||pendingSend?'thinking':'idle',getActivityDetail:robotActivityDetail,agentState:()=>agentOffline?'offline':'online'});
      // Prepare CAD and the unified knowledge cache before the first drawing
      // request, in the background of the independent conversation entrance.
      if(session?.agentMode==='native'&&!manualControl&&!taskId&&!pendingSend&&!knowledgeReady){
        const state=await current.getState();
        if(!state.summary?.kernelReady||state.summary.busy){await new Promise(resolve=>setTimeout(resolve,250));continue;}
        void connectCanvas().then(bound=>{announceReady(bound);if(!taskId)status.textContent=bound.knowledgeStatus?.cacheHit?'绘图能力已就绪，已复用完整知识包':'绘图能力已就绪，完整知识包已安装';controls();}).catch(error=>{status.textContent='绘图能力准备未完成：'+error.message+'；可继续对话';controls();});
      }
      return;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(epoch===initializationEpoch)status.textContent='画布尚未就绪；Agent 对话可继续';
}
if(!bridge)frame.addEventListener('load',()=>{
  if(session?.agentMode==='native'){
    knowledgeReady=false;stopNativePush();void Promise.resolve(adapter?.release()).catch(()=>{});
    status.textContent='画布页面已变化，Agent 对话继续；读取或修改工程时重新核对工具连接';controls();void initializePage();return;
  }
  attachments=[];knowledgeReady=false;transportReady=false;recovery.reset();adapter?.release();stream?.close();clearInterval(heartbeat);stopNativePush();controls();if(taskId){status.textContent='工程页面已改变，请先停止原任务再连接';return;}void initializePage();
});
if(!bridge&&!frame.contentWindow.webcad?.api)frame.src=config.pageUrl;
controls();
void refreshModels({initial:true});
void initializePage();
const projectOpenPoll=setInterval(()=>{if(!disposed&&!recovery.exhausted()&&(taskId||openJournal.read()))void projectOpener.poll(openJournal.read()?.sessionId||session?.cadSessionId);},10000);
if(openJournal.read())void projectOpener.poll(openJournal.read().sessionId);
window.addEventListener('pagehide',()=>clearInterval(projectOpenPoll));
function resumeLink(){if(session&&!manualControl&&!disposed&&!recovery.exhausted()&&navigator.onLine!==false){lastRecoveryProbeAt=Date.now();recovery.schedule(new Error('正在重新确认连接并同步画布'),{immediate:true});}}
window.addEventListener('online',resumeLink);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeLink();});
window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;if(session&&!manualControl){clearInterval(heartbeat);heartbeat=setInterval(heartbeatTick,10000);resumeLink();}}});
window.addEventListener('pagehide',event=>{stream?.close();clearInterval(heartbeat);stopNativePush();if(event.persisted)return;disposed=true;recovery.reset();adapter?.release();if(session)fetch(endpoint('release'),{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json','X-CSRF-Token':config.csrf},body:'{}'}).catch(()=>{});});
const workspaceMain=document.querySelector('main'), panelToggle=document.getElementById('assistant-panel-toggle');
const assistantLayout=createPanelLayout({root:workspaceMain,visible:()=>!assistantOnly&&!document.body.classList.contains('agent-disconnected'),collapsed:()=>workspaceMain.classList.contains('assistant-collapsed'),collapsedSize:()=>0,onCollapsed:setAssistantCollapsed,widthProperty:'--assistant-panel-width',heightProperty:'--assistant-panel-height'});
document.body.dataset.cadMobile=String(isMobileLayout());
function placePanelToggle(){
  const mobile=isMobileLayout();document.body.dataset.cadMobile=String(mobile);
  const inHeading=mobile&&!workspaceMain.classList.contains('assistant-collapsed');
  panelToggle.classList.toggle('icon-button',inHeading);
  (inHeading?document.querySelector('.assistant-heading nav'):workspaceMain).append(panelToggle);
}
// Tell the embedded overlay where the visible canvas ends without resizing it.
const notifyCanvasOcclusion=()=>{try{const height=(frame.contentWindow.document.querySelector('.app-header')?.getBoundingClientRect().bottom||52)+'px';if(workspaceMain.style.getPropertyValue('--cad-toolbar-height')!==height)workspaceMain.style.setProperty('--cad-toolbar-height',height);frame.contentWindow.dispatchEvent(new Event('webcad:viewport-occlusion'));}catch{}};
const occlusionObserver=new ResizeObserver(notifyCanvasOcclusion);
occlusionObserver.observe(document.getElementById('assistant-panel'));
new MutationObserver(notifyCanvasOcclusion).observe(workspaceMain,{attributes:true,attributeFilter:['class','style']});
window.addEventListener('resize',placePanelToggle);placePanelToggle();
function setAssistantCollapsed(collapsed){
  workspaceMain.classList.toggle('assistant-collapsed',collapsed);
  placePanelToggle();
  assistantLayout.sync();
  const label=collapsed?'展开 CAD 助手':'收起 CAD 助手';
  panelToggle.title=panelToggle.ariaLabel=label;panelToggle.setAttribute('aria-expanded',String(!collapsed));
  panelToggle.innerHTML=collapsed?'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 4v16M12 7l-6 5 6 5"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 4v16M12 7l6 5-6 5"/></svg>';
  if(!bridge)frame.contentWindow.webcad?.assistantPanel?.sync();
}
panelToggle.addEventListener('click',()=>setAssistantCollapsed(!workspaceMain.classList.contains('assistant-collapsed')));
setAssistantCollapsed(false);
