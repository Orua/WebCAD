import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMCPBridge } from '../scripts/mcp-bridge.mjs';

async function setup(t,commandTimeout=2000){
 let bridge;
 const server=http.createServer((req,res)=>bridge.handle(req,res));
 bridge=createMCPBridge(server,{commandTimeout});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}`;
 const client=new Client({name:'webcad-v2-test',version:'1.0.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
 t.after(async()=>{await client.close();bridge.close();server.close();server.closeAllConnections();});
 const call=(name,args={})=>client.callTool({name:`webcad_${name}`,arguments:args});
 return {bridge,client,url,call};
}

async function fakeTab(ctx,{hang=false,disconnect=false}={}){
 const ws=new WebSocket(ctx.url.replace('http:','ws:')+'/ai-bridge',{origin:ctx.url});
 const events=[];let sessionId;
 await new Promise(resolve=>ws.on('message',raw=>{
  const msg=JSON.parse(raw);events.push(msg);
  if(msg.type==='welcome'){
   sessionId=msg.sessionId;
   ws.send(JSON.stringify({type:'state',state:{revision:3,documentName:'Fake contract document'}}));
   resolve();
  }
  if(msg.type!=='command')return;
  if(disconnect){ws.close();return;}
  if(hang)return;
  const context={sessionId,documentId:'doc',documentInstanceId:'instance',revision:3};
  let result={status:'no_change',requestId:msg.requestId,context,commitState:'not_committed'};
  if(msg.command==='get_state_v2')result={status:'read',context,summary:{name:'Fake contract document'},bodies:[],capabilities:{},persistence:{level:'memory',checkpoint:'pending'},preview:{active:false,computing:false}};
  if(msg.command==='query_geometry')result={status:'read',context,bodyId:'body',kind:'face',matchCount:1,items:[{faceId:0}],selectionToken:'test-token',nextCursor:null,ambiguous:false,geometryFingerprint:'test-fingerprint'};
  ws.send(JSON.stringify({type:'result',requestId:msg.requestId,ok:true,result}));
 }));
 await new Promise(resolve=>setTimeout(resolve,20));
 return {ws,sessionId,events};
}

const snapshot=sessionId=>({sessionId,documentId:'doc',documentInstanceId:'instance',expectedRevision:3});
const execute=sessionId=>({context:snapshot(sessionId),idempotencyKey:'retry-test',action:'history.undo',args:{}});
const value=result=>{
 assert.deepEqual(result.structuredContent,JSON.parse(result.content[0].text));
 return result.structuredContent;
};

test('seven additive stable MCP tools expose strict inputs and structured schemas, static docs work without tabs',async t=>{
 const ctx=await setup(t);
 const before=await ctx.client.listTools();
 assert.equal(before.tools.length,21);
 for(const name of ['bootstrap','search_tools','get_tool','read_docs','get_state_v2','query_geometry','execute_v2']){
  const tool=before.tools.find(x=>x.name===`webcad_${name}`);
  assert(tool);assert.equal(tool.inputSchema.additionalProperties,false);assert(tool.outputSchema);
 }
 const bootstrap=value(await ctx.call('bootstrap'));
 assert(bootstrap.serverInstanceId);assert(bootstrap.catalogHash);assert(bootstrap.docsHash);
 assert.equal(value(await ctx.call('bootstrap')).serverInstanceId,bootstrap.serverInstanceId);
 const search=value(await ctx.call('search_tools',{query:'box'}));
 assert(search.items.length);assert(search.items.every(x=>x.runtimeAvailability==='unknown'));
 assert(value(await ctx.call('search_tools',{query:''})).items.length,'empty query browses the operation catalog');
 const card=value(await ctx.call('get_tool',{id:'box'}));assert.equal(card.id,'box');assert(card.inputSchema);
 const docs=value(await ctx.call('read_docs',{docId:'api.execute-v2',limitChars:1000}));assert.equal(docs.docId,'api.execute-v2');assert(docs.text);
 assert.deepEqual((await ctx.client.listTools()).tools.map(x=>x.name),before.tools.map(x=>x.name));
 const unsupported=value(await ctx.call('get_tool',{id:'box',version:'unknown-version'}));assert.equal(unsupported.status,'failed');
 const traversal=value(await ctx.call('read_docs',{docId:'../../package.json'}));assert.equal(traversal.status,'failed');
 for(const [name,args] of [
  ['bootstrap',{unexpected:true}],['search_tools',{query:'box',unknown:true}],
  ['search_tools',{query:'x'.repeat(501)}],['search_tools',{query:'box',limit:51}],
  ['get_tool',{id:'box',unknown:true}],['read_docs',{docId:'api.execute-v2',path:'package.json'}]
 ])assert.equal((await ctx.call(name,args)).isError,true,`${name} must reject invalid fields`);
});

test('v2 routing preserves snapshot identity and action fields, rejects mismatched actions and query filters',async t=>{
 const ctx=await setup(t),tab=await fakeTab(ctx);
 const state=value(await ctx.call('get_state_v2',{sessionId:tab.sessionId}));assert.equal(state.context.documentId,'doc');
 const args=execute(tab.sessionId);
 const result=value(await ctx.call('execute_v2',args));assert.equal(result.status,'no_change');
 const sent=tab.events.find(x=>x.command==='execute_v2');assert.deepEqual(sent.args,args);assert.equal(result.requestId,sent.requestId);
 const query={context:snapshot(tab.sessionId),bodyId:'body',kind:'face',filter:{surfaceType:'plane',normal:{direction:[0,0,1]},atExtreme:{axis:'Z',side:'max'}}};
 const geometry=value(await ctx.call('query_geometry',query));assert.equal(geometry.matchCount,1);
 const queryMessage=tab.events.find(x=>x.command==='query_geometry');assert.equal(queryMessage.args.requireUnique,true);assert.equal(queryMessage.args.limit,20);
 const eventCount=tab.events.filter(x=>x.type==='command').length;
 for(const bad of [
  {...args,unknown:1}, {...args,context:{...args.context,unknown:true}},
  {...args,args:{unknown:1}}, {...args,args:{bodyIds:['body']}},
  {...args,action:'feature.remove',args:{bodyIds:['body','body']}},
  {...args,action:'feature.add',args:{op:'box',opVersion:'1',schemaHash:'hash',params:{}}},
  {...args,action:'feature.edit',args:{featureId:'a',opVersion:'1',schemaHash:'hash',params:{},selectionToken:'x'}}
 ])assert.equal((await ctx.call('execute_v2',bad)).isError,true);
 for(const bad of [
  {...query,filter:{surfaceType:'cylinder'}}, {...query,kind:'edge'},
  {...query,filter:{normal:{direction:[0,0,0]}}}, {...query,filter:{unknown:1}},
  {...query,kind:'edge',filter:{lengthRangeMm:{min:5,max:2}}},
  {...query,kind:'edge',filter:{lengthRangeMm:{}}},
  {...query,limit:101}
 ])assert.equal((await ctx.call('query_geometry',bad)).isError,true);
 assert.equal(tab.events.filter(x=>x.type==='command').length,eventCount,'invalid requests must not reach browser');
});

test('availability requires an idle ready kernel and welcome identifies the same server/build as bootstrap',async t=>{
 const ctx=await setup(t),tab=await fakeTab(ctx);
 const welcome=tab.events.find(x=>x.type==='welcome');
 const initial=value(await ctx.call('bootstrap'));
 assert.equal(welcome.serverInstanceId,initial.serverInstanceId);
 assert.equal(welcome.buildId,initial.buildId);
 assert.match(welcome.buildId,/^mcp-source-[a-f0-9]{16}$/);
 async function assertAvailability(expected){
  assert.equal(value(await ctx.call('bootstrap')).capabilities.modeling,expected);
  const search=value(await ctx.call('search_tools',{query:'box',sessionId:tab.sessionId}));
  assert(search.items.length);
  assert(search.items.every(item=>item.runtimeAvailability===expected));
 }
 async function publish(fields){
  const state={revision:3,documentName:'Readiness fixture',...fields};
  tab.ws.send(JSON.stringify({type:'state',state}));
  for(let attempt=0;attempt<50;attempt++){
   if(JSON.stringify(ctx.bridge.sessions.get(tab.sessionId)?.state)===JSON.stringify(state))return;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('browser state was not published');
 }
 await assertAvailability('not_ready'); // Legacy publications omit kernelReady.
 await publish({kernelReady:false,busy:false,preview:false});await assertAvailability('not_ready');
 await publish({kernelReady:true,busy:false,preview:false});await assertAvailability('available');
 await publish({kernelReady:true,busy:true,preview:false});await assertAvailability('not_ready');
 await publish({kernelReady:true,busy:false,preview:true});await assertAvailability('not_ready');
});

for(const mode of ['timeout','disconnect'])test(`v2 ${mode} reports unknown commit state and original request information`,async t=>{
 const ctx=await setup(t,60),tab=await fakeTab(ctx,{hang:mode==='timeout',disconnect:mode==='disconnect'});
 const result=await ctx.call('execute_v2',execute(tab.sessionId));
 assert.equal(result.isError,true);
 const data=value(result);
 assert.equal(data.status,'unknown');assert.equal(data.commitState,'unknown');assert.equal(data.error.code,'RESULT_UNKNOWN');assert.equal(data.idempotencyKey,'retry-test');
 assert.equal(data.requestId,tab.events.find(x=>x.command==='execute_v2').requestId);
 assert.doesNotMatch(data.error.message,/transaction aborted|not committed|已回滚/i);
});
