import {validateReliefDesign} from '../../relief-design-drafts.js';
const fail=message=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID'});};
export const DESIGN_EDIT_LABELS=Object.freeze({raise:'抬高',lower:'压低',flatten:'定高',smooth:'平滑'});
export function authoredDesignEdit({mode,centerMm,radiusMm,strength,amountMm,targetMm},previous){
 if(!Object.hasOwn(DESIGN_EDIT_LABELS,mode))fail('请选择有效的局部编辑模式。');
 if(!Array.isArray(centerMm)||centerMm.length!==2||!centerMm.every(v=>Number.isFinite(v)&&Math.abs(v)<=10000))fail('笔画中心需要明确的 X / Y 毫米坐标。');
 if(!Number.isFinite(radiusMm)||radiusMm<.001||radiusMm>10000)fail('笔画半径需为 0.001–10000 mm。');
 if(!Number.isFinite(strength)||strength<0||strength>1)fail('笔画强度需在 0–1 之间。');
 const edit={...previous,mode,centerMm:[...centerMm],radiusMm,strength};
 if(['raise','lower'].includes(mode)){if(!Number.isFinite(amountMm)||amountMm<0||amountMm>100)fail('增减量需为 0–100 mm。');edit.amountMm=amountMm;}
 if(mode==='flatten'){if(!Number.isFinite(targetMm)||targetMm< -100||targetMm>100)fail('目标高度需为 -100–100 mm。');edit.targetMm=targetMm;}
 return edit;
}
export function changeDesignEdit(draft,{operation,index,edit}){
 const current=validateReliefDesign(draft),edits=structuredClone(current.fieldSettings?.edits??[]);
 if(operation==='append'){if(edits.length>=256)fail('设计草稿最多保留256笔局部编辑。');edits.push(authoredDesignEdit(edit));}
 else if(['replace','remove'].includes(operation)){
  if(!Number.isSafeInteger(index)||index<0||index>=edits.length)fail('请先选择当前列表中的一笔。');
  if(operation==='remove')edits.splice(index,1);else edits[index]=authoredDesignEdit(edit,edits[index]);
 }else fail('不支持的笔画列表操作。');
 return validateReliefDesign({...current,fieldSettings:{...current.fieldSettings,edits}});
}
export function designEditSummary(edit,index){
 const quantity=['raise','lower'].includes(edit.mode)?`量 ${edit.amountMm??'未填'} mm`:edit.mode==='flatten'?`目标 ${edit.targetMm??'未填'} mm`:'一遍局部平滑';
 return `${index+1}. ${DESIGN_EDIT_LABELS[edit.mode]} · 中心 ${edit.centerMm.join(', ')} · R ${edit.radiusMm} mm · ${quantity} · 强度 ${edit.strength??1}`;
}
