// MOCK_ONLY schema/observation plumbing. No OCP/browser/model computation or scores.
import test from 'node:test';
import assert from 'node:assert/strict';
import {observeCompositeCase,compositeRecipe} from './composite-cases.mjs';
import {createBrowserBenchmarkAdapter} from './browser-host.mjs';
import {checkBrowserAdapter} from './check.mjs';
import {judgeGeometry} from '../oracle/judge.mjs';
import {volume} from '../oracle/reference.mjs';
function fixtureSession(caseId,{bottom=7,materialStatus='read'}={}){
 const records=[];
 const session={client:{getState:async()=>({bodies:[{id:'fixture-result'}]}),call:async(method,args)=>{
  if(method==='measure')return {status:'read',solidCount:1,volume:volume[caseId]};
  if(method==='inspectDesign')return {status:materialStatus,results:args.requirements.map(r=>({id:r.id,verdict:'pass',actual:{fixture:'MOCK_ONLY'}}))};
  if(method==='queryGeometry'&&args.kind==='edge')return {status:'read',items:[{center:[0,0,bottom]},{center:[0,0,10]}]};
  if(method==='queryGeometry')return {status:'read',items:(caseId==='M01'?[8,5,3]:[2,5]).map(radiusMm=>({cylinder:{radiusMm,origin:[0,0,0],axis:[0,0,1]}}))};
  throw Error('Unexpected fixture method');
 }}};
 return {session,record:async event=>records.push(event),records,context:async()=>({documentInstanceId:'fixture',expectedRevision:6})};
}
test('M01 observation preserves frozen volume and samples across the shoulder',async()=>{
 const fixture=fixtureSession('M01'),observation=await observeCompositeCase({caseId:'M01',...fixture});
 assert.equal(observation.geometry.volume,476*Math.PI);assert.equal(observation.geometry.checks.shoulders.pass,true);assert.equal(observation.geometry.checks.bore.pass,true);assert.equal(observation.geometry.checks.connected.pass,true);
 assert.equal(judgeGeometry('M01',observation.geometry).status,'UNVERIFIED');
 assert.equal(observation.geometry.reader.independent,false);assert.equal(fixture.records[0].caseId,'M01');
});
test('M04 reads actual counterbore ring levels and rejects wrong depth',async()=>{
 const actual=await observeCompositeCase({caseId:'M04',...fixtureSession('M04')});
 assert.equal(actual.geometry.counterboreBottomZ,7);assert.equal(actual.geometry.counterboreDepth,3);
 assert.equal(judgeGeometry('M04',actual.geometry).status,'UNVERIFIED','page samples alone cannot replace independent BRep evidence');
 const wrong=await observeCompositeCase({caseId:'M04',...fixtureSession('M04',{bottom:6})});
 assert.equal(judgeGeometry('M04',wrong.geometry).status,'FAIL');
});
test('failed observation tool remains a checker/transport block, never fabricated geometry evidence',async()=>{
 await assert.rejects(observeCompositeCase({caseId:'M04',...fixtureSession('M04',{materialStatus:'failed'})}),/COMPOSITE_READBACK_FAILED/);
});
test('unvalidated M01/M04 references block before any task page is opened',async()=>{
 let pages=0;
 const adapter=createBrowserBenchmarkAdapter({openPage:async()=>{pages++;throw Error('Must not open');},knowledge:{baseUrl:'http://localhost/webcad/',directory:'fixture-storage-not-used'},persist:async()=>{},record:async()=>{},referenceValidator:async()=>({status:'UNVERIFIED',reason:'REFERENCE_NOT_RUN'})});
 for(const mode of ['m01-l1','m04-l1']){
  const result=await checkBrowserAdapter(adapter,{mode});assert.equal(result.status,'BLOCKED');assert.equal(result.reason,'INDEPENDENT_REFERENCE_REQUIRED');
 }
 assert.equal(pages,0);
});
test('frozen composite recipes still use exact shoulder and counterbore dimensions',()=>{
 const shoulder=compositeRecipe('M01');assert.deepEqual(shoulder[0].args.params,{radius:8,height:4});assert.deepEqual(shoulder[1].args.params,{radius:5,height:16});assert.equal(shoulder[2].args.params.z,4);
 const counterbore=compositeRecipe('M04').at(-1);assert.equal(counterbore.args.params.radius,5);assert.equal(counterbore.args.params.depth,3);assert.equal(counterbore.args.params.z,10);
});
