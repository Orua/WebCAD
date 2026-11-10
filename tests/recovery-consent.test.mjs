import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RECOVERY_KEYS,chooseRecovery,recoveryRowKeys,recoveryPrompt} from '../src/recovery-discovery.js';
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');

test('refresh waits for consent and restores the checkpoint only on explicit Recover',async()=>{
  const startup=source.slice(source.indexOf('const ready=(async()=>{'),source.indexOf('// Public automation surface'));
  for(const choice of ['recover','fresh','cancel']){
    let decide;const decision=new Promise(resolve=>decide=resolve),calls=[];
    const retained={row:{instanceId:'old-instance',savedAt:1,revision:158,document:{name:'保留模型',features:[{id:'body'}]}},source:'same-tab',defaultChoice:'fresh'};
    const run=Function('loadLatestRecovery','chooseAction','rebuild','sessionStorage','recoveryPrompt','RECOVERY_KEYS',`
      let kernelReady=false,documentInstanceId='new-instance',documentModel={documentId:'blank',name:'空白',features:[]},dirty=false,persistenceCheckpoint='none',requestedDocumentHold=null;
      const withLoading=fn=>fn(),request=async()=>{},clone=structuredClone,refresh=()=>{},setStatus=()=>{},reportError=error=>{throw error;};
      ${startup}
      return {ready,state:()=>({documentInstanceId,dirty,persistenceCheckpoint})};
    `)(async()=>retained,()=>decision,async doc=>calls.push(doc),{removeItem:key=>calls.push(key),setItem:(key,value)=>calls.push({key,value})},recoveryPrompt,RECOVERY_KEYS);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,0,'no silent restore while waiting');
    decide(choice);assert.equal(await run.ready,true);
    assert.equal(calls.at(-1).name,choice==='recover'?'保留模型':'空白');
    // R8-004: fresh never removes the discovery hint; it only dismisses this checkpoint's prompt.
    assert.ok(!calls.includes(RECOVERY_KEYS.hint));
    if(choice!=='recover')assert.ok(calls.some(c=>c?.key===RECOVERY_KEYS.dismissed&&JSON.parse(c.value).instanceId==='old-instance'));
    assert.equal(run.state().dirty,choice==='recover');
    assert.equal(run.state().documentInstanceId,choice==='recover'?'old-instance':'new-instance');
  }
});

function loader(rows,session,search=''){
  const body=source.slice(source.indexOf('async function loadLatestRecovery(){'),source.indexOf('async function pasteModelClipboard(){'));
  const keys=[];
  const store={get(key){keys.push(key);const request={};queueMicrotask(()=>{request.result=rows[key];request.onsuccess();});return request;},getAll(){const request={};queueMicrotask(()=>{request.result=Object.entries(rows).filter(([k])=>k.startsWith(RECOVERY_KEYS.indexPrefix)).map(([,v])=>v);request.onsuccess();});return request;}};
  const db={objectStoreNames:{contains:()=>true},transaction:()=>({objectStore:()=>store})};
  const IDBKeyRange={bound:()=>null},startupRequestedDocumentId=new URLSearchParams(search).get('document');
  const load=Function('dbPromise','sessionStorage','RECOVERY_KEYS','chooseRecovery','recoveryRowKeys','IDBKeyRange','startupRequestedDocumentId',body+';return loadLatestRecovery;')(Promise.resolve(db),{getItem:key=>session[key]??null},RECOVERY_KEYS,chooseRecovery,recoveryRowKeys,IDBKeyRange,startupRequestedDocumentId);
  return {load,keys};
}
const other={instanceId:'other-tab',savedAt:10,revision:158,document:{documentId:'doc-f22',name:'F22',features:[{id:'a'}]}};

test('a new tab without this-tab checkpoint is still offered recovery:latest through the dialog (R7-016)',async()=>{
  const {load,keys}=loader({'recovery:latest':other},{[RECOVERY_KEYS.hint]:JSON.stringify({instanceId:'this-tab'})});
  const choice=await load();assert.equal(choice.source,'last-interrupted');assert.equal(choice.row.instanceId,'other-tab');assert.equal(choice.defaultChoice,'fresh');
  assert.deepEqual(keys.sort(),['recovery:latest','recovery:this-tab']);
});

test('?document= opens the matching local checkpoint and never mints a new id first (R7-001)',async()=>{
  const old={...other,instanceId:'older',savedAt:5};
  const rows={'recovery:latest':{instanceId:'blank',savedAt:20,document:{documentId:'doc-blank',features:[]}},'recovery:older':old,'recovery-index:older':{instanceId:'older',documentId:'doc-f22',savedAt:5}};
  const {load}=loader(rows,{},'?document=doc-f22');
  const choice=await load();assert.equal(choice.source,'url-document');assert.equal(choice.row.instanceId,'older');assert.equal(choice.defaultChoice,'recover');
  const missing=await loader(rows,{},'?document=doc-unknown').load();assert.equal(missing.source,'url-document-missing');assert.equal(missing.row,null);
});

test('after 开始空白工程 the same ?document= still discovers the snapshot (R8-004)',async()=>{
  const dismissed=JSON.stringify({instanceId:'other-tab',savedAt:10});
  assert.equal((await loader({'recovery:latest':other},{[RECOVERY_KEYS.dismissed]:dismissed}).load()).source,'none');
  assert.equal((await loader({'recovery:latest':other},{[RECOVERY_KEYS.dismissed]:dismissed},'?document=doc-f22').load()).source,'url-document');
});

test('startup keeps the requested ?document= instead of rewriting it to the blank id',()=>{
  assert.match(source,/const startupRequestedDocumentId=requestedDocumentId\(location\.search\)/);
  assert.ok(source.indexOf('const startupRequestedDocumentId')<source.indexOf('\nrefresh();\nconst ready='));
  assert.match(source,/if\(!requestedDocumentHold&&url\.searchParams\.get\('document'\)!==documentModel\.documentId\)/);
});
