import {getMetalMaterials,loadMetalMaterials,setMetalMaterialRegistry,rememberMetalMaterials,validateMetalMaterials} from './metal-presets.js';
import {createLocationMarker} from './location-marker.js';
import {validateReliefDesigns,updateReliefDesigns} from './relief-design-drafts.js';
import {applyReliefDesignReference,readReliefDesignReference} from './relief-design-reference.js';
import {legacyReliefParams} from './relief-param-migration.js';
import {markTopologySemantics} from './legacy-topology-policy.js';
import {intentForUIParameterEdit} from './machining-intent.js';
import {saveCommittedProject} from './project-save.js';
import {loadMaterialSettings,validateMaterialSettings,rememberMaterialSettings,inheritBodyMaterials} from './material-density.js';
import {createHostAdapter} from './agent/host-adapter.js';
import {uploadChunked,uploadArtifact,createBrokerUploadClient} from './transfer/chunked-upload.js';
import {AGENT_CONTRACT} from './agent/protocol.js';
import {errorRecovery} from './error-recovery.js';
import '../public/automation/runtime-uuid.js';
import tbdCapabilities from '../contracts/services/v1/tbd-capabilities.json' with {type:'json'};
import {recordTimeline,restoreTimeline,timelineList,validateTimeline} from './document-timeline.js';
import {cloneAssetDocument} from './mesh/mesh-assets.js';
import {meshScale} from './mesh/mesh-contract.js';
import {attachExactSource} from './exact-source.js';
import {fileByteBudget} from './browser-file-contracts.js';
import {binaryHash} from './contracts/operation-schema.js';
import {heightfieldSamples} from './mesh/heightfield-relief.js';
import {decodeProject} from './project-container.js';
import {servicesClient} from './services/client.js';
import {getServicesConfig,serviceError} from './services/settings.js';
import {chooseExecutor,classifyComplexity,tbdForOperation,createExecutionHistory,EXECUTION_POLICY} from './services/execution-router.js';
import {showServicesWait} from './ui/forms/services-wait.js';
import {patternComplexity,aggregateSourceComplexity,collectRoutingSources,remotePlacementSupported,physicalExecutionKey} from './services/execution-context.js';
import {geometryFeatureRecord} from './services/geometry-signature.js';
import {compileRemoteFeature} from './services/remote-executor.js';
import {reliefDesignServicesPlan} from './services/relief-pipeline.js';
import {assertCompilableFeature,geometryRecipeFingerprint,installCompiledCandidate,compiledCheckpointBytes,compiledSemanticVersion,VERIFIED_NATIVE_KERNELS,LOCAL_KERNEL_BUILD_ID,GEOMETRY_CODEC,TRANSLATION_SEMANTIC_VERSION} from './services/geometry-exchange.js';
import {DOCUMENT_LIMITS,serializeBoundedDocument,assertDocumentCapacity} from './document-limits.js';
import {planBodyAlignment} from './modeling/interaction/align-bodies.js';
import {nextProjectName} from './project-name.js';
import {getQuickModelUsage,recordQuickModelUse} from './quick-model-usage.js';
import {quantizeModelParams} from './modeling/interaction/modeling-precision.js';
import { assertHistoryEditSafe } from './history-edit-safety.js';
import './style.css';
import './workspace-layout.css';
import './host-control.css';
import './agent/assistant-panel.css';
import './ui/styles/theme.css';
import './workspace-upgrade.css';
import {RENDER_QUALITIES} from './render-quality.js';
import { validateDisplayPreferences, saveDisplayPreferences } from './display-preferences.js';
import { createUI } from './ui.js';
import {createAssistantPanel} from './agent/assistant-panel.js';
import { referenceProfileNames } from './reference-profile-tools.js';
import { CADViewport } from './viewport.js';
import { QUICK_MODELS } from './quick-models.js';
import { createPageAPI } from './page-api.js';
import { inspectPrintabilityMesh } from './dfam-inspection.js';
import { inspectProfileModel } from './profile-inspection.js';
import { prepareAnalyticProfileEdit } from './profile-editing.js';
import {projectEdgeToProfile,projectPointToProfile} from './profile-projection.js';
import { FINISH_KEYS,EDITOR_ACTIONS } from './editor-actions.js';
import { evaluateDocumentParameters, evaluateNamedParameters } from './named-parameters.js';
import { t, getLanguage, setLanguage } from './i18n.js';
import { referenceNames } from './reference-tool-fields.js';

import { adaptUISelection } from './ui-selection-adapter.js';
import { createCommandService } from './command-service.js';
import {createReferenceSystem,validateReferenceSystem,resolvePlacement,validateResolvedPlacement,describeResolvedPlacement} from './work-frame.js';
import {placementPolicy} from './placement-policy.js';
import {collectReferences} from './reference-query.js';
import {synchronizeBodyAnchors} from './anchor-lineage.js';
import {frameOnPlane} from './frame-orientation.js';
import {applyReferenceAction} from './reference-contracts.js';
import {clearOccupiedAnchor} from './anchor-clearance.js';
import {placePendingFeature} from './free-placement.js';
import {formatBodyCount} from './count-summary.js';
import {bodyState,bodyWarnings} from './body-state.js';
import {webcadShortcut} from './webcad-shortcuts.js';
import {createHostControl,installHostInteractionGuard} from './host-control.js';
import { normalizeOperationParams, normalizeOperationPatch, migratedOperationIds, getOperation } from './operation-registry.js';
import {mechanicalIds,mechanicalNames,mechanicalRefRange} from './mechanical-tool-contracts.js';
import {resolveProfileRecipe,constrainProfileRecipe} from './modeling/profiles/profile-constraint-history.js';
import {classifyFile,extensionOf,assertOpenAllowed,assertOpenable,assertInsertable,dropDecision} from './open-import-policy.js';
import {chooseAction,UNSAVED_CHOICES,DROP_CHOICE_LABELS} from './ui/choice-dialog.js';
import {createLoadingTracker,LOADING_TEXT} from './loading-progress.js';


const emptyDocument = () => ({version:2,documentId:crypto.randomUUID(),name:nextProjectName(),features:[],imports:{},hidden:[],materialSettings:loadMaterialSettings(),referenceSystem:createReferenceSystem()});
const pageSessionId=crypto.randomUUID();
let documentInstanceId=crypto.randomUUID(),lastWarnings=[],persistenceCheckpoint='pending';
const clone = cloneAssetDocument;
const labels = {meshReliefPlate:'浮雕网格底板',meshHeightfieldRelief:'高度图浮雕',meshBoolean:'网格布尔合并',meshReliefEdit:'网格局部修高',round:'圆润',roundEnd:'端头圆润',rounding:'自动打磨',autoRound:'整件圆边',smoothTransition:'平滑过渡',box:'长方体',cylinder:'圆柱',sphere:'球体',cone:'圆锥',torus:'圆环',extrude:'拉伸',revolve:'旋转成型',transform:'变换',copy:'复制',mirror:'镜像',union:'合并',cut:'切除',intersect:'求交',fillet:'圆角',chamfer:'倒角',shell:'抽壳',hole:'打孔',linearPattern:'直线阵列',circularPattern:'环形阵列',import:'导入',remove:'删除'};
let documentModel=emptyDocument(),bodies=[],selectedIds=[],selectedTopology=null,busy=false,kernelReady=false,dirty=false;
const agentStateListeners=new Set();
function notifyAgentState(){for(const listener of agentStateListeners)try{listener();}catch{}}
let committedFinalSources=[];
let lastLocationMarker=null,locationMarkerNumber=0,locationMarkers=[];
const servicesExecutionHistory=createExecutionHistory();let lastServicesDecision=null,lastReliefDesignReceipt=null;
let qualityKey='standard';
function qualityState(){return {quality:qualityKey,...RENDER_QUALITIES[qualityKey],triangleCount:bodies.reduce((n,b)=>n+b.indices.length/3,0),source:'viewer-tessellation',adaptive:bodies.some(b=>!!b.adaptiveDisplay)};}
let undoStack=[],redoStack=[],requestSequence=0,status='正在启动精确建模内核…';
let modelClipboard=null;
let revision=0,previewNext=null,previewIdentity=null,previewScopeReport=null,previewGeneration=0,previewComputing=false,aiStatus='in-page',agentBridge=null;
let previewComputingOwner=null;
const hostControl=createHostControl(state=>{const entering=state.locked&&!viewport.interactionLocked,previewOwner=previewComputing?previewComputingOwner:previewIdentity?.owner??'ui';viewport.setInteractionLocked(state.locked);ui.setHostControl(state);if(entering&&(previewNext||previewComputing)&&previewOwner==='ui')void cancelPreview().catch(reportError);refresh();});
function assertHumanEditing(){if(hostControl.get().locked)throw Object.assign(new Error('Agent 正在控制工程，释放控制后可编辑。'),{code:'HOST_INTERACTION_LOCKED'});}
Object.assign(labels,{tap:'攻牙',badge:'牌仔工具',reliefShoulder:'浮雕中央肩部',arcProfile:'解析线弧轮廓',group:'组合',vectorProfile:'矢量路径',quickModel:'快速模型',sweep:'扫掠',loft:'放样',split:'分割',extractSolid:'提取实体',extractShell:'提取壳',faceHole:'面上打孔',faceExtrude:'面拉伸',multiHole:'多位置打孔',multiPocket:'批量矩形凹槽',multiBoss:'批量圆柱凸台',slot:'长圆槽',logo:'LOGO 凹凸字'});
Object.assign(labels,{ellipsoid:'椭球',guidedLoft:'导向放样',bumpSet:'批量凸点',subdBody:'细分曲面体',curveSweep:'曲线扫掠',advancedLoft:'多截面放样',curvedLogo:'曲面等深刻字'});
Object.assign(labels,{fittedSurface:'点阵拟合曲面',thickenFace:'选面增厚'});
Object.assign(labels,referenceProfileNames);
Object.assign(labels,referenceNames);
Object.assign(labels,mechanicalNames);
Object.assign(labels,{sketchProfile:'绘制轮廓',profileOffset:'等距偏移 / 边框',profileRepair:'修复轮廓',profileExtrude:'轮廓拉伸 / 加工',holeWizard:'孔向导',draftFaces:'受限拔模'});
const pending=new Map();
let loadingDepth=0;const loadingTracker=createLoadingTracker();
let worker,recoveryPromise=null,kernelProgress=null,kernelPerformance=null,pendingServicesWait=null,displayCoarsen=1;
function rejectPending(error){for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();}
function createWorker(){
  const instance=new Worker(new URL('./cad-worker.js',import.meta.url),{type:'module'});
  instance.onmessage=event=>{if(instance!==worker)return;const result=event.data,job=pending.get(result.requestId);if(!job)return;if(result.kind==='progress'){
    kernelProgress={...result.progress,requestId:result.requestId,updatedAt:Date.now()};job.pulse();
    job.progress=kernelProgress;
    if(result.progress.kind==='rebuild'){const p=result.progress;if(p.partial){try{viewport.addProgressiveMesh(p.partial);}catch{}delete p.partial;}const fraction=loadingTracker.update(p);if(busy)ui.setBusyProgress?.(fraction);return;}
    return;
  }clearTimeout(job.timer);pending.delete(result.requestId);kernelProgress=null;if(!result.ok)viewport.setErrorPoints(result.details?.pointsMm||[]);if(result.ok)job.resolve(result);else {const error=Object.assign(new Error(result.error||'建模操作失败'),{code:result.code,path:result.path,recoveryAction:result.recoveryAction,featureId:result.featureId,report:result.report,details:result.details});if(kernelFailure(error))kernelReady=false;job.reject(error);}};
  instance.onerror=event=>{if(instance!==worker)return;const error=Object.assign(new Error(event.message||'CAD 内核异常，请保存工程后刷新页面。'),{code:'KERNEL_CRASHED'});rejectPending(error);kernelReady=false;ui?.showError(error);};
  instance.onmessageerror=()=>{if(instance!==worker)return;const error=Object.assign(new Error('CAD Worker 消息无法解码；已提交工程仍保留，请恢复内核后继续。'),{code:'WORKER_MESSAGE_ERROR',commitState:'not_committed'});rejectPending(error);instance.terminate();kernelReady=false;worker=createWorker();refresh();};
  return instance;
}
worker=createWorker();
function request(type,payload={},{hardTimeoutMs}={}){return new Promise((resolve,reject)=>{
  if(type==='rebuild'&&displayCoarsen>1&&payload.displayCoarsen===undefined)payload={...payload,displayCoarsen};
  const requestId=++requestSequence,instance=worker,started=Date.now(),timeoutMs=type==='ready'?45000:hardTimeoutMs||getServicesConfig().localTimeoutMs;kernelProgress=null;
  const job={resolve,reject,timer:null,pulse:()=>{
    if(job.reminded)return;
    clearTimeout(job.timer);
    job.timer=setTimeout(()=>{
      if(instance!==worker)return;
      if(hardTimeoutMs){
        // Large imports: a stalled worker holds the wasm heap; terminate it so recovery can retry coarser.
        const error=Object.assign(new Error('本地计算超时，内核已终止'),{code:'KERNEL_TIMEOUT',commitState:'not_committed'});
        worker.terminate();worker=createWorker();rejectPending(error);kernelReady=false;return;
      }
      if(type!=='ready'){
        job.reminded=true;setStatus('本地计算已超过 '+timeoutMs/1000+' 秒，仍在执行原任务；可保存当前已提交工程。');return;
      }
      const error=Object.assign(new Error('建模内核初始化超时；工程仍可保存，可请求恢复内核。'),{code:'KERNEL_START_TIMEOUT',commitState:'not_committed'});
      worker.terminate();rejectPending(error);kernelReady=false;refresh();
    },Math.max(0,started+timeoutMs-Date.now()));
  }};
  pending.set(requestId,job);job.pulse();try{instance.postMessage({requestId,type,...payload});}catch(error){clearTimeout(job.timer);pending.delete(requestId);reject(Object.assign(error,{code:error.code||'WORKER_SEND_FAILED',commitState:'not_committed'}));}
});}
function restartWorker(error){
  if(recoveryPromise)return recoveryPromise;
  worker.terminate();rejectPending(error);kernelReady=false;worker=createWorker();
  const recovering=(async()=>{
    await request('ready');const result=await request('rebuild',{document:documentModel});
    bodies=result.bodies;selectedIds=selectedIds.filter(id=>bodies.some(body=>body.id===id));selectedTopology=null;
    // A new kernel invalidates old topology selections; keep geometry and history.
    revision++;kernelReady=true;viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds,null);
    viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});refresh();
  })();
  recoveryPromise=recovering;
  void recovering.finally(()=>{if(recoveryPromise===recovering)recoveryPromise=null;}).catch(()=>{});
  return recovering;
}
function decideServicesWait(jobId,decision){
 if(!pendingServicesWait||pendingServicesWait.jobId!==jobId||!['continue','stop'].includes(decision))throw serviceError('SERVICES_WAIT_NOT_PENDING','此任务当前没有等待决定');
 const waiting=pendingServicesWait;pendingServicesWait=null;waiting.dialog.close();waiting.resolve(decision);
 return {status:'applied',jobId,decision,newJobCreated:false};
}
function waitForServicesDecision(job,{signal}={}){
 if(signal?.aborted)return Promise.resolve('stop');
 return new Promise(resolve=>{const finish=decision=>{signal?.removeEventListener('abort',abort);resolve(decision);},abort=()=>{if(pendingServicesWait?.jobId===job.jobId)decideServicesWait(job.jobId,'stop');};
  const dialog=showServicesWait({...job,onDecision:decideServicesWait});pendingServicesWait={...job,resolve:finish,dialog};signal?.addEventListener('abort',abort,{once:true});
  setStatus('服务器达到等待提醒时间，请选择继续等待或停止运算。');
 });
}
servicesClient.setWaitHandler(job=>waitForServicesDecision(job));

const ui=createUI(document.getElementById('app'),{
  initialDocumentName:documentModel.name,
  onAction:(action,params)=>performAction(action,params).catch(error=>{reportError(error);return false;}),
  onRoundGuide:(report,handlers)=>viewport.setRoundGuide(report,handlers),
  onLogoPlacement:async(input,handlers)=>{
    if(!input){viewport.clearLogoPlacement();return null;}
    const atRevision=revision;
    if(!bodies.some(body=>body.id===input.bodyId))throw new Error('目标实体已变化，请重新选面。');
    const face=await request('faceInfo',{bodyId:input.bodyId,faceId:input.faceId});
    if(revision!==atRevision)throw new Error('定位期间模型已变化，请重新选面。');
    selectedIds=[input.bodyId];selectedTopology={bodyId:input.bodyId,type:'face',ids:[input.faceId],point:[...input.point],geomType:'PLANE'};viewport.setSelection(selectedIds,selectedTopology);
    const guide=viewport.setLogoPlacement({...input,face},handlers);refresh();return guide;
  },
  heightfieldPreview:id=>{const feature=documentModel.features.find(f=>f.id===id&&f.op==='meshHeightfieldRelief');if(!feature)return null;const item=documentModel.imports?.[feature.params.heights?.importKey];return {params:legacyReliefParams(feature.op,clone(feature.params)),heights:heightfieldSamples(feature.params,item?documentModel.binaryAssets?.[item.assetHash]:undefined)};},
  onSelection:(id,additive)=>selectBody(id,additive),
  onPickCandidate:hit=>pick(hit,false),
  onEditFeature:(id,params,name)=>{assertHumanEditing();const feature=documentModel.features.find(f=>f.id===id);params=intentForUIParameterEdit(feature?.op,{...feature?.params,...params});return editFeature(id,params,name).then(result=>{ui.clearPropertyDraft();return result;});},
  onPreviewFeatureEdit:(featureId,params)=>{const feature=documentModel.features.find(f=>f.id===featureId);params=intentForUIParameterEdit(feature?.op,{...feature?.params,...params});return runEditorAction('preview.start',{featureEdit:{featureId,params}},{fromUI:true});},
  onCompileServicesFeature:featureId=>runEditorAction('feature.compileServices',{featureId,allowUpload:true},{fromUI:true}),
  onPrepareReliefTopologyUpgrade:(featureId,maskStrategy)=>pageAPI.prepareReliefTopologyUpgrade({context:pageAPI.createRequestContext(),featureId,...(maskStrategy?{maskStrategy}:{})}),
  onApplyReliefTopologyUpgrade:async candidate=>{
    assertHumanEditing();
    if(candidate.status!=='prepared'||!candidate.canCommit||!candidate.receipt.designPreserved)throw serviceError('PARAM_SCHEMA_INVALID','升级候选未通过规划');
    const context=pageAPI.createRequestContext();
    if(context.expectedRevision!==candidate.context.revision||context.documentInstanceId!==candidate.context.documentInstanceId)throw serviceError('REVISION_CONFLICT','工程已改变，请重新预览升级');
    const fresh=await pageAPI.prepareReliefTopologyUpgrade({context,featureId:candidate.featureId,maskStrategy:candidate.params.maskStrategy});
    if(fresh.status!=='prepared'||fresh.receipt.beforeParamsFingerprint!==candidate.receipt.beforeParamsFingerprint||fresh.receipt.afterParamsFingerprint!==candidate.receipt.afterParamsFingerprint)throw serviceError('REVISION_CONFLICT','升级参数已改变，请重新规划');
    assertHumanEditing();const result=await pageAPI.execute({context,idempotencyKey:crypto.randomUUID(),action:'feature.edit',args:{featureId:candidate.featureId,params:fresh.params}});
    if(result.status==='failed')throw serviceError(result.error?.code??'UPGRADE_FAILED',result.error?.message??'升级未提交');return result;
  },
  onCommitFeaturePreview:()=>runEditorAction('preview.commit',{previewId:previewIdentity?.previewId,expectedGeneration:previewIdentity?.generation},{fromUI:true}),
  onCancelFeaturePreview:()=>runEditorAction('preview.cancel',previewIdentity?{previewId:previewIdentity.previewId,expectedGeneration:previewIdentity.generation}:{},{fromUI:true}),
  onVisibility:id=>runEditorAction('body.visibility',{bodyIds:[id],visible:documentModel.hidden.includes(id)}).catch(reportError),
  onTemporaryDisplay:mode=>{viewport.setTemporaryDisplay(mode);refresh();},
  onRemoveTopology:id=>{if(!selectedTopology)return;selectedTopology.ids=id===null?[]:selectedTopology.ids.filter(value=>value!==id);if(!selectedTopology.ids.length)selectedTopology=null;viewport.setSelection(selectedIds,selectedTopology);refresh();},
  onReliefDesign:args=>runEditorAction('document.reliefDesign',args,{fromUI:true}),
  onReliefDesignGeometry:args=>runEditorAction('feature.add',args,{fromUI:true}),
  onReliefDesignPreview:(action,args)=>runEditorAction(action,args,{fromUI:true}),
  onRename:name=>runEditorAction('document.rename',{name}).catch(reportError),
  onFrameDraft:frame=>{assertHumanEditing();viewport.setWorkFrame(frame);},
  onFrameCancel:()=>{viewport.cancelAnchorDrag();viewport.setWorkFrame(documentModel.referenceSystem.workFrame);},
  onFrameAlign:async frame=>{if(selectedTopology?.type!=='face'||selectedTopology.ids?.length!==1)throw new Error('请先选择一个精确平面面片');const atRevision=revision,target=clone(selectedTopology),face=await request('faceInfo',{bodyId:target.bodyId,faceId:target.ids[0]});if(revision!==atRevision)throw new Error('目标面已变化，请重新选择');return frameOnPlane(frame.origin,face.normal,frame.quaternion);},
  onProjectProfile:input=>pageAPI.projectProfile({context:pageAPI.getState().context,...input}),
  onProfileView:frame=>viewport.viewFrame(frame),
  onProfileViewRestore:previous=>viewport.restoreFrameView(previous),
});
const viewport=new CADViewport(document.getElementById('viewport'),{
  onRefineDisplay:input=>busy||!kernelReady||pending.size?null:request('refineDisplay',input),
  onRectangleSelect:input=>selectRectangle(input),
  onPick:pick,
  onLocationMark:hit=>{deliverLocationMarker(hit).catch(reportError);},
  onPickCandidates:candidates=>ui.showPickCandidates(candidates),
  onSketch:({expectedFrameVersion,...params})=>{if(expectedFrameVersion!==documentModel.referenceSystem.workFrame.frameVersion){reportError(Object.assign(new Error('绘制期间参考锚点已变化，请重新绘制，避免轮廓落在错误平面。'),{code:'STALE_REFERENCE'}));return;}performAction('extrude',params).catch(reportError);},
  onMeasure:(distance,delta)=>setStatus(`距离 ${distance.toFixed(3)} mm · ΔX ${delta[0].toFixed(3)} / ΔY ${delta[1].toFixed(3)} / ΔZ ${delta[2].toFixed(3)}`),
  onInteraction:mode=>ui.update({interactionMode:mode}),
  onRenderError:error=>ui.showError(error),
  onTransformStart:()=>({revision,documentInstanceId}),
  onTransform:async(params,gesture)=>{assertHumanEditing();if(gesture.context?.revision!==revision||gesture.context?.documentInstanceId!==documentInstanceId||!bodies.some(body=>body.id===gesture.bodyId))throw Object.assign(new Error('拖动期间模型已变化，请重新拖动'),{code:'STALE_REFERENCE'});const previousIds=new Set(bodies.map(body=>body.id)),result=await addFeature('transform',params,{refs:[gesture.bodyId],expectedRevision:gesture.context.revision});return {bodyId:result.bodies.find(body=>!previousIds.has(body.id))?.id};},
  onTransformError:reportError,
  onDragSnap:async input=>{const atRevision=revision,atInstance=documentInstanceId;const result=await request('dragSnap',{input});if(revision!==atRevision||documentInstanceId!==atInstance)throw new Error('模型在拖动吸附计算期间已变化，请重新拖动');return result;},
  onWorkFrameMove:rawOrigin=>{assertHumanEditing();const origin=quantizeModelParams({origin:rawOrigin},viewport.displayPreferences).origin;return ui.updateFrameDraft(origin)?undefined:runEditorAction('reference.setWorkFrame',{origin,quaternion:[...documentModel.referenceSystem.workFrame.quaternion]});},
});
installHostInteractionGuard(document,()=>hostControl.get().locked,target=>target===viewport.renderer.domElement);

// Agent batch display deferral: per-step display upload, UI refresh and DOM
// translation dominated the main thread of multi-step runs while the kernel
// worker sat idle. Geometry, revision and receipts are still committed per step.
let displayBatchDepth=0,deferredDisplay=null,deferredRefresh=false;
function showCommittedModel(fit){
  try{viewport.cancelTask();applyAppearance();viewport.setBodies(bodies,documentModel.hidden);viewport.setWorkFrame?.(documentModel.referenceSystem.workFrame);viewport.setSelection(selectedIds,selectedTopology);
    if(fit)viewport.fit();viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});}catch(error){lastWarnings.push({code:'DISPLAY_FAILED',message:error.message});}
}
function beginDisplayBatch(){displayBatchDepth++;}
function flushDisplayBatch(){
  if(deferredDisplay){const {fit}=deferredDisplay;deferredDisplay=null;showCommittedModel(fit);}
  if(deferredRefresh){deferredRefresh=false;refresh();}
}
function endDisplayBatch(){if(displayBatchDepth>0&&--displayBatchDepth===0)flushDisplayBatch();}
// Same as endDisplayBatch, but the upload/refresh runs on the next task so the batch receipt is reported first.
function endDisplayBatchDeferred(){if(displayBatchDepth>0&&--displayBatchDepth===0)setTimeout(()=>{if(displayBatchDepth===0)flushDisplayBatch();},0);}
function refresh(){if(displayBatchDepth){deferredRefresh=true;return;}document.title=(dirty?'● ':'')+documentModel.name+' — WebCAD';const url=new URL(location.href);if(url.searchParams.get('document')!==documentModel.documentId){url.searchParams.set('document',documentModel.documentId);history.replaceState(null,'',url);}ui.update({renderQuality:qualityState(),document:documentModel,bodies,selectedIds,selectedTopology,undoAvailable:undoStack.length>0,redoAvailable:redoStack.length>0,busy,status,kernelReady,dirty,displayPreferences:viewport.displayPreferences,metalFinish:viewport.finishKey,aiStatus,revision,viewState:{quality:qualityKey,display:viewport.mode,projection:viewport.camera.isOrthographicCamera?'orthographic':'perspective',grid:viewport.grid.visible,snap:viewport.snapEnabled,gizmo:viewport.gizmoMode,transform:viewport.getTransformState(),selection:viewport.selectionMode,anchorDrag:viewport.anchorDragEnabled,anchorVisible:viewport.anchorVisible,temporaryDisplay:viewport.temporaryDisplay}});notifyAgentState();}
function setStatus(message){status=message;ui.setStatus(t(message));}
function reportError(error){console.error(error);const recovery=errorRecovery(error);ui.showError(error);setStatus(recovery.userMessage);}
function pushUndo(next,label){if(next){recordTimeline(documentModel,next,{label});validateTimeline(next);assertDocumentCapacity(next);}const {imports,timeline,...rest}=documentModel;undoStack.push({...clone(rest),imports,timeline});if(undoStack.length>20)undoStack.shift();redoStack=[];}
function setBusy(value,message){if(value&&!busy){loadingTracker.reset();ui.setBusyProgress?.(null);}busy=value;viewport.setBusy?.(value);ui.setBusy(value,value?LOADING_TEXT:undefined);if(message)setStatus(message);refresh();}
// Opening/inserting/startup show only 载入中 (+ a bar when real progress is known).
async function withLoading(task){loadingDepth++;loadingTracker.reset();ui.setBusyProgress?.(null);if(!busy){ui.setBusy(true,LOADING_TEXT);setStatus(LOADING_TEXT);}try{return await task();}finally{loadingDepth--;if(!busy&&!loadingDepth)ui.setBusy(false);}}
function selectRectangle(input){if(busy)return;const ids=viewport.rectangleCandidates(input);ui.discardForSelection();selectedIds=input.additive?[...new Set([...selectedIds,...ids])]:ids;selectedTopology=null;viewport.setSelection(selectedIds);refresh();return {status:'read',selectedIds:[...selectedIds],context:pageAPI.getState().context};}
function selectBody(id,additive=false){
  if(busy)return;
  if(id!==selectedIds[0]||additive)ui.discardForSelection();
  selectedTopology=null;
  if(!id)selectedIds=[];
  else if(additive)selectedIds=selectedIds.includes(id)?selectedIds.filter(x=>x!==id):[...selectedIds,id];
  else selectedIds=[id];
  viewport.setSelection(selectedIds,selectedTopology);refresh();
}
function pick(hit,additive){
  if(busy)return;
  if(hit?.id!==selectedIds[0])ui.discardForSelection();
  if(!hit){if(!additive)selectBody(null);return;}
  if(hit.type==='body'||hit.topologyId===undefined){selectBody(hit.id,additive);return;}
  selectedIds=[hit.id];
  if(additive&&selectedTopology?.bodyId===hit.id&&selectedTopology.type===hit.type){const ids=selectedTopology.ids;selectedTopology.ids=ids.includes(hit.topologyId)?ids.filter(i=>i!==hit.topologyId):[...ids,hit.topologyId];}
  else selectedTopology={bodyId:hit.id,type:hit.type,ids:[hit.topologyId],point:hit.point};
  viewport.setSelection(selectedIds,selectedTopology);refresh();
  if(hit.type==='face'&&selectedTopology.ids.length===1){
    const target=selectedTopology,atRevision=revision;
    request('measure',{bodyId:hit.id,topologyType:'face',topologyId:hit.topologyId}).then(info=>{if(selectedTopology===target&&revision===atRevision){target.geomType=info.geomType;refresh();}}).catch(()=>{});
  }
}
async function runEditorAction(action,args,{fromUI=false}={}){
  assertHumanEditing();
  const {revision:r,...context}=pageAPI.getState().context;
  const input={context:{...context,expectedRevision:r},idempotencyKey:crypto.randomUUID(),action,args},result=fromUI?await commandService.execute(input,{fromUI:true}):await pageAPI.execute(input);
  if(['failed','unknown'].includes(result.status))throw Object.assign(new Error(result.error.message),result.error);
  return result;
}
function clearSelection(){selectedIds=[];selectedTopology=null;viewport.setSelection([]);}
let activeMaterialDocument;
function applyAppearance(){
  const materialDocument=documentInstanceId+':'+documentModel.documentId;
  if(materialDocument!==activeMaterialDocument){setMetalMaterialRegistry(documentModel.renderMaterials||loadMetalMaterials());activeMaterialDocument=materialDocument;}
  viewport.partFinishes={...documentModel.appearance};viewport.partColors={...documentModel.colors};
  viewport.setMetalFinish(FINISH_KEYS.includes(documentModel.renderFinish)?documentModel.renderFinish:FINISH_KEYS.includes(viewport.displayPreferences.defaultFinish)?viewport.displayPreferences.defaultFinish:'design');
}

async function routeChangedFeature(next,{signal,expectedRevision,featureId,explicitRemote=false,allowUpload}={}){
 const config=getServicesConfig(),servicesAvailable=config.configured;
 const records=new Map(documentModel.features.map(feature=>[feature.id,JSON.stringify(geometryFeatureRecord(feature))]));
 const affected=new Set(next.features.filter(feature=>records.get(feature.id)!==JSON.stringify(geometryFeatureRecord(feature))).map(feature=>feature.id));if(featureId)affected.add(featureId);
 for(const row of next.features)if(row.refs?.some(id=>affected.has(id)))affected.add(row.id);
 const changed=next.features.filter(feature=>affected.has(feature.id));
 const authoritative=servicesAvailable?await collectRoutingSources(changed,{hasSource:id=>records.has(id),changedSourceIds:affected,readSource:async id=>{const source=await request('sourceComplexity',{featureId:id});checkTransaction(signal,expectedRevision);return source;}}):new Map();
 const sourceSummary=feature=>authoritative.get(feature?.id)??aggregateSourceComplexity((feature?.refs??[]).map(id=>{const body=bodies.find(row=>row.id===id);return {faces:body?.faceGroups?.length,edges:body?.edges?.length,solids:body?.solidCount};}));
 const feature=featureId?next.features.find(row=>row.id===featureId):changed.length===1?changed[0]:null;
 const publish=decision=>{lastReliefDesignReceipt=null;lastServicesDecision={...decision,featureId:feature?.id??null,documentInstanceId,revision};setStatus(decision.reason);};
 if(featureId&&changed.some(row=>row.id!==featureId&&classifyComplexity({operation:row.op,params:row.params,source:sourceSummary(row),pattern:patternComplexity(row)}).complex))throw serviceError('COMPLEX_BATCH_REQUIRES_SEQUENTIAL','此编译会使下游复杂运算失效；请先移除下游步骤，完成来源后重新执行复杂操作。');
 if(!feature){
  const pending=changed.find(row=>!row.compiledCheckpoint&&tbdForOperation({operation:row.op,semanticVersion:compiledSemanticVersion(row),params:row.params,source:sourceSummary(row),pattern:patternComplexity(row)}));
  if(pending)throw serviceError('OPERATION_TBD','TBD：该运算尚未完成验收，已禁用，原工程保留。');
  const complex=changed.find(row=>classifyComplexity({operation:row.op,params:row.params,source:sourceSummary(row),pattern:patternComplexity(row)}).complex);
  if(servicesAvailable&&complex)throw serviceError('COMPLEX_BATCH_REQUIRES_SEQUENTIAL','修改会重建下游复杂运算；请先移除下游步骤，完成来源修改后重新执行复杂操作。原工程保持。');
  return {next};
 }
 const base={servicesAvailable,explicitRemote,allowUpload:servicesAvailable||allowUpload===true,operation:feature.op,semanticVersion:compiledSemanticVersion(feature),params:feature.params,pattern:patternComplexity(feature),source:sourceSummary(feature)};
 const localReady=!!previewNext&&JSON.stringify(previewNext.features)===JSON.stringify(next.features);
 const savedReady=!!feature.compiledCheckpoint&&!!compiledCheckpointBytes(next,feature);
 // Fitted relief (designBinding): the first full computation goes to Services when it advertises
 // relief.design-fit-brep-1; the local preview is only the browser fine-tune view.
 const designServices=servicesAvailable&&feature.op==='relief'&&!!feature.params?.designBinding;
 // Services-first bindings carry only a provisional control net: never compute them locally.
 const servicesFirst=feature.op==='relief'&&!!feature.params?.designBinding?.audit?.servicesFirstFit;
 const needBrowserFit=reason=>serviceError('RELIEF_DESIGN_SERVICES_REQUIRED','首次拟合需在 Services 完成，但'+reason+'。请在“拟合”中先用浏览器拟合（回退），再重新准备。');
 if(servicesFirst&&!servicesAvailable)throw needBrowserFit('后台计算未连接');
 if((localReady&&!designServices)||savedReady){publish(chooseExecutor({...base,cache:{localCheckpoint:true}}));return {next};}
 if(servicesAvailable&&feature.op==='round'&&feature.refs?.length===1&&feature.params.faceIds?.length===1&&documentModel.features.some(row=>row.id===feature.refs[0])&&geometryRecipeFingerprint(next,feature.refs[0])===geometryRecipeFingerprint(documentModel,feature.refs[0])){
  const inspected=await request('faceRoundPlan',{sourceFeatureId:feature.refs[0],params:feature.params});checkTransaction(signal,expectedRevision);
  base.source.preexistingBoundaryRound=inspected.plan.candidate===true;
 }
 const classification=classifyComplexity(base);
 const pending=tbdForOperation(base);if(pending){publish(chooseExecutor(base));throw serviceError('OPERATION_TBD','TBD：'+pending.label+'尚未完成验收，已禁用，原工程保留。');}
 if(!servicesAvailable||!classification.complex&&!explicitRemote&&!designServices||classification.input.routingClass==='local-only'||classification.input.capacityGate==='bounded-local-mesh-contract'){
  const decision=chooseExecutor(base);publish(decision);
  if(decision.executor==='blocked')throw serviceError('SERVICES_OPERATION_UNAVAILABLE',decision.reason);
  if(explicitRemote&&classification.input.routingClass==='local-only')throw serviceError('SERVICES_OPERATION_UNAVAILABLE','本工具固定使用本地计算，无需后台精确计算。');
  if(explicitRemote&&!servicesAvailable)throw serviceError('SERVICES_CONFIG_REQUIRED','先连接并启用后台计算');return {next};
 }
 if(!remotePlacementSupported(feature))throw serviceError('SERVICES_OPERATION_UNAVAILABLE','此复杂操作的放置尚未由原生服务器支持，请明确使用已支持的世界坐标语义；不会回退本地。');
 try{assertCompilableFeature(feature);}catch(error){throw serviceError('SERVICES_OPERATION_UNAVAILABLE','此复杂操作尚未由原生服务器实现：'+error.message,{operation:feature.op});}
 if(!feature.refs?.length||feature.refs.some(id=>!documentModel.features.some(row=>row.id===id)||geometryRecipeFingerprint(next,id)!==geometryRecipeFingerprint(documentModel,id)))throw serviceError('SERVICES_SOURCE_UNAVAILABLE','复杂操作的目标和全部刀具都必须是已提交、未变化的来源；请先完成来源步骤。');
 let capabilities;try{capabilities=await servicesClient.capabilities();}catch(error){if(!(designServices&&!classification.complex))throw error;if(servicesFirst)throw needBrowserFit('Services 不可达');publish({executor:'local',reason:'Services 不可达（'+(error.code??'')+'），使用浏览器回退计算'});return {next};}checkTransaction(signal,expectedRevision);
 const capability=capabilities.operations.find(row=>row.operation===(designServices?'reliefDesign':feature.op)&&row.semanticVersion===base.semanticVersion&&row.enabled);
 const sources=[];for(const id of feature.refs){sources.push(await request('sourceComplexity',{featureId:id,...(feature.op==='relief'?{faceId:feature.params.faceId}:{})}));checkTransaction(signal,expectedRevision);}
 const source=feature.op==='cut'?aggregateSourceComplexity(sources):{...sources[0],preexistingBoundaryRound:base.source.preexistingBoundaryRound};
 const pair=capabilities.geometryExchange?.testedKernelPairs?.some(row=>row.producerKernelBuildId===capability?.kernelBuildId&&row.consumerKernelBuildId===LOCAL_KERNEL_BUILD_ID&&row.codec===GEOMETRY_CODEC&&row.brepVersion===3);
 const input={...base,source,endpoint:config.url,kernelBuildId:capability?.kernelBuildId??'unavailable'},executionKey=physicalExecutionKey(feature,source.inputSha256??source.sourceSha256,input.kernelBuildId,input.endpoint);
 const importReady=!!pair&&VERIFIED_NATIVE_KERNELS.has(capability?.kernelBuildId);
 // Browser fallback: Services lacks the capability / verified kernel pair and the design is simple enough locally.
 if(designServices&&!classification.complex&&(!capability||!importReady)){if(servicesFirst)throw needBrowserFit('Services 未提供已验证的 relief.design-fit-brep-1');publish({executor:'local',reason:'Services 未提供已验证的 relief.design-fit-brep-1，使用浏览器回退计算（相同纯模块，≤33 控制点）'});return {next};}
 const decision=designServices&&capability&&importReady?{executor:'remote',reason:'首次完整计算在 Services 执行（relief.design-fit-brep-1：高分辨率拟合 + 精确裁剪）'}:chooseExecutor({...input,capabilities,clientImportReady:importReady,knownTask:servicesExecutionHistory.task(executionKey)});publish(decision);
 if(decision.executor==='blocked')throw serviceError('SERVICES_OPERATION_UNAVAILABLE',decision.reason,{executionKey,routingDecision:decision});
 if(decision.executor==='local')return {next};
 try{
  const snapshots=[];for(const id of feature.refs){snapshots.push((await request('serializeFeature',{featureId:id})).data);checkTransaction(signal,expectedRevision);}
  const bytes=feature.op==='cut'?snapshots:snapshots[0];
  const plan=feature.op==='reliefShoulder'?(await request('shoulderPlan',{sourceFeatureId:feature.refs[0],params:feature.params})).plan:designServices?reliefDesignServicesPlan(next,feature):feature.op==='relief'?(await request('prepareReliefPlan',{sourceFeatureId:feature.refs[0],params:feature.params})).plan:feature.op==='round'?(await request('faceRoundPlan',{sourceFeatureId:feature.refs[0],params:feature.params,prepare:true})).plan:null;
  const context={documentId:next.documentId,documentInstanceId,expectedRevision};
  const candidate=await compileRemoteFeature(next,feature.id,bytes,context,{allowUpload:true,plan,signal,waitTimeoutMs:config.serverWaitMs,onWaitTimeout:job=>waitForServicesDecision(job,{signal})});checkTransaction(signal,expectedRevision);
  if(designServices){const rd=candidate.manifest?.reliefDesign??{},m=rd.fit?.report?.metrics?.training??{},p=rd.quality?.machiningPrecisionMm??rd.fit?.report?.machiningPrecisionMm??rd.fit?.precision?.machiningPrecisionMm??null;lastReliefDesignReceipt={featureId:feature.id,documentInstanceId,executor:'remote',jobId:candidate.manifest?.jobId??null,controlNet:[rd.fit?.columns??null,rd.fit?.rows??null],maxErrorMm:m.maxMm??null,rmsErrorMm:m.rmsMm??null,machiningPrecisionMm:p,qualityCapacityRetry:rd.qualityCapacityRetry??null,volumeReview:{consistent:rd.quality?.consistent===true,relativeError:rd.quality?.bestRel??null}};}
  return {next:installCompiledCandidate(next,{manifest:candidate.manifest,bytes:candidate.geometryBytes,context,recipeFingerprint:candidate.recipeFingerprint}),record:{executor:'remote',input,executionKey,measurements:candidate.executionMeasurements}};
 }catch(error){if(!(error.code==='CANCELLED'&&error.submitted===false))servicesExecutionHistory.failure(executionKey,error);
  // Fitted relief: a Services failure falls back to the browser (same modules) when the design is locally computable.
  if(designServices&&!classification.complex&&!['CANCELLED','OBSERVATION_CANCELLED','SERVICES_JOB_CANCELLED','REVISION_CONFLICT'].includes(error.code)){if(servicesFirst)throw needBrowserFit('Services 计算失败（'+(error.code??'')+'：'+error.message+'）');publish({executor:'local',reason:'Services 计算失败（'+(error.code??'')+'：'+error.message+'），已用浏览器回退计算'});return {next};}
  error.routingDecision=decision;throw error;}
}

async function rebuild(next,{record=true,fit=false,select=null,save=true,signal,expectedRevision,newInstance=false,restoring=false,historyLabel,hardTimeoutMs,origin='user',autoPlaceFeatureId}={}){
  if(busy)throw new Error('当前操作尚未完成，请稍候。');
  if(!kernelReady)throw new Error('建模内核尚未就绪。');
  setBusy(true,'正在计算精确实体…');
  let routed=null,localBegan,committed=false;
  try{
    checkTransaction(signal,expectedRevision);
    // Non-user rebuilds (open/undo/refresh/recovery) may refresh checkpoints or
    // anchor metadata too. Keep their original state for the same history diff.
    const rebuildBaseline=record?null:clone(next);
    const previousDocument=record&&!newInstance&&!restoring&&next.documentId===documentModel.documentId?documentModel:next;
    const retainedSelection=origin==='agent'?{ids:[...selectedIds]}:null;
    if(next.parameters!==undefined||next.features.some(f=>f.expressions))next=evaluateDocumentParameters(next,{previousDocument});
    assertHistoryEditSafe(previousDocument,next);
    // Keep every committed project saveable through the bounded browser file API.
    // Reserve a small margin for subsequent UI name/appearance metadata changes.
    assertDocumentCapacity(next,{includeTimeline:false,reserveBytes:DOCUMENT_LIMITS.preflightReserveBytes});
    if(record&&!newInstance&&!restoring&&next.documentId===documentModel.documentId){routed=await routeChangedFeature(next,{signal,expectedRevision:expectedRevision??revision});next=routed.next;}
    localBegan=performance.now();
    let result=await request('rebuild',{document:next},{hardTimeoutMs}),placementWarning;
    if(autoPlaceFeatureId){
      try{
        checkTransaction(signal,expectedRevision);
        const placed=await placePendingFeature({document:next,result,existingBodies:bodies,featureId:autoPlaceFeatureId,
          rebuild:document=>request('rebuild',{document},{hardTimeoutMs})});
        next=placed.document;result=placed.result;placementWarning=placed.warning;
      }catch(error){await request('rebuild',{document:documentModel});throw error;}
    }
    if(result.stats.checkpointCandidates?.length){
      // Pending features are not in the committed timeline yet. Bake their
      // geometry first; pushUndo records the complete transaction exactly once.
      const baked=await request('bakeProject',{document:next,options:{recordHistory:false}});
      try{assertDocumentCapacity(baked.document,{includeTimeline:false,reserveBytes:DOCUMENT_LIMITS.preflightReserveBytes});next=baked.document;}catch(error){if(error.code!=='SIZE_LIMIT')throw error;}
    }
    try{checkTransaction(signal,expectedRevision);}catch(error){await request('rebuild',{document:documentModel});throw error;}
    try{if(!restoring)await synchronizeBodyAnchors(documentModel,next,bodies,result.bodies,async bodyId=>(await request('queryGeometry',{bodyId,kind:'edge',filter:{}})).geometryFingerprint);checkTransaction(signal,expectedRevision);}catch(error){await request('rebuild',{document:documentModel});throw error;}
    // Automatic clearance belongs to the same geometry transaction. A locked
    // frame and a user-chosen empty point are left alone.
    if(record&&!restoring&&JSON.stringify(next.features)!==JSON.stringify(documentModel.features)&&!next.referenceSystem.workFrame.locked){
      const work=next.referenceSystem.workFrame,clear=clearOccupiedAnchor(work.origin,result.bodies);
      if(clear!==work.origin){work.origin=clear;work.frameVersion++;work.sourceLabel='自动避让模型';work.provenance={kind:'manual'};}
    }
    const insertedObject=record&&!restoring&&next.features.some(f=>!documentModel.features.some(old=>old.id===f.id)&&(placementPolicy(f.op)==='C'||['copy','mirror','linearPattern','circularPattern'].includes(f.op)||f.op==='profileExtrude'&&f.params.operation==='newBody'));
    const newQuickModels=record&&!newInstance&&documentModel.documentId===next.documentId?next.features.filter(f=>f.op==='quickModel'&&!documentModel.features.some(old=>old.id===f.id)):[];
    // Anchors and retained history can grow after preflight. Validate the final
    // snapshot before changing undo/redo, revision, or the authoritative model.
    if(next.materialSettings)next.materialSettings=inheritBodyMaterials(next.materialSettings,next.features,result.bodies.map(b=>b.id));
    try{if(record)pushUndo(next,historyLabel);else {recordTimeline(rebuildBaseline,next,{label:'保留恢复后的重建状态'});validateTimeline(next);assertDocumentCapacity(next);}}
    catch(error){await request('rebuild',{document:documentModel});throw error;}
    if(newInstance||documentModel.documentId!==next.documentId){documentInstanceId=crypto.randomUUID();projectFileHandle=null;}
    documentModel=next;bodies=result.bodies;committedFinalSources=result.finalSources;selectedTopology=null;previewNext=null;previewIdentity=null;previewScopeReport=null;revision++;committed=true;
    kernelPerformance={totalMs:performance.now()-localBegan,...(result.parallelRebuild?{parallelRebuild:result.parallelRebuild}:{}),perFeatureMs:result.perFeatureMs||[],compiledReuse:result.compiledReuse||[],compiledInvalidated:result.compiledInvalidated||[],slowest:(result.perFeatureMs||[]).slice().sort((a,b)=>b.ms-a.ms).slice(0,10)};
    for(const feature of newQuickModels)recordQuickModelUse(feature.params.kind);
    lastWarnings=bodyWarnings(bodies);if(placementWarning)lastWarnings.push(placementWarning);dirty=true;if(save)void autosave(); // selection-origin
    // Agent writes never replace the user's selection. Only ids that no longer
    // exist are dropped; the user's own insert/edit path keeps its old select
    // behaviour (including clearing after an independent insertion).
    selectedIds=origin==='agent'?retainedSelection.ids.filter(id=>bodies.some(b=>b.id===id)):insertedObject?[]:select&&bodies.some(b=>b.id===select)?[select]:selectedIds.filter(id=>bodies.some(b=>b.id===id));
    // Numeric face/edge indices belong to the old body revision even if its bodyId survives.
    selectedTopology=null;
    // Agent batches upload the display once at the end of the batch (see beginDisplayBatch).
    if(displayBatchDepth)deferredDisplay={fit:fit||deferredDisplay?.fit===true};else showCommittedModel(fit);
    // Commit is synchronous. Persistence follows without yielding between commit
    // and the command acknowledgement, so a late abort cannot claim rollback.
    try{viewport.setErrorPoints([]);ui.clearErrors();const warning=lastWarnings.find(w=>w.code==='DISPLAY_INCOMPLETE'||w.code==='DISPLAY_VOLUME_MISMATCH');setStatus(warning?errorRecovery(warning).userMessage:`就绪 · ${formatBodyCount(bodies)}`);}catch(error){lastWarnings.push({code:'DISPLAY_FAILED',message:error.message});}
    if(routed?.record)servicesExecutionHistory.success(routed.record.input,routed.record.executor,routed.record.executor==='local'?{totalMs:performance.now()-localBegan}:routed.record.measurements);
    if(lastServicesDecision?.documentInstanceId===documentInstanceId&&lastServicesDecision.revision===revision-1){lastServicesDecision.revision=revision;setStatus(`就绪 · ${lastServicesDecision.executor==='remote'?'后台':'本地'} · ${lastServicesDecision.reason}`);}
    return result;
  }catch(error){
    viewport.clearProgressiveMesh?.();
    if(routed?.record)servicesExecutionHistory.failure(routed.record.executionKey,error);
    // A caught WASM trap can leave the Worker alive with a corrupt heap.
    // Restore the committed document; never retry the failed candidate.
    if(!committed&&kernelFailure(error)){
      error.commitState='not_committed';error.recoveryAction='READ_STATE_AND_REPLAN';
      try{await restartWorker(error);error.message+='；已从最后提交工程恢复内核，本次操作未提交，请读取新上下文。';}
      catch(recoveryError){kernelReady=false;error.recoveryAction='SAVE_COMMITTED_PROJECT_AND_RECOVER_KERNEL';error.message+=`；内核恢复失败：${recoveryError.message}。仍可保存最后提交工程。`;}
    }
    throw error;
  }
  finally{try{setBusy(false);}catch(error){busy=false;lastWarnings.push({code:'DISPLAY_FAILED',message:error.message});}}
}
function featureDocument(op,params={},explicitRefs=[],name,placement){
  const mechanicalRange=mechanicalIds.includes(op)?mechanicalRefRange(op,params):null;
  const refs=[];const selection=explicitRefs;const single=['bumpSet','badge','meshReliefEdit','reliefShoulder','round','roundEnd','rounding','autoRound','smoothTransition','transform','copy','mirror','fillet','chamfer','shell','hole','holeWizard','draftFaces','multiHole','multiPocket','multiBoss','slot','linearPattern','circularPattern','split','extractSolid','extractShell','tap','faceHole','faceExtrude','logo','curvedLogo','thickenFace','extractFaces'];
  if(mechanicalRange){if(selection.length<mechanicalRange.min||selection.length>mechanicalRange.max)throw new Error(`此操作须明确提供 ${mechanicalRange.min===mechanicalRange.max?mechanicalRange.min:`${mechanicalRange.min}–${mechanicalRange.max}`} 个当前来源／目标对象。`);refs.push(...selection);}
  if([...single,'planeSection','faceBoundary','referenceExtrude','profileOffset','profileRepair'].includes(op)){
    if(selection.length!==1||!bodies.some(b=>b.id===selection[0]))throw new Error('请先选择一个当前实体。');
    refs.push(selection[0]);
  }
  if(['group','union','cut','intersect','meshBoolean'].includes(op)){
    if(selection.length<2)throw new Error('请按住 Shift 依次选择至少两个实体。切除时先选保留的主体，再选刀具。');
    refs.push(...selection);
  }
  if(op==='guidedLoft'){if(params.matchTo){if(selection.length!==1||selection[0]!==params.matchTo.featureId)throw new Error('接续来源必须与唯一引用一致');refs.push(selection[0]);}else if(selection.length)throw new Error('独立导向放样不引用来源');}
  if(op==='referenceLoft'){
    if(selection.length<2||selection.length>12)throw new Error('请按顺序选择 2–12 个闭合截面对象。');
    refs.push(...selection);
  }
  if(op==='profileExtrude'){
    if(selection.length!==(params.operation==='newBody'?1:2)||selection.some(id=>!bodies.some(b=>b.id===id)))throw new Error('轮廓加工须先选已放置的轮廓；加料、切除和相交还须明确选一个目标实体。');
    refs.push(...selection);
  }
  if(op==='sewFaces'||op==='surfaceTrim'){
    if(op==='sewFaces'&&selection.length<1)throw new Error('请选择至少一个含面的对象。');
    if(op==='surfaceTrim'&&selection.length!==2)throw new Error('依次选择源面对象、实体刀具，恰好两个对象。');
    refs.push(...selection);
  }
  if(op==='remove'){if(!selection.length)throw new Error('请先选择要删除的实体。');refs.push(...selection);}
  if(refs.some(id=>!bodies.some(b=>b.id===id))||new Set(refs).size!==refs.length)throw new Error('操作引用的实体无效。');
  params=clone(params);
  if(op==='logo'&&params.draftAngle===undefined)params.draftAngle=params.placementVersion===2?0:7;
  if(['badge','tap','faceHole','faceExtrude','logo','curvedLogo','thickenFace','faceBoundary'].includes(op)){
    if(!Number.isInteger(params.faceId))throw new Error(op==='logo'&&params.placementVersion===2?'请先选择 LOGO 目标面。':['curvedLogo','thickenFace'].includes(op)?'请先选择目标曲面。':'请先选择一个平面。 / Select one planar face first.');
  }
  if(['fillet','chamfer'].includes(op)){
    const scopes=Number(!!params.edgeIds?.length)+Number(!!params.faceIds?.length)+Number(params.allEdges===true);
    if(scopes!==1)throw new Error('请选择边、面边界或整个实体的全部边，三种范围只能选一种。');
  }
  if(op==='shell'){
    if(!params.faceIds?.length)throw new Error('抽壳需要先切换到“选面”，点击要去掉的开口面，再设置壁厚。');
  }
  if(op==='extractFaces'&&!params.faceIds?.length)throw new Error('请切换到选面并选择至少一个面。');
  const next=clone(documentModel);const id=crypto.randomUUID();
  next.features.push(markTopologySemantics({id,op,name:name||`${labels[op]||op} ${next.features.filter(f=>f.op===op).length+1}`,params,refs,...(placement?{placement,semanticsVersion:2}:{})}));
  if(next.appearance?.[refs[0]])next.appearance[id]=next.appearance[refs[0]];
  if(next.colors?.[refs[0]])next.colors[id]=next.colors[refs[0]];
  return {next,id};
}
async function addFeature(op,params={},options={}){
  const refs=options.refs??[];
  if(migratedOperationIds.includes(op))params=normalizeOperationParams(op,params);
  params=await resolveLogoParams(op,params,refs,options);
  const {next,id}=featureDocument(op,params,refs,options.name,options.placement);
  const insertOps=['vectorProfile','box','sphere','cylinder','cone','torus','extrude','revolve','copy','mirror','linearPattern','circularPattern','quickModel','sweep','loft'];
  const select=options.origin==='agent'?undefined:Object.hasOwn(options,'select')?options.select:insertOps.includes(op)?undefined:id;
  const autoPlace=options.origin==='agent'&&(placementPolicy(op)==='C'||insertOps.includes(op))&&options.placementExplicit!==true&&!(op==='guidedLoft'&&params.matchTo);
  const result=await rebuild(next,{...options,select,fit:!bodies.length||insertOps.includes(op),...(autoPlace?{autoPlaceFeatureId:id}:{})});
  const diagnostic=bodies.find(body=>body.id===id)?.surfaceDiagnostics;
  if(diagnostic)ui.showInfo('缝合检查',`${diagnostic.faces} 面，${diagnostic.solids} 实体。以 ${diagnostic.tolerance} mm 再检查：${diagnostic.freeEdges} 条自由边，${diagnostic.multipleEdges} 条非流形边。未自动补洞。`);
  return result;
}
async function resolveLogoParams(op,params,refs,options={}){
  if(op!=='logo'||params.placementVersion!==2)return params;
  if(refs.length!==1||!bodies.some(b=>b.id===refs[0]))throw Object.assign(new Error('LOGO 需要当前目标实体'),{code:'STALE_REFERENCE'});
  if(!Number.isInteger(params.faceId)||params.faceId<0||!Array.isArray(params.point)||params.point.length!==3||params.point.some(x=>!Number.isFinite(x)))throw Object.assign(new Error('请明确选定目标面及三维放置点'),{code:'PARAM_SCHEMA_INVALID'});
  if(!params.source||typeof params.source!=='object'||params.source.reviewed!==true)throw Object.assign(new Error('请先复核 LOGO 轮廓来源、尺寸与孔洞，并设置 source.reviewed=true'),{code:'PARAM_SCHEMA_INVALID'});
  const startRevision=revision;
  const face=await request('logoTarget',{bodyId:refs[0],faceId:params.faceId});
  checkTransaction(options.signal,options.expectedRevision);
  if(revision!==startRevision)throw Object.assign(new Error('目标模型已变化，请重新选面'),{code:'REVISION_CONFLICT'});
  if(params.targetSurfaceType!==undefined&&params.targetSurfaceType!==face.geomType)throw Object.assign(new Error('目标面类型已改变，请重新选面'),{code:'STALE_REFERENCE'});
  if(params.targetGeometryFingerprint!==undefined&&params.targetGeometryFingerprint!==face.geometryFingerprint)throw Object.assign(new Error('目标实体几何已改变，请重新选面'),{code:'STALE_REFERENCE'});
  if(params.targetFaceSignature!==undefined&&params.targetFaceSignature!==face.stableFaceSignature)throw Object.assign(new Error('目标面几何已改变，请重新选面'),{code:'STALE_REFERENCE'});
  return {...params,targetSurfaceType:face.geomType,targetFaceArea:face.areaMm2,targetFaceCenter:face.center,targetFaceSignature:face.stableFaceSignature,targetGeometryFingerprint:face.geometryFingerprint};
}
async function editFeature(id,params,name,options={}){
  if(busy)return;
  const next=clone(documentModel),feature=next.features.find(f=>f.id===id);
  if(!feature)throw new Error('未找到可编辑的操作。');
  if(Object.keys(params).some(key=>JSON.stringify(params[key])!==JSON.stringify(feature.params[key])&&Object.keys(feature.expressions||{}).some(path=>path===key||path.startsWith(key+'.'))))throw Object.assign(new Error('该尺寸已绑定命名参数，请在参数表中修改。'),{code:'PARAMETER_BOUND'});
  feature.params=migratedOperationIds.includes(feature.op)?normalizeOperationPatch(feature.op,feature.params,params):{...feature.params,...params};if(name?.trim())feature.name=name.trim();if(options.placement){feature.placement=options.placement;feature.semanticsVersion=2;}
  // Erase stale native receipts only in this candidate transaction; undo keeps
  // the original document/checkpoint. Local and native cache keys include params.
  const original=documentModel.features.find(f=>f.id===id);
  if(JSON.stringify(geometryFeatureRecord(original))!==JSON.stringify(geometryFeatureRecord(feature))){
    const invalidated=new Set([id]);for(const row of next.features)if(row.refs?.some(ref=>invalidated.has(ref)))invalidated.add(row.id);
    for(const row of next.features)if(invalidated.has(row.id))delete row.compiledCheckpoint;
  }
  await rebuild(next,{...options,select:options.origin==='agent'?null:id});
}
async function navigateHistory(direction,options={}){
  const source=direction==='undo'?undoStack:redoStack;if(!source.length||busy)return;
  const next=clone(source[source.length-1]),old=clone(documentModel);recordTimeline(documentModel,next,{label:direction==='undo'?'撤销到上一状态':'重做状态'});
  if(JSON.stringify({features:next.features,imports:next.imports})===JSON.stringify({features:old.features,imports:old.imports})){
    checkTransaction(options.signal,options.expectedRevision);assertDocumentCapacity(next);documentModel=clone(next);revision++;dirty=true;void autosave();viewport.setWorkFrame?.(next.referenceSystem.workFrame);flushDisplayBatch();viewport.markModel({documentId:next.documentId,documentInstanceId,revision});refresh();
  }else await rebuild(clone(next),{...options,record:false,restoring:true});source.pop();(direction==='undo'?redoStack:undoStack).push(old);try{refresh();}catch(error){lastWarnings.push({code:'DISPLAY_FAILED',message:error.message});}
}
function checkTransaction(signal,expectedRevision){if(signal?.aborted)throw Object.assign(new Error('AI request cancelled before commit'),{code:'CANCELLED',path:'context',recoveryAction:'READ_STATE_AND_REPLAN'});if(expectedRevision!==undefined&&expectedRevision!==revision)throw Object.assign(new Error(`Revision conflict: expected ${expectedRevision}, current ${revision}. Read state and retry.`),{code:'REVISION_CONFLICT',path:'context.expectedRevision',recoveryAction:'READ_STATE_AND_REPLAN'});}
// Heightmap samples from the UI dialog travel as a binary v4 asset (format
// heightmap) referenced by params.heights.importKey, not as inline base64.
let pendingHeightmap=null;
function attachPendingHeightmap(next,params){
  const key=params?.heights?.importKey;if(!key||next.imports?.[key]||pendingHeightmap?.key!==key)return;
  next.version=4;next.binaryAssets={...next.binaryAssets,[pendingHeightmap.hash]:pendingHeightmap.bytes};next.imports={...next.imports,[key]:{format:'heightmap',assetHash:pendingHeightmap.hash,name:pendingHeightmap.name}};
}
async function previewFeature(op,params,explicitRefs,name,placement,identity=null,editId=null){
  if(busy)throw new Error('Please wait for the current operation.');
  if(!Object.hasOwn(labels,op)||op==='import')throw new Error('Unsupported preview operation');
  const previousPreview=previewNext,previousIdentity=previewIdentity,previousScopeReport=previewScopeReport;
  const uiParams=explicitRefs?params:adaptUISelection(op,params,selectedIds,selectedTopology);
  const refs=explicitRefs||[...selectedIds];
  const resolved=await resolveLogoParams(op,migratedOperationIds.includes(op)?normalizeOperationParams(op,uiParams):uiParams,refs);
  let next;
  if(editId){next=clone(documentModel);const edited=next.features.find(f=>f.id===editId);if(!edited)throw Object.assign(new Error('预览编辑特征已失效'),{code:'STALE_REFERENCE'});if(Object.keys(resolved).some(key=>JSON.stringify(resolved[key])!==JSON.stringify(edited.params[key])&&Object.keys(edited.expressions||{}).some(path=>path===key||path.startsWith(key+'.'))))throw Object.assign(new Error('该尺寸已绑定命名参数，请在参数表中修改。'),{code:'PARAMETER_BOUND'});edited.params=resolved;if(name!==undefined)edited.name=name;if(placement)edited.placement=placement;assertHistoryEditSafe(documentModel,next);}
  else ({next}=featureDocument(op,resolved,refs,name,placement));attachPendingHeightmap(next,resolved);assertDocumentCapacity(next,{includeTimeline:false,reserveBytes:DOCUMENT_LIMITS.preflightReserveBytes});
  if(!identity||identity.owner==='ui')assertHumanEditing();
  const generation=++previewGeneration;previewComputing=true;previewComputingOwner=identity?.owner??'ui';setBusy(true,'预览 / Preview…');
  try{const routed=await routeChangedFeature(next,{expectedRevision:revision});next=routed.next;const result=await request('rebuild',{document:next});
    if(generation!==previewGeneration){await request('rebuild',{document:documentModel});previewNext=null;viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds,selectedTopology);return false;}
    previewNext=next;previewIdentity=identity;const previewBody=result.bodies.find(body=>body.id===(editId??next.features.at(-1)?.id));previewScopeReport=op==='meshReliefEdit'?previewBody?.meshReport?.edit||null:['relief','reliefShoulder'].includes(op)?previewBody?.reliefReport||null:op==='refineShape'?previewBody?.refineReport||null:op==='round'?previewBody?.roundReport||null:op==='rounding'?previewBody?.roundingReport||null:op==='roundEnd'?previewBody?.endRoundingReport||null:null;
    viewport.setBodies(result.bodies,next.hidden);viewport.setSelection([]);
    if(previewScopeReport&&op==='rounding'){const sourceBody=bodies.find(body=>body.id===refs[0]);viewport.setScopeOverlay(sourceBody?.edges,previewScopeReport.requestedSelection,previewScopeReport.expandedSelection);}
    if(op==='round'&&previewScopeReport){previewScopeReport={...previewScopeReport,previewBodyId:previewBody.id,sourceBodyId:refs[0]};viewport.setRoundGuide(previewScopeReport);if(previewScopeReport.mode==='edge')viewport.setScopeOverlay(bodies.find(b=>b.id===refs[0])?.edges,params.edgeIds||[],params.edgeIds||[]);}
    if(!bodies.length)viewport.fit();setStatus('预览未保存 · 应用或取消 / Preview: apply or cancel');return previewScopeReport?{[['relief','reliefShoulder'].includes(op)?'reliefReport':op==='refineShape'?'refineReport':op==='round'?'roundReport':op==='roundEnd'?'endRoundingReport':'roundingReport']:clone(previewScopeReport)}:true;}
  catch(error){if(error.code==='PREVIEW_CANCELLED')return false;previewScopeReport=null;if(previousPreview&&previousIdentity?.previewId===identity?.previewId){const restored=await request('rebuild',{document:previousPreview});previewNext=previousPreview;previewIdentity=previousIdentity;previewScopeReport=previousScopeReport;viewport.setBodies(restored.bodies,previousPreview.hidden);}else{previewNext=null;previewIdentity=null;await request('rebuild',{document:documentModel});viewport.setBodies(bodies,documentModel.hidden);}throw error;}
  finally{previewComputing=false;if(recoveryPromise)await recoveryPromise.catch(()=>{});setBusy(false);}
}
async function previewFile(fileImport,identity,update=false){
  if(busy)throw new Error('Please wait for the current operation.');
  const previousPreview=previewNext,previousIdentity=previewIdentity,next=update?clone(previewNext):clone(documentModel);
  if(update){if(!next||!previousIdentity||previousIdentity.previewId!==identity.previewId||previousIdentity.generation+1!==identity.generation)throw Object.assign(new Error('Preview generation changed'),{code:'STALE_REFERENCE'});next.features.at(-1).placement=fileImport.placement;}
  else{const {name,data,placement}=fileImport,extension=name.split('.').pop().toLowerCase(),format=['step','stp'].includes(extension)?'step':['brep','brp'].includes(extension)?'brep':null;if(!format)throw Object.assign(new Error('Unsupported file preview format'),{code:'FORMAT_UNSUPPORTED'});const key=crypto.randomUUID(),id=crypto.randomUUID();attachExactSource(next,{key,name,format,data});next.features.push(markTopologySemantics({id,op:'import',name,params:{key},refs:[],placement,semanticsVersion:2}));}
  assertDocumentCapacity(next,{includeTimeline:false,reserveBytes:DOCUMENT_LIMITS.preflightReserveBytes});
  if(!identity||identity.owner==='ui')assertHumanEditing();
  const generation=++previewGeneration;previewComputing=true;previewComputingOwner=identity?.owner??'ui';setBusy(true,'文件插入预览 / File preview…');
  try{const result=await request('rebuild',{document:next});if(generation!==previewGeneration){await request('rebuild',{document:documentModel});previewNext=null;previewIdentity=null;previewScopeReport=null;viewport.clearScopeOverlay();viewport.setBodies(bodies,documentModel.hidden);return false;}previewNext=next;previewIdentity=identity;previewScopeReport=null;viewport.clearScopeOverlay();viewport.setBodies(result.bodies,next.hidden);viewport.setSelection([]);setStatus('文件插入预览未保存 · 应用或取消');return true;}
  catch(error){if(error.code==='PREVIEW_CANCELLED')return false;if(previousPreview&&previousIdentity?.previewId===identity?.previewId){const restored=await request('rebuild',{document:previousPreview});previewNext=previousPreview;previewIdentity=previousIdentity;viewport.setBodies(restored.bodies,previousPreview.hidden);}else{await request('rebuild',{document:documentModel});previewNext=null;previewIdentity=null;viewport.setBodies(bodies,documentModel.hidden);}throw error;}
  finally{previewComputing=false;if(recoveryPromise)await recoveryPromise.catch(()=>{});setBusy(false);}
}
async function cancelPreview(){viewport.clearRoundGuide();previewGeneration++;previewScopeReport=null;viewport.clearScopeOverlay();if(previewComputing){previewNext=null;previewIdentity=null;setBusy(true,'取消并恢复内核 / Cancel and recover kernel…');try{await restartWorker(Object.assign(new Error('Preview cancelled'),{code:'PREVIEW_CANCELLED'}));}finally{setBusy(false);}return;}if(!previewNext)return;setBusy(true,'取消预览 / Cancel preview…');try{await request('rebuild',{document:documentModel});previewNext=null;previewIdentity=null;viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds,selectedTopology);}finally{setBusy(false);}}

function safeName(name){return (name||'WebCAD').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.{2,}/g,'_').replace(/[. ]+$/g,'').slice(0,120)||'WebCAD';}
function download(data,name,mime='application/octet-stream'){
  const blob=data instanceof Blob?data:new Blob([data],{type:mime});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportData(format='step',ids){
  if(previewNext)throw new Error('请先应用或取消预览。 / Apply or cancel preview first.');
  if(!kernelReady)throw new Error('内核尚未就绪，请保存工程后刷新页面。');
  if(!bodies.length)throw new Error('当前工程没有可导出的实体。');
  if(busy)throw new Error('请等待当前计算完成。');setBusy(true,'正在生成导出文件…');
  try{const result=await request('export',{format,ids,appearance:{colors:clone(documentModel.colors||{}),defaultColor:viewport.displayPreferences.defaultColor}});setStatus('导出内容已生成。');return result;}
  catch(error){setStatus(errorRecovery(error).userMessage,'error');throw error;}
  finally{setBusy(false);}
}
let projectFileHandle=null,lastOutputResource=null;
const openedFileHandles=new WeakMap();
function retainOutput(artifact){
  if(lastOutputResource)try{pageAPI.files.release({resourceId:lastOutputResource});}catch{/* It may already have expired. */}
  lastOutputResource=artifact.resourceId;
}
async function saveProject(){
  // Save the committed document; an unfinished calculation or preview is excluded.
  // Acquire permission synchronously from the user gesture, before expensive generation.
  if(!projectFileHandle&&window.showSaveFilePicker){
    try{projectFileHandle=await window.showSaveFilePicker({suggestedName:safeName(documentModel.name)+'.webcad',types:[{description:'WebCAD 工程',accept:{'application/json':['.webcad']}}]});}
    catch(error){if(error.name==='AbortError'){setStatus('保存已取消，工程保留。');return false;}projectFileHandle=null;}
  }
  const c=pageAPI.getState().context,context={...c,expectedRevision:c.revision};delete context.revision;
  const artifact=await pageAPI.files.save({context,name:safeName(documentModel.name)+'.webcad'});if(artifact.status==='failed')throw new Error(artifact.error.message);
  retainOutput(artifact);
  try{
    const result=projectFileHandle?await pageAPI.files.write({resourceId:artifact.resourceId,handle:projectFileHandle}):await pageAPI.files.download({resourceId:artifact.resourceId});
    if(result.status==='failed')throw new Error(result.error.message);
    ui.showFileReceipt(artifact,result);
  }catch(error){
    projectFileHandle=null;
    // Embedded/mobile browsers may deny direct file handles. Keep these exact
    // generated bytes available through the ordinary download path instead.
    const fallback=await pageAPI.files.download({resourceId:artifact.resourceId});
    ui.showFileReceipt(artifact,fallback);
    if(fallback.status==='failed')throw Object.assign(new Error(fallback.error.message),fallback.error);
  }
  setStatus(projectFileHandle?'文件已写入、关闭并回读核验；保存状态按版本更新。':'下载已发起；未确认写入，未保存标记保留。');refresh();
}
async function chooseFile(accept='.webcad,.json,.step,.stp,.brep,.brp,.iges,.igs,.stl,.mesh',multiple=true){
  if(accept==='.webcad,.json,.step,.stp,.brep,.brp,.iges,.igs,.stl,.mesh'&&window.showOpenFilePicker){
    try{const handles=await window.showOpenFilePicker({multiple,types:[{description:'WebCAD、CAD 与网格文件',accept:{'application/json':['.webcad','.json'],'application/octet-stream':['.step','.stp','.brep','.brp','.iges','.igs','.stl','.mesh']}}]});const files=await Promise.all(handles.map(async handle=>{const file=await handle.getFile();openedFileHandles.set(file,{handle,id:null});return file;}));return files;}
    catch(error){if(error.name==='AbortError')return [];if(error.name!=='NotAllowedError')throw error;}
  }
  return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.multiple=multiple;input.addEventListener('change',()=>resolve([...input.files]));input.addEventListener('cancel',()=>resolve([]));input.click();});
}
function base64(array){let text='';for(let i=0;i<array.length;i+=0x8000)text+=String.fromCharCode(...array.subarray(i,i+0x8000));return btoa(text);}
function validateDocument(doc){
  if(!doc||![1,2,3,4].includes(doc.version)||!Array.isArray(doc.features)||typeof doc.imports!=='object'||!doc.imports)throw new Error('不是有效的 WebCAD 1.x/2.x/3.x/4.x 工程文件。');
  assertDocumentCapacity(doc);
  const ids=new Set();for(const f of doc.features){if(!f.id||ids.has(f.id)||typeof f.op!=='string'||!f.params||!Array.isArray(f.refs))throw new Error('工程特征结构无效。');for(const ref of f.refs)if(!ids.has(ref))throw new Error('工程包含无效的操作引用。');if(f.placement!==undefined){if(![2,3,4].includes(doc.version)||f.semanticsVersion!==2)throw Object.assign(new Error('定位特征需要工程版本 2 和语义版本 2。'),{code:'DOCUMENT_VERSION_UNSUPPORTED'});validateResolvedPlacement(f.placement,f.op);}ids.add(f.id);}
  validateReliefDesigns(doc.reliefDesigns);
  if(doc.timeline)validateTimeline(doc);
  const normalized={...(doc.renderMaterials?{renderMaterials:validateMetalMaterials(doc.renderMaterials)}:{}),materialSettings:validateMaterialSettings(doc.materialSettings??loadMaterialSettings()),...(doc.timeline?clone(doc):{}),...(doc.reliefDesigns!==undefined?{reliefDesigns:validateReliefDesigns(doc.reliefDesigns)}:{}),version:doc.version>=3?doc.version:2,...(doc.version===4?{binaryAssets:doc.binaryAssets||{}}:{}),...(doc.version>=3?{compiledArtifacts:doc.compiledArtifacts||{}}:{}),referenceSystem:doc.referenceSystem!==undefined?validateReferenceSystem(doc.referenceSystem):createReferenceSystem(),...(doc.parameters!==undefined?{parameters:doc.parameters}:{}),documentId:typeof doc.documentId==='string'&&doc.documentId.length>0&&doc.documentId.length<=150?doc.documentId:crypto.randomUUID(),name:String(doc.name||'导入工程'),features:doc.features,imports:doc.imports,hidden:Array.isArray(doc.hidden)?doc.hidden:[],appearance:doc.appearance&&typeof doc.appearance==='object'?doc.appearance:{},colors:doc.colors&&typeof doc.colors==='object'?Object.fromEntries(Object.entries(doc.colors).filter(([,v])=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))):{},renderFinish:doc.renderFinish??null};
  // Add missing legacy defaults as a new transition; never rewrite old states
  // or drop their source bytes. Explicit invalid reference data still fails.
  if(doc.timeline){recordTimeline(doc,normalized,{label:'兼容旧版工程元数据'});validateTimeline(normalized);}
  return normalized;
}
// 打开 replaces the document; 插入 adds into it. The intent is explicit, never inferred
// from the file extension (opening a STEP while editing used to append silently).
function checkInputFile(file,signal,expectedRevision){
  checkTransaction(signal,expectedRevision);
  if(file.size>fileByteBudget(file.name))throw Object.assign(new Error(`单文件超过 ${fileByteBudget(file.name)/1024/1024} MiB；请先拆分模型。导入后自包含工程也必须可在相应格式限额内保存。`),{code:'SIZE_LIMIT'});
}
function assertOpenReady(mcp){
  if(ui.hasActiveTask())throw Object.assign(new Error('请先应用或取消当前未提交的人工草稿，再打开文件。'),{code:'UI_TASK_ACTIVE'});
  if(busy){if(mcp)throw new Error('Worker is busy');return false;}
  return true;
}
// Adds one STEP/BREP/STL/MESH import feature to `next`. Returns null when the user cancels.
async function appendModel(next,file,{mcp=false,placement,units}={}){
  const ext=extensionOf(file.name);
  if(['stl','mesh'].includes(ext)){
    const declared=units??(mcp?undefined:prompt('网格源单位（STL没有单位）：填写 mm、cm、m 或 in；取消保留原工程。',''));if(declared===null)return null;meshScale(declared);if(ext==='mesh'&&declared!=='mm')throw Object.assign(new Error('Float64网格已使用mm。'),{code:'MESH_UNITS_REQUIRED'});
    const bytes=new Uint8Array(await file.arrayBuffer()),hash=binaryHash(bytes).slice(7),key=crypto.randomUUID(),id=crypto.randomUUID();next.version=4;next.binaryAssets={...next.binaryAssets,[hash]:bytes};next.imports[key]={format:ext,units:declared,assetHash:hash,name:file.name};next.features.push(markTopologySemantics({id,op:'import',name:file.name,params:{key},refs:[],...(placement?{placement,semanticsVersion:2}:{})}));
    return {id,large:false};
  }
  const format=['step','stp'].includes(ext)?'step':['brep','brp'].includes(ext)?'brep':null;
  if(!format)throw Object.assign(new Error('请选择 STEP/STP、BREP 或 STL 模型文件。'),{code:'FORMAT_UNSUPPORTED'});
  const key=crypto.randomUUID(),id=crypto.randomUUID();
  attachExactSource(next,{key,name:file.name,format,data:new Uint8Array(await file.arrayBuffer())});
  next.features.push(markTopologySemantics({id,op:'import',name:file.name,params:{key},refs:[],...(placement?{placement,semanticsVersion:2}:{})}));
  return {id,large:true};
}
// UI: 保存 / 不保存 / 取消. Returns true when replacing may proceed.
async function confirmReplaceUnsaved(){
  if(!dirty)return true;
  const choice=await chooseAction({title:'当前设计尚未保存',message:'“打开”会替换当前设计（不会合并）。是否先保存当前设计？',choices:UNSAVED_CHOICES,defaultId:'cancel'});
  if(choice==='cancel')return false;
  if(choice==='save')return (await saveProject())!==false;
  return true;
}
async function openDocument(file,{signal,expectedRevision,mcp=false,unsaved,units}={}){
  if(!assertOpenReady(mcp))return {status:'cancelled'};
  checkInputFile(file,signal,expectedRevision);assertOpenable(file.name);
  if(mcp)assertOpenAllowed({unsaved,dirty});else if(!await confirmReplaceUnsaved())return {status:'cancelled'};
  return withLoading(()=>openDocumentLoaded(file,{signal,expectedRevision,mcp,units}));
}
async function openDocumentLoaded(file,{signal,expectedRevision,mcp=false,units}={}){
  let next,select,large=false;
  if(classifyFile(file.name)==='project')next=validateDocument((await request('decodeProject',{bytes:new Uint8Array(await file.arrayBuffer())})).document);
  else{
    next=emptyDocument();const added=await appendModel(next,file,{mcp,units});if(!added)return {status:'cancelled'};
    select=added.id;large=added.large;next.name=file.name.replace(/\.[^.]+$/,'');
  }
  const options={fit:true,newInstance:true,record:false,signal,expectedRevision,...(select?{select}:{})};
  await (large?rebuildLargeImport(next,options):rebuild(next,options));
  undoStack=[];redoStack=[];dirty=false;refresh();await rememberOpenedFile(file);
  return {status:'opened'};
}
async function insertModels(files,{signal,expectedRevision,mcp=false,placement,units}={}){
  if(!assertOpenReady(mcp))return;
  for(const file of files){
    checkInputFile(file,signal,expectedRevision);assertInsertable(file.name);
    const done=await withLoading(async()=>{
      const next=clone(documentModel),added=await appendModel(next,file,{mcp,placement,units});if(!added)return false;
      if(!next.features.slice(0,-1).length)next.name=file.name.replace(/\.[^.]+$/,'');
      const options={fit:true,signal,expectedRevision};
      await (added.large?rebuildLargeImport(next,options):rebuild(next,options));return true;
    });if(!done)return;
  }
}
async function handleDroppedFiles(files){
  const decision=dropDecision({files,documentEmpty:!documentModel.features.length,dirty});
  if(decision.mode==='reject')throw Object.assign(new Error(decision.reason==='ONE_PROJECT_ONLY'?'一次只能打开一个工程文件。':'不支持的文件类型；请拖入 .webcad 工程或 STEP/BREP/STL 模型。'),{code:'FORMAT_UNSUPPORTED'});
  const choice=decision.mode==='ask'?await chooseAction({title:'如何处理拖入的文件？',message:`${files.map(f=>f.name).join('、')}\n“打开”会替换当前设计；“插入”会加入当前设计。`,choices:decision.choices.map(id=>({id,label:DROP_CHOICE_LABELS[id]})),defaultId:decision.defaultChoice}):decision.mode;
  if(choice==='open')return openDocument(files[0]);
  if(choice==='insert')return insertModels(files);
}
// STEP/BREP import: if the kernel crashes, runs out of wasm memory or stalls,
// restart it (restoring the committed project) and retry once with a coarser
// display tessellation before reporting a readable error.
const kernelFailure=error=>['KERNEL_TIMEOUT','KERNEL_CRASHED'].includes(error?.code)||/memory access out of bounds|out of memory|Aborted|unreachable|RangeError/i.test(`${error?.message} ${error?.cause?.message||''}`);
async function rebuildLargeImport(next,options){
  const hardTimeoutMs=Math.max(getServicesConfig().localTimeoutMs,120000);
  try{return await rebuild(next,{...options,hardTimeoutMs});}
  catch(error){
    if(!kernelFailure(error)||displayCoarsen>=16)throw error;
    setStatus('模型过大，内核已重启，正在以较粗显示精度重试…');
    try{await restartWorker(Object.assign(new Error('导入重试'),{code:'KERNEL_RECOVERY_REQUESTED'}));}catch{}
    displayCoarsen*=4;
    try{return await rebuild(next,{...options,hardTimeoutMs});}
    catch(retry){
      if(!kernelFailure(retry))throw retry;
      try{await restartWorker(Object.assign(new Error('导入失败恢复'),{code:'KERNEL_RECOVERY_REQUESTED'}));}catch{}
      throw Object.assign(new Error('模型过大，浏览器内核在较粗显示精度下仍无法完成导入（内存不足或超时）。原工程未改变；请在原 CAD 中简化曲面或拆分后再导入。'),{code:'IMPORT_TOO_LARGE',cause:retry});
    }
  }
}
async function performAction(action,params={}){
  if(action==='markLocation'){const result=await pageAPI.markLocation({context:pageAPI.getState().context,active:true});if(result.status==='failed'){const error=result.error;if(error.code==='AGENT_COMPOSER_UNAVAILABLE')error.userMessage=error.message;reportError(error);}return result;}
  if(!['save','downloadResource'].includes(action))assertHumanEditing();
  if(['copySelection','pasteSelection'].includes(action))return performShortcut(action);
  if(action==='downloadResource'){const result=await pageAPI.files.download({resourceId:params.resourceId});setStatus('下载已发起；请在浏览器下载记录中确认。');return result;}
  if(action==='renderQuality'){const result=await pageAPI.setRenderQuality({context:pageAPI.getState().context,quality:params.quality});if(result.status==='failed')throw new Error(result.error.message);return result;}
  params=params||{};
  if(action==='parameters'){
    const {revision:r,...c}=pageAPI.getState().context;
    const result=await pageAPI.execute({context:{...c,expectedRevision:r},idempotencyKey:crypto.randomUUID(),action:'document.parameters',args:{parameters:params.parameters}});
    if(result.status==='failed')throw Object.assign(new Error(result.error.message),result.error);return result;
  }
  if(action==='reference.snapNearest'){
    if(selectedTopology?.type!=='edge'||selectedTopology.ids?.length!==1)throw Object.assign(new Error('请先只选择一条 CAD 边'),{code:'NO_MATCH'});
    const atRevision=revision,selection=clone(selectedTopology),body=bodies.find(x=>x.id===selection.bodyId);
    const exact=await request('queryGeometry',{bodyId:selection.bodyId,kind:'edge',filter:{}});
    if(revision!==atRevision||selectedTopology?.bodyId!==selection.bodyId||selectedTopology?.ids?.[0]!==selection.ids[0])throw Object.assign(new Error('选择或工程已变化，请重新选边'),{code:'STALE_REFERENCE'});
    const edge=exact.items.find(item=>item.edgeId===selection.ids[0]);if(!edge)throw Object.assign(new Error('当前边已失效'),{code:'STALE_REFERENCE'});
    const candidates=[['CAD 顶点（起点）',edge.startPoint],['CAD 顶点（终点）',edge.endPoint],['真实边中点',edge.lengthMidpoint],...(edge.center?[['解析圆心',edge.center]]:[])].filter(([,point])=>Array.isArray(point));
    return {status:'choose',candidates:candidates.filter((item,index)=>!candidates.slice(0,index).some(other=>Math.hypot(...item[1].map((v,i)=>v-other[1][i]))<1e-7)).map(([label,point])=>({label,point,sourceLabel:`${label} · ${body.name}`}))};
  }
  if(action==='reference.alignSelectedFace'){
    if(selectedTopology?.type!=='face'||selectedTopology.ids?.length!==1)throw Object.assign(new Error('请先只选择一个精确平面面片'),{code:'NO_MATCH'});
    const atRevision=revision,selection=clone(selectedTopology),work=clone(documentModel.referenceSystem.workFrame);
    const face=await request('faceInfo',{bodyId:selection.bodyId,faceId:selection.ids[0]});
    if(revision!==atRevision||selectedTopology?.bodyId!==selection.bodyId||selectedTopology?.ids?.[0]!==selection.ids[0])throw Object.assign(new Error('选择或工程已变化，请重新选面'),{code:'STALE_REFERENCE'});
    const aligned=frameOnPlane(work.origin,face.normal,work.quaternion);
    return runEditorAction('reference.setWorkFrame',{...aligned,sourceLabel:'与选中平面对齐'});
  }
  if(action.startsWith('reference.')&&ui.hasActiveTask())return executeAI('reference_action',{referenceSystem:applyReferenceAction(documentModel.referenceSystem,action,params)},{fromUI:true,expectedRevision:revision});
  if(action.startsWith('reference.'))return runEditorAction(action,params);
  if(action==='language'){viewport.updateLanguage();refresh();return;}
  if(action==='cancelPreview'){await cancelPreview();return;}
  if(action==='commitPreview'){if(!previewNext)throw new Error('No preview to apply');await rebuild(clone(previewNext));return true;}
  if(action==='heightfieldSculpt'){
    const feature=documentModel.features.find(f=>f.id===params.featureId);if(feature?.op!=='meshHeightfieldRelief')throw new Error('请选择一个高度图浮雕实体。');
    const sculpt=params.undo?(feature.params.sculpt||[]).slice(0,-1):[...(feature.params.sculpt||[]),...params.strokes];
    return editFeature(feature.id,{...feature.params,sculpt},undefined,{historyLabel:params.undo?'撤销精修笔画':'高度图精修'});
  }
  if(action==='preview'&&params.heightmapAsset){
    const {bytes,name}=params.heightmapAsset,hash=binaryHash(bytes).slice(7),key='heightmap-'+hash.slice(0,16);pendingHeightmap={key,hash,bytes,name};
    params={...params,params:{...params.params,heights:{encoding:params.params.heights.encoding,importKey:key}}};delete params.heightmapAsset;
  }
  if(action==='preview'){
    const input=clone(params.params),useFrame=input.useWorkFrame===true,sourceAnchor=input.placementSourceAnchor,taskRefs=input._targetRefs,taskTopology=input._targetTopology,frameSnapshot=input._placementFrameSnapshot;delete input.useWorkFrame;delete input.placementSourceAnchor;delete input._targetRefs;delete input._targetTopology;delete input._placementFrameSnapshot;
    const placement=useFrame?resolvePlacement({version:1,frame:frameSnapshot?{kind:'snapshot',origin:[...frameSnapshot.origin],quaternion:[...frameSnapshot.quaternion]}:{kind:'work',expectedFrameVersion:documentModel.referenceSystem.workFrame.frameVersion},sourceAnchor:sourceAnchor||{kind:params.op==='box'?'bottom-center':'model-origin'}},documentModel.referenceSystem,params.op,input):undefined;
    return previewFeature(params.op,taskRefs?adaptUISelection(params.op,input,taskRefs,taskTopology):input,taskRefs,undefined,placement);
  }
  if(action==='gizmo'){if(params.mode!=='off'){viewport.setAnchorDrag(false);viewport.setSelectionMode('body');selectedTopology=null;viewport.setSelection(selectedIds);}viewport.setGizmo(params.mode);refresh();return;}
  if(action==='anchorDrag'){if(documentModel.referenceSystem.workFrame.locked)throw Object.assign(new Error('工作基准已锁定'),{code:'REFERENCE_LOCKED'});viewport.setAnchorDrag(!viewport.anchorDragEnabled);refresh();return;}
  if(action==='anchorVisibility'){viewport.setAnchorVisible(params.visible);refresh();return;}
  if(action==='snap'){viewport.snapEnabled=params.enabled??!viewport.snapEnabled;setStatus(viewport.snapEnabled?'几何吸附已启用 / Snap enabled':'吸附已关闭 / Snap disabled');refresh();return;}
  if(action==='section'){viewport.setSection(params);return;}
  if(action==='perPartMetal')return runEditorAction('body.appearance',{bodyIds:[...selectedIds],finish:params.key});
  if(action==='bodyColor')return runEditorAction('body.appearance',{bodyIds:[...selectedIds],color:params.color,finish:'design'});
  if(action==='metalMaterials'){const result=await pageAPI.setMetalMaterials({context:pageAPI.getState().context,configuration:params.configuration});if(result.status==='failed')throw Object.assign(new Error(result.error.message),result.error);return result;}
  if(action==='displayPreferences'){const {revision:r,...identity}=pageAPI.getState().context;const result=await pageAPI.setDisplayPreferences({context:{...identity,expectedRevision:r},values:params});if(result.status==='failed')throw new Error(result.error.message);return result;}
  if(action==='inspectPrintability'){const {revision:r,...identity}=pageAPI.getState().context;const result=await pageAPI.inspectPrintability({context:{...identity,expectedRevision:r},bodyId:params.bodyId,angleLimitDeg:params.angleLimitDeg});if(result.status==='failed')throw Object.assign(new Error(result.error.message),result.error);return result;}
  if(action==='inspectFit'){const {revision:r,...identity}=pageAPI.getState().context;const result=await pageAPI.inspectFit({context:{...identity,expectedRevision:r},bodyAId:params.bodyAId,bodyBId:params.bodyBId,toleranceMm:params.toleranceMm});if(result.status==='failed')throw Object.assign(new Error(result.error.message),result.error);return result;}
  if(action==='inspectThickness'){const {revision:r,...identity}=pageAPI.getState().context;const result=await pageAPI.inspectThickness({context:{...identity,expectedRevision:r},...params});if(result.status==='failed')throw Object.assign(new Error(result.error.message),result.error);return result;}
  if(action==='inspectDraft'){const {revision:r,...identity}=pageAPI.getState().context;const result=await pageAPI.inspectDraft({context:{...identity,expectedRevision:r},...params});if(result.status==='failed')throw Object.assign(new Error(result.error.message),result.error);return result;}
  if(action==='measureRelation'){const {revision:r,...identity}=pageAPI.getState().context;const result=await pageAPI.measureRelation({context:{...identity,expectedRevision:r},...params});if(result.status==='failed')throw Object.assign(new Error(result.error.message),result.error);return result;}
  if(action==='materialSettings')return runEditorAction('document.materials',{settings:params});
  if(action==='metalFinish')return runEditorAction('document.appearance',{finish:params.key});
  if(action==='fit'){viewport.fit();return;}
  if(action==='floorSelected'){
    const body=bodies.find(row=>row.id===params.bodyId);if(!body)throw new Error('请选择一个当前实体。');
    const dz=-body.bounds.min[2];if(!Number.isFinite(dz))throw new Error('当前实体没有有效包围盒。');
    const result=await addFeature('transform',{align:{axis:'z',to:'min',valueMm:0}},{refs:[body.id],name:'落地对齐'});setStatus(`已落地 · 最低点 Z=0 mm · 位移 ${dz.toFixed(3)} mm`);return {status:'committed',bodyId:result.bodies.find(row=>row.alignmentReport)?.id,dz};
  }
  if(action==='view'){viewport.view(params.direction);return;}
  if(action==='display')return pageAPI.setView({context:pageAPI.createRequestContext(),display:params.mode});
  if(action==='projection'){viewport.setProjection(params.mode);document.querySelector('.view-label').textContent=params.mode==='orthographic'?'正交视图':'透视视图';refresh();return;}
  if(action==='grid'){setStatus(viewport.toggleGrid()?'网格已显示':'网格已隐藏');refresh();return;}
  if(action==='restoreHistory')return runEditorAction('history.restore',params);
  if(action==='alignBodies')return runEditorAction('body.align',params);
  if(action==='alignmentPlan')return planBodyAlignment(params,bodies,documentModel.referenceSystem);
  if(action==='drawingCreate'){const {revision,...identity}=pageAPI.getState().context;return pageAPI.createDrawing({context:{...identity,expectedRevision:revision},...params});}
  if(action==='drawingExport'){const {revision,...identity}=pageAPI.getState().context;const artifact=await pageAPI.exportDrawing({context:{...identity,expectedRevision:revision},...params});if(artifact.status==='failed')throw new Error(artifact.error.message);const result=await pageAPI.files.download({resourceId:artifact.resourceId});return {artifact,result};}
  if(action==='selectTool'){await cancelPreview();viewport.setGizmo('off');viewport.setSelectionMode('body');viewport.renderer.domElement.style.cursor='default';selectedTopology=null;viewport.setSelection(selectedIds);refresh();return;}
  if(action==='selectMode'){if(params.mode!=='body')viewport.setGizmo('off');viewport.setSelectionMode(params.mode);selectedTopology=null;viewport.setSelection(selectedIds);refresh();return;}
  if(action==='help'){ui.showInfo('WebCAD 使用说明','新建实体：选择基本体，输入毫米尺寸。选择：点击模型或左侧实体，Shift 多选。切除：先选主体，再选刀具。圆角/倒角：切换选边，可 Shift 选择多条边；处理全部边需明确勾选。抽壳：先选开口面。草图：在 XY 网格点击轮廓后拉伸。左键拖动旋转，右键平移，滚轮缩放，F 适配。Ctrl+Z 撤销，Ctrl+Shift+Z 重做，Ctrl+S 保存工程。STEP/BREP 可导入后加工；原 CAD 特征树不会恢复。保存 .webcad 保留参数历史，导出 STEP 用于 Creo / SolidWorks / FreeCAD，STL 用于切片打印。');return;}
  if(action==='screenshot'){const link=document.createElement('a');link.href=viewport.screenshot().dataUrl;link.download=safeName(documentModel.name)+'.png';link.click();return;}
  if(action==='save'){await saveProject();return;}
  if(busy)throw new Error('当前操作尚未完成，请稍候。');
  if(previewNext)throw new Error('请先应用或取消预览。 / Apply or cancel preview first.');
  if(action==='explode')return runEditorAction('body.explode',{bodyId:selectedIds.length===1?selectedIds[0]:null});
  if(action==='new'){
    if(dirty&&!confirm('当前设计尚未另存。确定新建设计？（可以取消后先保存）'))return;
    // A new project starts a separate history, just like the public file_new path.
    await rebuild(emptyDocument(),{fit:true,newInstance:true,record:false});undoStack=[];redoStack=[];selectedIds=[];dirty=false;refresh();return;
  }
  if(action==='open'){
    const recent=await listRecentFiles(),choices=[...recent.map((item,index)=>({id:`recent-${index}`,label:`${item.name} · 最近打开`})),{id:'browse',label:'选择文件…'},{id:'cancel',label:'取消'}];
    const choice=recent.length?await chooseAction({title:'打开文件',message:'选择最近打开的文件，或浏览本机文件。',choices,defaultId:'browse'}):'browse';
    if(choice==='cancel')return;
    if(choice.startsWith('recent-')){const item=recent[Number(choice.slice(7))];if(!item)throw new Error('最近文件记录已变化，请重新打开。');const permission=await item.handle.queryPermission({mode:'read'});if(permission!=='granted'&&await item.handle.requestPermission({mode:'read'})!=='granted')throw new Error('没有读取该文件的权限。');const file=await item.handle.getFile();openedFileHandles.set(file,item);await openDocument(file);return;}
    const [file]=await chooseFile(undefined,false);if(file)await openDocument(file);return;
  }
  if(action==='importAtFrame'){
    const [file]=await chooseFile('.step,.stp,.brep,.brp',false);
    if(!file)return;
    const resource=await pageAPI.files.register({name:file.name,data:file});
    try{
      const context=pageAPI.getState().context;
      const placement={version:1,frame:{kind:'work',expectedFrameVersion:documentModel.referenceSystem.workFrame.frameVersion},sourceAnchor:{kind:'bounds-center'}};
      const result=await pageAPI.files.import({context:{sessionId:context.sessionId,documentId:context.documentId,documentInstanceId:context.documentInstanceId,expectedRevision:context.revision},resourceId:resource.resourceId,placement,idempotencyKey:crypto.randomUUID()});
      setStatus(`已按工作基准定位导入 ${file.name}`);return result;
    }finally{pageAPI.files.release({resourceId:resource.resourceId});}
  }
  if(action==='export'){
    if(params.selected&&!selectedIds.length)throw new Error('请先选择要导出的实体。');
    const format=params.format||'step';
    const artifact=await pageAPI.files.export({context:pageAPI.getState().context,format,name:safeName(documentModel.name)+'.'+(format==='step'?'stp':format),...(params.selected?{ids:selectedIds}:{})});
    retainOutput(artifact);const result=await pageAPI.files.download({resourceId:artifact.resourceId});
    ui.showFileReceipt(artifact,result);setStatus('导出内容已生成并发起下载；请在浏览器下载记录中确认。');return;
  }
  if(action==='undo'||action==='redo'){await navigateHistory(action);return;}
  if(action==='measure'){
    if(!bodies.length)throw new Error('请先创建或打开模型。');
    if(selectedTopology?.ids.length){
      const results=[];for(const topologyId of selectedTopology.ids)results.push(await request('measure',{bodyId:selectedTopology.bodyId,topologyType:selectedTopology.type,topologyId}));
      const message=results.map((r,i)=>`#${selectedTopology.ids[i]} ${r.geomType||''} ${r.length!==undefined?`L ${r.length.toFixed(4)} mm`:''} ${r.area!==undefined?`A ${r.area.toFixed(4)} mm²`:''} ${r.radius!==undefined?`R ${r.radius.toFixed(4)} mm`:''}`).join('\n');ui.showInfo('精确几何测量 / Exact measurement',message);return results;
    }
    viewport.startMeasure();return;
  }
  if(action==='sketch'){
    if(['circle','rectangle','roundedRectangle','arc'].includes(params.preset)){
      const {preset,useWorkFrame:ignoredFrameFlag,...dimensions}=params,extrude={...dimensions,profile:preset,plane:'XY'};
      const card=getOperation('extrude');return runEditorAction('feature.add',{op:'extrude',opVersion:card.version,schemaHash:card.schemaHash,params:extrude,refs:[],placement:{version:1,frame:{kind:'work',expectedFrameVersion:documentModel.referenceSystem.workFrame.frameVersion},sourceAnchor:{kind:'model-origin'}}});
    }
    viewport.startSketch({...params,frameSnapshot:clone(documentModel.referenceSystem.workFrame),frameVersion:documentModel.referenceSystem.workFrame.frameVersion});return;
  }
  if(Object.hasOwn(labels,action)&&action!=='import'){
    const input={...params},useFrame=input.useWorkFrame===true,sourceAnchor=input.placementSourceAnchor,taskRefs=input._targetRefs,taskTopology=input._targetTopology,frameSnapshot=input._placementFrameSnapshot;delete input.useWorkFrame;delete input.placementSourceAnchor;delete input._targetRefs;delete input._targetTopology;delete input._placementFrameSnapshot;
    const refs=taskRefs||[...selectedIds],adapted=adaptUISelection(action,input,refs,taskRefs?taskTopology:selectedTopology);
    if(useFrame||action==='guidedLoft'){const card=getOperation(action),placedRefs=action==='guidedLoft'?(adapted.matchTo?[adapted.matchTo.featureId]:[]):placementPolicy(action)==='C'?[]:refs;return runEditorAction('feature.add',{op:action,opVersion:card.version,schemaHash:card.schemaHash,params:adapted,refs:placedRefs,placement:{version:1,frame:!useFrame?{kind:'world'}:frameSnapshot?{kind:'snapshot',origin:[...frameSnapshot.origin],quaternion:[...frameSnapshot.quaternion]}:{kind:'work',expectedFrameVersion:documentModel.referenceSystem.workFrame.frameVersion},sourceAnchor:sourceAnchor||{kind:action==='box'?'bottom-center':'model-origin'}}});}
    await addFeature(action,adapted,{refs:action==='guidedLoft'?(adapted.matchTo?[adapted.matchTo.featureId]:[]):refs});return;
  }
  throw new Error('尚未识别的操作：'+action);
}

const dbPromise=new Promise(resolve=>{try{const req=indexedDB.open('webcad-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('documents');req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);}catch{resolve(null);}});
async function listRecentFiles(){const db=await dbPromise;if(!db||!db.objectStoreNames.contains('documents'))return [];return new Promise(resolve=>{try{const request=db.transaction('documents','readonly').objectStore('documents').getAll();request.onsuccess=()=>resolve(request.result.filter(row=>row?.handle&&Number.isFinite(row.openedAt)).sort((a,b)=>b.openedAt-a.openedAt).slice(0,5));request.onerror=()=>resolve([]);}catch{resolve([]);}});}
async function rememberOpenedFile(file){const prior=openedFileHandles.get(file),db=await dbPromise;if(!prior?.handle||!db||!db.objectStoreNames.contains('documents'))return;const entry={id:prior.id||crypto.randomUUID(),name:file.name,handle:prior.handle,openedAt:Date.now()};openedFileHandles.set(file,entry);try{const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents');store.put(entry,'recent:'+entry.id);const request=store.getAll();request.onsuccess=()=>{const rows=request.result.filter(row=>row?.handle&&Number.isFinite(row.openedAt)).sort((a,b)=>b.openedAt-a.openedAt);for(const row of rows.slice(5))store.delete('recent:'+row.id);};}catch{/* Recent handles are optional when browser storage is unavailable. */}}
async function autosave(){
  const snapshot=clone(documentModel),instance=documentInstanceId,savedRevision=revision;
  persistenceCheckpoint='pending';
  const update=value=>{if(instance===documentInstanceId&&savedRevision===revision)persistenceCheckpoint=value;};
  const db=await dbPromise;if(!db){update('failed');return;}
  return new Promise(resolve=>{try{const tx=db.transaction('documents','readwrite');
    const row={document:snapshot,savedAt:Date.now(),instanceId:instance,revision:savedRevision};
    tx.objectStore('documents').put(row,`recovery:${instance}`);
    tx.objectStore('documents').put(row,'recovery:latest');
    try{sessionStorage.setItem('webcad.recovery.latest',JSON.stringify({instanceId:instance,revision:savedRevision,savedAt:row.savedAt,documentId:snapshot.documentId}));}catch{}
    tx.oncomplete=()=>{update('saved');resolve();};
    tx.onerror=tx.onabort=()=>{update('failed');resolve();};
  }catch{update('failed');resolve();}});
}
async function loadLatestRecovery(){
  // Same-tab refresh only: sessionStorage survives reload; a new tab starts clean.
  let hint=null;try{hint=JSON.parse(sessionStorage.getItem('webcad.recovery.latest')||'null');}catch{hint=null;}
  if(!hint?.instanceId)return null;
  const db=await dbPromise;if(!db||!db.objectStoreNames.contains('documents'))return null;
  return new Promise(resolve=>{try{
    const store=db.transaction('documents','readonly').objectStore('documents');
    const tryKey=key=>{
      const req=store.get(key);
      req.onsuccess=()=>{const row=req.result;resolve(row?.document&&Number.isFinite(row.savedAt)?row:null);};
      req.onerror=()=>resolve(null);
    };
    // Prefer the exact instance written this session, then the latest cross-instance snapshot.
    const req=store.get(`recovery:${hint.instanceId}`);
    req.onsuccess=()=>{
      const row=req.result;
      if(row?.document&&Number.isFinite(row.savedAt))return resolve(row);
      tryKey('recovery:latest');
    };
    req.onerror=()=>tryKey('recovery:latest');
  }catch{resolve(null);}});
}
async function pasteModelClipboard(){
  if(!modelClipboard)throw new Error('WebCAD 剪贴板为空。请先选择实体并按 Ctrl+C。');
  if(modelClipboard.documentInstanceId!==documentInstanceId)throw new Error('剪贴板来自另一份工程，请重新选择并复制。');
  if(busy||previewNext||previewComputing||ui.hasActiveTask())throw new Error('请先完成当前任务或预览，再粘贴实体。');
  const sourceIds=modelClipboard.ids;
  if(sourceIds.some(id=>!bodies.some(body=>body.id===id)))throw new Error('复制的来源实体已变化，请重新选择并复制。');
  const selected=sourceIds.map(id=>bodies.find(b=>b.id===id));
  const min=[0,1,2].map(i=>Math.min(...selected.map(b=>b.bounds.min[i]))),max=[0,1,2].map(i=>Math.max(...selected.map(b=>b.bounds.max[i])));
  const sourcePoint=[(min[0]+max[0])/2,(min[1]+max[1])/2,min[2]],delta=documentModel.referenceSystem.workFrame.origin.map((v,i)=>v-sourcePoint[i]);
  const next=clone(documentModel),created=[];
  for(const sourceId of sourceIds){
    const id=crypto.randomUUID(),source=bodies.find(body=>body.id===sourceId);
    next.features.push(markTopologySemantics({id,op:'copy',name:`${source.name||'实体'} 副本`,params:{positionMode:'relative',x:delta[0],y:delta[1],z:delta[2],rx:0,ry:0,rz:0,scale:1},refs:[sourceId]}));
    if(next.appearance?.[sourceId])next.appearance[id]=next.appearance[sourceId];
    if(next.colors?.[sourceId])next.colors[id]=next.colors[sourceId];
    created.push(id);
  }
  await rebuild(next);
  modelClipboard.pasteCount++;
  selectedTopology=null;viewport.setSelection(selectedIds);refresh();
  setStatus(`已粘贴 ${created.length} 个实体 · 可撤销`);return created;
}
async function performShortcut(action){
  if(action==='selectAll'){
    if(busy||ui.hasActiveTask())return;
    selectedIds=bodies.filter(body=>!documentModel.hidden.includes(body.id)).map(body=>body.id);
    selectedTopology=null;viewport.setSelection(selectedIds);refresh();setStatus(`已选择 ${selectedIds.length} 个可见实体`);return;
  }
  if(action==='copySelection'){
    if(busy||ui.hasActiveTask())return;
    if(!selectedIds.length)throw new Error('请先选择要复制的实体。');
    modelClipboard={documentInstanceId,ids:[...selectedIds],pasteCount:0};
    setStatus(`已复制 ${selectedIds.length} 个实体到 WebCAD 剪贴板`);return;
  }
  if(action==='pasteSelection')return pasteModelClipboard();
  return performAction(action);
}
document.addEventListener('keydown',event=>{
  if(hostControl.get().locked&&!((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'))return;
  const typing=event.target instanceof Element&&!!event.target.closest('input,textarea,select,[contenteditable=true]');
  if(event.key==='Escape'){if(event.isComposing)return;if(previewComputing){ui.cancelTaskPicking();ui.cancelActiveTask();cancelPreview().catch(reportError);return;}if(ui.cancelTaskPicking()||ui.cancelActiveTask())return;viewport.cancelAnchorDrag();viewport.setGizmo('off');viewport.cancelTask();if(previewNext)cancelPreview().catch(reportError);if(!typing){viewport.setSelectionMode('view');selectBody(null);}else refresh();return;}
  const action=webcadShortcut(event,{editing:typing,dialogOpen:!!document.querySelector('dialog[open]')});
  if(action){event.preventDefault();performShortcut(action).catch(reportError);}
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
const host=document.getElementById('viewport');host.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect=hostControl.get().locked?'none':'copy';});host.addEventListener('drop',event=>{event.preventDefault();if(!hostControl.get().locked)handleDroppedFiles([...event.dataTransfer.files]).catch(reportError);});

refresh();
const ready=(async()=>{
  try{await withLoading(async()=>{
    await request('ready');kernelReady=true;
    // Same-tab refresh: restore the latest autosaved project (incl. reliefDesigns) so E2 retained drafts survive reload.
    const recovered=await loadLatestRecovery();
    const recDoc=recovered?.document;
    const hasContent=!!(recDoc&&((recDoc.features?.length||0)>0||(recDoc.reliefDesigns?.length||0)>0||recDoc.name));
    if(hasContent){
      documentInstanceId=recovered.instanceId||documentInstanceId;
      await rebuild(clone(recDoc),{record:false,save:false,newInstance:false,restoring:true});
      dirty=true;persistenceCheckpoint='saved';
      setStatus('已从本机恢复刷新前的工程（含已保存到工程的浮雕草稿）；请核对后保存工程文件。');
    }else{
      await rebuild(clone(documentModel),{record:false,save:false});
      dirty=false;setStatus('就绪 · 在工具栏创建实体，或打开 STEP / WebCAD 工程。');
    }
  });refresh();return true;}
  catch(error){reportError(error);return false;}
})();
// Public automation surface also used by reproducible acceptance checks; never runs arbitrary code.
function getState(){return {revision,document:clone(documentModel),bodies:bodies.map(bodyState),selectedIds:[...selectedIds],selectedTopology:clone(selectedTopology),busy,kernelReady,dirty,preview:!!previewNext};}
function aiState(){return {sessionId:pageSessionId,revision,dirty,documentId:documentModel.documentId,documentInstanceId,documentName:documentModel.name,reliefDesigns:clone(documentModel.reliefDesigns||[]),referenceSystem:clone(documentModel.referenceSystem),features:clone(documentModel.features),hidden:[...documentModel.hidden],appearance:clone(documentModel.appearance||{}),bodies:bodies.map(bodyState),selectedIds:[...selectedIds],selectedTopology:clone(selectedTopology),busy,kernelReady,preview:!!previewNext,previewInfo:previewIdentity?clone(previewIdentity):null,previewScope:previewScopeReport?clone(previewScopeReport):null};}
async function executeAI(command,args={},options={}){
  const origin=options.origin==='agent'?'agent':'user';
  if(command==='file_save'){
    const retained={...clone(documentModel),renderMaterials:getMetalMaterials()},savedRevision=revision,instance=documentInstanceId,docId=retained.documentId;
    // Render snapshots are file metadata, outside the live modelling timeline.
    delete retained.timeline;
    const {snapshot,bytes,report}=await saveCommittedProject(retained,committedFinalSources);
    if(options.signal?.aborted)throw Object.assign(new Error('保存已取消；原工程保留'),{code:'JOB_CANCELED'});
    return {revision:savedRevision,documentId:docId,documentInstanceId:instance,encoding:'bytes',data:bytes,extension:'webcad',mime:snapshot.version>=3?'application/zip':'application/json',...(report?{report}:{})};
  }
  if(command==='acknowledge_save'){
    if(args.documentId!==documentModel.documentId||args.documentInstanceId!==documentInstanceId||args.savedRevision!==revision)return {saved:false,dirty,revision,reason:'SNAPSHOT_CHANGED'};
    dirty=false;refresh();return {saved:true,dirty:false,revision,documentId:documentModel.documentId,documentInstanceId};
  }
  if(command==='file_command')return commandService.fileCommand(args,options);
  if(command==='get_state_v2')return commandService.getState(args);
  if(command==='query_geometry')return commandService.queryGeometry(args);
  if(command==='execute_v2')return commandService.execute(args,options);
  await ready;if(!kernelReady)throw new Error('CAD kernel unavailable');checkTransaction(options.signal,options.expectedRevision);
  if(command==='get_state')return aiState();
  if(command==='get_templates')return QUICK_MODELS;
  if(ui.hasActiveTask()&&!options.fromUI)throw Object.assign(new Error('Finish the current human task or preview before AI editing.'),{code:'UI_TASK_ACTIVE'});
  if(busy||(previewNext&&!['preview.commit','preview.cancel','preview_update','preview_file_update','preview_feature_edit_update'].includes(command)))throw new Error('Finish current operation or preview before AI editing.');
  if(command==='preview_feature_edit'||command==='preview_feature_edit_update'){const feature=documentModel.features.find(f=>f.id===args.featureId);if(!feature)throw Object.assign(new Error('预览编辑特征已失效'),{code:'STALE_REFERENCE'});if(command.endsWith('_update')&&(!previewIdentity||previewIdentity.previewId!==args.previewIdentity?.previewId||previewIdentity.generation+1!==args.previewIdentity.generation))throw Object.assign(new Error('Preview generation changed'),{code:'STALE_REFERENCE'});await previewFeature(feature.op,args.params,feature.refs,args.name,args.placement??feature.placement,args.previewIdentity,feature.id);return aiState();}
  if(command==='preview_feature'){await previewFeature(args.op,args.params,args.refs,args.name,args.placement,args.previewIdentity);return aiState();}
  if(command==='preview_file'){await previewFile(args.fileImport,args.previewIdentity);return aiState();}
  if(command==='preview_file_update'){await previewFile({placement:args.placement},args.previewIdentity,true);return aiState();}
  if(command==='preview_update'){if(!previewIdentity||previewIdentity.previewId!==args.previewIdentity?.previewId||previewIdentity.generation+1!==args.previewIdentity.generation)throw Object.assign(new Error('Preview generation changed'),{code:'STALE_REFERENCE'});await previewFeature(args.op,args.params,args.refs,args.name,args.placement,args.previewIdentity);return aiState();}
  if(command==='reference_action'){
    const next=clone(documentModel);next.referenceSystem=args.referenceSystem;
    if(JSON.stringify(next.referenceSystem)===JSON.stringify(documentModel.referenceSystem))return aiState();
    checkTransaction(options.signal,options.expectedRevision);pushUndo(next,'修改参考基准');documentModel=next;revision++;dirty=true;lastWarnings=[];
    viewport.setWorkFrame?.(next.referenceSystem.workFrame);flushDisplayBatch();viewport.markModel({documentId:next.documentId,documentInstanceId,revision});refresh();void autosave();return aiState();
  }
  if(command==='preview.cancel'){if(!previewNext)throw new Error('No preview to cancel');if(previewIdentity&&(previewIdentity.previewId!==args.previewId||previewIdentity.generation!==args.expectedGeneration))throw Object.assign(new Error('Preview identity changed'),{code:'STALE_REFERENCE'});await cancelPreview();return aiState();}
  if(command==='preview.commit'){if(!previewNext)throw new Error('No preview to apply');if(previewIdentity&&(previewIdentity.previewId!==args.previewId||previewIdentity.generation!==args.expectedGeneration))throw Object.assign(new Error('Preview identity changed'),{code:'STALE_REFERENCE'});await rebuild(clone(previewNext),options);return aiState();}
  if(command==='editor_action'){
    if(args.action==='feature.compileServices'){
      const expected=options.expectedRevision,snapshot=clone(documentModel),feature=snapshot.features.find(f=>f.id===args.values.featureId);assertCompilableFeature(feature);
      let routed;
      setBusy(true,'后台正在计算输入快照…');
      try{routed=await routeChangedFeature(snapshot,{signal:options.signal,expectedRevision:expected,featureId:feature.id,explicitRemote:true,allowUpload:args.values.allowUpload});checkTransaction(options.signal,expected);}finally{setBusy(false);}
      if(!routed.record)return aiState();
      try{await rebuild(routed.next,{...options,historyLabel:'后台原特征编译',select:feature.id});}
      catch(error){servicesExecutionHistory.failure(routed.record.executionKey,error);throw error;}
      servicesExecutionHistory.success(routed.record.input,routed.record.executor,routed.record.measurements);return aiState();
    }
    const {action,values:a}=args,next=clone(documentModel);
    if(action==='history.restore'){
      const restored=restoreTimeline(documentModel,a.stateId),entry=timelineList(documentModel).entries.find(e=>e.id===a.stateId);delete restored.timeline;
      const target=validateDocument(restored);await rebuild(target,{...options,restoring:true,historyLabel:'退回：'+entry.label});return aiState();
    }
    if(action==='body.align'){
      const plan=planBodyAlignment(a,bodies,documentModel.referenceSystem),ids=[];
      for(const move of plan.moves){const id=crypto.randomUUID();ids.push(id);next.features.push(markTopologySemantics({id,op:'transform',name:'对齐 · '+(bodies.find(b=>b.id===move.bodyId)?.name||'实体'),params:{x:move.delta[0],y:move.delta[1],z:move.delta[2],rx:0,ry:0,rz:0,scale:1},refs:[move.bodyId]}));for(const key of ['appearance','colors'])if(next[key]?.[move.bodyId])next[key][id]=next[key][move.bodyId];}
      await rebuild(next,{...options,historyLabel:'快速对齐 '+ids.length+' 件',select:origin==='agent'?null:ids[0]});
      if(origin==='agent'){selectedIds=selectedIds.filter(id=>bodies.some(b=>b.id===id));viewport.setSelection(selectedIds,selectedTopology);}else{selectedIds=ids;viewport.setSelection(ids);}
      refresh();return aiState();
    }
    if(action==='body.explode'){
      const source=bodies.find(b=>b.id===a.bodyId),ids=[];
      for(let i=0;i<source.solidCount;i++){
        const id=crypto.randomUUID();ids.push(id);
        next.features.push(markTopologySemantics({id,op:'extractSolid',name:(source.name||'模型')+' / '+(i+1),params:{solidIndex:i,keepOriginal:i<source.solidCount-1},refs:[source.id]}));
        if(next.appearance?.[source.id])next.appearance[id]=next.appearance[source.id];
        if(next.colors?.[source.id])next.colors[id]=next.colors[source.id];
      }
      await rebuild(next,{...options,select:origin==='agent'?null:ids[0]});
      if(origin==='agent'){selectedIds=selectedIds.filter(id=>bodies.some(b=>b.id===id));viewport.setSelection(selectedIds,selectedTopology);}else{selectedIds=ids;viewport.setSelection(ids);}
      refresh();return aiState();
    }
    if(action==='document.reliefDesign'){next.reliefDesigns=updateReliefDesigns(documentModel.reliefDesigns,a);if(JSON.stringify(next.reliefDesigns)===JSON.stringify(documentModel.reliefDesigns||[]))return aiState();}
    if(action==='document.reliefDesignReference'){const updated=applyReliefDesignReference(documentModel,a);if(JSON.stringify(updated.reliefDesigns)===JSON.stringify(documentModel.reliefDesigns||[]))return aiState();Object.assign(next,updated);}
    if(action==='document.materials'){next.materialSettings=validateMaterialSettings(a.settings);}
    if(action==='document.rename')next.name=a.name.trim();
    if(action==='feature.rename')next.features.find(f=>f.id===a.featureId).name=a.name.trim();
    if(action==='body.visibility')next.hidden=[...new Set([...next.hidden.filter(id=>!a.bodyIds.includes(id)),...(a.visible?[]:a.bodyIds)])];
    if(action==='document.appearance')next.renderFinish=a.finish;
    if(action==='body.appearance')for(const id of a.bodyIds){
      for(const [field,value] of [['colors',a.color],['appearance',a.finish]])if(value!==undefined){next[field]={...next[field]};if(value===null)delete next[field][id];else next[field][id]=value;}
    }
    checkTransaction(options.signal,options.expectedRevision);pushUndo(next,EDITOR_ACTIONS[action]?.title||(action==='document.reliefDesignReference'?'浮雕原参考图绑定':undefined));documentModel=next;dirty=true;revision++;if(action==='document.materials')rememberMaterialSettings(next.materialSettings);
    if(action==='feature.rename'){const body=bodies.find(b=>b.id===a.featureId);if(body)body.name=a.name.trim();}
    lastWarnings=[];
    if(origin==='agent'&&action==='body.appearance'&&a.color!==undefined&&a.finish&&a.finish!=='design')lastWarnings.push({code:'COLOR_IGNORED_BY_METAL_FINISH',finish:a.finish,color:a.color});
    try{if(['body.appearance','document.appearance'].includes(action))clearSelection();applyAppearance();viewport.setHidden(next.hidden);flushDisplayBatch();viewport.markModel({documentId:next.documentId,documentInstanceId,revision});refresh();}catch(e){lastWarnings.push({code:'DISPLAY_FAILED',message:e.message});}
    void autosave();return aiState();
  }
  if(command==='set_parameters'){
    const next=clone(documentModel);next.parameters={...(next.parameters||{}),...args.parameters};
    for(const [id,expressions] of Object.entries(args.bindings||{})){
      const f=next.features.find(f=>f.id===id);if(!f)throw Object.assign(new Error('Unknown feature for expression binding'),{code:'STALE_REFERENCE'});
      f.expressions={...(f.expressions||{}),...expressions};
    }
    await rebuild(next,options);return aiState();
  }
  if(command==='file_new'){
    if(dirty)throw Object.assign(new Error('Save the current document before creating a new project.'),{code:'UNSAVED_REPLACEMENT'});
    await rebuild(emptyDocument(),{...options,fit:true,newInstance:true,record:false});undoStack=[];redoStack=[];selectedIds=[];dirty=false;refresh();
    return {dirty};
  }else if(command==='file_open'||command==='file_import'){
    const ext=args.name?.split('.').pop().toLowerCase();
    const allowed=command==='file_open'?['webcad','json','step','stp','brep','brp','stl','mesh']:['step','stp','brep','brp','igs','iges','stl','mesh'];
    if(!allowed.includes(ext))throw Object.assign(new Error('Unsupported file type for this action.'),{code:'FORMAT_UNSUPPORTED'});
    // Legacy callers that omit unsaved keep the old safe refusal (fail on dirty).
    if(command==='file_open')assertOpenAllowed({unsaved:args.unsaved??'fail',dirty});
    if(typeof args.name!=='string'||!(args.data instanceof Uint8Array)&&typeof args.data!=='string')throw new Error('ASSET_INVALID: typed bytes or legacy base64 required.');
    let bytes;if(args.data instanceof Uint8Array)bytes=args.data;else{if(args.data.length>28*1024*1024)throw new Error('ASSET_INVALID: oversized base64 payload');const raw=atob(args.data);bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);}if(bytes.length>fileByteBudget(args.name))throw Object.assign(new Error('文件超出类型容量'),{code:'SIZE_LIMIT'});
    const file=new File([bytes],args.name,{type:args.mime||'application/octet-stream'});
    const placement=command==='file_import'?resolvePlacement(args.placement,documentModel.referenceSystem,'import',{}):undefined;
    if(command==='file_open')await openDocument(file,{...options,mcp:true,unsaved:args.unsaved??'fail',units:args.units});
    else await insertModels([file],{...options,mcp:true,placement,units:args.units});
    return {dirty};
  }else if(command==='file_export'){
    let result;
    if(args.format==='png'){
      const cap=await pageAPI.capture({context:{sessionId:pageSessionId,documentId:documentModel.documentId,documentInstanceId,expectedRevision:options.expectedRevision}});
      if(cap.status==='failed')throw Object.assign(new Error(cap.error.message),cap.error);
      result={extension:'png',mime:'image/png',data:Uint8Array.from(atob(cap.dataUrl.split(',')[1]),c=>c.charCodeAt(0))};
    }else result=await exportData(args.format,args.ids);
    checkTransaction(options.signal,options.expectedRevision);
    return {revision,extension:result.extension,mime:result.mime,encoding:'bytes',data:typeof result.data==='string'?new TextEncoder().encode(result.data):new Uint8Array(result.data),...(result.meshReport?{meshReport:result.meshReport}:{}),...(result.report?{report:result.report}:{})};
  }
  if(command==='inspect_geometry'){
    const startRevision=revision;const result=await request('measure',{bodyId:args.bodyId,topologyType:args.kind,topologyId:args.topologyId});
    if(args.kind==='face'&&result.geomType==='PLANE')Object.assign(result,await request('faceInfo',{bodyId:args.bodyId,faceId:args.topologyId}));
    checkTransaction(options.signal,startRevision);return {...result,revision};
  }
  if(command==='select'){
    if(!Array.isArray(args.ids)||args.ids.some(id=>!bodies.some(b=>b.id===id)))throw new Error('Unknown body ID');
    selectedIds=[...new Set(args.ids)];selectedTopology=null;viewport.setSelection(selectedIds);refresh();
  }else if(command==='add_feature'){
    if(!Object.hasOwn(labels,args.op)||['import','remove'].includes(args.op))throw new Error('Unsupported feature operation');
    await addFeature(args.op,args.params||{},{...options,refs:args.refs??[],name:args.name,placement:args.placement,placementExplicit:args.placementExplicit});
  }else if(command==='add_features'){
    const next=clone(documentModel);
    for(const feature of args.features){
      if(!Object.hasOwn(labels,feature.op))throw Object.assign(new Error('Unsupported feature operation'),{code:'CAPABILITY_UNAVAILABLE'});
      next.features.push(clone(feature));
      if(next.appearance?.[feature.refs[0]])next.appearance[feature.id]=next.appearance[feature.refs[0]];
      if(next.colors?.[feature.refs[0]])next.colors[feature.id]=next.colors[feature.refs[0]];
    }
    await rebuild(next,{...options,fit:true,historyLabel:'批量创建特征'});
  }else if(command==='apply_template'){
    const template=QUICK_MODELS[args.templateId];if(!template)throw new Error('Unknown template');
    await addFeature('quickModel',{...template.defaults,...args.params,kind:args.templateId},{...options,refs:[]});
  }else if(command==='edit_feature')await editFeature(args.featureId,args.params||{},args.name,{...options,placement:args.placement});
  else if(command==='remove')await addFeature('remove',{},{...options,refs:args.ids});
  else if(command==='undo'||command==='redo')await navigateHistory(command,options);
  else if(command==='refresh')await rebuild(clone(documentModel),{...options,record:false});
  else if(command==='export'){
    const result=await exportData(args.format||'step',args.ids);checkTransaction(options.signal,options.expectedRevision);
    return {revision,extension:result.extension,mime:result.mime,encoding:'base64',data:base64(typeof result.data==='string'?new TextEncoder().encode(result.data):new Uint8Array(result.data))};
  }else throw new Error('Unknown AI command');
  return aiState();
}
const commandService=createCommandService({
  allowAdvisory:true,
  snapshot:()=>({...aiState(),busy:busy||!!recoveryPromise||!!viewport.anchorStart,documentId:documentModel.documentId,documentInstanceId,sessionId:pageSessionId,previewDraft:previewIdentity&&previewNext?clone(previewIdentity.featureId?previewNext.features.find(f=>f.id===previewIdentity.featureId):previewNext.features.at(-1)):null,previewComputing,warnings:clone(lastWarnings),persistence:{level:persistenceCheckpoint==='saved'?'indexeddb-recovery':'memory',checkpoint:persistenceCheckpoint}}),
  execute:executeAI,
  query:args=>request('queryGeometry',args),
});
const pageAPI=createPageAPI({
  reliefReferenceRead:(designId,options)=>readReliefDesignReference(documentModel,designId,options),
  reliefReferenceCommit:input=>commandService.execute(input,{fromUI:true,referenceResourceValidated:true}),
  recoverKernel:async({stopRunning=false}={})=>{
    if(kernelReady&&!busy&&!recoveryPromise&&!stopRunning)return {status:'read',recovered:true,alreadyReady:true,context:pageAPI.getState().context};
    if(recoveryPromise){await recoveryPromise;return {status:'read',recovered:kernelReady,context:pageAPI.getState().context};}
    if((busy||pending.size||previewComputing)&&!stopRunning)throw Object.assign(new Error('原计算仍在运行；请等待，或明确 stopRunning:true 保留已提交工程后停止。'),{code:'KERNEL_BUSY'});
    const wasBusy=busy;setBusy(true,'从最后已提交工程恢复建模内核…');
    try{if(stopRunning){previewNext=null;previewIdentity=null;previewGeneration++;previewComputing=false;}
      await restartWorker(Object.assign(new Error('内核受控恢复；未提交计算停止，原工程保留。'),{code:'KERNEL_RECOVERY_REQUESTED'}));
      return {status:'read',recovered:true,context:pageAPI.getState().context};
    }finally{if(!wasBusy||stopRunning)setBusy(false);}
  },
  decideServicesWait:input=>decideServicesWait(input.jobId,input.decision),
  servicesRouting:()=>({operationPolicy:{localOnly:EXECUTION_POLICY.localOnlyOperations,conditionalServices:EXECUTION_POLICY.servicesEligibleOperations,quickModels:'all-local',unknownOperation:EXECUTION_POLICY.unknownOperation},unavailableOperations:tbdCapabilities.operations,policyVersion:EXECUTION_POLICY.policyVersion,executionTimeouts:{localTimeoutMs:getServicesConfig().localTimeoutMs,serverWaitMs:getServicesConfig().serverWaitMs},pendingWait:pendingServicesWait?{jobId:pendingServicesWait.jobId,elapsedMs:pendingServicesWait.elapsedMs,execution:pendingServicesWait.execution,requestKey:pendingServicesWait.requestKey,decisionRequired:true}:null,lastDecision:lastServicesDecision?.documentInstanceId===documentInstanceId?clone(lastServicesDecision):null,lastReliefDesign:lastReliefDesignReceipt?.documentInstanceId===documentInstanceId?clone(lastReliefDesignReceipt):null,historyStorage:'bounded-session-memory',automaticUploadConsent:getServicesConfig().allowGeometryUploads}),
  history:()=>timelineList(documentModel),materialSettings:()=>validateMaterialSettings(documentModel.materialSettings),
  locationMarker:async input=>{if(input.screen)return deliverLocationMarker(viewport.pickLocation(input.screen));if(input.active!==undefined){if(input.active){if(!hostControl.get().connected)throw Object.assign(new Error('请先连接原生 Agent，再标记位置。'),{code:'AGENT_COMPOSER_UNAVAILABLE'});if(busy||previewNext||viewport.sketch||viewport.measuring||ui.hasActiveTask())throw Object.assign(new Error('请先完成当前操作再标记位置。'),{code:'UI_TASK_ACTIVE'});viewport.setSelectionMode('view');viewport.startLocationMarking();refresh();}else if(viewport.locationMarking)viewport.cancelTask();}const last=lastLocationMarker?.marker.context;return {status:'read',active:!!viewport.locationMarking,last:last?.documentInstanceId===documentInstanceId?lastLocationMarker:null};},
  planAlignment:input=>planBodyAlignment(input,bodies,documentModel.referenceSystem),
  selectRectangle:input=>{if(ui.hasActiveTask())throw Object.assign(new Error('请先完成当前人工任务'),{code:'UI_TASK_ACTIVE'});return selectRectangle(input);},
  createDrawing:async input=>{const expected=revision;if(input.bodyIds.reduce((sum,id)=>sum+(bodies.find(b=>b.id===id)?.faceGroups.length||0),0)>1500)throw Object.assign(new Error('选择的面超过1500个，请分批出图'),{code:'RESOURCE_LIMIT'});setBusy(true,'生成三视图与截面…');try{const result=await request('technicalDrawing',{input});checkTransaction(undefined,expected);return result.drawing;}finally{setBusy(false);}},
  quickModelUsage:getQuickModelUsage,
  refreshLibrary:()=>ui.refreshLibrary(),
  clipboard:async(action,ids)=>{if(ui.hasActiveTask())throw Object.assign(new Error('请先应用或取消人工任务'),{code:'UI_TASK_ACTIVE'});if(action==='copy'){modelClipboard={documentInstanceId,ids:[...ids],pasteCount:0};return;}return pasteModelClipboard();},
  buildId:__WEBCAD_BUILD__,
  revisionKey:()=>JSON.stringify([documentInstanceId,revision,dirty,busy,kernelReady,!!previewNext,previewComputing,previewIdentity,selectedIds,selectedTopology,documentModel.referenceSystem?.workFrame]),
  subscribeState:listener=>{agentStateListeners.add(listener);return ()=>agentStateListeners.delete(listener);},
  state:(input={})=>({hostControl:hostControl.get(),kernelProgress:clone(kernelProgress),kernelPerformance:clone(kernelPerformance),...commandService.getState({sessionId:pageSessionId,include:['summary','features','bodies','selection','capabilities','references'],...input}),referenceSystem:clone(documentModel.referenceSystem),previewInfo:previewIdentity?clone(previewIdentity):null,previewScope:previewScopeReport?clone(previewScopeReport):null,renderQuality:qualityState(),parameters:clone(documentModel.parameters||{}),parameterValues:evaluateNamedParameters(documentModel.parameters||{}),hidden:[...documentModel.hidden],appearance:clone(documentModel.appearance||{}),colors:clone(documentModel.colors||{}),renderFinish:documentModel.renderFinish??null,displayPreferences:clone(viewport.displayPreferences),view:{errorPoints:clone(viewport.errorPoints),workspaceLayout:ui.getWorkspaceLayout(),anchorVisible:viewport.anchorVisible,panels:ui.getPanels(),clipboard:{available:modelClipboard?.documentInstanceId===documentInstanceId,bodyIds:modelClipboard?.documentInstanceId===documentInstanceId?[...modelClipboard.ids]:[]},display:viewport.mode,projection:viewport.camera.isOrthographicCamera?'orthographic':'perspective',grid:viewport.grid.visible,snap:viewport.snapEnabled,gizmo:viewport.gizmoMode,transform:viewport.getTransformState(),selectionMode:viewport.selectionMode,language:getLanguage(),camera:{position:viewport.camera.position.toArray(),target:viewport.controls.target.toArray()},section:clone(viewport.sectionState||{axis:'Z',position:0,enabled:false}),temporaryDisplay:viewport.temporaryDisplay}}),
  quality:async quality=>{flushDisplayBatch();setBusy(true,'更新显示网格…');try{const result=await request('remesh',{quality}),features=new Map(documentModel.features.map(f=>[f.id,f]));bodies=result.bodies.map(body=>({...body,name:features.get(body.id)?.name||body.id}));qualityKey=quality;clearSelection();viewport.setBodies(bodies,documentModel.hidden);applyAppearance();viewport.setSelection(selectedIds,selectedTopology);flushDisplayBatch();viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});await viewport.frame();setStatus('显示网格已更新 · '+RENDER_QUALITIES[quality].label+' · '+qualityState().triangleCount.toLocaleString()+' 三角面');}finally{setBusy(false);}},
  metalMaterials:configuration=>{
    const next=validateMetalMaterials(configuration),ids=new Set(next.materials.map(m=>m.id));
    const used=[documentModel.renderFinish,viewport.displayPreferences.defaultFinish,...Object.values(documentModel.appearance||{})].filter(Boolean);
    if(used.some(id=>!ids.has(id)))throw Object.assign(new Error('当前工程仍在使用待删除的材质，请先替换实体/工程材质'),{code:'MATERIAL_IN_USE'});
    setMetalMaterialRegistry(next);activeMaterialDocument=documentInstanceId+':'+documentModel.documentId;
    const persisted=rememberMetalMaterials(next);clearSelection();applyAppearance();dirty=true;refresh();
    return {configuration:getMetalMaterials(),persisted,storage:'localStorage',documentSnapshot:true};
  },
  preferences:values=>{viewport.displayPreferences={...viewport.displayPreferences,...validateDisplayPreferences(values)};viewport.setModelingPrecision();if(Object.keys(values).some(key=>!['dimensionPrecisionMm','anglePrecisionDeg','themeColor','snapThresholdMm'].includes(key)))clearSelection();applyAppearance();const persisted=saveDisplayPreferences(viewport.displayPreferences);assistantPanel.sync();refresh();return {persisted,storage:'cookie',values:clone(viewport.displayPreferences)};},
  execute:input=>commandService.execute(input),query:input=>commandService.queryGeometry(input),files:input=>commandService.fileCommand(input),
  references:async input=>{const context=pageAPI.getState().context,referenceSystem=clone(documentModel.referenceSystem),currentBodies=bodies.filter(body=>!documentModel.hidden.includes(body.id));const assertFresh=()=>{if(documentInstanceId!==context.documentInstanceId||revision!==context.revision)throw Object.assign(new Error('参考查询期间工程已变化，请重新查询'),{code:'STALE_REFERENCE'});};const result=await collectReferences(input,{context,referenceSystem,bodies:currentBodies,queryGeometry:(bodyId,kind)=>request('queryGeometry',{bodyId,kind,filter:{}}),queryNearest:(bodyId,kind,near)=>request('nearestGeometry',{bodyId,kind,point:near.point,options:{radiusMm:near.radiusMm}}),assertFresh});commandService.registerReferenceCandidates(pageAPI.createRequestContext(context),result.items);return result;},
  resolvePlacement:async input=>{if(input.refs.some(id=>!bodies.some(b=>b.id===id)))throw Object.assign(new Error('Unknown current body'),{code:'STALE_REFERENCE'});const context=pageAPI.getState().context,anchorId=input.placement?.sourceAnchor?.kind==='named'?input.placement.sourceAnchor.anchorId:null;if(anchorId){const anchor=documentModel.referenceSystem.bodyAnchors.find(item=>item.anchorId===anchorId&&item.status==='valid');if(!anchor||!input.refs.includes(anchor.bodyId))throw Object.assign(new Error('Named anchor is not on the source body'),{code:'STALE_REFERENCE'});const exact=await request('queryGeometry',{bodyId:anchor.bodyId,kind:'edge',filter:{}});if(exact.geometryFingerprint!==anchor.geometryFingerprint)throw Object.assign(new Error('Named anchor geometry changed'),{code:'STALE_REFERENCE'});if(documentInstanceId!==context.documentInstanceId||revision!==context.revision)throw Object.assign(new Error('Document changed during placement resolution'),{code:'STALE_REFERENCE'});}const params=migratedOperationIds.includes(input.op)?normalizeOperationParams(input.op,input.params):input.params;const resolved=resolvePlacement(input.placement,documentModel.referenceSystem,input.op,params);if(!resolved)throw Object.assign(new Error('Explicit placement required'),{code:'FRAME_INVALID'});return {status:'read',context,...describeResolvedPlacement(input.op,params,resolved)};},
  confirmSaved:snapshot=>executeAI('acknowledge_save',snapshot),
  measure:input=>request('measure',{bodyId:input.bodyId,topologyType:input.kind==='body'?undefined:input.kind,topologyId:input.topologyId}),
  sampleMeshRelief:input=>request('sampleMeshRelief',{input}),
  inspectPrintability:(bodyId,angleLimitDeg)=>{const body=bodies.find(item=>item.id===bodyId);if(!body)throw Object.assign(new Error('Unknown current body'),{code:'STALE_REFERENCE'});return inspectPrintabilityMesh(body,angleLimitDeg);},
  inspectProfile:bodyId=>{const feature=documentModel.features.find(item=>item.id===bodyId&&item.op==='sketchProfile');if(!feature||!bodies.some(body=>body.id===bodyId))throw Object.assign(new Error('请选择当前可编辑解析轮廓'),{code:'STALE_REFERENCE'});return inspectProfileModel(feature.params);},
  inspectConstraints:bodyId=>{const solved=constrainProfileRecipe(resolveProfileRecipe(documentModel.features,bodyId),[]);return {profile:clone(solved.profile),constraints:clone(solved.constraints),diagnostics:clone(solved.diagnostics),primitiveConversion:clone(solved.primitiveConversion||[]),intrinsicConstraints:clone(solved.intrinsicConstraints||[]),placement:clone(solved.placement||null)};},
  prepareProfileEdit:async input=>{
    const mapped=input.edgeIds?await request('resolveProfileEdges',{bodyId:input.bodyId,edgeIds:input.edgeIds,features:documentModel.features}):null;
    const feature=documentModel.features.find(item=>item.id===(mapped?.sourceFeatureId||input.bodyId)&&item.op==='sketchProfile');
    if(!feature||!bodies.some(body=>body.id===input.bodyId))throw Object.assign(new Error('请选择当前可编辑解析轮廓'),{code:'STALE_REFERENCE'});
    return {...prepareAnalyticProfileEdit(feature.params,{...input,...(mapped?{entityId:mapped.entityIds[0],targetId:mapped.entityIds[1]}:{})}),sourceFeatureId:feature.id,...(mapped?{entityIds:mapped.entityIds,edgeIds:input.edgeIds}:{})};
  },
  projectProfile:async input=>{const atRevision=revision,atInstance=documentInstanceId,frame=input.frame||{origin:[...documentModel.referenceSystem.workFrame.origin],quaternion:[...documentModel.referenceSystem.workFrame.quaternion]};if(input.pointWorld)return {frameSnapshot:frame,point:projectPointToProfile(input.pointWorld,frame)};const exact=await request('queryGeometry',{bodyId:input.bodyId,kind:'edge',filter:{}});if(revision!==atRevision||documentInstanceId!==atInstance)throw Object.assign(new Error('来源几何在投影期间已变化'),{code:'STALE_REFERENCE'});const entities=input.edgeIds.map(id=>{const edge=exact.items.find(item=>item.edgeId===id);if(!edge)throw Object.assign(new Error(`来源边 ${id} 已失效`),{code:'STALE_REFERENCE'});return {id:crypto.randomUUID(),...projectEdgeToProfile(edge,frame,{bodyId:input.bodyId,geometryFingerprint:exact.geometryFingerprint})};});return {frameSnapshot:frame,entities,sourceBodyId:input.bodyId,sourceGeometryFingerprint:exact.geometryFingerprint,association:'snapshot-only'};},
  inspectDesign:input=>request('inspectDesign',{input}),
  inspectFit:(bodyAId,bodyBId,toleranceMm,volumeThresholdMm3)=>request('inspectFit',{bodyAId,bodyBId,toleranceMm,volumeThresholdMm3}),
  inspectThickness:input=>request('inspectThickness',{input}),
  inspectDraft:input=>request('inspectDraft',{input}),
  inspectRound:input=>request('inspectRound',{input}),
  probeBlendRadius:input=>request('probeBlendRadius',{input}),
  measureRelation:input=>request('measureRelation',{input}),
  reliefDesignSupport:(featureId,faceId)=>request('reliefDesignSupport',{featureId,faceId}),
  displayBatch:Object.freeze({begin:beginDisplayBatch,end:endDisplayBatch,endDeferred:endDisplayBatchDeferred,flush:flushDisplayBatch}),
  display:()=>viewport.displayState(),frame:()=>{flushDisplayBatch();if(lastWarnings.some(w=>w.code==='DISPLAY_FAILED'))throw Object.assign(new Error('Display failed; call redraw'),{code:'DISPLAY_FAILED'});viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});return viewport.frame();},capture:(opts)=>viewport.screenshot(opts),
  evidenceSignature:()=>{flushDisplayBatch();if(lastWarnings.some(w=>w.code==='DISPLAY_FAILED'))throw Object.assign(Error('Display failed; call redraw.'),{code:'DISPLAY_FAILED'});viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});return viewport.evidenceSignature();},
  evidenceCapture:opts=>viewport.evidenceCapture(opts),
  view:async input=>{
    flushDisplayBatch();ui.setWorkspaceLayout(input);viewport.setViewInteraction(input.interactionPhase??'end');
    if(input.anchorVisible!==undefined)viewport.setAnchorVisible(input.anchorVisible);
    if(input.panels)ui.setPanels(input.panels);
    if(input.display){viewport.setDisplay(input.display);if(input.selectedIds===undefined)clearSelection();}
    if(input.selectedIds!==undefined){
      if(JSON.stringify(input.selectedIds)!==JSON.stringify(selectedIds))ui.discardForSelection();
      selectedIds=[...input.selectedIds];selectedTopology=null;
    }
    // Selection and visibility must be final before projection/view/fit read bounds.
    viewport.setSelection(selectedIds,selectedTopology);
    if(input.temporaryDisplay)viewport.setTemporaryDisplay(input.temporaryDisplay);
    if(input.grid!==undefined)viewport.grid.visible=input.grid;
    if(input.snap!==undefined)viewport.snapEnabled=input.snap;
    if(input.gizmo){if(input.gizmo!=='off'){viewport.setAnchorDrag(false);viewport.setSelectionMode('body');selectedTopology=null;}viewport.setGizmo(input.gizmo);}
    if(input.selectionMode){if(input.selectionMode!=='body')viewport.setGizmo('off');viewport.setSelectionMode(input.selectionMode);selectedTopology=null;}
    if(input.language){setLanguage(input.language);viewport.updateLanguage();ui.update({language:input.language});}
    // Preserve camera -> projection -> direction -> fit precedence.
    if(input.camera)viewport.setCamera(input.camera);
    if(input.section)viewport.setSection(input.section);
    if(input.projection)viewport.setProjection(input.projection);
    if(input.direction)viewport.view(input.direction==='side'?'right':input.direction);
    if(input.fit)viewport.fit();
    viewport.setSelection(selectedIds,selectedTopology);refresh();await viewport.frame();
  },
  redraw:async()=>{flushDisplayBatch();viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds,selectedTopology);viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});await viewport.frame();lastWarnings=lastWarnings.filter(w=>w.code!=='DISPLAY_FAILED');},
});
async function deliverLocationMarker(hit){
  if(!hostControl.get().connected)throw Object.assign(new Error('请先连接原生 Agent，再标记位置。'),{code:'AGENT_COMPOSER_UNAVAILABLE'});
  if(busy||previewNext||viewport.sketch||viewport.measuring)throw Object.assign(new Error('请先完成当前操作再标记位置。'),{code:'UI_TASK_ACTIVE'});
  const marker=createLocationMarker(hit,pageAPI.getState().context,++locationMarkerNumber);
  lastLocationMarker={marker,delivery:'pending'};
  const result=await assistantPanel.insertLocation(marker);
  if(locationMarkers.some(m=>m.context.documentInstanceId!==marker.context.documentInstanceId||m.context.revision!==marker.context.revision))locationMarkers=[];
  locationMarkers.push(marker);locationMarkers=locationMarkers.slice(-128);viewport.setLocationMarkers(locationMarkers);
  lastLocationMarker={marker,...result};
  return {status:'applied',...lastLocationMarker,context:pageAPI.getState().context};
}
const assistantPanel=createAssistantPanel({getApi:()=>pageAPI,hostControl,onChange:state=>ui.setAgentPanel(state)});
Object.defineProperty(window,'webcad',{value:Object.freeze({api:pageAPI,hostControl,assistantPanel,agent:Object.freeze({contract:AGENT_CONTRACT,createHostAdapter,uploadChunked,uploadArtifact,createBrokerUploadClient})}),writable:false,configurable:false});
ui.setAgentPanel(assistantPanel.get());
if(new URLSearchParams(location.search).get('agent')==='1'){
  aiStatus='connecting';refresh();
  import('./ai-bridge.js').then(({connectAI})=>{
    agentBridge=connectAI({getState:aiState,execute:executeAI},{onStatus:event=>{aiStatus=event.state;refresh();}});
  }).catch(error=>{aiStatus='error';reportError(Object.assign(new Error(`Agent 接口启动失败：${error.message}`),{cause:error}));});
}
