// Explicit object/field projections keep parameter reads away from unrelated geometry.
const unsafe=new Set(['__proto__','prototype','constructor']);
export const STATE_QUERY_KEYS=['featureIds','featureFields','bodyIds','bodyFields'];
export function validateStateProjection(input){
  for(const key of STATE_QUERY_KEYS){
    const values=input[key];if(values===undefined)continue;
    if(!Array.isArray(values)||!values.length||values.length>50||new Set(values).size!==values.length||values.some(value=>typeof value!=='string'||!value.length||value.length>160||value.split('.').some(part=>!part||unsafe.has(part))))
      throw Object.assign(new Error(`${key} requires 1..50 unique IDs or safe field paths`),{code:'PARAM_SCHEMA_INVALID',path:key});
  }
}
export function projectRow(row,fields){
  if(!fields)return structuredClone(row);
  const out={...(row.id!==undefined?{id:row.id}:{})};
  for(const field of fields){
    const parts=field.split('.');let value=row;
    for(const part of parts){if(!value||typeof value!=='object'||!Object.hasOwn(value,part)){value=undefined;break;}value=value[part];}
    if(value===undefined)continue;
    let target=out;for(const part of parts.slice(0,-1))target=target[part]??={};
    target[parts.at(-1)]=structuredClone(value);
  }
  return out;
}
export function projectStateRows(rows,ids,fields){return rows.filter(row=>!ids||ids.includes(row.id)).map(row=>projectRow(row,fields));}
