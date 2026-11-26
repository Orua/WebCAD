import {freeformNames} from '../../modeling/freeform/freeform-contracts.js';

const descriptions={
  spatialSpline:'按顺序输入 XYZ 或点选顶点，生成可供其他工具引用的样条。',
  networkSurface:'分别按横向位置选择两组相交的边，每组至少两条。',
  projectCurveOnFace:'选目标面和来源边，按指定方向投影，或沿交线分面。',
  surfaceBridge:'分别选两条开放边及各自的邻面，设置端点对应和接续方式。',
  replaceSurfacePatch:'选原实体上的待换面，再选独立的新曲面。确认原剪裁边界后缝回实体。',
};

function xyz(text) {
  const parts=text.trim().split(/\s*[,，]\s*|\s+/), values=parts.map(Number);
  if(parts.length!==3||parts.some(part=>!part)||values.some(value=>!Number.isFinite(value))) {
    throw new Error('请填写三个有效 XYZ 数值。');
  }
  return values;
}

export function freeformPreviewSummary(report) {
  if('uDeviationMm' in report)return `曲面已生成，纵边偏差 ${report.uDeviationMm.toFixed(4)} mm，横边偏差 ${report.vDeviationMm.toFixed(4)} mm。`;
  if('maxNormalAngleDeg' in report)return `过渡面已生成，接缝法向夹角最大 ${report.maxNormalAngleDeg.toFixed(3)}°。`;
  if('removedFaceCount' in report)return `已缝回实体，保留 ${report.retainedFaceCount} 张原有面，边界偏差 ${report.boundaryDeviationMm.toFixed(4)} mm。`;
  if(report.output==='faces')return `已分成 ${report.faceCount} 张精确面。`;
  if(report.output==='curves')return `已投影 ${report.edgeCount} 条精确边。`;
  return `已生成空间样条，采样点偏差 ${report.deviationMm.toFixed(4)} mm。`;
}

export function showFreeformDialog(action,{getState,openDialog,element,button,emit,bindParameterForm,setVertexPicking}) {
  const d=openDialog(freeformNames[action],descriptions[action],{returnToSelect:true});
  d.dataset.commandId=action;
  const form=element('form',{class:'parameter-form','data-skip-calculator':'true'});
  const target=element('p',{class:'task-target wide','aria-live':'polite'});
  form.append(target);
  const atStart=getState();
  let revision=atStart.revision, documentId=atStart.document?.documentId, active=null;
  const groups=new Map(), history=[];
  const current=()=>getState().revision===revision&&getState().document?.documentId===documentId;
  const refs=[];
  const input=(name,type,value,attributes={})=>element('input',{name,type,value,...attributes});
  const select=(name, options)=>{
    const control=element('select',{name});
    for(const [value,caption] of options)control.append(element('option',{value},caption));
    return control;
  };
  function field(title,control,wide=false){
    const row=element('label',{class:'form-field'+(wide?' wide':'')});
    row.append(element('span',{},title),control);form.append(row);return control;
  }
  function controls(...buttons){
    const row=element('div',{class:'dialog-footer wide'});
    row.append(...buttons);form.append(row);
  }
  function stop(){active=null;setVertexPicking(false);}
  function activate(group) {
    active=group;setVertexPicking(group.type==='vertex');
    if(group.type!=='vertex')void emit('selectMode',{mode:group.type});
    refresh();
  }
  function picks(key,label,type,min,max,singleBody=false){
    const group={label,type,min,max,singleBody,items:[]};
    groups.set(key,group);
    return button(label,()=>activate(group),'secondary');
  }
  const rows=text=>text.split(/\n|;|；/).filter(row=>row.trim());
  let typed,closed,method,read;
  function pack(item) {
    const {id,...locator}=item;
    if(!refs.includes(id))refs.push(id);
    return {refIndex:refs.indexOf(id),...locator};
  }
  const packed=key=>groups.get(key).items.map(pack);
  const tolerance=()=>field('位置公差（mm）',input('toleranceMm','number','.01',{min:.001,max:.05,step:'any',required:''}));
  if(action==='spatialSpline'){
    typed=field('XYZ（mm），每行一点',element('textarea',{name:'points',rows:4,placeholder:'0, 0, 0'}),true);
    controls(picks('vertices','点选顶点','vertex',0,64));
    closed=field('曲线形态',select('closed',[['open','开放'],['closed','闭合']]));
    method=field('生成方式',select('method',[['interpolate','过点插值'],['fit','按公差拟合']]));
    const tol=tolerance();
    closed.addEventListener('change',()=>{
      const fit=method.querySelector('[value="fit"]');fit.disabled=closed.value==='closed';
      if(fit.disabled)method.value='interpolate';
      changed();
    });
    read=()=>({points:[...rows(typed.value).map(xyz),...packed('vertices')],closed:closed.value==='closed',
      method:method.value,toleranceMm:Number(tol.value)});
  }
  if(action==='networkSurface'){
    controls(picks('u','选纵向边','edge',2,6),picks('v','选横向边','edge',2,6));
    const tol=tolerance();
    read=()=>({uEdges:packed('u'),vEdges:packed('v'),toleranceMm:Number(tol.value)});
  }
  if(action==='projectCurveOnFace'){
    controls(picks('surface','选目标面','face',1,1),picks('curves','选来源边','edge',1,8));
    const direction=field('投影方向 XYZ',input('direction','text','0, 0, -1',{required:''}));
    const reach=field('投影范围',select('reach',[['both','双向'],['forward','正向']]));
    const output=field('结果',select('output',[['curves','曲线'],['faces','分面']]));
    read=()=>({target:packed('surface')[0],curves:packed('curves'),direction:xyz(direction.value),reach:reach.value,output:output.value});
  }
  const continuity=(name,label)=>field(label,select(name,[['G1','G1 相切'],['G2','G2 曲率'],['G0','G0 贴边']]));
  if(action==='surfaceBridge'){
    controls(picks('edgeA','选第一条边','edge',1,1),picks('faceA','选第一侧邻面','face',1,1));
    const continuityA=continuity('continuityA','第一侧接续');
    controls(picks('edgeB','选第二条边','edge',1,1),picks('faceB','选第二侧邻面','face',1,1));
    const continuityB=continuity('continuityB','第二侧接续');
    const pairing=field('端点对应',select('pairing',[['direct','同向'],['reverse','反向']]));
    const tension=field('接入张力',input('tension','number','.6',{min:.25,max:1.5,step:'any',required:''}));
    const tol=tolerance();
    function seam(side,condition){
      const edgeItem=groups.get('edge'+side).items[0], faceItem=groups.get('face'+side).items[0];
      if(edgeItem.id!==faceItem.id)throw new Error('一侧的边和邻面须选自同一对象。');
      return {...pack(edgeItem),faceId:faceItem.faceId,continuity:condition.value};
    }
    read=()=>({a:seam('A',continuityA),b:seam('B',continuityB),pairing:pairing.value,
      tension:Number(tension.value),toleranceMm:Number(tol.value)});
  }
  if(action==='replaceSurfacePatch'){
    controls(picks('old','选待换的原面','face',1,12,true),picks('new','选独立替换面','face',1,12));
    const tol=tolerance();
    read=()=>{
      const old=groups.get('old').items;
      refs.push(old[0].id);
      return {removeFaceIds:old.map(item=>item.faceId),patches:packed('new'),toleranceMm:Number(tol.value)};
    };
  }

  const undo=button('撤回选择',()=>{history.pop()?.();changed();},'secondary');
  const reset=button('清除选取',()=>{
    for(const group of groups.values())group.items=[];
    history.length=0;revision=getState().revision;documentId=getState().document?.documentId;
    stop();changed();
  },'secondary');
  controls(undo,reset);
  function refresh(message){
    const isCurrent=current(), all=[...groups.values()];
    let ready=isCurrent&&all.every(group=>group.items.length>=group.min);
    if(typed){
      const typedCount=rows(typed.value).length+groups.get('vertices').items.length;
      ready&&=typedCount>=(closed.value==='closed'?3:2)&&typedCount<=64;
    }
    const counts=all.map(group=>`${group.label} ${group.items.length}`);
    target.textContent=message??(!isCurrent?'工程已变化，请清除并重新选取。':
      [...counts,...(active?[`正在${active.label}`]:[])].join(' · '));
    target.dataset.ready=String(ready);
    undo.disabled=!history.length;
    if(!getState().busy)for(const control of form.querySelectorAll('button[type="submit"],button[data-preview]'))control.disabled=!ready;
  }
  function changed(){form.dispatchEvent(new Event('input',{bubbles:true}));}
  form.addEventListener('input',()=>refresh());
  d._freeformPick=hit=>{
    if(!active)return false;
    if(!current()){refresh();return 'ignored';}
    const body=getState().bodies.find(body=>body.id===hit?.id&&body.geometryType!=='mesh'&&body.geometryType!=='rawMesh');
    if(!body||hit.type!==active.type||!Number.isInteger(hit.topologyId))return 'ignored';
    const group=active, previous=group.items, id=hit.id;
    const item=hit.type==='face'?{id,faceId:hit.topologyId}:hit.type==='vertex'?
      {id,edgeId:hit.topologyId,nearMm:[...hit.point]}:{id,edgeId:hit.topologyId};
    if(group.singleBody&&previous.length&&previous[0].id!==id){refresh('待换的面须属于同一个实体。');return 'ignored';}
    if(previous.some(p=>JSON.stringify(p)===JSON.stringify(item)))return 'ignored';
    if(group.max>1&&previous.length>=group.max){refresh(`最多选取 ${group.max} 项。`);return 'ignored';}
    group.items=group.max===1?[item]:[...previous,item];
    history.push(()=>{group.items=previous;});
    if(group.max===1)stop();
    changed();return true;
  };
  d._onClose=stop;
  bindParameterForm(form,action,()=>{
    if(!current())throw new Error('工程已变化，请重新选择约束。');
    refs.length=0;const params=read();
    return {...params,_targetRefs:[...refs]};
  });
  d.append(form);refresh();
}
