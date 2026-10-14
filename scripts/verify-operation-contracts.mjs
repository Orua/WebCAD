import {listOperations,normalizeOperationParams} from '../src/operation-registry.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {operationRoutingClass} from '../src/operation-contracts.js';
import {readFileSync,existsSync} from 'node:fs';
import policy from '../contracts/services/v1/execution-routing.json' with {type:'json'};
export function verifyOperationContracts(){
 const cards=listOperations(),ids=new Set(cards.map(c=>c.id));
 const impacts=JSON.parse(readFileSync(new URL('../contracts/operation-impact-map.json',import.meta.url)));
 if(impacts.operations.length!==cards.length||new Set(impacts.operations.map(row=>row.operation)).size!==cards.length)throw Error('Impact map must have one row per operation');
 for(const card of cards){const c=card.contract;
  const impact=impacts.operations.find(row=>row.operation===card.id);if(!impact)throw Error(`${card.id}: impact map row missing`);for(const path of impact.requiredTests||[])if(!existsSync(new URL('../'+path,import.meta.url)))throw Error(`${card.id}: missing required test ${path}`);
  const classes=[policy.localOnlyOperations,policy.boundedMeshOperations,policy.servicesEligibleOperations].filter(list=>list.includes(card.id));if(classes.length!==1)throw Error(`${card.id}: must belong to exactly one execution route`);
  for(const key of ['purpose','whenToUse','whenNotToUse','params','refs','limits','outputs','errors','examples','routing','related','synonyms','status'])if(c[key]===undefined)throw Error(`${card.id}: missing contract.${key}`);
  if(JSON.stringify(Object.keys(c.params).sort())!==JSON.stringify(Object.keys(card.inputSchema.properties||{}).sort()))throw Error(`${card.id}: parameter metadata differs from schema`);
  for(const [key,schema]of Object.entries(card.inputSchema.properties||{})){const p=c.params[key];if(schema.unit==='mm'&&(p.unit!=='mm'||!Array.isArray(p.range)))throw Error(`${card.id}.${key}: missing mm range`);if(!(card.inputSchema.required||[]).includes(key)&&!Object.hasOwn(p,'default'))throw Error(`${card.id}.${key}: missing omission/default policy`);}
  if(c.routing.class!==operationRoutingClass(card.id))throw Error(`${card.id}: routing mismatch`);
  for(const item of c.whenNotToUse)if(!ids.has(item.use)&&!['measure','queryGeometry','files.export'].includes(item.use))throw Error(`${card.id}: unknown alternative ${item.use}`);
  for(const path of c.sourcePaths||[]){const text=readFileSync(new URL('../'+path,import.meta.url),'utf8');for(const m of text.matchAll(/(?:meshError|fail|contractError)\(\s*['"]([A-Z][A-Z0-9_]+)['"]|code\s*:\s*['"]([A-Z][A-Z0-9_]+)['"]/g)){const code=m[1]||m[2];if(!c.errors.some(e=>e.code===code))throw Error(`${card.id}: source error ${code} missing from contract`);}}
  for(const ex of c.examples.invalid){let failure;try{card.strictContract?normalizeOperationParams(card.id,ex.params):validateSchema(card.inputSchema,ex.params);}catch(e){failure=e;}if(failure?.code!==ex.errorCode)throw Error(`${card.id}: invalid example expected ${ex.errorCode}, got ${failure?.code}`);}
 }
 return cards.length;
}
