function readPoints(text) {
  return text.trim().split(/[\n;；]+/).filter(row => row.trim()).map((row,index) => {
    const items = row.trim().split(/\s*[,，]\s*|\s+/);
    const values = items.map(Number);
    if(items.length!==3 || items.some(item => !item) || values.some(v => !Number.isFinite(v))) {
      throw new Error(`第 ${index+1} 组坐标需要 X、Y、Z 三个数值。`);
    }
    return values;
  });
}

export function surfaceFillPreviewSummary(report) {
  const error = Math.max(report.boundaryDeviationMm,report.pointDeviationMm,
    report.guideDeviationMm,report.solverDeviationMm);
  const seam = report.g1EdgeCount+report.g2EdgeCount ?
    `，接缝最大法向夹角 ${report.maxNormalAngleDeg.toFixed(3)}°`:'';
  return `已生成${report.output==='surface'?'曲面':'实体'}，最大位置残差 ${error.toFixed(4)} mm${seam}。`;
}

export function showSurfaceFill({getState,openDialog,element,button,emit,bindParameterForm,setVertexPicking}) {
  const dialog = openDialog('约束填充曲面','用一圈边界定外形，用内点或导向边控制起伏。',{returnToSelect:true});
  dialog.dataset.commandId='surfaceFill';
  const form = element('form',{class:'parameter-form'});
  const status = element('p',{class:'task-target wide','aria-live':'polite'});
  const label = (title,input,wide=false) => {
    const row = element('label',{class:'form-field'+(wide?' wide':'')});
    row.append(element('span',{},title),input);
    return row;
  };
  const select = (name,choices) => {
    const input = element('select',{name});
    for (const [value,title] of choices) input.append(element('option',{value},title));
    return input;
  };
  const controls = (...children) => {
    const row = element('div',{class:'dialog-footer wide'});
    row.append(...children);
    return row;
  };
  const mode = select('boundaryMode',[['points','坐标或顶点'],['edges','模型边']]);
  const curve = select('boundaryCurve',[['smooth','光顺闭合'],['segments','直线分段']]);
  const curveRow = label('轮廓连接',curve);
  const boundaryInput = element('textarea',{name:'boundaryPoints',rows:3,placeholder:'-10, -6, 0'});
  const boundaryRow = label('边界 XYZ（mm），按顺序每行一点',boundaryInput,true);
  const pointInput = element('textarea',{name:'interiorPoints',rows:2,placeholder:'0, 0, 3'});
  const pointRow = label('内点 XYZ（mm），每行一点',pointInput,true);
  const output = select('output',[['surface','曲面'],['thickened','增厚成体']]);
  const thickness = element('input',{type:'number',name:'thicknessMm',value:-1,min:-20,max:20,step:'any',required:''});
  const thickRow = label('法向厚度（mm，可为负）',thickness);
  const tolerance = element('input',{type:'number',name:'toleranceMm',value:0.01,min:0.001,max:0.05,step:'any',required:''});
  const edgeList = select('boundaryEdge',[]);
  const edgeRow = label('调整边界边',edgeList);
  const continuity = select('continuity',[['G0','G0 · 贴合边'],['G1','G1 · 相切'],['G2','G2 · 曲率连续']]);
  const continuityRow = label('接续方式',continuity);
  const boundaryEdges = [], boundaryVertices = [], interiorVertices = [], guideEdges = [], picks = [];
  let role = null, revision = getState().revision, documentId = getState().document?.documentId;
  const current = () => revision===getState().revision && documentId===getState().document?.documentId;
  const activeEdge = () => boundaryEdges[Number(edgeList.value)];
  const pointMode = () => mode.value==='points';
  const isVertexRole = () => role==='rimVertex' || role==='interiorVertex';

  function activate(next) {
    role = next;
    setVertexPicking(isVertexRole());
    if (next && !isVertexRole()) void emit('selectMode',{mode:next==='support'?'face':'edge'});
    refresh();
  }

  function refresh(message) {
    const coordinateMode = pointMode(), edge = activeEdge();
    boundaryRow.hidden=curveRow.hidden=pickRimVertex.hidden=!coordinateMode;
    edgeRow.hidden=continuityRow.hidden=pickRimEdge.hidden=coordinateMode;
    pickSupport.hidden=coordinateMode || !edge || edge.kind==='G0';
    continuity.disabled=!edge;
    removeLast.disabled=!picks.length;
    thickRow.hidden=thickness.disabled=output.value==='surface';
    const boundaryCount = coordinateMode ? boundaryInput.value.trim().split(/[\n;；]+/).filter(row => row.trim()).length+boundaryVertices.length : boundaryEdges.length;
    const counts = coordinateMode?`边界 ${boundaryCount} 点`:`边界 ${boundaryCount} 边`;
    const instruction = {
      rimVertex:'点选的顶点依次加在输入坐标之后。',
      rimEdge:'请依次点击要组成闭环的边。',
      interiorVertex:'请点击要作为内点的 CAD 顶点。',
      guide:'请点击用来控制起伏的导向边。',
      support:`为边 ${edge?.edgeId??''} 点选同一对象上的相邻面。`,
    }[role];
    status.textContent = message??(!current()?'工程已变化，请清除后重新选取。':[
      counts,`内点 ${interiorVertices.length} 个已选顶点`,`导向 ${guideEdges.length} 边`,instruction,
    ].filter(Boolean).join(' · '));
    const ready = current() && boundaryCount>=(coordinateMode?3:1) &&
      (coordinateMode || boundaryEdges.every(item => item.kind==='G0' || Number.isInteger(item.supportFaceId)));
    status.dataset.ready=String(ready);
    if (!getState().busy) for (const control of form.querySelectorAll('button[type="submit"],button[data-preview]')) control.disabled=!ready;
  }

  function rebuildEdgeList(index = boundaryEdges.length-1) {
    edgeList.replaceChildren(...boundaryEdges.map((item,i) => {
      const name = getState().bodies.find(body => body.id===item.bodyId)?.name;
      return element('option',{value:i},`${name} · 边 ${item.edgeId} · ${item.kind}`);
    }));
    edgeList.value=String(index);
    continuity.value=activeEdge()?.kind??'G0';
  }

  function changed() {form.dispatchEvent(new Event('input',{bubbles:true}));}
  const pickRimVertex = button('点选边界顶点',()=>activate('rimVertex'),'secondary');
  const pickRimEdge = button('选边界边',()=>activate('rimEdge'),'secondary');
  const pickInterior = button('点选内点',()=>activate('interiorVertex'),'secondary');
  const pickGuide = button('选导向边',()=>activate('guide'),'secondary');
  const pickSupport = button('选此边的邻面',()=>activate('support'),'secondary');
  const removeLast = button('撤回选择',()=>{picks.pop()?.();changed();},'secondary');
  const clear = button('清除选取',()=>{
    for (const list of [boundaryEdges,boundaryVertices,interiorVertices,guideEdges,picks]) list.length=0;
    rebuildEdgeList();
    revision=getState().revision;documentId=getState().document?.documentId;
    activate(null);changed();
  },'secondary');
  mode.addEventListener('change',()=>activate(null));
  edgeList.addEventListener('change',()=>{
    continuity.value=activeEdge()?.kind??'G0';
    if(role==='support')activate(null);else refresh();
  });
  continuity.addEventListener('change',()=>{
    const edge = activeEdge();
    if (!edge) return;
    edge.kind=continuity.value;
    if(edge.kind==='G0')delete edge.supportFaceId;
    rebuildEdgeList(Number(edgeList.value));
    activate(edge.kind!=='G0'&&edge.supportFaceId===undefined?'support':null);
    changed();
  });
  form.addEventListener('input',()=>refresh());
  form.append(status,label('边界来源',mode),curveRow,boundaryRow,controls(pickRimVertex,pickRimEdge),
    edgeRow,continuityRow,controls(pickSupport),pointRow,controls(pickInterior,pickGuide),
    controls(removeLast,clear),label('输出',output),thickRow,label('位置公差（mm）',tolerance));

  dialog._surfaceFillPick = hit => {
    if (!role) return false;
    if (!current()) {refresh();return 'ignored';}
    const body = getState().bodies.find(item => item.id===hit?.id && item.geometryType!=='mesh');
    const type = isVertexRole()?'vertex':role==='support'?'face':'edge';
    if (!body || hit.type!==type || !Number.isInteger(hit.topologyId)) {
      refresh(type==='vertex'?'请靠近可见的 CAD 顶点再点选。':undefined);
      return 'ignored';
    }
    if (role==='support') {
      const edge = activeEdge();
      if (!edge || edge.kind==='G0' || edge.bodyId!==body.id) {
        refresh('请点选当前边所属对象上的邻面。');return 'ignored';
      }
      const previous = edge.supportFaceId;
      edge.supportFaceId=hit.topologyId;
      picks.push(()=>{if (edge.kind==='G0' || previous===undefined)delete edge.supportFaceId;else edge.supportFaceId=previous;});
      activate(null);changed();return true;
    }
    const list = {rimVertex:boundaryVertices,rimEdge:boundaryEdges,interiorVertex:interiorVertices,guide:guideEdges}[role];
    const item = {bodyId:body.id,edgeId:hit.topologyId};
    if (isVertexRole()) item.nearMm=[...hit.point];
    else if ([...boundaryEdges,...guideEdges].some(edge => edge.bodyId===item.bodyId && edge.edgeId===item.edgeId)) {
      refresh('这条边已用于约束。');return 'ignored';
    }
    const limit = {rimVertex:24,rimEdge:24,interiorVertex:32,guide:8}[role];
    if (list.length>=limit) {refresh(`此处最多点选 ${limit} 项。`);return 'ignored';}
    if (role==='rimEdge') item.kind='G0';
    list.push(item);
    if (list===boundaryEdges)rebuildEdgeList();
    picks.push(()=>{list.pop();if (list===boundaryEdges)rebuildEdgeList();});
    changed();return true;
  };
  dialog._onClose = () => setVertexPicking(false);
  bindParameterForm(form,'surfaceFill',()=>{
    if (!current()) throw new Error('工程已变化，请重新选取约束。');
    const refs = [];
    const pack = ({bodyId,...item}) => {
      if (!refs.includes(bodyId))refs.push(bodyId);
      return {...item,refIndex:refs.indexOf(bodyId)};
    };
    const boundary = pointMode() ?
      {kind:'points',curve:curve.value,points:[...readPoints(boundaryInput.value),...boundaryVertices.map(pack)]} :
      {kind:'edges',edges:boundaryEdges.map(pack)};
    const points = [...readPoints(pointInput.value),...interiorVertices.map(pack)];
    const guideConstraints = guideEdges.map(pack), kind = output.value;
    return {boundary,points,guideEdges:guideConstraints,toleranceMm:Number(tolerance.value),
      output:kind==='surface'?{kind}:{kind,thicknessMm:Number(thickness.value)},_targetRefs:refs};
  });
  dialog.append(form);
  refresh();
}
