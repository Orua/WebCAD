import {METAL_DENSITIES,validateMaterialSettings,materialWeight} from '../../material-density.js';
export function showMaterialSettings({state,openDialog,element,button,closeDialog,emit}){
 const d=openDialog('材料密度与重量'),form=element('form',{class:'parameter-form'}),settings=validateMaterialSettings(state.document.materialSettings),inputs={};
 const select=element('select',{'aria-label':'默认重量材料'});for(const [id,m]of Object.entries(METAL_DENSITIES))select.append(element('option',{value:id},m.name));select.value=settings.defaultMaterial;const label=element('label',{class:'form-field wide'});label.append(element('span',{},'默认材料'),select);form.append(label);
 for(const [id,m]of Object.entries(METAL_DENSITIES)){const row=element('label',{class:'form-field'}),input=element('input',{type:'number',min:'0.000001',max:'30',step:'any',required:'','aria-label':m.name+'密度'});input.value=String(settings.densities[id]);inputs[id]=input;row.append(element('span',{},m.name+' g/cm³'),input);form.append(row);}
 form.append(element('p',{class:'property-footnote wide'},'参考值可按实际合金或供应商数据修改。重量 g = 体积 mm³ × 密度 g/cm³ ÷ 1000；不含电镀、损耗和另装配件。配置保存在工程；同时记住为本浏览器新工程默认值。'));
 const apply=element('button',{type:'submit',class:'primary'},'应用并记住');form.append(button('关闭',closeDialog,'secondary'),apply);form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;apply.disabled=true;try{await emit('materialSettings',{...settings,defaultMaterial:select.value,densities:Object.fromEntries(Object.entries(inputs).map(([id,input])=>[id,Number(input.value)]))});closeDialog();}finally{apply.disabled=false;}});d.append(form);
}
export function renderMaterialProperties(area,body,{state,element,emit}){
 if(!body)return;const settings=validateMaterialSettings(state.document.materialSettings),box=element('div',{class:'property-details'}),select=element('select',{'aria-label':'对象重量材料'}),weight=element('p',{class:'property-footnote'});
 for(const [id,m]of Object.entries(METAL_DENSITIES))select.append(element('option',{value:id},m.name));select.value=settings.bodyMaterials[body.id]??settings.defaultMaterial;
 const show=value=>weight.textContent=value.massGrams===null?'估算重量：需取得有效体积':`估算重量：${value.massGrams.toFixed(3)} g · ${value.densityGcm3} g/cm³`;
 show(materialWeight(body.volume,settings,body.id));select.addEventListener('change',()=>emit('materialSettings',{...settings,bodyMaterials:{...settings.bodyMaterials,[body.id]:select.value}}));
 box.append(element('label',{},'重量材料 '),select,weight);if(body.metricsDeferred||body.volume==null){const calc=element('button',{type:'button'},'计算重量');calc.onclick=async()=>{calc.disabled=true;try{const a=window.webcad.api,r=await a.measureMass({context:a.getState().context,bodyId:body.id});if(r.status==='failed')throw new Error(r.error.message);show(r);}catch(error){weight.textContent=error.message;}finally{calc.disabled=false;}};box.append(calc);}area.append(box);
}
