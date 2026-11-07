// MOCK_ONLY public schemas and workflow evidence binding; no browser/OCP/model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
import {m05FirstSteps,m05RemainingSteps,radialHoleSteps,m05CutScopeCheck,runRadialHoleCase,observeRadialHoleCase} from './radial-hole-cases.mjs';
import {createBrowserBenchmarkAdapter} from './browser-host.mjs';
import {checkBrowserAdapter} from './check.mjs';
import {judgeGeometry} from '../oracle/judge.mjs';

test('M05 all six actual tool schemas constrain own-side radius 9..13',async()=>{
 const stages=[m05FirstSteps(),m05RemainingSteps('first-body')];
 for(const steps of stages){
  const seen=new Set(['first-body']);
  for(const step of steps){
   const card=JSON.parse(await readFile(new URL('../../../public/automation/tools/'+step.args.op+'.json',import.meta.url),'utf8'));
   validateSchema(card.inputSchema,step.args.params);
   const refs=step.args.refs.map(ref=>{const id=typeof ref==='string'?ref:ref.$ref.split('.')[0];assert(seen.has(id));return id;});
   validateSchema(card.refsSchema,refs);seen.add(step.id);
  }
 }
 for(let i=0;i<6;i++){
  const [tool,positioned]=radialHoleSteps(i,'sleeve');
  assert.deepEqual(tool.args.params,{radius:1,height:4});
  const p=positioned.args.params;assert.equal(p.ry,90);assert.equal(p.rz,60*i);assert.equal(p.z,10);
  assert(Math.abs(Math.hypot(p.x,p.y)-9)<1e-12);
 }
 assert.equal(stages[0].length,6);assert.equal(stages[1].length,15);
});
function evidence(){
 const ctx=revision=>({documentInstanceId:'original',expectedRevision:revision});
 return {documentInstanceId:'original',finalContext:ctx(21),
  firstArtifact:{descriptor:{sha256:'mock-first-step'},saved:{verified:true,sha256:'mock-first-step'}},
  firstGeometry:{reader:{independent:true,inputSha256:'mock-first-step'},checks:{cutScope:{pass:true,evidence:{scope:'MOCK_ONLY independent first-hole'}}}},
  probe:{status:'read',results:[{id:'firstVoid',verdict:'pass'},{id:'oppositeKept',verdict:'pass'}]},
  stages:[{before:ctx(0),after:ctx(6),steps:m05FirstSteps(),receipt:{status:'completed'}},
   {before:ctx(6),after:ctx(21),bodyId:'first-body',steps:m05RemainingSteps('first-body'),receipt:{status:'completed'}}]};
}
test('cutScope binds independent first STEP, disk receipt, material probe and exact revision chain',()=>{
 assert.equal(m05CutScopeCheck(evidence()).pass,true);
 for(const change of [e=>{e.firstGeometry=null;},e=>{e.firstGeometry.reader.inputSha256='different';},e=>{e.firstArtifact.saved.verified=false;},
  e=>{e.stages[1].before.expectedRevision=7;},e=>{e.finalContext.expectedRevision=22;},e=>{e.stages[1].steps[0].args.params.height=26;},
  e=>{e.stages[0].receipt.status='unknown';},e=>{e.probe=null;}]){
  const e=evidence();change(e);assert.equal(m05CutScopeCheck(e).pass,null);
 }
});
test('an independently observed through-first cut or removed opposite wall fails scope',()=>{
 const e=evidence();e.firstGeometry.checks.cutScope.pass=false;assert.equal(m05CutScopeCheck(e).pass,false);
 const p=evidence();p.probe.results[1].verdict='fail';assert.equal(m05CutScopeCheck(p).pass,false);
});
test('workflow captures first-hole evidence before remaining five cuts',async()=>{
 const events=[];let revision=0;
 const context=async()=>({documentInstanceId:'original',expectedRevision:revision});
 const session={documentInstanceId:'original',client:{getState:async()=>({bodies:[{id:'first-body'}]}),call:async(method)=>{
  assert.equal(method,'inspectDesign');events.push('probe');return evidence().probe;
 }}};
 await runRadialHoleCase({session,context,maxToolCalls:80,
  runSteps:async steps=>{events.push(steps.length===6?'first':'remaining');revision+=steps.length;return {status:'completed'};},
  exportFirst:async()=>{events.push('export-first');return {...evidence().firstArtifact,bytes:new Uint8Array([1])};},
  readFirst:async()=>{events.push('read-first');return evidence().firstGeometry;},record:async()=>{}});
 assert.deepEqual(events,['first','probe','export-first','read-first','remaining']);assert.equal(session.workflowChecks.cutScope.pass,true);
});
test('final STEP/page observation cannot assert cutScope or pass independent geometry',async()=>{
 const session={client:{getState:async()=>({bodies:[{id:'fixture'}]}),call:async()=>({status:'read',solidCount:1,volume:2700})}};
 const observed=await observeRadialHoleCase({caseId:'M05',session,context:async()=>({expectedRevision:21}),record:async()=>{}});
 assert.deepEqual(observed.geometry.checks,{});assert.equal(judgeGeometry('M05',observed.geometry).status,'UNVERIFIED');
 const scope=judgeGeometry('M05',observed.geometry).checks.find(row=>row.id==='cutScope');assert.equal(scope.status,'UNVERIFIED');
});
test('M05 unqualified reference blocks before opening product page',async()=>{
 let pages=0;
 const adapter=createBrowserBenchmarkAdapter({openPage:async()=>{pages++;throw Error('Must not open');},knowledge:{baseUrl:'http://localhost/webcad/',directory:'fixture'},referenceValidator:async()=>({status:'UNVERIFIED'}),record:async()=>{},persist:async()=>{}});
 const result=await checkBrowserAdapter(adapter,{mode:'m05-l1'});assert.equal(result.status,'BLOCKED');assert.equal(pages,0);
});
