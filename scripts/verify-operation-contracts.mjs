import {listOperations,normalizeOperationParams} from '../src/operation-registry.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {operationRoutingClass} from '../src/operation-contracts.js';
export function verifyOperationContracts(){
 const cards=listOperations(),ids=new Set(cards.map(c=>c.id));
 for(const card of cards){const c=card.contract;
  for(const key of ['purpose','whenToUse','whenNotToUse','params','refs','limits','outputs','errors','examples','routing','related','synonyms','status'])if(c[key]===undefined)throw Error(`${card.id}: missing contract.${key}`);
  if(JSON.stringify(Object.keys(c.params).sort())!==JSON.stringify(Object.keys(card.inputSchema.properties||{}).sort()))throw Error(`${card.id}: parameter metadata differs from schema`);
  for(const [key,schema]of Object.entries(card.inputSchema.properties||{})){const p=c.params[key];if(schema.unit==='mm'&&(p.unit!=='mm'||!Array.isArray(p.range)))throw Error(`${card.id}.${key}: missing mm range`);if(!(card.inputSchema.required||[]).includes(key)&&!Object.hasOwn(p,'default'))throw Error(`${card.id}.${key}: missing omission/default policy`);}
  if(c.routing.class!==operationRoutingClass(card.id))throw Error(`${card.id}: routing mismatch`);
  for(const item of c.whenNotToUse)if(!ids.has(item.use)&&!['measure','queryGeometry','files.export'].includes(item.use))throw Error(`${card.id}: unknown alternative ${item.use}`);
  for(const ex of c.examples.invalid){let failure;try{card.strictContract?normalizeOperationParams(card.id,ex.params):validateSchema(card.inputSchema,ex.params);}catch(e){failure=e;}if(failure?.code!==ex.errorCode)throw Error(`${card.id}: invalid example expected ${ex.errorCode}, got ${failure?.code}`);}
 }
 return cards.length;
}
