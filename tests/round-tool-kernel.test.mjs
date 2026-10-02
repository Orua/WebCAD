import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildRoundTool} from '../src/modeling/rounding/round-tool.js';
import {CadKernel} from '../src/cad-kernel.js';
cad.setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const results=[];
function check(name,shape,params,expected){const before=shape.serialize();let out;try{out=buildRoundTool(shape,params);assert.equal(out.roundReport.mode,expected);assert.equal(shape.serialize(),before);assert.equal(out.roundReport.attemptCount,1);const solids=out.solids;assert.equal(solids.length,1);solids.forEach(s=>s.delete());results.push({name,...out.roundReport});return out.roundReport;}finally{out?.delete();shape.delete();}}
function endEdge(s,i,d=1){const edges=s.edges;try{return edges.map((e,id)=>{const p=e.pointAt(.5);try{return{id,v:p.toTuple()[i]};}finally{p.delete();}}).sort((a,b)=>d*(b.v-a.v))[0].id;}finally{edges.forEach(e=>e.delete());}}
test('automatic edge radius and exact override on a cube',()=>{const r=check('cube',cad.makeBox([0,0,0],[10,10,10]),{edgeIds:[0]},'edge');assert.equal(r.radiusMm,.5);assert.equal(check('exact radius',cad.makeBox([0,0,0],[10,10,10]),{edgeIds:[0],radiusMm:.3},'edge').radiusMm,.3);});
test('automatic end orientation and depth on original-independent rod families',()=>{for(const [name,shape,i,d]of [['cylinder',cad.makeCylinder(2,12),2,1],['flat rod',cad.drawRoundedRectangle(4,2,.4).sketchOnPlane('XZ').extrude(-12),1,1],['negative X',cad.makeCylinder(2,12).rotate(-90,[0,0,0],[0,1,0]).translate([7,3,-2]),0,-1]]){const r=check(name,shape,{edgeIds:[endEdge(shape,i,d)]},'end');assert.equal(r.resolved.axis,'XYZ'[i]);assert.equal(r.resolved.direction,d);}});
test('failed exact radius, invalid depth mode and stale direction preserve source',()=>{for(const params of [{edgeIds:[0],mode:'edge',radiusMm:20},{edgeIds:[0],mode:'edge',depthMm:2},{edgeIds:[0],mode:'end',directionEdgeId:999}]){const s=cad.makeBox([0,0,0],[10,10,10]),before=s.serialize();try{assert.throws(()=>buildRoundTool(s,params));assert.equal(s.serialize(),before);}finally{s.delete();}}});
test('write automatic route evidence',()=>{fs.mkdirSync('agent/output/unified-rounding-20261002',{recursive:true});fs.writeFileSync('agent/output/unified-rounding-20261002/kernel-results.json',JSON.stringify(results,null,2));});
test('shared document rebuild, parameter edit, undo shape and saved replay retain reports',async()=>{
 const k=new CadKernel(cad.getOC());let reopened;
 try{
  const source={id:'source',op:'box',params:{width:10,depth:10,height:10},refs:[]};
  const original={version:1,features:[source],imports:{}};
  const doc={...original,features:[source,{id:'rounded',op:'round',params:{edgeIds:[0],mode:'auto',strength:.5},refs:['source']}]};
  const first=await k.rebuild(doc);assert.equal(first.bodies[0].roundReport.mode,'edge');const v=first.bodies[0].volume;
  doc.features[1].params.radiusMm=.3;const edit=await k.rebuild(doc);assert.equal(edit.bodies[0].roundReport.radiusMm,.3);assert(edit.bodies[0].volume>v);
  const undo=await k.rebuild(original);assert(Math.abs(undo.bodies[0].volume-1000)<1e-7);
  reopened=new CadKernel(cad.getOC());const saved=await reopened.rebuild(JSON.parse(JSON.stringify(doc)));assert.equal(saved.bodies[0].roundReport.radiusMm,.3);assert(Math.abs(saved.bodies[0].volume-edit.bodies[0].volume)<1e-7);
 }finally{k.dispose();reopened?.dispose();}
});
