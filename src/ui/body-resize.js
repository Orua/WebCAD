function appendResizeForm(area,{body,params,element,button,onApply,onCancel,onDraftChange=()=>{},busy=false}){
 const form=element('form',{class:'parameter-form','data-ui-action':'resizeBody'}),inputs=[];
 const sizes=params?.sizeMm||body.bounds.max.map((v,i)=>v-body.bounds.min[i]);
 for(const [index,label]of ['X 长度（mm）','Y 宽度（mm）','Z 高度（mm）'].entries()){
  const row=element('label',{class:'form-field'}),input=element('input',{type:'number',min:'.000001',max:'1000000',step:'any',required:'','aria-label':label});input.value=String(Number(sizes[index].toFixed(6)));input.disabled=busy;inputs.push(input);row.append(element('span',{},label),input);form.append(row);
 }
 const anchor=element('select',{'aria-label':'固定位置'});for(const [value,label]of [['min','最小端'],['center','中心'],['max','最大端']])anchor.append(element('option',{value},label));anchor.value=params?.resizeAnchor||'center';anchor.disabled=busy;
 const row=element('label',{class:'form-field'});row.append(element('span',{},'固定位置'),anchor);form.append(row,element('p',{class:'property-footnote'},'按世界轴对整件变形；孔、圆角和局部形状也按轴改变。保留孔径或壁厚时，请编辑原始生成参数。'));
 const error=element('p',{class:'form-error',role:'alert'}),footer=element('div',{class:'dialog-footer'}),submit=element('button',{type:'submit',class:'primary'},'应用尺寸');submit.disabled=busy;
 if(onCancel)footer.append(button('取消',onCancel,'secondary'));footer.append(submit);form.append(error,footer);
 form.addEventListener('input',()=>onDraftChange(true));form.addEventListener('change',()=>onDraftChange(true));
 form.addEventListener('submit',async event=>{event.preventDefault();try{const sizeMm=inputs.map(input=>Number(input.value));if(sizeMm.some(v=>!Number.isFinite(v)||v<=0))throw Error('请填写三个正毫米尺寸。');submit.disabled=true;await onApply({sizeMm,resizeAnchor:anchor.value});onDraftChange(false);error.textContent='';}catch(exception){error.textContent=exception.message;}finally{submit.disabled=busy;}});area.append(form);return form;
}
export function showBodyResizeDialog({state,openDialog,closeDialog,element,button,emit}){
 const body=state.bodies.find(b=>b.id===state.selectedIds[0]);if(state.selectedIds.length!==1||!body)throw Error('请选择一个当前实体。');
 const d=openDialog('实体尺寸','修改已有实体的整体长宽高，作为可编辑的变形步骤。');
 return appendResizeForm(d,{body,element,button,busy:state.busy,onCancel:()=>closeDialog(false),onApply:async params=>{const result=await emit('resizeBody',{bodyId:body.id,params});if(result!==false)closeDialog(false);}});
}
export function renderBodyResizeProperties(area,{feature,body,state,element,button,onEdit,onDraftChange}){
 area.append(element('h3',{class:'section-label'},'实体尺寸 · 世界轴'));
 if(body?.resizeReport)area.append(element('p',{class:'property-footnote'},'当前尺寸：'+body.resizeReport.actualSizeMm.map(v=>Number(v.toFixed(4))).join(' × ')+' mm'));
 return appendResizeForm(area,{body,params:feature.params,element,button,busy:state.busy,onDraftChange,onApply:params=>onEdit(feature.id,params,feature.name)});
}
