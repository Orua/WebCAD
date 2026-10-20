import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {solveReliefDesign,reliefDesignCandidate} from '../src/relief-design-field.js';
import {makeHeightfieldRelief,heightfieldSamples} from '../src/mesh/heightfield-relief.js';
import {createPageAPI} from '../src/page-api.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {validatePayload} from '../src/agent/protocol.js';
import {closedMeshVolume} from '../src/mesh/mesh-volume.js';
import {analyzeDesignMask} from '../src/relief-design-core/closed-mesh.mjs';
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
 assert.deepEqual(candidate.args.placement.frame.origin,[2,3,0]);assert.ok(candidate.args.params.domainMask.data);
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
test('mask candidate keeps all-zero and nonzero baselines while unresolved holes and corner-contact topology refuse without geometry',()=>{
 const d={...draft(),heightRangeMm:[0,0],points:[]},solved=solveReliefDesign(d),zero=reliefDesignCandidate(solved,d);
 assert.equal(zero.status,'candidate');assert.equal(zero.quantizationBoundMm,0);assert.ok(Buffer.from(zero.args.params.heights.data,'base64').every(v=>v===0));
 const raised={...d,heightRangeMm:[.35,.35]},raisedResult=solveReliefDesign(raised),positive=reliefDesignCandidate(raisedResult,raised);
 assert.equal(positive.status,'candidate');assert.equal(positive.args.params.baseMm,1.35);assert.equal(positive.domainReport.protectionBaselineMm,.35);
 assert.throws(()=>analyzeDesignMask({columns:3,rows:3,widthMm:2,depthMm:2},Uint8Array.from([1,1,0,1,1,1,0,1,1])),{code:'RELIEF_DESIGN_DOMAIN_NONMANIFOLD'});
 const hole={...d,throughHoles:[{kind:'circle',centerMm:[2,3],radiusMm:.1}]},holeResult=solveReliefDesign(hole);
 const rejected=reliefDesignCandidate(holeResult,hole);assert.equal(rejected.status,'blocked');assert.ok(rejected.blockers.includes('RELIEF_DESIGN_FEATURE_UNRESOLVED'));
});
test('one circular masked geometry keeps a real through-hole, nonzero protected baseline and flat back without nonmanifold edges',()=>{
 const d={...draft(),support:{kind:'circle',centerMm:[2,3],radiusMm:10},throughHoles:[{kind:'circle',centerMm:[5,3],radiusMm:2}],protectedZones:[{kind:'circle',centerMm:[-2,3],radiusMm:1}],heightRangeMm:[.35,3],points:[{id:'authored',pointMm:[1,6],heightMm:2}],fieldSettings:{columns:33,rows:33,toleranceMm:.0001}};
 const solved=solveReliefDesign(d),candidate=reliefDesignCandidate(solved,d,1);assert.equal(candidate.status,'candidate',JSON.stringify(candidate));
 assert.equal(candidate.domainReport.holeCount,1);assert.equal(candidate.domainReport.outerBoundaryCount,1);assert.equal(candidate.domainReport.protectionBaselineMm,.35);assert.equal(candidate.domainReport.analyticCircularBoundary,false);
 assert.ok(candidate.domainReport.footprintAreaMm2>0&&candidate.domainReport.footprintAreaMm2<Math.PI*100);assert.ok(candidate.domainReport.boundaryApproximationBoundMm>=Math.hypot(...candidate.domainReport.spacingMm));assert.match(candidate.domainReport.maskSource.maskSha256,/^sha256:/);
 const p=candidate.args.params,mesh=makeHeightfieldRelief(p),closed=closedMeshVolume(mesh);assert.equal(closed.closed,true);assert.equal(closed.inverted,false);assert.ok(closed.volume>0);
 const edges=new Map(),used=new Set();for(let k=0;k<mesh.indices.length;k+=3)for(const [a,b]of [[0,1],[1,2],[2,0]]){const u=mesh.indices[k+a],v=mesh.indices[k+b];used.add(u);used.add(v);const key=u<v?u+'/'+v:v+'/'+u;edges.set(key,(edges.get(key)||0)+1);}assert.ok([...edges.values()].every(n=>n===2));assert.equal(used.size-edges.size+mesh.indices.length/3,0,'one through-hole gives genus-one boundary, not a filled disk');
 const n=mesh.positions.length/6;for(let i=n;i<n*2;i++)assert.equal(mesh.positions[i*3+2],0,'entire back stays in z=0');
 let protectedVertices=0;
 for(let i=0;i<n;i++){const x=mesh.positions[i*3],y=mesh.positions[i*3+1],z=mesh.positions[i*3+2];if(Math.hypot(x+4,y)<=1){protectedVertices++;assert.equal(z,1.35,'protection preserves authored .35mm baseline above the 1mm back support');}}
 assert.ok(protectedVertices>0);
 const inTriangle=(x,y,a,b,c)=>{const cross=(p,q)=> (q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0]),s=[cross(a,b),cross(b,c),cross(c,a)];return s.every(v=>v>=-1e-10)||s.every(v=>v<=1e-10);};
 for(let k=0;k<mesh.indices.length;k+=3){const ids=Array.from(mesh.indices.slice(k,k+3));if(!ids.every(i=>i<n)&&!ids.every(i=>i>=n))continue;const points=ids.map(i=>[mesh.positions[i*3],mesh.positions[i*3+1]]);assert.equal(inTriangle(3,0,...points),false,'vertical ray through original analytic hole has no top or bottom intersection');}
 console.log(JSON.stringify({case:'single-circular-masked-design',triangles:mesh.indices.length/3,vertices:used.size,volumeMm3:closed.volume,report:candidate.domainReport}));
});
