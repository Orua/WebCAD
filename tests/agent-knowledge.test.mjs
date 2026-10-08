import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
import {syncKnowledge,routeKnowledge,readLocalKnowledge,routeProductSource} from '../skills/webcad-page-api/scripts/knowledge-cache.mjs';
import {createPageClient,PAGE_CLIENT_METHODS,PAGE_CLIENT_FILE_METHODS} from '../skills/webcad-page-api/scripts/page-client.mjs';
import {discoveryMetadata,infoMetadata,getTool} from '../src/page-api-docs.js';
const root=resolve('.');
const connection=()=>({...discoveryMetadata(),canExecute:true,requestContext:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1}});
async function fixture(){
  await mkdir(join(root,'agent/temp'),{recursive:true});const directory=await mkdtemp(join(root,'agent/temp/knowledge-test-'));let downloads=0;
  const fetchImpl=async url=>{downloads++;const name=new URL(url).pathname.split('/').at(-1);try{return new Response(await readFile(join(root,'public/automation',name)),{status:200});}catch{return new Response('missing',{status:404});}};
  return {directory,fetchImpl,get downloads(){return downloads;}};
}
test('first handshake verifies and downloads once; cached reconnect stays local and corruption refreshes',async()=>{
  const f=await fixture(),options={baseUrl:'http://localhost:667/sub/?document=live-id',directory:f.directory,fetchImpl:f.fetchImpl};
  let cache=await syncKnowledge(connection(),options);assert.equal(cache.cacheHit,false);assert.equal(f.downloads,4);
  assert.equal(cache.sourceBaseUrl,'http://localhost:667/sub/');
  cache=await syncKnowledge(connection(),options);assert.equal(cache.cacheHit,true);assert.equal(f.downloads,4);
  assert.equal((await syncKnowledge(connection(),{...options,fetchImpl:null})).cacheHit,true,'verified static cache requires no network capability');
  const manifest=JSON.parse(await readFile(cache.manifestPath,'utf8'));assert(!('requestContext' in manifest));assert(!('sessionId' in manifest));
  await writeFile(join(cache.directory,'index.json'),'corrupted');cache=await syncKnowledge(connection(),options);
  assert.equal(cache.cacheHit,false);assert.equal(f.downloads,8);
  await assert.rejects(syncKnowledge({...connection(),docsHash:'sha256:'+'0'.repeat(64)},options),{code:'KNOWLEDGE_STALE'});
  await assert.rejects(syncKnowledge(connection(),{...options,baseUrl:'http://localhost:16666/',fetchImpl:null}),{code:'KNOWLEDGE_DOWNLOAD_UNAVAILABLE'});
});
test('task routes select source/rounding/logo and read only complete requested docs/cards',async()=>{
  const f=await fixture(),cache=await syncKnowledge(connection(),{baseUrl:'http://localhost:667/',directory:f.directory,fetchImpl:f.fetchImpl});
  for(const [query,id]of [['DWG图纸重建','source-reconstruction'],['相邻边R角圆润','rounding'],['LOGO凹字浮雕','logo-relief'],['漏接材料核对','inspection']])assert.equal((await routeKnowledge(cache,query))[0].id,id);
  const selected=await readLocalKnowledge(cache,{docIds:['api.reconstruction'],toolIds:['inspectDesign']});
  assert.equal(selected.items.length,2);assert(selected.items.every(x=>x.status==='read'));assert.equal(selected.items[1].card.docsHash,getTool({id:'inspectDesign'}).docsHash);
  const budget=await readLocalKnowledge(cache,{toolIds:['quickModel'],maxChars:1000});assert.equal(budget.items[0].status,'omitted');assert(!('card' in budget.items[0]));
});
test('host helper downloads on connect and blocks run if required host cache is absent',async()=>{
  const f=await fixture();let writes=0;const api={connect:connection,run:()=>{writes++;return {status:'completed'};}};
  const send=async(method,params)=>({result:{value:await vm.runInNewContext(params.expression,{window:{webcad:{api}}})}});
  const bare=createPageClient({send,keyFactory:()=> 'key'}),c=await bare.connect();assert.equal(c.knowledgeStatus.status,'download_required');
  await assert.rejects(bare.run([{id:'part',method:'add',args:{}}],{context:c.requestContext}),{code:'KNOWLEDGE_CACHE_REQUIRED'});assert.equal(writes,0);
  const client=createPageClient({send,keyFactory:()=> 'key',knowledge:{baseUrl:'http://localhost:667',directory:f.directory,fetchImpl:f.fetchImpl}});
  const ready=await client.connect();assert.equal(ready.knowledgeStatus.status,'ready');assert.equal(f.downloads,4);
  assert.equal((await client.run([{id:'part',method:'add',args:{}}],{context:ready.requestContext})).status,'completed');assert.equal(f.downloads,4);assert.equal(writes,1);
  assert.equal((await client.route('三视图DWG重建'))[0].id,'source-reconstruction');
});
test('portable host helper covers every current public method and file call',()=>{
  const metadata=infoMetadata();for(const id of metadata.methods)assert(PAGE_CLIENT_METHODS.includes(id),id);
  for(const id of metadata.filesMethods)assert(PAGE_CLIENT_FILE_METHODS.includes(id),id);
});

test('unfamiliar source routing preserves evidence gaps and part scope instead of guessing a template',async()=>{
  const f=await fixture(),cache=await syncKnowledge(connection(),{baseUrl:'http://localhost:667/',directory:f.directory,fetchImpl:f.fetchImpl});
  const brief={schemaVersion:1,typeId:7,familyId:'rivet',scope:'part',targetPartIds:['B'],source:{kind:'dwg',reference:'source hash + valid frame + B side section; source INSUNITS4 mm',version:'resolved',geometry:'complete',units:'mm'},parts:[{id:'A',role:'decoration',reference:'reference head only',section:'unresolved'},{id:'B',role:'purchased',reference:'B profile dimensions',section:'resolved'}],unknowns:[]};
  const route=await routeProductSource(cache,brief);
  assert.equal(route.status,'planning_ready');assert.equal(route.canPlan,true);assert.equal(route.sourceEvidenceVerified,false);
  assert.deepEqual(route.targetPartIds,['B']);assert.deepEqual(route.referencePartIds,['A']);
  const docs=await readLocalKnowledge(cache,{docIds:route.docIds,toolIds:route.toolIds});assert(docs.items.every(x=>x.status==='read'));
  const combined=await routeProductSource(cache,brief,{includeKnowledge:true});assert.deepEqual(combined.knowledge,docs,'Combined routing reads exactly the same complete contracts from one verified snapshot');
  const small=await routeProductSource(cache,brief,{includeKnowledge:true,maxChars:1000});assert(small.knowledge.items.some(x=>x.status==='omitted'),'Budget exhaustion is explicit rather than truncating a tool contract');
  await assert.rejects(routeProductSource(cache,brief,{includeKnowledge:'yes'}),{code:'KNOWLEDGE_QUERY_INVALID'});
  for(const source of [{...brief.source,kind:'photo'},{...brief.source,geometry:'partial'},{...brief.source,version:'unresolved'}])assert.equal((await routeProductSource(cache,{...brief,source})).canPlan,false);
  for(const units of [undefined,'unresolved','cm','m','in']){
    const source={...brief.source};if(units===undefined)delete source.units;else source.units=units;
    const unitRoute=await routeProductSource(cache,{...brief,source});assert.equal(unitRoute.canPlan,false);
    assert(unitRoute.blockers.some(b=>b.code===(units===undefined||units==='unresolved'?'SOURCE_UNITS_UNRESOLVED':'SOURCE_UNIT_CONVERSION_REQUIRED')));
  }
  await assert.rejects(routeProductSource(cache,{...brief,source:{...brief.source,units:'metres'}}),{code:'SOURCE_BRIEF_INVALID'});
  const assembly=await routeProductSource(cache,{...brief,scope:'assembly',targetPartIds:undefined});assert(assembly.blockers.some(b=>b.partId==='A'));
  const mixed=await routeProductSource(cache,{...brief,typeId:29,familyId:undefined});assert.equal(mixed.canPlan,false);assert.equal(mixed.candidateFamilies.length,0);
  const crossCategory=await routeProductSource(cache,{...brief,typeId:5,familyId:'wire-loop'});assert.equal(crossCategory.canPlan,true);assert.equal(crossCategory.categoryHintOverridden,true,'A reviewed triangular wire ring must not be forced into its ladder-buckle category');
  const missing=await routeProductSource(cache,{...brief,familyId:undefined});assert.equal(missing.status,'needs_family');assert.equal(missing.toolIds.length,0);
  const unknown=await routeProductSource(cache,{...brief,unknowns:['engagement length unresolved']});assert(unknown.blockers.some(b=>b.code==='SOURCE_UNKNOWN'));
  await assert.rejects(routeProductSource(cache,{...brief,targetPartIds:['C']}),{code:'SOURCE_BRIEF_INVALID'});
  await assert.rejects(routeProductSource(cache,{...brief,parts:[brief.parts[1],brief.parts[1]]}),{code:'SOURCE_BRIEF_INVALID'});
});
