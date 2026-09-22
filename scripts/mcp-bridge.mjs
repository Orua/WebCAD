import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { operationCatalog } from '../src/operation-catalog.js';

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

export function createMCPBridge(httpServer,{commandTimeout=90000}={}) {
 const sessions=new Map();
 const wss=new WebSocketServer({noServer:true,maxPayload:32*1024*1024});
 httpServer.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/ai-bridge'||!localRequestAllowed(req,{requireOrigin:true})){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  const session={sessionId:randomUUID(),ws,state:null,lastSeen:Date.now(),pending:new Map(),tail:Promise.resolve()};sessions.set(session.sessionId,session);
  ws.send(JSON.stringify({type:'welcome',sessionId:session.sessionId}));
  ws.on('message',raw=>{try{
   const msg=JSON.parse(raw.toString());session.lastSeen=Date.now();
   if(msg.type==='state'&&msg.state&&Number.isInteger(msg.state.revision)&&msg.state.revision>=0){session.state=msg.state;return;}
   if(msg.type==='result'&&typeof msg.requestId==='string'){
    const pending=session.pending.get(msg.requestId);if(!pending)return;
    session.pending.delete(msg.requestId);clearTimeout(pending.timer);pending.cleanup();
    if(msg.state&&Number.isInteger(msg.state.revision))session.state=msg.state;
    msg.ok===true?pending.resolve(msg.result):pending.reject(new Error(msg.error||'Browser operation failed'));
   }
  }catch{ws.close(1007,'Invalid bridge message');}});
  ws.on('close',()=>{sessions.delete(session.sessionId);for(const p of session.pending.values()){clearTimeout(p.timer);p.cleanup();p.reject(new Error('Browser disconnected; operation cancelled. Read state after reconnect before retrying.'));}session.pending.clear();});
  ws.on('error',()=>{});
 });
 const timer=setInterval(()=>{for(const session of sessions.values())if(Date.now()-session.lastSeen>20000)session.ws.terminate();},5000);timer.unref();
 async function command(sessionId,name,args,signal){
  const session=sessions.get(sessionId);if(!session||!session.state)throw new Error('Unknown or not-ready browser session. Open WebCAD and call webcad_list_sessions.');
  const run=async()=>{
   if(signal?.aborted)throw new Error('MCP request cancelled');
   if(session.ws.readyState!==WebSocket.OPEN)throw new Error('Browser disconnected');
   if(args.expectedRevision!==undefined&&args.expectedRevision!==session.state.revision)throw new Error(`Revision conflict: expected ${args.expectedRevision}, current ${session.state.revision}. Read state before retrying.`);
   return new Promise((resolve,reject)=>{
    const requestId=randomUUID();
    const cancel=message=>{const p=session.pending.get(requestId);if(!p)return;session.pending.delete(requestId);clearTimeout(p.timer);p.cleanup();if(session.ws.readyState===WebSocket.OPEN){session.ws.send(JSON.stringify({type:'cancel',requestId}));session.ws.close(1011,'Operation cancelled; reconnect and inspect state');}reject(new Error(message));};
    const onAbort=()=>cancel('MCP request cancelled; browser transaction aborted');
    const cleanup=()=>signal?.removeEventListener('abort',onAbort);
    const pending={resolve,reject,cleanup,timer:setTimeout(()=>cancel('Browser operation timed out; cancellation requested. Reconnect and inspect state before retrying.'),commandTimeout)};
    session.pending.set(requestId,pending);signal?.addEventListener('abort',onAbort,{once:true});
    session.ws.send(JSON.stringify({type:'command',requestId,command:name,args,deadline:Date.now()+commandTimeout}));
   });
  };
  const result=session.tail.then(run,run);session.tail=result.catch(()=>{});return result;
 }
 function makeServer(){
  const mcp=new McpServer({name:'WebCAD',version:'0.2.0'});
  mcp.registerTool('webcad_get_operations',{description:'Read supported operation parameter schemas, units, reference constraints and topology help before modeling. No browser session needed.',inputSchema:{}},async()=>textResult(operationCatalog));
  mcp.registerTool('webcad_list_sessions',{description:'List connected WebCAD browser tabs. Explicitly choose a sessionId; there is no default tab.',inputSchema:{}},async()=>textResult({sessions:[...sessions.values()].map(s=>({sessionId:s.sessionId,ready:!!s.state,revision:s.state?.revision,documentName:s.state?.documentName??s.state?.docName??'',lastSeen:new Date(s.lastSeen).toISOString()}))}));
  for(const [name,inputSchema]of Object.entries(schemas))mcp.registerTool(`webcad_${name}`,{description:descriptions[name] || 'Inspect one current body face/edge by zero-based index. Returns exact area/length/radius and, for planar faces, origin/normal. Read-only; use to identify topology before editing.',inputSchema},async({sessionId,...args},extra)=>{try{return textResult(await command(sessionId,name,args,extra.signal));}catch(e){return errorResult(e);}});
  return mcp;
 }
 async function handle(req,res){
  if(!localRequestAllowed(req)){res.writeHead(403).end('Local Host/Origin required');return;}
  if(req.method!=='POST'){res.writeHead(405,{'Allow':'POST'}).end('Stateless MCP Streamable HTTP requires POST');return;}
  const server=makeServer();const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{transport.close().catch(()=>{});server.close().catch(()=>{});});
  try{await server.connect(transport);await transport.handleRequest(req,res);}catch(e){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32603,message:e.message}}));}
 }
 return {handle,close(){clearInterval(timer);for(const s of sessions.values())s.ws.terminate();wss.close();},sessions};
}


