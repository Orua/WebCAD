export function showSurfaceAnalysisDialog(action,{getState,openDialog,element,button,emit}){
  const thickness=action==='inspectWallThicknessMap';
  const dialog=openDialog(thickness?'壁厚色图':'曲面光顺检查',
    thickness?'沿所选面的向内法线采样，到首次离开连续材料为止。':'斑马纹显示表面反光，曲率梳读取所选边的实际曲率。',{returnToSelect:true});
  dialog.dataset.commandId=action;
  const form=element('div',{class:'parameter-form'});
  const status=element('p',{class:'task-target wide','aria-live':'polite'});
  const report=element('p',{class:'preview-hint wide','aria-live':'polite'});
  form.append(status);
  function field(title,input){
    const label=element('label',{class:'form-field'});label.append(element('span',{},title),input);form.append(label);return label;
  }
  function selector(name,choices){
    const input=element('select',{name});
    for(const [value,text] of choices)input.append(element('option',{value},text));
    return input;
  }
  const isExact=body=>!['mesh','rawMesh','assembly'].includes(body.geometryType);
  const objects=getState().bodies.filter(isExact);
  const body=selector('bodyId',objects.map(body=>[body.id,body.name]));
  if(getState().selectedIds.length===1&&objects.some(b=>b.id===getState().selectedIds[0]))body.value=getState().selectedIds[0];
  field('对象',body);
  const mode=thickness?null:selector('mode',[['zebra','斑马纹'],['comb','曲率梳']]);
  if(mode)field('检查方式',mode);
  const activeMode=()=>thickness?'thickness':mode.value;
  const grid=element('input',{type:'number',name:'grid',value:5,min:2,max:10,step:1});
  const threshold=element('input',{type:'number',name:'thresholdMm',min:.001,max:500,step:'any',placeholder:'可留空'});
  const zebra=selector('zebraDirection',[['vertical','竖向'],['horizontal','横向']]);
  const zebraRow=thickness?null:field('条纹方向',zebra);
  if(thickness){field('每方向采样数',grid);field('薄壁阈值（mm）',threshold);}
  let role=null,edgeId=null,faceIds=[],working=false;
  const start=getState(), atRevision=start.revision, atDocument=start.document?.documentId;
  const current=()=>getState().revision===atRevision&&getState().document?.documentId===atDocument;
  function refresh(){
    const mode=activeMode(), ready=current()&&!!body.value&&(mode==='zebra'||mode==='comb'&&edgeId!==null||mode==='thickness'&&faceIds.length>0);
    status.textContent=!current()?'工程已变化，请关闭后重新选取。':mode==='zebra'?'选择要查看反光的对象。':
      mode==='comb'?(edgeId===null?'请选择一条精确边。':`已选边 ${edgeId}`):`已选 ${faceIds.length} 张面`;
    if(zebraRow)zebraRow.hidden=mode!=='zebra';
    pick.hidden=mode==='zebra';
    clearSelection.hidden=mode==='zebra';
    run.disabled=working||!ready;
    clearDisplay.disabled=working;
  }
  function reset(){edgeId=null;faceIds=[];report.textContent='';refresh();}
  body.addEventListener('change',reset);
  mode?.addEventListener('change',()=>{role=null;reset();});
  const pick=button(thickness?'选测厚面':'选曲率边',()=>{
    role=thickness?'face':'edge';
    void emit('selectMode',{mode:role});
  },'secondary');
  const clearSelection=button('清除选取',reset,'secondary');
  const row=element('div',{class:'dialog-footer wide'});row.append(pick,clearSelection);form.append(row,report);
  dialog._freeformPick=hit=>{
    if(!role)return false;
    if(!current()||hit?.type!==role||!Number.isInteger(hit.topologyId)||!objects.some(b=>b.id===hit.id))return 'ignored';
    if(body.value!==hit.id){body.value=hit.id;edgeId=null;faceIds=[];}
    if(role==='edge'){edgeId=hit.topologyId;role=null;}
    else if(!faceIds.includes(hit.topologyId)&&faceIds.length<4)faceIds.push(hit.topologyId);
    refresh();return true;
  };
  const selected=getState().selectedTopology;
  if(selected?.bodyId===body.value){
    if(selected.type==='face'&&thickness)faceIds=selected.ids.slice(0,4);
    if(selected.type==='edge'&&!thickness){edgeId=selected.ids[0]??null;if(edgeId!==null)mode.value='comb';}
  }
  const run=button('检查',async()=>{
    const kind=activeMode();
    const input=kind==='zebra'?{zebraDirection:zebra.value}:kind==='comb'?{edgeId}:
      {faceIds:[...faceIds],grid:Number(grid.value),...(threshold.value?{thresholdMm:Number(threshold.value)}:{})};
    working=true;refresh();report.textContent='正在检查…';
    try{
      const result=await emit('surfaceAnalysis',{mode:kind,bodyId:body.value,...input});
      if(!result){report.textContent='';return;}
      if(kind==='zebra')report.textContent='斑马纹已显示，可旋转模型观察接缝。';
      if(kind==='comb')report.textContent=`最大采样曲率 ${result.maxCurvaturePerMm.toPrecision(3)} mm⁻¹，共 ${result.samples.length} 点。`;
      if(kind==='thickness')report.textContent=`最薄测点 ${result.thinnest.thicknessMm.toFixed(3)} mm，共 ${result.samples.length} 点`+
        (result.belowThreshold===null?'。':`，低于阈值 ${result.belowThreshold} 点（红色）。`)+
        (result.unresolved?`另有 ${result.unresolved} 点未测得。`:'');
    }finally{working=false;refresh();}
  },'primary');
  const clearDisplay=button('清除显示',async()=>{await emit('surfaceAnalysis',{mode:'clear'});report.textContent='';},'secondary');
  const footer=element('div',{class:'dialog-footer wide'});footer.append(clearDisplay,run);form.append(footer);
  dialog.append(form);refresh();
}
