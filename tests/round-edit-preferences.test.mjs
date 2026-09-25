import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildSmoothTransition} from '../src/smooth-transition.js';
import {CadKernel} from '../src/cad-kernel.js';
import {getOperation,normalizeOperationParams} from '../src/operation-registry.js';
import {DISPLAY_DEFAULTS,validateDisplayPreferences,loadDisplayPreferences,saveDisplayPreferences} from '../src/display-preferences.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
test('whole-body contract and cylinder seam handling',()=>{
  assert.equal(getOperation('autoRound').v2Executable,true);
  assert.deepEqual(normalizeOperationParams('autoRound',{radius:.1}),{radius:.1});
  assert.throws(()=>normalizeOperationParams('autoRound',{radius:.1,faceIds:[0,1]}));
  const s=cad.makeCylinder(5,2);let r;try{r=buildSmoothTransition(s,{radius:.1,allEdges:true});assert.equal(r.transitionReport.processedSeams,2);assert.equal(r.transitionReport.remainingSharpEdgeCount,0);}finally{r?.delete();s.delete();}
});
test('two and three face blends report termination edges on unselected faces',()=>{
  const s=cad.makeBox([0,0,0],[36,10,2]);try{for(const [faceIds,n]of [[[0,2],1],[[0,2,4],3]]){const r=buildSmoothTransition(s,{radius:.1,faceIds});try{assert.equal(r.transitionReport.processedSeams,n);assert.equal(r.transitionReport.boundarySharpEdges.length,n===1?2:3);}finally{r.delete();}}}finally{s.delete();}
});
test('repeated radius edits rebuild same source, and failed edit retains geometry',async()=>{
  const kernel=new CadKernel(oc),source={id:'base',op:'box',params:{width:36,depth:10,height:2},refs:[]};
  const build=radius=>kernel.rebuild({version:1,features:[source,{id:'round',op:'autoRound',refs:['base'],params:{radius}}],imports:{}});
  try{const a=await build(.1),b=await build(.3),c=await build(.1);assert(b.bodies[0].volume<a.bodies[0].volume);assert(Math.abs(c.bodies[0].volume-a.bodies[0].volume)<1e-8);const before=await kernel.queryGeometry('round','edge',{});await assert.rejects(build(5));assert.equal((await kernel.queryGeometry('round','edge',{})).geometryFingerprint,before.geometryFingerprint);}finally{kernel.dispose();}
});
test('display preferences reject bad input, survive cookie read, and tolerate corruption',()=>{
  globalThis.location={protocol:'http:'};let cookie='';globalThis.document={get cookie(){return cookie},set cookie(v){cookie=v.split(';')[0];}};
  try{const p={...DISPLAY_DEFAULTS,lightAzimuth:30,defaultColor:'#123456'};assert.equal(saveDisplayPreferences(p),true);assert.deepEqual(loadDisplayPreferences(),p);for(const patch of [{keyIntensity:-1},{environmentRotation:NaN},{defaultColor:'red'},{foo:1}])assert.throws(()=>validateDisplayPreferences(patch));cookie='webcad.display.v1=bad-json';assert.deepEqual(loadDisplayPreferences(),DISPLAY_DEFAULTS);}finally{delete globalThis.document;delete globalThis.location;}
});
