import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {summarizeSectionChains,orderRayHits,RELATION_MODES} from '../src/modeling/inspection/relation-measure.js';
import {loftEnvelopeWarning,stationEnvelope} from '../src/section-curve-loft.js';
import {normalizeExtrudeHoles,holeTopologyOk} from '../src/extrude-holes.js';
import {operationCatalog} from '../src/operation-catalog.js';
import {readFileSync} from 'node:fs';

test('R8-001 pure helpers: section summary in plane axes and ordered ray hits',()=>{
  assert.ok(RELATION_MODES.includes('planeSample')&&RELATION_MODES.includes('rayHits'));
  const square={closed:true,lengthMm:40,points:[[0,0,5],[10,0,5],[10,10,5],[0,10,5]]};
  const r=summarizeSectionChains([square],'XY');
  assert.equal(r.loopCount,1);assert.equal(r.areaMm2,100);assert.deepEqual(r.extentsMm,[10,10]);assert.deepEqual(r.planeAxes,['X','Y']);assert.equal(r.loops[0].points,undefined);
  assert.ok(summarizeSectionChains([square],'XY',{includePoints:true}).loops[0].points);
  const hits=orderRayHits([[5,0,0],[1,0,0],[1,0,0],[-3,0,0]],[0,0,0],[2,0,0]);
  assert.deepEqual(hits.map(h=>h.distanceMm),[1,5]);
});

test('R7-011 envelope warning only fires beyond tolerance; default degree stays 8',()=>{
  const st={centerMm:[0,0,0],normal:[0,0,1],widthDirection:[1,0,0]};
  const env=stationEnvelope([st],[[[-5,-5],[5,-5],[5,5],[-5,5]]]);
  assert.deepEqual(env.min,[-5,-5,0]);
  assert.equal(loftEnvelopeWarning(env,[[-5.1,-5,0],[5,5,0]],8),null);
  const w=loftEnvelopeWarning(env,[[-8,-5,0],[5,5,0]],8);
  assert.equal(w.code,'LOFT_ENVELOPE_EXCEEDED');assert.equal(w.maxOvershootMm,3);assert.match(w.suggestion,/loftDegree:2/);
  const schema=JSON.stringify(readFileSync(new URL('../src/advanced-operation-catalog.js',import.meta.url),'utf8'));
  assert.match(schema,/loftDegree:\{type:'integer',minimum:2,maximum:8,default:8/);
  assert.match(readFileSync(new URL('../src/body-state.js',import.meta.url),'utf8'),/envelopeWarning/);
});

test('R7-015 extrude holes schema and normalization',()=>{
  const props=operationCatalog.operations.extrude.paramsSchema.properties;
  assert.equal(props.holes.type,'array');
  assert.deepEqual(normalizeExtrudeHoles([{radius:2}])[0],{radius:2,profile:'circle',center:[0,0]});
  assert.equal(normalizeExtrudeHoles(undefined).length,0);
  assert.throws(()=>normalizeExtrudeHoles([{profile:'arc'}]),e=>e.code==='EXTRUDE_HOLE_INVALID');
  assert.throws(()=>normalizeExtrudeHoles([{profile:'polygon',center:[1,1],points:[[0,0],[1,0],[0,1]]}]),e=>e.code==='EXTRUDE_HOLE_INVALID');
  assert.equal(holeTopologyOk(null,0),true);
});

test('kernel: extrude holes, planeSample and rayHits on exact B-Rep',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  try{
    await kernel.rebuild({version:2,features:[
      {id:'plate',op:'extrude',params:{profile:'rectangle',width:40,depth:20,height:5,holes:[{radius:3,center:[-10,0]},{profile:'rectangle',width:4,depth:4,center:[10,0]}]},refs:[]},
      {id:'b',op:'box',params:{width:10,depth:10,height:10},refs:[]}
    ]});
    const plate=kernel.bodies?.find?.(b=>b.id==='plate')??null;
    const vol=kernel.measureRelation({mode:'planeSample',first:{bodyId:'plate',kind:'body'},plane:'XY',offset:2.5,samples:128});
    assert.equal(vol.intersects,true);assert.equal(vol.loopCount,3);
    const expected=40*20-Math.PI*9-16,outer=vol.loops.reduce((m,l)=>Math.max(m,l.areaMm2),0),innerSum=vol.loops.reduce((n,l)=>n+l.areaMm2,0)-outer;
    assert.ok(Math.abs(outer-innerSum-expected)<1,`${outer} ${innerSum}`);
    assert.ok(Math.abs(vol.extentsMm[0]-40)<1e-6&&Math.abs(vol.extentsMm[1]-20)<1e-6);
    const miss=kernel.measureRelation({mode:'planeSample',first:{bodyId:'plate',kind:'body'},plane:'XY',offset:50});
    assert.equal(miss.intersects,false);assert.equal(miss.loopCount,0);
    const ray=kernel.measureRelation({mode:'rayHits',first:{bodyId:'b',kind:'body'},pointWorld:[-20,0,5],direction:[1,0,0]});
    assert.equal(ray.hitCount,2);assert.ok(Math.abs(ray.hits[1].distanceMm-ray.firstHit.distanceMm-10)<1e-6,JSON.stringify(ray.hits));
    await assert.rejects(()=>kernel.rebuild({version:2,features:[{id:'bad',op:'extrude',params:{profile:'rectangle',width:10,depth:10,height:2,holes:[{radius:4,center:[4,0]}]},refs:[]}]}),e=>/EXTRUDE_HOLE_INVALID|孔轮廓/.test(`${e.code} ${e.message}`));
  }finally{kernel.dispose();}
});
