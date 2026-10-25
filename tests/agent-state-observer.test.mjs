import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {createStateObserver} from '../src/agent/state-observer.js';

test('actual main revision key advances for checkpoint dirty and preview-active changes at the same geometry revision',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),match=source.match(/revisionKey:\(\)=>JSON\.stringify\((\[[^\r\n]+\])\),/);
 assert.ok(match,'the test evaluates the actual page revisionKey expression');
 const state=createContext({documentInstanceId:'instance',revision:4,dirty:true,busy:false,kernelReady:true,previewNext:null,previewComputing:false,previewIdentity:null,selectedIds:[],selectedTopology:null,documentModel:{referenceSystem:{workFrame:null}}});
 const key=new Script(`()=>JSON.stringify(${match[1]})`).runInContext(state),observer=createStateObserver({key,context:()=>({documentInstanceId:state.documentInstanceId,revision:state.revision})});
 let sequence=observer.version();assert.equal(observer.version(),sequence);
 state.dirty=false;assert.equal(observer.version(),++sequence,'confirmed checkpoint changes dirty without changing geometry');
 state.previewNext={candidate:'first'};assert.equal(observer.version(),++sequence,'preview became active');
 state.previewNext={candidate:'updated'};assert.equal(observer.version(),sequence,'the active flag is stable for the same preview lifetime');
 state.previewNext=null;assert.equal(observer.version(),++sequence,'preview became inactive');
 assert.equal(state.revision,4);
});
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
