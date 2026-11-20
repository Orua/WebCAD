import {humanError} from '../../error-recovery.js';
export function inspectFitDialog({state,openDialog,element,emit}){
  const [bodyAId,bodyBId]=state.selectedIds,openedRevision=state.revision;
  const name=id=>state.bodies.find(body=>body.id===id)?.name||id;
  const d=openDialog('干涉 / 间隙检查','检查当前选中的两个单一实体。复合件请先提取指定实体，对称件须明确选择对应一对。');
  const form=element('form',{class:'parameter-form'}),label=element('label',{class:'form-field wide'}),input=element('input',{type:'number',min:'0',max:'1',step:'any',value:'0.00001','aria-label':'接触容差 mm'}),result=element('pre',{class:'info-content fit-result','aria-live':'polite'}),submit=element('button',{type:'submit',class:'primary'},'检查');
  label.append(element('span',{},'接触容差 mm'),input);form.append(element('p',{class:'wide'},`${name(bodyAId)} ↔ ${name(bodyBId)} · 目标已锁定`),label,submit);d.append(form,result);
  const locate=element('button',{type:'button',class:'secondary','data-ui-action':'inspectFitLocate'},'定位结果');
  locate.hidden=true;d.append(locate);
  let report;
  locate.addEventListener('click',()=>{if(report&&state.revision===report.context.revision)void emit('inspectFitLocate',{report});});
  form.addEventListener('submit',async event=>{
    event.preventDefault();submit.disabled=true;locate.hidden=true;
    try{
      if(state.revision!==openedRevision)throw new Error('模型已变化，请重新选择两个实体再检查。');
      report=await emit('inspectFit',{bodyAId,bodyBId,toleranceMm:Number(input.value)});
      if(report?.status!=='read')return;
      result.dataset.revision=String(report.context.revision);
      const classification={overlap:'有正体积干涉',overlapBelowThreshold:'有正体积干涉，低于或等于判定阈值',contactWithinTolerance:'在接触容差内',separated:'存在正间隙'}[report.classification];
      const location=report.locationMm.map(n=>n.toFixed(4)).join(', ');
      result.textContent=`${name(bodyAId)} ↔ ${name(bodyBId)}\n结果：${classification}\n公共体积：${Number(report.commonVolumeMm3.toPrecision(7))} mm³\n最短距离：${Number(report.distanceMm.toPrecision(7))} mm\n接触容差：${report.toleranceMm} mm · 体积阈值：${report.volumeThresholdMm3} mm³\n定位：${location} mm · 修订 r${report.context.revision}`;
      locate.hidden=false;
    }catch(error){result.textContent=humanError(error);}finally{submit.disabled=false;}
  });
 }
