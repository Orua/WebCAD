// MOCK_ONLY contract/observation tests; no OCP, Chrome or model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
import {s06Recipe,observeSurfaceCase} from './surface-cases.mjs';
import {judgeGeometry} from '../oracle/judge.mjs';
import {createBrowserBenchmarkAdapter} from './browser-host.mjs';
import {checkBrowserAdapter} from './check.mjs';
function sessionFixture({solids=0,faces=1,bodies=1}={}){
 const calls=[];
 return {calls,session:{client:{getState:async()=>({bodies:Array.from({length:bodies},()=>({id:'fixture-face'}))}),call:async(method,args)=>{
  calls.push({method,args});
  if(method==='measure')return {status:'read',solidCount:solids,volume:solids?10:null,area:100};
  if(method==='queryGeometry')return {status:'read',matchCount:faces,items:Array.from({length:faces},(_,faceId)=>({faceId}))};
  throw Error('Solid-only operation must not run for S06');
 }}}};
}
const context=async()=>({documentInstanceId:'fixture',expectedRevision:1});
test('S06 complete schema accepts a bounded world grid and unchanged 0.01 fitting precision',async()=>{
 const card=JSON.parse(await readFile(new URL('../../../public/automation/tools/fittedSurface.json',import.meta.url),'utf8'));
 const step=s06Recipe()[0];validateSchema(card.inputSchema,step.args.params);
 assert.equal(step.args.params.points.length,12);assert(step.args.params.points.every(row=>row.length===12));
 assert.equal(step.args.params.tolerance,.01);assert.equal(step.args.placement.frame.kind,'world');
 for(const [j,row]of step.args.params.points.entries())for(const [i,point]of row.entries()){
  const u=i/11,t=j/11,w=2*u-1;
  assert.deepEqual(point,[w*(10+2*Math.sin(Math.PI*t)),40*t,5*Math.sin(Math.PI*t)+2*w*w]);
 }
});
test('one BRep face with zero solids and null volume is an open-surface target',async()=>{
 const fixture=sessionFixture();
 const result=await observeSurfaceCase({caseId:'S06',session:fixture.session,context,record:async()=>{}});
 assert.equal(result.geometry.targetType,'surface');assert.equal(result.geometry.solidCount,0);assert.equal(result.geometry.volume,null);
 assert.equal(judgeGeometry('S06',result.geometry).status,'UNVERIFIED');
 assert.deepEqual(fixture.calls.map(call=>call.method),['measure','queryGeometry']);
 assert(!('surfaceSamples' in result.geometry),'expected grid points must not be passed off as measured STEP points');
});
test('a solid or wire cannot be accepted as the zero-solid S06 surface',async()=>{
 for(const options of [{solids:1},{solids:0,faces:0}]){
  const result=await observeSurfaceCase({caseId:'S06',session:sessionFixture(options).session,context,record:async()=>{}});
  assert.equal(judgeGeometry('S06',result.geometry).status,'FAIL');
 }
});
test('zero solids is distinct from having no resulting document object',async()=>{
 await assert.rejects(observeSurfaceCase({caseId:'S06',session:sessionFixture({bodies:0}).session,context,record:async()=>{}}),/BASIC_SINGLE_BODY_REQUIRED/);
});
test('S06 requires independent reference evidence before opening a product page',async()=>{
 let pages=0;
 const adapter=createBrowserBenchmarkAdapter({openPage:async()=>{pages++;throw Error('Must not open');},knowledge:{baseUrl:'http://localhost/webcad/',directory:'fixture'},referenceValidator:async()=>({status:'UNVERIFIED'}),record:async()=>{},persist:async()=>{}});
 const result=await checkBrowserAdapter(adapter,{mode:'s06-l1'});assert.equal(result.status,'BLOCKED');assert.equal(pages,0);
});
