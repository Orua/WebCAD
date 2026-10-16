import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOperationParams,getOperation} from '../src/operation-registry.js';
import {UI_LAYOUT} from '../src/ui/config/ui-layout.js';
import {UI_API_ROUTES} from '../src/ui-api-coverage.js';
import {placementPolicy} from '../src/placement-policy.js';
import routing from '../contracts/services/v1/execution-routing.json' with {type:'json'};
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('page execution gate admits tap and badge through the actual label registry',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const declarations=[source.match(/const labels = .*;/)[0],...source.matchAll(/Object\.assign\(labels,\{[^\n]+\}\);/g)].map(item=>typeof item==='string'?item:item[0]).join('\n');
 const labels=vm.runInNewContext(declarations+';labels');
 for(const op of ['tap','badge'])assert.ok(Object.hasOwn(labels,op),`${op} must pass add_feature/add_features`);
});

test('tap is a strict machining tool with local-only routing and explicit AI equivalent',()=>{
 const params={faceId:0,point:[6,6,10],threadSize:'M2.5',depthMm:3};
 assert.equal(normalizeOperationParams('tap',params).threadSize,'M2.5');
 for(const patch of [{threadSize:'M7'},{depthMm:0},{radius:2},{point:[0,0]}])assert.throws(()=>normalizeOperationParams('tap',{...params,...patch}));
 assert.equal(getOperation('tap').selectionTokenSupport.supported,true);
 assert.equal(placementPolicy('tap'),'N');
 assert.ok(UI_LAYOUT.tabs.find(t=>t.id==='solidMachine').groups.flatMap(g=>g[1]).includes('tap'));
 assert.ok(UI_API_ROUTES.tap.tools.includes('preview.commit'));
 assert.ok(routing.localOnlyOperations.includes('tap'));
});
