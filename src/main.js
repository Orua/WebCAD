import './style.css';
import { createUI } from './ui.js';
import { CADViewport } from './viewport.js';
import { QUICK_MODELS } from './quick-models.js';
import { connectAI } from './ai-bridge.js';
import { t } from './i18n.js';
import { referenceNames } from './reference-tool-fields.js';
import { importIgesFile } from './iges-import-client.js';

const emptyDocument = () => ({version:1,name:'未命名设计',features:[],imports:{},hidden:[]});
const clone = value => structuredClone(value);
const labels = {box:'长方体',cylinder:'圆柱',sphere:'球体',cone:'圆锥',torus:'圆环',extrude:'拉伸',revolve:'旋转成型',transform:'变换',copy:'复制',mirror:'镜像',union:'合并',cut:'切除',intersect:'求交',fillet:'圆角',chamfer:'倒角',shell:'抽壳',hole:'打孔',linearPattern:'直线阵列',circularPattern:'环形阵列',import:'导入',remove:'删除'};
let documentModel=emptyDocument(),bodies=[],selectedIds=[],selectedTopology=null,busy=false,kernelReady=false,dirty=false;
let undoStack=[],redoStack=[],requestSequence=0,status='正在启动精确建模内核…';
let revision=0,previewNext=null,previewGeneration=0,previewComputing=false,aiStatus='connecting';
Object.assign(labels,{group:'组合',vectorProfile:'矢量路径',quickModel:'快速模型',sweep:'扫掠',loft:'放样',split:'分割',extractSolid:'提取实体',faceHole:'面上打孔',faceExtrude:'面拉伸',multiHole:'多位置打孔',slot:'长圆槽',logo:'LOGO 凹凸字'});
Object.assign(labels,{curveSweep:'曲线扫掠',advancedLoft:'多截面放样',curvedLogo:'曲面等深刻字'});
Object.assign(labels,{fittedSurface:'点阵拟合曲面',thickenFace:'选面增厚'});
Object.assign(labels,referenceNames);
const pending=new Map();
const worker=new Worker(new URL('./cad-worker.js',import.meta.url),{type:'module'});
worker.onmessage=event=>{const result=event.data;const job=pending.get(result.requestId);if(!job)return;clearTimeout(job.timer);pending.delete(result.requestId);if(result.ok)job.resolve(result);else job.reject(new Error(result.error||'建模操作失败'));};
worker.onerror=event=>{const error=new Error(event.message||'CAD 内核异常，请保存工程后刷新页面。');for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();kernelReady=false;ui?.showError(error.message);};
function request(type,payload={}){return new Promise((resolve,reject)=>{const requestId=++requestSequence;const timer=setTimeout(()=>{worker.terminate();kernelReady=false;const error=new Error('计算超过三分钟，已停止内核。当前工程仍保留，请保存工程后刷新页面；复杂模型可先简化。');for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();},180000);pending.set(requestId,{resolve,reject,timer});worker.postMessage({requestId,type,...payload});});}

const ui=createUI(document.getElementById('app'),{
  onAction:(action,params)=>performAction(action,params).catch(error=>{reportError(error);return false;}),
  onSelection:(id,additive)=>selectBody(id,additive),
  onEditFeature:(id,params,name)=>editFeature(id,params,name).catch(reportError),
  onVisibility:id=>toggleVisibility(id),
  onRename:name=>{if(!busy&&!previewNext&&String(name).trim()){pushUndo();documentModel.name=String(name).trim();dirty=true;revision++;refresh();autosave();}},
});
const viewport=new CADViewport(document.getElementById('viewport'),{
  onPick:pick,
  onSketch:params=>performAction('extrude',params).catch(reportError),
  onMeasure:(distance,delta)=>setStatus(`距离 ${distance.toFixed(3)} mm · ΔX ${delta[0].toFixed(3)} / ΔY ${delta[1].toFixed(3)} / ΔZ ${delta[2].toFixed(3)}`),
  onInteraction:mode=>ui.update({interactionMode:mode}),
  onRenderError:error=>ui.showError(error.message||String(error)),
  onTransform:params=>performAction('transform',params),
  onTransformError:reportError,
});

function refresh(){ui.update({document:documentModel,bodies,selectedIds,selectedTopology,undoAvailable:undoStack.length>0,redoAvailable:redoStack.length>0,busy,status,kernelReady,dirty,metalFinish:viewport.finishKey,aiStatus,revision,viewState:{display:viewport.mode,projection:viewport.camera.isOrthographicCamera?'orthographic':'perspective',grid:viewport.grid.visible,snap:viewport.snapEnabled,gizmo:viewport.gizmoMode,selection:viewport.selectionMode}});}
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
}
function toggleVisibility(id){if(busy||previewNext)return;pushUndo();documentModel.hidden=documentModel.hidden.includes(id)?documentModel.hidden.filter(x=>x!==id):[...documentModel.hidden,id];dirty=true;revision++;viewport.setHidden(documentModel.hidden);refresh();autosave();}

async function rebuild(next,{record=true,fit=false,select=null,save=true,signal,expectedRevision}={}){
  if(busy)throw new Error('当前操作尚未完成，请稍候。');
  if(!kernelReady)throw new Error('建模内核尚未就绪。');
  setBusy(true,'正在计算精确实体…');
  try{
    checkTransaction(signal,expectedRevision);
    const result=await request('rebuild',{document:next});
    try{checkTransaction(signal,expectedRevision);}catch(error){await request('rebuild',{document:documentModel});throw error;}
    if(record)pushUndo();
    documentModel=next;bodies=result.bodies;selectedTopology=null;previewNext=null;revision++;
    selectedIds=select&&bodies.some(b=>b.id===select)?[select]:selectedIds.filter(id=>bodies.some(b=>b.id===id));
    viewport.cancelTask();viewport.partFinishes=documentModel.appearance||{};viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds);
    if(fit)viewport.fit();
    // Commit is synchronous. Persistence follows without yielding between commit
    // and the command acknowledgement, so a late abort cannot claim rollback.
    dirty=true;if(save)void autosave();
    setStatus(`就绪 · ${bodies.length} 个实体 · ${bodies.reduce((sum,b)=>sum+(b.solidCount||0),0)} 个封闭实心体`);
    return result;
  }finally{setBusy(false);}
}
function featureDocument(op,params={},explicitRefs,name){
  const refs=[];const selection=explicitRefs??selectedIds;const single=['transform','copy','mirror','fillet','chamfer','shell','hole','multiHole','slot','linearPattern','circularPattern','split','extractSolid','faceHole','faceExtrude','logo','curvedLogo','thickenFace'];
  if([...single,'planeSection','faceBoundary'].includes(op)){
    if(selection.length!==1||!bodies.some(b=>b.id===selection[0]))throw new Error('请先选择一个当前实体。');
    refs.push(selection[0]);
  }
  if(['group','union','cut','intersect'].includes(op)){
    if(selection.length<2)throw new Error('请按住 Shift 依次选择至少两个实体。切除时先选保留的主体，再选刀具。');
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
  if(op==='logo'&&params.draftAngle===undefined)params.draftAngle=7;
  if(['faceHole','faceExtrude','logo','curvedLogo','thickenFace','faceBoundary'].includes(op)){
    if(params.faceId===undefined&&selectedTopology?.type==='face'&&selectedTopology.bodyId===refs[0]&&selectedTopology.ids.length===1){params.faceId=selectedTopology.ids[0];if(['faceHole','curvedLogo'].includes(op)&&params.point===undefined&&selectedTopology.point)params.point=[...selectedTopology.point];}
    if(!Number.isInteger(params.faceId))throw new Error(['curvedLogo','thickenFace'].includes(op)?'请先选择目标曲面。':'请先选择一个平面。 / Select one planar face first.');
  }
  if(['fillet','chamfer'].includes(op)&&params.allEdges!==true&&selectedTopology?.type==='edge'&&selectedTopology.bodyId===refs[0]&&selectedTopology.ids.length)params.edgeIds=[...selectedTopology.ids];
  if(['fillet','chamfer'].includes(op)&&params.allEdges===true)delete params.edgeIds;
  if(['fillet','chamfer'].includes(op)&&!params.edgeIds?.length&&params.allEdges!==true)throw new Error('请先选择边，或明确勾选处理全部边。 / Select edges or explicitly enable all edges.');
  if(op==='shell'){
    if(selectedTopology?.type==='face'&&selectedTopology.bodyId===refs[0])params.faceIds=[...selectedTopology.ids];
    if(!params.faceIds?.length)throw new Error('抽壳需要先切换到“选面”，点击要去掉的开口面，再设置壁厚。');
  }
  const next=clone(documentModel);const id=crypto.randomUUID();
  next.features.push({id,op,name:name||`${labels[op]||op} ${next.features.filter(f=>f.op===op).length+1}`,params,refs});
  if(next.appearance?.[refs[0]])next.appearance[id]=next.appearance[refs[0]];
  return {next,id};
}
async function addFeature(op,params={},options={}){
  const {next,id}=featureDocument(op,params,options.refs,options.name);
  const result=await rebuild(next,{...options,select:id,fit:!bodies.length||['vectorProfile','box','sphere','cylinder','cone','torus','extrude','revolve','copy','mirror','linearPattern','circularPattern','quickModel','sweep','loft'].includes(op)});
  const diagnostic=bodies.find(body=>body.id===id)?.surfaceDiagnostics;
  if(diagnostic)ui.showInfo('缝合检查',`${diagnostic.faces} 面，${diagnostic.solids} 实体。以 ${diagnostic.tolerance} mm 再检查：${diagnostic.freeEdges} 条自由边，${diagnostic.multipleEdges} 条非流形边。未自动补洞。`);
  return result;
}
async function editFeature(id,params,name,options={}){
  if(busy)return;
  const next=clone(documentModel),feature=next.features.find(f=>f.id===id);
  if(!feature)throw new Error('未找到可编辑的操作。');
  feature.params={...feature.params,...params};if(['fillet','chamfer'].includes(feature.op)){if(feature.params.allEdges===true)delete feature.params.edgeIds;else if(!feature.params.edgeIds?.length)throw new Error('请先选择边，或明确勾选处理全部边。');}if(name?.trim())feature.name=name.trim();
  await rebuild(next,{...options,select:id});
}
async function navigateHistory(direction,options={}){
  const source=direction==='undo'?undoStack:redoStack;if(!source.length||busy)return;
  const next=source[source.length-1],old=clone(documentModel);
  await rebuild(clone(next),{...options,record:false});source.pop();(direction==='undo'?redoStack:undoStack).push(old);refresh();
}
function checkTransaction(signal,expectedRevision){if(signal?.aborted)throw new Error('AI request cancelled');if(expectedRevision!==undefined&&expectedRevision!==revision)throw new Error(`Revision conflict: expected ${expectedRevision}, current ${revision}. Read state and retry.`);}
async function previewFeature(op,params){
  if(busy)throw new Error('Please wait for the current operation.');
  if(!Object.hasOwn(labels,op)||op==='import')throw new Error('Unsupported preview operation');
  const {next}=featureDocument(op,params),generation=++previewGeneration;previewComputing=true;setBusy(true,'预览 / Preview…');
  try{const result=await request('rebuild',{document:next});
    if(generation!==previewGeneration){await request('rebuild',{document:documentModel});previewNext=null;viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds,selectedTopology);return false;}
    previewNext=next;viewport.setBodies(result.bodies,next.hidden);viewport.setSelection([]);if(!bodies.length)viewport.fit();setStatus('预览未保存 · 应用或取消 / Preview: apply or cancel');return true;}
  catch(error){previewNext=null;await request('rebuild',{document:documentModel});viewport.setBodies(bodies,documentModel.hidden);throw error;}
  finally{previewComputing=false;setBusy(false);}
}
async function cancelPreview(){previewGeneration++;if(previewComputing||!previewNext)return;setBusy(true,'取消预览 / Cancel preview…');try{await request('rebuild',{document:documentModel});previewNext=null;viewport.setBodies(bodies,documentModel.hidden);viewport.setSelection(selectedIds,selectedTopology);}finally{setBusy(false);}}

function safeName(name){return (name||'WebCAD').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120);}
function download(data,name,mime='application/octet-stream'){
  const blob=data instanceof Blob?data:new Blob([data],{type:mime});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportData(format='step',ids){
  if(previewNext)throw new Error('请先应用或取消预览。 / Apply or cancel preview first.');
  if(!kernelReady)throw new Error('内核尚未就绪，请保存工程后刷新页面。');
  if(!bodies.length)throw new Error('当前工程没有可导出的实体。');
  if(busy)throw new Error('请等待当前计算完成。');setBusy(true,'正在生成导出文件…');
  try{return await request('export',{format,ids});}finally{setBusy(false);}
}
async function saveProject(){download(JSON.stringify(documentModel,null,2),safeName(documentModel.name)+'.webcad','application/json');dirty=false;setStatus('工程已另存为 .webcad，包含参数历史和导入源文件。');refresh();}
function chooseFile(){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.webcad,.json,.step,.stp,.brep,.brp,.iges,.igs,.stl';input.multiple=true;input.addEventListener('change',()=>resolve([...input.files]));input.addEventListener('cancel',()=>resolve([]));input.click();});}
function base64(array){let text='';for(let i=0;i<array.length;i+=0x8000)text+=String.fromCharCode(...array.subarray(i,i+0x8000));return btoa(text);}
function validateDocument(doc){
  if(!doc||doc.version!==1||!Array.isArray(doc.features)||typeof doc.imports!=='object'||!doc.imports)throw new Error('不是有效的 WebCAD 1.x 工程文件。');
  if(doc.features.length>2000)throw new Error('工程操作超过 2000 项，暂不适合此浏览器工作台。');
  const ids=new Set();for(const f of doc.features){if(!f.id||ids.has(f.id)||typeof f.op!=='string'||!f.params||!Array.isArray(f.refs))throw new Error('工程特征结构无效。');for(const ref of f.refs)if(!ids.has(ref))throw new Error('工程包含无效的操作引用。');ids.add(f.id);}
  return {version:1,name:String(doc.name||'导入工程'),features:doc.features,imports:doc.imports,hidden:Array.isArray(doc.hidden)?doc.hidden:[],appearance:doc.appearance&&typeof doc.appearance==='object'?doc.appearance:{}};
}
async function openFiles(files,{confirmReplace=true}={}){
  if(busy)return;
  for(const file of files){
    if(file.size>150*1024*1024)throw new Error('单文件超过 150 MB。请先拆分模型后再打开。');
    const ext=file.name.split('.').pop().toLowerCase();
    if(['webcad','json'].includes(ext)){
      const next=validateDocument(JSON.parse(await file.text()));
      if(confirmReplace&&dirty&&!confirm('打开工程将替换当前设计。尚未另存的设计可取消后先保存。继续打开？'))return;
      await rebuild(next,{fit:true});dirty=false;refresh();
    }else{
      if(ext==='stl')throw new Error('STL 是三角网格，精确建模请使用 STEP、BREP 或 IGS。');
      const isIges=['igs','iges'].includes(ext);
      const format=isIges?'step':['step','stp'].includes(ext)?'step':['brep','brp'].includes(ext)?'brep':null;
      if(!format)throw new Error('请选择 .webcad 工程、STEP/STP 或 BREP 文件。');
      const next=clone(documentModel),key=crypto.randomUUID(),id=crypto.randomUUID();
      if(isIges){
        setBusy(true,'IGS 正在本机转换，未上传外部服务…');
        try{next.imports[key]=await importIgesFile(file,base64);}finally{setBusy(false);}
      }else next.imports[key]={format,data:base64(new Uint8Array(await file.arrayBuffer()))};
      next.features.push({id,op:'import',name:file.name,params:{key},refs:[]});
      if(!next.features.slice(0,-1).length)next.name=file.name.replace(/\.[^.]+$/,'');
      await rebuild(next,{fit:true,select:id});
      if(isIges){const d=next.imports[key].source;ui.showInfo('IGS 导入诊断',`源文件 ${d.name}：${d.topology?.faces??'?'} 面，${d.topology?.shells??'?'} 壳，${d.topology?.solids??'?'} 实体。未自动修复；散面请尝试曲面缝合，开放壳不能直接当实体加工。`);}
    }
  }
}
async function performAction(action,params={}){
  params=params||{};
  if(action==='language'){viewport.updateLanguage();refresh();return;}
  if(action==='cancelPreview'){await cancelPreview();return;}
  if(action==='commitPreview'){if(!previewNext)throw new Error('No preview to apply');await rebuild(clone(previewNext),{select:previewNext.features.at(-1)?.id});return;}
  if(action==='preview')return previewFeature(params.op,params.params);
  if(action==='gizmo'){viewport.setGizmo(params.mode);refresh();return;}
  if(action==='snap'){viewport.snapEnabled=params.enabled??!viewport.snapEnabled;setStatus(viewport.snapEnabled?'几何吸附已启用 / Snap enabled':'吸附已关闭 / Snap disabled');refresh();return;}
  if(action==='section'){viewport.setSection(params);return;}
  if(action==='perPartMetal'){
    if(busy||previewNext)throw new Error('Please finish the current operation.');
    if(!selectedIds.length)throw new Error('请先选择实体 / Select a body first');
    viewport.setPartMetal(selectedIds,params.key);pushUndo();documentModel.appearance={...viewport.partFinishes};dirty=true;revision++;await autosave();refresh();return;
  }
  if(action==='metalFinish'){const label=viewport.setMetalFinish(params.key);setStatus(`材质预览：${label}`);refresh();return;}
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
  if(action==='explode'){
    if(selectedIds.length!==1)throw new Error('请先选择一个组合或多实体模型');
    const source=bodies.find(b=>b.id===selectedIds[0]);
    if(!source||source.solidCount<2)throw new Error('当前模型只有一个实体，不能按零件拆散；请使用分割或切除。');
    if(source.solidCount>500)throw new Error('一次最多拆散 500 个实体，请分批导入。');
    const next=clone(documentModel),ids=[];
    for(let i=0;i<source.solidCount;i++){
      const id=crypto.randomUUID();ids.push(id);
      next.features.push({id,op:'extractSolid',name:(source.name||'模型')+' / '+(i+1),params:{solidIndex:i,keepOriginal:i<source.solidCount-1},refs:[source.id]});
      if(next.appearance?.[source.id])next.appearance[id]=next.appearance[source.id];
    }
    await rebuild(next,{select:ids[0]});selectedIds=ids;viewport.setSelection(selectedIds);refresh();return;
  }
  if(action==='example'){

    if(!['mounting-bracket','buckle-frame','open-box'].includes(params.name))throw new Error('未知示例。');
    if(dirty&&!confirm('示例将替换当前设计。尚未另存时请先取消并保存。继续？'))return;
    setBusy(true,'正在读取示例工程…');let example;
    try{const response=await fetch(`${import.meta.env.BASE_URL}examples/${params.name}.webcad`);
      if(!response.ok)throw new Error('示例文件未找到，请重新构建项目。');
      example=validateDocument(await response.json());
    }finally{setBusy(false);}
    await rebuild(example,{fit:true});return;
  }
  if(action==='new'){
    if(dirty&&!confirm('当前设计尚未另存。确定新建设计？（可以取消后先保存）'))return;
    await rebuild(emptyDocument(),{fit:true});selectedIds=[];dirty=false;refresh();return;
  }
  if(action==='open'){await openFiles(await chooseFile());return;}
  if(action==='export'){
    if(params.selected&&!selectedIds.length)throw new Error('请先选择要导出的实体。');
    const result=await exportData(params.format||'step',params.selected?selectedIds:undefined);
    const extension=result.extension==='step'?'stp':result.extension;
    download(result.data,safeName(documentModel.name)+'.'+extension,result.mime);setStatus(`已导出 ${extension.toUpperCase()} 文件。`);return;
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
    if(['circle','rectangle','roundedRectangle','arc'].includes(params.preset)){await addFeature('extrude',{...params,profile:params.preset,plane:'XY'});return;}
    viewport.startSketch(params);return;
  }
  if(Object.hasOwn(labels,action)&&action!=='import'){await addFeature(action,params);return;}
  throw new Error('尚未识别的操作：'+action);
}

const dbPromise=new Promise(resolve=>{try{const req=indexedDB.open('webcad-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('documents');req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);}catch{resolve(null);}});
async function autosave(){const db=await dbPromise;if(!db)return;return new Promise(resolve=>{try{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put(clone(documentModel),'recovery');tx.oncomplete=resolve;tx.onerror=()=>{setStatus('自动恢复存储失败，请手动另存工程。');resolve();};}catch{resolve();}});}
async function readRecovery(){const db=await dbPromise;if(!db)return null;return new Promise(resolve=>{const req=db.transaction('documents').objectStore('documents').get('recovery');req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);});}
function offerRecovery(recovery){
  const banner=document.createElement('div');banner.style.cssText='position:absolute;bottom:50px;left:50%;transform:translateX(-50%);padding:12px 16px;background:#fff;border:1px solid #a6cfc7;border-radius:8px;box-shadow:0 4px 20px #0002;z-index:30;font-size:12px;color:#253d46';
  const text=document.createElement('span');text.textContent=`找到本机自动保存的“${recovery.name}” `;banner.append(text);
  const recover=document.createElement('button');recover.textContent='恢复设计';recover.onclick=async()=>{banner.remove();try{await rebuild(validateDocument(recovery),{fit:true});}catch(e){reportError(e);}};
  const dismiss=document.createElement('button');dismiss.textContent='忽略';dismiss.onclick=()=>banner.remove();banner.append(recover,dismiss);document.getElementById('viewport').append(banner);
}

document.addEventListener('keydown',event=>{
  const typing=event.target.closest('input,textarea,select,[contenteditable=true]');
  if(event.key==='Escape'){viewport.cancelTask();if(previewNext||previewComputing)cancelPreview().catch(reportError);if(!typing)selectBody(null);return;}
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
  try{const recovery=await readRecovery();await request('ready');kernelReady=true;await rebuild(emptyDocument(),{record:false,save:false});dirty=false;refresh();if(recovery?.features?.length)offerRecovery(recovery);setStatus('就绪 · 在工具栏创建实体，或打开 STEP / WebCAD 工程。');return true;}
  catch(error){reportError(error);return false;}
})();
// Public automation surface also used by reproducible acceptance checks; never runs arbitrary code.
function getState(){return {revision,document:clone(documentModel),bodies:bodies.map(({id,name,bounds,volume,solidCount,faceGroups,edges})=>({id,name,bounds,volume,solidCount,faceCount:faceGroups.length,edgeCount:edges.length})),selectedIds:[...selectedIds],selectedTopology:clone(selectedTopology),busy,kernelReady,dirty,preview:!!previewNext};}
function aiState(){return {revision,documentName:documentModel.name,features:clone(documentModel.features),hidden:[...documentModel.hidden],appearance:clone(documentModel.appearance||{}),bodies:bodies.map(({id,name,bounds,volume,solidCount,faceGroups,edges})=>({id,name,bounds,volume,solidCount,faceCount:faceGroups.length,edgeCount:edges.length})),selectedIds:[...selectedIds],selectedTopology:clone(selectedTopology),busy,kernelReady,preview:!!previewNext};}
async function executeAI(command,args={},options={}){
  await ready;if(!kernelReady)throw new Error('CAD kernel unavailable');checkTransaction(options.signal,options.expectedRevision);
  if(command==='get_state')return aiState();
  if(command==='get_templates')return QUICK_MODELS;
  if(busy||previewNext)throw new Error('Finish current operation or preview before AI editing.');
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
    await addFeature(args.op,args.params||{},{...options,refs:args.refs??[],name:args.name});
  }else if(command==='apply_template'){
    const template=QUICK_MODELS[args.templateId];if(!template)throw new Error('Unknown template');
    await addFeature('quickModel',{...template.defaults,...args.params,kind:args.templateId},options);
  }else if(command==='edit_feature')await editFeature(args.featureId,args.params||{},args.name,options);
  else if(command==='remove')await addFeature('remove',{},{...options,refs:args.ids});
  else if(command==='undo'||command==='redo')await navigateHistory(command,options);
  else if(command==='refresh')await rebuild(clone(documentModel),{...options,record:false});
  else if(command==='export'){
    const result=await exportData(args.format||'step',args.ids);checkTransaction(options.signal,options.expectedRevision);
    return {revision,extension:result.extension,mime:result.mime,encoding:'base64',data:base64(typeof result.data==='string'?new TextEncoder().encode(result.data):new Uint8Array(result.data))};
  }else throw new Error('Unknown AI command');
  return aiState();
}
window.webcad={ready,getState,execute:executeAI,action:performAction,select:selectBody,pick,editFeature,openFiles,exportData,loadDocument:doc=>rebuild(validateDocument(clone(doc)),{fit:true}),viewport};
const aiConnection=connectAI({getState:aiState,execute:executeAI},{onStatus:value=>{aiStatus=value;refresh();}});
window.addEventListener('pagehide',()=>aiConnection?.disconnect?.());

