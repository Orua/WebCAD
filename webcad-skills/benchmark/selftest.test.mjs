import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cases} from './input/cases.mjs';
import {volume,section,surface,readiness} from './oracle/reference.mjs';
import {missingHostMethods,missingSessionMethods} from './host-contract.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {judgeGeometry} from './oracle/judge.mjs';
import {createPlan,fixtureIndex,preflight,runBenchmark,summarize,sha256,redact} from './runner.mjs';
import {modelSession} from '../scripts/model-session.mjs';

test('20 synthetic inputs remain separate from evaluator-only values and recipes',()=>{
 assert.equal(cases.length,20);assert.equal(new Set(cases.map(c=>c.caseId)).size,20);
 assert(!JSON.stringify(cases).includes('oracle'));
 assert(fixtureIndex().every(f=>f.sourceHash.length===64&&f.expectedAssertions.length&&f.reference.status==='UNVERIFIED'));
 assert.equal(createPlan({build:'test'}).runs.length,60);
 const ab=createPlan({build:'test',suite:'AB'});assert.equal(ab.runs.length,36);
 assert.equal(new Set(ab.runs.map(r=>r.caseId)).size,6);
 assert.throws(()=>createPlan({build:'test',budget:{maxRounds:21}}),/INVALID_BUDGET/);
 assert.throws(()=>createPlan({build:'test',caseId:'missing'}),/UNKNOWN_CASE/);
});
test('analytical volumes agree with independent numerical cross-section integration',()=>{
 const integrate=f=>{let sum=0;const n=10000;for(let i=0;i<n;i++)sum+=f((i+.5)/n)/n;return sum;};
 assert(Math.abs(volume.S02-40*integrate(t=>Math.PI*(10-4*t)*(4+2*t)))<1e-5);
 assert(Math.abs(volume.S03-40*integrate(t=>Math.PI*(5-2*t)**2))<1e-5);
 assert(Math.abs(volume.S05-10*Math.PI*integrate(t=>(4+2*t)*(3+t)))<1e-5);
 assert.equal(surface('S07',.5,.5),null);
 assert.deepEqual(section('S03',.5),{z:20,x:6,y:0,radius:4});
});
test('wrong size, wrong depth evidence and twisted surfaces cannot pass',()=>{
 assert.equal(judgeGeometry('B01',{volume:volume.B01+5}).status,'FAIL');
 assert.equal(judgeGeometry('M04',{counterboreBottomZ:6,counterboreDepth:4}).status,'FAIL');
 const sections=[0,.25,.5,.75,1].map(t=>({t,...section('S01',t),angleDeg:-60*t}));
 assert.equal(judgeGeometry('S01',{sections}).status,'FAIL');
 const samples=[0,.25,.5,.75,1].flatMap(u=>[0,.25,.5,.75,1].map(v=>({u,v,point:surface('S08',u,v).map((x,i)=>i===2?x+1:x)})));
 assert.equal(judgeGeometry('S08',{surfaceSamples:samples}).status,'FAIL');
 assert.equal(judgeGeometry('B01',{volume:volume.B01}).status,'UNVERIFIED');
 assert.equal(judgeGeometry('S01',{sections:[{t:.5,...section('S01',.5)}]}).status,'UNVERIFIED');
 assert.equal(judgeGeometry('S04',{sections:[{t:.5,radius:2}]}).status,'UNVERIFIED','unimplemented path checker must not crash or pass');
});
test('registered CLI and host contract expose a safe path without invoking a model',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts['test:agent-benchmark'],'node webcad-skills/benchmark/cli.mjs');
 const cli=new URL('./cli.mjs',import.meta.url);
 const help=spawnSync(process.execPath,[fileURLToPath(cli),'--help'],{encoding:'utf8'});
 assert.equal(help.status,0);assert(help.stdout.includes('--preflight'));
 const blocked=spawnSync(process.execPath,[fileURLToPath(cli),'--preflight','--build','test','--output','.'],{encoding:'utf8',cwd:new URL('../..',import.meta.url)});
 assert.equal(blocked.status,3);assert(blocked.stderr.includes('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY'));
 assert.deepEqual(missingHostMethods({preflight(){}},{preflightOnly:true}),[]);
 assert(missingHostMethods({}).includes('HOST_METHOD_MISSING:inspect'));
 assert(missingSessionMethods({},{layer:'L1'}).includes('SESSION_METHOD_MISSING:runDeterministic'));
 assert(!missingSessionMethods({},{layer:'L1'}).includes('SESSION_METHOD_MISSING:model'));
 assert(readiness('S12').pendingIndependentChecks.includes('rimScope'));
 assert(readiness('S04').missingSpecializedCheckers.includes('sections'));
});
test('bytes hash as bytes and missing usage remains null, no success denominator fabrication',()=>{
 const bytes=new Uint8Array([1,2,3]);assert.equal(sha256(bytes),createHash('sha256').update(bytes).digest('hex'));
 const result=summarize([{status:'BLOCKED'},{status:'NOT_RUN'},{status:'FAIL'},{status:'UNVERIFIED'}]);
 assert.equal(result.executed,2);assert.equal(result.counts.PASS,0);assert.equal(result.executedPassRate,0);
 assert.equal(summarize([{status:'BLOCKED'}]).executedPassRate,null);
});
test('no adapter is BLOCKED and all planned attempts remain visible',async()=>{
 const report=await runBenchmark({plan:createPlan({build:'test'})});
 assert.equal(report.status,'BLOCKED');assert.equal(report.runs.length,60);
 assert.equal(report.summary.executed,0);assert.equal(report.summary.counts.PASS,0);
 assert(report.preflight.missing.includes('REAL_MODEL_NOT_CONNECTED'));
 assert.equal(preflight().status,'BLOCKED');
});
test('L1 preflight needs no inference, and formal runs reject explicitly fake adapters',async()=>{
 const page=Object.fromEntries(['buildId','catalogHash','docsHash','wasmHash','browser','os','device','toolSetHash'].map(k=>[k,'test']));
 const identity={page,authorizedPageChannel:true,supportsAbort:true,supportsReconcile:true};
 assert.equal(preflight(identity,undefined,{layer:'L1'}).status,'PASS');
 let opens=0;
 const report=await runBenchmark({plan:createPlan({build:'test',layer:'L1'}),preflightOnly:true,adapter:{preflight:async()=>identity,openSession:async()=>{opens++;}}});
 assert.equal(opens,0);assert.equal(report.status,'NOT_RUN');
 const fake=await runBenchmark({plan:createPlan({build:'test',layer:'L1'}),adapter:{testing:true,preflight:async()=>identity}});
 assert.equal(fake.status,'BLOCKED');assert(fake.preflight.missing.includes('MOCK_ADAPTER_NOT_FORMAL'));
});
test('redaction removes secrets recursively from events and credential-bearing URLs',()=>{
 const clean=redact({authorization:'private',nested:{cookie:'private'},url:'https://example.invalid/?ticket=private&x=1',text:'Bearer private'});
 assert(!JSON.stringify(clean).includes('private'));
});
test('current verified knowledge reaches fake framework requests without legacy load',async()=>{
 const records=[];let request;
 const result=await modelSession({task:'fixture selftest',group:'B',modelId:'fake-only',toolIdentity:'fake-tool',initialStateId:'empty',knowledge:{content:'CURRENT_VERIFIED_DOCUMENT',files:['api.modeling.guide']},model:async r=>(request=r,{text:'done'}),execute:async()=>{},record:async e=>records.push(e),judge:async()=>({status:'MOCK_ONLY'})});
 assert.equal(result.status,'MOCK_ONLY');assert(request.messages[0].content.includes('CURRENT_VERIFIED_DOCUMENT'));
 assert(!request.messages[0].content.includes('workflows/'));assert.equal(records[0].knowledgeFiles[0],'api.modeling.guide');
});
test('duplicate call IDs stop selftest model loop before a second write',async()=>{
 const seen=new Set();let writes=0;
 await assert.rejects(modelSession({task:'selftest',group:'A',modelId:'fake-only',toolIdentity:'fake',initialStateId:'empty',maxRounds:2,record:async()=>{},model:async()=>({toolCalls:[{id:'same'},{id:'same'}]}),execute:async call=>{if(seen.has(call.id))throw Error('DUPLICATE');seen.add(call.id);writes++;},judge:async()=>{}}),/DUPLICATE/);
 assert.equal(writes,1);
});
test('abort after a lost receipt prevents all following calls in the session',async()=>{
 const abort=new AbortController();let writes=0;
 await assert.rejects(modelSession({task:'selftest',group:'A',modelId:'fake-only',toolIdentity:'fake',initialStateId:'empty',signal:abort.signal,record:async()=>{},model:async()=>({toolCalls:[{id:'first'},{id:'second'}]}),execute:async()=>{writes++;abort.abort(Error('UNKNOWN_OUTCOME'));return {status:'unknown'};},judge:async()=>{}}),/UNKNOWN_OUTCOME/);
 assert.equal(writes,1);
});
