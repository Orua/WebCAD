import test from 'node:test';
import assert from 'node:assert/strict';
import {createDebugJournal,debugValue,debugText,traceDebug,debugJournal,debugAIText} from '../src/debug-journal.js';
import {createPageAPI} from '../src/page-api.js';
import {getTool} from '../src/page-api-docs.js';
import {UI_LAYOUT} from '../src/ui-layout.js';
import {READ_METHODS,VIEW_METHODS} from '../src/agent/protocol.js';
import {createHostAdapter} from '../src/agent/host-adapter.js';
import {createHostControl} from '../src/host-control.js';

test('journal retains ordered stages, filters and refresh continuity within explicit count/byte bounds',()=>{
 const storage={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}},journal=createDebugJournal({storage,maxEvents:3,maxBytes:6000});
 journal.record('ui','logo',{phase:'start'});journal.record('services','convert',{jobId:'known-job'});journal.record('kernel','rebuild',{phase:'start'});journal.record('ui','error',{code:'PARAM_SCHEMA_INVALID'},'error');
 const all=journal.read();assert.equal(all.events.length,3);assert.equal(all.coverage.dropped,1);assert.deepEqual(all.events.map(e=>e.sequence),[2,3,4]);
 assert.equal(journal.read({source:'services',query:'known-job'}).matching,1);assert.equal(journal.read({level:'error',afterSequence:3}).matching,1);
 journal.flush();const recovered=createDebugJournal({storage,maxEvents:3});assert.equal(recovered.read().coverage.restored,true);assert.equal(recovered.record('ui','next'),5);
});
test('redaction preserves exact error field and invalid values while removing credentials, query tickets and binary data',()=>{
 const error=Object.assign(new Error('A finite JSON value is required.'),{code:'PARAM_SCHEMA_INVALID',path:'params.source.servicesEvidence.inspectionJobId',details:{validation:{actualCount:2001}}});
 const original={error,params:{source:{inspectionJobId:undefined},depth:NaN,scale:Infinity},credential:'private-key',url:'https://user:pass@example.com/a?ticket=private-ticket#secret',headers:{Authorization:'Bearer private-bearer',Cookie:'session=a; other=b'},base64:'private-image',binaryAssets:{secret:'private-geometry'},data:new Uint8Array([1,2])};
 const sanitized=debugValue(original),text=JSON.stringify(sanitized);
 for(const privateText of ['private-key','private-ticket','private-bearer','private-image','private-geometry','user:pass','session=a','other=b'])assert.ok(!text.includes(privateText),privateText);
 assert.equal(sanitized.url,'https://example.com/a');assert.equal(sanitized.error.path,error.path);assert.equal(sanitized.error.message,error.message);assert.equal(sanitized.params.source.inspectionJobId,'[undefined]');assert.equal(sanitized.params.depth,'[NaN]');assert.equal(sanitized.params.scale,'[Infinity]');assert.equal(sanitized.error.details.validation.actualCount,2001);assert.equal(original.credential,'private-key');
 assert.deepEqual(debugValue({hasCredential:true,authorizationRestored:false,credentialStorage:'sessionStorage',leaseToken:'private-lease'}),{hasCredential:true,authorizationRestored:false,credentialStorage:'sessionStorage',leaseToken:'[redacted]'});
 assert.doesNotMatch(debugText('Authorization: Basic dXNlcjpwYXNz\nCookie: SID=abc; Other=def'),/dXNlcj|SID=abc|Other=def/);
});
test('trace keeps returned receipt/commit semantics and rethrows the original failure without retry',async()=>{
 const receipt={status:'unknown',commitState:'unknown',error:{code:'JOB_TIMEOUT',path:'params.depth'}},before=debugJournal.read().lastSequence;
 assert.equal(await traceDebug('api','test-unknown',{},()=>Promise.resolve(receipt)),receipt);
 const error=Object.assign(new Error('Unknown field.'),{code:'PARAM_SCHEMA_INVALID',path:'params.type'});let calls=0;
 await assert.rejects(traceDebug('kernel','test-failure',{},async()=>{calls++;throw error;}),e=>e===error);assert.equal(calls,1);
 const logs=debugJournal.read({afterSequence:before});assert.equal(logs.events.find(e=>e.action==='test-unknown'&&e.data.phase==='end').data.commitState,'unknown');assert.equal(logs.events.at(-1).data.error.path,'params.type');
});
test('AI bundle remains valid bounded JSON and marks sampled arrays and large reports',()=>{
 const data=debugValue({regions:Array.from({length:200},()=>({outer:Array(10000).fill([0,1])}))});assert.equal(data.regions.arrayLength,200);
 const report={coverage:{retained:1500},state:{params:data},events:Array.from({length:1500},(_,i)=>({sequence:i,level:'error',data:{message:'x'.repeat(2048)}}))};
 const text=debugAIText(report);assert.ok(text.length<=96000);const result=JSON.parse(text);assert.ok(result.recentErrors.length>0);assert.ok(result.events.length<=100);
});
test('settings ends with Debug; public read and panel methods preserve a busy document and validate fields',async()=>{
 const settings=UI_LAYOUT.tabs.find(t=>t.id==='settings');assert.equal(settings.groups.at(-1)[1].at(-1),'debug');assert.equal(READ_METHODS.has('getDebugReport'),true);assert.equal(VIEW_METHODS.has('setDebugPanel'),true);
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:7};let reads=0,open=false;
 const api=createPageAPI({state:()=>({context,summary:{busy:true,kernelReady:false},bodies:[]}),display:()=>({}),debugReport:input=>{reads++;return {format:'webcad-debug',events:[],state:{revision:context.revision},options:input};},setDebugPanel:value=>(open=value),files:async()=>{},confirmSaved:()=>({saved:false})});
 assert.equal(getTool({id:'getDebugReport'}).contextPolicy,'none');assert.equal(getTool({id:'setDebugPanel'}).contextPolicy,'identity');
 const report=await api.getDebugReport({limit:50});assert.equal(report.status,'read');assert.equal(report.state.revision,7);assert.equal(reads,1);
 for(const args of [{limit:1501},{level:'secret'},{script:'anything'},{includeState:'yes'}])assert.equal((await api.getDebugReport(args)).status,'failed');assert.equal(reads,1);
 const result=await api.setDebugPanel({context,visible:true});assert.equal(result.status,'applied');assert.equal(result.open,true);assert.equal(open,true);assert.equal(context.revision,7);
 assert.equal((await api.setDebugPanel({context:{...context,documentInstanceId:'other'},visible:false})).error.code,'INSTANCE_MISMATCH');assert.equal(open,true);
});
test('Agent connect/disconnect and command receipt, ack, execution and delivery retain correlation identifiers',async()=>{
 const before=debugJournal.read().lastSequence,control=createHostControl();control.set({connected:true});control.set({connected:false});
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:0};
 const adapter=createHostAdapter({api:{connect(){},getState:()=>({context}),invoke:async()=>({status:'read',context,volume:10})},session:{cadSessionId:'cad-debug',leaseEpoch:1,binding:context,scopes:['cad.read']},report:async()=>{}});
 const command={protocol:'goldenluck.webcad/1',cadSessionId:'cad-debug',leaseEpoch:1,taskId:'debug-task',commandId:'b'.repeat(32),requestHash:'known-hash',deadline:Date.now()/1000+30,payload:{method:'getState',args:{}}};
 await adapter.receive(command);adapter.release();await Promise.resolve();
 const events=debugJournal.read({source:'agent',afterSequence:before,limit:100}).events;
 for(const action of ['connected','disconnected','adapter-created','command-received','command-dispatch','command-acknowledged','command-result','result-delivered','adapter-released'])assert.ok(events.some(e=>e.action===action),action);
 assert.equal(events.find(e=>e.action==='command-result').data.commandId,command.commandId);assert.equal(events.find(e=>e.action==='command-result').data.taskId,'debug-task');
});
test('10000 Chinese events respect 1500 entries, 1MiB UTF8 and 8KiB per event with actual eviction',()=>{
 const storage={value:null,getItem(){return null;},setItem(k,v){this.value=v;}},journal=createDebugJournal({storage});
 for(let i=0;i<10000;i++)journal.record('api','执行工具',{index:i,result:{status:'committed',description:'轮廓校验与执行结果'.repeat(70),volume:123.5}});
 journal.record('ui','huge-error',{error:Object.assign(new Error('数据'.repeat(20000)),{code:'PARAM_SCHEMA_INVALID',path:'params.regions.0.outer'}),huge:'中文'.repeat(200000)},'error');
 journal.flush();const r=journal.read({limit:1500}),bytes=new TextEncoder().encode(storage.value).length;
 assert.ok(r.events.length<=1500);assert.ok(bytes<=1024*1024);assert.ok(r.coverage.dropped>0);assert.ok(r.events.every(e=>new TextEncoder().encode(JSON.stringify(e)).length<=8192));
 assert.equal(r.events.at(-1).data.error.path,'params.regions.0.outer');assert.equal(r.events.at(-1).truncated,true);
 console.log('Debug storage stress:',JSON.stringify({retained:r.events.length,dropped:r.coverage.dropped,utf8Bytes:bytes,maxEventBytes:Math.max(...r.events.map(e=>new TextEncoder().encode(JSON.stringify(e)).length))}));
});
test('page and separately bundled Agent adapters share one journal instead of overwriting storage',async()=>{
 const duplicate=await import('../src/debug-journal.js?separate-bundle-test');assert.equal(duplicate.debugJournal,debugJournal);
});
