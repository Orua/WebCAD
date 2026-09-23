// Public-MCP portability in a NEW server and browser; only saved .webcad files are inputs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { uploadAsset,downloadArtifact } from '../scripts/file-transfer-client.mjs';
const source=path.resolve(process.env.WEBCAD_M2A_SOURCE||'agent/output/m2a/final'),directory=path.resolve(process.env.WEBCAD_M2A_PORTABLE_OUTPUT||'agent/output/m2a/clean-portability');await fs.mkdir(directory,{recursive:true});
const baseUrl=process.env.WEBCAD_TEST_URL?.replace(/\/mcp\/?$/,'')||'http://127.0.0.1:17669';
const client=new Client({name:'m2a-clean-portability',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(baseUrl+'/mcp')));
const call=async(name,args={})=>{const r=await client.callTool({name:'webcad_'+name,arguments:args});const v=r.structuredContent??JSON.parse(r.content[0].text);assert(!r.isError,JSON.stringify(v));return v;};
let state,sessionId;const context=()=>({sessionId,documentId:state.context.documentId,documentInstanceId:state.context.documentInstanceId,expectedRevision:state.context.revision});
const read=async()=>state=await call('get_state_v2',{sessionId,include:['summary','features','bodies']});
const cases=[];
try{
 const sessions=(await call('list_sessions')).sessions;assert.equal(sessions.length,1);sessionId=sessions[0].sessionId;await read();assert.equal(state.features.length,0);assert(state.summary.kernelReady);
 const bootstrap=await call('bootstrap'),original=JSON.parse(await fs.readFile(path.join(source,'result.json'),'utf8'));assert.notEqual(bootstrap.serverInstanceId,original.bootstrap.serverInstanceId);
 for(const [file,expectedBase,depth]of [['portable-step.webcad',3989.2035526276904,3],['portable-brep.webcad',320,4]]){
  const asset=await uploadAsset(client,{filePath:path.join(source,file),directory:source,baseUrl});await call('open_asset',{context:context(),assetId:asset.assetId});await read();
  assert.equal(state.features.length,2);assert.equal(state.bodies.length,1);assert(Math.abs(state.bodies[0].volume-(expectedBase-depth*Math.PI))<.01);
  const cut=state.features.find(f=>f.op==='hole'),card=await call('get_tool',{id:'hole'});
  await call('execute_v2',{context:context(),idempotencyKey:crypto.randomUUID(),action:'feature.edit',args:{featureId:cut.id,opVersion:card.version,schemaHash:card.schemaHash,params:{radius:1.1}}});await read();assert(Math.abs(state.bodies[0].volume-(expectedBase-depth*Math.PI*1.1**2))<.01);
  const artifact=await call('save_document',{context:context()});const saved=await downloadArtifact(client,artifact,{directory,baseUrl,name:file});assert(saved.confirmation.documentSaved);await read();
  cases.push({file,volume:state.bodies[0].volume,historyEditable:true,sha256:saved.sha256,newServerInstance:true});
 }
 await fs.writeFile(path.join(directory,'result.json'),JSON.stringify({status:'pass',serverInstanceId:bootstrap.serverInstanceId,cases},null,2));console.log(JSON.stringify({status:'pass',cases}));
}finally{await client.close();}
