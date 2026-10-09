import test from 'node:test';
import assert from 'node:assert/strict';
import {getTool} from '../src/page-api-docs.js';
import {normalizeOperationParams,normalizeOperationPatch} from '../src/operation-registry.js';
import {UI_LAYOUT} from '../src/ui/config/ui-layout.js';
import {UI_API_ROUTES} from '../src/ui-api-coverage.js';
import {adaptUISelection} from '../src/ui-selection-adapter.js';
import {assertPlacementCoverage} from '../src/placement-policy.js';
test('one primary rounding entrance preserves expert routes and strict shared operation',()=>{
 const group=UI_LAYOUT.tabs.find(t=>t.id==='finish').groups[0];
 assert.deepEqual(group[1].filter(id=>!group[2].overflowActions.includes(id)),['round','chamfer']);
 for(const id of ['fillet','roundEnd','rounding'])assert(group[2].overflowActions.includes(id));
 assert(UI_API_ROUTES.round.tools.includes('preview.update'));assertPlacementCoverage();
 const card=getTool({id:'round'});assert(card.strictContract);assert(card.outputSchema.properties.roundReport);
 assert.deepEqual(normalizeOperationParams('round',adaptUISelection('round',{},['a'],{bodyId:'a',type:'edge',ids:[2]})),{mode:'auto',strength:.5,edgeIds:[2]});
 assert.throws(()=>normalizeOperationParams('round',{edgeIds:[2],strength:0}));assert.throws(()=>normalizeOperationParams('round',{edgeIds:[2],depthMm:-1}));
});
test('planar face scope is explicit, exclusive and editable from the UI and API',()=>{
 const p=adaptUISelection('round',{radiusMm:.2},['a'],{bodyId:'a',type:'face',ids:[4]});
 assert.deepEqual(normalizeOperationParams('round',p),{mode:'auto',strength:.5,radiusMm:.2,faceIds:[4]});
 assert.throws(()=>normalizeOperationParams('round',{edgeIds:[1],faceIds:[4]}));
 assert.throws(()=>normalizeOperationParams('round',{}));
 const patch=normalizeOperationPatch('round',{edgeIds:[1],radiusMm:.2},{faceIds:[4]});
 assert.deepEqual(patch,{mode:'auto',strength:.5,radiusMm:.2,faceIds:[4]});
 assert.throws(()=>normalizeOperationPatch('round',patch,{edgeIds:[1],faceIds:[4]}));
});
