const labels={lengthMm:'线长 mm',radiusMm:'半径 mm',diameterMm:'直径 mm',distanceMm:'点间尺寸 mm',angleDeg:'夹角 °'};
const relation={length:'线长',horizontal:'水平',vertical:'垂直',coincident:'点重合',parallel:'平行',perpendicular:'垂直关系',equalLength:'等长',distance:'点间尺寸',radius:'圆半径',diameter:'圆直径',equalRadius:'等半径',angle:'两线夹角',tangent:'线圆相切',fixPoint:'固定点',fixEntity:'固定图元'};
// Existing constraints keep their entity references and relationship types.
// The ordinary properties panel edits only the dimensions explicitly present.
export function renderConstraintProperties({area,feature,body,element,addField,onEdit,onError}) {
 const form=element('form',{class:'parameter-form'}),controls=[];
 const name=element('input',{name:'name',value:feature.name||'',maxlength:'120','aria-label':'特征名称'});form.append(name);
 for(const [index,constraint]of feature.params.constraints.entries()){
  const ids=constraint.entityId||constraint.firstId||constraint.lineId||constraint.first?.entityId||constraint.point?.entityId||'';
  form.append(element('p',{class:'property-footnote wide'},`${index+1}. ${relation[constraint.type]||constraint.type} · ${ids}`));
  for(const [key,label]of Object.entries(labels))if(constraint[key]!==undefined){const input=addField(form,[`c${index}_${key}`,label,constraint[key]],constraint[key]);controls.push({index,key,input});}
  if(constraint.positionMm)for(const [axis,value]of constraint.positionMm.entries()){const input=addField(form,[`c${index}_point${axis}`,`固定点 ${axis?'Y':'X'} mm`,value],value);controls.push({index,key:'positionMm',axis,input});}
 }
 const report=body?.constraintReport;if(report)area.append(element('p',{class:'property-callout'},`${report.degreesOfFreedom===0?'完全约束':`剩余自由度 ${report.degreesOfFreedom}`} · 最大尺寸残差 ${report.maxResidualMm.toExponential(2)} mm · 最大角度残差 ${report.maxAngularResidualDeg.toExponential(2)}°${report.redundantEquationCount?` · 冗余方程 ${report.redundantEquationCount}`:''}`));
 const submit=element('button',{type:'submit',class:'primary wide'},'应用尺寸');form.append(submit);
 form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;submit.disabled=true;try{const constraints=structuredClone(feature.params.constraints);for(const {index,key,axis,input}of controls){const value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value))throw new Error('请填写有效尺寸。');if(axis!==undefined)constraints[index][key][axis]=value;else constraints[index][key]=value;}await onEdit(feature.id,{constraints},name.value.trim());}catch(error){onError(error.message);}finally{submit.disabled=false;}});
 form.append(element('p',{class:'property-footnote wide'},'修改驱动尺寸后会重建下游特征；冲突或无效几何会保留当前工程。关系类型与图元引用保留。'));area.append(form);return {form,controls};
}
