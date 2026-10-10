import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {geometryFeatureSignature} from '../src/services/geometry-signature.js';
import {geometryRecipeFingerprint} from '../src/services/geometry-exchange.js';
import {planReliefLayers} from '../src/modeling/manufacturing/relief-layer-plan.js';

test('real geometry and measurements are reused for rename/appearance/remesh; dimensional edits still rebuild',async()=>{
 const oc=await init({wasmBinary:await fs.readFile(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),engine=new CadKernel(oc),doc={version:2,documentId:'cache-test',imports:{},features:[{id:'body',name:'original',op:'box',params:{width:10,depth:8,height:3},refs:[]}]};let builds=0,measurements=0;const operation=engine.operation.bind(engine),measure=engine.measureBodyGeometry.bind(engine);engine.operation=(...args)=>{builds++;return operation(...args);};engine.measureBodyGeometry=(...args)=>{measurements++;return measure(...args);};
 try{
  const first=await engine.rebuild(doc);assert.equal(builds,1);assert.equal(measurements,1);
  const renamed={...doc,colors:{body:'#ff0000'},features:[{...doc.features[0],name:'renamed'}]},next=await engine.rebuild(renamed);assert.equal(builds,1);assert.equal(measurements,1);assert.equal(next.bodies[0].name,'renamed');assert.strictEqual(next.bodies[0].positions,first.bodies[0].positions);assert.equal(next.bodies[0].volume,240);
  const mesh=engine.remesh('fine');assert.equal(builds,1);assert.equal(measurements,1);assert.equal(mesh.bodies[0].volume,240);assert.equal(mesh.bodies[0].area,268);
  const changed={...renamed,features:[{...renamed.features[0],params:{...renamed.features[0].params,width:11}}]},last=await engine.rebuild(changed);assert.equal(builds,2);assert.equal(measurements,2);assert.equal(last.bodies[0].volume,264);
 }finally{engine.dispose();}
});
test('logical layer names and job receipts do not change physical identities; unknown fields remain conservative',()=>{
 const f={id:'relief',op:'relief',refs:['source'],params:{layers:[{name:'old',heightMm:.5,regions:[]}]},compiledCheckpoint:{artifactSha256:'a',jobId:'old-job',inputFingerprint:'old-input',codec:'occt-text-brep-v1'}},renamed={...f,params:{...f.params,layers:[{...f.params.layers[0],name:'new'}]},compiledCheckpoint:{...f.compiledCheckpoint,jobId:'new-job'}};
 assert.equal(geometryFeatureSignature(f),geometryFeatureSignature(renamed));const source={id:'source',op:'box',refs:[],params:{width:1,depth:1,height:1}},doc={features:[source,f],imports:{}};assert.equal(geometryRecipeFingerprint(doc,'relief'),geometryRecipeFingerprint({...doc,features:[source,renamed]},'relief'));
 assert.notEqual(geometryFeatureSignature(f),geometryFeatureSignature({...f,unknownFutureGeometryField:1}));assert.notEqual(geometryFeatureSignature(f),geometryFeatureSignature({...f,params:{layers:[{...f.params.layers[0],heightMm:.6}]}}));
});
test('real layered edits reuse the unchanged prefix and keep all logical history layers',async()=>{
 const oc=await init({wasmBinary:await fs.readFile(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),engine=new CadKernel(oc),base={id:'source',op:'box',params:{width:10,depth:10,height:3},refs:[]};
 try{
  await engine.rebuild({version:2,features:[base],imports:{}});const faces=engine.shapes.get('source').faces;let faceId;try{faceId=faces.findIndex(f=>{const center=f.center;try{return Math.abs(center.z-3)<1e-7;}finally{center.delete();}});}finally{faces.forEach(f=>f.delete());}
  const rectangle=s=>[{outer:[[-s,-s],[s,-s],[s,s],[-s,s]]}],params={faceId,widthMm:6,heightMm:6,depthMm:.8,curveToleranceMm:.005,curvePolicy:'preserveTopology',maskStrategy:'faceWithHolesExtrude',layers:[{name:'support',heightMm:.3,regions:rectangle(.4)},{name:'detail',heightMm:.8,startHeightMm:.29,regions:rectangle(.25)}]},doc={version:2,features:[base,{id:'relief',op:'relief',params,refs:['source']}],imports:{}};
  const first=await engine.rebuild(doc);assert(first.bodies[0].reliefReport.groupReports.every(g=>!g.cacheHit));
  const edited={...doc,features:[base,{...doc.features[1],params:{...params,layers:[params.layers[0],{...params.layers[1],heightMm:.9}]}}]},after=await engine.rebuild(edited);assert.deepEqual(after.bodies[0].reliefReport.groupReports.map(g=>g.cacheHit),[true,false]);assert.equal(edited.features[1].params.layers.length,2);assert(after.bodies[0].volume>first.bodies[0].volume);
 }finally{engine.dispose();}
});
test('compatible supports compile together; distinct height, starts and sculpt remain separate',()=>{
 const region=[{outer:[[-.1,-.1],[.1,-.1],[.1,.1],[-.1,.1]]}],supports=Array.from({length:9},(_,i)=>({name:`support ${i}`,heightMm:.5,regions:region})),layers=[...supports,{heightMm:1,startHeightMm:.49,regions:region},{heightMm:1,startHeightMm:.49,regions:region,sculpt:{deltaMm:[[.1]]}}],before=JSON.stringify(layers),plan=planReliefLayers(layers,'groupCompatible');
 assert.equal(plan.logicalLayerCount,11);assert.equal(plan.compiledGroupCount,3);assert.deepEqual(plan.groups[0].memberLayerIds,Array.from({length:9},(_,i)=>`layer-${i}`));assert.equal(JSON.stringify(layers),before);assert.equal(planReliefLayers(layers).compiledGroupCount,11);
});
