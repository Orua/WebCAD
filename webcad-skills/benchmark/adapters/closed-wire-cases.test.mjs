// MOCK_ONLY contracts and solid selection, without browser/OCP/model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
import {validateProfile} from '../../../src/profile-model.js';
import {m02Recipe,observeClosedWireCase} from './closed-wire-cases.mjs';
import {createBrowserBenchmarkAdapter} from './browser-host.mjs';
import {checkBrowserAdapter} from './check.mjs';
import {judgeGeometry} from '../oracle/judge.mjs';
import {volume} from '../oracle/reference.mjs';

test('M02 complete public schemas preserve exact rounded path and diameter-4 section',async()=>{
 const seen=new Set(),steps=m02Recipe();
 for(const step of steps){
  const card=JSON.parse(await readFile(new URL('../../../public/automation/tools/'+step.args.op+'.json',import.meta.url),'utf8'));
  validateSchema(card.inputSchema,step.args.params);
  validateSchema(card.refsSchema,step.args.refs.map(r=>{const id=r.$ref.split('.')[0];assert(seen.has(id));return id;}));seen.add(step.id);
  if(step.args.op==='sketchProfile')validateProfile(step.args.params);
 }
 assert.deepEqual(steps[0].args.params.entities[0],{id:'rounded',type:'roundedRectangle',originMm:[-20,-12],widthMm:40,heightMm:24,cornerRadiusMm:6});
 assert.deepEqual(steps[1].args.params.entities[0],{id:'circle',type:'circle',centerMm:[0,0],diameterMm:4});
 assert.equal(steps[2].args.params.alignProfileToPath,true);
 assert.deepEqual(steps[2].args.refs,[{$ref:'section.createdBodyIds.0'},{$ref:'path.createdBodyIds.0'}]);
});
test('M02 selects the sole actual solid for STEP while keeping profile/path sources',async()=>{
 const bodies=[{id:'path',solidCount:0},{id:'section',solidCount:0},{id:'result',solidCount:1}];
 const session={client:{getState:async()=>({bodies}),call:async(method,args)=>{
  assert.equal(method,'measure');assert.equal(args.bodyId,'result');return {status:'read',solidCount:1,volume:volume.M02};
 }}};
 const observed=await observeClosedWireCase({caseId:'M02',session,context:async()=>({expectedRevision:3}),record:async()=>{}});
 assert.deepEqual(observed.exportBodyIds,['result']);assert.equal(bodies.length,3);
 assert.deepEqual(observed.geometry.checks,{});assert.equal(judgeGeometry('M02',observed.geometry).status,'UNVERIFIED');
});
test('M02 reimported single solid is accepted for observation, multiple solids are rejected',async()=>{
 const session={client:{getState:async()=>({bodies:[{id:'imported',solidCount:1}]}),call:async()=>({status:'read',solidCount:1,volume:volume.M02})}};
 const args={caseId:'M02',session,context:async()=>({expectedRevision:1}),record:async()=>{}};
 assert.deepEqual((await observeClosedWireCase(args)).exportBodyIds,['imported']);
 session.client.getState=async()=>({bodies:[{id:'a',solidCount:1},{id:'b',solidCount:1}]});
 await assert.rejects(()=>observeClosedWireCase(args),/M02_SINGLE_SOLID_RESULT_REQUIRED/);
});
test('M02 reference must qualify before any product page opens',async()=>{
 let pages=0;
 const adapter=createBrowserBenchmarkAdapter({openPage:async()=>{pages++;throw Error('Must not open');},knowledge:{baseUrl:'http://localhost/webcad/',directory:'fixture'},referenceValidator:async()=>({status:'UNVERIFIED'}),record:async()=>{},persist:async()=>{}});
 assert.equal((await checkBrowserAdapter(adapter,{mode:'m02-l1'})).status,'BLOCKED');assert.equal(pages,0);
});
