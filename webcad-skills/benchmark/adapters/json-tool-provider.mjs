// Generic tool-calling HTTP transport. Credentials remain in this closure only.
// No configuration discovery, default provider, model alias guessing or retries.
const methods=['run','getState','readDocs','getTools','getTool','searchTools','measure','queryGeometry','inspectDesign','getHistory'];
const tool={type:'function',function:{name:'webcad_call',description:'Call a public WebCAD method. For a modeling run, provide explicit bounded args.steps from the current tool cards. Preserve dimensions. Read original receipts after unknown outcomes.',parameters:{type:'object',properties:{method:{type:'string',enum:methods},args:{type:'object',additionalProperties:true}},required:['method','args'],additionalProperties:false}}};
function messagesForProvider(messages){
 return messages.map(message=>message.role==='tool'?{role:'tool',tool_call_id:message.toolCallId,content:message.content}:message.role==='assistant'?{role:'assistant',content:message.content||null,...(message.toolCalls?.length?{tool_calls:message.toolCalls.map(call=>({id:call.id,type:'function',function:{name:call.name,arguments:typeof call.arguments==='string'?call.arguments:JSON.stringify(call.arguments)}}))}:{})}:{role:message.role,content:message.content});
}
export function createJsonToolProvider({endpoint,modelId,provider,reasoning,contextBudget,authorized=false,authorization,fetchImpl=globalThis.fetch,maxOutputTokens=4096}={}){
 const url=new URL(endpoint);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||!modelId||!provider||!reasoning||!Number.isInteger(contextBudget)||contextBudget<1||!Number.isInteger(maxOutputTokens)||maxOutputTokens<1)throw Error('EXPLICIT_PROVIDER_CONFIGURATION_REQUIRED');
 if(!authorized)throw Error('EXISTING_MODEL_AUTHORIZATION_REQUIRED');
 return Object.freeze({authorized:true,identity:{provider,modelId,reasoning,contextBudget},
  async request({model,messages,remainingBudget,signal}){
   signal?.throwIfAborted();
   if(model!==modelId)throw Error('MODEL_ID_MISMATCH');
   if(!Number.isInteger(remainingBudget?.tokens)||remainingBudget.tokens<1||!Number.isFinite(remainingBudget?.cost)||remainingBudget.cost<0)throw Error('FROZEN_USAGE_BUDGET_REQUIRED');
   const headers={'Content-Type':'application/json'};
   if(authorization)headers.Authorization=authorization;
   const response=await fetchImpl(url,{method:'POST',headers,signal,body:JSON.stringify({model:modelId,reasoning_effort:reasoning,messages:messagesForProvider(messages),tools:[tool],tool_choice:'auto',max_tokens:Math.min(maxOutputTokens,remainingBudget.tokens)})});
   if(!response.ok)throw Object.assign(Error('MODEL_HTTP_'+response.status),{code:'MODEL_HTTP_'+response.status});
   const body=await response.json();
   if(body.model&&body.model!==modelId)throw Error('ACTUAL_MODEL_ID_MISMATCH');
   const message=body.choices?.[0]?.message;
   if(!message)throw Error('MODEL_MESSAGE_MISSING');
   const toolCalls=(message.tool_calls??[]).map(call=>{
    if(call.type!=='function'||call.function?.name!=='webcad_call'||typeof call.id!=='string')throw Error('MODEL_TOOL_CALL_INVALID');
    return {id:call.id,name:call.function.name,arguments:JSON.parse(call.function.arguments)};
   });
   // Hidden reasoning, headers, provider errors and credentials never leave the adapter.
   return {text:typeof message.content==='string'?message.content:'',toolCalls,actualModelId:body.model??null,usage:{totalTokens:Number.isInteger(body.usage?.total_tokens)?body.usage.total_tokens:null,cost:Number.isFinite(body.usage?.cost)?body.usage.cost:null,source:'provider-response'}};
  },
 });
}
