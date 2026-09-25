import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createReferenceSystem,validateReferenceSystem} from '../src/work-frame.js';
test('version 1 identity survives native JSON save/reopen; identity-less legacy input gets one',()=>{
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const start=source.indexOf('function validateDocument('),end=source.indexOf('async function openFiles',start);
 const ctx={crypto,createReferenceSystem,validateReferenceSystem};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'this.validate=validateDocument;',ctx);
 const legacy={version:1,name:'Legacy',features:[{id:'b',op:'box',params:{width:50,depth:30,height:3},refs:[]}],imports:{},hidden:[]};
 const first=ctx.validate(legacy);assert.equal(first.version,2);assert.equal(typeof first.documentId,'string');assert(!Object.hasOwn(legacy,'documentId'));
 const second=ctx.validate(JSON.parse(JSON.stringify(first)));assert.equal(second.documentId,first.documentId);assert.deepEqual(JSON.parse(JSON.stringify(second.features)),legacy.features);
});
