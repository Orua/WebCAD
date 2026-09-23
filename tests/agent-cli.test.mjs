import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { createMCPBridge } from '../scripts/mcp-bridge.mjs';

async function setup(t){
  let bridge;const server=http.createServer((req,res)=>bridge.handle(req,res));bridge=createMCPBridge(server);
  server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
  t.after(()=>{bridge.close();server.close();server.closeAllConnections();});return{bridge,url};
}
async function cli(url,args){
  const child=spawn(process.execPath,['scripts/webcad-agent.mjs','--url',url+'/mcp',...args],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const [code]=await once(child,'close');assert.equal(code,0,stderr);return JSON.parse(stdout);
}
async function fakeTab(ctx){
  const ws=new WebSocket(ctx.url.replace('http:','ws:')+'/ai-bridge',{origin:ctx.url});let sessionId;
  ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.type==='welcome'){sessionId=msg.sessionId;ws.send(JSON.stringify({type:'state',state:{revision:3,documentName:'CLI test',kernelReady:true,busy:false,preview:false}}));}if(msg.type==='command')ws.send(JSON.stringify({type:'result',requestId:msg.requestId,ok:true,result:{status:'read',context:{sessionId,documentId:'doc',documentInstanceId:'instance',revision:3}},state:{revision:3,documentName:'CLI test',kernelReady:true,busy:false,preview:false}}));});
  await once(ws,'open');for(let i=0;i<50&&!sessionId;i++)await new Promise(resolve=>setTimeout(resolve,10));assert(sessionId);return{ws,sessionId};
}
test('agent CLI discovers compact docs and tool cards without a browser',async t=>{
  const ctx=await setup(t);assert.equal((await cli(ctx.url,['bootstrap'])).product,'WebCAD');
  assert.match((await cli(ctx.url,['docs','start'])).text,/Never model with DOM clicks/);
  assert((await cli(ctx.url,['search','box'])).items.some(item=>item.id==='box'));
});
test('agent CLI lists and reads the one explicit live browser session',async t=>{
  const ctx=await setup(t),tab=await fakeTab(ctx);t.after(()=>tab.ws.close());
  const sessions=await cli(ctx.url,['sessions']);assert(sessions.sessions.some(item=>item.sessionId===tab.sessionId));
  const state=await cli(ctx.url,['state','--session',tab.sessionId]);assert.equal(state.context.revision,3);
});
