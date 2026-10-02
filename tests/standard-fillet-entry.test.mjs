import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_LAYOUT} from '../src/ui/config/ui-layout.js';
import {UI_API_ROUTES} from '../src/ui-api-coverage.js';
import {getTool,searchTools} from '../src/page-api-docs.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
import {adaptUISelection} from '../src/ui-selection-adapter.js';

test('standard fillet remains visible and discoverable alongside automatic polishing',()=>{
 const actions=UI_LAYOUT.tabs.find(t=>t.id==='finish').groups.flatMap(g=>g[1]);
 assert(actions.includes('fillet'));assert(actions.includes('rounding'));
 const card=getTool({id:'fillet'});
 assert.equal(card.legacyOnly,undefined);
 assert(searchTools({query:'fillet',limit:20}).items.some(x=>x.id==='fillet'));
 assert(UI_API_ROUTES.fillet.tools.includes('preview.commit'));
 assert.equal(card.inputSchema.required.includes('radius'),true);
});
test('simple UI fillet uses the exact supplied radius and selected source edge',()=>{
 const params=adaptUISelection('fillet',{radius:.3},['body'],{bodyId:'body',type:'edge',ids:[0]});
 assert.deepEqual(normalizeOperationParams('fillet',params),{radius:.3,edgeIds:[0]});
 assert.equal(Object.hasOwn(params,'strength'),false);
 assert.equal(Object.hasOwn(params,'specVersion'),false);
 assert.deepEqual(normalizeOperationParams('fillet',{radius:.3,allEdges:true}),{radius:.3,allEdges:true});
});
