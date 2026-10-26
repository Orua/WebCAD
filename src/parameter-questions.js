import {validateSchema} from './contracts/operation-schema.js';

const copy=value=>structuredClone(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const valid=(schema,value)=>{try{validateSchema(schema,value);return true;}catch(error){if(!error.code)throw error;return false;}};
export const parameterQuestion=(path,schema={},message)=>({id:path,answerPath:path,label:schema.title||schema.description||path,message:message||'请从用户要求或真实回执补充此项；预检不会修改工程。',input:copy(schema),...(schema.enum?{choices:schema.enum.map(value=>({value,label:String(value)}))}:{})});

// Resolve only branches selected by actual supplied data. Never pick a design
// alternative just because it happens to be the first branch in the catalog.
export function selectedSchemas(schema,value){
 const result=[schema];
 for(const branch of schema.allOf||[])result.push(...selectedSchemas(branch,value));
 for(const branches of [schema.oneOf,schema.anyOf].filter(Boolean)){
  const full=branches.filter(branch=>valid(branch,value));
  if(full.length){if(full.length===1)result.push(...selectedSchemas(full[0],value));continue;}
  const compatible=branches.filter(branch=>!object(value)||Object.entries(branch.properties||{}).every(([key,member])=>value[key]===undefined||(!Object.hasOwn(member,'const')&&!member.enum)||valid(member,value[key])));
  if(compatible.length===1)result.push(...selectedSchemas(compatible[0],value));
  else if(object(value)){
   const used=compatible.filter(branch=>(branch.required||[]).some(key=>value[key]!==undefined));
   if(used.length===1)result.push(...selectedSchemas(used[0],value));
  }
 }
 return result;
}
export function parameterSchema(schema,value,path){
 let current=schema,item=value;
 for(const key of path){const choices=selectedSchemas(current,item);current=Array.isArray(item)?choices.find(s=>s.items)?.items:choices.map(s=>s.properties?.[key]).find(Boolean);item=item?.[key];if(!current)return {};}
 return current;
}
export function parameterQuestions(schema,value,path='params'){
 const out=[],selected=selectedSchemas(schema,value);
 for(const member of selected){
  for(const key of member.required||[])if(!object(value)||value[key]===undefined)out.push(parameterQuestion(`${path}.${key}`,member.properties?.[key]));
  if(Array.isArray(value)&&member.items)value.forEach((item,index)=>out.push(...parameterQuestions(member.items,item,`${path}.${index}`)));
  if(object(value))for(const [key,item]of Object.entries(value))if(member.properties?.[key])out.push(...parameterQuestions(member.properties[key],item,`${path}.${key}`));
  for(const branches of [member.oneOf,member.anyOf].filter(Boolean)){
   if(branches.some(branch=>valid(branch,value))||branches.some(branch=>selected.includes(branch)))continue;
   const discriminators=[...new Set(branches.flatMap(branch=>Object.keys(branch.properties||{})))].filter(key=>branches.every(branch=>Object.hasOwn(branch.properties?.[key]||{},'const')));
   if(discriminators.length&&object(value)&&value[discriminators[0]]===undefined){const key=discriminators[0];out.push(parameterQuestion(`${path}.${key}`,{enum:branches.map(branch=>branch.properties[key].const)},'请选择明确的类型，再按该类型补充参数。'));continue;}
   const alternatives=branches.map(branch=>({required:(branch.required||[]).map(key=>`${path}.${key}`),input:copy(branch)}));
   out.push({...parameterQuestion(path,{},'请选择并补齐一种输入方式；不要同时混入互斥的来源。'),alternatives,answerPaths:[...new Set(alternatives.flatMap(branch=>branch.required))]});
  }
 }
 return [...new Map(out.map(q=>[q.answerPath,q])).values()];
}
export function fillParameterConstants(schema,value,path='params'){
 const filled=[];
 for(const member of selectedSchemas(schema,value)){
  if(object(value))for(const [key,field]of Object.entries(member.properties||{})){
   if(value[key]===undefined&&Object.hasOwn(field,'const')){value[key]=copy(field.const);filled.push({field:`${path}.${key}`,value:copy(field.const),reason:'当前契约规定的唯一常量'});}
   else if(value[key]!==undefined)filled.push(...fillParameterConstants(field,value[key],`${path}.${key}`));
  }
  if(Array.isArray(value)&&member.items)value.forEach((item,index)=>filled.push(...fillParameterConstants(member.items,item,`${path}.${index}`)));
 }
 return filled;
}
export function normalizeUnitAliases(schema,value,path='params'){
 const filled=[],properties=Object.assign({},...selectedSchemas(schema,value).map(s=>s.properties||{}));
 for(const key of Object.keys(value)){
  if(!key.endsWith('Mm')||properties[key])continue;
  const canonical=key.slice(0,-2),field=properties[canonical];
  if(!field||field.unit!=='mm'||![field,...(field.oneOf||[])].some(member=>member.type==='number'))continue;
  if(value[canonical]!==undefined&&value[canonical]!==value[key])throw Object.assign(Error(`${key}与${canonical}冲突，请只使用一致的毫米值。`),{code:'PARAM_SCHEMA_INVALID',path:`${path}.${key}`});
  value[canonical]=value[key];delete value[key];filled.push({field:`${path}.${canonical}`,value:copy(value[canonical]),reason:`${key}按当前契约的毫米单位映射；没有换算或猜测尺寸`});
 }
 return filled;
}
export function answerParameter(base,path,value,roots){
 const parts=path.split('.');
 if(!roots.includes(parts[0])||parts.length>25||parts.some(key=>!/^([A-Za-z][A-Za-z0-9_]*|[0-9]{1,5})$/.test(key)||['__proto__','constructor','prototype'].includes(key)))throw Object.assign(Error('Unsafe or unknown answer path'),{code:'PARAM_SCHEMA_INVALID',path});
 let target=base;
 for(let i=0;i<parts.length-1;i++){const key=parts[i];target=target[key]??=(/^\d+$/.test(parts[i+1])?[]:{});}
 target[parts.at(-1)]=copy(value);
}
