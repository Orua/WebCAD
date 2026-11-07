import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAPI} from '../src/page-api.js';
import {createPerformanceRuntime} from '../src/performance/runtime.js';
import {getTool,infoMetadata} from '../src/page-api-docs.js';

test('performance read/settings/response use current identity without geometry or revision writes',async()=>{
  const identity={sessionId:'s',documentId:'d',documentInstanceId:'i'},context={...identity,revision:7};let notified,geometryCalls=0;
  const runtime=createPerformanceRuntime({getSnapshot:()=>({valid:false,counts:{},window:{sampleCount:0},cpuSubmitMs:{p95:null}}),getContext:()=>({documentInstanceId:'i',geometryRevision:7}),changeQuality:async()=>geometryCalls++,onChange:()=>notified?.()});
  const host={state:()=>({context:{...context},summary:{busy:true,kernelReady:false},preview:{},bodies:[]}),files:async()=>({}),confirmSaved:async()=>({}),display:()=>({}),
    performance:runtime.state,performanceSummary:runtime.summary,performanceVersion:runtime.version,configurePerformance:runtime.configure,acknowledgePerformance:runtime.acknowledgeAdvisory,
    revisionKey:()=>String(context.revision),subscribeState:fn=>{notified=fn;return ()=>notified=null;}};
  const api=createPageAPI(host),before=api.getState().stateSeq;
  assert.equal((await api.getPerformanceState()).status,'read');assert.equal((await api.getPerformanceState({rawMesh:true})).status,'failed');
  const result=await api.configurePerformance({context:identity,settings:{mode:'manual',manualLock:true}});
  assert.equal(result.status,'applied');assert.equal(context.revision,7);assert.equal(geometryCalls,0);
  assert.ok(api.getState({compact:true}).stateSeq>before);assert.equal(api.getState().performance.settings.manualLock,true);
  assert.equal(api.getState({sinceRevision:7}).performance.settings.mode,'manual');
  assert.equal((await api.configurePerformance({context:{...identity,documentInstanceId:'old'},settings:{mode:'auto'}})).error.code,'INSTANCE_MISMATCH');
  assert.equal((await api.configurePerformance({context:identity,settings:{mode:'unexpected'}})).status,'failed');
  assert.equal((await api.configurePerformance({context:identity,settings:{manualLock:'true'}})).status,'failed');
  assert.equal((await api.acknowledgePerformanceAdvisory({context:identity,advisoryId:'old',status:'declined'})).error.code,'STALE_REFERENCE');
  for(const id of ['getPerformanceState','configurePerformance','acknowledgePerformanceAdvisory']){
    assert.ok(infoMetadata().methods.includes(id));assert.equal(getTool({id}).implementationStatus,'implemented');
  }
});
