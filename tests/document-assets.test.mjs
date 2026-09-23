import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMCPBridge } from '../scripts/mcp-bridge.mjs';
import { createCommandService } from '../src/command-service.js';
import { uploadAsset,downloadArtifact } from '../scripts/file-transfer-client.mjs';
import { listFileTools } from '../src/file-contracts.js';
import { getTool,searchTools } from '../src/ai-docs.js';

async function setup(t){
 const root=path.resolve('agent/temp/m2a',`transport-${randomUUID()}`);await fs.mkdir(root,{recursive:true});
 let bridge;const server=http.createServer((req,res)=>{if(req.url==='/mcp')return bridge.handle(req,res);bridge.handleFileRequest(req,res).catch(error=>{res.writeHead(500);res.end(error.message);});});
 bridge=createMCPBridge(server,{commandTimeout:3000,artifactRoot:path.join(root,'store')});server.listen(0,'127.0.0.1');await once(server,'listening');
 const baseUrl=`http://127.0.0.1:${server.address().port}`,client=new Client({name:'m2a-transport-tests',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
 const state={sessionId:null,documentId:'document',documentInstanceId:'instance',revision:2,dirty:true,features:[],bodies:[],selectedIds:[],selectedTopology:null,kernelReady:true};
 const context=()=>({sessionId:state.sessionId,documentId:state.documentId,documentInstanceId:state.documentInstanceId,expectedRevision:state.revision});
 const service=createCommandService({snapshot:()=>structuredClone(state),execute:async(name)=>{if(name==='file_save')return {encoding:'base64',data:Buffer.from(JSON.stringify({version:1,documentId:state.documentId,features:[],imports:{},hidden:[]})).toString('base64'),extension:'webcad',mime:'application/json'};throw new Error('Unsupported test command');}});
 const ws=new WebSocket(`${baseUrl.replace('http:','ws:')}/ai-bridge`,{origin:baseUrl});
 await new Promise(resolve=>ws.on('message',async raw=>{
  const msg=JSON.parse(raw);if(msg.type==='welcome'){state.sessionId=msg.sessionId;ws.send(JSON.stringify({type:'state',state}));resolve();return;}
  if(msg.type!=='command')return;let result;
  if(msg.command==='file_command')result=await service.fileCommand(msg.args);
  else if(msg.command==='acknowledge_save'){const saved=msg.args.savedRevision===state.revision&&msg.args.documentInstanceId===state.documentInstanceId;if(saved)state.dirty=false;result={saved,dirty:state.dirty};}
  ws.send(JSON.stringify({type:'result',requestId:msg.requestId,ok:true,result,state}));
 }));
 await new Promise(resolve=>setTimeout(resolve,20));
 t.after(async()=>{ws.terminate();await client.close();await bridge.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 const raw=async(name,args={})=>client.callTool({name:`webcad_${name}`,arguments:args});
 const call=async(name,args={})=>{const r=await raw(name,args);assert(!r.isError,JSON.stringify(r));return r.structuredContent??JSON.parse(r.content[0].text);};
 return {root,baseUrl,client,state,context,raw,call};
}

test('file tools retain M1 tools and expose valid exact schemas and discoverable cards',async t=>{
 const x=await setup(t),tools=(await x.client.listTools()).tools;assert.equal(tools.length,30);
 for(const card of listFileTools()){
  assert(tools.some(tool=>tool.name===card.toolName));assert.equal(getTool({id:card.id}).schemaHash,card.schemaHash);assert(searchTools({query:card.id}).items.length);
 }
 assert((await x.raw('save_document',{context:{...x.context(),unexpected:1}})).isError);
 assert((await x.raw('save_document',{context:{...x.context(),documentInstanceId:'old'}})).isError);
 assert((await x.raw('export_artifact',{context:x.context(),format:'step',ids:['b','b']})).isError);
});

test('real HTTP bytes + client filesystem adapter verify upload, download, revision-bound acknowledgement and release',async t=>{
 const x=await setup(t);const source=path.join(x.root,'input.step');await fs.writeFile(source,'original binary input');
 const asset=await uploadAsset(x.client,{filePath:source,directory:x.root,baseUrl:x.baseUrl});assert.equal(asset.size,21);
 const artifact=await x.call('save_document',{context:x.context()});assert.equal(x.state.dirty,true);
 assert((await x.raw('confirm_artifact_written',{artifactId:artifact.artifactId,size:artifact.size,sha256:artifact.sha256})).isError);
 x.state.revision++; // A new edit occurs after snapshot generation, before disk completion.
 const saved=await downloadArtifact(x.client,artifact,{directory:x.root,baseUrl:x.baseUrl});assert.equal(saved.confirmation.documentSaved,false);assert.equal(x.state.dirty,true);
 assert.equal(createHash('sha256').update(await fs.readFile(saved.filePath)).digest('hex'),artifact.sha256);
 const fresh=await x.call('save_document',{context:x.context()});const written=await downloadArtifact(x.client,fresh,{directory:x.root,baseUrl:x.baseUrl});assert.equal(written.confirmation.documentSaved,true);assert.equal(x.state.dirty,false);
 await x.call('release_resource',{resourceId:artifact.artifactId});const expired=await fetch(x.baseUrl+artifact.downloadUrl,{headers:{Authorization:`Bearer ${artifact.downloadToken}`}});assert.equal(expired.status,410);
 await x.call('release_resource',{resourceId:asset.assetId});assert((await x.raw('import_asset',{context:x.context(),assetId:asset.assetId})).isError);
});

test('transfer rejects overwrite, path/link escape, incorrect hash, write failure, URL escape and oversized registration without false acknowledgement',async t=>{
 const x=await setup(t),artifact=await x.call('save_document',{context:x.context()});
 await assert.rejects(downloadArtifact(x.client,artifact,{directory:x.root,baseUrl:x.baseUrl,name:'../outside.webcad'}),{code:'PATH_OUTSIDE_AUTHORIZED_DIRECTORY'});
 await assert.rejects(downloadArtifact(x.client,{...artifact,downloadUrl:'http://example.invalid/file'},{directory:x.root,baseUrl:x.baseUrl}),{code:'URL_OUTSIDE_SCOPE'});
 await fs.writeFile(path.join(x.root,artifact.name),'preserve');
 await assert.rejects(downloadArtifact(x.client,artifact,{directory:x.root,baseUrl:x.baseUrl}),{code:'WRITE_CONFLICT'});assert.equal(await fs.readFile(path.join(x.root,artifact.name),'utf8'),'preserve');
 await assert.rejects(downloadArtifact(x.client,{...artifact,sha256:'0'.repeat(64)},{directory:x.root,baseUrl:x.baseUrl,name:'bad.webcad'}),{code:'HASH_MISMATCH'});
 assert.equal(x.state.dirty,true);assert(!(await fs.readdir(x.root)).some(name=>name.endsWith('.part')));
 const originalOpen=fs.open;const mock=t.mock.method(fs,'open',async function(file,...args){if(String(file).endsWith('.part'))throw Object.assign(new Error('Injected disk full'),{code:'ENOSPC'});return originalOpen.call(this,file,...args);});
 await assert.rejects(downloadArtifact(x.client,artifact,{directory:x.root,baseUrl:x.baseUrl,name:'write-failure.webcad'}),{code:'ENOSPC'});mock.mock.restore();assert.equal(x.state.dirty,true);
 assert((await x.raw('register_asset',{name:'huge.step',size:20*1024*1024+1,sha256:'0'.repeat(64)})).isError);
 const grant=await x.call('register_asset',{name:'chunked.step',size:20*1024*1024,sha256:'0'.repeat(64)});
 const tooLarge=await fetch(x.baseUrl+grant.uploadUrl,{method:'PUT',headers:{Authorization:`Bearer ${grant.uploadToken}`},body:Readable.from([Buffer.alloc(20*1024*1024),Buffer.from('x')]),duplex:'half'});assert.equal(tooLarge.status,413);assert.equal((await tooLarge.json()).error.code,'SIZE_LIMIT');
 const outside=path.join(x.root,'outside');const authorized=path.join(x.root,'authorized');await fs.mkdir(outside);await fs.mkdir(authorized);await fs.writeFile(path.join(outside,'part.step'),'secret');await fs.symlink(outside,path.join(authorized,'link'),'junction');
 await assert.rejects(uploadAsset(x.client,{filePath:'link/part.step',directory:authorized,baseUrl:x.baseUrl}),{code:'PATH_OUTSIDE_AUTHORIZED_DIRECTORY'});
 await fs.unlink(path.join(authorized,'link')); // Remove only the task-created junction.
});
