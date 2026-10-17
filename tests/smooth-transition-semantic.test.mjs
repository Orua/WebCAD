import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {topologyDetails,buildSmoothTransition} from '../src/smooth-transition.js';
import {resolveBlendSelector} from '../src/semantic-blend-selector.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=value=>{try{value?.delete();}catch{}};

test('seamBetween resolves transient generated-face provenance and reports resolved edges',()=>{
  const source=cad.makeBox([0,0,0],[20,10,6]),row=topologyDetails(source).find(item=>item.sharp===true),origins=Array(source.faces.length).fill(null);
  origins[row.adjacentFaceIds[0]]={featureId:'feature-a',role:'side'};origins[row.adjacentFaceIds[1]]={featureId:'feature-b',role:'cap'};
  try{
    const resolved=resolveBlendSelector(source,{selector:{seamBetween:{a:'feature-a',b:'feature-b'}}},{sourceShape:source,provenance:{faceOrigins:origins,sourceRevision:'fixture-r1'}});
    assert(resolved.targets.some(edge=>edge.edgeId===row.edgeId));
    assert.equal(resolved.selectorReport.kind,'seamBetween');
    assert(resolved.selectorReport.resolvedEdgeIds.includes(row.edgeId));
    assert.throws(()=>resolveBlendSelector(source,{selector:{seamBetween:{a:'feature-a',b:'missing'}}},{sourceShape:source,provenance:{faceOrigins:origins}}),e=>e.code==='SELECTOR_EMPTY');
  }finally{dispose(source);}
});

test('semantic seam and legacy faceIds produce equivalent real OCCT corner blends',()=>{
  const source=cad.makeBox([0,0,0],[20,10,6]),row=topologyDetails(source).find(item=>item.sharp===true),origins=Array(source.faces.length).fill(null);let legacy,semantic;
  origins[row.adjacentFaceIds[0]]={featureId:'base-feature',role:'side'};origins[row.adjacentFaceIds[1]]={featureId:'tool-feature',role:'side'};
  try{
    legacy=buildSmoothTransition(source,{faceIds:row.adjacentFaceIds,radius:.2});
    semantic=buildSmoothTransition(source,{selector:{seamBetween:{a:'base-feature',b:'tool-feature'}},context:{sourceShape:source,provenance:{faceOrigins:origins,sourceRevision:'fixture-r1'}},radius:.2});
    assert(semantic.transitionReport.processedEdgeIds.includes(row.edgeId));
    assert.equal(semantic.solids.length,1);assert(Math.abs(cad.measureVolume(legacy)-cad.measureVolume(semantic))<1e-7);
    assert.notEqual(cad.measureVolume(semantic),cad.measureVolume(source));
    console.log('OCCT selector comparison',JSON.stringify({legacyVolumeMm3:cad.measureVolume(legacy),semanticVolumeMm3:cad.measureVolume(semantic),sourceVolumeMm3:cad.measureVolume(source),processedEdgeIds:semantic.transitionReport.processedEdgeIds}));
  }finally{dispose(legacy);dispose(semantic);dispose(source);}
});

test('edgesNear selects the pointed sharp BRep edge and smoothTransition keeps old faceIds support',()=>{
  const box=cad.makeBox([0,0,0],[20,10,6]),row=topologyDetails(box).find(item=>item.sharp===true);let result;
  try{
    const resolved=resolveBlendSelector(box,{selector:{edgesNear:{pointMm:row.midpoint,radiusMm:.1,sharpOnly:true}}});
    assert.deepEqual(resolved.targets.map(item=>item.edgeId),[row.edgeId]);
    result=buildSmoothTransition(box,{selector:{edgesNear:{pointMm:row.midpoint,radiusMm:.1,sharpOnly:true}},radius:.2});
    assert.equal(result.solids.length,1);assert.equal(result.transitionReport.selectorReport,undefined);
    assert.equal(result.transitionReport.kind,'edgesNear');
  }finally{dispose(result);dispose(box);}
});

test('semantic source selectors require parent context and reject stale face maps',()=>{
  const box=cad.makeBox([0,0,0],[20,10,6]),other=cad.makeBox([0,0,0],[20,10,6]);
  try{
    assert.throws(()=>resolveBlendSelector(box,{selector:{seamBetween:{a:'a',b:'b'}}}),e=>e.code==='SELECTOR_CONTEXT_REQUIRED');
    assert.throws(()=>resolveBlendSelector(box,{selector:{seamBetween:{a:'a',b:'b'}}},{sourceShape:box,provenance:{faceOrigins:[]}}),e=>e.code==='SELECTOR_CONTEXT_STALE');
    assert.throws(()=>resolveBlendSelector(box,{selector:{seamBetween:{a:'a',b:'b'}}},{sourceShape:other,provenance:{faceOrigins:Array(box.faces.length).fill('a')}}),e=>e.code==='SELECTOR_CONTEXT_STALE');
  }finally{dispose(other);dispose(box);}
});
