import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {zipSync} from 'three/addons/libs/fflate.module.js';
import {unpackKnowledgeZip} from '../skills/webcad-page-api/scripts/static-archive.mjs';
import {syncKnowledge} from '../skills/webcad-page-api/scripts/knowledge-cache.mjs';
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
test('public documentation-only archive is complete, hash verified and cached; arbitrary subsets rejected',async()=>{
 const root=resolve('public/automation'),manifest=JSON.parse(await readFile(join(root,'agent-knowledge.json'),'utf8'));
 const payloads=unpackKnowledgeZip(await readFile(join(root,'agent-bundle.zip')),manifest.archive);
 const names=['index.json','agent-routing.json','routes.json','webcad-page-api/SKILL.md','webcad-page-api/references/connection.md'];
 const bytes=Buffer.from(zipSync(Object.fromEntries(names.map(n=>[n,payloads.get(n)]))));
 const files=names.map(name=>({name,sizeBytes:payloads.get(name).length,sha256:digest(payloads.get(name))}));
 const publicManifest={...manifest,archive:{url:'agent-bundle.zip',format:'zip',sizeBytes:bytes.length,sha256:digest(bytes),files}};
 await mkdir(resolve('agent/temp'),{recursive:true});const directory=await mkdtemp(resolve('agent/temp/public-knowledge-test-'));
 const connection={buildId:manifest.buildId,catalogHash:manifest.catalogHash,docsHash:manifest.docsHash,onboarding:{knowledge:{bundleRequired:true}}};
 let downloads=0;
 const fetchImpl=async url=>{downloads++;return new Response(url.pathname.endsWith('agent-knowledge.json')?JSON.stringify(publicManifest):bytes);};
 try{
  const cache=await syncKnowledge(connection,{baseUrl:'http://localhost/webcad/',directory,fetchImpl});
  assert.equal(cache.installedFiles,5);assert.equal(cache.completeLibrary,true);assert.equal(downloads,2);
  assert.equal((await syncKnowledge(connection,{baseUrl:'http://localhost/webcad/',directory,fetchImpl:null})).cacheHit,true);
  for(const files of [publicManifest.archive.files.slice(0,-1),[...publicManifest.archive.files,{name:'unexpected.js',sizeBytes:1,sha256:digest('x')}]] ){
   const broken={...publicManifest,archive:{...publicManifest.archive,files}};
   await assert.rejects(syncKnowledge(connection,{baseUrl:'http://localhost/other/',directory,fetchImpl:async()=>new Response(JSON.stringify(broken))}),{code:'KNOWLEDGE_INVALID'});
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
