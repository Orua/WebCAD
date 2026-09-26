import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {TOOL_LABELS} from '../src/tool-labels.js';
import {UI_LAYOUT} from '../src/ui-layout.js';
import {getTool} from '../src/page-api-docs.js';

const sha256=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');

/** Publish a finite installable skill package from the actual UI/API routes. */
export async function generateAgentKit({root,target,metadata,routes}){
  if(!root||!target||!metadata||!routes||typeof routes!=='object'||Array.isArray(routes))throw new TypeError('root, target, metadata and the actual UI_API_ROUTES object are required');
  const rootPath=resolve(root),targetPath=resolve(target);
  const routeIndex={schemaVersion:1,generatedFrom:'src/ui-api-coverage.js',pageApiVersion:metadata.pageApiVersion,buildId:metadata.buildId,catalogHash:metadata.catalogHash,docsHash:metadata.docsHash,
    routes:Object.fromEntries(Object.entries(routes).sort(([a],[b])=>a.localeCompare(b)).map(([action,route])=>[action,{...route}])),
    labels:Object.fromEntries(Object.entries(routes).map(([action,route])=>[action,[...new Set([TOOL_LABELS[action],UI_LAYOUT.shortLabels[action],...(route.tools||[]).map(id=>{const tool=getTool({id});return tool.label||tool.title;})].filter(Boolean))].join(' / ')]))};
  const sources=[['SKILL.md','skills/webcad-page-api/SKILL.md'],['references/connection.md','skills/webcad-page-api/references/connection.md'],['scripts/page-client.mjs','skills/webcad-page-api/scripts/page-client.mjs']];
  const outputs=[];
  for(const [relativePath,source]of sources)outputs.push({relativePath,url:`webcad-page-api/${relativePath}`,bytes:await readFile(resolve(rootPath,source))});
  outputs.push({relativePath:'routes.json',url:'routes.json',bytes:json(routeIndex)});
  const installer={relativePath:'install-agent.ps1',url:'install-agent.ps1',bytes:await readFile(resolve(rootPath,'scripts/agent-kit/install-agent.ps1'))};
  const descriptor=({bytes,...file})=>({...file,sizeBytes:bytes.length,sha256:sha256(bytes)});
  const manifest={schemaVersion:1,id:'webcad-page-api',version:metadata.pageApiVersion,buildId:metadata.buildId,catalogHash:metadata.catalogHash,docsHash:metadata.docsHash,
    entrypoints:{browser:'agent-start.html',machine:'agent-start.json',routes:'routes.json',skill:'webcad-page-api/SKILL.md',client:'webcad-page-api/scripts/page-client.mjs',install:'install-agent.ps1'},
    files:outputs.map(descriptor),installer:descriptor(installer),
    installation:{defaultDestination:'%USERPROFILE%/.codex/skills/webcad-page-api',explicitExecutionRequired:true,hashAlgorithm:'SHA-256',backupBeforeUpdate:true,backgroundService:false},
    cache:{optional:true,index:'index.json',library:'tool-library.mjs',scope:'static contracts only; live context, body IDs and topology are never reusable cache'}};
  const all=[...outputs,installer,{url:'agent-kit.json',bytes:json(manifest)}];
  // Preserve previous generated kit files too; keep backups inside the project.
  const backupRoot=resolve(rootPath,'agent/backups',new Date().toISOString().replace(/[:.]/g,'-')+'-agent-kit-generated');
  for(const output of all){const destination=resolve(targetPath,output.url);await mkdir(dirname(destination),{recursive:true});try{if((await stat(destination)).isFile()){const rel=relative(rootPath,destination);if(rel.startsWith('..')||isAbsolute(rel))throw new Error('Generated target must be within root when replacing an existing package');const backup=resolve(backupRoot,rel);await mkdir(dirname(backup),{recursive:true});await copyFile(destination,backup);}}catch(error){if(error.code!=='ENOENT')throw error;}await writeFile(destination,output.bytes);}
  return manifest;
}
