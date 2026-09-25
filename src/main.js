import './style.css';
import './workspace-layout.css';
import {RENDER_QUALITIES} from './render-quality.js';
import { validateDisplayPreferences, saveDisplayPreferences } from './display-preferences.js';
import { createUI } from './ui.js';
import { referenceProfileNames } from './reference-profile-tools.js';
import { CADViewport } from './viewport.js';
import { QUICK_MODELS } from './quick-models.js';
import { createPageAPI } from './page-api.js';
import { inspectPrintabilityMesh } from './dfam-inspection.js';
import { FINISH_KEYS } from './editor-actions.js';
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
import { normalizeOperationParams, normalizeOperationPatch, migratedOperationIds, getOperation } from './operation-registry.js';


const emptyDocument = () => ({version:2,documentId:crypto.randomUUID(),name:'未命名设计',features:[],imports:{},hidden:[],referenceSystem:createReferenceSystem()});
const pageSessionId=crypto.randomUUID();
let documentInstanceId=crypto.randomUUID(),lastWarnings=[],persistenceCheckpoint='pending';
const clone = value => structuredClone(value);
const labels = {autoRound:'整件圆边',smoothTransition:'平滑过渡',box:'长方体',cylinder:'圆柱',sphere:'球体',cone:'圆锥',torus:'圆环',extrude:'拉伸',revolve:'旋转成型',transform:'变换',copy:'复制',mirror:'镜像',union:'合并',cut:'切除',intersect:'求交',fillet:'圆角',chamfer:'倒角',shell:'抽壳',hole:'打孔',linearPattern:'直线阵列',circularPattern:'环形阵列',import:'导入',remove:'删除'};
let documentModel=emptyDocument(),bodies=[],selectedIds=[],selectedTopology=null,busy=false,kernelReady=false,dirty=false;
let qualityKey='standard';
function qualityState(){return {quality:qualityKey,...RENDER_QUALITIES[qualityKey],triangleCount:bodies.reduce((n,b)=>n+b.indices.length/3,0),source:'viewer-tessellation',adaptive:false};}
let undoStack=[],redoStack=[],requestSequence=0,status='正在启动精确建模内核…';
let revision=0,previewNext=null,previewIdentity=null,previewGeneration=0,previewComputing=false,aiStatus='in-page',agentBridge=null;
Object.assign(labels,{arcProfile:'解析线弧轮廓',group:'组合',vectorProfile:'矢量路径',quickModel:'快速模型',sweep:'扫掠',loft:'放样',split:'分割',extractSolid:'提取实体',extractShell:'提取壳',faceHole:'面上打孔',faceExtrude:'面拉伸',multiHole:'多位置打孔',multiPocket:'批量矩形凹槽',multiBoss:'批量圆柱凸台',slot:'长圆槽',logo:'LOGO 凹凸字'});
Object.assign(labels,{curveSweep:'曲线扫掠',advancedLoft:'多截面放样',curvedLogo:'曲面等深刻字'});
Object.assign(labels,{fittedSurface:'点阵拟合曲面',thickenFace:'选面增厚'});
Object.assign(labels,referenceProfileNames);
Object.assign(labels,referenceNames);
const pending=new Map();
const worker=new Worker(new URL('./cad-worker.js',import.meta.url),{type:'module'});
worker.onmessage=event=>{const result=event.data;const job=pending.get(result.requestId);if(!job)return;clearTimeout(job.timer);pending.delete(result.requestId);if(result.ok)job.resolve(result);else job.reject(Object.assign(new Error(result.error||'建模操作失败'),{code:result.code,path:result.path,recoveryAction:result.recoveryAction}));};
worker.onerror=event=>{const error=new Error(event.message||'CAD 内核异常，请保存工程后刷新页面。');for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();kernelReady=false;ui?.showError(error.message);};
function request(type,payload={}){return new Promise((resolve,reject)=>{const requestId=++requestSequence;const timer=setTimeout(()=>{worker.terminate();kernelReady=false;const error=new Error('计算超过三分钟，已停止内核。当前工程仍保留，请保存工程后刷新页面；复杂模型可先简化。');for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();},180000);pending.set(requestId,{resolve,reject,timer});worker.postMessage({requestId,type,...payload});});}

const ui=createUI(document.getElementById('app'),{
  onAction:(action,params)=>performAction(action,params).catch(error=>{reportError(error);return false;}),
  onSelection:(id,additive)=>selectBody(id,additive),
  onEditFeature:(id,params,name)=>editFeature(id,params,name).catch(reportError),
  onVisibility:id=>runEditorAction('body.visibility',{bodyIds:[id],visible:documentModel.hidden.includes(id)}).catch(reportError),
  onRename:name=>runEditorAction('document.rename',{name}).catch(reportError),
  onFrameDraft:frame=>viewport.setWorkFrame(frame),
  onFrameCancel:()=>{viewport.cancelAnchorDrag();viewport.setWorkFrame(documentModel.referenceSystem.workFrame);},
  onFrameAlign:async frame=>{if(selectedTopology?.type!=='face'||selectedTopology.ids?.length!==1)throw new Error('请先选择一个精确平面面片');const atRevision=revision,target=clone(selectedTopology),face=await request('faceInfo',{bodyId:target.bodyId,faceId:target.ids[0]});if(revision!==atRevision)throw new Error('目标面已变化，请重新选择');return frameOnPlane(frame.origin,face.normal,frame.quaternion);},
});
const viewport=new CADViewport(document.getElementById('viewport'),{
  onPick:pick,
  onSketch:params=>performAction('extrude',params).catch(reportError),
  onMeasure:(distance,delta)=>setStatus(`距离 ${distance.toFixed(3)} mm · ΔX ${delta[0].toFixed(3)} / ΔY ${delta[1].toFixed(3)} / ΔZ ${delta[2].toFixed(3)}`),
  onInteraction:mode=>ui.update({interactionMode:mode}),
  onRenderError:error=>ui.showError(error.message||String(error)),
  onTransform:params=>performAction('transform',params),
  onTransformError:reportError,
  onWorkFrameMove:origin=>ui.updateFrameDraft(origin)?undefined:runEditorAction('reference.setWorkFrame',{origin,quaternion:[...documentModel.referenceSystem.workFrame.quaternion]}),
});

function refresh(){document.title=(dirty?'● ':'')+documentModel.name+' — WebCAD';const url=new URL(location.href);if(url.searchParams.get('document')!==documentModel.documentId){url.searchParams.set('document',documentModel.documentId);history.replaceState(null,'',url);}ui.update({renderQuality:qualityState(),document:documentModel,bodies,selectedIds,selectedTopology,undoAvailable:undoStack.length>0,redoAvailable:redoStack.length>0,busy,status,kernelReady,dirty,displayPreferences:viewport.displayPreferences,metalFinish:viewport.finishKey,aiStatus,revision,viewState:{quality:qualityKey,display:viewport.mode,projection:viewport.camera.isOrthographicCamera?'orthographic':'perspective',grid:viewport.grid.visible,snap:viewport.snapEnabled,gizmo:viewport.gizmoMode,selection:viewport.selectionMode,anchorDrag:viewport.anchorDragEnabled,anchorVisible:viewport.anchorVisible}});}
function setStatus(message){status=message;ui.setStatus(t(message));}
function reportError(error){console.error(error);ui.showError(error.message||String(error));setStatus(error.message||String(error));}
function pushUndo(){undoStack.push(clone(documentModel));if(undoStack.length>40)undoStack.shift();redoStack=[];}
function setBusy(value,message){busy=value;viewport.setBusy?.(value);ui.setBusy(value,message);if(message)setStatus(message);refresh();}
function selectBody(id,additive=false){
  if(busy)return;
  selectedTopology=null;
  if(!id)selectedIds=[];
  else if(additive)selectedIds=selectedIds.includes(id)?selectedIds.filter(x=>x!==id):[...selectedIds,id];
  else selectedIds=[id];
  viewport.setSelection(selectedIds,selectedTopology);refresh();
}
function pick(hit,additive){
  if(busy)return;
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
async function runEditorAction(action,args){
  const {revision:r,...context}=pageAPI.getState().context;
  const result=await pageAPI.execute({context:{...context,expectedRevision:r},idempotencyKey:crypto.randomUUID(),action,args});
  if(['failed','unknown'].includes(result.status))throw Object.assign(new Error(result.error.message),result.error);
  return result;
}
function applyAppearance(){
  viewport.partFinishes={...documentModel.appearance};viewport.partColors={...documentModel.colors};
  viewport.setMetalFinish(FINISH_KEYS.includes(documentModel.renderFinish)?documentModel.renderFinish:viewport.displayPreferences.defaultFinish);
}

async function rebuild(next,{record=true,fit=false,select=null,save=true,signal,expectedRevision,newInstance=false}={}){
  if(busy)throw new Error('当前操作尚未完成，请稍候。');
  if(!kernelReady)throw new Error('建模内核尚未就绪。');
  setBusy(true,'正在计算精确实体…');
  try{
    checkTransaction(signal,expectedRevision);
    if(next.parameters!==undefined||next.features.some(f=>f.expressions))next=evaluateDocumentParameters(next,{previousDocument:documentModel});
    // Keep every committed project saveable through the bounded browser file API.
    // Reserve a small margin for subsequent UI name/appearance metadata changes.
    if(new TextEncoder().encode(JSON.stringify(next,null,2)).byteLength>20*1024*1024-4096)throw Object.assign(new Error('自包含工程超过 20 MiB 浏览器文件限额；请拆分工程。原工程保留。'),{code:'SIZE_LIMIT'});
    const result=await request('rebuild',{document:next});
    try{checkTransaction(signal,expectedRevision);}catch(error){await request('rebuild',{document:documentModel});throw error;}
    try{await synchronizeBodyAnchors(documentModel,next,bodies,result.bodies,async bodyId=>(await request('queryGeometry',{bodyId,kind:'edge',filter:{}})).geometryFingerprint);checkTransaction(signal,expectedRevision);}catch(error){await request('rebuild',{document:documentModel});throw error;}
    // Automatic clearance belongs to the same geometry transaction. A locked
    // frame and a user-chosen empty point are left alone.
    if(record&&JSON.stringify(next.features)!==JSON.stringify(documentModel.features)&&!next.referenceSystem.workFrame.locked){
      const work=next.referenceSystem.workFrame,clear=clearOccupiedAnchor(work.origin,result.bodies);
      if(clear!==work.origin){work.origin=clear;work.frameVersion++;work.sourceLabel='自动避让模型';work.provenance={kind:'manual'};}
    }
    if(record)pushUndo();
    if(newInstance||documentModel.documentId!==next.documentId){documentInstanceId=crypto.randomUUID();projectFileHandle=null;}
    documentModel=next;bodies=result.bodies;selectedTopology=null;previewNext=null;previewIdentity=null;revision++;
    lastWarnings=[];dirty=true;if(save)void autosave();
    selectedIds=select&&bodies.some(b=>b.id===select)?[select]:selectedIds.filter(id=>bodies.some(b=>b.id===id));
    try{viewport.cancelTask();applyAppearance();viewport.setBodies(bodies,documentModel.hidden);viewport.setWorkFrame?.(documentModel.referenceSystem.workFrame);viewport.setSelection(selectedIds);
    if(fit)viewport.fit();viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});}catch(error){lastWarnings.push({code:'DISPLAY_FAILED',message:error.message});}
    // Commit is synchronous. Persistence follows without yielding between commit
    // and the command acknowledgement, so a late abort cannot claim rollback.
    try{ui.clearErrors();setStatus(`就绪 · ${bodies.length} 个实体 · ${bodies.reduce((sum,b)=>sum+(b.solidCount||0),0)} 个封闭实心体`);}catch(error){lastWarnings.push({code:'DISPLAY_FAILED',message:error.message});}
    return result;
  }finally{try{setBusy(false);}catch(error){busy=false;lastWarnings.push({code:'DISPLAY_FAILED',message:error.message});}}
}
function featureDocument(op,params={},explicitRefs=[],name,placement){
  const refs=[];const selection=explicitRefs;const single=['autoRound','smoothTransition','transform','copy','mirror','fillet','chamfer','shell','hole','multiHole','multiPocket','multiBoss','slot','linearPattern','circularPattern','split','extractSolid','extractShell','faceHole','faceExtrude','logo','curvedLogo','thickenFace','extractFaces'];
  if([...single,'planeSection','faceBoundary','referenceExtrude'].includes(op)){
    if(selection.length!==1||!bodies.some(b=>b.id===selection[0]))throw new Error('请先选择一个当前实体。');
    refs.push(selection[0]);
  }
  if(['group','union','cut','intersect'].includes(op)){
    if(selection.length<2)throw new Error('请按住 Shift 依次选择至少两个实体。切除时先选保留的主体，再选刀具。');
    refs.push(...selection);
  }
  if(op==='referenceLoft'){
    if(selection.length<2||selection.length>12)throw new Error('请按顺序选择 2–12 个闭合截面对象。');
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
  if(['faceHole','faceExtrude','logo','curvedLogo','thickenFace','faceBoundary'].includes(op)){
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
  next.features.push({id,op,name:name||`${labels[op]||op} ${next.features.filter(f=>f.op===op).length+1}`,params,refs,...(placement?{placement,semanticsVersion:2}:{})});
  if(next.appearance?.[refs[0]])next.appearance[id]=next.appearance[refs[0]];
  if(next.colors?.[refs[0]])next.colors[id]=next.colors[refs[0]];
  return {next,id};
}
async function addFeature(op,params={},options={}){
  const refs=options.refs??[];
  if(migratedOperationIds.includes(op))params=normalizeOperationParams(op,params);
  params=await resolveLogoParams(op,params,refs,options);
  const {next,id}=featureDocument(op,params,refs,options.name,options.placement);
  const result=await rebuild(next,{...options,select:id,fit:!bodies.length||['vectorProfile','box','sphere','cylinder','cone','torus','extrude','revolve','copy','mirror','linearPattern','circularPattern','quickModel','sweep','loft'].includes(op)});
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
  if(Object.keys(params).some(key=>Object.keys(feature.expressions||{}).some(path=>path===key||path.startsWith(key+'.'))))throw Object.assign(new Error('该尺寸已绑定命名参数，请在参数表中修改。'),{code:'PARAMETER_BOUND'});
  feature.params=migratedOperationIds.includes(feature.op)?normalizeOperationPatch(feature.op,feature.params,params):{...feature.params,...params};if(name?.trim())feature.name=name.trim();if(options.placement){feature.placement=options.placement;feature.semanticsVersion=2;}
  await rebuild(next,{...options,select:id});
}
async function navigateHistory(direction,options={}){
  const source=direction==='undo'?undoStack:redoStack;if(!source.length||busy)return;
  const next=source[source.length-1],old=clone(documentModel);
  if(JSON.stringify({features:next.features,imports:next.imports})===JSON.stringify({features:old.features,imports:old.imports})){
    checkTransaction(options.signal,options.expectedRevision);documentModel=clone(next);revision++;dirty=true;void autosave();viewport.setWorkFrame?.(next.referenceSystem.workFrame);viewport.markModel({documentId:next.documentId,documentInstanceId,revision});refresh();
  }else await rebuild(clone(next),{...options,record:false});source.pop();(direction==='undo'?redoStack:undoStack).push(old);try{refresh();}catch(error){lastWarnings.push({code:'DISPLAY_FAILED',message:error.message});}
}
function checkTransaction(signal,expectedRevision){if(signal?.aborted)throw Object.assign(new Error('AI request cancelled before commit'),{code:'CANCELLED',path:'context',recoveryAction:'READ_STATE_AND_REPLAN'});if(expectedRevision!==undefined&&expectedRevision!==revision)throw Object.assign(new Error(`Revision conflict: expected ${expectedRevision}, current ${revision}. Read state and retry.`),{code:'REVISION_CONFLICT',path:'context.expectedRevision',recoveryAction:'READ_STATE_AND_REPLAN'});}
async function previewFeature(op,params,explicitRefs,name,placement,identity=null){
  if(busy)throw new Error('Please wait for the current operation.');
  if(!Object.hasOwn(labels,op)||op==='import')throw new Error('Unsupported preview operation');
  const previousPreview=previewNext,previousIdentity=previewIdentity;
  const uiParams=explicitRefs?params:adaptUISelection(op,params,selectedIds,selectedTopology);
  const refs=explicitRefs||[...selectedIds];
  const resolved=await resolveLogoParams(op,migratedOperationIds.includes(op)?normalizeOperationParams(op,uiParams):uiParams,refs);
  const {next}=featureDocument(op,resolved,refs,name,placement),generation=++previewGeneration;previewComputing=true;setBusy(true,'预览 / Preview…');
  try{const result=await request('rebuild',{document:next});
    if(generation!==previewGeneration){await request('rebuild',{document:documentModel});previewNext=null;viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds,selectedTopology);return false;}
    previewNext=next;previewIdentity=identity;viewport.setBodies(result.bodies,next.hidden);viewport.setSelection([]);if(!bodies.length)viewport.fit();setStatus('预览未保存 · 应用或取消 / Preview: apply or cancel');return true;}
  catch(error){if(previousPreview&&previousIdentity?.previewId===identity?.previewId){const restored=await request('rebuild',{document:previousPreview});previewNext=previousPreview;previewIdentity=previousIdentity;viewport.setBodies(restored.bodies,previousPreview.hidden);}else{previewNext=null;previewIdentity=null;await request('rebuild',{document:documentModel});viewport.setBodies(bodies,documentModel.hidden);}throw error;}
  finally{previewComputing=false;setBusy(false);}
}
async function previewFile(fileImport,identity,update=false){
  if(busy)throw new Error('Please wait for the current operation.');
  const previousPreview=previewNext,previousIdentity=previewIdentity,next=update?clone(previewNext):clone(documentModel);
  if(update){if(!next||!previousIdentity||previousIdentity.previewId!==identity.previewId||previousIdentity.generation+1!==identity.generation)throw Object.assign(new Error('Preview generation changed'),{code:'STALE_REFERENCE'});next.features.at(-1).placement=fileImport.placement;}
  else{const {name,data,placement}=fileImport,extension=name.split('.').pop().toLowerCase(),format=['step','stp'].includes(extension)?'step':['brep','brp'].includes(extension)?'brep':null;if(!format)throw Object.assign(new Error('Unsupported file preview format'),{code:'FORMAT_UNSUPPORTED'});const key=crypto.randomUUID(),id=crypto.randomUUID();next.imports[key]={format,data};next.features.push({id,op:'import',name,params:{key},refs:[],placement,semanticsVersion:2});}
  if(new TextEncoder().encode(JSON.stringify(next,null,2)).byteLength>20*1024*1024-4096)throw Object.assign(new Error('文件预览会使自包含工程超过 20 MiB 限额'),{code:'SIZE_LIMIT'});
  const generation=++previewGeneration;previewComputing=true;setBusy(true,'文件插入预览 / File preview…');
  try{const result=await request('rebuild',{document:next});if(generation!==previewGeneration){await request('rebuild',{document:documentModel});previewNext=null;previewIdentity=null;viewport.setBodies(bodies,documentModel.hidden);return false;}previewNext=next;previewIdentity=identity;viewport.setBodies(result.bodies,next.hidden);viewport.setSelection([]);setStatus('文件插入预览未保存 · 应用或取消');return true;}
  catch(error){if(previousPreview&&previousIdentity?.previewId===identity?.previewId){const restored=await request('rebuild',{document:previousPreview});previewNext=previousPreview;previewIdentity=previousIdentity;viewport.setBodies(restored.bodies,previousPreview.hidden);}else{await request('rebuild',{document:documentModel});previewNext=null;previewIdentity=null;viewport.setBodies(bodies,documentModel.hidden);}throw error;}
  finally{previewComputing=false;setBusy(false);}
}
async function cancelPreview(){previewGeneration++;if(previewComputing||!previewNext)return;setBusy(true,'取消预览 / Cancel preview…');try{await request('rebuild',{document:documentModel});previewNext=null;previewIdentity=null;viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds,selectedTopology);}finally{setBusy(false);}}

function safeName(name){return (name||'WebCAD').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.{2,}/g,'_').replace(/[. ]+$/g,'').slice(0,120)||'WebCAD';}
function download(data,name,mime='application/octet-stream'){
  const blob=data instanceof Blob?data:new Blob([data],{type:mime});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportData(format='step',ids){
  if(previewNext)throw new Error('请先应用或取消预览。 / Apply or cancel preview first.');
  if(!kernelReady)throw new Error('内核尚未就绪，请保存工程后刷新页面。');
  if(!bodies.length)throw new Error('当前工程没有可导出的实体。');
  if(busy)throw new Error('请等待当前计算完成。');setBusy(true,'正在生成导出文件…');
  try{const result=await request('export',{format,ids});setStatus('导出内容已生成。');return result;}
  catch(error){setStatus(`导出失败：${error.message}`,'error');throw error;}
  finally{setBusy(false);}
}
let projectFileHandle=null,lastOutputResource=null;
function retainOutput(artifact){
  if(lastOutputResource)try{pageAPI.files.release({resourceId:lastOutputResource});}catch{/* It may already have expired. */}
  lastOutputResource=artifact.resourceId;
}
async function saveProject(){
  if(busy||previewNext||previewComputing)throw new Error('请先完成当前操作。');
  // Acquire permission synchronously from the user gesture, before expensive generation.
  if(!projectFileHandle&&window.showSaveFilePicker){
    try{projectFileHandle=await window.showSaveFilePicker({suggestedName:safeName(documentModel.name)+'.webcad',types:[{description:'WebCAD 工程',accept:{'application/json':['.webcad']}}]});}
    catch(error){if(error.name==='AbortError'){setStatus('保存已取消，工程保留。');return;}throw error;}
  }
  const c=pageAPI.getState().context,context={...c,expectedRevision:c.revision};delete context.revision;
  const artifact=await pageAPI.files.save({context,name:safeName(documentModel.name)+'.webcad'});if(artifact.status==='failed')throw new Error(artifact.error.message);
  retainOutput(artifact);
  try{
    const result=projectFileHandle?await pageAPI.files.write({resourceId:artifact.resourceId,handle:projectFileHandle}):await pageAPI.files.download({resourceId:artifact.resourceId});
    if(result.status==='failed')throw new Error(result.error.message);
    ui.showFileReceipt(artifact,result);
  }catch(error){if(error.code==='PERMISSION_REQUIRED'||error.name==='NotAllowedError')projectFileHandle=null;ui.showFileReceipt(artifact,{status:'write_failed',error:{message:error.message}});throw error;}
  setStatus(projectFileHandle?'文件已写入、关闭并回读核验；保存状态按版本更新。':'下载已发起；未确认写入，未保存标记保留。');refresh();
}
function chooseFile(accept='.webcad,.json,.step,.stp,.brep,.brp,.iges,.igs,.stl',multiple=true){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.multiple=multiple;input.addEventListener('change',()=>resolve([...input.files]));input.addEventListener('cancel',()=>resolve([]));input.click();});}
function base64(array){let text='';for(let i=0;i<array.length;i+=0x8000)text+=String.fromCharCode(...array.subarray(i,i+0x8000));return btoa(text);}
function validateDocument(doc){
  if(!doc||![1,2].includes(doc.version)||!Array.isArray(doc.features)||typeof doc.imports!=='object'||!doc.imports)throw new Error('不是有效的 WebCAD 1.x/2.x 工程文件。');
  if(doc.features.length>2000)throw new Error('工程操作超过 2000 项，暂不适合此浏览器工作台。');
  const ids=new Set();for(const f of doc.features){if(!f.id||ids.has(f.id)||typeof f.op!=='string'||!f.params||!Array.isArray(f.refs))throw new Error('工程特征结构无效。');for(const ref of f.refs)if(!ids.has(ref))throw new Error('工程包含无效的操作引用。');if(f.placement!==undefined){if(doc.version!==2||f.semanticsVersion!==2)throw Object.assign(new Error('定位特征需要工程版本 2 和语义版本 2。'),{code:'DOCUMENT_VERSION_UNSUPPORTED'});validateResolvedPlacement(f.placement,f.op);}ids.add(f.id);}
  return {version:2,referenceSystem:doc.version===2?validateReferenceSystem(doc.referenceSystem):createReferenceSystem(),...(doc.parameters!==undefined?{parameters:doc.parameters}:{}),documentId:typeof doc.documentId==='string'&&doc.documentId.length>0&&doc.documentId.length<=150?doc.documentId:crypto.randomUUID(),name:String(doc.name||'导入工程'),features:doc.features,imports:doc.imports,hidden:Array.isArray(doc.hidden)?doc.hidden:[],appearance:doc.appearance&&typeof doc.appearance==='object'?doc.appearance:{},colors:doc.colors&&typeof doc.colors==='object'?Object.fromEntries(Object.entries(doc.colors).filter(([,v])=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))):{},renderFinish:doc.renderFinish??null};
}
async function openFiles(files,{confirmReplace=true,signal,expectedRevision,mcp=false,placement}={}){
  if(busy){if(mcp)throw new Error('Worker is busy');return;}
  for(const file of files){
    checkTransaction(signal,expectedRevision);
    if(file.size>20*1024*1024)throw Object.assign(new Error('单文件超过 20 MiB；请先拆分模型。导入后自包含工程也必须可在此限额内保存。'),{code:'SIZE_LIMIT'});
    const ext=file.name.split('.').pop().toLowerCase();
    if(['webcad','json'].includes(ext)){
      const next=validateDocument(JSON.parse(await file.text()));
      if(mcp&&dirty)throw Object.assign(new Error('Save the current document before opening another project.'),{code:'UNSAVED_REPLACEMENT'});
      if(confirmReplace&&dirty&&!confirm('打开工程将替换当前设计。尚未另存的设计可取消后先保存。继续打开？'))return;
      await rebuild(next,{fit:true,newInstance:true,record:false,signal,expectedRevision});undoStack=[];redoStack=[];dirty=false;refresh();
    }else{
      if(ext==='stl')throw new Error('STL 是三角网格，精确建模请使用 STEP、BREP 或 IGS。');
      const isIges=['igs','iges'].includes(ext);
      const format=isIges?'step':['step','stp'].includes(ext)?'step':['brep','brp'].includes(ext)?'brep':null;
      if(!format)throw new Error('请选择 .webcad 工程、STEP/STP 或 BREP 文件。');
      const next=clone(documentModel),key=crypto.randomUUID(),id=crypto.randomUUID();
      if(isIges)throw Object.assign(new Error('静态版不支持 IGES；请离线转换为 STEP / BREP。'),{code:'CAPABILITY_UNAVAILABLE'});
      next.imports[key]={format,data:base64(new Uint8Array(await file.arrayBuffer()))};
      next.features.push({id,op:'import',name:file.name,params:{key},refs:[],...(placement?{placement,semanticsVersion:2}:{})});
      if(!next.features.slice(0,-1).length)next.name=file.name.replace(/\.[^.]+$/,'');
      await rebuild(next,{fit:true,select:id,signal,expectedRevision});
      if(isIges&&!mcp){const d=next.imports[key].source;ui.showInfo('IGS 导入诊断',`源文件 ${d.name}：${d.topology?.faces??'?'} 面，${d.topology?.shells??'?'} 壳，${d.topology?.solids??'?'} 实体。未自动修复；散面请尝试曲面缝合，开放壳不能直接当实体加工。`);}
    }
  }
}
async function performAction(action,params={}){
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
  if(action==='commitPreview'){if(!previewNext)throw new Error('No preview to apply');await rebuild(clone(previewNext),{select:previewNext.features.at(-1)?.id});return;}
  if(action==='preview'){
    const input={...params.params},useFrame=input.useWorkFrame===true,sourceAnchor=input.placementSourceAnchor;delete input.useWorkFrame;delete input.placementSourceAnchor;
    const placement=useFrame?resolvePlacement({version:1,frame:{kind:'work',expectedFrameVersion:documentModel.referenceSystem.workFrame.frameVersion},sourceAnchor:sourceAnchor||{kind:params.op==='box'?'bottom-center':'model-origin'}},documentModel.referenceSystem,params.op,input):undefined;
    return previewFeature(params.op,input,undefined,undefined,placement);
  }
  if(action==='gizmo'){viewport.setGizmo(params.mode);refresh();return;}
  if(action==='anchorDrag'){if(documentModel.referenceSystem.workFrame.locked)throw Object.assign(new Error('工作基准已锁定'),{code:'REFERENCE_LOCKED'});viewport.setAnchorDrag(!viewport.anchorDragEnabled);refresh();return;}
  if(action==='anchorVisibility'){viewport.setAnchorVisible(params.visible);refresh();return;}
  if(action==='snap'){viewport.snapEnabled=params.enabled??!viewport.snapEnabled;setStatus(viewport.snapEnabled?'几何吸附已启用 / Snap enabled':'吸附已关闭 / Snap disabled');refresh();return;}
  if(action==='section'){viewport.setSection(params);return;}
  if(action==='perPartMetal')return runEditorAction('body.appearance',{bodyIds:[...selectedIds],finish:params.key});
  if(action==='bodyColor')return runEditorAction('body.appearance',{bodyIds:[...selectedIds],color:params.color,finish:'design'});
  if(action==='displayPreferences'){const {revision:r,...identity}=pageAPI.getState().context;const result=await pageAPI.setDisplayPreferences({context:{...identity,expectedRevision:r},values:params});if(result.status==='failed')throw new Error(result.error.message);return result;}
  if(action==='inspectPrintability'){const {revision:r,...identity}=pageAPI.getState().context;const result=await pageAPI.inspectPrintability({context:{...identity,expectedRevision:r},bodyId:params.bodyId,angleLimitDeg:params.angleLimitDeg});if(result.status==='failed')throw Object.assign(new Error(result.error.message),result.error);return result;}
  if(action==='metalFinish')return runEditorAction('document.appearance',{finish:params.key});
  if(action==='fit'){viewport.fit();return;}
  if(action==='view'){viewport.view(params.direction);return;}
  if(action==='display'){viewport.setDisplay(params.mode);refresh();return;}
  if(action==='projection'){viewport.setProjection(params.mode);document.querySelector('.view-label').textContent=params.mode==='orthographic'?'正交视图':'透视视图';refresh();return;}
  if(action==='grid'){setStatus(viewport.toggleGrid()?'网格已显示':'网格已隐藏');refresh();return;}
  if(action==='selectTool'){await cancelPreview();viewport.setGizmo('off');viewport.setSelectionMode('body');viewport.renderer.domElement.style.cursor='default';selectedTopology=null;viewport.setSelection(selectedIds);refresh();return;}
  if(action==='selectMode'){viewport.setSelectionMode(params.mode);selectedTopology=null;viewport.setSelection(selectedIds);refresh();return;}
  if(action==='help'){ui.showInfo('WebCAD 使用说明','新建实体：选择基本体，输入毫米尺寸。选择：点击模型或左侧实体，Shift 多选。切除：先选主体，再选刀具。圆角/倒角：切换选边，可 Shift 选择多条边；处理全部边需明确勾选。抽壳：先选开口面。草图：在 XY 网格点击轮廓后拉伸。左键拖动旋转，右键平移，滚轮缩放，F 适配。Ctrl+Z 撤销，Ctrl+Shift+Z 重做，Ctrl+S 保存工程。STEP/BREP 可导入后加工；原 CAD 特征树不会恢复。保存 .webcad 保留参数历史，导出 STEP 用于 Creo / SolidWorks / FreeCAD，STL 用于切片打印。');return;}
  if(action==='screenshot'){const link=document.createElement('a');link.href=viewport.screenshot();link.download=safeName(documentModel.name)+'.png';link.click();return;}
  if(action==='save'){await saveProject();return;}
  if(busy)throw new Error('当前操作尚未完成，请稍候。');
  if(previewNext)throw new Error('请先应用或取消预览。 / Apply or cancel preview first.');
  if(action==='explode')return runEditorAction('body.explode',{bodyId:selectedIds.length===1?selectedIds[0]:null});
  if(action==='new'){
    if(dirty&&!confirm('当前设计尚未另存。确定新建设计？（可以取消后先保存）'))return;
    await rebuild(emptyDocument(),{fit:true,newInstance:true});selectedIds=[];dirty=false;refresh();return;
  }
  if(action==='open'){await openFiles(await chooseFile());return;}
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
      const {preset,useWorkFrame,...dimensions}=params,extrude={...dimensions,profile:preset,plane:'XY'};
      if(useWorkFrame){const card=getOperation('extrude');return runEditorAction('feature.add',{op:'extrude',opVersion:card.version,schemaHash:card.schemaHash,params:extrude,refs:[],placement:{version:1,frame:{kind:'work',expectedFrameVersion:documentModel.referenceSystem.workFrame.frameVersion},sourceAnchor:{kind:'model-origin'}}});}
      await addFeature('extrude',extrude);return;
    }
    viewport.startSketch(params);return;
  }
  if(Object.hasOwn(labels,action)&&action!=='import'){
    const input={...params},useFrame=input.useWorkFrame===true,sourceAnchor=input.placementSourceAnchor;delete input.useWorkFrame;delete input.placementSourceAnchor;
    const adapted=adaptUISelection(action,input,selectedIds,selectedTopology);
    if(useFrame){const card=getOperation(action),refs=placementPolicy(action)==='C'?[]:[...selectedIds];return runEditorAction('feature.add',{op:action,opVersion:card.version,schemaHash:card.schemaHash,params:adapted,refs,placement:{version:1,frame:{kind:'work',expectedFrameVersion:documentModel.referenceSystem.workFrame.frameVersion},sourceAnchor:sourceAnchor||{kind:action==='box'?'bottom-center':'model-origin'}}});}
    await addFeature(action,adapted,{refs:[...selectedIds]});return;
  }
  throw new Error('尚未识别的操作：'+action);
}

const dbPromise=new Promise(resolve=>{try{const req=indexedDB.open('webcad-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('documents');req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);}catch{resolve(null);}});
async function autosave(){
  const snapshot=clone(documentModel),instance=documentInstanceId,savedRevision=revision;
  persistenceCheckpoint='pending';
  const update=value=>{if(instance===documentInstanceId&&savedRevision===revision)persistenceCheckpoint=value;};
  const db=await dbPromise;if(!db){update('failed');return;}
  return new Promise(resolve=>{try{const tx=db.transaction('documents','readwrite');
    tx.objectStore('documents').put({document:snapshot,savedAt:Date.now(),instanceId:instance,revision:savedRevision},`recovery:${instance}`);
    tx.oncomplete=()=>{update('saved');resolve();};
    tx.onerror=tx.onabort=()=>{update('failed');resolve();};
  }catch{update('failed');resolve();}});
}
document.addEventListener('keydown',event=>{
  const typing=event.target.closest('input,textarea,select,[contenteditable=true]');
  if(event.key==='Escape'){if(event.isComposing)return;if(ui.cancelActiveTask())return;viewport.cancelAnchorDrag();viewport.cancelTask();if(previewNext||previewComputing)cancelPreview().catch(reportError);if(!typing)selectBody(null);return;}
  if(typing||document.querySelector('dialog[open]'))return;
  const mod=event.ctrlKey||event.metaKey;let action;
  if(mod&&event.key.toLowerCase()==='s')action='save';
  else if(mod&&event.key.toLowerCase()==='o')action='open';
  else if(mod&&event.key.toLowerCase()==='z')action=event.shiftKey?'redo':'undo';
  else if(mod&&event.key.toLowerCase()==='y')action='redo';
  else if(event.key==='Delete')action='remove';
  else if(event.key.toLowerCase()==='f')action='fit';
  if(action){event.preventDefault();performAction(action).catch(reportError);}
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
const host=document.getElementById('viewport');host.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';});host.addEventListener('drop',event=>{event.preventDefault();openFiles([...event.dataTransfer.files]).catch(reportError);});

refresh();
const ready=(async()=>{
  try{await request('ready');kernelReady=true;await rebuild(emptyDocument(),{record:false,save:false});dirty=false;refresh();setStatus('就绪 · 在工具栏创建实体，或打开 STEP / WebCAD 工程。');return true;}
  catch(error){reportError(error);return false;}
})();
// Public automation surface also used by reproducible acceptance checks; never runs arbitrary code.
function getState(){return {revision,document:clone(documentModel),bodies:bodies.map(({id,name,bounds,volume,solidCount,shellCount,transitionReport,faceGroups,edges})=>({id,name,bounds,volume,solidCount,shellCount,transitionReport,faceCount:faceGroups.length,edgeCount:edges.length})),selectedIds:[...selectedIds],selectedTopology:clone(selectedTopology),busy,kernelReady,dirty,preview:!!previewNext};}
function aiState(){return {sessionId:pageSessionId,revision,dirty,documentId:documentModel.documentId,documentInstanceId,documentName:documentModel.name,referenceSystem:clone(documentModel.referenceSystem),features:clone(documentModel.features),hidden:[...documentModel.hidden],appearance:clone(documentModel.appearance||{}),bodies:bodies.map(({id,name,bounds,volume,solidCount,shellCount,transitionReport,faceGroups,edges})=>({id,name,bounds,volume,solidCount,shellCount,transitionReport,faceCount:faceGroups.length,edgeCount:edges.length})),selectedIds:[...selectedIds],selectedTopology:clone(selectedTopology),busy,kernelReady,preview:!!previewNext,previewInfo:previewIdentity?clone(previewIdentity):null};}
async function executeAI(command,args={},options={}){
  if(command==='file_command')return commandService.fileCommand(args,options);
  if(command==='get_state_v2')return commandService.getState(args);
  if(command==='query_geometry')return commandService.queryGeometry(args);
  if(command==='execute_v2')return commandService.execute(args,options);
  await ready;if(!kernelReady)throw new Error('CAD kernel unavailable');checkTransaction(options.signal,options.expectedRevision);
  if(command==='get_state')return aiState();
  if(command==='get_templates')return QUICK_MODELS;
  if(ui.hasActiveTask()&&!options.fromUI)throw Object.assign(new Error('Finish the current human task or preview before AI editing.'),{code:'UI_TASK_ACTIVE'});
  if(busy||(previewNext&&!['preview.commit','preview.cancel','preview_update','preview_file_update'].includes(command)))throw new Error('Finish current operation or preview before AI editing.');
  if(command==='preview_feature'){await previewFeature(args.op,args.params,args.refs,args.name,args.placement,args.previewIdentity);return aiState();}
  if(command==='preview_file'){await previewFile(args.fileImport,args.previewIdentity);return aiState();}
  if(command==='preview_file_update'){await previewFile({placement:args.placement},args.previewIdentity,true);return aiState();}
  if(command==='preview_update'){if(!previewIdentity||previewIdentity.previewId!==args.previewIdentity?.previewId||previewIdentity.generation+1!==args.previewIdentity.generation)throw Object.assign(new Error('Preview generation changed'),{code:'STALE_REFERENCE'});await previewFeature(args.op,args.params,args.refs,args.name,args.placement,args.previewIdentity);return aiState();}
  if(command==='reference_action'){
    const next=clone(documentModel);next.referenceSystem=args.referenceSystem;
    if(JSON.stringify(next.referenceSystem)===JSON.stringify(documentModel.referenceSystem))return aiState();
    checkTransaction(options.signal,options.expectedRevision);pushUndo();documentModel=next;revision++;dirty=true;lastWarnings=[];
    viewport.setWorkFrame?.(next.referenceSystem.workFrame);viewport.markModel({documentId:next.documentId,documentInstanceId,revision});refresh();void autosave();return aiState();
  }
  if(command==='preview.cancel'){if(!previewNext)throw new Error('No preview to cancel');if(previewIdentity&&(previewIdentity.previewId!==args.previewId||previewIdentity.generation!==args.expectedGeneration))throw Object.assign(new Error('Preview identity changed'),{code:'STALE_REFERENCE'});await cancelPreview();return aiState();}
  if(command==='preview.commit'){if(!previewNext)throw new Error('No preview to apply');if(previewIdentity&&(previewIdentity.previewId!==args.previewId||previewIdentity.generation!==args.expectedGeneration))throw Object.assign(new Error('Preview identity changed'),{code:'STALE_REFERENCE'});await rebuild(clone(previewNext),{...options,select:previewNext.features.at(-1)?.id});return aiState();}
  if(command==='editor_action'){
    const {action,values:a}=args,next=clone(documentModel);
    if(action==='body.explode'){
      const source=bodies.find(b=>b.id===a.bodyId),ids=[];
      for(let i=0;i<source.solidCount;i++){
        const id=crypto.randomUUID();ids.push(id);
        next.features.push({id,op:'extractSolid',name:(source.name||'模型')+' / '+(i+1),params:{solidIndex:i,keepOriginal:i<source.solidCount-1},refs:[source.id]});
        if(next.appearance?.[source.id])next.appearance[id]=next.appearance[source.id];
        if(next.colors?.[source.id])next.colors[id]=next.colors[source.id];
      }
      await rebuild(next,{...options,select:ids[0]});selectedIds=ids;viewport.setSelection(ids);refresh();return aiState();
    }
    if(action==='document.rename')next.name=a.name.trim();
    if(action==='feature.rename')next.features.find(f=>f.id===a.featureId).name=a.name.trim();
    if(action==='body.visibility')next.hidden=[...new Set([...next.hidden.filter(id=>!a.bodyIds.includes(id)),...(a.visible?[]:a.bodyIds)])];
    if(action==='document.appearance')next.renderFinish=a.finish;
    if(action==='body.appearance')for(const id of a.bodyIds){
      for(const [field,value] of [['colors',a.color],['appearance',a.finish]])if(value!==undefined){next[field]={...next[field]};if(value===null)delete next[field][id];else next[field][id]=value;}
    }
    checkTransaction(options.signal,options.expectedRevision);pushUndo();documentModel=next;dirty=true;revision++;
    if(action==='feature.rename'){const body=bodies.find(b=>b.id===a.featureId);if(body)body.name=a.name.trim();}
    lastWarnings=[];
    try{applyAppearance();viewport.setHidden(next.hidden);viewport.markModel({documentId:next.documentId,documentInstanceId,revision});refresh();}catch(e){lastWarnings.push({code:'DISPLAY_FAILED',message:e.message});}
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
  if(command==='file_save'){
    const savedRevision=revision,instance=documentInstanceId,docId=documentModel.documentId;
    const bytes=new TextEncoder().encode(JSON.stringify(clone(documentModel),null,2));
    checkTransaction(options.signal,savedRevision);
    return {revision:savedRevision,documentId:docId,documentInstanceId:instance,encoding:'base64',data:base64(bytes),extension:'webcad',mime:'application/json'};
  }else if(command==='acknowledge_save'){
    if(args.documentId!==documentModel.documentId||args.documentInstanceId!==documentInstanceId||args.savedRevision!==revision)return {saved:false,dirty,revision,reason:'SNAPSHOT_CHANGED'};
    dirty=false;refresh();return {saved:true,dirty:false,revision,documentId:documentModel.documentId,documentInstanceId};
  }else if(command==='file_new'){
    if(dirty)throw Object.assign(new Error('Save the current document before creating a new project.'),{code:'UNSAVED_REPLACEMENT'});
    await rebuild(emptyDocument(),{...options,fit:true,newInstance:true,record:false});undoStack=[];redoStack=[];selectedIds=[];dirty=false;refresh();
    return {dirty};
  }else if(command==='file_open'||command==='file_import'){
    const ext=args.name?.split('.').pop().toLowerCase();
    const allowed=command==='file_open'?['webcad','json']:['step','stp','brep','brp','igs','iges'];
    if(!allowed.includes(ext))throw Object.assign(new Error('Unsupported file type for this action.'),{code:'FORMAT_UNSUPPORTED'});
    if(command==='file_open'&&dirty)throw Object.assign(new Error('Save the current document before opening another project.'),{code:'UNSAVED_REPLACEMENT'});
    if(typeof args.name!=='string'||typeof args.data!=='string'||args.data.length>28*1024*1024)throw new Error('ASSET_INVALID: missing or oversized asset payload.');
    const raw=atob(args.data),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    const file=new File([bytes],args.name,{type:args.mime||'application/octet-stream'});
    const placement=command==='file_import'?resolvePlacement(args.placement,documentModel.referenceSystem,'import',{}):undefined;
    await openFiles([file],{...options,confirmReplace:false,mcp:true,placement});
    return {dirty};
  }else if(command==='file_export'){
    let result;
    if(args.format==='png'){
      const cap=await pageAPI.capture({context:{sessionId:pageSessionId,documentId:documentModel.documentId,documentInstanceId,expectedRevision:options.expectedRevision}});
      if(cap.status==='failed')throw Object.assign(new Error(cap.error.message),cap.error);
      result={extension:'png',mime:'image/png',data:Uint8Array.from(atob(cap.dataUrl.split(',')[1]),c=>c.charCodeAt(0))};
    }else result=await exportData(args.format,args.ids);
    checkTransaction(options.signal,options.expectedRevision);
    return {revision,extension:result.extension,mime:result.mime,encoding:'base64',data:base64(typeof result.data==='string'?new TextEncoder().encode(result.data):new Uint8Array(result.data))};
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
    await addFeature(args.op,args.params||{},{...options,refs:args.refs??[],name:args.name,placement:args.placement});
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
  snapshot:()=>({...aiState(),busy:busy||!!viewport.anchorStart,documentId:documentModel.documentId,documentInstanceId,sessionId:pageSessionId,previewDraft:previewIdentity&&previewNext?clone(previewNext.features.at(-1)):null,previewComputing,warnings:clone(lastWarnings),persistence:{level:'memory',checkpoint:persistenceCheckpoint}}),
  execute:executeAI,
  query:args=>request('queryGeometry',args),
});
const pageAPI=createPageAPI({
  buildId:__WEBCAD_BUILD__,
  state:(input={})=>({...commandService.getState({sessionId:pageSessionId,include:['summary','features','bodies','selection','capabilities','references'],...input}),referenceSystem:clone(documentModel.referenceSystem),previewInfo:previewIdentity?clone(previewIdentity):null,renderQuality:qualityState(),parameters:clone(documentModel.parameters||{}),parameterValues:evaluateNamedParameters(documentModel.parameters||{}),hidden:[...documentModel.hidden],appearance:clone(documentModel.appearance||{}),colors:clone(documentModel.colors||{}),renderFinish:documentModel.renderFinish??null,displayPreferences:clone(viewport.displayPreferences),view:{display:viewport.mode,projection:viewport.camera.isOrthographicCamera?'orthographic':'perspective',grid:viewport.grid.visible,snap:viewport.snapEnabled,gizmo:viewport.gizmoMode,selectionMode:viewport.selectionMode,language:getLanguage(),camera:{position:viewport.camera.position.toArray(),target:viewport.controls.target.toArray()},section:clone(viewport.sectionState||{axis:'Z',position:0,enabled:false})}}),
  quality:async quality=>{setBusy(true,'更新显示网格…');try{const result=await request('remesh',{quality});bodies=result.bodies;qualityKey=quality;viewport.setBodies(bodies,documentModel.hidden);applyAppearance();viewport.setSelection(selectedIds,selectedTopology);viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});await viewport.frame();setStatus('显示网格已更新 · '+RENDER_QUALITIES[quality].label+' · '+qualityState().triangleCount.toLocaleString()+' 三角面');}finally{setBusy(false);}},
  preferences:values=>{viewport.displayPreferences={...viewport.displayPreferences,...validateDisplayPreferences(values)};applyAppearance();const persisted=saveDisplayPreferences(viewport.displayPreferences);refresh();return {persisted,storage:'cookie',values:clone(viewport.displayPreferences)};},
  execute:input=>commandService.execute(input),query:input=>commandService.queryGeometry(input),files:input=>commandService.fileCommand(input),
  references:async input=>{const context=pageAPI.getState().context,referenceSystem=clone(documentModel.referenceSystem),currentBodies=bodies.filter(body=>!documentModel.hidden.includes(body.id));const assertFresh=()=>{if(documentInstanceId!==context.documentInstanceId||revision!==context.revision)throw Object.assign(new Error('参考查询期间工程已变化，请重新查询'),{code:'STALE_REFERENCE'});};const result=await collectReferences(input,{context,referenceSystem,bodies:currentBodies,queryGeometry:(bodyId,kind)=>request('queryGeometry',{bodyId,kind,filter:{}}),queryNearest:(bodyId,kind,near)=>request('nearestGeometry',{bodyId,kind,point:near.point,options:{radiusMm:near.radiusMm}}),assertFresh});commandService.registerReferenceCandidates(pageAPI.createRequestContext(context),result.items);return result;},
  resolvePlacement:async input=>{if(input.refs.some(id=>!bodies.some(b=>b.id===id)))throw Object.assign(new Error('Unknown current body'),{code:'STALE_REFERENCE'});const context=pageAPI.getState().context,anchorId=input.placement?.sourceAnchor?.kind==='named'?input.placement.sourceAnchor.anchorId:null;if(anchorId){const anchor=documentModel.referenceSystem.bodyAnchors.find(item=>item.anchorId===anchorId&&item.status==='valid');if(!anchor||!input.refs.includes(anchor.bodyId))throw Object.assign(new Error('Named anchor is not on the source body'),{code:'STALE_REFERENCE'});const exact=await request('queryGeometry',{bodyId:anchor.bodyId,kind:'edge',filter:{}});if(exact.geometryFingerprint!==anchor.geometryFingerprint)throw Object.assign(new Error('Named anchor geometry changed'),{code:'STALE_REFERENCE'});if(documentInstanceId!==context.documentInstanceId||revision!==context.revision)throw Object.assign(new Error('Document changed during placement resolution'),{code:'STALE_REFERENCE'});}const params=migratedOperationIds.includes(input.op)?normalizeOperationParams(input.op,input.params):input.params;const resolved=resolvePlacement(input.placement,documentModel.referenceSystem,input.op,params);if(!resolved)throw Object.assign(new Error('Explicit placement required'),{code:'FRAME_INVALID'});return {status:'read',context,...describeResolvedPlacement(input.op,params,resolved)};},
  confirmSaved:snapshot=>executeAI('acknowledge_save',snapshot),
  measure:input=>request('measure',{bodyId:input.bodyId,topologyType:input.kind==='body'?undefined:input.kind,topologyId:input.topologyId}),
  inspectPrintability:(bodyId,angleLimitDeg)=>{const body=bodies.find(item=>item.id===bodyId);if(!body)throw Object.assign(new Error('Unknown current body'),{code:'STALE_REFERENCE'});return inspectPrintabilityMesh(body,angleLimitDeg);},
  display:()=>viewport.displayState(),frame:()=>{if(lastWarnings.some(w=>w.code==='DISPLAY_FAILED'))throw Object.assign(new Error('Display failed; call redraw'),{code:'DISPLAY_FAILED'});viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});return viewport.frame();},capture:()=>viewport.screenshot(),
  view:async input=>{if(input.display)viewport.setDisplay(input.display);if(input.grid!==undefined)viewport.grid.visible=input.grid;if(input.snap!==undefined)viewport.snapEnabled=input.snap;if(input.gizmo)viewport.setGizmo(input.gizmo);if(input.selectionMode){viewport.setSelectionMode(input.selectionMode);selectedTopology=null;}if(input.language){setLanguage(input.language);viewport.updateLanguage();ui.update({language:input.language});}if(input.camera){viewport.camera.position.fromArray(input.camera.position);viewport.controls.target.fromArray(input.camera.target);viewport.controls.update();}if(input.section)viewport.setSection(input.section);if(input.projection)viewport.setProjection(input.projection);if(input.direction)viewport.view(input.direction==='side'?'right':input.direction);if(input.fit)viewport.fit();if(input.selectedIds){selectedIds=[...input.selectedIds];selectedTopology=null;viewport.setSelection(selectedIds);}viewport.setSelection(selectedIds,selectedTopology);refresh();await viewport.frame();},
  redraw:async()=>{viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds,selectedTopology);viewport.markModel({documentId:documentModel.documentId,documentInstanceId,revision});await viewport.frame();lastWarnings=lastWarnings.filter(w=>w.code!=='DISPLAY_FAILED');},
});
Object.defineProperty(window,'webcad',{value:Object.freeze({api:pageAPI}),writable:false,configurable:false});
if(new URLSearchParams(location.search).get('agent')==='1'){
  aiStatus='connecting';refresh();
  import('./ai-bridge.js').then(({connectAI})=>{
    agentBridge=connectAI({getState:aiState,execute:executeAI},{onStatus:event=>{aiStatus=event.state;refresh();}});
  }).catch(error=>{aiStatus='error';reportError(Object.assign(new Error(`Agent 接口启动失败：${error.message}`),{cause:error}));});
}
