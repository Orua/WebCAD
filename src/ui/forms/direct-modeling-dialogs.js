import {directModelingNames} from '../../modeling/manufacturing/direct-modeling-contracts.js';

const axes=['X','Y','Z'];
const sourceStamp=body=>JSON.stringify([body.id,body.geometryFingerprint||body.renderVersion||null,body.faceCount,body.solidCount]);

/** Numeric task form with explicit source/face scope, shared preview and apply. */
export function showDirectModelingDialog(op,env={}){
  if(!directModelingNames[op])throw new Error('不支持的直接建模工具');
  const {state,openDialog,element,button,addField,readParams,bindParameterForm,setTaskTargetRefresh}=env;
  const initialSelection={ids:[...(state.selectedIds||[])],topology:state.selectedTopology?structuredClone(state.selectedTopology):null};
  const dialog=openDialog(directModelingNames[op],'本次来源与选面已锁定；查看其它零件不会改变目标。预览后确认应用。',{returnToSelect:true});
  dialog.dataset.commandId=op;
  const form=element('form',{class:'parameter-form'}),status=element('p',{class:'task-target wide','aria-live':'polite','data-ready':'false'}),notice=element('p',{class:'property-footnote wide'});
  dialog.append(status);
  let locked=null,selectionIssue='',pointEdited=false,axisSelect,customHost,previousStamp;
  const specs=[],fields=new Map();
  const numberField=(host,spec)=>{specs.push(spec);const input=addField(host,spec);fields.set(spec[0],input);return input;};
  const choice=(host,name,label,values,initial)=>{
    const wrap=element('label',{class:'form-field wide','data-field':name}),select=element('select',{name,'aria-label':label});
    wrap.append(element('span',{},label),select);for(const [value,text] of values)select.append(element('option',{value},text));select.value=initial;host.append(wrap);return select;
  };
  const currentBody=()=>state.bodies?.find(body=>body.id===locked?.id);
  const minimum=body=>{const candidate=body?.bounds?.min||body?.bounds?.[0];return Array.isArray(candidate)&&candidate.length===3&&candidate.every(Number.isFinite)?candidate:null;};
  const capture=selection=>{
    const ids=selection.ids,topology=selection.topology;
    if(ids.length!==1)throw new Error('请先选择一个明确的来源对象，再点击“重新选择”');
    const body=state.bodies?.find(candidate=>candidate.id===ids[0]);
    if(!body)throw new Error('来源对象已失效，请重新选择');
    if(op!=='offsetSurface'&&body.solidCount!==1)throw new Error('此工具需要一个封闭实体；请先提取所需单实体');
    let faceIds=[];
    if(op!=='offsetSolid'){
      if(topology?.type!=='face'||topology.bodyId!==body.id||!Array.isArray(topology.ids)||!topology.ids.length)throw new Error('请在来源对象上选中所需面，再点击“重新选择”');
      faceIds=[...topology.ids];
      if(new Set(faceIds).size!==faceIds.length||faceIds.some(id=>!Number.isInteger(id)||id<0||id>=body.faceCount))throw new Error('选面已失效，请在当前对象上重新选择');
      if(op==='offsetSurface'&&faceIds.length!==1)throw new Error('偏置面需要恰好选中一张面');
      if(faceIds.length>200)throw new Error('本次最多选择 200 张拔模面');
    }
    locked={id:body.id,faceIds,stamp:sourceStamp(body)};selectionIssue='';return body;
  };
  try{capture(initialSelection);}catch(error){selectionIssue=error.message;}

  if(op==='draftByPlane'){
    const defaults=minimum(currentBody());
    form.append(element('p',{class:'property-footnote wide'},'中性平面点默认取来源包围盒的最小世界坐标，可修改为所需固定平面上的点。平面法线随拉出方向设置。'));
    for(const [index,axis] of axes.entries())numberField(form,[`neutralPoint${axis}`,`中性平面点 ${axis}（世界 mm）`,defaults?defaults[index]:'']);
    axisSelect=choice(form,'pullAxis','拉出方向',[['X','X 轴'],['Y','Y 轴'],['Z','Z 轴'],['custom','自定义方向']],'Z');
    customHost=element('div',{class:'parameter-form wide','data-custom-direction':'true'});
    for(const [index,axis] of axes.entries())numberField(customHost,[`pullDirection${axis}`,`方向 ${axis}`,index===2?1:0]);
    form.append(customHost);numberField(form,['angleDeg','拔模角度 °（正向或负向）',2]);
    notice.textContent='直壁正角减料，负角加料。已有圆锥面使用目标锥角，不是在原角上累加；请核对预览和体积。相切联动面须一同选中。';
  }else{
    numberField(form,['distanceMm','偏置距离 mm（正向或负向）',1]);
    if(op==='offsetSolid')choice(form,'join','边角连接',[['intersection','保持交角'],['round','圆角连接']],'intersection');
    notice.textContent=op==='offsetSolid'?'正值向外，负值向内；替换来源实体。等距偏置，不改变为按比例缩放。':'沿选中面的有向法线偏置；正负控制方向。生成一张独立面，保留整个来源，不产生厚度。';
  }
  form.append(notice);

  const references=()=>{
    if(!locked)throw new Error(selectionIssue||'请重新选择来源');
    const body=currentBody();if(!body)throw new Error('锁定的来源已消失；请选中当前来源并点击“重新选择”');
    if(sourceStamp(body)!==locked.stamp)throw new Error('锁定来源的几何已变化；请检查当前面并点击“重新选择”');
    return [locked.id];
  };
  const numericFromDOM=()=>{
    const values={};for(const [name,input] of fields){if(input.disabled)continue;const value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value))throw new Error('请填写所有需要的有效数字');values[name]=value;}return values;
  };
  const pack=values=>{
    if(op!=='draftByPlane'){
      if(!Number.isFinite(values.distanceMm)||values.distanceMm===0)throw new Error('偏置距离须为非零有效数字');
      return op==='offsetSolid'?{distanceMm:values.distanceMm,join:form.elements.namedItem('join').value}:{faceId:locked.faceIds[0],distanceMm:values.distanceMm};
    }
    const neutralPoint=axes.map(axis=>values[`neutralPoint${axis}`]),pullDirection=axisSelect.value==='custom'?axes.map(axis=>values[`pullDirection${axis}`]):axes.map(axis=>Number(axis===axisSelect.value));
    if(neutralPoint.some(value=>!Number.isFinite(value))||pullDirection.some(value=>!Number.isFinite(value)))throw new Error('中性平面点和拉出方向须为有效数字');
    const length=Math.hypot(...pullDirection);if(!Number.isFinite(length)||length<=1e-12)throw new Error('自定义拉出方向不能为零向量');
    if(!Number.isFinite(values.angleDeg)||values.angleDeg===0||Math.abs(values.angleDeg)>=45)throw new Error('拔模角度须非零，且绝对值小于 45°');
    return {faceIds:[...locked.faceIds],neutralPoint,neutralNormal:[...pullDirection],pullDirection,angleDeg:values.angleDeg};
  };
  const read=()=>{const refs=references();return {...pack(readParams(form,specs)),_targetRefs:refs};};
  const updateValidity=()=>{
    if(customHost){customHost.hidden=axisSelect.value!=='custom';for(const input of customHost.querySelectorAll('input'))input.disabled=customHost.hidden;}
    let issue='';try{references();pack(numericFromDOM());}catch(error){issue=error.message;}
    if(!issue&&state.busy)issue='正在计算，请稍候';
    status.dataset.ready=String(!issue);status.textContent=issue||`已锁定：${currentBody()?.name||locked.id}${op==='offsetSolid'?'':` · ${locked.faceIds.length} 张选定面`}`;
    for(const control of form.querySelectorAll('button[type="submit"],button[data-preview]'))control.disabled=!!issue;
  };
  const changed=()=>{updateValidity();form.dispatchEvent(new Event('input',{bubbles:true}));};
  const reselect=button('重新选择',()=>{
    try{
      const body=capture({ids:[...(state.selectedIds||[])],topology:state.selectedTopology?structuredClone(state.selectedTopology):null});
      if(op==='draftByPlane'&&!pointEdited){const defaults=minimum(body);for(const [index,axis] of axes.entries())fields.get(`neutralPoint${axis}`).value=defaults?String(defaults[index]):'';}
    }catch(error){selectionIssue=error.message;locked=null;}
    previousStamp=undefined;changed();
  },'secondary');reselect.type='button';form.prepend(reselect);
  form.addEventListener('change',changed);
  form.addEventListener('input',event=>{if(event.target?.name?.startsWith('neutralPoint'))pointEdited=true;updateValidity();});
  const refresh=()=>{
    const body=currentBody(),stamp=JSON.stringify([locked?.id,body?sourceStamp(body):'missing',!!state.busy]);updateValidity();
    if(previousStamp!==undefined&&stamp!==previousStamp)form.dispatchEvent(new Event('input',{bubbles:true}));previousStamp=stamp;
  };
  bindParameterForm(form,op,read);dialog.append(form);setTaskTargetRefresh(refresh);refresh();
  fields.values().next().value?.focus();
  return {dialog,form,read,refresh};
}
