import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('browser adapter cannot turn late cancellation into a rollback claim',async()=>{
 const saved={WebSocket:globalThis.WebSocket,location:globalThis.location};let socket;
 class FakeSocket{static OPEN=1;constructor(){this.readyState=1;this.sent=[];socket=this;}send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;}}
 globalThis.WebSocket=FakeSocket;globalThis.location={protocol:'http:',host:'127.0.0.1:17667'};
 const source=fs.readFileSync(process.env.WEBCAD_TEST_BRIDGE_SOURCE??new URL('../src/ai-bridge.js',import.meta.url),'utf8');
 const {connectAI}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 let revision=1;
 const connection=connectAI({getState:()=>({revision}),execute:async()=>{
  revision++;
  socket.onmessage({data:JSON.stringify({type:'cancel',requestId:'request'})});
  return {revision};
 }});
 try{
  socket.onmessage({data:JSON.stringify({type:'welcome',sessionId:'session'})});
  socket.onmessage({data:JSON.stringify({type:'command',requestId:'request',command:'add_feature',args:{expectedRevision:1},deadline:Date.now()+10000})});
  await new Promise(resolve=>setTimeout(resolve,20));
  const result=socket.sent.find(x=>x.type==='result');assert.equal(revision,2);assert.equal(result?.ok,true,JSON.stringify(result));assert.equal(result.result.revision,2);
 }finally{connection.disconnect();Object.assign(globalThis,saved);}
});
