import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import initOpenCascade from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {rebuildWithPool} from '../src/rebuild-dispatch.js';
import {compileFeaturePlan} from '../src/feature-plan.js';
import {getOperation} from '../src/operation-registry.js';
import {TOPOLOGY_SEMANTICS,hasTopologySemantics,markTopologySemantics,unionStrategy,isLegacyTopologyProject} from '../src/legacy-topology-policy.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {geometryFeatureSignature} from '../src/services/geometry-signature.js';
import {geometryRecipeFingerprint,localCheckpointFingerprint,compiledCheckpointBytes,LOCAL_REBUILD_SEMANTICS,LOCAL_KERNEL_BUILD_ID,GEOMETRY_CODEC} from '../src/services/geometry-exchange.js';

const oc=await initOpenCascade({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const f=(id,op,params={},refs=[])=>({id,op,params,refs});
// Three overlapping boxes plus a sliding transform per tool; more than eight
// features and several roots so the dispatcher would pick the pool when allowed.
const legacyDocument=()=>({version:2,imports:{},features:[
  f('a0','box',{width:10,depth:10,height:10}),f('a','transform',{x:0},['a0']),
  f('b0','box',{width:10,depth:10,height:10}),f('b','transform',{x:6},['b0']),
  f('c0','box',{width:10,depth:10,height:10}),f('c','transform',{x:12},['c0']),
  f('d0','box',{width:10,depth:10,height:10}),f('d','transform',{x:18},['d0']),
  f('joined','union',{},['a','b','c','d'])]});
const markedDocument=()=>{const doc=legacyDocument();doc.features=doc.features.map(markTopologySemantics);return doc;};

test('policy: features without the marker use the legacy ordered fuse; marked or parameterised unions use multi-fuse',()=>{
  assert.equal(unionStrategy(f('u','union',{},['a','b'])),'ordered-pairwise');
  assert.equal(unionStrategy({...f('u','union',{},['a','b'])}),'ordered-pairwise');
  assert.equal(unionStrategy(markTopologySemantics(f('u','union',{},['a','b']))),'multi-fuse');
  assert.equal(unionStrategy(f('u','union',{glue:'shift'},['a','b'])),'multi-fuse');
  assert.equal(unionStrategy({...f('u','union',{},['a','b']),topologySemantics:'some-other-build'}),'ordered-pairwise','only the known marker opts in');
  // keepTools existed before the multi-argument fuse: a legacy union may carry it.
  assert.equal(unionStrategy(f('u','union',{keepTools:true},['a','b'])),'ordered-pairwise');
  assert.equal(unionStrategy(f('u','union',{keepTools:false},['a','b'])),'ordered-pairwise');
  for(const params of [{fuzzyMm:0.01},{glue:'shift'},{blendRadiusMm:1},{blendMode:'auto'},{blendLaw:'circular'},{keepTools:true,fuzzyMm:0}])
    assert.equal(unionStrategy(f('u','union',params,['a','b'])),'multi-fuse',JSON.stringify(params));
  assert.equal(isLegacyTopologyProject(legacyDocument().features),true);
  assert.equal(isLegacyTopologyProject(markedDocument().features),false);
  const mixed=markedDocument();mixed.features[0]={...mixed.features[0]};delete mixed.features[0].topologySemantics;
  assert.equal(isLegacyTopologyProject(mixed.features),true,'one unmarked feature keeps the whole project serial');
});

test('new features compiled by this build carry the marker',async()=>{
  const box=getOperation('box');
  const plan=await compileFeaturePlan({features:[{key:'stock',op:'box',opVersion:box.version,schemaHash:box.schemaHash,params:{width:10,depth:8,height:4},refs:[]}]},{sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[],bodies:[],selectedIds:[],kernelReady:true,busy:false},{uid:()=>'first'});
  assert.equal(plan.features[0].topologySemantics,TOPOLOGY_SEMANTICS);assert.ok(hasTopologySemantics(plan.features[0]));
});

test('legacy unions rebuild with the ordered pairwise fuse; marked unions with multi-fuse; same material',async()=>{
  const legacy=new CadKernel(oc),marked=new CadKernel(oc);
  try{
    await legacy.rebuild(legacyDocument(),{headless:true});await marked.rebuild(markedDocument(),{headless:true});
    assert.equal(legacy.shapes.get('joined').booleanReport,undefined,'ordered path does not go through robustUnion');
    assert.equal(marked.shapes.get('joined').booleanReport?.strategy,'multi-fuse');
    assert.ok(Math.abs(legacy.measure('joined','body').volume-marked.measure('joined','body').volume)<1e-6);
  }finally{legacy.dispose();marked.dispose();}
});

test('the strategy is part of the reuse keys: no hot-history or checkpoint reuse across strategies',async()=>{
  const legacy=legacyDocument(),marked=markedDocument(),id='joined';
  assert.notEqual(geometryFeatureSignature(legacy.features.at(-1)),geometryFeatureSignature(marked.features.at(-1)));
  assert.notEqual(geometryRecipeFingerprint(legacy,id),geometryRecipeFingerprint(marked,id));
  assert.notEqual(localCheckpointFingerprint(legacy,id),localCheckpointFingerprint(marked,id));
  // A local checkpoint baked for the multi-fuse recipe is refused for the legacy one.
  const bytes=new TextEncoder().encode('x'),sha=binaryHash(bytes).slice(7);
  const checkpoint={kind:'local-rebuild',codec:GEOMETRY_CODEC,kernelBuildId:LOCAL_KERNEL_BUILD_ID,semanticVersion:LOCAL_REBUILD_SEMANTICS,artifactSha256:sha,recipeFingerprint:localCheckpointFingerprint(marked,id)};
  const withCheckpoint=(doc)=>({...doc,compiledArtifacts:{[sha]:bytes},features:doc.features.map(row=>row.id===id?{...row,compiledCheckpoint:checkpoint}:row)});
  const legacyDoc=withCheckpoint(legacy);
  assert.equal(compiledCheckpointBytes(legacyDoc,legacyDoc.features.at(-1)),null);
  // Checkpoints from the previous semantics generation are never reused.
  const stale=withCheckpoint(marked);stale.features.at(-1).compiledCheckpoint={...checkpoint,semanticVersion:'webcad-local-20261018-v2-ordered-topology'};
  assert.equal(compiledCheckpointBytes(stale,stale.features.at(-1)),null);
  // Hot history: the same kernel switching strategy rebuilds the union instead of reusing it.
  const kernel=new CadKernel(oc);
  try{
    await kernel.rebuild(legacy,{headless:true});const first=kernel.shapes.get(id);
    await kernel.rebuild(marked,{headless:true});
    assert.notEqual(kernel.shapes.get(id),first);assert.equal(kernel.shapes.get(id).booleanReport?.strategy,'multi-fuse');
    await kernel.rebuild(legacy,{headless:true});assert.equal(kernel.shapes.get(id).booleanReport,undefined);
  }finally{kernel.dispose();}
});

test('legacy projects never take the parallel reorder path, even when workers are requested',async()=>{
  const kernel=new CadKernel(oc);
  try{
    const result=await rebuildWithPool(kernel,legacyDocument(),{workers:2,headless:true});
    assert.equal(result.parallelRebuild,undefined);
    assert.ok(result.perFeatureMs.every(row=>!row.worker));
  }finally{kernel.dispose();}
  const control=new CadKernel(oc);
  try{
    const result=await rebuildWithPool(control,markedDocument(),{workers:2,headless:true});
    assert.equal(result.parallelRebuild?.workers,2,'a fully marked project may still use the pool');
  }finally{control.dispose();}
});

test('legacy ordered fuse keeps the exact replicad topology and adds face-origin labels',async()=>{
  const {orderedFuseWithFaceOrigins,initializeFaceOrigins}=await import('../src/modeling/face-origins.js');
  const cad=await import('replicad');cad.setOC(oc);
  const cases=[[cad.makeBox([0,0,0],[10,10,10]),cad.makeBox([6,2,2],[16,8,8])],[cad.makeCylinder(3,12,[0,0,-6]),cad.makeCylinder(2,12,[0,6,0],[0,-1,0])],[cad.makeSphere(5),cad.makeBox([3,-1,-1],[9,1,1])]];
  for(const [a,b] of cases){
    initializeFaceOrigins(a,{id:'a'});initializeFaceOrigins(b,{id:'b'});
    const reference=a.fuse(b),ours=orderedFuseWithFaceOrigins(a,b);
    try{
      assert.equal(ours.serialize(),reference.serialize(),'same OCCT result, face for face');
      assert.equal(ours.faceOrigins.length,ours.faces.length);
      const ids=new Set(ours.faceOrigins.flatMap(o=>o?o.featureIds||[o.featureId]:[]));assert.ok(ids.has('a')&&ids.has('b'));
    }finally{reference.delete();ours.delete();a.delete();b.delete();}
  }
});

test('a legacy union with keepTools (pre-multi-fuse parameter) still rebuilds with the ordered pairwise fuse',async()=>{
  const doc=legacyDocument();doc.features=doc.features.map(feature=>feature.id==='joined'?{...feature,params:{keepTools:true}}:feature);
  const kernel=new CadKernel(oc),reference=new CadKernel(oc);
  try{
    await kernel.rebuild(doc,{headless:true});await reference.rebuild(legacyDocument(),{headless:true});
    assert.equal(kernel.shapes.get('joined').booleanReport,undefined,'keepTools alone must not route to robustUnion');
    assert.equal(kernel.shapes.get('joined').serialize(),reference.shapes.get('joined').serialize(),'same ordered topology as the plain legacy union');
  }finally{kernel.dispose();reference.dispose();}
});
