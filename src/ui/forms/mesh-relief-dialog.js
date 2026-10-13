export function showMeshReliefDialog({getState,openDialog,element,button,emit,close}){
 const state=getState(),target=state.selectedIds[0],body=state.bodies.find(b=>b.id===target);
 const d=openDialog('网格局部修高','用毫米坐标指定正面和修改范围。背面、保护区和范围外保持原样。',{returnToSelect:true});
 if(state.selectedIds.length!==1||body?.geometryType!=='rawMesh'){d.append(element('p',{},'请先选择一个已导入的网格对象。'));return;}
 d.dataset.previewCapable='true';let busy=false,ready=false,live=true;
 const form=element('div',{class:'parameter-form'}),status=element('p',{'aria-live':'polite'},'填写表面点和支撑平面，再预览修改。');
 const input=(label,value,type='text')=>{const el=element('input',{type,value,'aria-label':label,...(type==='number'?{step:'any'}:{})}),row=element('label',{class:'form-field wide'});row.append(element('span',{},label),el);form.append(row);return el;};
 const seed=input('正面上的点 X,Y,Z（mm）',''),origin=input('基面原点 X,Y,Z（mm）','0,0,0'),normal=input('基面法向 X,Y,Z','0,0,1'),axis=input('基面横向 X,Y,Z','1,0,0');
 const center=input('修改中心 U,V（mm）',''),radius=input('核心半径（mm）','2','number'),transition=input('过渡宽度（mm）','1','number'),protection=input('保护圆：U,V,半径；多项用分号隔开','');
 const mode=element('select',{'aria-label':'修改方式'});for(const [value,label]of [['scaleHeight','按基面缩放局部高度'],['offset','沿法向增减高度'],['flatten','设为指定基面高度'],['replace','用指定高度网格替换局部'],['profile','按路径和截面重建局部'],['deformation','局部移动、收窄或旋转'],['layers','按顺序叠加宏形、细节和保护层']])mode.append(element('option',{value},label));form.append(mode);
 const value=input('比例或高度（mm）','.8','number'),thickness=input('最小剩余厚度（mm）','1','number');
 const fieldOrigin=input('目标网格左下角 U,V（mm）',''),fieldSize=input('目标网格宽、高（mm）','');
 const fieldValues=element('textarea',{'aria-label':'目标高度网格（mm）',rows:'4',placeholder:'每行用逗号分隔高度；行从下向上排列'});form.append(fieldValues);
 const path=input('路径：每段四个 U,V 点用分号隔开；多段用竖线隔开','');
 const sections=input('截面：位置比例:横向,高度;横向,高度…；多截面用竖线隔开','');
 const taper=input('起点、终点收尖长度（mm）','1,1'),baseHeight=input('路径外基面高度（mm）','0','number'),curveTolerance=input('路径弦偏差上限（mm）','.005','number'),sourceSpacing=input('源网格允许间距（mm）','.1','number');
 const pivot=input('局部变换中心 U,V（mm）',''),translation=input('局部移动 U,V（mm）','0,0'),scale=input('局部宽度比例 U,V','1,1'),rotation=input('局部旋转角度（度）','0','number');
 const sourceRegion=input('原局部区域：U,V,半径（mm）','');
 const targets=input('可选验收点：U,V,目标高度,容差（mm）；多项用分号隔开','');
 const layers=input('每层：名称,加/减/定高/冻结,宏形/细节,U,V,核心半径,过渡,高度；分号分层','');
 const syncMode=()=>{const replace=mode.value==='replace',profile=mode.value==='profile',deform=mode.value==='deformation',stack=mode.value==='layers';value.closest('label').hidden=replace||profile||deform||stack;fieldOrigin.closest('label').hidden=!replace;fieldSize.closest('label').hidden=!replace;fieldValues.hidden=!replace;for(const el of [path,sections,taper,curveTolerance])el.closest('label').hidden=!profile;for(const el of [pivot,translation,scale,rotation,sourceRegion])el.closest('label').hidden=!deform;for(const el of [sourceSpacing,baseHeight])el.closest('label').hidden=!profile&&!deform;layers.closest('label').hidden=!stack;};mode.addEventListener('change',syncMode);syncMode();
 const vector=(el,count)=>{const v=el.value.trim().split(/[,，\s]+/).map(Number);if(!el.value.trim()||v.length!==count||!v.every(Number.isFinite))throw new Error('请填写完整、有效的坐标。');return v;};
 const number=el=>{if(!el.value.trim()||!Number.isFinite(Number(el.value)))throw new Error('请填写有效数值。');return Number(el.value);};
 const readTarget=()=>{
  if(mode.value==='layers')return {layers:layers.value.split(';').map(line=>{const c=line.split(/[,，]/).map(s=>s.trim());if(c.length!==8||!c[0])throw Error('每层请按提示填写8项，以分号分层。');const v=c.slice(3).map(value=>number({value})),enabled=!c[1].startsWith('停用:'),operation=c[1].replace(/^停用:/,'');if(operation==='冻结'){if(v[3]!==0||v[4]!==0)throw Error('冻结层过渡和高度应填0。');return {id:c[0],enabled,kind:'freeze',regions:[{centerMm:v.slice(0,2),radiusMm:v[2]}]};}const blend={'加':'add','减':'remove','定高':'replace'}[operation],role={'宏形':'macro','细节':'detail'}[c[2]];if(!blend||!role)throw Error('请使用加、减、定高、冻结和宏形、细节。');return {id:c[0],enabled,kind:'surface',role,attachment:blend==='replace'?'absolute':'followHeight',blend,region:{centerMm:v.slice(0,2),coreRadiusMm:v[2],transitionMm:v[3]},heightMm:v[4]};})};
  if(mode.value==='deformation'){const source=vector(sourceRegion,3);return {deformation:{pivotMm:vector(pivot,2),translationMm:vector(translation,2),scale:vector(scale,2),angleDeg:number(rotation),sourceRegion:{centerMm:source.slice(0,2),radiusMm:source[2]},baseHeightMm:number(baseHeight),maxSourceSpacingMm:number(sourceSpacing)}};}
  if(mode.value==='profile')return {profile:{segments:path.value.split('|').map(line=>line.split(';').map(v=>vector({value:v},2))),stations:sections.value.split('|').map(line=>{const parts=line.split(':');if(parts.length!==2)throw Error('每个截面请填写位置比例:横向,高度;…');return {at:number({value:parts[0]}),sectionMm:parts[1].split(';').map(v=>vector({value:v},2))};}),endTaperMm:vector(taper,2),baseHeightMm:number(baseHeight),curveToleranceMm:number(curveTolerance),maxSourceSpacingMm:number(sourceSpacing)}};
  if(mode.value==='replace')return {field:{originMm:vector(fieldOrigin,2),sizeMm:vector(fieldSize,2),heightsMm:fieldValues.value.trim().split(/\r?\n/).map(row=>row.trim().split(/[,，\s]+/).map(v=>{if(!v||!Number.isFinite(Number(v)))throw new Error('目标高度须为有效毫米值。');return Number(v);}))}};
  return {value:number(value)};
 };
 const read=()=>({version:1,units:'mm',topologyEpoch:0,inputGeometryHash:body.meshReport.geometryHash,support:{originMm:vector(origin,3),normal:vector(normal,3),xAxis:vector(axis,3)},seedMm:vector(seed,3),region:{centerMm:vector(center,2),coreRadiusMm:number(radius),transitionMm:number(transition)},protectedRegions:protection.value.trim()?protection.value.split(';').map(text=>{const v=vector({value:text},3);return {centerMm:v.slice(0,2),radiusMm:v[2]};}):[],mode:['profile','deformation'].includes(mode.value)?'replace':mode.value,...readTarget(),...(targets.value.trim()?{targets:targets.value.split(';').map(text=>{const v=vector({value:text},4);return {pointMm:v.slice(0,2),heightMm:v[2],toleranceMm:v[3]};})}:{}),minThicknessMm:number(thickness)});
 const apply=button('应用修改',async()=>{if(!ready||busy)return;setBusy(true);try{if(await emit('commitPreview',{})===true){ready=false;close();}else status.textContent='应用未完成，请重新预览。';}finally{setBusy(false);}},'primary');
 const preview=button('预览修改',async()=>{if(busy)return;ready=false;setBusy(true);try{const params=read();await emit('cancelPreview',{});const result=await emit('preview',{op:'meshReliefEdit',params:{...params,_targetRefs:[target]}});ready=!!result;status.textContent=ready?'预览已通过当前范围检查，请核对变化和保护区域。':'预览未通过，当前模型保留。';}catch(e){status.textContent=e.message;}finally{setBusy(false);}},'secondary');
 function setBusy(v){busy=v;if(!live)return;form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=v);preview.disabled=v;apply.disabled=v||!ready;}
 form.addEventListener('input',()=>{ready=false;apply.disabled=true;emit('cancelPreview',{});status.textContent='参数已改变，请重新预览。';});
 d._onClose=()=>{live=false;if(ready)emit('cancelPreview',{});};
 const foot=element('div',{class:'dialog-footer'});foot.append(button('取消',()=>{emit('cancelPreview',{});close();},'secondary'),preview,apply);d.append(form,status,element('p',{class:'property-footnote'},'适用闭合、单值的平面浅浮雕。当前按面片重叠范围和受影响顶点检查厚度与碰撞，复杂悬垂不在支持范围。结果仍为可继续修改的网格。'),foot);apply.disabled=true;
}
