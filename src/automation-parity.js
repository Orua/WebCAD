import {listPublicToolCards} from './page-api-docs.js';
import {BATCH_METHODS} from './page-batch.js';
import {ADD_STEP_SCHEMA} from './page-input-contracts.js';
import {validateSchema} from './contracts/operation-schema.js';
import {getOperation} from './operation-registry.js';

const DOC_KEYS=new Set(['referenceInstructions','validation','exampleNotes','normalExampleNote']);
function walk(value,path,hits){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach((item,index)=>walk(item,`${path}.${index}`,hits));return;}
  for(const key of Object.keys(value)){
    if(DOC_KEYS.has(key))hits.push(`${path}.${key}`);
    walk(value[key],`${path}.${key}`,hits);
  }
}
function problem(list,error,label){
  list.push(`${label}: ${error.path||''} ${error.message}`);
}
export function assertAutomationParity(){
  const cards=listPublicToolCards(),problems=[];
  for(const card of cards){
    if(card.batchCapable!==BATCH_METHODS.includes(card.id))
      problems.push(`${card.id} batchCapable=${String(card.batchCapable)} but allowlist=${BATCH_METHODS.includes(card.id)}`);
    for(const field of ['minimalExample','normalExample']){
      const example=card[field];
      if(!example)continue;
      const hits=[];
      walk(example,`${card.id}.${field}`,hits);
      if(hits.length)problems.push(hits.join(', '));
      if(example.op&&!['page-method','file','command'].includes(card.category)){
        try{validateSchema(ADD_STEP_SCHEMA,example,`${card.id}.${field}`);}
        catch(error){problem(problems,error,`${card.id}.${field}`);}
        try{validateSchema(getOperation(example.op).inputSchema,example.params,`${card.id}.${field}.params`);}
        catch(error){if(/Unknown field/.test(error.message))problem(problems,error,`${card.id}.${field}.params`);}
      }else if(card.inputSchema){
        try{validateSchema(card.inputSchema,example,`${card.id}.${field}`);}
        catch(error){if(error.message==='Unknown field.'||card.category==='file'||card.id==='run')problem(problems,error,`${card.id}.${field}`);}
      }
    }
  }
  if(problems.length)throw new Error(`Automation parity failed (${problems.length})\n${problems.slice(0,40).join('\n')}`);
  return {toolCount:cards.length,batchMethodCount:BATCH_METHODS.length};
}
