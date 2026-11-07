// Responses transport for an existing authorized provider; bridge routing is transparent.
// Endpoint/authorization/model/effort are runtime inputs; no discovery or retries.
import {readResponsesSse,safeProviderError} from './responses-sse.mjs';
const tools=[{type:'function',name:'webcad_call',description:'Use a public WebCAD method, or the host-only sampleCoordinates arithmetic helper. sampleCoordinates takes args.coordinates as three math-expression strings [x,y,z] and args.axes as one or two objects {name,min,max,count}. It uses the application bounded expression parser with + - * / ^, pi, sin/cos/tan/sqrt/abs/min/max; it returns numeric points, never geometry. One axis samples a curve (up to64); two axes sample a grid (each up to12, first axis rows). Use it to calculate deterministic coordinates from source equations and control-point formulas. For run, args.steps contains bounded public steps from the current tool cards. readDocs uses args.docId; getTools requires args.ids as an array of exact tool IDs, and searchTools uses args.query. Use files.export with format and ids to export geometry, or files.save with optional name (no format field) to save the project. Exported bytes are materialized on host storage; files.read/download return their verified descriptor, hash and host file, without injecting binary bytes into model context. After your final response the host automatically imports STEP into a separate document and independently verifies the bytes and geometry. Do not open or replace the modeling document for that check. Preserve source dimensions. execute is restricted to action history.undo or history.redo with empty args; all other writes use run. Parameter validation errors can be corrected after confirming no commit. After an actual geometry failure, a new candidate requires args.alternativeMechanism explaining the new mechanism evidence. Inspect unknown receipts instead of resubmitting.',parameters:{type:'object',properties:{method:{type:'string',enum:['run','execute','getState','readDocs','getTools','getTool','searchTools','measure','queryGeometry','inspectDesign','getHistory','getDebugReport','files.capabilities','files.export','files.save','files.read','files.download','sampleCoordinates']},args:{type:'object',additionalProperties:true}},required:['method','args'],additionalProperties:false},strict:false}];
function inputMessages(messages){
 return messages.flatMap(message=>{
  if(message.role==='tool')return [{type:'function_call_output',call_id:message.toolCallId,output:message.content}];
  if(message.role==='assistant')return [...(message.content?[{role:'assistant',content:message.content}]:[]),...(message.toolCalls??[]).map(call=>({type:'function_call',call_id:call.id,name:call.name,arguments:typeof call.arguments==='string'?call.arguments:JSON.stringify(call.arguments)}))];
  return [{role:message.role,content:message.content}];
 });
}
async function boundedHttpError(response,{signal,secrets}){
 const reader=response.body?.getReader();if(!reader)return null;
 const chunks=[];let length=0;
 try{
  for(;;){signal?.throwIfAborted();const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096)return {code:null,type:null,param:null,message:null,truncated:true};chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return safeProviderError(JSON.parse(new TextDecoder().decode(bytes)),{secrets});}catch{return null;}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createResponsesProvider({endpoint,modelId,provider,reasoning,contextBudget,authorized=false,authorization,usageMeter,maxOutputTokens=1024,nativeRequestTokenUpperBound=null,nativeBoundSource=null,fetchImpl=globalThis.fetch}={}){
 const url=new URL(endpoint);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||!modelId||!provider||!reasoning||!Number.isInteger(contextBudget)||contextBudget<1||!Number.isInteger(maxOutputTokens)||maxOutputTokens<1||!usageMeter?.begin||!usageMeter?.finish)throw Error('EXPLICIT_RESPONSES_PROVIDER_AND_USAGE_METER_REQUIRED');
 if(!authorized)throw Error('EXISTING_MODEL_AUTHORIZATION_REQUIRED');
 return Object.freeze({authorized:true,identity:{provider,modelId,reasoning,contextBudget,maxOutputTokens,outputLimitEnforcement:usageMeter.configuration?.mode==='native-account-usage-only'?'observation-only; provider-managed-output':'client-terminal-usage-check',nativeRequestTokenUpperBound,nativeBoundSource,transport:provider==='native_codex'?'native-responses-sse':'responses-sse',accounting:usageMeter.configuration},
  async request({model,messages,remainingBudget,signal}){
   signal?.throwIfAborted();if(model!==modelId)throw Error('MODEL_ID_MISMATCH');
   const observationOnly=usageMeter.configuration?.mode==='native-account-usage-only';
   if(!observationOnly){
    if(!Number.isInteger(remainingBudget?.tokens)||remainingBudget.tokens<1)throw Error('FROZEN_TOKEN_BUDGET_REQUIRED');
    if(!Number.isInteger(nativeRequestTokenUpperBound)||nativeRequestTokenUpperBound<1||!nativeBoundSource)throw Error('NATIVE_REQUEST_TOKEN_BOUND_NOT_VERIFIED');
    if(nativeRequestTokenUpperBound>remainingBudget.tokens)throw Error('TOTAL_BUDGET_EXHAUSTED_BEFORE_REQUEST');
   }
   const outputLimit=observationOnly?maxOutputTokens:Math.min(maxOutputTokens,remainingBudget.tokens);
   const instructions=messages.filter(message=>message.role==='system').map(message=>message.content).join('\n\n');
   const body={model:modelId,instructions,input:inputMessages(messages.filter(message=>message.role!=='system')),tools,reasoning:{effort:reasoning},stream:true,store:false};
   const ticket=usageMeter.begin({wireBody:body,outputTokenLimit:outputLimit,messageCount:messages.length,totalTokenUpperBound:nativeRequestTokenUpperBound});
   let accounted=false;
   try{
    const headers={'Content-Type':'application/json','Accept':'text/event-stream'};if(authorization)headers.Authorization=authorization;
    const response=await fetchImpl(url,{method:'POST',headers,signal,body:JSON.stringify(body)});
    const secrets=typeof authorization==='string'?[authorization,authorization.replace(/^Bearer\s+/i,'')]:[];
    if(!response.ok)throw Object.assign(Error('MODEL_HTTP_'+response.status),{code:'MODEL_HTTP_'+response.status,providerError:await boundedHttpError(response,{signal,secrets})});
    const data=await readResponsesSse(response,{signal,secrets,allowMissingContentType:provider==='native_codex'});
    const usage={totalTokens:Number.isInteger(data.usage?.total_tokens)?data.usage.total_tokens:null,inputTokens:Number.isInteger(data.usage?.input_tokens)?data.usage.input_tokens:null,cachedInputTokens:Number.isInteger(data.usage?.input_tokens_details?.cached_tokens)?data.usage.input_tokens_details.cached_tokens:null,outputTokens:Number.isInteger(data.usage?.output_tokens)?data.usage.output_tokens:null,cost:Number.isFinite(data.usage?.cost)?data.usage.cost:null,source:'provider-response'};
    const budgetMeter=usageMeter.finish(ticket,usage);accounted=true;
    if(data.model&&data.model!==modelId)throw Object.assign(Error('ACTUAL_MODEL_ID_MISMATCH'),{requestedModelId:modelId,actualModelId:data.model});
    const output=data.output??[];
    const text=output.filter(item=>item.type==='message').flatMap(item=>item.content??[]).filter(item=>item.type==='output_text').map(item=>item.text).join('\n');
    const toolCalls=output.filter(item=>item.type==='function_call').map(call=>{
     if(call.name!=='webcad_call'||!call.call_id)throw Error('MODEL_TOOL_CALL_INVALID');
     if(call.status&&call.status!=='completed')throw Error('MODEL_TOOL_CALL_NOT_COMPLETED');
     return {id:call.call_id,name:call.name,arguments:JSON.parse(call.arguments)};
    });
    // Reasoning output items and hidden reasoning are deliberately not exposed.
    const contextExceeded=!observationOnly&&usage.inputTokens!==null&&usage.outputTokens!==null&&usage.inputTokens+usage.outputTokens>contextBudget;
    const outputExceeded=!observationOnly&&usage.outputTokens!==null&&usage.outputTokens>outputLimit;
    return {text,toolCalls,usage,budgetMeter,responseId:data.id??null,actualModelId:data.model??null,transportStatus:contextExceeded?'context_budget_exceeded':outputExceeded?'output_budget_exceeded':data.status??'unknown',incompleteReason:data.incomplete_details?.reason??null,streamEvidence:data.streamEvidence};
   }catch(error){if(!accounted)usageMeter.abandon(ticket);error.budgetSnapshot=usageMeter.snapshot();throw error;}
  },
 });
}
