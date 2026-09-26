import {resolveProfileRecipe} from '../../modeling/profiles/profile-constraint-history.js';
import {expandProfilePrimitives} from '../../modeling/profiles/profile-primitives.js';

const types=[['length','线长'],['horizontal','水平'],['vertical','垂直'],['coincident','点重合'],['parallel','平行'],['perpendicular','垂直关系'],['equalLength','等长'],['distance','点间尺寸'],['radius','圆半径'],['diameter','圆直径'],['equalRadius','等半径'],['angle','两线夹角'],['tangent','线圆相切'],['fixPoint','固定点'],['fixEntity','固定图元']];
const labels=Object.fromEntries(types);
export function showProfileConstraintsDialog(env) {
 const {state,openDialog,element,button,addField,bindParameterForm,setTaskTargetRefresh}=env;
 const dialog=openDialog('约束尺寸','选择已画轮廓，指定几何关系或尺寸。原轮廓保留；结果是可继续加工的派生轮廓。所有尺寸位于来源的二维平面。',{returnToSelect:true});dialog.dataset.commandId='profileConstraints';
 const form=element('form',{class:'parameter-form'}),status=element('p',{class:'task-target wide','aria-live':'polite'}),host=element('div',{class:'wide parameter-form'}),list=element('div',{class:'wide'}),notice=element('p',{class:'property-footnote wide'});
 const queue=[];let controls={},entities=[],sourceRecipe=null,sourceStamp='',sourceVersion='',dirtySource=false;
 const recipeStamp=id=>{const chain=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);const feature=state.document.features.find(item=>item.id===id);if(!feature)break;chain.push([feature.id,feature.op,feature.params,feature.refs,feature.placement]);id=feature.op==='profileConstraints'?feature.refs?.[0]:null;}return JSON.stringify(chain);};
 const choice=(parent,name,label,options,value='')=>{const wrap=element('label',{class:'form-field','data-field':name}),select=element('select',{name,'aria-label':label});wrap.append(element('span',{},label),select);for(const [id,text]of options)select.append(element('option',{value:id},text));select.value=value||options[0]?.[0]||'';parent.append(wrap);return select;};
 const sources=()=>state.bodies.filter(body=>body.solidCount===0&&['sketchProfile','profileConstraints'].includes(state.document.features.find(feature=>feature.id===body.id)?.op));
 const source=choice(form,'sourceId','来源轮廓',[['','请选择'],...sources().map(body=>[body.id,body.name||body.id])],state.selectedIds.find(id=>sources().some(body=>body.id===id))||'');
 const type=choice(form,'constraintType','关系或驱动尺寸',types,'length');
 const entityOptions=filter=>entities.filter(filter).map(entity=>[entity.id,entity.type==='line'?`${entity.id} · 直线 ${Math.hypot(entity.endMm[0]-entity.startMm[0],entity.endMm[1]-entity.startMm[1]).toFixed(2)} mm`:`${entity.id} · 圆 Ø${entity.diameterMm.toFixed(2)}`]);
 const pointsFor=id=>entities.find(entity=>entity.id===id)?.type==='circle'?[['center','圆心']]:[['start','起点'],['end','终点']];
 const numerical=(name,label,value,kind)=>{const input=addField(host,[name,label,value,kind]);controls[name]=input;return input;};
 const selectedEntity=(name,label,filter=()=>true)=>{controls[name]=choice(host,name,label,entityOptions(filter));return controls[name];};
 const pointChoice=(name,label,entity)=>{controls[name]=choice(host,name,label,pointsFor(entity.value));entity.addEventListener('change',()=>{const old=controls[name].value;controls[name].replaceChildren(...pointsFor(entity.value).map(([value,text])=>element('option',{value},text)));controls[name].value=pointsFor(entity.value).some(([value])=>value===old)?old:pointsFor(entity.value)[0][0];});return controls[name];};
 const line=entity=>entity.type==='line',circle=entity=>entity.type==='circle';
 const render=()=>{
  host.replaceChildren();controls={};const current=type.value;
  if(['parallel','perpendicular','equalLength','angle','equalRadius'].includes(current)){const filter=current==='equalRadius'?circle:line;selectedEntity('firstId','第一图元',filter);selectedEntity('secondId','第二图元',filter);if(controls.secondId.options.length>1)controls.secondId.selectedIndex=1;if(current==='angle'){numerical('angleDeg','角度 °',90);controls.direction=choice(host,'direction','旋转方向',[['ccw','逆时针'],['cw','顺时针']]);}}
  else if(['distance','coincident'].includes(current)){const a=selectedEntity('firstEntityId','第一图元'),b=selectedEntity('secondEntityId','第二图元');pointChoice('firstPoint','第一个点',a);pointChoice('secondPoint','第二个点',b);controls.secondPoint.value=pointsFor(b.value).at(-1)[0];if(current==='distance'){controls.axis=choice(host,'axis','尺寸方向',[['euclidean','两点距离'],['x','X 坐标差'],['y','Y 坐标差']]);numerical('distanceMm','尺寸 mm（X/Y可有符号）',10);}}
  else if(current==='tangent'){selectedEntity('lineId','相切直线',line);selectedEntity('circleId','相切圆',circle);controls.side=choice(host,'side','圆在直线哪侧',[['left','左侧'],['right','右侧']]);}
  else {const filter=['radius','diameter'].includes(current)?circle:['horizontal','vertical','length'].includes(current)?line:()=>true;const entity=selectedEntity('entityId','图元',filter);
   if(current==='length')numerical('lengthMm','线长 mm',40,'positive');
   if(current==='radius')numerical('radiusMm','半径 mm',5,'positive');
   if(current==='diameter')numerical('diameterMm','直径 mm',10,'positive');
   if(current==='fixPoint'){const point=pointChoice('point','固定哪一点',entity),x=numerical('positionX','来源平面 X mm',0),y=numerical('positionY','来源平面 Y mm',0);const fill=()=>{const item=entities.find(e=>e.id===entity.value),value=item?.[point.value==='center'?'centerMm':`${point.value}Mm`]||[0,0];x.value=String(value[0]);y.value=String(value[1]);};entity.addEventListener('change',fill);point.addEventListener('change',fill);fill();}
  }
  notice.textContent=current==='tangent'?'相切点可位于直线延长线上；左／右以直线起点到终点为准。':current==='angle'?'夹角以两线起点到终点的方向为准，范围0–180°。':'矩形会在派生结果中转换为四条直线并保留水平／垂直关系。圆弧与样条首版不参与约束求解。';
  form.dispatchEvent(new Event('input',{bubbles:true}));
 };
 function currentConstraint(){
  const current=type.value,values={type:current};for(const [name,input]of Object.entries(controls)){if(input.tagName==='SELECT'){if(!input.value)throw new Error('请明确选择参与约束的图元。');values[name]=input.value;}else{if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw new Error('请填写有效尺寸。');values[name]=Number(input.value);}}
  if(['coincident','distance'].includes(current)){values.first={entityId:values.firstEntityId,point:values.firstPoint};values.second={entityId:values.secondEntityId,point:values.secondPoint};for(const key of ['firstEntityId','secondEntityId','firstPoint','secondPoint'])delete values[key];}
  if(current==='fixPoint'){values.point={entityId:values.entityId,point:values.point};values.positionMm=[values.positionX,values.positionY];delete values.entityId;delete values.positionX;delete values.positionY;}
  return values;
 }
 const renderQueue=()=>{list.replaceChildren();queue.forEach((constraint,index)=>{const row=element('div',{class:'profile-editor-toolbar'}),remove=button('移除',()=>{queue.splice(index,1);renderQueue();form.dispatchEvent(new Event('input',{bubbles:true}));},'secondary');remove.type='button';row.append(element('span',{},`${index+1}. ${labels[constraint.type]} · ${constraint.entityId||constraint.firstId||constraint.lineId||constraint.first?.entityId||constraint.point?.entityId||''}${constraint.lengthMm!==undefined?` = ${constraint.lengthMm} mm`:''}`),remove);list.append(row);});};
 const add=button('添加到约束列表',()=>{try{queue.push(currentConstraint());renderQueue();form.dispatchEvent(new Event('input',{bubbles:true}));}catch(error){status.textContent=error.message;}},'secondary');add.type='button';
 const refresh=()=>{
  const body=state.bodies.find(item=>item.id===source.value),feature=state.document.features.find(item=>item.id===source.value),stamp=feature?recipeStamp(source.value):'';
  if(body&&sourceVersion&&sourceVersion!==(body.renderVersion??stamp)){dirtySource=true;form.dispatchEvent(new Event('input',{bubbles:true}));}
  if(sourceStamp!==stamp&&body&&!dirtySource){try{sourceRecipe=resolveProfileRecipe(state.document.features,source.value);entities=expandProfilePrimitives(sourceRecipe.profile).entities.filter(item=>['line','circle'].includes(item.type));sourceStamp=stamp;render();}catch(error){entities=[];sourceRecipe=null;status.textContent=error.message;}}
  const ready=!!body&&!!sourceRecipe&&entities.length>0&&!dirtySource;status.dataset.ready=String(ready);if(ready){const report=body.constraintReport;status.textContent=`来源：${body.name||body.id} · 已锁定${report?` · 剩余自由度 ${report.degreesOfFreedom}`:''}`;}else if(dirtySource)status.textContent='来源几何已变化，请重新确认来源轮廓。';else if(!body)status.textContent='请选择当前可编辑轮廓来源。';
  for(const control of form.querySelectorAll('button[type="submit"],button[data-preview]'))control.disabled=!ready||state.busy;add.disabled=!ready||state.busy;
 };
 const loadSource=()=>{queue.length=0;sourceRecipe=null;sourceStamp='';dirtySource=false;sourceVersion=state.bodies.find(body=>body.id===source.value)?.renderVersion??'';renderQueue();refresh();};
 source.addEventListener('change',loadSource);type.addEventListener('change',render);
 const confirm=button('重新确认来源',()=>{dirtySource=false;sourceVersion=state.bodies.find(body=>body.id===source.value)?.renderVersion??'';sourceStamp='';refresh();},'secondary');confirm.type='button';
 dialog.append(status);form.append(host,notice,add,list,element('p',{class:'property-footnote wide'},'只加一个条件可直接预览／应用；多个条件先逐个添加到列表。已有来源的约束会继续保留。'));
 const read=()=>{refresh();if(status.dataset.ready!=='true')throw new Error('请先确认有效来源轮廓。');return {constraints:queue.length?structuredClone(queue):[currentConstraint()],_targetRefs:[source.value]};};
 bindParameterForm(form,'profileConstraints',read);dialog.append(confirm,form);setTaskTargetRefresh(refresh);loadSource();return {dialog,form,read,refresh};
}
