import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {solveReliefDesign,reliefDesignCandidate} from '../src/relief-design-field.js';
import {makeHeightfieldRelief,heightfieldSamples} from '../src/mesh/heightfield-relief.js';
import {createPageAPI} from '../src/page-api.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {validatePayload} from '../src/agent/protocol.js';
import {assertOperationContract} from '../src/operation-registry.js';
const draft=()=>({schemaVersion:1,name:'毫米设计',support:{kind:'rect',centerMm:[2,3],widthMm:20,heightMm:20},throughHoles:[],protectedZones:[],heightRangeMm:[0,3],points:[{id:'p',pointMm:[2,3],heightMm:2}],fieldSettings:{columns:17,rows:17,toleranceMm:.0001}});
class BrowserWorker{
 constructor(url){const code=`import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:x=>parentPort.postMessage(x)};await import(${JSON.stringify(url.href)});parentPort.on('message',data=>self.onmessage({data}));`;this.w=new NodeWorker(new URL('data:text/javascript,'+encodeURIComponent(code)));this.w.on('message',data=>this.onmessage?.({data}));this.w.on('error',e=>this.onerror?.(e));}
 postMessage(x){this.w.postMessage(x);}terminate(){this.w.terminate();}
}
test('product Pro adapter returns actual residuals and supported closed mesh samples with correct Y convention',()=>{
 const d=draft();d.points.push({id:'off',pointMm:[4,6],heightMm:1});const result=solveReliefDesign(d),candidate=reliefDesignCandidate(result,d,1);
 assert.equal(result.report.solver.status,'converged');assert.equal(result.report.solver.observationResiduals.length,2);assert.ok(result.report.solver.maxObservationResidualMm>0);
 assert.equal(candidate.status,'candidate');const p=candidate.args.params,h=heightfieldSamples(p),f=result.field;
 for(let j=0;j<f.rows;j++)for(let i=0;i<f.columns;i++)assert.ok(Math.abs(h[j*f.columns+i]-f.heightsMm[(f.rows-1-j)*f.columns+i])<=candidate.quantizationBoundMm+1e-6);
 const mesh=makeHeightfieldRelief(p);assert.ok(mesh.positions.length>0);assert.ok(mesh.indices.length>0);assert.deepEqual(candidate.args.placement.frame.origin,[2,3,0]);
 const edges=new Map();for(let k=0;k<mesh.indices.length;k+=3)for(const [a,b]of [[0,1],[1,2],[2,0]]){const pair=[mesh.indices[k+a],mesh.indices[k+b]].sort((a,b)=>a-b).join('/');edges.set(pair,(edges.get(pair)||0)+1);}assert.ok([...edges.values()].every(n=>n===2),'every undirected edge belongs to two triangles');
});
test('circular holes and protection remain in numerical masks and explicitly block unsupported geometry',()=>{
 const d=draft();d.support={kind:'circle',centerMm:[2,3],radiusMm:10};d.throughHoles=[{kind:'circle',centerMm:[7,3],radiusMm:.3}];d.protectedZones=[{kind:'circle',centerMm:[-3,3],radiusMm:.3}];
 const result=solveReliefDesign(d);assert.ok(result.report.domain.excludedByHoleNodeCount>0);assert.ok(result.report.domain.conservativelyProtectedNodeCount>0);assert.equal(result.report.solver.maxFixedChangeMm,0);assert.equal(result.report.solver.maxInactiveChangeMm,0);assert.equal(reliefDesignCandidate(result,d).status,'blocked');
 const edited=solveReliefDesign(d,{edits:[{mode:'raise',centerMm:[2,3],radiusMm:2,amountMm:.1}]});assert.equal(edited.report.edits.length,1);assert.equal(edited.report.solverResidualAppliesTo,'field-before-local-edits');
});
test('real numerical Worker runs through public page API, rejects stale edits, cancels and reopens persisted recipe',async()=>{
 const previous=globalThis.Worker;globalThis.Worker=BrowserWorker;
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1};const entry={id:'design',revision:1,draft:draft()};
 const api=createPageAPI({state:()=>({context:{...context},summary:{kernelReady:true,busy:false},preview:{active:false},bodies:[],reliefDesigns:[entry]}),display:()=>({}),confirmSaved:()=>({saved:false}),files:async()=>{throw Error('No file access');}});
 const args=()=>({context:{...context,expectedRevision:context.revision},designId:'design',expectedDraftRevision:entry.revision});
 try{
  const result=await api.reliefDesignField({...args(),action:'solve'});assert.equal(result.status,'solved',JSON.stringify(result));
  const candidate=await api.reliefDesignField({...args(),action:'candidate'});assert.equal(candidate.status,'candidate');
  assert.doesNotThrow(()=>assertOperationContract(candidate.args.op,candidate.args),'candidate must be directly executable through the strict public feature.add contract');
  const saved=await decodeProject(encodeProjectV4({version:4,documentId:'d',name:'design',features:[],imports:{},binaryAssets:{},compiledArtifacts:{},reliefDesigns:[entry]}));assert.deepEqual(saved.reliefDesigns[0].draft.fieldSettings,entry.draft.fieldSettings);
  const pending=api.reliefDesignField({...args(),action:'solve'});entry.revision++;context.revision++;assert.equal((await pending).error.code,'RELIEF_DESIGN_STALE');
  const cancelled=api.reliefDesignField({...args(),action:'solve'});assert.equal((await api.reliefDesignField({...args(),action:'cancel'})).status,'cancelled');assert.equal((await cancelled).error.code,'FIELD_CANCELLED');
  assert.equal((await api.reliefDesignField({...args(),action:'get'})).status,'empty');
 }finally{globalThis.Worker=previous;}
});
test('Agent scope protects solver tasks while numerical field reads and candidates remain read-only',()=>{
 const binding={sessionId:'s',documentId:'d',documentInstanceId:'i'},req=action=>({method:'reliefDesignField',args:{context:{...binding,expectedRevision:1},action}});
 assert.doesNotThrow(()=>validatePayload(req('get'),binding,['cad.read']));assert.doesNotThrow(()=>validatePayload(req('candidate'),binding,['cad.read']));assert.throws(()=>validatePayload(req('solve'),binding,['cad.read']),{code:'scope_denied'});
});
