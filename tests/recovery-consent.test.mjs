import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RECOVERY_KEYS,chooseRecovery,recoveryRowKeys,recoveryPrompt} from '../src/recovery-discovery.js';
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');

test('startup opens a blank document without querying or prompting for recovery',async()=>{
  const startup=source.slice(source.indexOf('const ready=(async()=>{'),source.indexOf('// Public automation surface'));
  assert.doesNotMatch(startup,/loadLatestRecovery|chooseAction|recoveryPrompt/);
  const calls=[];
  const ready=Function('rebuild',`let kernelReady=false,dirty=true;const documentModel={documentId:'blank',features:[]},startupRequestedDocumentId=null;
    const withLoading=fn=>fn(),request=async()=>{},clone=structuredClone,refresh=()=>{},setStatus=()=>{},reportError=error=>{throw error;};
    ${startup}return ready;`)(async doc=>calls.push(doc));
  assert.equal(await ready,true);assert.equal(calls.length,1);assert.equal(calls[0].documentId,'blank');
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

test('explicit recovery in a new tab can discover the latest retained checkpoint',async()=>{
  const {load,keys}=loader({'recovery:latest':other},{[RECOVERY_KEYS.hint]:JSON.stringify({instanceId:'this-tab'})});
  const choice=await load();assert.equal(choice.source,'last-interrupted');assert.equal(choice.row.instanceId,'other-tab');assert.equal(choice.defaultChoice,'fresh');
  assert.deepEqual(keys.sort(),['recovery:latest','recovery:this-tab']);
});

test('explicit recovery with a document link selects only the matching checkpoint',async()=>{
  const old={...other,instanceId:'older',savedAt:5};
  const rows={'recovery:latest':{instanceId:'blank',savedAt:20,document:{documentId:'doc-blank',features:[]}},'recovery:older':old,'recovery-index:older':{instanceId:'older',documentId:'doc-f22',savedAt:5}};
  const {load}=loader(rows,{},'?document=doc-f22');
  const choice=await load();assert.equal(choice.source,'url-document');assert.equal(choice.row.instanceId,'older');assert.equal(choice.defaultChoice,'recover');
  const missing=await loader(rows,{},'?document=doc-unknown').load();assert.equal(missing.source,'url-document-missing');assert.equal(missing.row,null);
});

test('manual recovery ignores legacy automatic-prompt dismissal',async()=>{
  const dismissed=JSON.stringify({instanceId:'other-tab',savedAt:10});
  assert.equal((await loader({'recovery:latest':other},{[RECOVERY_KEYS.dismissed]:dismissed}).load()).source,'last-interrupted');
  assert.equal((await loader({'recovery:latest':other},{[RECOVERY_KEYS.dismissed]:dismissed},'?document=doc-f22').load()).source,'url-document');
});

test('startup keeps the requested ?document= instead of rewriting it to the blank id',()=>{
  assert.match(source,/const startupRequestedDocumentId=requestedDocumentId\(location\.search\)/);
  assert.ok(source.indexOf('const startupRequestedDocumentId')<source.indexOf('\nrefresh();\nconst ready='));
  assert.match(source,/if\(!requestedDocumentHold&&url\.searchParams\.get\('document'\)!==documentModel\.documentId\)/);
});

test('explicit recovery resolves a lightweight latest pointer to its single stored full checkpoint',async()=>{
 const {load}=loader({'recovery:latest':{recoveryKey:'recovery:other-tab',instanceId:'other-tab'},'recovery:other-tab':other},{});
 const choice=await load();assert.equal(choice.row.document.documentId,'doc-f22');
});
