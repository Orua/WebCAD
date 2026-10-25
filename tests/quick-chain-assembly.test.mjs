import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildQuickModel,QUICK_MODELS,QUICK_MODEL_VISIBLE_KINDS} from '../src/quick-models.js';
import {chainLayout,normalizeChainSize} from '../src/quick-models/chain-size.js';
import {createModelLibrary} from '../src/model-library.js';
import {getOperation,validateOperationExample} from '../src/operation-registry.js';
import {createCommandService} from '../src/command-service.js';
import {createReferenceSystem,resolvePlacement} from '../src/work-frame.js';
import {CadKernel} from '../src/cad-kernel.js';
import {buildChainLink} from '../src/quick-models/chain-models.js';
import {checkpointReports,restoreCheckpointReports} from '../src/local-checkpoint-reports.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
for(const kind of ['oChain','twistedChain','groundChain']){
 const def=QUICK_MODELS[kind],params={kind,...def.defaults},layout=chainLayout(params,def),shape=buildQuickModel(params,cad),single=buildQuickModel({kind},cad);
 try{const solids=shape.solids;assert.equal(solids.length,4);
  try{for(let i=0;i<solids.length-1;i++){const gap=cad.measureDistanceBetween(solids[i],solids[i+1]);assert.ok(gap>0&&gap<=1.01e-5,`${kind} adjacent gap ${gap}`);}assert.ok(cad.measureDistanceBetween(solids[0],solids[2])>0);}finally{solids.forEach(s=>s.delete());}
  console.log(kind,JSON.stringify(shape.chainReport));assert.equal(shape.chainReport.layoutVersion,'taut-contact-2');assert.ok(shape.chainReport.pitchMm>layout.pitchMm);const cold=cad.deserializeShape(shape.serialize());try{restoreCheckpointReports(cold,checkpointReports(shape));assert.deepEqual(cold.chainReport,shape.chainReport);}finally{cold.delete();}const assembledLink=buildChainLink(params,cad,{twistFactor:layout.twistFactor});try{near(cad.measureVolume(shape),4*cad.measureVolume(assembledLink),.0001);}finally{assembledLink.delete();}assert.equal(shape.chainReport.linkCount,4);assert.ok(layout.validation.clearanceLowerBoundMm>0);near(Math.abs(layout.validation.linkingNumber),1,.001);assert.equal(single.chainReport.linkCount,1);
  assert.deepEqual(layout.rollPatternDeg,kind==='oChain'?[0,90]:[0]);if(kind!=='oChain'){assert.equal(layout.rollStepDeg,0);assert.equal(layout.twistFactor,1.6);const bb=shape.boundingBox;try{const mesh=shape.mesh({tolerance:.05,angularTolerance:.15}),zs=mesh.vertices.filter((_,i)=>i%3===2);if(kind==='groundChain')near(Math.max(...zs)-Math.min(...zs),4.4,.0001);assert.ok(bb.bounds[1][0]-bb.bounds[0][0]<11.01);}finally{bb.delete();}}
  for(const budget of [def.defaults.outerLengthMm,layout.lengthMm+.01,layout.lengthMm+layout.pitchMm-.01]){const r=chainLayout({kind,sizeMode:'length',maxLengthMm:budget},def);assert.ok(r.lengthMm<=budget);assert.ok(r.lengthMm+r.pitchMm>budget);}
  const budget=kind==='oChain'?27:41,limited=buildQuickModel({kind,sizeMode:'length',maxLengthMm:budget},cad);
  try{const r=limited.chainReport;assert.equal(r.linkCount,3);assert.ok(r.lengthMm<=budget);assert.ok(r.lengthMm+r.pitchMm>budget);near(r.pitchMm,shape.chainReport.pitchMm);}finally{limited.delete();}
  assert.throws(()=>chainLayout({kind,sizeMode:'length',maxLengthMm:1},def));assert.throws(()=>chainLayout({kind,sizeMode:'length',maxLengthMm:10000},def));
  assert.throws(()=>normalizeChainSize({kind,linkCount:4,maxLengthMm:50}));assert.throws(()=>normalizeChainSize({kind,linkCount:2.5}));
  validateOperationExample('quickModel',params);assert.throws(()=>validateOperationExample('quickModel',{...params,sizeMode:'length',maxLengthMm:50}));
 }finally{shape.delete();single.delete();}
}
const lib=createModelLibrary(()=>({getItem:()=>null}));assert.equal(lib.read().entries.length,47);assert.ok(QUICK_MODEL_VISIBLE_KINDS.includes('ironFoot'));assert.equal(lib.resolve({id:'oChain',expectedLibraryRevision:0,params:{sizeMode:'length',maxLengthMm:50}}).params.linkCount,0);
const s={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:0,kernelReady:true,busy:false,features:[{id:'old',op:'quickModel',params:{kind:'oChain'},refs:[]}],bodies:[{id:'old'}],referenceSystem:createReferenceSystem()},commands=[];
const service=createCommandService({allowAdvisory:true,snapshot:()=>structuredClone(s),execute:async(command,args)=>{commands.push({command,args});s.revision++;}}),contract=getOperation('quickModel');
async function execute(action,args){const result=await service.execute({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:s.revision},idempotencyKey:crypto.randomUUID(),action,args:{opVersion:contract.version,schemaHash:contract.schemaHash,...args}});assert.equal(result.status,'committed',JSON.stringify(result));}
await execute('feature.add',{op:'quickModel',refs:[],params:{kind:'oChain'}});assert.equal(commands.at(-1).args.params.linkCount,4);
await execute('feature.edit',{featureId:'old',params:{outerLengthMm:10}});assert.equal(commands.at(-1).args.params.linkCount,1);
const kernel=new CadKernel(oc);try{const feature={id:'assembly',op:'quickModel',params:{kind:'oChain',sizeMode:'length',maxLengthMm:40},refs:[],placement:resolvePlacement({version:1,frame:{kind:'snapshot',origin:[5,7,9],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'}},createReferenceSystem(),'quickModel')},doc={version:1,features:[feature],imports:{},hidden:[]};const first=await kernel.rebuild(structuredClone(doc));assert.equal(first.bodies.length,1);assert.equal(first.bodies[0].chainReport.linkCount,6);const reopened=await kernel.rebuild(JSON.parse(JSON.stringify(doc)));near(first.stats.volume,reopened.stats.volume);assert.deepEqual(first.bodies[0].chainReport,reopened.bodies[0].chainReport);}finally{kernel.dispose();}
console.log('PASS interconnected assemblies, exclusive sizing, maximum count, fixed catalog, creation/legacy edits and persisted reports');


