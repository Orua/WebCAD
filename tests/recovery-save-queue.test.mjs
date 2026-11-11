import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoverySaveQueue} from '../src/recovery-save-queue.js';
test('AI commit bursts capture and write only the latest committed snapshot after the batch',async()=>{
 let blocked=true,revision=1,captures=0;const scheduled=[],writes=[];
 const q=createRecoverySaveQueue({capture:()=>{captures++;return revision;},write:async s=>writes.push(s),blocked:()=>blocked,schedule:fn=>{scheduled.push(fn);return scheduled.length;},cancel:()=>{}});
 for(revision=1;revision<=30;revision++)q.request();
 assert.equal(captures,0);assert.equal(scheduled.length,0);
 blocked=false;q.resume();assert.equal(scheduled.length,1);await q.flush();
 assert.equal(captures,1);assert.deepEqual(writes,[31]);
});
test('a commit during an in-flight save is retained for a subsequent save',async()=>{
 let value=1,release;const gate=new Promise(r=>release=r),writes=[];
 const q=createRecoverySaveQueue({capture:()=>value,write:async s=>{writes.push(s);if(s===1)await gate;},schedule:()=>1,cancel:()=>{}});
 q.request();const first=q.flush();await Promise.resolve();value=2;q.request();release();await first;await q.flush();assert.deepEqual(writes,[1,2]);
});
test('explicit flush persists the last committed snapshot even while a new calculation is running',async()=>{
 const writes=[];const q=createRecoverySaveQueue({capture:()=>({revision:4}),write:async s=>writes.push(s),blocked:()=>true});
 q.request();await q.flush();assert.deepEqual(writes,[{revision:4}]);
});
