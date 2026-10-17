import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {getOperation,normalizeOperationParams} from '../src/operation-registry.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';

test('registered guided segments retain source, bind actual jets and reopen saved checkpoints',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),a=new CadKernel(oc),b=new CadKernel(oc);
 const card=getOperation('guidedLoft'),params=structuredClone(card.minimalExample.params),placement={version:1,resolverVersion:1,frameSnapshot:{origin:[0,0,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'},sourceFrameRef:{kind:'world'},sourcePoint:[0,0,0]};
 try{
  normalizeOperationParams('guidedLoft',params);
  const first={id:'first',op:'guidedLoft',params,refs:[],placement},doc={version:2,imports:{},features:[first]};
  const original=await a.rebuild(doc),volume=original.bodies[0].volume;
  const next=structuredClone(params);next.sections=next.sections.map(section=>({...section,frame:{...section.frame,centerMm:section.frame.centerMm.map((v,i)=>v+(i===2?10:0))},profile:{...section.profile,widthMm:section.profile.widthMm-1,depthMm:section.profile.depthMm-.5}}));next.guides=next.guides.map(guide=>({...guide,pointsMm:guide.pointsMm.map(point=>[point[0],point[1]===0?0:point[1]-Math.sign(point[1])*.25,point[2]+10])}));next.startCondition='G2';next.matchTo={featureId:'first',end:'end'};
  normalizeOperationParams('guidedLoft',next);doc.features.push({id:'second',op:'guidedLoft',params:next,refs:['first'],placement});
  const joined=await a.rebuild(doc);assert.deepEqual(joined.bodies.map(body=>body.id),['first','second']);assert.equal(joined.bodies[0].volume,volume);assert.equal(joined.bodies[1].guidedLoftReport.startJet.source,'matchTo:first');assert(joined.bodies.every(body=>body.solidCount===1));
  const saved=a.bakeProject(doc,{thresholdMs:0}),loaded=await decodeProject(encodeProjectV4(saved.document)),restored=await b.rebuild(loaded);
  assert.deepEqual(restored.compiledReuse,['first','second']);assert.equal(restored.bodies[1].guidedLoftReport.startJet.source,'matchTo:first');assert(Math.abs(restored.bodies[1].volume-joined.bodies[1].volume)<1e-8);
 }finally{a.dispose();b.dispose();}
});
