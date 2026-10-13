import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createPageAPI} from '../src/page-api.js';
import {infoMetadata,getTool} from '../src/page-api-docs.js';
import {UI_API_ROUTES,requireUIRoute} from '../src/ui-api-coverage.js';
import {listOperations} from '../src/operation-registry.js';
import {UI_LAYOUT} from '../src/ui-layout.js';

// Structural registration gate. It deliberately does not label geometry tested.
export async function auditAgentInterfaces(root){
 const unexpected=()=>{throw Error('Structural audit must never execute a host operation');};
 const api=createPageAPI({files:unexpected,confirmSaved:unexpected}),metadata=infoMetadata(),methods=[...metadata.methods,...metadata.filesMethods.map(k=>'files.'+k)];
 for(const id of methods){const target=id.split('.').reduce((v,k)=>v?.[k],api);if(typeof target!=='function')throw Error(`Documented Agent method has no callable implementation: ${id}`);getTool({id});}
 const operations=listOperations().map(op=>{
  const id=op.id==='import'?'files.import':op.id==='remove'?'feature.remove':op.id;
  const card=getTool({id});
  if(!card.errorCodes?.length||!card.outputContract&&!card.outputSchema)throw Error(`Incomplete result/error contract: ${id}`);
  if(!['import','remove'].includes(op.id)&&(!card.inputSchema||!card.minimalExample||!card.v2Executable))throw Error(`Missing Agent operation contract: ${id}`);
  return {operation:op.id,toolId:id,entry:op.id==='import'?'files.import':'execute',schemaHash:card.schemaHash,geometryAcceptance:'see dated operation evidence'};
 });
 const sources=['src/ui.js'];
 async function walk(path){for(const entry of await readdir(join(root,path),{withFileTypes:true})){const child=path+'/'+entry.name;if(entry.isDirectory())await walk(child);else if(entry.name.endsWith('.js'))sources.push(child);}}
 await walk('src/ui');
 const discovered=[];
 for(const path of sources){const source=await readFile(join(root,path),'utf8');for(const m of source.matchAll(/\b(?:emit|run)\(\s*['"]([^'"]+)['"]/g)){requireUIRoute(m[1]);discovered.push({source:path,action:m[1]});}}
 for(const item of [...UI_LAYOUT.header,...(UI_LAYOUT.viewportActions||[])])requireUIRoute(item.action);
 for(const [action,route]of Object.entries(UI_API_ROUTES)){
  if(!methods.includes(route.method))throw Error(`UI route has no callable Agent method: ${action}/${route.method}`);
  for(const id of route.tools)getTool({id});
 }
 return {scope:'Registration, callable methods, schemas and UI mapping; not all-tool geometry acceptance',operationCount:operations.length,methodCount:methods.length,uiRouteCount:Object.keys(UI_API_ROUTES).length,uiSourceCount:sources.length,operations,discoveredActions:discovered};
}
