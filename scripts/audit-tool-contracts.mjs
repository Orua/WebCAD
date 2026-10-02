// Static contract audit only. Geometry acceptance requires separate receipts.
import fs from 'node:fs';
import {getTool,searchTools,infoMetadata,readDocs} from '../src/page-api-docs.js';
import {listOperations,normalizeOperationParams} from '../src/operation-registry.js';
import {UI_API_ROUTES} from '../src/ui-api-coverage.js';
import {UI_LAYOUT} from '../src/ui/config/ui-layout.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
const cards=[];let cursor;
do{const page=searchTools({query:'',limit:50,...(cursor?{cursor}:{})});cards.push(...page.items.map(({id})=>getTool({id})));cursor=page.nextCursor;}while(cursor);
const errors=[],warnings=[],byId=new Map(cards.map(c=>[c.id,c]));
const check=(ok,message)=>{if(!ok)errors.push(message);};
for(const card of cards){
 for(const key of ['version','docsHash','description'])check(!!card[key],`${card.id}: missing ${key}`);
 if(card.docs)try{readDocs({docId:card.docs});}catch(e){errors.push(`${card.id}: unreadable ${card.docs}: ${e.code}`);}
 if(card.relatedTools)for(const id of card.relatedTools)check(byId.has(id),`${card.id}: missing related tool ${id}`);
 if(card.inputSchema&&card.minimalExample?.op){
  const validate=params=>card.strictContract&&!card.id.startsWith('template.')?normalizeOperationParams(card.id,params):validateSchema(card.inputSchema,params);
  for(const key of ['minimalExample','normalExample']){
   const example=card[key];
   check(!!example?.params,`${card.id}: missing ${key}`);
   if(example?.params)try{validate(example.params);if(card.refsSchema)validateSchema(card.refsSchema,example.refs,'refs');}catch(e){errors.push(`${card.id}: ${key} invalid: ${e.code||e.message}`);}
  }
  for(const example of card.invalidExamples||[]){
   let error;try{validate(example.params);}catch(e){error=e;}
   check(!!error,`${card.id}: invalid example unexpectedly accepted`);
   if(error)check(error.code===example.errorCode,`${card.id}: invalid example declares ${example.errorCode}, returns ${error.code||error.message}`);
  }
  if(card.minimalExample?.op)check(card.v2Executable===true,`${card.id}: executable page example contradicts capability flag`);
 }
 if(!Array.isArray(card.errorCodes))warnings.push(`${card.id}: missing errorCodes declaration (use [] for a pure read)`);
}
for(const op of listOperations())check(byId.has({import:'files.import',remove:'feature.remove'}[op.id]||op.id),`${op.id}: operation not discoverable`);
for(const [action,route] of Object.entries(UI_API_ROUTES))for(const id of route.tools)check(byId.has(id),`${action}: missing public route ${id}`);
const actions=[...UI_LAYOUT.header,...UI_LAYOUT.fileMenu,...UI_LAYOUT.viewportActions].map(a=>a.action).concat(UI_LAYOUT.tabs.flatMap(t=>t.groups.flatMap(g=>g[1])),Object.values(UI_LAYOUT.controls).flatMap(c=>c.action?[c.action]:c.items.map(i=>i[1])));
for(const id of actions)check(!!UI_API_ROUTES[id],`${id}: visible UI lacks route`);
const meta=infoMetadata(),report={generatedAt:new Date().toISOString(),pageApiVersion:meta.pageApiVersion,catalogHash:meta.catalogHash,docsHash:meta.docsHash,counts:{cards:cards.length,operations:listOperations().length,strictOperations:listOperations().filter(c=>c.strictContract).length,pageMethods:meta.methods.length,fileMethods:meta.filesMethods.length,uiRoutes:Object.keys(UI_API_ROUTES).length},errors,warnings,largestCards:cards.map(c=>({id:c.id,chars:JSON.stringify(c).length})).sort((a,b)=>b.chars-a.chars).slice(0,12),geometryAcceptance:'NOT ESTABLISHED by static inventory or schema checks; see separate kernel and browser receipts.'};
const out='agent/output/freecad-audit-20261002/contract-audit.json';fs.mkdirSync('agent/output/freecad-audit-20261002',{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:out,...report.counts,errors,warnings}));if(errors.length)process.exitCode=1;
