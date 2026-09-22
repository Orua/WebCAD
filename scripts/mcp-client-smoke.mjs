import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import assert from 'node:assert/strict';
const args=process.argv.slice(2);const at=flag=>args[args.indexOf(flag)+1];
const url=args.includes('--url')?at('--url'):'http://127.0.0.1:667/mcp';
const target=args.includes('--session')?at('--session'):null;
const client=new Client({name:'webcad-acceptance',version:'1.0.0'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(url)));
 const tools=await client.listTools();console.log(JSON.stringify({stage:'initialize/tools-list',tools:tools.tools.map(x=>x.name)}));
 const call=async(name,parameters={})=>{const result=await client.callTool({name:'webcad_'+name,arguments:parameters});const data=JSON.parse(result.content[0].text);if(result.isError)throw new Error(JSON.stringify(data));return data;};
 const {sessions}=await call('list_sessions');console.log(JSON.stringify({stage:'sessions',sessions}));
 if(target){
  assert(sessions.some(s=>s.sessionId===target&&s.ready),'Target session not connected/ready');
  const before=await call('get_state',{sessionId:target});console.log(JSON.stringify({stage:'read-state',revision:before.revision,bodies:before.bodies?.length}));
  const templates=await call('get_templates',{sessionId:target});console.log(JSON.stringify({stage:'templates',ids:Object.keys(templates)}));
  if(args.includes('--exercise')){
   const added=await call('add_feature',{sessionId:target,expectedRevision:before.revision,op:'box',params:{width:4,depth:5,height:6},name:'MCP acceptance box'});
   const body=added.bodies.find(b=>b.name==='MCP acceptance box');assert(body,'New MCP box missing');assert(Math.abs(body.volume-120)<1e-5,'Wrong box volume');
   const refreshed=await call('refresh',{sessionId:target,expectedRevision:added.revision});assert(refreshed.bodies.some(b=>b.id===body.id),'Refresh lost box');
   const exported=await call('export',{sessionId:target,expectedRevision:refreshed.revision,format:'step',ids:[body.id]});assert.equal(exported.encoding,'base64');assert(Buffer.from(exported.data,'base64').toString().includes('ISO-10303-21'),'Export is not STEP');
   const undone=await call('undo',{sessionId:target,expectedRevision:refreshed.revision});assert.equal(undone.bodies.length,before.bodies.length,'Undo did not restore body count');
   console.log(JSON.stringify({stage:'exercise-passed',boxVolume:body.volume,stepBytes:Buffer.from(exported.data,'base64').length,finalRevision:undone.revision}));
  }
 }else console.log('Read-only session inventory complete. To exercise a tab, pass --session <exact ID> --exercise.');
}finally{await client.close();}
