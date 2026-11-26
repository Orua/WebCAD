export function showSurfaceSculpt({getState,openDialog,element,button,emit,bindParameterForm,setGuide}){
  const d=openDialog('局部曲面变形','在同一张曲面上点选位置或圈出一块区域。外沿和孔圈固定。',{returnToSelect:true});
  d.dataset.commandId='surfaceSculpt';
  const form=element('form',{class:'parameter-form'}), target=element('p',{class:'task-target wide','aria-live':'polite'});
  const label=(name,input)=>{const row=element('label',{class:'form-field'});row.append(element('span',{},name),input);return row;};
  const select=items=>{const input=element('select');for(const [value,title] of items)input.append(element('option',{value},title));return input;};
  const number=(name,value,min,max)=>element('input',{type:'number',name,value,min,max,step:'any',required:''});
  const mode=select([['point','点选位置'],['region','圈选区域']]);
  const direction=select([['normal','沿面法线'],['angled','按角度'],['vector','三维方向']]);
  mode.name='sculptScope';direction.name='sculptDirection';
  const amount=number('amountMm',.8,-20,20),influence=number('influenceMm',4,.15,60);
  const tilt=number('tiltDeg',30,0,90),azimuth=number('azimuthDeg',0,-360,360);
  const vector=[number('directionX',0,-10000,10000),number('directionY',0,-10000,10000),number('directionZ',1,-10000,10000)];
  const angles=[label('倾角（相对法线）',tilt),label('方位角（从曲面 U 向起）',azimuth)];
  const components=vector.map((input,i)=>label('方向 '+['X','Y','Z'][i],input));
  const range=label('影响半径（mm）',influence);
  const controls=element('div',{class:'dialog-footer wide'});
  let source=null,points=[];

  function refresh(message){
    const name=getState().bodies.find(body=>body.id===source?.bodyId)?.name;
    const ready=!!name&&(mode.value==='point'?points.length===1:points.length>=3);
    target.dataset.ready=String(ready);
    target.textContent=message??(name?`${name} · 面 ${source.faceId} · ${points.length} 个定位点`:
      mode.value==='point'?'请点击曲面上的变形中心。':'请沿同一曲面依次点击至少 3 个边界点。');
    for(const control of form.querySelectorAll('button[type="submit"],button[data-preview]'))if(!getState().busy)control.disabled=!ready;
    clear.disabled=!points.length;remove.disabled=mode.value!=='region'||!points.length;
    setGuide(points.length?{points,closed:mode.value==='region'&&points.length>=3}:null);
  }
  function changed(){form.dispatchEvent(new Event('input',{bubbles:true}));refresh();}
  const clear=button('重新选面',()=>{source=null;points=[];changed();},'secondary');
  const remove=button('移除末点',()=>{points=points.slice(0,-1);if(!points.length)source=null;changed();},'secondary');
  controls.append(clear,remove);
  function directionFields(){
    const groups=[[direction.value==='angled',angles],[direction.value==='vector',components]];
    for(const [on,items] of groups)for(const row of items){row.hidden=!on;row.querySelector('input').disabled=!on;}
  }
  mode.addEventListener('change',()=>{
    source=null;points=[];
    range.firstChild.textContent=mode.value==='point'?'影响半径（mm）':'圈外过渡宽度（mm）';changed();
  });
  direction.addEventListener('change',directionFields);directionFields();
  form.append(target,label('选区方式',mode),label('方向',direction),label('位移（mm，负数反向）',amount),range,...angles,...components,controls);

  d._surfaceSculptPick=hit=>{
    if(hit?.type!=='face'||!hit.point)return false;
    if(!getState().bodies.some(body=>body.id===hit.id))return false;
    if(mode.value==='region'&&source&&(source.bodyId!==hit.id||source.faceId!==hit.topologyId)){
      refresh('圈选请保持在同一张面内。更换目标前请重新选面。');return 'ignored';
    }
    if(mode.value==='region'&&points.length>=32){refresh('一个区域最多 32 个边界点。');return 'ignored';}
    source={bodyId:hit.id,faceId:hit.topologyId};
    points=mode.value==='point'?[[...hit.point]]:[...points,[...hit.point]];
    changed();
    return true;
  };
  d._onClose=()=>setGuide(null);
  bindParameterForm(form,'surfaceSculpt',()=>{
    if(!source||(mode.value==='region'&&points.length<3))throw Error('先点选中心或圈出有效区域。');
    const kind=direction.value;
    const motion=kind==='angled'?{kind,tiltDeg:Number(tilt.value),azimuthDeg:Number(azimuth.value)}:
      kind==='vector'?{kind,vector:vector.map(input=>Number(input.value))}:{kind};
    const scope=mode.value==='point'?{kind:'point',pointMm:points[0]}:{kind:'region',pointsMm:points};
    setGuide(null);
    return {faceId:source.faceId,scope,direction:motion,amountMm:Number(amount.value),influenceMm:Number(influence.value),_targetRefs:[source.bodyId]};
  });
  d.append(form);refresh();
  const selected=getState().selectedTopology;
  if(selected?.type==='face'&&selected.ids.length===1&&selected.point)d._surfaceSculptPick({type:'face',id:selected.bodyId,topologyId:selected.ids[0],point:selected.point});
  void emit('selectMode',{mode:'face'});
}
