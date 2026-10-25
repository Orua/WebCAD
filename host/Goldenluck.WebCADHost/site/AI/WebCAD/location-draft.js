// Inserts a user-owned location reference into the draft. Never submits a form.
export function createLocationDraftInserter({input,getContext,onReveal=()=>{},onChange=()=>{}}){
  const inserted=new Map();
  const notify=()=>onChange([...inserted.values()]);
  const same=(a,b)=>a&&b&&['sessionId','documentId','documentInstanceId','revision'].every(key=>a[key]===b[key]);
  const insert=async marker=>{
    const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
    if(!marker||typeof marker.id!=='string'||marker.id.length>80||!marker.id||!/^P[1-9]\d{0,6}$/.test(marker.label)||!Array.isArray(marker.point)||marker.point.length!==3||marker.point.some(v=>!Number.isFinite(v)))fail('PARAM_SCHEMA_INVALID','位置标记格式无效。');
    const context=await getContext();
    if(!marker.context||['sessionId','documentId','documentInstanceId','revision'].some(key=>marker.context[key]!==context[key]))fail('STALE_REFERENCE','位置标记所属工程或版本已变化，请重新点击。');
    if([...inserted.values()].some(m=>m.id===marker.id))return {status:'inserted',delivery:'composer',markerId:marker.id,duplicate:true,automaticSend:false};
    if(input.disabled)fail('AGENT_COMPOSER_UNAVAILABLE','当前输入框暂不可编辑，请稍后标记。');
    const at=input.selectionEnd??input.value.length;
    if(inserted.size>=128)fail('SIZE_LIMIT','最多保留128个临时位置，请先发送或删除标记。');
    const text=`【位置${marker.label}】`;
    input.setRangeText(text,at,at,'end');
    inserted.set(marker.label,structuredClone(marker));notify();
    input.dispatchEvent(new Event('input',{bubbles:true}));onReveal();input.focus();
    return {status:'inserted',delivery:'composer',markerId:marker.id,automaticSend:false};
  };
  insert.clear=()=>{inserted.clear();notify();};
  insert.remove=label=>{inserted.delete(label);input.value=input.value.split(`【位置${label}】`).join('');notify();input.dispatchEvent(new Event('input',{bubbles:true}));};
  insert.resolve=async text=>{
    const labels=[...new Set([...text.matchAll(/【位置(P\d+)】/g)].map(m=>m[1]))];if(!labels.length)return text;
    const context=await getContext(),refs=labels.map(label=>{
      const marker=inserted.get(label);if(!same(marker?.context,context))throw Object.assign(new Error(`位置${label}已失效，请删除该标记后重新点击。`),{code:'STALE_REFERENCE'});
      const {text,tooltip,...data}=marker;return data;
    });
    return text+'\n\n位置引用（世界坐标mm，显示表面近似拾取；精确加工前按当前修订查询几何）：\n'+JSON.stringify(refs);
  };
  return insert;
}
