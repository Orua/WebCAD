import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import vm from 'node:vm';
import {generateAgentKit} from '../scripts/generate-agent-kit.mjs';
import {UI_API_ROUTES} from '../src/ui-api-coverage.js';
import {createPageClient,findRoutes,findLocalRoutes} from '../skills/webcad-page-api/scripts/page-client.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
async function fixture(){
  await mkdir(resolve(root,'agent/temp'),{recursive:true});
  const workspace=await mkdtemp(resolve(root,'agent/temp/agent-kit-test-'));
  const target=resolve(workspace,'automation');
  const manifest=await generateAgentKit({root,target,metadata:{pageApiVersion:'test-version',buildId:'test-build',catalogHash:'catalog',docsHash:'docs'},routes:UI_API_ROUTES});
  return {workspace,target,manifest};
}
test('portable kit hashes every finite payload and exports the real operation routes',async()=>{
  const f=await fixture();
  assert.equal(f.manifest.files.length,4);
  assert.equal(f.manifest.installation.backgroundService,false);
  for(const file of [...f.manifest.files,f.manifest.installer]){
    const bytes=await readFile(resolve(f.target,file.url));
    assert.equal(sha(bytes),file.sha256);assert.equal(bytes.length,file.sizeBytes);
  }
  const index=JSON.parse(await readFile(resolve(f.target,'routes.json'),'utf8'));
  assert.deepEqual(index.routes,UI_API_ROUTES);
  assert.deepEqual(findRoutes(index,'moveTool').map(r=>r.action),['moveTool']);
  assert(findRoutes(index,'轮廓拉伸').some(route=>route.action==='profileExtrude'),'Chinese names derive from actual UI/tool labels');
  assert.equal((await findLocalRoutes('moveTool',{file:resolve(f.target,'routes.json')}))[0].action,'moveTool');
  assert.deepEqual(findRoutes(index,'not-a-tool'),[]);
  const published=JSON.parse(await readFile(resolve(f.target,'agent-kit.json'),'utf8'));
  assert.deepEqual(published,f.manifest);
});

function channel(api){
  const calls=[];
  const send=async(method,params)=>{
    calls.push({method,params});assert.equal(method,'Runtime.evaluate');assert.equal(params.awaitPromise,true);assert.equal(params.returnByValue,true);
    try{return {result:{type:'object',value:await vm.runInNewContext(params.expression,{window:{webcad:{api}}})}};}
    catch(error){return {exceptionDetails:{text:'Uncaught',exception:{description:error.message}}};}
  };
  return {send,calls};
}
test('CDP helper awaits promises, obtains a fresh context per batch, and preserves non-success receipts',async()=>{
  let revision=4;const requests=[];
  const ch=channel({connect:async()=>({canExecute:true,blockers:[],catalogHash:'static-hash',requestContext:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:revision}}),
    run:async request=>{requests.push(request);revision++;return {status:requests.length===1?'completed':'partial',revisionAfter:revision};},
    readDocs:async args=>({text:args.docId,nextCursor:null}),getTools:async args=>args});
  const client=createPageClient({send:ch.send});
  const quoted='api."; throw new Error("injection")';
  assert.equal((await client.readDocs(quoted)).text,quoted);
  const steps=[{id:'shape',method:'add',args:{op:'box',params:{width:1,depth:2,height:3},refs:[]}}];
  const firstPlan=await client.connect();
  assert.equal((await client.run(steps,{context:firstPlan.requestContext})).status,'completed');
  const secondPlan=await client.connect();
  assert.equal((await client.run(steps,{context:secondPlan.requestContext})).status,'partial');
  assert.equal(requests[0].context.expectedRevision,4);assert.equal(requests[1].context.expectedRevision,5);
  assert.notEqual(requests[0].idempotencyKey,requests[1].idempotencyKey);
  assert.equal((await client.getTools(['box'])).expectedCatalogHash,'static-hash');
  await assert.rejects(client.call('not-a-method'),{code:'METHOD_UNKNOWN'});
  assert.equal(requests.length,2);
});
test('CDP transport uncertainty is never replayed and blockers prevent model writes',async()=>{
  let count=0;const requestContext={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:9};
  const client=createPageClient({send:async(_method,{expression})=>{
    if(expression.includes('const method="connect"'))return {result:{value:{canExecute:true,requestContext}}};
    count++;throw new Error('lost transport after commit');
  }});
  const error=await client.run([{id:'x',method:'add',args:{op:'box',params:{},refs:[]}}],{context:requestContext}).catch(error=>error);
  assert.equal(error.code,'UNKNOWN_OUTCOME');assert.equal(error.outcome,'unknown');assert.equal(count,1);
  assert.equal(error.request.context.expectedRevision,9);assert.equal(error.request.idempotencyKey,error.idempotencyKey);
  const blockedChannel=channel({connect:async()=>({canExecute:false,blockers:['PREVIEW_ACTIVE']})});
  const blocked=createPageClient({send:blockedChannel.send});
  await assert.rejects(blocked.run([{id:'x'}],{context:requestContext}),error=>error.code==='PAGE_BLOCKED'&&error.blockers[0]==='PREVIEW_ACTIVE');
  assert.equal(blockedChannel.calls.length,1);
  const exceptional=createPageClient({send:async()=>({exceptionDetails:{text:'syntax failure'}})});
  await assert.rejects(exceptional.connect(),{code:'PAGE_SCRIPT_ERROR'});
  assert.throws(()=>createPageClient(),{code:'CHANNEL_REQUIRED'});
});
test('planning context cannot be silently replaced by a newer revision or another document',async()=>{
  const context={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:3};
  for(const changed of [{...context,expectedRevision:4},{...context,documentInstanceId:'other'},{...context,sessionId:'other'},{...context,documentId:'other'}]){
    const ch=channel({connect:async()=>({canExecute:true,requestContext:changed})});
    const client=createPageClient({send:ch.send});
    await assert.rejects(client.run([{id:'shape'}],{context}),{code:'STALE_CONTEXT'});
    assert.equal(ch.calls.length,1,'only read connect; do not send run');
  }
  const noContext=createPageClient({send:async()=>{throw new Error('must not call channel');}});
  await assert.rejects(noContext.run([{id:'shape'}]),{code:'CONTEXT_REQUIRED'});
});

function powershell(args){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.WEBCAD_TEST_POWERSHELL||'powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',...args],{cwd:root,windowsHide:true});
    let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
    child.on('error',reject);child.on('exit',code=>resolve({code,output,errors}));
  });
}
async function snapshot(directory){
  const result={};
  async function walk(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())await walk(join(dir,entry.name),name+'/');else result[name]=sha(await readFile(join(dir,entry.name)));}}
  await walk(directory);return result;
}
test('PowerShell installs and updates in isolation; failed download/hash/path leaves the prior package intact',{skip:process.platform!=='win32'&&!process.env.WEBCAD_TEST_POWERSHELL,timeout:90000},async()=>{
  const f=await fixture();let mode='valid';
  const server=createServer(async(request,response)=>{
    try{
      const pathname=new URL(request.url,'http://localhost/').pathname;
      if(!pathname.startsWith('/automation/')){response.writeHead(404).end();return;}
      const relative=pathname.slice('/automation/'.length);
      if(!['agent-kit.json',...f.manifest.files.map(file=>file.url)].includes(relative)){response.writeHead(404).end();return;}
      if(mode==='missing'&&relative.endsWith('page-client.mjs')){response.writeHead(404).end();return;}
      let bytes=await readFile(resolve(f.target,relative));
      if(mode==='tampered'&&relative.endsWith('page-client.mjs')){bytes=Buffer.from(bytes);bytes[0]^=1;}
      if(mode==='traversal'&&relative==='agent-kit.json'){const manifest=structuredClone(f.manifest);manifest.files[0].relativePath='../outside.txt';bytes=Buffer.from(JSON.stringify(manifest));}
      response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length}).end(bytes);
    }catch(error){response.writeHead(500).end(error.message);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base=`http://127.0.0.1:${server.address().port}/`;
    const destination=resolve(f.workspace,'installed/webcad-page-api');
    const args=[resolve(f.target,'install-agent.ps1'),'-BaseUrl',base,'-Destination',destination];
    const first=await powershell(args);assert.equal(first.code,0,first.errors);
    const firstResult=JSON.parse(first.output);assert.equal(firstResult.status,'installed');assert.equal(firstResult.backup,null);
    const local=JSON.parse(await readFile(resolve(destination,'routes.json'),'utf8'));assert.deepEqual(local.routes,UI_API_ROUTES);
    await writeFile(resolve(destination,'personal-note.txt'),'keep in backup','utf8');
    const second=await powershell(args);assert.equal(second.code,0,second.errors);
    const secondResult=JSON.parse(second.output);assert.equal(await readFile(resolve(secondResult.backup,'personal-note.txt'),'utf8'),'keep in backup');
    assert.equal(dirname(secondResult.backup),join(dirname(destination),'.agent-backups'),'old skills live in a hidden backup container');
    const installedHashes=await snapshot(destination);
    for(const failedMode of ['missing','tampered','traversal']){
      mode=failedMode;const failed=await powershell(args);assert.notEqual(failed.code,0,`must reject ${failedMode}`);
      assert.deepEqual(await snapshot(destination),installedHashes,`${failedMode} must not alter the installed package`);
    }
    const state=JSON.parse(await readFile(resolve(destination,'.agent-kit.json'),'utf8'));assert.equal(state.installedFrom,base+'automation/');
    const left=await readdir(dirname(destination));assert.equal(left.some(name=>name.includes('.stage-')||name.endsWith('.lock')),false,'cleanup the bounded staging and lock paths');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
