// UI regression setup selects topology A in the isolated second browser tab.
// This real MCP client supplies explicit topology B and checks the committed feature.
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const op=process.argv[2];assert(['fillet','shell'].includes(op));
const client=new Client({name:'m1-explicit-selection',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:17667/mcp')));
async function call(name,args={}){const raw=await client.callTool({name:`webcad_${name}`,arguments:args});assert(!raw.isError,JSON.stringify(raw));return raw.structuredContent??JSON.parse(raw.content[0].text);}
try{
 const sessions=(await call('list_sessions')).sessions.filter(s=>s.documentName==='M1 isolated UI regressions');assert.equal(sessions.length,1);const sessionId=sessions[0].sessionId;
 const before=await call('get_state',{sessionId});const expected=op==='fillet'?7:0;assert.deepEqual(before.selectedTopology.ids,[expected]);
 const params=op==='fillet'?{radius:.5,edgeIds:[2]}:{thickness:1,faceIds:[5]};
 const result=await call('add_feature',{sessionId,expectedRevision:before.revision,op,params,refs:['box']});
 assert.deepEqual(result.features.at(-1).params[op==='fillet'?'edgeIds':'faceIds'],op==='fillet'?[2]:[5]);
 assert.equal(result.revision,before.revision+1);assert.equal(result.bodies.find(b=>b.id===result.features.at(-1).id).solidCount,1);
 await call('undo',{sessionId,expectedRevision:result.revision});console.log(JSON.stringify({status:'pass',op,selectedA:expected,explicitB:op==='fillet'?2:5,realMCP:true,realWasm:true}));
}finally{await client.close();}
