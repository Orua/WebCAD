import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {syncKnowledge,routeKnowledge} from '../skills/webcad-page-api/scripts/knowledge-cache.mjs';
import {discoveryMetadata,getTool,getTools,readDocs} from '../src/page-api-docs.js';

test('layered routes stay specific and every guide resolves',async()=>{
  await mkdir('agent/temp',{recursive:true});
  const directory=await mkdtemp('agent/temp/reading-guide-');
  try{
    const cache=await syncKnowledge(discoveryMetadata(),{baseUrl:'https://example.invalid/',directory,
      fetchImpl:async url=>new Response(await readFile(new URL('../public/automation/'+new URL(url).pathname.split('/').at(-1),import.meta.url)))});
    for(const [query,expected] of [['导出 STEP','files'],['export(STEP)','files'],['STL export','files'],['截面扫掠放样','profiles'],['相邻边圆角','rounding'],['灰度图浮雕','relief-taxonomy']]){
      const routes=await routeKnowledge(cache,query);assert.equal(routes[0].id,expected,query);
      assert(readDocs({docId:routes[0].readFirst}).text);
      assert(routes[0].matchedTerms.length);
    }
    assert.equal((await routeKnowledge(cache,'footstep')).length,0);
    for(const id of ['curveSweep','advancedLoft','fillet','cut','logo','files.export']){
      const card=getTool({id});assert(readDocs({docId:card.readingGuide}).text);
      assert(card.docsHash);
    }
    const error=getTools({ids:['not.a.tool']}).items[0].error;
    assert(error.code);assert.equal(error.recovery.automaticRetry,false);
  }finally{await rm(directory,{recursive:true,force:true});}
});


test('knowledge packages above former file and total limits remain hash verified',async()=>{
  await mkdir('agent/temp',{recursive:true});
  const directory=await mkdtemp('agent/temp/large-knowledge-');
  try{
    const manifest=JSON.parse(await readFile('public/automation/agent-knowledge.json','utf8'));
    const payloads=new Map();
    for(const file of manifest.files){
      let bytes=await readFile('public/automation/'+file.name);
      if(file.name==='index.json')bytes=Buffer.concat([bytes,Buffer.alloc(9*1024*1024,32)]);
      payloads.set(file.name,bytes);file.sizeBytes=bytes.length;
      file.sha256='sha256:'+createHash('sha256').update(bytes).digest('hex');
    }
    manifest.totalBytes=manifest.files.reduce((sum,file)=>sum+file.sizeBytes,0);
    const options={baseUrl:'https://example.invalid/',directory,fetchImpl:async url=>{
      const name=new URL(url).pathname.split('/').at(-1);
      return new Response(name==='agent-knowledge.json'?JSON.stringify(manifest):payloads.get(name));
    }};
    assert.equal((await syncKnowledge(discoveryMetadata(),options)).cacheHit,false);
    assert.equal((await syncKnowledge(discoveryMetadata(),options)).cacheHit,true);
  }finally{await rm(directory,{recursive:true,force:true});}
});
