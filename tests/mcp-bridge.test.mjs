import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMCPBridge } from '../scripts/mcp-bridge.mjs';

async function setup(t,timeout=2000){
 let bridge;const server=http.createServer((req,res)=>bridge.handle(req,res));bridge=createMCPBridge(server,{commandTimeout:timeout});
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port,url=`http://127.0.0.1:${port}`;
 const client=new Client({name:'webcad-test-client',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(url+'/mcp')));
 t.after(async()=>{await client.close();bridge.close();server.close();server.closeAllConnections();});
 return {url,port,client,bridge};
}
async function fakeTab(ctx,name){
 const ws=new WebSocket(ctx.url.replace('http:','ws:')+'/ai-bridge',{origin:ctx.url});let revision=0,sessionId;const events=[];
 const ready=new Promise(resolve=>{ws.on('message',raw=>{const msg=JSON.parse(raw);events.push(msg);
 if(msg.type==='welcome'){sessionId=msg.sessionId;ws.send(JSON.stringify({type:'state',state:{revision,documentName:name}}));resolve();}
 if(msg.type==='command'){
  if(msg.args.params?.hang)return;
  const failed=msg.args.params?.fail;
  if(msg.command==='add_feature'&&!failed)revision++;
  ws.send(JSON.stringify({type:'result',requestId:msg.requestId,ok:!failed,error:failed?'Invalid geometry':undefined,result:{revision,documentName:name,command:msg.command},state:{revision,documentName:name}}));
 }
 });});await ready;await new Promise(r=>setTimeout(r,20));return {ws,get sessionId(){return sessionId;},get revision(){return revision;},events};
}
const parsed=r=>JSON.parse(r.content[0].text);
test('official MCP initialize/list/call, revision guard, tab isolation, errors, serialization and origins',async t=>{
 const ctx=await setup(t),a=await fakeTab(ctx,'A'),b=await fakeTab(ctx,'B');
 const tools=await ctx.client.listTools();assert.equal(tools.tools.length,14);assert(tools.tools.some(x=>x.name==='webcad_refresh'));
 const call=(name,args={})=>ctx.client.callTool({name:`webcad_${name}`,arguments:args});
 const catalog=parsed(await call('get_operations'));assert.equal(catalog.units.length,'mm');assert.equal(catalog.operations.faceHole.refs,1);assert.equal(catalog.operations.import.mcpAddFeature,false);
 assert.equal(parsed(await call('inspect_geometry',{sessionId:a.sessionId,bodyId:'body1',kind:'face',topologyId:0})).command,'inspect_geometry');
 assert.equal(parsed(await call('list_sessions')).sessions.length,2);
 assert.equal(parsed(await call('get_state',{sessionId:a.sessionId})).documentName,'A');
 const missing=await call('get_state',{sessionId:'missing'});assert.equal(missing.isError,true);
 let added=await call('add_feature',{sessionId:a.sessionId,expectedRevision:0,op:'box',params:{width:4}});assert.equal(parsed(added).revision,1);assert.equal(b.revision,0);
 const stale=await call('add_feature',{sessionId:a.sessionId,expectedRevision:0,op:'box',params:{}});assert.equal(stale.isError,true);assert.match(parsed(stale).error,/Revision conflict/);assert.equal(a.revision,1);
 const failed=await call('add_feature',{sessionId:a.sessionId,expectedRevision:1,op:'box',params:{fail:true}});assert.equal(failed.isError,true);assert.equal(a.revision,1);
 const concurrent=await Promise.all([0,1].map(()=>call('add_feature',{sessionId:a.sessionId,expectedRevision:1,op:'box',params:{}})));assert.equal(concurrent.filter(r=>!r.isError).length,1);assert.equal(a.revision,2);
 const badOrigin=await fetch(ctx.url+'/mcp',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(badOrigin.status,403);
 const badHost=await new Promise(resolve=>{const req=http.request(ctx.url+'/mcp',{method:'POST',headers:{Host:'evil.example','Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.end('{}');});assert.equal(badHost,403);
 await new Promise((resolve,reject)=>{const ws=new WebSocket(ctx.url.replace('http:','ws:')+'/ai-bridge',{origin:'https://evil.example'});ws.on('unexpected-response',(_req,res)=>{assert.equal(res.statusCode,403);res.resume();resolve();});ws.on('open',()=>reject(new Error('Hostile WS accepted')));});
 b.ws.close();await once(b.ws,'close');for(let i=0;i<20&&ctx.bridge.sessions.size>1;i++)await new Promise(r=>setTimeout(r,10));assert.equal(parsed(await call('list_sessions')).sessions.length,1);
});
test('timeout cancels pending command, closes session, returns tool error',async t=>{
 const ctx=await setup(t,80),tab=await fakeTab(ctx,'Timeout');
 const result=await ctx.client.callTool({name:'webcad_add_feature',arguments:{sessionId:tab.sessionId,expectedRevision:0,op:'box',params:{hang:true}}});
 assert.equal(result.isError,true);assert.match(parsed(result).error,/timed out/);await new Promise(r=>setTimeout(r,40));assert(tab.events.some(x=>x.type==='cancel'));assert.equal(tab.revision,0);assert.equal(ctx.bridge.sessions.size,0);
});

