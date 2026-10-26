import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {listPublicToolCards,getTool,infoMetadata} from '../src/page-api-docs.js';
import {createToolCallPreparation} from '../src/tool-call-preparation.js';
import {createOperationPreparation} from '../src/prepared-operations.js';
import {normalizeOperationParams,normalizeOperationPatch} from '../src/operation-registry.js';

// Structural audit only. A write/compute callback is intentionally forbidden.
export async function auditToolPreparation(){
 const context={sessionId:'audit',documentId:'audit',documentInstanceId:'audit',revision:0},cards=listPublicToolCards(),rows=[];let writes=0;
 for(const card of cards){
  const state=()=>({context,bodies:[],features:[]});
  const preflight=createToolCallPreparation({state,getCard:getTool,normalizePatch:normalizeOperationPatch});
  const result=await preflight({toolId:card.id,args:{}});
  const row={id:card.id,category:card.category,preparation:card.preparation.method,status:result.status,reason:result.reason??null,questions:result.questions?.map(q=>q.answerPath)??[],schema:!!(card.inputSchema||card.preparationSchema),geometryValidated:false,lunaValidated:false};
  if(card.refsSchema&&!['import','remove'].includes(card.id)){
   const refs=Array.from({length:card.refsSchema.minItems},(_,i)=>`fixture-${i}`);
   const source=()=>({context,bodies:refs.map(id=>({id})),features:[]});
   const flow=createOperationPreparation({state:source,getCard:getTool,normalize:normalizeOperationParams,execute:()=>{writes++;throw Error('Audit must not execute');},logoDrafts:()=>[],queryFaces:async()=>({status:'read',items:[{topologyId:0,surfaceType:'plane',planar:true,center:[0,0,1]}]}),pointOnFace:async()=>({status:'read',distanceMm:0})});
   const example=await flow.prepare({op:card.id,refs,params:card.minimalExample.params});row.exampleStatus=example.status;row.exampleQuestions=example.questions?.map(q=>q.answerPath)??[];
  }
  rows.push(row);
 }
 const issues=rows.filter(row=>!row.preparation||row.reason==='PREPARATION_CONTRACT_MISSING'||!['prepared','needs_input','routed','guidance','blocked'].includes(row.status));
 const report={capturedAt:new Date().toISOString(),pageApiVersion:infoMetadata().pageApiVersion,scope:'All published cards; input preparation only, no kernel/Services/document mutation.',total:rows.length,addableOperations:rows.filter(row=>row.exampleStatus&&row.category!=='template').length,templates:rows.filter(row=>row.exampleStatus&&row.category==='template').length,statusCounts:rows.reduce((counts,row)=>(counts[row.status]=(counts[row.status]??0)+1,counts),{}),writes,issues,rows};
 if(writes||issues.length)throw Error(`Preparation coverage failed: ${issues.map(x=>x.id).join(',')}`);
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=await auditToolPreparation();if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined}));}
