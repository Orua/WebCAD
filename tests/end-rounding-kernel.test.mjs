import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildEndRounding} from '../src/modeling/rounding/end-rounding.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const results=[];
const dispose=x=>{try{x?.delete?.();}catch{}};
function endEdge(shape,axis=1,direction=1){const edges=shape.edges;try{const rows=edges.map((e,id)=>{const p=e.pointAt(.5);try{return{id,p:p.toTuple()};}finally{p.delete();}});return rows.sort((a,b)=>direction*(b.p[axis]-a.p[axis]))[0].id;}finally{edges.forEach(dispose);}}
function check(name,source,params){const saved=source.serialize(),id=endEdge(source,'XYZ'.indexOf(params.axis),params.direction??1),t=performance.now(),out=buildEndRounding(source,{...params,edgeIds:[id]});try{
 const r=out.endRoundingReport;assert.equal(source.serialize(),saved);assert(r.maxJoinAngleDeg<.1);assert(r.maxHeadAngleDeg<.1);assert.equal(r.status,'rounded');assert(r.removedVolumeMm3>0);assert(r.lengthChangeMm<=1e-5);assert(r.targetDisplacementsMm[0]>1e-5);
 results.push({name,params,elapsedMs:performance.now()-t,...r});
 return r;
}finally{out.delete();source.delete();}}
test('roundEnd rounds a cylinder with real material/normal checks',()=>{
 check('cylinder',cad.makeCylinder(2,12),{axis:'Z',profileAxis:'Y',depthMm:2.1});
});
test('roundEnd rounds a flat rod with circular corners',()=>{
 check('rounded rectangle rod',cad.drawRoundedRectangle(4,2,.4).sketchOnPlane('XZ').extrude(-12),{axis:'Y',profileAxis:'Z',depthMm:2.1});
});
test('roundEnd rounds a capsule-section rod',()=>{
 check('capsule rod',cad.drawRoundedRectangle(6,2,1).sketchOnPlane('XZ').extrude(-12),{axis:'Y',profileAxis:'Z',depthMm:3.1});
});
test('axis rotation, negative direction, translation and scaling retain physical results',()=>{
 const base=check('translated X cylinder',cad.makeCylinder(2,12).rotate(90,[0,0,0],[0,1,0]).translate([7,3,-2]),{axis:'X',profileAxis:'Z',depthMm:2.1});
 const scaled=check('scaled negative Z cylinder',cad.makeCylinder(4,24).rotate(180,[0,0,0],[1,0,0]).translate([2,3,7]),{axis:'Z',direction:-1,profileAxis:'X',depthMm:4.2});
 assert(Math.abs(scaled.removedVolumeMm3/base.removedVolumeMm3-8)<1e-5);
});
test('unsupported sharp profile, insufficient depth and wrong end reject without changing input',()=>{
 for(const [shape,params]of [[cad.makeBox([-2,0,-1],[2,12,1]),{axis:'Y',profileAxis:'Z',depthMm:2.1}], [cad.makeCylinder(2,12),{axis:'Z',profileAxis:'Y',depthMm:1}], [cad.makeCylinder(2,12),{axis:'Z',profileAxis:'Y',direction:-1,depthMm:2.1}]]){
  const saved=shape.serialize(),id=endEdge(shape,params.axis==='Y'?1:2,1);
  assert.throws(()=>buildEndRounding(shape,{...params,edgeIds:[id]}));assert.equal(shape.serialize(),saved);shape.delete();
 }
});
test('ellipse remains explicitly unsupported after the bounded pole investigation',()=>{
 const shape=cad.drawEllipse(2,1).sketchOnPlane('XZ').extrude(-12),saved=shape.serialize();
 assert.throws(()=>buildEndRounding(shape,{axis:'Y',profileAxis:'Z',depthMm:2.1,edgeIds:[endEdge(shape)]}),e=>e.code==='END_ROUNDING_UNSUPPORTED');
 assert.equal(shape.serialize(),saved);shape.delete();
});
test('write concise standalone-model verification evidence',()=>{fs.mkdirSync('agent/output/end-rounding-20261002',{recursive:true});fs.writeFileSync('agent/output/end-rounding-20261002/custom-model-tests.json',JSON.stringify(results,null,2));assert.equal(results.length,5);});
