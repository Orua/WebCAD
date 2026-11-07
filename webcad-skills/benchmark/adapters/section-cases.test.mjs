// MOCK_ONLY schema/observation checks; no native CAD/browser/model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
import {s03Recipe,observeSectionCase} from './section-cases.mjs';
import {createBrowserBenchmarkAdapter} from './browser-host.mjs';
import {checkBrowserAdapter} from './check.mjs';
import {judgeGeometry} from '../oracle/judge.mjs';
import {volume} from '../oracle/reference.mjs';
test('S03 explicit world-XY circular stations satisfy the complete registered schema',async()=>{
 const card=JSON.parse(await readFile(new URL('../../../public/automation/tools/curveSweep.json',import.meta.url),'utf8'));
 const step=s03Recipe()[0];validateSchema(card.inputSchema,step.args.params);
 assert.equal(step.args.params.pathType,'sections');assert.equal(step.args.params.stations.length,33);
 for(const [i,s]of step.args.params.stations.entries()){
  const t=i/32;assert.deepEqual(s.normal,[0,0,1]);assert.deepEqual(s.widthDirection,[1,0,0]);
  assert.equal(s.centerMm[0],6*Math.sin(Math.PI*t));assert.equal(s.centerMm[2],40*t);assert.equal(s.widthMm,2*(5-2*t));assert.equal(s.depthMm,s.widthMm);
 }
 assert.equal(step.args.placement.frame.kind,'world');
});
test('page observation cannot manufacture measured cross-sections from expected parameters',async()=>{
 let requirements;
 const session={client:{getState:async()=>({bodies:[{id:'fixture'}]}),call:async(method,args)=>{
  if(method==='measure')return {status:'read',solidCount:1,volume:volume.S03};
  requirements=args.requirements;return {status:'read',results:[]};
 }}};
 const observed=await observeSectionCase({caseId:'S03',session,context:async()=>({expectedRevision:1}),record:async()=>{}});
 assert(!('sections' in observed.geometry));assert.equal(observed.geometry.reader.independent,false);assert.equal(judgeGeometry('S03',observed.geometry).status,'UNVERIFIED');
 assert.equal(requirements[0].points.length,3);assert.equal(requirements[1].points.length,6);
});
test('S03 reference must pass before a product page can be opened',async()=>{
 let pages=0;
 const adapter=createBrowserBenchmarkAdapter({openPage:async()=>{pages++;throw Error('Must not open');},knowledge:{baseUrl:'http://localhost/webcad/',directory:'fixture-storage'},referenceValidator:async()=>({status:'UNVERIFIED'}),record:async()=>{},persist:async()=>{}});
 const result=await checkBrowserAdapter(adapter,{mode:'s03-l1'});assert.equal(result.status,'BLOCKED');assert.equal(pages,0);
});
test('same-volume straight-center counterexample fails intermediate stations',()=>{
 const sections=[0,.25,.5,.75,1].map(t=>({t,x:0,y:0,z:40*t,radius:5-2*t}));
 const result=judgeGeometry('S03',{volume:volume.S03,sections});assert.equal(result.status,'FAIL');
 assert(result.checks.some(check=>check.id==='section:0.5:x'&&check.status==='FAIL'));
});
