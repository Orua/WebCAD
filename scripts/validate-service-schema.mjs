import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
// Intentionally limited to the keywords in our structural service envelopes.
// Reject unsupported keywords rather than pretending to validate all JSON Schema.
const keywords=new Set(['$schema','$id','$defs','$ref','title','type','required','additionalProperties','properties','enum','const','items','minItems','maxItems','minLength','maxLength','pattern','exclusiveMinimum']);
export async function validateServiceSchema(value,file){
 const schemas=new Map();
 async function load(file){file=path.resolve(file);if(!schemas.has(file))schemas.set(file,JSON.parse(await fs.readFile(file,'utf8')));return schemas.get(file);}
 async function check(value,schema,file,at){
  for(const key of Object.keys(schema))if(!keywords.has(key))throw new Error(`Unsupported structural schema keyword ${key}`);
  if(schema.$ref){const [name,fragment='']=schema.$ref.split('#'),target=name?path.resolve(path.dirname(file),name):file;let referred=await load(target);for(const part of fragment.split('/').filter(Boolean))referred=referred[part.replaceAll('~1','/').replaceAll('~0','~')];if(!referred)throw new Error(`Unresolved schema ${schema.$ref}`);return check(value,referred,target,at);}
  const type=value===null?'null':Array.isArray(value)?'array':typeof value;
  if(schema.type){const allowed=Array.isArray(schema.type)?schema.type:[schema.type];if(!allowed.includes(type))throw new Error(`${at}: type ${type}`);}
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`${at}: nonfinite`);
  if(Object.hasOwn(schema,'const')&&!isDeepStrictEqual(value,schema.const))throw new Error(`${at}: constant mismatch`);
  if(schema.enum&&!schema.enum.some(v=>isDeepStrictEqual(v,value)))throw new Error(`${at}: enum mismatch`);
  if(typeof value==='number'&&schema.exclusiveMinimum!==undefined&&value<=schema.exclusiveMinimum)throw new Error(`${at}: number below boundary`);
  if(typeof value==='string'){if(schema.minLength!==undefined&&value.length<schema.minLength||schema.maxLength!==undefined&&value.length>schema.maxLength||schema.pattern&&!new RegExp(schema.pattern).test(value))throw new Error(`${at}: invalid string`);}
  if(Array.isArray(value)){if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)throw new Error(`${at}: array size`);if(schema.items)for(let i=0;i<value.length;i++)await check(value[i],schema.items,file,`${at}[${i}]`);}
  else if(value&&typeof value==='object'){for(const key of schema.required||[])if(!Object.hasOwn(value,key))throw new Error(`${at}: missing ${key}`);for(const [key,item]of Object.entries(value)){if(schema.properties?.[key])await check(item,schema.properties[key],file,`${at}.${key}`);else if(schema.additionalProperties===false)throw new Error(`${at}: unexpected ${key}`);}}
 }
 const absolute=path.resolve(file);await check(value,await load(absolute),absolute,'$');
}
