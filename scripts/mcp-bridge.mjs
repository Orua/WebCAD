import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { operationCatalog } from '../src/operation-catalog.js';
import { bootstrap, searchTools, getTool, readDocs } from '../src/ai-docs.js';
import { createDocumentAssets } from './document-assets.mjs';

export function localRequestAllowed(req, { requireOrigin=false }={}) {
  const port=req.socket.localPort;
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return false;
  const origin=req.headers.origin;
  if(!origin)return !requireOrigin;
  return [`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin);
}
const errorResult=error=>({isError:true,content:[{type:'text',text:JSON.stringify({error:error.message||String(error)})}]});
const textResult=data=>({content:[{type:'text',text:JSON.stringify(data??null)}]});
const id=z.string().min(1).max(150);
const revision=z.number().int().nonnegative();
const jsonObject=z.record(z.string(),z.json());
const base={sessionId:id};
const modify={...base,expectedRevision:revision};
const schemas={
 get_state:base,
 get_templates:base,
 inspect_geometry:{...base,bodyId:id,kind:z.enum(['face','edge']),topologyId:z.number().int().nonnegative()},
 add_feature:{...modify,op:z.string().min(1).max(60),params:jsonObject,refs:z.array(id).max(200).optional(),name:z.string().max(120).optional()},
 edit_feature:{...modify,featureId:id,params:jsonObject,name:z.string().max(120).optional()},
 remove:{...modify,ids:z.array(id).min(1).max(200)},
 select:{...modify,ids:z.array(id).max(200)},
 undo:modify,redo:modify,refresh:modify,
 export:{...modify,format:z.enum(['step','stl','brep']),ids:z.array(id).max(200).optional()},
 apply_template:{...modify,templateId:z.string().min(1).max(100),params:jsonObject.optional()}
};
const descriptions={get_state:'Read the current model revision, feature history, bodies and selection. Use this before every edit.',get_templates:'List supported parameterized product templates.',add_feature:'Create a dimensioned modeling feature using an existing WebCAD operation.',edit_feature:'Edit parameters of a feature and rebuild its dependent model.',remove:'Remove selected body IDs through an undoable feature.',select:'Select body IDs in the browser.',undo:'Undo the last document edit.',redo:'Redo the last undone edit.',refresh:'Rebuild and refresh the model; waits for geometry completion.',export:'Export exact STEP/BREP or mesh STL through the browser. Result contains {encoding:base64,data,mime,extension}. Save using your client; no server filesystem access.',apply_template:'Create a supported product template using the same browser modeling actions.'};

// Only the new contract is strict: legacy schemas and JSON text results stay compatible.
const strict=shape=>z.object(shape).strict();
const cursor=z.string().min(1).max(2048);
const version=z.string().min(1).max(150);
const context=strict({sessionId:id,documentId:id,documentInstanceId:id,expectedRevision:revision});
const snapshot=strict({sessionId:id,documentId:id,documentInstanceId:id,revision});
const uniqueIds=z.array(id).min(1).max(200).refine(xs=>new Set(xs).size===xs.length,'IDs must be unique');
const range=strict({min:z.number().finite().nonnegative().optional(),max:z.number().finite().nonnegative().optional()})
 .refine(x=>x.min!==undefined||x.max!==undefined,'A range needs min or max')
 .refine(x=>x.min===undefined||x.max===undefined||x.min<=x.max,'min must not exceed max');
const faceFilter=strict({surfaceType:z.literal('plane').optional(),normal:strict({direction:z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]).refine(v=>v.some(x=>x!==0),'Direction must be nonzero'),sameDirection:z.boolean().optional(),angleToleranceDeg:z.number().finite().min(0).max(180).optional()}).optional(),atExtreme:strict({axis:z.enum(['X','Y','Z']),side:z.enum(['min','max']),toleranceMm:z.number().finite().nonnegative().optional()}).optional()});
const edgeFilter=strict({curveType:z.enum(['line','circle']).optional(),lengthRangeMm:range.optional(),radiusRangeMm:range.optional(),onFaceToken:cursor.optional()});
const actionSchemas={
 'feature.add':strict({op:z.string().min(1).max(60),opVersion:version,schemaHash:id,params:jsonObject,refs:z.array(id).max(200),name:z.string().max(120).optional(),selectionToken:cursor.optional()}),
 'feature.edit':strict({featureId:id,opVersion:version,schemaHash:id,params:jsonObject,name:z.string().max(120).optional()}),
 'feature.remove':strict({bodyIds:uniqueIds}),
 'history.undo':strict({}),'history.redo':strict({}),'document.refresh':strict({})
};
const actionNames=Object.keys(actionSchemas);
const v2Schemas={
 bootstrap:strict({}),
 search_tools:strict({query:z.string().max(500),category:z.string().min(1).max(150).optional(),limit:z.number().int().min(1).max(50).default(10),cursor:cursor.optional(),sessionId:id.optional()}),
 get_tool:strict({id:z.string().min(1).max(60),version:version.optional()}),
 read_docs:strict({docId:id,version:version.optional(),cursor:cursor.optional(),limitChars:z.number().int().min(1000).max(16000).default(8000)}),
 get_state_v2:strict({sessionId:id,include:z.array(z.enum(['summary','features','bodies','selection','capabilities'])).max(5).optional()}),
 query_geometry:strict({context,bodyId:id,kind:z.enum(['face','edge']),filter:z.union([faceFilter,edgeFilter]),requireUnique:z.boolean().default(true),limit:z.number().int().min(1).max(100).default(20),cursor:cursor.optional()}).superRefine((value,ctx)=>{
  const result=(value.kind==='face'?faceFilter:edgeFilter).safeParse(value.filter);
  if(!result.success)for(const issue of result.error.issues)ctx.addIssue({...issue,path:['filter',...issue.path]});
 }),
 execute_v2:strict({context,idempotencyKey:z.string().min(1).max(128),action:z.enum(actionNames),args:z.union(Object.values(actionSchemas))}).superRefine((value,ctx)=>{
  const result=actionSchemas[value.action].safeParse(value.args);
  if(!result.success)for(const issue of result.error.issues)ctx.addIssue({...issue,path:['args',...issue.path]});
 }).meta({allOf:actionNames.map(action=>({if:{properties:{action:{const:action}}},then:{properties:{args:z.toJSONSchema(actionSchemas[action])}}}))})
};
const failureFields={
 requestId:id.optional(),error:strict({code:id,path:z.string().optional(),message:z.string(),retryable:z.boolean(),recoveryAction:z.string()}).optional(),
 commitState:z.enum(['not_committed','unknown','committed']).optional(),currentRevision:revision.optional(),idempotencyKey:z.string().max(128).optional()
};
const outputFields={
 status:z.enum(['read','committed','no_change','failed','unknown']),...failureFields,
 context:snapshot.optional(),transactionId:id.optional(),documentId:id.optional(),documentInstanceId:id.optional(),revisionBefore:revision.optional(),revisionAfter:revision.optional(),
 createdFeatureIds:z.array(id).optional(),createdBodyIds:z.array(id).optional(),replacements:z.array(strict({before:id,after:id})).optional(),validation:jsonObject.optional(),warnings:z.array(z.json()).optional(),
 summary:jsonObject.optional(),features:z.array(z.json()).optional(),bodies:z.array(z.json()).optional(),selection:z.json().optional(),capabilities:z.json().optional(),persistence:jsonObject.optional(),preview:jsonObject.optional(),
 bodyId:id.optional(),kind:z.enum(['face','edge']).optional(),matchCount:revision.optional(),items:z.array(z.json()).optional(),selectionToken:z.string().optional(),nextCursor:z.string().nullable().optional(),ambiguous:z.boolean().optional(),geometryFingerprint:z.string().optional()
};
const dynamicOutput=z.object(outputFields).passthrough().superRefine((value,ctx)=>{
 if(['read','no_change'].includes(value.status)&&!value.context)ctx.addIssue({code:'custom',message:'This status requires context',path:['context']});
 if(['failed','unknown'].includes(value.status)&&(!value.error||!value.commitState))ctx.addIssue({code:'custom',message:'Failures require error and commitState'});
 if(value.status==='committed')for(const key of ['requestId','transactionId','documentId','documentInstanceId','revisionBefore','revisionAfter','createdFeatureIds','createdBodyIds','replacements','validation','persistence','warnings'])if(value[key]===undefined)ctx.addIssue({code:'custom',message:`Missing committed field ${key}`,path:[key]});
});
function staticOutput(shape){
 return z.object({...Object.fromEntries(Object.entries(shape).map(([key,schema])=>[key,schema.optional()])),status:z.literal('failed').optional(),...failureFields}).passthrough().superRefine((value,ctx)=>{
  if(value.status==='failed')return;
  for(const key of Object.keys(shape))if(value[key]===undefined)ctx.addIssue({code:'custom',message:`Missing result field ${key}`,path:[key]});
 });
}
const v2Outputs={
 bootstrap:staticOutput({product:z.string(),buildId:z.string(),apiVersion:z.string(),serverInstanceId:id,catalogHash:z.string(),docsHash:z.string(),units:z.json(),entrypoints:z.json(),limits:z.json(),idempotencyGuarantee:z.json(),capabilities:z.json(),mode:z.string()}),
 search_tools:staticOutput({items:z.array(z.object({id:z.string(),title:z.string(),version:z.string(),schemaHash:z.string(),description:z.string(),implementationStatus:z.string(),runtimeAvailability:z.string()}).passthrough()),nextCursor:z.string().nullable(),catalogHash:z.string()}),
 get_tool:staticOutput({id:z.string(),title:z.string(),version:z.string(),schemaHash:z.string(),inputSchema:z.json(),outputSchema:z.json(),refsSchema:z.json()}),
 read_docs:staticOutput({docId:z.string(),version:z.string(),docsHash:z.string(),text:z.string(),nextCursor:z.string().nullable()}),
 get_state_v2:dynamicOutput,query_geometry:dynamicOutput,execute_v2:dynamicOutput
};
const structuredResult=data=>({...textResult(data),structuredContent:data,...(['failed','unknown'].includes(data.status)?{isError:true}:{})});
const browserReady=state=>state?.kernelReady===true&&!state.busy&&!state.preview;
const bridgeError=(message,{unknown=false,code='CAPABILITY_UNAVAILABLE'}={})=>Object.assign(new Error(message),{unknown,code});
function v2Failure(error,requestId,args){
 const unknown=error.unknown===true;
 return {status:unknown?'unknown':'failed',requestId,...(args.idempotencyKey?{idempotencyKey:args.idempotencyKey}:{}),error:{code:unknown?'RESULT_UNKNOWN':error.code||'CAPABILITY_UNAVAILABLE',path:error.path||'',message:error.message||String(error),retryable:false,recoveryAction:unknown?'READ_STATE_AND_CHECK_RECEIPT':error.recoveryAction||'READ_STATE_AND_REPLAN'},commitState:unknown?'unknown':'not_committed'};
}

export function createMCPBridge(httpServer,{commandTimeout=90000,artifactRoot}={}) {
 const serverInstanceId=randomUUID();
 const sourceHash=createHash('sha256');
 for(const source of ['./mcp-bridge.mjs','./document-assets.mjs','./artifact-store.mjs','./file-transfer-client.mjs','./iges-import.mjs','../src/file-contracts.js','../src/main.js','../src/command-service.js','../src/ai-docs.js','../src/operation-registry.js','../src/operation-catalog.js'])sourceHash.update(readFileSync(new URL(source,import.meta.url)));
 const buildId=`mcp-source-${sourceHash.digest('hex').slice(0,16)}`;
 const sessions=new Map();
 const wss=new WebSocketServer({noServer:true,maxPayload:32*1024*1024});
 httpServer.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/ai-bridge'||!localRequestAllowed(req,{requireOrigin:true})){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  const session={sessionId:randomUUID(),ws,state:null,lastSeen:Date.now(),pending:new Map(),tail:Promise.resolve()};sessions.set(session.sessionId,session);
  ws.send(JSON.stringify({type:'welcome',sessionId:session.sessionId,serverInstanceId,buildId}));
  ws.on('message',raw=>{try{
   const msg=JSON.parse(raw.toString());session.lastSeen=Date.now();
   if(msg.type==='state'&&msg.state&&Number.isInteger(msg.state.revision)&&msg.state.revision>=0){session.state=msg.state;return;}
   if(msg.type==='result'&&typeof msg.requestId==='string'){
    const pending=session.pending.get(msg.requestId);if(!pending)return;
    session.pending.delete(msg.requestId);clearTimeout(pending.timer);pending.cleanup();
    if(msg.state&&Number.isInteger(msg.state.revision))session.state=msg.state;
    msg.ok===true?pending.resolve(msg.result):pending.reject(bridgeError(msg.error||'Browser operation failed',{unknown:pending.v2,code:'GEOMETRY_INVALID'}));
   }
  }catch{ws.close(1007,'Invalid bridge message');}});
  ws.on('close',()=>{sessions.delete(session.sessionId);for(const p of session.pending.values()){clearTimeout(p.timer);p.cleanup();p.reject(bridgeError('Browser disconnected; commit result is unknown. Read state and inspect the receipt after reconnect before retrying.',{unknown:true}));}session.pending.clear();});
  ws.on('error',()=>{});
 });
 const timer=setInterval(()=>{for(const session of sessions.values())if(Date.now()-session.lastSeen>20000)session.ws.terminate();},5000);timer.unref();
 async function command(sessionId,name,args,signal,{requestId=randomUUID(),v2=false}={}){
  const session=sessions.get(sessionId);if(!session||!session.state)throw bridgeError('Unknown or not-ready browser session. Open WebCAD and call webcad_list_sessions.');
  const run=async()=>{
   if(signal?.aborted)throw new Error('MCP request cancelled');
   if(session.ws.readyState!==WebSocket.OPEN)throw new Error('Browser disconnected');
   if(args.expectedRevision!==undefined&&args.expectedRevision!==session.state.revision)throw new Error(`Revision conflict: expected ${args.expectedRevision}, current ${session.state.revision}. Read state before retrying.`);
   return new Promise((resolve,reject)=>{
    const cancel=message=>{const p=session.pending.get(requestId);if(!p)return;session.pending.delete(requestId);clearTimeout(p.timer);p.cleanup();if(session.ws.readyState===WebSocket.OPEN){session.ws.send(JSON.stringify({type:'cancel',requestId}));session.ws.close(1011,'Cancellation requested; inspect state');}reject(bridgeError(message,{unknown:true}));};
    const onAbort=()=>cancel('MCP request cancelled; commit result is unknown. Read state and inspect the receipt before retrying.');
    const cleanup=()=>signal?.removeEventListener('abort',onAbort);
    const pending={resolve,reject,cleanup,v2,timer:setTimeout(()=>cancel('Browser operation timed out; cancellation requested, commit result is unknown. Reconnect and inspect state and receipt before retrying.'),commandTimeout)};
    session.pending.set(requestId,pending);signal?.addEventListener('abort',onAbort,{once:true});
    session.ws.send(JSON.stringify({type:'command',requestId,command:name,args,deadline:Date.now()+commandTimeout}));
   });
  };
  const result=session.tail.then(run,run);session.tail=result.catch(()=>{});return result;
 }
 const fileService=createDocumentAssets({command,allowed:localRequestAllowed,root:artifactRoot});
 function makeServer(){
  const mcp=new McpServer({name:'WebCAD',version:'0.2.0'});
  mcp.registerTool('webcad_get_operations',{description:'Read supported operation parameter schemas, units, reference constraints and topology help before modeling. No browser session needed.',inputSchema:{}},async()=>textResult(operationCatalog));
  mcp.registerTool('webcad_list_sessions',{description:'List connected WebCAD browser tabs. Explicitly choose a sessionId; there is no default tab.',inputSchema:{}},async()=>textResult({sessions:[...sessions.values()].map(s=>({sessionId:s.sessionId,ready:!!s.state,revision:s.state?.revision,documentName:s.state?.documentName??s.state?.docName??'',lastSeen:new Date(s.lastSeen).toISOString()}))}));
  for(const [name,inputSchema]of Object.entries(schemas))mcp.registerTool(`webcad_${name}`,{description:descriptions[name] || 'Inspect one current body face/edge by zero-based index. Returns exact area/length/radius and, for planar faces, origin/normal. Read-only; use to identify topology before editing.',inputSchema},async({sessionId,...args},extra)=>{try{return textResult(await command(sessionId,name,args,extra.signal));}catch(e){return errorResult(e);}});
  const v2Descriptions={bootstrap:'Start here: compact static API, catalog and document entrypoints. Works without a browser. Continue with list_sessions and get_state_v2.',search_tools:'Search static modeling operation cards. Does not change tools/list. Runtime availability is unknown without a selected session.',get_tool:'Read one complete versioned operation card and parameter schema before feature.add or feature.edit.',read_docs:'Read a paginated allowlisted API document, including api.execute-v2; never accepts file paths.',get_state_v2:'Read a browser document snapshot. Pass its revision as expectedRevision without incrementing it.',query_geometry:'Query exact face or edge geometry in one snapshot; returns snapshot-bound selection tokens. Unsupported filters are rejected.',execute_v2:'Execute one versioned action through the browser CommandService. Read api.execute-v2 first. Reuse an idempotency key only for the identical semantic command; unknown outcomes require state/receipt inspection.'};
  for(const [name,inputSchema]of Object.entries(v2Schemas)){
   mcp.registerTool(`webcad_${name}`,{description:v2Descriptions[name],inputSchema,outputSchema:v2Outputs[name]},async(args,extra)=>{
    const requestId=randomUUID();
    try{
     let result;
     if(name==='bootstrap')result=bootstrap({serverInstanceId,buildId,browserReady:[...sessions.values()].some(s=>browserReady(s.state))});
     else if(name==='search_tools')result=searchTools(args,{browserReady:browserReady(sessions.get(args.sessionId)?.state)});
     else if(name==='get_tool')result=getTool(args);
     else if(name==='read_docs')result=readDocs(args);
     else result=await command(args.context?.sessionId??args.sessionId,name,args,extra.signal,{requestId,v2:true});
     return structuredResult(result);
    }catch(error){return structuredResult(v2Failure(error,requestId,args));}
   });
  }
  fileService.registerTools(mcp);
  return mcp;
 }
 async function handle(req,res){
  if(!localRequestAllowed(req)){res.writeHead(403).end('Local Host/Origin required');return;}
  if(req.method!=='POST'){res.writeHead(405,{'Allow':'POST'}).end('Stateless MCP Streamable HTTP requires POST');return;}
  const server=makeServer();const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{transport.close().catch(()=>{});server.close().catch(()=>{});});
  try{await server.connect(transport);await transport.handleRequest(req,res);}catch(e){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32603,message:e.message}}));}
 }
 return {handle,handleFileRequest:fileService.handle,close(){clearInterval(timer);for(const s of sessions.values())s.ws.terminate();wss.close();return fileService.close();},sessions};
}


