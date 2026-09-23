import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const sessionId=JSON.parse(fs.readFileSync('agent/output/m1/mounting-plate-state.json')).context.sessionId;
const client=new Client({name:'m1-token-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:17667/mcp')));
const results=[];let state;
async function call(name,args){const raw=await client.callTool({name:`webcad_${name}`,arguments:args});const r=raw.structuredContent??JSON.parse(raw.content[0].text);assert(!raw.isError,JSON.stringify(r));return r;}
async function read(){state=await call('get_state_v2',{sessionId});return state;}
const context=()=>({sessionId,documentId:state.context.documentId,documentInstanceId:state.context.documentInstanceId,expectedRevision:state.context.revision});
async function query(kind,filter,requireUnique=true){return call('query_geometry',{context:context(),bodyId:state.bodies[0].id,kind,filter,requireUnique});}
async function execute(action,args){const r=await call('execute_v2',{context:context(),idempotencyKey:crypto.randomUUID(),action,args});assert.equal(r.status,'committed');await read();return r;}
try{
 await read();const original=state.bodies[0].volume;
 for(const op of ['faceHole','chamfer','fillet']){
  const top=await query('face',{surfaceType:'plane',normal:{direction:[0,0,1]},atExtreme:{axis:'Z',side:'max'}});
  const token=op==='faceHole'?top.selectionToken:(await query('edge',{curveType:'line',onFaceToken:top.selectionToken},false)).selectionToken;
  const card=await call('get_tool',{id:op});
  const params=op==='faceHole'?{point:[23,15,3],radius:1,through:true}:op==='chamfer'?{distance:.2}:{radius:.2};
  await execute('feature.add',{op,opVersion:card.version,schemaHash:card.schemaHash,params,refs:[state.bodies[0].id],selectionToken:token});
  assert(state.bodies[0].volume<original);results.push({op,status:'pass',volume:state.bodies[0].volume});
  await execute('history.undo',{});assert(Math.abs(state.bodies[0].volume-original)<.01);
 }
 console.log(JSON.stringify({status:'pass',results},null,2));
}finally{fs.writeFileSync('agent/output/m1/topology-e2e.json',JSON.stringify(results,null,2));await client.close();}
