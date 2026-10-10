import fs from 'node:fs/promises';
import path from 'node:path';
import {getTool,infoMetadata} from '../src/page-api-docs.js';
import {UI_LAYOUT} from '../src/ui-layout.js';
import {PAGE_CLIENT_METHODS} from '../skills/webcad-page-api/scripts/page-client.mjs';
const root=path.resolve(import.meta.dirname,'..'),map=JSON.parse(await fs.readFile(path.join(root,'contracts/operation-impact-map.json')));
const actions=UI_LAYOUT.tabs.flatMap(t=>t.groups.flatMap(([,ids])=>ids));
if(actions.filter(id=>id==='servicesSettings').length!==1||actions.includes('logoConverterSettings'))throw new Error('Services must be the sole configuration entrance');
for(const row of map.operations){for(const file of row.schemaFiles)await fs.access(path.join(root,file));for(const file of row.targetedTests)await fs.access(path.join(root,file));for(const id of row.publicToolIds)if(!getTool({id}))throw new Error(`Missing public tool ${id}`);}
for(const method of ['getServices','setServices','getServicesCapabilities','getServicesJob','getServicesRequest','cancelServicesJob','clearServicesCredential'])if(!PAGE_CLIENT_METHODS.includes(method))throw new Error(`Host helper omits ${method}`);
const index=JSON.parse(await fs.readFile(path.join(root,'public/automation/index.json'))),runtime=infoMetadata();
if(index.metadata.catalogHash!==runtime.catalogHash||index.metadata.docsHash!==runtime.docsHash)throw new Error('Generated knowledge is stale');
console.log('Services impact paths, schemas, tools, helper and generated hashes are consistent. Operation-specific native gates remain authoritative.');
