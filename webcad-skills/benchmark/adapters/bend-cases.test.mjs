// MOCK_ONLY contract and observer tests. No browser, OCP or model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
import {m03Recipe,observeBendCase,bendToolIds} from './bend-cases.mjs';
import {createBrowserBenchmarkAdapter} from './browser-host.mjs';
import {checkBrowserAdapter} from './check.mjs';
import {judgeGeometry} from '../oracle/judge.mjs';
import {volume} from '../oracle/reference.mjs';

test('M03 full operation contracts, exact torus dimensions and clipped XY quadrant',async()=>{
 const steps=m03Recipe(),ids=new Set();
 for(const step of steps){
  const card=JSON.parse(await readFile(new URL('../../../public/automation/tools/'+step.args.op+'.json',import.meta.url),'utf8'));
  validateSchema(card.inputSchema,step.args.params);
  const refs=step.args.refs.map(ref=>{const prior=ref.$ref.split('.')[0];assert(ids.has(prior));return prior;});
  validateSchema(card.refsSchema,refs);ids.add(step.id);
  if(!refs.length)assert.deepEqual(step.args.placement,{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}});
 }
 assert.deepEqual(steps[0].args.params,{majorRadius:20,minorRadius:3});
 assert.deepEqual(steps[1].args.params,{majorRadius:20,minorRadius:2});
 assert.deepEqual(steps[3].args.params,{width:30,depth:30,height:10});
 assert.deepEqual(steps[4].args.params,{x:0,y:0,z:-5});
 assert.equal(steps.at(-1).args.op,'intersect');
 assert.deepEqual([...new Set(steps.map(s=>s.args.op))],bendToolIds.M03);
});
test('M03 page readback never manufactures independent ring or end measurements',async()=>{
 const calls=[];
 const session={client:{getState:async()=>({bodies:[{id:'fixture'}]}),call:async(method,args)=>{
  calls.push(method);return method==='measure'?{status:'read',solidCount:1,volume:volume.M03}:{status:'read',results:args.requirements.map(r=>({id:r.id,verdict:'pass'}))};
 }}};
 const observed=await observeBendCase({caseId:'M03',session,context:async()=>({expectedRevision:4}),record:async()=>{}});
 assert.deepEqual(calls,['measure','inspectDesign']);assert.deepEqual(observed.geometry.checks,{});
 assert.equal(observed.geometry.reader.independent,false);assert.equal(judgeGeometry('M03',observed.geometry).status,'UNVERIFIED');
});
test('M03 missing solid remains a failure without unsupported material calls',async()=>{
 const session={client:{getState:async()=>({bodies:[{id:'fixture'}]}),call:async method=>{
  assert.equal(method,'measure');return {status:'read',solidCount:0,volume:null};
 }}};
 const observed=await observeBendCase({caseId:'M03',session,context:async()=>({expectedRevision:1}),record:async()=>{}});
 assert.equal(judgeGeometry('M03',observed.geometry).status,'FAIL');assert.equal(observed.raw.material,null);
});
test('M03 unvalidated reference blocks before any product page opens',async()=>{
 let pages=0;
 const adapter=createBrowserBenchmarkAdapter({openPage:async()=>{pages++;throw Error('Must not open');},knowledge:{baseUrl:'http://localhost/webcad/',directory:'fixture'},referenceValidator:async()=>({status:'UNVERIFIED'}),record:async()=>{},persist:async()=>{}});
 const result=await checkBrowserAdapter(adapter,{mode:'m03-l1'});assert.equal(result.status,'BLOCKED');assert.equal(pages,0);
});
