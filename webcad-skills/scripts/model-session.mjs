import {load} from './load.mjs';
import {createHash} from 'node:crypto';
// Model and tool adapters are injected by an authorized host; never read keys here.
export async function modelSession({task,group,modelId,toolIdentity,initialStateId,model,execute,record,judge,maxRounds=6}){
 if(!['A','B'].includes(group)||!modelId||!toolIdentity||!initialStateId)throw Error('Missing experiment controls');
 const context=group==='B'?await load(task):{content:'',files:[]};
 const messages=[{role:'system',content:'Use authorized WebCAD tools. Preserve source dimensions and inspect uncertain outcomes.\n'+context.content},{role:'user',content:task}];
 const controls={group,modelId,toolIdentity,initialStateId,maxRounds};let calls=0;const started=Date.now();
 for(let round=0;round<maxRounds;round++){
  await record({event:'model-request',...controls,round,knowledgeFiles:context.files,knowledgeSha256:createHash('sha256').update(context.content).digest('hex'),messages:structuredClone(messages)});
  const response=await model({model:modelId,messages:structuredClone(messages)});await record({event:'model-response',round,response});messages.push({role:'assistant',content:response.text??'',...(response.toolCalls?.length?{toolCalls:response.toolCalls}:{})});
  if(!response.toolCalls?.length)return judge({response,calls,elapsedMs:Date.now()-started,controls});
  for(const call of response.toolCalls){calls++;const result=await execute(call);await record({event:'tool-result',round,call,result});messages.push({role:'tool',toolCallId:call.id,content:JSON.stringify(result)});}
 }
 return {status:'budget_exhausted',calls,elapsedMs:Date.now()-started};
}
