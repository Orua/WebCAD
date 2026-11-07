// Bounded native Responses SSE reader. Reasoning/delta frames are never retained.
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(value)?value:null;
export function safeProviderError(value,{secrets=[]}={}){
 const error=value?.error??value?.response?.error??value;
 let message=typeof error?.message==='string'?error.message:typeof value?.detail==='string'?value.detail:null;
 if(message){
  for(const secret of secrets)if(typeof secret==='string'&&secret.length>3)message=message.split(secret).join('[REDACTED]');
  message=message.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [REDACTED]').replace(/([?&](?:token|key|grant|ticket)=)[^&\s"']+/gi,'$1[REDACTED]').replace(/((?:api[_-]?key|password|authorization|cookie)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]').replace(/https?:\/\/[^\s/@:]+:[^\s/@]+@/gi,'https://[REDACTED]@').replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,'[REDACTED]').replace(/[\r\n\x00-\x1f]+/g,' ').slice(0,384);
 }
 return {code:identifier(error?.code),type:identifier(error?.type),param:identifier(error?.param),message};
}
function failure(code,providerError){return Object.assign(Error(code),{code,...(providerError?{providerError}:{})});}
function projectResponse(response){
 if(!response||typeof response!=='object'||!Array.isArray(response.output))throw failure('MODEL_SSE_TERMINAL_RESPONSE_INVALID');
 const output=[];
 for(const item of response.output){
  if(item.type==='function_call')output.push({type:'function_call',call_id:item.call_id,name:item.name,arguments:item.arguments,status:item.status});
  else if(item.type==='message')output.push({type:'message',content:(item.content??[]).filter(part=>part.type==='output_text').map(part=>({type:'output_text',text:part.text}))});
 }
 const raw=response.usage;
 const number=value=>Number.isFinite(value)&&value>=0?value:null;
 return {id:typeof response.id==='string'?response.id.slice(0,160):null,model:typeof response.model==='string'?response.model:null,status:response.status,output,usage:raw?{total_tokens:number(raw.total_tokens),input_tokens:number(raw.input_tokens),output_tokens:number(raw.output_tokens),input_tokens_details:{cached_tokens:number(raw.input_tokens_details?.cached_tokens)},cost:number(raw.cost)}:null,incomplete_details:response.incomplete_details?{reason:identifier(response.incomplete_details.reason)}:null};
}
export async function readResponsesSse(response,{signal,secrets=[],allowMissingContentType=false,maxBytes=8*1024*1024,maxFrameChars=1024*1024,maxEvents=10000}={}){
 if(!Number.isInteger(maxBytes)||maxBytes<1||!Number.isInteger(maxFrameChars)||maxFrameChars<1||!Number.isInteger(maxEvents)||maxEvents<1)throw failure('MODEL_SSE_LIMITS_INVALID');
 const contentType=response.headers?.get('content-type')??'';
 // Some existing native account transports omit this header. Still require a
 // valid bounded SSE stream and a complete terminal response; JSON/HTML do not pass.
 if(!/text\/event-stream/i.test(contentType)&&!(allowMissingContentType&&!contentType))throw failure('MODEL_SSE_CONTENT_TYPE_REQUIRED');
 const reader=response.body?.getReader();if(!reader)throw failure('MODEL_SSE_STREAM_REQUIRED');
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let text='',data=[],eventName='',frameChars=0,bytes=0,events=0,terminal=null,doneMarker=false;
 const abort=()=>{void reader.cancel('aborted').catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 function dispatch(){
  if(!data.length){eventName='';frameChars=0;return;}
  if(++events>maxEvents)throw failure('MODEL_SSE_EVENT_LIMIT');
  const payload=data.join('\n');data=[];frameChars=0;
  const name=eventName;eventName='';
  if(payload==='[DONE]'){doneMarker=true;return;}
  let item;try{item=JSON.parse(payload);}catch{throw failure('MODEL_SSE_JSON_INVALID');}
  const type=item.type??name;
  if(type==='error'||type==='response.failed')throw failure(type==='error'?'MODEL_SSE_ERROR':'MODEL_SSE_FAILED',safeProviderError(item,{secrets}));
  if(type==='response.completed'||type==='response.incomplete'){
   if(terminal)throw failure('MODEL_SSE_DUPLICATE_TERMINAL');
   terminal=projectResponse(item.response);
   if(type==='response.completed'&&terminal.status!=='completed'||type==='response.incomplete'&&terminal.status!=='incomplete')throw failure('MODEL_SSE_TERMINAL_STATUS_MISMATCH');
  }
  // Other events, including all reasoning and output deltas, are intentionally discarded.
 }
 function line(value){
  if(value.length>maxFrameChars)throw failure('MODEL_SSE_LINE_LIMIT');
  if(!value){dispatch();return;}
  if(value.startsWith(':'))return;
  const colon=value.indexOf(':'),field=colon<0?value:value.slice(0,colon);
  let valueText=colon<0?'':value.slice(colon+1);if(valueText.startsWith(' '))valueText=valueText.slice(1);
  if(field==='event')eventName=valueText;
  if(field==='data'){frameChars+=valueText.length;if(frameChars>maxFrameChars)throw failure('MODEL_SSE_FRAME_LIMIT');data.push(valueText);}
 }
 function consume(final=false){
  for(;;){
   const match=/[\r\n]/.exec(text);if(!match)break;
   const index=match.index,separator=text[index];
   if(separator==='\r'&&index===text.length-1&&!final)break;
   const next=separator==='\r'&&text[index+1]==='\n'?2:1;
   const value=text.slice(0,index);text=text.slice(index+next);line(value);
  }
  if(text.length>maxFrameChars)throw failure('MODEL_SSE_LINE_LIMIT');
  if(final){if(text)line(text);text='';dispatch();}
 }
 try{
  signal?.throwIfAborted();
  for(;;){
   signal?.throwIfAborted();const chunk=await reader.read();signal?.throwIfAborted();
   if(chunk.done)break;
   bytes+=chunk.value.byteLength;if(bytes>maxBytes)throw failure('MODEL_SSE_BYTE_LIMIT');
   text+=decoder.decode(chunk.value,{stream:true});consume();
  }
  text+=decoder.decode();consume(true);signal?.throwIfAborted();
  if(!terminal)throw failure(doneMarker?'MODEL_SSE_DONE_WITHOUT_TERMINAL':'MODEL_SSE_TERMINAL_MISSING');
  return {...terminal,streamEvidence:{terminalReceived:true,events,bytes,doneMarker}};
 }finally{signal?.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
