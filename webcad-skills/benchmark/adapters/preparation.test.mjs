// Source/schema tests only. No geometry PASS or benchmark result is produced.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
import {compositeRecipe} from './composite-cases.mjs';
import {collectCaseCapabilityMap} from '../case-capability-map.mjs';
import {createFrozenCandidateHost} from './frozen-candidate.mjs';
const card=async id=>JSON.parse(await readFile(new URL(`../../../public/automation/tools/${id}.json`,import.meta.url),'utf8'));
test('M01 and M04 recipes validate all actual operation params and prior-result references',async()=>{
 for(const caseId of ['M01','M04']){
  const seen=new Set();
  for(const step of compositeRecipe(caseId)){
   const tool=await card(step.args.op);validateSchema(tool.inputSchema,step.args.params);
   for(const reference of step.args.refs)assert(seen.has(reference.$ref.split('.')[0]));seen.add(step.id);
  }
 }
 const holes=compositeRecipe('M04').filter(step=>step.args.op==='hole');assert.deepEqual(holes.map(step=>[step.args.params.radius,step.args.params.depth]),[[2,10],[5,3]]);
});
test('all twenty routes use registered cards without counting availability as execution',async()=>{
 const matrix=await collectCaseCapabilityMap({getTool:card});assert.equal(matrix.cases.length,20);
 assert(matrix.cases.every(row=>row.status==='NOT_RUN'));assert(matrix.cases.every(row=>row.missingTools.length===0));
 assert.equal(matrix.cases.find(row=>row.caseId==='S12').independentStepReader,'NOT_IMPLEMENTED');
 assert.equal(matrix.cases.find(row=>row.caseId==='M01').deterministicRecipe,'browser-host');
});
test('frozen candidate requires explicit identity and task browser before any page is created',async()=>{
 await assert.rejects(createFrozenCandidateHost({}),/EXPLICIT_FROZEN_CANDIDATE_BINDING_REQUIRED/);
});
