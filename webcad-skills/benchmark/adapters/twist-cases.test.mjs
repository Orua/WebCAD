// Schema and failure-boundary checks only; not real geometry acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
import {s01Recipe,observeTwistCase} from './twist-cases.mjs';
import {createBrowserBenchmarkAdapter} from './browser-host.mjs';
import {checkBrowserAdapter} from './check.mjs';
import {judgeGeometry} from '../oracle/judge.mjs';
test('S01 full station schema preserves prescribed twist and dimensions',async()=>{
 const card=JSON.parse(await readFile(new URL('../../../public/automation/tools/curveSweep.json',import.meta.url),'utf8'));
 const step=s01Recipe()[0];validateSchema(card.inputSchema,step.args.params);
 assert.equal(step.args.params.stations.length,17);
 for(const [i,s]of step.args.params.stations.entries()){
  const t=i/16;assert.deepEqual(s.centerMm,[0,0,40*t]);assert.deepEqual(s.normal,[0,0,1]);
  assert.deepEqual(s.widthDirection,[Math.cos(Math.PI*t/3),Math.sin(Math.PI*t/3),0]);
  assert.equal(s.widthMm,20);assert.equal(s.depthMm,12);
 }
 assert.equal(step.args.params.autoAlign,false);assert.equal(step.args.placement.frame.kind,'world');
});
test('page volume never supplies missing independent twist sections',async()=>{
 const session={client:{getState:async()=>({bodies:[{id:'fixture'}]}),call:async()=>({status:'read',solidCount:1,volume:9600})}};
 const observed=await observeTwistCase({caseId:'S01',session,context:async()=>({expectedRevision:1}),record:async()=>{}});
 assert(!('sections' in observed.geometry));assert.equal(judgeGeometry('S01',observed.geometry).status,'UNVERIFIED');
});
test('unqualified S01 reference blocks page creation',async()=>{
 let pages=0;
 const adapter=createBrowserBenchmarkAdapter({openPage:async()=>{pages++;throw Error('Must not open');},knowledge:{baseUrl:'http://localhost/webcad/',directory:'fixture'},referenceValidator:async()=>({status:'UNVERIFIED'}),record:async()=>{},persist:async()=>{}});
 const result=await checkBrowserAdapter(adapter,{mode:'s01-l1'});assert.equal(result.status,'BLOCKED');assert.equal(pages,0);
});
