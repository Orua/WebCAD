import test from 'node:test';
import assert from 'node:assert/strict';
import {reliefSculptPreflight} from '../src/services/relief-sculpt-preflight.js';
import {createPageAPI} from '../src/page-api.js';

const feature=n=>({id:'relief',op:'relief',refs:['plate'],params:{
 faceId:0,widthMm:16,heightMm:16,depthMm:1,values:Array.from({length:n},()=>Array(n).fill(.5))
}});
test('sculpt preflight shares routing threshold and preserves configured execution policy',()=>{
 const original=feature(33),before=structuredClone(original);
 const blocked=reliefSculptPreflight(original,{servicesConfigured:true});
 assert.equal(blocked.executor,'blocked');assert.equal(blocked.blockers[0].code,'SERVICES_OPERATION_UNAVAILABLE');
 assert(blocked.complexity.reasons.includes('large-surface-grid'));
 assert.equal(reliefSculptPreflight(feature(17),{servicesConfigured:true}).executor,'local');
 assert.equal(reliefSculptPreflight(original,{servicesConfigured:false}).executor,'local');
 assert.equal(reliefSculptPreflight(feature(17),{servicesConfigured:true,source:{faces:150}}).executor,'blocked');
 assert.deepEqual(original,before);
});
test('API preparation retains the draft but reports the same known server blocker',async()=>{
 const oldStorage=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>JSON.stringify({enabled:true,url:'http://localhost/cadservices/api.ashx',authMode:'bearer'})};
 try{
  const f=feature(33),context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1};
  const unexpected=()=>{throw new Error('preparation must not write or run geometry');};
  const api=createPageAPI({files:unexpected,confirmSaved:unexpected,state:()=>({context,features:[{id:'plate',op:'box',params:{width:16,height:16,depth:2},refs:[]},f],bodies:[],summary:{busy:false,kernelReady:true},preview:{active:false}})});
  const result=await api.prepareReliefSculpt({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1},featureId:'relief',strokes:[{mode:'raise',radiusMm:2,amountMm:.1,points:[[0,0]]}]});
  assert.equal(result.status,'prepared');assert.equal(result.canCommit,false);
  assert.equal(result.blockers[0].code,'SERVICES_OPERATION_UNAVAILABLE');
  assert.ok(result.params.sculpt.deltaMm[16][16]>0);assert.equal(f.params.sculpt,undefined);
 }finally{globalThis.localStorage=oldStorage;}
});
