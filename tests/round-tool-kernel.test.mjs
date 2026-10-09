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
test('GC15664 repaired LL planar scope rounds the entire 219-edge real outline at R0.2',()=>{
 const R=270.166666666666,regions=JSON.parse(fs.readFileSync(new URL('./fixtures/rounding/gc15664-ll-clean.json',import.meta.url),'utf8'));
 let points=regions[0].outer.map(([x,y])=>[R*Math.sin(x*48/R),y*54,0]);
 const area=points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-p[1]*q[0];},0);if(area<0)points.reverse();
 const face=cad.makePolygon(points),v=new cad.Vector([0,0,3]),source=cad.basicFaceExtrusion(face,v),faces=source.faces;
 let topId,out;
 try{
  topId=faces.findIndex(f=>{const c=f.center;try{return Math.abs(c.toTuple()[2]-3)<1e-5;}finally{c.delete();}});
  const before=source.serialize();out=buildRoundTool(source,{faceIds:[topId],radiusMm:.2});
  assert.equal(source.serialize(),before);assert.equal(out.roundReport.radiusMm,.2);assert.equal(out.roundReport.attemptCount,1);
  assert.equal(out.blendReport.processedEdgeIds.length,219);assert.equal(out.roundReport.scope.edgeIds.length,219);
  const oc=cad.getOC(),check=new oc.BRepCheck_Analyzer(out.wrapped,true,false,false);try{assert(check.IsValid());}finally{check.delete();}
  const solids=out.solids;try{assert.equal(solids.length,1);}finally{solids.forEach(s=>s.delete());}
  const caps=out.faces;let cylinders=0;try{for(const f of caps)if(f.geomType==='CYLINDRE'){const a=new oc.BRepAdaptor_Surface(f.wrapped,false),c=a.Cylinder();try{assert(Math.abs(c.Radius()-.2)<1e-7);cylinders++;}finally{c.delete();a.delete();}}}finally{caps.forEach(f=>f.delete());}
  assert(cylinders>150);assert(cad.measureVolume(out)<cad.measureVolume(source));
 }finally{out?.delete();faces.forEach(f=>f.delete());source.delete();face.delete();v.delete();}
});
test('planar face rounding preserves a real hole and rejects end mode without changing source',()=>{
 const outside=cad.makeCylinder(4,3),inside=cad.makeCylinder(1,4),source=outside.cut(inside),faces=source.faces;let out;
 try{
  const top=faces.findIndex(f=>f.geomType==='PLANE'&&(()=>{const p=f.center;try{return p.toTuple()[2]>2.99;}finally{p.delete();}})());
  const before=source.serialize();assert.throws(()=>buildRoundTool(source,{faceIds:[top],mode:'end'}));assert.equal(source.serialize(),before);
  out=buildRoundTool(source,{faceIds:[top],radiusMm:.2});const after=out.faces;try{assert(after.some(f=>{const wires=f.wires;try{return f.geomType==='PLANE'&&wires.length===2;}finally{wires.forEach(w=>w.delete());}}));}finally{after.forEach(f=>f.delete());}
  assert.equal(out.roundReport.radiusMm,.2);assert.equal(source.serialize(),before);
 }finally{out?.delete();faces.forEach(f=>f.delete());source.delete();inside.delete();outside.delete();}
});
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
