import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {writeGeneratedFile as writeFile} from './generated-file-write.mjs';
import {AGENT_KNOWLEDGE,KNOWLEDGE_ROUTES} from '../src/agent-knowledge.js';
import {PRODUCT_FAMILIES} from '../src/product-source-guidance.js';
import {zipSync} from 'three/addons/libs/fflate.module.js';
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export async function generateAgentKnowledge({target,metadata,cards,docs}){
  for(const route of KNOWLEDGE_ROUTES){
    for(const id of [...route.docs,route.readFirst])if(!Object.hasOwn(docs,id))throw new Error(`Knowledge route ${route.id} has unknown doc ${id}`);
    for(const id of [...route.tools,...(route.branches??[]).flatMap(branch=>branch.tools)])if(!cards.some(card=>card.id===id))throw new Error(`Knowledge route ${route.id} has unknown tool ${id}`);
  }
  const routing={schemaVersion:1,catalogHash:metadata.catalogHash,docsHash:metadata.docsHash,bootstrapDocIds:AGENT_KNOWLEDGE.bootstrapDocIds,modeling:AGENT_KNOWLEDGE.modeling,
    selectionPolicy:'Read api.reading-map once; route by task; read only readFirst; compare selectionGuide; fetch selected complete cards. docs/tools are candidates, not mandatory bulk reads. Exact UI actions use routes.json. Live IDs come from the page.',routes:KNOWLEDGE_ROUTES,productFamilies:PRODUCT_FAMILIES};
  for(const f of PRODUCT_FAMILIES){
    if(!Object.hasOwn(docs,f.docId))throw new Error(`Product family ${f.id} has unknown doc`);
    for(const id of f.tools)if(!cards.some(card=>card.id===id))throw new Error(`Product family ${f.id} has unknown tool ${id}`);
  }
  await writeFile(resolve(target,'agent-routing.json'),JSON.stringify(routing,null,2)+'\n');
  const files=[];
  for(const name of ['index.json','agent-routing.json','routes.json']){
    const bytes=await readFile(resolve(target,name));
    files.push({name,url:name,sizeBytes:bytes.length,sha256:sha(bytes)});
  }
  const bundleNames=[...files.map(f=>f.name),'agent-kit.json','webcad-page-api/SKILL.md','webcad-page-api/references/connection.md','webcad-page-api/scripts/page-client.mjs','webcad-page-api/scripts/knowledge-cache.mjs','webcad-page-api/scripts/static-archive.mjs','remote-agent.json','remote-agent/host-adapter.js','remote-agent/runtime-contract.json','remote-agent/layout-planner.py.txt','remote-agent/logo-preparer.js'];
  const payloads=await Promise.all(bundleNames.map(async name=>[name,await readFile(resolve(target,name))]));
  const archiveFiles=payloads.map(([name,data])=>({name,sizeBytes:data.length,sha256:sha(data)}));
  const version=sha(Buffer.from(JSON.stringify(archiveFiles)));
  const archiveBytes=Buffer.from(zipSync(Object.fromEntries(payloads.map(([name,data])=>[name,[data,{mtime:new Date('2020-01-01T00:00:00Z')}]])),{level:6}));
  await writeFile(resolve(target,'agent-bundle.zip'),archiveBytes);
  const manifest={schemaVersion:1,buildId:metadata.buildId,knowledgeVersion:version,pageApiVersion:metadata.pageApiVersion,catalogHash:metadata.catalogHash,docsHash:metadata.docsHash,
    archive:{url:'agent-bundle.zip',format:'zip',sizeBytes:archiveBytes.length,sha256:sha(archiveBytes),files:archiveFiles},
    policy:AGENT_KNOWLEDGE.policy,scope:'static-docs-and-contracts-only',files,totalBytes:files.reduce((n,f)=>n+f.sizeBytes,0),
    routing:'agent-routing.json',index:'index.json',uiRoutes:'routes.json',bootstrapDocIds:AGENT_KNOWLEDGE.bootstrapDocIds,modeling:AGENT_KNOWLEDGE.modeling,
    contextPolicy:AGENT_KNOWLEDGE.contextPolicy,cache:AGENT_KNOWLEDGE.cache};
  await writeFile(resolve(target,'agent-knowledge.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
