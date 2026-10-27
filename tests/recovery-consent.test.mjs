import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');

test('refresh waits for consent and restores the checkpoint only on explicit Recover',async()=>{
  const startup=source.slice(source.indexOf('const ready=(async()=>{'),source.indexOf('// Public automation surface'));
  for(const choice of ['recover','fresh','cancel']){
    let decide;const decision=new Promise(resolve=>decide=resolve),calls=[];
    const retained={instanceId:'old-instance',document:{name:'保留模型',features:[{id:'body'}]}};
    const run=Function('loadLatestRecovery','chooseAction','rebuild','sessionStorage',`
      let kernelReady=false,documentInstanceId='new-instance',documentModel={name:'空白',features:[]},dirty=false,persistenceCheckpoint='none';
      const withLoading=fn=>fn(),request=async()=>{},clone=structuredClone,refresh=()=>{},setStatus=()=>{},reportError=error=>{throw error;};
      ${startup}
      return {ready,state:()=>({documentInstanceId,dirty,persistenceCheckpoint})};
    `)(async()=>retained,()=>decision,async doc=>calls.push(doc),{removeItem:key=>calls.push(key)});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,0,'no silent restore while waiting');
    decide(choice);assert.equal(await run.ready,true);
    assert.equal(calls.at(-1).name,choice==='recover'?'保留模型':'空白');
    assert.equal(run.state().dirty,choice==='recover');
    assert.equal(run.state().documentInstanceId,choice==='recover'?'old-instance':'new-instance');
  }
});

test('a missing checkpoint cannot restore another tab via recovery:latest',async()=>{
  const loader=source.slice(source.indexOf('async function loadLatestRecovery(){'),source.indexOf('async function pasteModelClipboard(){'));
  const keys=[];
  const db={objectStoreNames:{contains:()=>true},transaction:()=>({objectStore:()=>({get(key){keys.push(key);const request={};queueMicrotask(()=>request.onsuccess());return request;}})})};
  const load=Function('dbPromise','sessionStorage',loader+';return loadLatestRecovery;')(Promise.resolve(db),{getItem:()=>JSON.stringify({instanceId:'this-tab'})});
  assert.equal(await load(),null);assert.deepEqual(keys,['recovery:this-tab']);
});
