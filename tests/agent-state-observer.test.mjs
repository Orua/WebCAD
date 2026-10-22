import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateObserver} from '../src/agent/state-observer.js';
test('selection-only changes advance the page sequence and idle has no timer',async()=>{
 let selected='a',listener,timer,cleared=0;const context={documentInstanceId:'i',revision:4};
 const observer=createStateObserver({key:()=>JSON.stringify([context,selected]),context:()=>context,subscribe:fn=>{listener=fn;return ()=>listener=null;},setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>cleared++});
 const changes=[],stop=observer.watch(change=>changes.push(change));const ready=await stop.ready;assert.equal(ready.status,'subscribed');assert.equal(timer,undefined);
 listener();assert.equal(timer,undefined);selected='b';listener();timer();assert.equal(changes[0].stateSeq,ready.stateSeq+1);assert.equal(changes[0].context.revision,4);
 changes[0].context.revision=99;assert.equal(context.revision,4);stop();assert.equal(listener,null);assert.ok(cleared>0);
});
test('send reads see the newest sequence before the coalesced callback',()=>{
 let key='before',notify;const observer=createStateObserver({key:()=>key,context:()=>({revision:0}),subscribe:fn=>{notify=fn;return ()=>{};}});
 const stop=observer.watch(()=>{}, {debounceMs:100});const before=observer.version();key='after';assert.equal(observer.version(),before+1);notify();stop();
});
