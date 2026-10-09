export function layeredReliefProperties({feature,element,button,onEdit,onSculpt,getBusy=()=>false}){
 const form=element('form',{class:'property-form'}),inputs=[];
 if(onSculpt)form.append(button('选择图层并精修…',onSculpt,'secondary'));
 function number(label,value,key,layer=-1){const row=element('label',{class:'form-field'}),input=element('input',{type:'number',step:'any',value,'aria-label':label});row.append(element('span',{},label),input);form.append(row);inputs.push({input,key,layer});}
 for(const [key,label]of [['widthMm','图案宽 mm'],['heightMm','图案高 mm'],['offsetX','水平偏移 mm'],['offsetY','垂直偏移 mm'],['curveToleranceMm','曲线公差 mm'],['contourSnapMm','轮廓清理精度 mm（0 关闭）']])number(label,feature.params[key]??0,key);
 const modes=[];
 for(const [i,layer]of feature.params.layers.entries()){
  form.append(element('p',{class:'property-callout'},`${i+1}. ${layer.name??'矢量层'} · ${layer.regions?.length??0} 区 / ${layer.strokes?.length??0} 路径`));
  number(`第${i+1}层高度 mm`,layer.heightMm,'heightMm',i);
  number(`第${i+1}层起点 mm`,layer.startHeightMm??0,'startHeightMm',i);
  const select=element('select',{'aria-label':`第${i+1}层方向`});for(const [value,text]of [['emboss','凸起'],['engrave','凹刻']])select.append(element('option',{value},text));select.value=layer.mode??'emboss';form.append(select);modes.push(select);
 }
 const status=element('p',{'aria-live':'polite'}),apply=element('button',{type:'submit',class:'primary apply-button'},'应用分层参数');apply.disabled=getBusy();form.append(element('p',{class:'property-footnote'},'每层从原主体面计算高度；保留轮廓和刻线路径，整组修改可一次撤销。'),status,apply);
 form.addEventListener('submit',async e=>{e.preventDefault();try{const params=structuredClone(feature.params);for(const {input,key,layer}of inputs){if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw Error('请输入有效数值');(layer<0?params:params.layers[layer])[key]=Number(input.value);}modes.forEach((el,i)=>params.layers[i].mode=el.value);apply.disabled=true;await onEdit(feature.id,params,feature.name);status.textContent='分层参数已应用';}catch(error){status.textContent=error.message;}finally{apply.disabled=getBusy();}});
 return form;
}
