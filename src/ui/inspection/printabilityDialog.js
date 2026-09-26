export function printabilityDialog({state,openDialog,element,emit}){
  const bodyId=state.selectedIds[0],d=openDialog('成型几何检查','来源：当前显示网格。输入悬垂角阈值；结果是几何估算，不判断工艺合格。');
  const form=element('form',{class:'parameter-form'}),label=element('label',{},'悬垂角阈值（度）'),input=element('input',{type:'number',min:'0.1',max:'89.9',step:'0.1',value:'45','aria-label':'悬垂角阈值'}),result=element('pre',{class:'info-content'}),submit=element('button',{type:'submit',class:'primary'},'检查');
  label.append(input);form.append(label,submit);d.append(form,result);
  form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;try{
   const report=await emit('inspectPrintability',{bodyId,angleLimitDeg:Number(input.value)});
   if(!report||report.status!=='read')return;
   const g=report.geometry,m=report.mesh,o=report.currentOrientation;
   result.textContent=`实体：${bodyId}\n包围尺寸：${g.dimensionsMm.map(n=>n.toFixed(3)).join(' × ')} mm\n精确 B-Rep 体积：${g.exactVolumeMm3===null?'无实体':g.exactVolumeMm3.toFixed(3)+' mm³'}\n显示网格：${m.triangleCount} 三角面，表面积约 ${m.surfaceAreaMm2.toFixed(3)} mm²\n当前方向悬垂面积：${o.overhangAreaMm2.toFixed(3)} mm²（${o.overhangPercent.toFixed(2)}%）\n支撑柱体粗估：${o.supportPrismMm3.toFixed(3)} mm³\n六个方向：\n${report.orientations.map(c=>`${c.id}: 悬垂 ${c.overhangAreaMm2.toFixed(3)} mm²，成型高度 ${c.buildHeightMm.toFixed(3)} mm`).join('\n')}\n${report.scaleWarning||''}\n未测：${report.unmeasured.join('、')}。`;
  }finally{submit.disabled=false;}});
 }
