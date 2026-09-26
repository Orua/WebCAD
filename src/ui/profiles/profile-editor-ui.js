import {validateProfile} from '../../modeling/profiles/profile-model.js';
import {profileIntersections,editProfileEndpoint,filletProfileLines,trimProfileCircle} from '../../modeling/profiles/profile-editing.js';
import {mountProfileCanvas} from './profile-canvas-ui.js';
import {PROFILE_PRIMITIVES,primitiveEntities} from '../../modeling/profiles/profile-primitives.js';

const number = (label, value, field) => {
  const input = document.createElement('input');
  input.type = 'number'; input.step = 'any'; input.required = true;
  input.setAttribute('aria-label', label); input.dataset.field = field; input.value = String(value);
  return input;
};
const select = (label, values, value) => {
  const control = document.createElement('select'); control.setAttribute('aria-label', label);
  for (const [key, text] of values) { const option = document.createElement('option'); option.value = key; option.textContent = text; control.append(option); }
  control.value = value; return control;
};
const seeded = (type, start=[0,0], end=[10,0]) => ({id:crypto.randomUUID(),type,...(type==='circle'?{centerMm:[0,0],diameterMm:20}:type==='arc3'?{startMm:start,midMm:[(start[0]+end[0])/2,(start[1]+end[1])/2+5],endMm:end}:{startMm:start,endMm:end})});
export function mountProfileEditor(form, initial) {
  const controls=document.createElement('div');controls.className='profile-editor';
  const toolbar=document.createElement('div');toolbar.className='profile-editor-toolbar';
  const rows=document.createElement('div');rows.className='profile-entity-rows';
  const output=select('轮廓输出',[['face','闭合面'],['wire','开放/闭合线框']],initial?.output||'face');
  const extraHoleRoles=new Set();for(let index=0;index<(initial?.regions?.length||0);index++)for(let hole=1;hole<initial.regions[index].holeLoopIds.length;hole++)extraHoleRoles.add(`hole-${index+1}-${hole+1}`);
  const extraPathRoles=[...(initial?.loops||[]),...(initial?.chains||[])].filter(path=>!initial?.regions?.some(region=>region.outerLoopId===path.id||region.holeLoopIds.includes(path.id))).map(path=>[`path-${path.id}`,`线框路径 ${path.id}`]);
  const addButton=(label,handler)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>{try{undo.push(read({validate:false}));handler();refreshEntities();}catch(error){info.textContent=error.message;}});toolbar.append(button);};
  const field=(parent,label,value,key)=>{const wrapper=document.createElement('label');wrapper.append(document.createTextNode(label),number(label,value,key));parent.append(wrapper);};
  function addRow(entity,role='outer',reversed=false){
    if(rows.children.length>=500)throw new Error('轮廓最多 500 个实体');
    const row=document.createElement('div');row.className='profile-entity-row';row.dataset.id=entity.id;row.dataset.type=entity.type;row.dataset.reversed=String(reversed);if(entity.projectionSource)row.dataset.projectionSource=JSON.stringify(entity.projectionSource);
    const title=document.createElement('strong');title.textContent={line:'直线',arc3:'三点圆弧',circle:'圆',rectangle:'参数矩形',roundedRectangle:'参数圆角矩形',capsule:'参数长圆'}[entity.type];
    const roleChoices=[['outer','区域 1 外环'],['hole-1','区域 1 孔环 1'],...Array.from({length:15},(_,i)=>i+2).flatMap(i=>[[`outer-${i}`,`区域 ${i} 外环`],[`hole-${i}`,`区域 ${i} 孔环 1`]]),...[...extraHoleRoles].map(role=>{const [,region,hole]=role.split('-');return [role,`区域 ${region} 孔环 ${hole}`];}),...extraPathRoles,['construction','辅助线']];
    const roleInput=select('所属轮廓',roleChoices,role);roleInput.className='profile-role';row.append(title,roleInput);
    if(PROFILE_PRIMITIVES.includes(entity.type)){field(row,'起始 X',entity.originMm[0],'ox');field(row,'起始 Y',entity.originMm[1],'oy');field(row,entity.type==='capsule'?'总长':'宽度',entity.widthMm,'width');field(row,entity.type==='capsule'?'宽度':'高度',entity.heightMm,'height');if(entity.type==='roundedRectangle')field(row,'角 R',entity.cornerRadiusMm,'cornerRadius');const convert=document.createElement('button');convert.type='button';convert.textContent='转为独立直线 / 圆弧';convert.addEventListener('click',()=>{try{const current=read({validate:false}),source=current.entities.find(item=>item.id===row.dataset.id);undo.push(current);const parts=primitiveEntities(source),reverse=row.dataset.reversed==='true';for(const part of reverse?[...parts].reverse():parts){addRow(part,row.querySelector('.profile-role').value,reverse);rows.insertBefore(rows.lastElementChild,row);}row.remove();form.dispatchEvent(new Event('input',{bubbles:true}));refreshEntities();}catch(error){info.textContent=error.message;}});row.append(convert);}
    else if(entity.type==='circle') { field(row,'圆心 X',entity.centerMm[0],'cx');field(row,'圆心 Y',entity.centerMm[1],'cy');field(row,'直径 Ø',entity.diameterMm,'diameter'); }
    else { field(row,'起点 X',entity.startMm[0],'sx');field(row,'起点 Y',entity.startMm[1],'sy');if(entity.type==='arc3'){field(row,'经过 X',entity.midMm[0],'mx');field(row,'经过 Y',entity.midMm[1],'my');}field(row,'终点 X',entity.endMm[0],'ex');field(row,'终点 Y',entity.endMm[1],'ey'); }
    if(entity.type==='line'){const dx=entity.endMm[0]-entity.startMm[0],dy=entity.endMm[1]-entity.startMm[1];field(row,'一次设置长度',Math.hypot(dx,dy),'setLength');field(row,'一次设置角度 °',Math.atan2(dy,dx)*180/Math.PI,'setAngle');const applyDimensions=document.createElement('button');applyDimensions.type='button';applyDimensions.textContent='按长度 / 角度设置终点';applyDimensions.addEventListener('click',()=>{const length=Number(row.querySelector('[data-field="setLength"]').value),angle=Number(row.querySelector('[data-field="setAngle"]').value)*Math.PI/180;if(!Number.isFinite(length)||length<=0||!Number.isFinite(angle)){info.textContent='长度须大于零，角度须为有限数字';return;}undo.push(read({validate:false}));const x=Number(row.querySelector('[data-field="sx"]').value),y=Number(row.querySelector('[data-field="sy"]').value);row.querySelector('[data-field="ex"]').value=String(x+length*Math.cos(angle));row.querySelector('[data-field="ey"]').value=String(y+length*Math.sin(angle));form.dispatchEvent(new Event('input',{bubbles:true}));});row.append(applyDimensions);}
    const remove=document.createElement('button');remove.type='button';remove.textContent='删除段';remove.setAttribute('aria-label',`删除 ${title.textContent}`);remove.addEventListener('click',()=>{undo.push(read({validate:false}));row.remove();form.dispatchEvent(new Event('input',{bubbles:true}));});row.append(remove);rows.append(row);
    form.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function preset(entities){rows.replaceChildren();entities.forEach(item=>addRow(item));}
  addButton('参数矩形',()=>preset([{id:crypto.randomUUID(),type:'rectangle',originMm:[0,0],widthMm:40,heightMm:30}]));
  addButton('参数圆角矩形',()=>preset([{id:crypto.randomUUID(),type:'roundedRectangle',originMm:[0,0],widthMm:40,heightMm:30,cornerRadiusMm:3}]));
  addButton('参数长圆',()=>preset([{id:crypto.randomUUID(),type:'capsule',originMm:[0,0],widthMm:40,heightMm:20}]));
  addButton('清空绘图区',()=>{rows.replaceChildren();form.dispatchEvent(new Event('input',{bubbles:true}));});
  addButton('Ø20 圆',()=>preset([seeded('circle')]));
  addButton('新增直线',()=>{const end=rows.lastElementChild?.querySelector('[data-field="ex"]')?.value,ey=rows.lastElementChild?.querySelector('[data-field="ey"]')?.value;addRow(seeded('line',end!==undefined?[Number(end),Number(ey)]:[0,0]));});
  addButton('新增三点圆弧',()=>{const end=rows.lastElementChild?.querySelector('[data-field="ex"]')?.value,ey=rows.lastElementChild?.querySelector('[data-field="ey"]')?.value;addRow(seeded('arc3',end!==undefined?[Number(end),Number(ey)]:[0,0]));});
  addButton('新增圆',()=>addRow(seeded('circle')));
  const holeRegion=select('新孔环所属区域',Array.from({length:16},(_,i)=>[String(i+1),`区域 ${i+1}`]),'1');toolbar.append(holeRegion);addButton('添加孔环分组',()=>{const region=holeRegion.value,prefix=`hole-${region}`,numbers=[1,...[...extraHoleRoles].filter(role=>role.startsWith(prefix+'-')).map(role=>Number(role.split('-')[2]))],hole=Math.max(...numbers)+1;if(extraHoleRoles.size>=49)throw new Error('孔环分组已到保护上限');const role=`${prefix}-${hole}`;extraHoleRoles.add(role);for(const control of rows.querySelectorAll('.profile-role')){const option=document.createElement('option');option.value=role;option.textContent=`区域 ${region} 孔环 ${hole}`;control.append(option);}info.textContent=`已添加区域 ${region} 的孔环 ${hole} 分组；请将该孔的图元归入此组。`;});
  controls.append(toolbar,output,rows);form.append(controls);
  const initialRoles=new Map(),originalLoopIds=new Map(),originalRegionIds=new Map();
  const orderedEntities=params=>{const order=[...(params.loops||[]),...(params.chains||[])].flatMap(path=>path.edges.map(ref=>ref.entityId)),byId=new Map(params.entities.map(entity=>[entity.id,entity]));return [...new Set([...order,...byId.keys()])].map(id=>byId.get(id)).filter(Boolean);};
  if(initial){for(const loop of initial.loops||[]){const regionIndex=initial.regions?.findIndex(region=>region.outerLoopId===loop.id||region.holeLoopIds?.includes(loop.id))??-1;const region=initial.regions?.[regionIndex];const role=regionIndex<0?'path-'+loop.id:loop.id===region.outerLoopId?(regionIndex===0?'outer':`outer-${regionIndex+1}`):`hole-${regionIndex+1}${region.holeLoopIds.indexOf(loop.id)>0?'-'+(region.holeLoopIds.indexOf(loop.id)+1):''}`;originalLoopIds.set(role,loop.id);for(const entry of loop.edges)initialRoles.set(entry.entityId,role);}for(const chain of initial.chains||[]){const role='path-'+chain.id;originalLoopIds.set(role,chain.id);for(const entry of chain.edges)initialRoles.set(entry.entityId,role);}for(const entity of orderedEntities(initial))addRow(entity,initialRoles.get(entity.id)||'construction',[...(initial.loops||[]),...(initial.chains||[])].flatMap(path=>path.edges).find(ref=>ref.entityId===entity.id)?.reversed||false);}
  else preset([seeded('line',[0,0],[40,0]),seeded('line',[40,0],[40,30]),seeded('line',[40,30],[0,30]),seeded('line',[0,30],[0,0])]);
  const read=({validate=true}={})=>{
    const entities=[],directions=new Map(),groups={};
    for(const row of rows.children){const value=key=>{const input=row.querySelector(`[data-field="${key}"]`),n=Number(input?.value);if(!input?.value.trim()||!Number.isFinite(n))throw new Error(`${key} 需要有限数值`);return n;};
      const entity={id:row.dataset.id,type:row.dataset.type};if(row.dataset.projectionSource)entity.projectionSource=JSON.parse(row.dataset.projectionSource);
      if(PROFILE_PRIMITIVES.includes(entity.type)){entity.originMm=[value('ox'),value('oy')];entity.widthMm=value('width');entity.heightMm=value('height');if(entity.type==='roundedRectangle')entity.cornerRadiusMm=value('cornerRadius');}
      else if(entity.type==='circle'){entity.centerMm=[value('cx'),value('cy')];entity.diameterMm=value('diameter');}
      else {entity.startMm=[value('sx'),value('sy')];entity.endMm=[value('ex'),value('ey')];if(entity.type==='arc3')entity.midMm=[value('mx'),value('my')];}
      const role=row.querySelector('.profile-role').value;directions.set(entity.id,row.dataset.reversed==='true');if(role==='construction')entity.construction=true;else (groups[role]??=[]).push(entity.id);
      entities.push(entity);
    }
    const loops=[],chains=[],regions=[];
    if(output.value==='face'){
      for(const [role,ids] of Object.entries(groups))if(ids.length)loops.push({id:originalLoopIds.get(role)||role,edges:ids.map(entityId=>({entityId,reversed:directions.get(entityId)}))});
      for(let i=1;i<=16;i++){const outer=i===1?'outer':`outer-${i}`,hole=`hole-${i}`,holes=Object.keys(groups).filter(role=>role===hole||role.startsWith(hole+'-'));if(groups[outer]?.length)regions.push({id:initial?.regions?.[i-1]?.id||`region-${i}`,outerLoopId:originalLoopIds.get(outer)||outer,holeLoopIds:holes.map(role=>originalLoopIds.get(role)||role)});else if(holes.length)throw new Error(`区域 ${i} 有孔环但没有外环`);}
    }else for(const [role,ids] of Object.entries(groups))if(ids.length)chains.push({id:originalLoopIds.get(role)||`chain-${role}`,edges:ids.map(entityId=>({entityId,reversed:directions.get(entityId)}))});
    const params={profileVersion:1,entities,loops,chains,regions,output:output.value};if(validate)validateProfile(params);return params;
  };
  const editPanel=document.createElement('div');editPanel.className='profile-edit-panel';
  const mode=select('轮廓编辑方式',[['trim','修剪到交点'],['trimCircle','整圆修剪为圆弧'],['extend','沿原曲线延伸'],['fillet','两直线二维圆角']],'trim');
  const source=select('源曲线',[],''),target=select('目标曲线',[],''),candidate=select('选定交点',[],''),end=select('编辑端点',[['end','末端'],['start','起端']],'end');
  const radius=number('二维圆角 R mm',2,'radius');
  const candidateEnd=select('整圆修剪终交点',[],''),keepSide=select('保留圆弧方向',[['ccw','保留逆时针区间'],['cw','保留顺时针区间']],'ccw');
  const info=document.createElement('p');info.setAttribute('aria-live','polite');
  const undo=[];
  const roleMap=params=>{const map=new Map();for(const loop of params.loops||[]){const index=params.regions?.findIndex(region=>region.outerLoopId===loop.id||region.holeLoopIds?.includes(loop.id))??-1;const region=params.regions?.[index];const role=index<0?'path-'+loop.id:loop.id===region.outerLoopId?(index===0?'outer':`outer-${index+1}`):`hole-${index+1}${region.holeLoopIds.indexOf(loop.id)>0?'-'+(region.holeLoopIds.indexOf(loop.id)+1):''}`;for(const item of loop.edges)map.set(item.entityId,role);}for(const chain of params.chains||[]){const role=[...originalLoopIds].find(([,id])=>id===chain.id)?.[0]||(chain.id.startsWith('chain-')?chain.id.slice(6):'path-'+chain.id);for(const item of chain.edges)map.set(item.entityId,role);}return map;};
  const load=params=>{const roles=roleMap(params);rows.replaceChildren();output.value=params.output;for(const item of orderedEntities(params))addRow(item,roles.get(item.id)||'construction',[...(params.loops||[]),...(params.chains||[])].flatMap(path=>path.edges).find(ref=>ref.entityId===item.id)?.reversed||false);refreshEntities();};
  const refreshEntities=()=>{const current=read({validate:false});for(const [control,previous] of [[source,source.value],[target,target.value]]){control.replaceChildren();for(const item of current.entities){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.type} · ${item.id.slice(0,8)}`;control.append(option);}if(previous&&current.entities.some(item=>item.id===previous))control.value=previous;}refreshCandidates();};
  const refreshCandidates=()=>{candidate.replaceChildren();candidateEnd.replaceChildren();candidateEnd.hidden=keepSide.hidden=mode.value!=='trimCircle';radius.hidden=mode.value!=='fillet';end.hidden=['fillet','trimCircle'].includes(mode.value);candidate.hidden=mode.value==='fillet';try{const current=read({validate:false}),a=current.entities.find(e=>e.id===source.value),b=current.entities.find(e=>e.id===target.value);if(a&&b&&a.id!==b.id&&mode.value!=='fillet')for(const item of profileIntersections(a,b)){for(const control of [candidate,candidateEnd]){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.id}: ${item.point.map(n=>Number(n.toFixed(4))).join(', ')} mm`;control.append(option);}}info.textContent=mode.value==='fillet'?'按闭合环顺序选两条相邻直线，输入精确 R 半径。':mode.value==='trimCircle'?'整圆需线框输出，明确选择两个不同交点和保留方向。':candidate.length?`${candidate.length} 个解析交点；明确选中交点和要编辑的端点。`:'当前曲线无可用交点。';}catch(error){info.textContent=error.message;}};
  const proposedEdit=()=>{const current=read(),next=mode.value==='fillet'?filletProfileLines(current,{firstId:source.value,secondId:target.value,radiusMm:Number(radius.value),arcId:crypto.randomUUID()}):mode.value==='trimCircle'?trimProfileCircle(current,{entityId:source.value,targetId:target.value,startCandidateId:candidate.value,endCandidateId:candidateEnd.value,keepSide:keepSide.value}):editProfileEndpoint(current,{mode:mode.value,entityId:source.value,targetId:target.value,candidateId:candidate.value,end:end.value});return {current,next};};
  const apply=document.createElement('button');apply.type='button';apply.textContent='应用到轮廓草稿';apply.addEventListener('click',()=>{try{const {current,next}=proposedEdit();undo.push(current);load(next);info.textContent='已修改轮廓草稿；完成轮廓前可局部撤销。';}catch(error){info.textContent=error.message;}});
  const undoButton=document.createElement('button');undoButton.type='button';undoButton.textContent='撤销本次轮廓编辑';undoButton.addEventListener('click',()=>{if(undo.length)load(undo.pop());});
  for(const control of [mode,source,target,end,radius])control.addEventListener('change',refreshCandidates);
  editPanel.append(mode,source,target,candidate,candidateEnd,keepSide,end,radius,apply,undoButton,info);controls.append(editPanel);
  const canvas=mountProfileCanvas(controls,{read:()=>read({validate:false}),onAdd:entity=>{undo.push(read({validate:false}));addRow(entity);refreshEntities();},onSelect:id=>{source.value=id;for(const row of rows.children)row.classList.toggle('selected',row.dataset.id===id);rows.querySelector(`[data-id="${id}"]`)?.scrollIntoView({block:'nearest'});refreshCandidates();},onError:error=>{info.textContent=error.message;}});controls.insertBefore(canvas.root,rows);
  apply.addEventListener('pointerenter',()=>{try{const {current,next}=proposedEdit();canvas.showEditPreview(current,next);}catch(error){info.textContent=error.message;}});apply.addEventListener('pointerleave',()=>canvas.clearEditPreview());apply.addEventListener('focus',()=>{try{const {current,next}=proposedEdit();canvas.showEditPreview(current,next);}catch(error){info.textContent=error.message;}});apply.addEventListener('blur',()=>canvas.clearEditPreview());
  form.addEventListener('input',()=>{canvas.render();refreshEntities();});form.addEventListener('change',()=>canvas.render());
  refreshEntities();
  return {read,root:controls,appendProjected(entities){for(const entity of entities)addRow(entity,'construction');refreshEntities();}};
}
