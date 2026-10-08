import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {writeGeneratedFile as writeFile} from './generated-file-write.mjs';
import {AGENT_KNOWLEDGE,KNOWLEDGE_ROUTES} from '../src/agent-knowledge.js';
import {PRODUCT_FAMILIES} from '../src/product-source-guidance.js';
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export async function generateAgentKnowledge({target,metadata,cards,docs}){
  for(const route of KNOWLEDGE_ROUTES){
    for(const id of route.docs)if(!Object.hasOwn(docs,id))throw new Error(`Knowledge route ${route.id} has unknown doc ${id}`);
    for(const id of route.tools)if(!cards.some(card=>card.id===id))throw new Error(`Knowledge route ${route.id} has unknown tool ${id}`);
  }
  const routing={schemaVersion:1,catalogHash:metadata.catalogHash,docsHash:metadata.docsHash,bootstrapDocIds:AGENT_KNOWLEDGE.bootstrapDocIds,
    selectionPolicy:'Route by task, read a workflow, then only needed complete cards. Exact UI actions use routes.json. Live context/IDs always come from the page.',routes:KNOWLEDGE_ROUTES,productFamilies:PRODUCT_FAMILIES};
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
  const manifest={schemaVersion:1,pageApiVersion:metadata.pageApiVersion,catalogHash:metadata.catalogHash,docsHash:metadata.docsHash,
    policy:AGENT_KNOWLEDGE.policy,scope:'static-docs-and-contracts-only',files,totalBytes:files.reduce((n,f)=>n+f.sizeBytes,0),
    routing:'agent-routing.json',index:'index.json',uiRoutes:'routes.json',bootstrapDocIds:AGENT_KNOWLEDGE.bootstrapDocIds,
    contextPolicy:AGENT_KNOWLEDGE.contextPolicy,cache:AGENT_KNOWLEDGE.cache};
  await writeFile(resolve(target,'agent-knowledge.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
