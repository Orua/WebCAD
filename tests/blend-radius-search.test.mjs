import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {topologyDetails} from '../src/smooth-transition.js';
import {probeBlendRadius} from '../src/blend-radius-search.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=value=>{try{value?.delete();}catch{}};
const firstSharp=shape=>topologyDetails(shape).find(row=>row.sharp===true);

test('a 0.45 mm geometric limit is found within 0.05 mm and at most six trials',()=>{
  const source=cad.makeBox([0,0,0],[20,10,.9]);
  try{const result=probeBlendRadius(source,{selector:{allEdges:true},maxMm:.6,minMm:.3,stepRatio:.9});assert.equal(result.status,'feasible');assert(Math.abs(result.feasibleMaxMm-.45)<=.05);assert(result.tried.length<=6);assert(result.elapsedMs<=3000);console.log(JSON.stringify({case:'known-0.45-limit',...result}));}finally{source.delete();}
});

test('bounded probe descends from failed baseline to feasible OCCT radius without mutating source',()=>{
  const source=cad.makeBox([0,0,0],[20,10,6]),target=firstSharp(source),selector={edgeIds:[target.edgeId]},volume=cad.measureVolume(source);
  try{
    const probe=probeBlendRadius(source,{selector,maxMm:10,minMm:.25,stepRatio:.5,maxAttempts:6});
    assert.equal(probe.readOnly,true);assert.equal(probe.status,'feasible');
    assert(probe.feasibleMaxMm<=10&&probe.feasibleMaxMm>=.25);assert(probe.tried.length>1&&probe.tried.length<=6);
    assert.equal(probe.tried[0].ok,false);assert.equal(probe.tried.at(-1).ok,true);
    assert.equal(cad.measureVolume(source),volume);
    console.log('OCCT radius probe measurements',JSON.stringify({tried:probe.tried,feasibleMaxMm:probe.feasibleMaxMm,elapsedMs:probe.elapsedMs,sourceVolumeBeforeMm3:volume,sourceVolumeAfterMm3:cad.measureVolume(source)}));
  }finally{dispose(source);}
});

test('all infeasible bounded samples return tried evidence and no radius claim',()=>{
  const source=cad.makeBox([0,0,0],[20,10,6]),target=firstSharp(source);
  try{
    const probe=probeBlendRadius(source,{selector:{edgeIds:[target.edgeId]},maxMm:100,minMm:100,maxAttempts:1});
    assert.equal(probe.status,'infeasible');assert.equal(probe.feasibleMaxMm,null);
    assert.equal(probe.tried.length,1);assert.equal(probe.tried[0].ok,false);
  }finally{dispose(source);}
});
