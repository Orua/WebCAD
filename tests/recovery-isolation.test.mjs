import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {RECOVERY_KEYS,recoveryIndexEntry} from '../src/recovery-discovery.js';
test('recovery writes isolate two document runtime instances',async()=>{
 const source=fs.readFileSync(process.env.WEBCAD_TEST_MAIN_SOURCE??new URL('../src/main.js',import.meta.url),'utf8');
 const start=source.indexOf('async function autosave('),end=source.indexOf("document.addEventListener('keydown'",start);
 const records=new Map();
 const db={transaction:()=>{const tx={objectStore:()=>({put:(v,k)=>{records.set(k,structuredClone(v));queueMicrotask(()=>tx.oncomplete?.());}})};return tx;}};
 const context={RECOVERY_KEYS,recoveryIndexEntry,dbPromise:Promise.resolve(db),clone:structuredClone,Date,documentInstanceId:'one',revision:1,persistenceCheckpoint:'pending',documentModel:{version:1,documentId:'first',features:[]},setStatus:()=>{},debugJournal:{record(){},setContextProvider(){}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.save=autosave;',context);
 await context.save();context.documentInstanceId='two';context.documentModel={version:1,documentId:'second',features:[]};await context.save();
 assert.equal(records.get('recovery:one').document.documentId,'first');assert.equal(records.get('recovery:two').document.documentId,'second');
 assert.equal(records.get('recovery:latest').document.documentId,'second');assert.equal(records.get('recovery-index:one').documentId,'first');assert.equal(records.size,5);
});
