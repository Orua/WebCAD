// MOCK_ONLY schema/observer tests. No OCP, browser or model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
import {s02Recipe,observeEllipseCase} from './ellipse-cases.mjs';
import {createBrowserBenchmarkAdapter} from './browser-host.mjs';
import {checkBrowserAdapter} from './check.mjs';
import {judgeGeometry} from '../oracle/judge.mjs';
import {volume} from '../oracle/reference.mjs';
test('S02 recipe matches the full station schema and prescribed untwisted dimensions',async()=>{
 const card=JSON.parse(await readFile(new URL('../../../public/automation/tools/curveSweep.json',import.meta.url),'utf8'));
 const step=s02Recipe()[0];validateSchema(card.inputSchema,step.args.params);
 assert.equal(step.args.params.stations.length,17);
 for(const [i,s]of step.args.params.stations.entries()){
  const t=i/16;assert.deepEqual(s.centerMm,[0,0,40*t]);assert.deepEqual(s.normal,[0,0,1]);assert.deepEqual(s.widthDirection,[1,0,0]);
  assert.equal(s.widthMm,2*(10-4*t));assert.equal(s.depthMm,2*(4+2*t));
 }
 assert.equal(step.args.placement.frame.kind,'world');
});
test('page observation records actual volume but never fills measured axes from expected values',async()=>{
 const calls=[];
 const session={client:{getState:async()=>({bodies:[{id:'fixture'}]}),call:async(method,args)=>{calls.push(method);return method==='measure'?{status:'read',solidCount:1,volume:volume.S02}:{status:'read',results:args.requirements.map(r=>({id:r.id,verdict:'pass'}))};}}};
 const observed=await observeEllipseCase({caseId:'S02',session,context:async()=>({expectedRevision:1}),record:async()=>{}});
 assert(!('sections' in observed.geometry));assert.equal(judgeGeometry('S02',observed.geometry).status,'UNVERIFIED');
 assert.deepEqual(calls,['measure','inspectDesign']);
});
test('a non-solid result avoids unsupported material classification and remains a geometry failure',async()=>{
 const session={client:{getState:async()=>({bodies:[{id:'fixture'}]}),call:async method=>{assert.equal(method,'measure');return {status:'read',solidCount:0,volume:null};}}};
 const observed=await observeEllipseCase({caseId:'S02',session,context:async()=>({expectedRevision:1}),record:async()=>{}});
 assert.equal(judgeGeometry('S02',observed.geometry).status,'FAIL');
});
test('S02 cannot open a product page before the independent reference is validated',async()=>{
 let pages=0;
 const adapter=createBrowserBenchmarkAdapter({openPage:async()=>{pages++;throw Error('Must not open');},knowledge:{baseUrl:'http://localhost/webcad/',directory:'fixture'},referenceValidator:async()=>({status:'UNVERIFIED'}),record:async()=>{},persist:async()=>{}});
 const result=await checkBrowserAdapter(adapter,{mode:'s02-l1'});assert.equal(result.status,'BLOCKED');assert.equal(pages,0);
});
test('area-preserving middle distortion fails even with matching ends and analytic volume',()=>{
 const sections=[0,.25,.5,.75,1].map(t=>{const a=10-4*t,b=4+2*t,changed=a+1.5*Math.sin(Math.PI*t);return {t,z:40*t,a:changed,b:a*b/changed};});
 const judgment=judgeGeometry('S02',{volume:volume.S02,sections});assert.equal(judgment.status,'FAIL');
 assert(judgment.checks.some(row=>row.id==='section:0.5:a'&&row.status==='FAIL'));
});
